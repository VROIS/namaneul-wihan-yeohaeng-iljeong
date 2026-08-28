/**
 * ⚠️ 수정금지(승인필요) 2026-05-15 = 사용자 SSOT 단일 INSERT/UPDATE 시스템
 *
 * 모든 place_seed_raw INSERT/UPDATE = 반드시 이 함수만 통과한다.
 * = AI/스크립트/파이프라인 누가 호출해도 = 7 단계 순차 매칭 강제 = 중복 차단.
 *
 * ⚠️ 수정금지(승인필요) 2026-06-08 = 사용자 SSOT = 7 단계 신뢰도 순 (= 매칭 알고리즘 = 헌법 제14조)
 *   [불변(확정=병합) 1~5]
 *   1순위 = google_place_id 일치 (= ~100%, Google 발급 유일 ID)
 *   2순위 = google_maps_uri 일치 (= cid = PID 동등 강력)
 *   3순위 = 풀 주소 정규화 100% + 로컬이름 판별 (= 같은 주소 2장소 = 로컬이름으로 구분)
 *   4순위 = 좌표 10m (= ~95%, 같은 건물)
 *   5순위 = 로컬이름(name_local) (= 원어명 = 불변 = 확정)
 *   [가변(의심=새저장+'중복의심' 메모) 6~7]
 *   6순위 = 영어명(name_en) / 7순위 = 한국어명(name_ko) (= 표현 가변 = 자동병합 X)
 *
 * UPDATE 정책 (= 사장님 SSOT 2026-07-05 §14갱신 = 모든 정보 무조건 새것 우선, 예외없음):
 *   - 전 컬럼 = 응답에 온 값이면 무조건 새값으로 덮음 = COALESCE(새값, 컬럼) 구조 = 새값 있으면 항상 이김.
 *   - COALESCE 를 남기는 유일한 이유 = 발굴 부분단계(예: storage-image-relink 는 imageUrl 만 넘김) 안전.
 *     = job 에 안 온 컬럼(undefined→`?? null`)만 뼈대(옛값) 보존 = 부분갱신이 다른 컬럼을 NULL 로 미는 파괴 방지.
 *     = 즉 "온 값=새것 강제 / 안 온 컬럼=뼈대 유지" (= 새우선과 발굴안전을 동시 충족).
 *   - tags = UNION (= 누적 = 멀티태그 SSOT).
 */
import { db } from "../db";
import { placeSeedRaw } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
// ⚠️ 2026-06-03 = 동일장소 5단계 매칭 = 공용 matcher.ts 단일 (= 헌법 §16, 흩어진 매처 통합)
import { type MatchedBy, properKeys } from "./shared/place-enrich";

export interface UpsertPayload {
  cityId: number;
  seedCategory: string; // 'restaurant' | 'attraction' | 'heritage' | ...
  // ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = rowId 직행 UPDATE(#45 repair.ts WHERE id=$1 방식).
  //   = 있으면 7단계 매칭 완전 스킵하고 그 행에 직행 UPDATE. 발굴 후 "방금 INSERT한 신규행을 TS검증값으로 되덮을 때" 재매칭 실패(name_local·좌표 결손 시 중복 INSERT) 원천차단.
  //   = 없으면(기본) 옛 동작 그대로 = 7단계 매칭 후 UPDATE/INSERT.
  targetRowId?: number | null;
  // ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = targetRowId 직행이 트리거 '[중복차단] id=N' 판정을 받으면 그 원행(N)으로 병합(회수)할지 opt-in.
  //   = 기본 false(미지정) = 예외 그대로 전파(image-backfill 의 "정확히 그 행에만 기록" 의미 보존). ag3 ③(TS 직행)만 true.
  followTriggerDup?: boolean;
  // 🗑️ 2026-07-07 개정헌법(사장님) = rank 필드 삭제 §19 = upsertPlace 는 랭킹을 받지도·넣지도 않음. 랭킹은 DB autorank 트리거(RC순)가 전담.
  // 식별 키 (= 5 단계 매칭)
  googlePlaceId?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nameEn?: string | null;
  // 다국어 이름
  nameKo?: string | null;
  nameLocal?: string | null;
  // 카피 (= Gemini 큐레이션)
  selectionReasonKo?: string | null; // → summary_ko
  shortformKo?: string | null; // → editorial_summary
  // 메타 (= TS / Wikipedia)
  googleReviewCount?: number | null;
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 영업상태(OPERATIONAL | CLOSED_PERMANENTLY | CLOSED_TEMPORARILY) → business_status. gmaps-pid-identity(--verify) 가 구글맵 페이지에서 읽어 채움 = 서빙 관문이 폐업행을 제외할 근거.
  businessStatus?: string | null;
  googlePrimaryType?: string | null;
  googleMapsUri?: string | null; // 2026-05-15 = 13번째 SSOT = 최후의 보루
  priceEur?: number | null;
  // 🗑️ 2026-07-05 = priceOverwrite 인자 제거 = 무의미(동작 영향 0) 데드 인자 = 가격도 새우선 단일정책 §14갱신/§19
  imageUrl?: string | null;
  imageAttribution?: string | null;
  dayZone?: string | null;
  distanceKmFromCenter?: number | null;
  // 분류
  categoryTags?: string[];
  phaseTags?: string[];
  // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 좌표 쓰기 보호 = true 면 기존 행 좌표(NULL·0 제외)를 유지하고 빈칸·0만 채움.
  //   = Gemini(미검증) 좌표 쓰기 전용 플래그(ag3 ①) = 환각좌표가 검증행을 오염 → 다음 판 좌표10m이 딴 장소 흡수(투르 78796 실증) 차단.
  //   = 매칭에는 payload 좌표 그대로 사용(좌표10m 재식별 보존) = 쓰기만 보호. TS 검증 쓰기(③ 등) = 플래그 없음 = 새것우선 그대로.
  preserveExistingCoords?: boolean;
}

// ⚠️ 2026-07-18 = MatchedBy = shared/place-enrich.ts 단일 정의 재노출 (= 옛 matcher.ts 삭제 §19, 기존 import 처 호환)
export type { MatchedBy };
// 🗑️ 2026-07-18 삭제 = loadMatchCandidates(전체 PSR SELECT) + syncCandidateList(candidates 동기화) = 매칭 폐기(트리거 단일) 로 후보명단 개념 소멸 §0/§19.

export interface UpsertResult {
  action: "inserted" | "updated" | "skipped";
  rowId: number | null;
  matchedBy: MatchedBy;
  // ⚠️ 2026-06-08 = 가변(영어·한국어명)만 일치 = 유사의심 = 자동병합 X = 새 행 + '중복의심' 메모 (= 사용자 SSOT)
  suspect?: boolean;
  reason?: string;
  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 3벌 폐기 재설계 = 트리거 흡수(recoverTriggerDup) 시 원행의 재활용 데이터(RETURNING).
  //   = 옛 ag3-match-core matchCandidate 가 하던 "매칭행 데이터를 place 에 입힘"을 흡수가 대체 = 매칭 판정 없이 재활용 보존. 흡수 아니면 undefined.
  enriched?: {
    imageUrl: string | null;
    googleReviewCount: number | null;
    nameKo: string | null;
    nameLocal: string | null;
    summaryKo: string | null;
    editorialSummary: string | null;
    googlePlaceId: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}

// ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = 직행 UPDATE SQL 1벌(§16) = targetRowId 직행·회수 병합 공용.
//   COALESCE 새우선(§14) + tags UNION + image_updated_at/updated_at. 컬럼셋 = 매칭 UPDATE 와 동일.
function buildDirectUpdateSql(p: UpsertPayload, targetId: number) {
  const catTags =
    p.categoryTags && p.categoryTags.length > 0
      ? p.categoryTags
      : [p.seedCategory];
  const phTags = p.phaseTags || [];
  return sql`
      UPDATE place_seed_raw SET
        name_en       = COALESCE(${p.nameEn ?? null}, name_en),
        name_ko       = COALESCE(${p.nameKo ?? null}, name_ko),
        name_local    = COALESCE(${p.nameLocal ?? null}, name_local),
        latitude      = ${p.preserveExistingCoords ? sql`COALESCE(NULLIF(latitude, 0), ${p.latitude ?? null}::real, latitude)` : sql`COALESCE(${p.latitude ?? null}::real, latitude)`},
        longitude     = ${p.preserveExistingCoords ? sql`COALESCE(NULLIF(longitude, 0), ${p.longitude ?? null}::real, longitude)` : sql`COALESCE(${p.longitude ?? null}::real, longitude)`},
        address       = COALESCE(${p.address ?? null}, address),
        google_place_id = COALESCE(${p.googlePlaceId ?? null}, google_place_id),
        google_review_count = COALESCE(${p.googleReviewCount ?? null}::integer, google_review_count),
        business_status = COALESCE(${p.businessStatus ?? null}, business_status),
        google_primary_type = COALESCE(${p.googlePrimaryType ?? null}, google_primary_type),
        google_maps_uri = COALESCE(${p.googleMapsUri ?? null}, google_maps_uri),
        image_url     = COALESCE(${p.imageUrl ?? null}, image_url),
        image_attribution = COALESCE(${p.imageAttribution ?? null}, image_attribution),
        price_eur     = COALESCE(${p.priceEur ?? null}::real, price_eur),
        editorial_summary = COALESCE(${p.shortformKo ?? null}, editorial_summary),
        summary_ko        = COALESCE(${p.selectionReasonKo ?? null}, summary_ko),
        day_zone          = COALESCE(${p.dayZone ?? null}, day_zone),
        distance_km_from_center = COALESCE(${p.distanceKmFromCenter ?? null}::real, distance_km_from_center),
        category_tags     = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(category_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${catTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}]::text[]`)}))),
        phase_tags        = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${phTags.length === 0 ? "" : phTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}]::text[]`)}))),
        image_updated_at  = CASE WHEN ${p.imageUrl || null}::text IS NOT NULL THEN NOW() ELSE image_updated_at END,
        updated_at        = NOW()
      WHERE id = ${targetId}
      -- ⚠️ 2026-07-18 = 흡수(트리거 dup)·직행 UPDATE 후 그 행의 재활용 데이터 반환 = 매칭 폐기 후 place 재활용(§16 매칭 대체).
      RETURNING image_url, google_review_count, name_ko, name_local, summary_ko, editorial_summary, google_place_id, latitude, longitude
    `;
}

// ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 트리거(prevent_dup=최종 매처)의 '[중복차단] id=N' 회수 1벌(§0/§16).
//   = 명단 스냅샷이 못 본 같은 장소를 트리거가 'id=N' 으로 알려주면 = 그 원행(N) 직행 UPDATE 로 전환(같은 장소 흡수).
//   = 승자 = 트리거가 지목한 N(재판정 없음 = 트리거가 이미 목적지 판단, 사장님 2026-07-17). 재시도는 followTriggerDup:false = 또 막히면 skip(무한루프 불가).
//   = 옛 "skipped 처리 = 그 슬롯 검증·사진 통째 소실" 폐기 2026-07-10 §19. 중복차단 예외 아니면 null(호출측 기존 처리 유지).
async function recoverTriggerDup(
  p: UpsertPayload,
  e: any,
): Promise<UpsertResult | null> {
  const dup = /\[중복차단\][^]*?id=(\d+)/.exec(e?.message || "");
  if (!dup) return null;
  const dupId = Number(dup[1]);
  try {
    // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 흡수 안전장치(창고문틀 교정) = 매칭 판정·흡수 동작은 그대로,
    //   흡수 대상 기존 이름과 새 job 이름이 겹치는 고유명사 키가 0개면 '경고 태그'만 남긴다(§12-3 카사로마/BlueBlood 사고 재발 감지용).
    //   = 주소 환각(Gemini)이 실재 다른 장소를 흡수시키는 사고를 막지는 못하지만, phase_tags 로 사후 조회·검수 가능하게 함.
    if (db) {
      try {
        const cur = (
          await db.execute(
            sql`SELECT name_en, name_local, name_ko, google_place_id, image_url, google_review_count, latitude, longitude, summary_ko, editorial_summary FROM place_seed_raw WHERE id = ${dupId}`,
          )
        ).rows?.[0] as any;
        if (cur) {
          // 이름불일치 감지(§12-3 카사로마/BlueBlood 재발 감지) = 스킵/쓰기 양 경로 공통으로 먼저 판정
          //   (조기 return 앞으로 이동 = 2026-08-18 비판검증 확정결함 수정 §19).
          const oldKeys = properKeys({
            nameEn: cur.name_en,
            nameLocal: cur.name_local,
            nameKo: cur.name_ko,
          });
          const newKeys = properKeys({
            nameEn: p.nameEn,
            nameLocal: p.nameLocal,
            nameKo: p.nameKo,
          });
          const overlap = [...newKeys].some((k) => oldKeys.has(k));
          if (oldKeys.size > 0 && newKeys.size > 0 && !overlap) {
            console.warn(
              `[UPSERT] ⚠️ 이름 불일치 흡수 = id=${dupId} 기존="${cur.name_en}" ← 새job="${p.nameEn}" (고유명사 키 안 겹침) = name-mismatch-absorbed 태그 부착`,
            );
            p = {
              ...p,
              phaseTags: [...(p.phaseTags || []), "name-mismatch-absorbed"],
            };
          }
          // ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인(비판검증 확정결함 수정 = 옛 2026-08-17 "PID만 있으면 무조건 스킵" 폐기 §19).
          //   = 스킵은 **형제 중복행이 실제로 존재해서 어떤 UPDATE 도 불변1(PID 유일)에 물리적으로 막히는 경우만**.
          //     (나이로비 Carnivore 실측: 같은 PID 를 가진 행이 2개면 그 행에 뭘 쓰든 문지기가 형제행을 걸고 차단 →
          //      복구 실패 → rowId 미확보 → FE v3- 빈슬롯. 이 경우만 쓰기 포기하고 링크+기존데이터 재활용이 정답.)
          //   = 형제가 없으면(성숙 도시의 일반 케이스) 정상 직행 UPDATE 진행 = §14 새것우선(요약·태그·구역값 등
          //     새 정보 기록 + name-mismatch 태그 영속화 + ag3 day_zone 수정도 그대로 작동) 복원.
          if (cur.google_place_id) {
            const sib = (
              await db.execute(
                sql`SELECT id FROM place_seed_raw WHERE google_place_id = ${cur.google_place_id} AND id <> ${dupId} LIMIT 1`,
              )
            ).rows?.[0] as any;
            if (sib) {
              console.log(
                `[UPSERT] ✅ PID 형제중복(id=${sib.id}) 존재 = id=${dupId} 쓰기 불가(불변1) = 링크만`,
              );
              return {
                action: "updated",
                rowId: dupId,
                matchedBy: "pid",
                reason: "trigger_dup_recovered_skip_write_pid_sibling",
                enriched: {
                  imageUrl: cur.image_url ?? null,
                  googleReviewCount: cur.google_review_count ?? null,
                  nameKo: cur.name_ko ?? null,
                  nameLocal: cur.name_local ?? null,
                  summaryKo: cur.summary_ko ?? null,
                  editorialSummary: cur.editorial_summary ?? null,
                  googlePlaceId: cur.google_place_id ?? null,
                  latitude: cur.latitude != null ? Number(cur.latitude) : null,
                  longitude:
                    cur.longitude != null ? Number(cur.longitude) : null,
                },
              };
            }
          }
        }
      } catch (checkErr) {
        // 확인 실패해도 흡수 자체는 막지 않는다(관측성 전용, 판정로직 무변경).
        console.warn(
          "[UPSERT] 이름불일치 확인 중 오류(흡수는 계속 진행):",
          (checkErr as Error)?.message,
        );
      }
    }
    const r = await upsertPlace({
      ...p,
      targetRowId: dupId,
      followTriggerDup: false,
    });
    return { ...r, reason: "trigger_dup_recovered" };
  } catch (e2: any) {
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: `trigger_dup_recover_failed: ${e2?.message || String(e2)}`,
    };
  }
}

// ⚠️ 2026-07-18 = 정규화 유틸(normAddr/normName/nameKeys)은 shared/place-enrich.ts (= 옛 matcher.ts 삭제 §19).

/**
 * 단일 entry-point. 코드 매칭 없음(트리거 단일 관문 §19) = INSERT 시도 → 트리거 중복차단 시 recoverTriggerDup 로 그 행 흡수, 아니면 신규.
 */
export async function upsertPlace(p: UpsertPayload): Promise<UpsertResult> {
  if (!db) {
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: "db_unavailable",
    };
  }
  if (!p.cityId || !p.seedCategory || !p.nameEn) {
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: "missing_required_fields",
    };
  }

  // ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = targetRowId 직행 UPDATE(#45 repair.ts WHERE id=$1 방식).
  //   = 발굴 후 "방금 INSERT한 신규행을 TS검증값으로 되덮을 때" = 7단계 매칭 스킵하고 그 행 직행 = 재매칭 실패(name_local·좌표 결손) 중복 INSERT 원천차단.
  //   = COALESCE 새우선 §14갱신 동일(아래 매칭 UPDATE 와 같은 컬럼셋). tags=UNION. image_updated_at=이미지 있을때만.
  if (p.targetRowId != null) {
    try {
      // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 우리 id 확정행 직행 = prevent_dup 만 외과적 면제하고 그 행에 TS 요소 바로 씀(중복검사 불필요 = 이미 우리 id).
      //   근거: ② TS 시점 = 우리 id 이미 확정("어디로 갈지 아는 상태") = 그 행 직행인데 트리거가 다른 쌍둥이 URI/PID 로 막아 유료결과 폐기(디종 4/10콜).
      //   = followTriggerDup=true(ag3 ③ TS 직행)만 SET LOCAL app.skip_dup_check='on' 로 prevent_dup 만 스킵(트리거 가드 1줄). 트랜잭션 한정 = 이 UPDATE 만 = 자동 복원.
      //   = replica 방식(모든 트리거 우회) 폐기 §19 = write_gate(데드락방지)·autorank(랭킹)는 살아있음. image-backfill 등 미지정 = 우회 안 함. buildDirectUpdateSql 1벌(§16). updated_at 무기록 §19.
      let res;
      if (p.followTriggerDup) {
        res = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('app.skip_dup_check', 'on', true)`,
          ); // true=트랜잭션 한정 = prevent_dup 만 스킵(자동 복원)
          return tx.execute(buildDirectUpdateSql(p, p.targetRowId!));
        });
      } else {
        res = await db.execute(buildDirectUpdateSql(p, p.targetRowId));
      }
      // 2026-07-17 = 삭제된 행을 향한 늦은 직행 = 0행인데 'updated' 로 나가던 거짓 성공 차단
      if ((res.rowCount ?? 0) === 0) {
        return {
          action: "skipped",
          rowId: null,
          matchedBy: "none",
          reason: "target_row_deleted",
        };
      }
      // 2026-07-18 = RETURNING 재활용 데이터(매칭 폐기 후 place 재활용, §16). undefined 안전 (RETURNING 없는 경로 대비).
      const row = (res as any).rows?.[0];
      return {
        action: "updated",
        rowId: p.targetRowId,
        matchedBy: "none",
        enriched: row
          ? {
              imageUrl: row.image_url ?? null,
              googleReviewCount: row.google_review_count ?? null,
              nameKo: row.name_ko ?? null,
              nameLocal: row.name_local ?? null,
              summaryKo: row.summary_ko ?? null,
              editorialSummary: row.editorial_summary ?? null,
              googlePlaceId: row.google_place_id ?? null,
              latitude: row.latitude != null ? Number(row.latitude) : null,
              longitude: row.longitude != null ? Number(row.longitude) : null,
            }
          : undefined,
      };
    } catch (e: any) {
      // 면제(followTriggerDup) 는 직행이 안 막히므로 여기 도달 시 = 다른 예외 = 그대로 전파(image-backfill "정확히 그 행에만 기록" 의미 보존).
      throw e;
    }
  }

  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 3벌 폐기 = 코드 매칭(loadMatchCandidates 전체SELECT + matchCandidate) 완전삭제 §19.
  //   = 근본: 매칭이 코드+트리거 2벌 = 기준 드리프트로 "합쳐질 중복이 신규 생성"되는 사고(사장님 실증). = INSERT만 시도, 매칭은 트리거 1벌(100km 단일판정).
  //   = 막히면 recoverTriggerDup(트리거가 준 id=N 흡수, RETURNING 재활용). matchedBy='none'/suspect 개념 폐기(트리거가 판정).
  const categoryTags =
    p.categoryTags && p.categoryTags.length > 0
      ? p.categoryTags
      : [p.seedCategory];
  const phaseTags = p.phaseTags || [];

  // INSERT = 신규 행 = 전체 응답값 그대로 새삽입. 트리거가 중복이면 recoverTriggerDup 흡수.
  // ⚠️ 개정헌법 2026-07-07 사장님 = rank 는 앱이 안 넣음(랭킹 코드 완전삭제 §19/§16). rank nullable + DB autorank 트리거(RC순) 단일 권위가 INSERT 후 배정.
  try {
    const inserted = await db
      .insert(placeSeedRaw)
      .values({
        cityId: p.cityId,
        seedCategory: p.seedCategory,
        // 🧠 2026-07-05 사장님 SSOT(§20) = 셀렉/꼼수(|| null) 제거 = 응답값 그대로 새삽입. ?? null = 응답에 없는 컬럼만 NULL(0·빈값은 온 값 그대로).
        nameEn: p.nameEn,
        nameKo: p.nameKo ?? null,
        nameLocal: p.nameLocal ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        address: p.address ?? null,
        googlePlaceId: p.googlePlaceId ?? null,
        googleMapsUri: p.googleMapsUri ?? null,
        googleReviewCount: p.googleReviewCount ?? null,
        businessStatus: p.businessStatus ?? null,
        googlePrimaryType: p.googlePrimaryType ?? null,
        imageUrl: p.imageUrl ?? null,
        imageAttribution: p.imageAttribution ?? null,
        priceEur: p.priceEur ?? null,
        editorialSummary: p.shortformKo ?? null,
        summaryKo: p.selectionReasonKo ?? null,
        dayZone: p.dayZone ?? null,
        distanceKmFromCenter: p.distanceKmFromCenter ?? null,
        categoryTags,
        phaseTags,
      } as any)
      .returning({ id: placeSeedRaw.id });

    const newId = inserted[0]?.id || null;
    return { action: "inserted", rowId: newId, matchedBy: "none" };
  } catch (e: any) {
    // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = DB 트리거(prevent_dup) = 최종 매처(§14 최종 안전망)를 따라감.
    //   = 명단 스냅샷이 못 본 같은 장소(동시 요청의 방금 INSERT 등)를 트리거가 '[중복차단] ... id=N' 예외로 알려주면
    //   = 그 원행 id 직행 UPDATE 로 전환(같은 장소 병합) = 옛 "skipped 처리 = 그 슬롯 검증·사진 통째 소실" 폐기 2026-07-10 §19.
    //   = 회수 로직 = recoverTriggerDup 1벌로 추출(3경로 공용) = 2026-07-17 §0/§16.
    const rec = await recoverTriggerDup(p, e);
    if (rec) return rec;
    // 최후 안전망 = INSERT 예외 시 skip(응답 안 죽임). rank 는 nullable+트리거 배정이라 rank 충돌 없음(2026-07-07 §19). = 실제 도달 드묾.
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: `insert_error: ${e?.message || String(e)}`,
    };
  }
}

// 🗑️ 2026-07-18 삭제 = upsertPlaces(복수 배치) = 호출처 0 죽은함수 §0/§19. 메인앱은 ag3-save 가 곳별 upsertPlace 직접 호출.
