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
import { db } from '../db';
import { placeSeedRaw } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
// ⚠️ 2026-06-03 = 동일장소 5단계 매칭 = 공용 matcher.ts 단일 (= 헌법 §16, 흩어진 매처 통합)
import { matchCandidate, type MatchedBy, type MatchCandidate } from './shared/matcher';

export interface UpsertPayload {
  cityId: number;
  seedCategory: string;  // 'restaurant' | 'attraction' | 'heritage' | ...
  // ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = rowId 직행 UPDATE(#45 repair.ts WHERE id=$1 방식).
  //   = 있으면 7단계 매칭 완전 스킵하고 그 행에 직행 UPDATE. 발굴 후 "방금 INSERT한 신규행을 TS검증값으로 되덮을 때" 재매칭 실패(name_local·좌표 결손 시 중복 INSERT) 원천차단.
  //   = 없으면(기본) 옛 동작 그대로 = 7단계 매칭 후 UPDATE/INSERT.
  targetRowId?: number | null;
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
  selectionReasonKo?: string | null;  // → summary_ko
  shortformKo?: string | null;        // → editorial_summary
  // 메타 (= TS / Wikipedia)
  googleReviewCount?: number | null;
  googlePrimaryType?: string | null;
  googleMapsUri?: string | null;  // 2026-05-15 = 13번째 SSOT = 최후의 보루
  priceEur?: number | null;
  // 🗑️ 2026-07-05 = priceOverwrite 인자 제거 = 무의미(동작 영향 0) 데드 인자 = 가격도 새우선 단일정책 §14갱신/§19
  imageUrl?: string | null;
  imageAttribution?: string | null;
  dayZone?: string | null;
  distanceKmFromCenter?: number | null;
  // 분류
  categoryTags?: string[];
  phaseTags?: string[];
  // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 배치 호출자(ag3 등)가 loadMatchCandidates()로 1회만 읽은 후보 명단 재사용.
  //   = 미전달 시 이 함수가 직접 1회 읽음(단건 호출 동일 동작). 곳마다 전행 재SELECT(1회 3.0초 실측 = 24곳 ~17초)가 근본 원인.
  candidates?: MatchCandidate[];
}

// ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 매칭 후보 읽기 단일 함수(§16 1벌) = upsertPlace 내부 + 배치 호출자(ag3·upsertPlaces) 공용.
//   = 반드시 전행(도시무관 글로벌) = §14 "같은 장소면 도시 달라도 중복" 불변. cityId 필터 추가 금지(크로스도시 재과금 재발).
//   = 타입 = matcher.ts MatchCandidate 그대로(재발명 0).
export async function loadMatchCandidates(): Promise<MatchCandidate[]> {
  if (!db) return [];
  return (await db
    .select({
      id: placeSeedRaw.id,
      cityId: placeSeedRaw.cityId,
      googlePlaceId: placeSeedRaw.googlePlaceId,
      googleMapsUri: placeSeedRaw.googleMapsUri,
      address: placeSeedRaw.address,
      latitude: placeSeedRaw.latitude,
      longitude: placeSeedRaw.longitude,
      nameEn: placeSeedRaw.nameEn,
      nameLocal: placeSeedRaw.nameLocal,
      nameKo: placeSeedRaw.nameKo,
    })
    .from(placeSeedRaw)) as MatchCandidate[];
}

// ⚠️ 2026-06-03 = MatchedBy = shared/matcher.ts 단일 정의 재노출 (= 기존 import 처 호환)
export type { MatchedBy };

// ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 호출자 명단(p.candidates) 동기화 1벌 = 관문(upsertPlace)이 소유(§16).
//   = INSERT = 새 행 식별자 추가 / UPDATE = 새값(new-wins, §14) 병합 = 배치의 후속 매칭이 방금 쓴 PID·이름·좌표를 인지
//   = 매회 재조회 방식과 동일한 신선도 보장(재조회 방식 자체는 폐기 = 2026-07-10 §19). 호출자가 직접 push(누락 위험) = 금지.
function syncCandidateList(p: UpsertPayload, rowId: number, inserted: boolean): void {
  if (!p.candidates) return;
  if (inserted) {
    p.candidates.push({
      id: rowId, cityId: p.cityId,
      googlePlaceId: p.googlePlaceId ?? null, googleMapsUri: p.googleMapsUri ?? null,
      address: p.address ?? null, latitude: p.latitude ?? null, longitude: p.longitude ?? null,
      nameEn: p.nameEn ?? null, nameLocal: p.nameLocal ?? null, nameKo: p.nameKo ?? null,
    });
    return;
  }
  const c = p.candidates.find((x) => x.id === rowId);
  if (!c) return;
  c.googlePlaceId = p.googlePlaceId ?? c.googlePlaceId;
  c.googleMapsUri = p.googleMapsUri ?? c.googleMapsUri;
  c.address = p.address ?? c.address;
  c.latitude = p.latitude ?? c.latitude;
  c.longitude = p.longitude ?? c.longitude;
  c.nameEn = p.nameEn ?? c.nameEn;
  c.nameLocal = p.nameLocal ?? c.nameLocal;
  c.nameKo = p.nameKo ?? c.nameKo;
}

export interface UpsertResult {
  action: 'inserted' | 'updated' | 'skipped';
  rowId: number | null;
  matchedBy: MatchedBy;
  // ⚠️ 2026-06-08 = 가변(영어·한국어명)만 일치 = 유사의심 = 자동병합 X = 새 행 + '중복의심' 메모 (= 사용자 SSOT)
  suspect?: boolean;
  reason?: string;
}

// ⚠️ 2026-06-03 = normAddr / normName / nameKeys = shared/matcher.ts 로 이관 (= 매칭 정규화 1벌 공용)

/**
 * 단일 entry-point. 7 단계 순차 매칭 (불변1~5 병합 / 의심6~7 신규) + UPDATE 또는 INSERT.
 */
export async function upsertPlace(p: UpsertPayload): Promise<UpsertResult> {
  if (!db) {
    return { action: 'skipped', rowId: null, matchedBy: 'none', reason: 'db_unavailable' };
  }
  if (!p.cityId || !p.seedCategory || !p.nameEn) {
    return { action: 'skipped', rowId: null, matchedBy: 'none', reason: 'missing_required_fields' };
  }

  // ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = targetRowId 직행 UPDATE(#45 repair.ts WHERE id=$1 방식).
  //   = 발굴 후 "방금 INSERT한 신규행을 TS검증값으로 되덮을 때" = 7단계 매칭 스킵하고 그 행 직행 = 재매칭 실패(name_local·좌표 결손) 중복 INSERT 원천차단.
  //   = COALESCE 새우선 §14갱신 동일(아래 매칭 UPDATE 와 같은 컬럼셋). tags=UNION. image_updated_at=이미지 있을때만.
  if (p.targetRowId != null) {
    const catTags = p.categoryTags && p.categoryTags.length > 0 ? p.categoryTags : [p.seedCategory];
    const phTags = p.phaseTags || [];
    await db.execute(sql`
      UPDATE place_seed_raw SET
        name_en       = COALESCE(${p.nameEn ?? null}, name_en),
        name_ko       = COALESCE(${p.nameKo ?? null}, name_ko),
        name_local    = COALESCE(${p.nameLocal ?? null}, name_local),
        latitude      = COALESCE(${p.latitude ?? null}::real, latitude),
        longitude     = COALESCE(${p.longitude ?? null}::real, longitude),
        address       = COALESCE(${p.address ?? null}, address),
        google_place_id = COALESCE(${p.googlePlaceId ?? null}, google_place_id),
        google_review_count = COALESCE(${p.googleReviewCount ?? null}::integer, google_review_count),
        google_primary_type = COALESCE(${p.googlePrimaryType ?? null}, google_primary_type),
        google_maps_uri = COALESCE(${p.googleMapsUri ?? null}, google_maps_uri),
        image_url     = COALESCE(${p.imageUrl ?? null}, image_url),
        image_attribution = COALESCE(${p.imageAttribution ?? null}, image_attribution),
        price_eur     = COALESCE(${p.priceEur ?? null}::real, price_eur),
        editorial_summary = COALESCE(${p.shortformKo ?? null}, editorial_summary),
        summary_ko        = COALESCE(${p.selectionReasonKo ?? null}, summary_ko),
        day_zone          = COALESCE(${p.dayZone ?? null}, day_zone),
        distance_km_from_center = COALESCE(${p.distanceKmFromCenter ?? null}::real, distance_km_from_center),
        category_tags     = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(category_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${catTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)}))),
        phase_tags        = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${phTags.length === 0 ? "" : phTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)}))),
        image_updated_at  = CASE WHEN ${p.imageUrl || null}::text IS NOT NULL THEN NOW() ELSE image_updated_at END
      WHERE id = ${p.targetRowId}
    `);
    return { action: 'updated', rowId: p.targetRowId, matchedBy: 'none' };
  }

  // ⚠️ 수정금지(승인필요) 2026-05-23 = 사용자 SSOT = 글로벌 매칭 (= cityId 무관)
  // = PID/주소/URI/좌표 = 같은 장소 = 도시 무관 항상 동일 entity = 글로벌 후보
  // = 이름 9 조합 만 = cityId 필터 유지 (= "Cafe de Paris" 체인 = 다른 도시는 별개 행)
  // = 사용자 명시: "비록 도시는 다르더라도 같은 장소면 중복 판명됨"
  // = 옵션 A = 첫 등록 cityId 영구 유지 (= UPDATE 시 cityId 미변경)
  // ⚠️ 2026-07-10 사장님 SSOT = 호출자가 준 명단 재사용, 없으면 1회 직접 읽기(loadMatchCandidates 1벌 §16).
  const candidates = p.candidates ?? await loadMatchCandidates();

  // ⚠️ 2026-06-08 = 7 단계 순차 매칭 = shared/matcher.ts 단일 공용 (= 정본 = 모든 경로 동일 검증, 헌법 §14/§16)
  //   = [불변]1)PID > 2)URI > 3)풀주소+로컬이름 > 4)좌표10m > 5)로컬이름 / [가변]6)영어명 > 7)한국어명 + samePlace(URI veto만, 2026-06-15 PID veto 제거)
  //   = 단계 통과(매칭) 시 다음 자동 스킵. 불변1~5=병합 / 가변6~7=새저장+'중복의심'. ⚠️ PID 달라도 주소·좌표·로컬이름 같으면 같은 장소(우리 PID 오류=TS 교정). URI 다르면만 다른 장소.
  const { match, matchedBy, tier } = matchCandidate(p, candidates);

  const categoryTags = p.categoryTags && p.categoryTags.length > 0 ? p.categoryTags : [p.seedCategory];
  // ⚠️ 2026-06-08 = 7단계 = 불변(확정) 1~5 매칭만 병합(UPDATE). 가변(의심) 6~7 = 자동병합 X = 새 행 + '중복의심' 메모.
  const suspect = !!match && tier === 'suspect';
  const phaseTags = suspect
    ? [...(p.phaseTags || []), '중복의심', `의심대상-${match!.id}`]
    : (p.phaseTags || []);

  if (match && tier === 'confirmed') {
    // ⚠️ 수정금지(승인필요) UPDATE = 사장님 SSOT 2026-07-05 §14갱신 = 모든 정보 무조건 새것 우선(예외없음).
    //   = COALESCE(새값, 컬럼) = 응답에 온 값이면 항상 새값이 이김(= 새우선). tags = UNION(누적).
    //   = COALESCE 를 유지하는 이유는 오직 발굴 부분단계 안전: job 에 안 온 컬럼(undefined→`?? null`)만
    //     뼈대(옛값) 보존해 storage-image-relink(imageUrl 만 넘김) 같은 부분갱신이 다른 컬럼을 NULL 로 미는 것 방지.
    //   = 가격도 동일 = 새값 있으면 무조건 덮음(레거시 garbage 영구잠금 버그 해소). `?? null` 로 0(무료)도 정상 새값 보존.
    await db.execute(sql`
      UPDATE place_seed_raw SET
        name_en       = COALESCE(${p.nameEn ?? null}, name_en),
        name_ko       = COALESCE(${p.nameKo ?? null}, name_ko),
        name_local    = COALESCE(${p.nameLocal ?? null}, name_local),
        latitude      = COALESCE(${p.latitude ?? null}::real, latitude),
        longitude     = COALESCE(${p.longitude ?? null}::real, longitude),
        address       = COALESCE(${p.address ?? null}, address),
        google_place_id = COALESCE(${p.googlePlaceId ?? null}, google_place_id),
        google_review_count = COALESCE(${p.googleReviewCount ?? null}::integer, google_review_count),
        google_primary_type = COALESCE(${p.googlePrimaryType ?? null}, google_primary_type),
        google_maps_uri = COALESCE(${p.googleMapsUri ?? null}, google_maps_uri),
        image_url     = COALESCE(${p.imageUrl ?? null}, image_url),
        image_attribution = COALESCE(${p.imageAttribution ?? null}, image_attribution),
        price_eur     = COALESCE(${p.priceEur ?? null}::real, price_eur),
        editorial_summary = COALESCE(${p.shortformKo ?? null}, editorial_summary),
        summary_ko        = COALESCE(${p.selectionReasonKo ?? null}, summary_ko),
        day_zone          = COALESCE(${p.dayZone ?? null}, day_zone),
        distance_km_from_center = COALESCE(${p.distanceKmFromCenter ?? null}::real, distance_km_from_center),
        category_tags     = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(category_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${categoryTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)}))),
        phase_tags        = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${phaseTags.length === 0 ? "" : phaseTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)}))),
        -- ⚠️ 수정금지(승인필요) 2026-06-12 = image_updated_at = 새 image_url 있을 때만 NOW() (§19)
        --   = imageUrl 있을 때만 갱신 = "이미지 채워진 시각" 정확 의미 = 결손 은폐·미래 누수 방지 (= 사장님 SSOT 2026-06-12 시스템 결함 수정).
        image_updated_at  = CASE WHEN ${p.imageUrl || null}::text IS NOT NULL THEN NOW() ELSE image_updated_at END
      WHERE id = ${match.id}
    `);
    syncCandidateList(p, match.id, false);
    return { action: 'updated', rowId: match.id, matchedBy };
  }

  // INSERT = 미매칭 = 신규 행 = 전체 응답값 그대로 새삽입.
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
    if (newId != null) syncCandidateList(p, newId, true);
    return {
      action: 'inserted',
      rowId: newId,
      matchedBy,
      suspect,
    };
  } catch (e: any) {
    // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = DB 트리거(prevent_dup) = 최종 매처(§14 최종 안전망)를 따라감.
    //   = 명단 스냅샷이 못 본 같은 장소(동시 요청의 방금 INSERT 등)를 트리거가 '[중복차단] ... id=N' 예외로 알려주면
    //   = 그 원행 id 직행 UPDATE 로 전환(같은 장소 병합) = 옛 "skipped 처리 = 그 슬롯 검증·사진 통째 소실" 폐기 2026-07-10 §19.
    const dup = /\[중복차단\][^]*?id=(\d+)/.exec(e?.message || '');
    if (dup) {
      const dupId = Number(dup[1]);
      const r = await upsertPlace({ ...p, candidates: undefined, targetRowId: dupId });
      syncCandidateList(p, dupId, false);
      return { ...r, reason: 'trigger_dup_recovered' };
    }
    // 최후 안전망 = INSERT 예외 시 skip(응답 안 죽임). rank 는 nullable+트리거 배정이라 rank 충돌 없음(2026-07-07 §19). = 실제 도달 드묾.
    return {
      action: 'skipped',
      rowId: null,
      matchedBy: 'none',
      reason: `insert_error: ${e?.message || String(e)}`,
    };
  }
}

/**
 * 배치 = 여러 곳 한 번에 (= 시드 / 메인앱 응답 후 사용)
 */
export async function upsertPlaces(payloads: UpsertPayload[]): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  suspect: number;
  byMatch: Record<MatchedBy, number>;
  errors: string[];
}> {
  const summary = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    suspect: 0,
    byMatch: { pid: 0, uri: 0, address: 0, coords: 0, name_local: 0, name_en: 0, name_ko: 0, none: 0 } as Record<MatchedBy, number>,
    errors: [] as string[],
  };
  // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 후보 명단 = 배치당 1회만 읽고 전 곳 재사용(관문이 INSERT/UPDATE마다 동기화).
  //   = 옛 "곳마다 전행 재SELECT(1회 3.0초 실측)" 폐기 2026-07-10 §19.
  const shared = payloads.length > 0 ? await loadMatchCandidates() : [];
  for (const p of payloads) {
    try {
      const r = await upsertPlace({ ...p, candidates: p.candidates ?? shared });
      summary[r.action]++;
      if (r.suspect) summary.suspect++;
      summary.byMatch[r.matchedBy]++;
      if (r.reason && r.action === 'skipped') summary.errors.push(r.reason);
    } catch (e: any) {
      summary.skipped++;
      summary.errors.push(e?.message || String(e));
    }
  }
  return summary;
}
