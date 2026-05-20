/**
 * ⚠️ 수정금지(승인필요) 2026-05-15 = 사용자 SSOT 단일 INSERT/UPDATE 시스템
 *
 * 모든 place_seed_raw INSERT/UPDATE = 반드시 이 함수만 통과한다.
 * = AI/스크립트/파이프라인 누가 호출해도 = 4 단계 매칭 강제 = 중복 차단.
 *
 * 매칭 단계 (= 같은 장소 확률 순):
 *   0순위 = google_place_id 일치 (= ~100%, Google 발급 유일 ID)
 *   1순위 = 풀 주소 정규화 100% (= ~99%, 번지+우편번호 일치)
 *   2순위 = 좌표 10m (= ~95%, 같은 건물)
 *   3순위 = 장소명 LOWER+trim (= ~30-50%, 체인/지점 위험)
 *
 * UPDATE 정책 (= 사용자 SSOT):
 *   - 검증 데이터 (name/주소/좌표/PID/이미지/리뷰수) = COALESCE 옛 우선 (= WK 보존)
 *   - 가격 = GREATEST 비싼 쪽 (= 사용자 신뢰 보호, 물가 항상 오름)
 *   - 카피 (summary_ko/editorial_summary) = 새 우선 (= 큐레이션 갱신)
 *   - tags = UNION (= 누적)
 */
import { db } from '../db';
import { placeSeedRaw } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

export interface UpsertPayload {
  cityId: number;
  seedCategory: string;  // 'restaurant' | 'attraction' | 'heritage' | ...
  collectionPhase?: string;  // 기본 = 'auto-learn-2026-05'
  rank?: number;
  // 식별 키 (= 4 단계 매칭)
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
  imageUrl?: string | null;
  imageAttribution?: string | null;
  dayZone?: string | null;
  distanceKmFromCenter?: number | null;
  // 분류
  categoryTags?: string[];
  phaseTags?: string[];
}

export type MatchedBy = 'pid' | 'address' | 'coords' | 'name' | 'none';

export interface UpsertResult {
  action: 'inserted' | 'updated' | 'skipped';
  rowId: number | null;
  matchedBy: MatchedBy;
  reason?: string;
}

const normAddr = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 단일 entry-point. 4 단계 매칭 + UPDATE 또는 INSERT.
 */
export async function upsertPlace(p: UpsertPayload): Promise<UpsertResult> {
  if (!db) {
    return { action: 'skipped', rowId: null, matchedBy: 'none', reason: 'db_unavailable' };
  }
  if (!p.cityId || !p.seedCategory || !p.nameEn) {
    return { action: 'skipped', rowId: null, matchedBy: 'none', reason: 'missing_required_fields' };
  }

  // 같은 도시 활성 행 = 매칭 후보 SELECT
  // ⚠️ 2026-05-15 = 5 단계 매칭 = PID/풀주소/google_maps_uri/좌표 10m/이름 9 조합
  const candidates = await db
    .select({
      id: placeSeedRaw.id,
      googlePlaceId: placeSeedRaw.googlePlaceId,
      googleMapsUri: placeSeedRaw.googleMapsUri,
      address: placeSeedRaw.address,
      latitude: placeSeedRaw.latitude,
      longitude: placeSeedRaw.longitude,
      nameEn: placeSeedRaw.nameEn,
      nameLocal: placeSeedRaw.nameLocal,
      nameKo: placeSeedRaw.nameKo,
    })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, p.cityId));

  // 5 단계 매칭
  let match: (typeof candidates)[0] | undefined;
  let matchedBy: MatchedBy = 'none';

  // 0순위 = PID
  if (p.googlePlaceId) {
    match = candidates.find((c) => c.googlePlaceId === p.googlePlaceId);
    if (match) matchedBy = 'pid';
  }
  // 1순위 = 풀 주소 100% + 이름 9 조합 한 쌍 일치 동시 (= 사용자 SSOT 2026-05-18)
  // = 광역 주소 (= Disney Village 복합 상가) = 같은 주소 다른 식당 = 별도 행 보존
  // = "주소 + 이름" 동시 일치만 = 같은 entity 매칭
  if (!match && p.address) {
    const np = normAddr(p.address);
    if (np.length >= 20) {
      const normName1 = (s: string | null | undefined) => (s || '').trim().toLowerCase();
      const pNames1 = [normName1(p.nameEn), normName1(p.nameLocal), normName1(p.nameKo)].filter(Boolean);
      match = candidates.find((c) => {
        if (!c.address || normAddr(c.address) !== np) return false;
        if (pNames1.length === 0) return true; // 입력 이름 X = 주소만 매칭 (= 옛 동작 호환)
        const cNames1 = [normName1(c.nameEn), normName1(c.nameLocal), normName1(c.nameKo)].filter(Boolean);
        return pNames1.some((pn) => cNames1.includes(pn));
      });
      if (match) matchedBy = 'address';
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-05-15 = 사용자 SSOT = google_maps_uri = 2순위 신규 추가
  // = google_maps_uri 안의 cid = PID 동등 강력 = PID 없을 때 매칭 보강
  if (!match && p.googleMapsUri) {
    match = candidates.find((c) => c.googleMapsUri === p.googleMapsUri);
    if (match) matchedBy = 'address'; // 'gmaps_uri' 매칭 → 주소급으로 분류
  }
  // 3순위 = 좌표 10m
  if (!match && p.latitude && p.longitude) {
    match = candidates.find(
      (c) =>
        c.latitude != null &&
        c.longitude != null &&
        Math.abs(Number(c.latitude) - p.latitude!) < 0.0001 &&
        Math.abs(Number(c.longitude) - p.longitude!) < 0.0001,
    );
    if (match) matchedBy = 'coords';
  }
  // ⚠️ 수정금지(승인필요) 2026-05-15 = 사용자 SSOT = 이름 매칭 9 조합 강제
  // = [[feedback_name_match_9_combinations]]
  // = name_en + name_local + name_ko 3 × 3 = 9 조합 = 셋 중 한 쌍 일치 시 매칭
  // = 1/9 만 비교 = 중복 못 잡음 (= Eiffel Tower / Tour Eiffel / 에펠탑 별개로 남음)
  if (!match) {
    const normName = (s: string | null | undefined) => (s || '').trim().toLowerCase();
    const pNames = [normName(p.nameEn), normName(p.nameLocal), normName(p.nameKo)].filter(Boolean);
    if (pNames.length > 0) {
      match = candidates.find((c) => {
        const cNames = [normName(c.nameEn), normName(c.nameLocal), normName(c.nameKo)].filter(Boolean);
        return pNames.some((pn) => cNames.includes(pn));
      });
      if (match) matchedBy = 'name';
    }
  }

  const categoryTags = p.categoryTags && p.categoryTags.length > 0 ? p.categoryTags : [p.seedCategory];
  const phaseTags = p.phaseTags || [];

  if (match) {
    // UPDATE = 사용자 SSOT 2026-05-18 = "모든 정보 최신 덮어씀" (= 옛 COALESCE 옛 우선 폐기)
    // = 모든 필드 = 새 값 있으면 새 / 없으면 옛 유지 (= COALESCE 새 → 옛 순서)
    // = tags = UNION (= 누적 유지)
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
        price_eur     = COALESCE(GREATEST(${p.priceEur || null}::real, price_eur), ${p.priceEur || null}::real, price_eur),
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
        collectionPhase: p.collectionPhase || 'auto-learn-2026-05',
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
    byMatch: { pid: 0, address: 0, coords: 0, name: 0, none: 0 } as Record<MatchedBy, number>,
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
