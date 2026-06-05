/**
 * ⚠️ 수정금지(승인필요) 2026-05-15 = 사용자 SSOT 단일 INSERT/UPDATE 시스템
 *
 * 모든 place_seed_raw INSERT/UPDATE = 반드시 이 함수만 통과한다.
 * = AI/스크립트/파이프라인 누가 호출해도 = 5 단계 순차 매칭 강제 = 중복 차단.
 *
 * ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT = 5 단계 신뢰도 순 (= 매칭 알고리즘 = 헌법 제14조)
 *   1순위 = google_place_id 일치 (= ~100%, Google 발급 유일 ID)
 *   2순위 = google_maps_uri 일치 (= cid = PID 동등 강력)
 *   3순위 = 풀 주소 정규화 100% + 이름 부분포함 (= 같은 식당 표기차 흡수 / Disney 복합상가 보존)
 *   4순위 = 좌표 10m (= ~95%, 같은 건물)
 *   5순위 = 로컬네임 9 조합 (= ~30-50%, 체인/지점 위험)
 *
 * UPDATE 정책 (= 사용자 SSOT 2026-06-03 = 최신 우선 확정):
 *   - 식별/검증 데이터 (name/주소/좌표/PID/URI/리뷰수) = COALESCE 새 우선 (= 최신 TS 가 가장 신뢰)
 *   - 이미지 = COALESCE 새 우선 (= 새 값 있을 때만 교체, 없으면 옛 값 보존)
 *   - 가격 = GREATEST 비싼 쪽 (= 신뢰 보호 / priceOverwrite=true 시에만 새 값 덮기)
 *   - 카피 (summary_ko/editorial_summary) = 새 우선 (= 큐레이션 갱신)
 *   - tags = UNION (= 누적)
 */
import { db } from '../db';
import { placeSeedRaw } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
// ⚠️ 2026-06-03 = 동일장소 5단계 매칭 = 공용 matcher.ts 단일 (= 헌법 §16, 흩어진 매처 통합)
import { matchCandidate, type MatchedBy } from './shared/matcher';

export interface UpsertPayload {
  cityId: number;
  seedCategory: string;  // 'restaurant' | 'attraction' | 'heritage' | ...
  // ⚠️ 2026-05-23 = collection_phase 폐기 = phaseTags 배열로 대체
  rank?: number;
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
  // ⚠️ 수정금지(승인필요) 2026-06-02 = true 시 가격도 새 값 덮어쓰기 (= TS discovery 풀 오염 청소 = €75 핫도그 등)
  //   = 기본(false/미지정) = GREATEST 비싼 쪽 유지 ([[feedback_price_max_always]] = 물가 항상 오름). 스코프 한정 오버라이드.
  priceOverwrite?: boolean;
  imageUrl?: string | null;
  imageAttribution?: string | null;
  dayZone?: string | null;
  distanceKmFromCenter?: number | null;
  // 분류
  categoryTags?: string[];
  phaseTags?: string[];
}

// ⚠️ 2026-06-03 = MatchedBy = shared/matcher.ts 단일 정의 재노출 (= 기존 import 처 호환)
export type { MatchedBy };

export interface UpsertResult {
  action: 'inserted' | 'updated' | 'skipped';
  rowId: number | null;
  matchedBy: MatchedBy;
  reason?: string;
}

// ⚠️ 2026-06-03 = normAddr / normName / nameKeys = shared/matcher.ts 로 이관 (= 매칭 정규화 1벌 공용)

/**
 * 단일 entry-point. 5 단계 순차 매칭 + UPDATE 또는 INSERT.
 */
export async function upsertPlace(p: UpsertPayload): Promise<UpsertResult> {
  if (!db) {
    return { action: 'skipped', rowId: null, matchedBy: 'none', reason: 'db_unavailable' };
  }
  if (!p.cityId || !p.seedCategory || !p.nameEn) {
    return { action: 'skipped', rowId: null, matchedBy: 'none', reason: 'missing_required_fields' };
  }

  // ⚠️ 수정금지(승인필요) 2026-05-23 = 사용자 SSOT = 글로벌 매칭 (= cityId 무관)
  // = PID/주소/URI/좌표 = 같은 장소 = 도시 무관 항상 동일 entity = 글로벌 후보
  // = 이름 9 조합 만 = cityId 필터 유지 (= "Cafe de Paris" 체인 = 다른 도시는 별개 행)
  // = 사용자 명시: "비록 도시는 다르더라도 같은 장소면 중복 판명됨"
  // = 옵션 A = 첫 등록 cityId 영구 유지 (= UPDATE 시 cityId 미변경)
  const candidates = await db
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
    .from(placeSeedRaw);

  // ⚠️ 2026-06-03 = 5 단계 순차 매칭 = shared/matcher.ts 단일 공용 (= 정본 = 모든 경로 동일 검증, 헌법 §14/§16)
  //   = 1)PID > 2)URI > 3)풀주소+이름9조합 > 4)좌표10m > 5)로컬네임9조합 + samePlace(PID/URI veto)
  //   = 단계 통과(매칭) 시 다음 자동 스킵. PID/URI 다르면 = 확정 다른 장소 = 보조매칭 제외.
  const { match, matchedBy } = matchCandidate(p, candidates);

  const categoryTags = p.categoryTags && p.categoryTags.length > 0 ? p.categoryTags : [p.seedCategory];
  const phaseTags = p.phaseTags || [];

  if (match) {
    // UPDATE = 사용자 SSOT 2026-05-18 = "모든 정보 최신 덮어씀" (= 옛 COALESCE 옛 우선 폐기)
    // = 모든 필드 = 새 값 있으면 새 / 없으면 옛 유지 (= COALESCE 새 → 옛 순서)
    // = tags = UNION (= 누적 유지)
    // ⚠️ 수정금지(승인필요) 2026-06-02 = priceOverwrite=true (= TS discovery 풀) → 가격도 새 값 덮어쓰기(오염 청소)
    //   = false(기본) → GREATEST 비싼 쪽 유지 ([[feedback_price_max_always]] = 물가 항상 오름)
    const priceExpr = p.priceOverwrite
      ? sql`COALESCE(${p.priceEur || null}::real, price_eur)`
      : sql`COALESCE(GREATEST(${p.priceEur || null}::real, price_eur), ${p.priceEur || null}::real, price_eur)`;
    await db.execute(sql`
      UPDATE place_seed_raw SET
        name_en       = COALESCE(${p.nameEn}, name_en),
        name_ko       = COALESCE(${p.nameKo || null}, name_ko),
        name_local    = COALESCE(${p.nameLocal || null}, name_local),
        latitude      = COALESCE(${p.latitude || null}::real, latitude),
        longitude     = COALESCE(${p.longitude || null}::real, longitude),
        address       = COALESCE(${p.address || null}, address),
        google_place_id = COALESCE(${p.googlePlaceId || null}, google_place_id),
        google_review_count = COALESCE(${p.googleReviewCount || null}::integer, google_review_count),
        google_primary_type = COALESCE(${p.googlePrimaryType || null}, google_primary_type),
        google_maps_uri = COALESCE(${p.googleMapsUri || null}, google_maps_uri),
        image_url     = COALESCE(${p.imageUrl || null}, image_url),
        image_attribution = COALESCE(${p.imageAttribution || null}, image_attribution),
        -- ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT [[feedback_price_max_always]] = GREATEST 비싼 쪽 + COALESCE 안전망
        -- = 한 쪽만 있으면 = 있는 쪽 / 둘 다 있으면 = 비싼 쪽 덮어쓰기 (= 신뢰 보호 + 물가 항상 오름)
        price_eur     = ${priceExpr},
        editorial_summary = COALESCE(${p.shortformKo || null}, editorial_summary),
        summary_ko        = COALESCE(${p.selectionReasonKo || null}, summary_ko),
        day_zone          = COALESCE(${p.dayZone || null}, day_zone),
        distance_km_from_center = COALESCE(${p.distanceKmFromCenter || null}::real, distance_km_from_center),
        category_tags     = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(category_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${categoryTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)}))),
        phase_tags        = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${phaseTags.length === 0 ? "" : phaseTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)}))),
        image_updated_at  = NOW()
      WHERE id = ${match.id}
    `);
    return { action: 'updated', rowId: match.id, matchedBy };
  }

  // INSERT = 미매칭 = 신규 행
  // ⚠️ rank 자동 부여 = (city_id, seed_category) 별 MAX + 1 (= UNIQUE 충돌 방지)
  let nextRank = p.rank;
  if (!nextRank) {
    const maxRow = await db
      .select({ max: sql<number>`COALESCE(MAX(${placeSeedRaw.rank}), 0)` })
      .from(placeSeedRaw)
      .where(sql`${placeSeedRaw.cityId} = ${p.cityId} AND ${placeSeedRaw.seedCategory} = ${p.seedCategory}`);
    nextRank = (Number(maxRow[0]?.max) || 0) + 1;
  }
  try {
    const inserted = await db
      .insert(placeSeedRaw)
      .values({
        cityId: p.cityId,
        seedCategory: p.seedCategory,
        // ⚠️ 2026-05-23 = collection_phase 폐기 = phaseTags 만 사용
        rank: nextRank,
        nameEn: p.nameEn,
        nameKo: p.nameKo || null,
        nameLocal: p.nameLocal || null,
        latitude: p.latitude || null,
        longitude: p.longitude || null,
        address: p.address || null,
        googlePlaceId: p.googlePlaceId || null,
        googleMapsUri: p.googleMapsUri || null,
        googleReviewCount: p.googleReviewCount || null,
        googlePrimaryType: p.googlePrimaryType || null,
        imageUrl: p.imageUrl || null,
        imageAttribution: p.imageAttribution || null,
        priceEur: p.priceEur || null,
        editorialSummary: p.shortformKo || null,
        summaryKo: p.selectionReasonKo || null,
        dayZone: p.dayZone || null,
        distanceKmFromCenter: p.distanceKmFromCenter || null,
        categoryTags,
        phaseTags,
      } as any)
      .returning({ id: placeSeedRaw.id });

    return {
      action: 'inserted',
      rowId: inserted[0]?.id || null,
      matchedBy: 'none',
    };
  } catch (e: any) {
    // 안전망 = UNIQUE INDEX (= 이름 1단계) 충돌 시 = 한 번 더 매칭 시도 (= 동시 INSERT race)
    if (String(e?.message || '').includes('uniq_psr_global_city_name')) {
      const retry = await db
        .select({ id: placeSeedRaw.id })
        .from(placeSeedRaw)
        .where(
          sql`${placeSeedRaw.cityId} = ${p.cityId}
              AND LOWER(TRIM(${placeSeedRaw.nameEn})) = LOWER(TRIM(${p.nameEn || ''}))`,
        )
        .limit(1);
      if (retry[0]?.id) {
        return {
          action: 'skipped',
          rowId: retry[0].id,
          matchedBy: 'name',
          reason: 'race_conflict_resolved',
        };
      }
    }
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
  byMatch: Record<MatchedBy, number>;
  errors: string[];
}> {
  const summary = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    byMatch: { pid: 0, uri: 0, address: 0, coords: 0, name: 0, none: 0 } as Record<MatchedBy, number>,
    errors: [] as string[],
  };
  for (const p of payloads) {
    try {
      const r = await upsertPlace(p);
      summary[r.action]++;
      summary.byMatch[r.matchedBy]++;
      if (r.reason && r.action === 'skipped') summary.errors.push(r.reason);
    } catch (e: any) {
      summary.skipped++;
      summary.errors.push(e?.message || String(e));
    }
  }
  return summary;
}
