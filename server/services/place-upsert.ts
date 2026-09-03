// ⚠️ 수정금지(승인필요) 2026-07-05 사용자 SSOT(헌법 제14조) = place_seed_raw INSERT/UPDATE 유일 진입점, 7단계 매칭(1~5순위 자동병합/6·7순위 의심메모), UPDATE는 새값 우선+tags UNION — 상세 경위는 정본문서
import { db } from "../db";
import { placeSeedRaw } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { type MatchedBy, properKeys } from "./shared/place-enrich";

export interface UpsertPayload {
  cityId: number;
  seedCategory: string; // 'restaurant' | 'attraction' | 'heritage' | ...
  // ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = rowId 직행 UPDATE(#45 repair.ts WHERE id=$1 방식).
  targetRowId?: number | null;
  // ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = targetRowId 직행이 트리거 '[중복차단] id=N' 판정을 받으면 그 원행(N)으로 병합(회수)할지 opt-in.
  followTriggerDup?: boolean;
  dupCheckOnWrite?: boolean;
  // 🗑️ 2026-07-07 개정헌법(사장님) = rank 필드 삭제 §19 = upsertPlace 는 랭킹을 받지도·넣지도 않음. 랭킹은 DB autorank 트리거(RC순)가 전담.
  googlePlaceId?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nameEn?: string | null;
  nameKo?: string | null;
  nameLocal?: string | null;
  selectionReasonKo?: string | null; // → summary_ko
  shortformKo?: string | null; // → editorial_summary
  googleReviewCount?: number | null;
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 영업상태(OPERATIONAL | CLOSED_PERMANENTLY | CLOSED_TEMPORARILY) → business_status. gmaps-pid-identity(--verify) 가 구글맵 페이지에서 읽어 채움 = 서빙 관문이 폐업행을 제외할 근거.
  businessStatus?: string | null;
  googlePrimaryType?: string | null;
  googleMapsUri?: string | null; // 2026-05-15 = 13번째 SSOT = 최후의 보루
  priceEur?: number | null;
  imageUrl?: string | null;
  imageAttribution?: string | null;
  dayZone?: string | null;
  distanceKmFromCenter?: number | null;
  categoryTags?: string[];
  phaseTags?: string[];
  // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 좌표 쓰기 보호 = true 면 기존 행 좌표(NULL·0 제외)를 유지하고 빈칸·0만 채움.
  preserveExistingCoords?: boolean;
}

export type { MatchedBy };

export interface UpsertResult {
  action: "inserted" | "updated" | "skipped";
  rowId: number | null;
  matchedBy: MatchedBy;
  suspect?: boolean;
  reason?: string;
  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 3벌 폐기 재설계 = 트리거 흡수(recoverTriggerDup) 시 원행의 재활용 데이터(RETURNING).
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
//   = 승자 = 트리거가 지목한 N(재판정 없음 = 트리거가 이미 목적지 판단, 사장님 2026-07-17). 재시도는 followTriggerDup:false = 또 막히면 skip(무한루프 불가).
async function recoverTriggerDup(
  p: UpsertPayload,
  e: any,
): Promise<UpsertResult | null> {
  const dup = /\[중복차단\][^]*?id=(\d+)/.exec(e?.message || "");
  if (!dup) return null;
  const dupId = Number(dup[1]);
  try {
    // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 흡수 안전장치(창고문틀 교정) = 매칭 판정·흡수 동작은 그대로,
    if (db) {
      try {
        const cur = (
          await db.execute(
            sql`SELECT name_en, name_local, name_ko, google_place_id, image_url, google_review_count, latitude, longitude, summary_ko, editorial_summary FROM place_seed_raw WHERE id = ${dupId}`,
          )
        ).rows?.[0] as any;
        if (cur) {
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

  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = PID 를 처음 받는 행(제미니 단계 신규·PID 결손행)에 TS PID 를 쓸 때는 문지기 면제 없이 불변1(PID 일치)을 돌리고, 막히면 그 원행으로 흡수 + 자기 행은 merged(삭제 0) · 이미 PID 있는 확정행 직행은 면제 그대로
  if (p.targetRowId != null) {
    try {
      let res;
      if (p.dupCheckOnWrite) {
        try {
          res = await db.execute(buildDirectUpdateSql(p, p.targetRowId));
        } catch (e: any) {
          const dup = /\[중복차단\][^]*?id=(\d+)/.exec(e?.message || "");
          const dupId = dup ? Number(dup[1]) : null;
          if (!dupId || dupId === p.targetRowId) throw e;
          const absorbed = await upsertPlace({
            ...p,
            targetRowId: dupId,
            followTriggerDup: true,
            dupCheckOnWrite: false,
          });
          await db.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT set_config('app.skip_dup_check', 'on', true)`,
            );
            await tx.execute(
              sql`UPDATE place_seed_raw SET status = 'merged', merged_into = ${dupId}, updated_at = NOW() WHERE id = ${p.targetRowId}`,
            );
          });
          console.log(
            `[UPSERT] 🧲 PID 쌍둥이 흡수 = 새 행 #${p.targetRowId} → 원행 #${dupId} (merged, 삭제 0)`,
          );
          return {
            ...absorbed,
            action: "updated",
            rowId: dupId,
            matchedBy: "pid",
            reason: "pid_twin_absorbed",
          };
        }
      } else if (p.followTriggerDup) {
        res = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('app.skip_dup_check', 'on', true)`,
          ); // true=트랜잭션 한정 = prevent_dup 만 스킵(자동 복원)
          return tx.execute(buildDirectUpdateSql(p, p.targetRowId!));
        });
      } else {
        res = await db.execute(buildDirectUpdateSql(p, p.targetRowId));
      }
      if ((res.rowCount ?? 0) === 0) {
        return {
          action: "skipped",
          rowId: null,
          matchedBy: "none",
          reason: "target_row_deleted",
        };
      }
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
      throw e;
    }
  }

  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 3벌 폐기 = 코드 매칭(loadMatchCandidates 전체SELECT + matchCandidate) 완전삭제 §19.
  const categoryTags =
    p.categoryTags && p.categoryTags.length > 0
      ? p.categoryTags
      : [p.seedCategory];
  const phaseTags = p.phaseTags || [];

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
    const rec = await recoverTriggerDup(p, e);
    if (rec) return rec;
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: `insert_error: ${e?.message || String(e)}`,
    };
  }
}
