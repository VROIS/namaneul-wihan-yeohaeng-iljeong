/**
 * ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = AG2 = DB-only 단일 진입점
 *
 * AG2: place_seed_raw 직접 SELECT (= Gemini 호출 0)
 * = ready=true (= rank 1-20 ≥ 70 행) → fetchFromPlaceSeedRaw 반환
 * = ready=false → throw MIX_MODE_DISABLED (= MIX path = pipeline-v3.ts step1_geminiItinerary 표준 prompt 사용)
 *
 * 폐기 (= 사용자 SSOT 2026-05-24 = 표준 prompt 단일 통일):
 * - 옛 별도 간소화 prompt (= line 367-374) = lat/lng 누락 + place_id 환각 유도 = 삭제
 * - 옛 Gemini fallback 본문 (= line 317-462) = DB-only 의도 위반 = 삭제
 * - 옛 80% 부족 시 null 반환 (= line 241-244) = 부족해도 그대로 반환 (= 사용자 SSOT)
 * - 옛 PlaceResult 변환 (= line 434-457 = lat/lng=0 + 점수 하드코딩) = 삭제
 * - 옛 repairTruncatedJSON 함수 = 사용처 0 = 삭제
 */

import type { AG1Output, PlaceResult, SeedCategory } from './types';
import { MEAL_BUDGET } from './types';
// ⚠️ 수정금지(승인필요) 2026-05-20 = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage } from '../shared/place-image';
// ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 의도 = AG2 데이터 출처 = place_seed_raw 우선
import { db } from '../../db';
import { placeSeedRaw } from '@shared/schema';
import { eq, and, between, desc, asc, sql } from 'drizzle-orm';
import { findCityUnified } from '../city-resolver';

/**
 * ⚠️ 수정금지(승인필요) 2026-05-07 = 사용자 명시 = 도시 입력 시점 분기 (백엔드만)
 * 도시 ready 판정 = 발굴 도시인지 미발굴 도시인지
 * = 발굴 (= place_seed_raw phase='gemini3-2026-05' rank 1-20 ≥ 70 행) → DB-only 경로
 * = 미발굴 → Gemini + Google fallback + auto-learn 저장 (= Geneva 패턴)
 *
 * 임계값 70 = 7 카테고리 × 10 = 사용자 합의 = 충분 기준
 * 프론트 UI 노출 X (= 사용자 명시 = 별도 안내 페이지 존재)
 */
const READY_THRESHOLD = 70;

export async function isCityReady(destination: string): Promise<{
  ready: boolean;
  cityId: number | null;
  cityName: string;
  count: number;
}> {
  if (!db) return { ready: false, cityId: null, cityName: destination, count: 0 };

  const cityResult = await findCityUnified(destination);
  const cityId = cityResult?.cityId;
  if (!cityId) {
    return { ready: false, cityId: null, cityName: destination, count: 0 };
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = collection_phase 완전 폐기 (= 같은 장소 = 다른 phase = 같은 데이터)
  const countRows = await db.select({
    count: sql<number>`COUNT(*)::int`,
  }).from(placeSeedRaw).where(and(
    eq(placeSeedRaw.cityId, cityId),
    between(placeSeedRaw.rank, 1, 20),
  ));
  const count = Number(countRows[0]?.count || 0);
  return {
    ready: count >= READY_THRESHOLD,
    cityId,
    cityName: cityResult.name,
    count,
  };
}

/**
 * ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 결정
 * AG2-DB: place_seed_raw 직접 SELECT (= 외부 API 호출 0)
 * = 발굴 도시 (= top 20 phase=gemini3-2026-05) 만 = 0.1초 + 0 비용
 * = 미발굴 도시 = null 반환 = Gemini fallback
 */
// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Romantic → Shopping 리네이밍
// = 사용자 vibe 버튼 자체 = "Shopping" (= PSR shopping 카테고리 = 명품/시장/아울렛)
// = 옛 Romantic → 'hotspot' 매핑 변질 = 본질 해결 (= AG1 60/40 매트릭스 회복)
const VIBE_PRIMARY_CATEGORY: Record<string, string> = {
  Foodie: 'restaurant',
  Healing: 'healing',
  Hotspot: 'hotspot',
  Adventure: 'adventure',
  Shopping: 'shopping',
  Romantic: 'shopping',  // 호환 (= FE 옛 'Romantic' 키 전송 시 = shopping 매핑)
  Culture: 'heritage',
};

async function fetchFromPlaceSeedRaw(
  skeleton: AG1Output,
  // ⚠️ 수정금지(승인필요) 2026-05-24 = isCityReady 결과 재사용 (= findCityUnified 2 회 호출 회피)
  preResolvedCity?: { cityId: number; name: string },
): Promise<PlaceResult[] | null> {
  const _t0 = Date.now();
  const { formData, vibeWeights, requiredPlaceCount } = skeleton;
  if (!db) return null;

  let cityId: number | undefined = preResolvedCity?.cityId;
  let cityName: string = preResolvedCity?.name ?? formData.destination;
  if (!cityId) {
    const cityResult = await findCityUnified(formData.destination);
    cityId = cityResult?.cityId;
    cityName = cityResult?.name ?? formData.destination;
    if (!cityId) {
      console.log(`[AG2-DB] 도시 "${formData.destination}" 미발견 = Gemini fallback`);
      return null;
    }
  }

  // vibe → 카테고리 슬롯 분배
  const totalSlots = requiredPlaceCount;
  const catSlots: Record<string, number> = {};
  for (const vw of vibeWeights) {
    const primary = VIBE_PRIMARY_CATEGORY[vw.vibe] || 'attraction';
    catSlots[primary] = (catSlots[primary] || 0) + vw.weight * totalSlots;
  }
  // ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 SSOT = 식당 = 2/일자 cap (= 점심 1 + 저녁 1)
  // = AG4 MEAL_SLOTS = lunch (12~14) + dinner (18~20) 만 식당 slot 인식
  // = 초과 식당 = 일반 slot 으로 강제 변환 = 저녁 2번 사고 발생 → 식당 자체 cap 필요
  const dayCount = skeleton.dayCount || skeleton.daySlotsConfig?.length || 3;
  const restaurantCap = dayCount * 2; // = 점심 + 저녁
  if (!catSlots.restaurant || catSlots.restaurant < dayCount) {
    catSlots.restaurant = Math.min(restaurantCap, Math.ceil(totalSlots * 0.4));
  }
  // 식당 cap 적용 (= 초과 분 = 비식당 으로 재분배)
  if (catSlots.restaurant > restaurantCap) {
    const overflow = catSlots.restaurant - restaurantCap;
    catSlots.restaurant = restaurantCap;
    // 다른 카테고리 비율로 재분배
    const nonRest = Object.keys(catSlots).filter(k => k !== 'restaurant');
    const nonRestTotal = nonRest.reduce((s, k) => s + (catSlots[k] || 0), 0) || 1;
    for (const k of nonRest) {
      catSlots[k] = (catSlots[k] || 0) + overflow * (catSlots[k] / nonRestTotal);
    }
  }
  // 비식당 비율 재조정 (= 식당 정해진 후, 나머지 = 사용자 vibe 비율 따름)
  const nonRest = Object.keys(catSlots).filter(k => k !== 'restaurant');
  const nonRestSum = nonRest.reduce((s, k) => s + (catSlots[k] || 0), 0);
  const targetNonRest = totalSlots - catSlots.restaurant;
  if (nonRestSum > 0) {
    for (const k of nonRest) {
      catSlots[k] = Math.round(((catSlots[k] || 0) / nonRestSum) * targetNonRest);
    }
  }
  // 정수화 + 합계 보정
  for (const k of Object.keys(catSlots)) catSlots[k] = Math.max(1, Math.round(catSlots[k]));
  const sum = Object.values(catSlots).reduce((s, n) => s + n, 0);
  if (sum !== totalSlots) {
    const top = Object.entries(catSlots).sort((a, b) => b[1] - a[1])[0][0];
    catSlots[top] += (totalSlots - sum);
  }

  console.log(`[AG2-DB] 도시 "${cityName}" (id=${cityId}) 카테고리 슬롯:`, catSlots);

  // ⚠️ 수정금지(승인필요) 2026-05-19 = budget 매트릭스 (= 4:6 split)
  // 식당 = travelStyle MEAL_BUDGET tier 별 price_eur 범위로 필터 = rank 제한 X
  // 비식당 = rank 1-20 유지 (= FE 우선 노출 순위)
  const budgetTier = MEAL_BUDGET[formData.travelStyle];
  console.log(`[AG2-DB] travelStyle=${formData.travelStyle} = price €${budgetTier.min}-${budgetTier.max} (lunch ≤€${budgetTier.lunch} / dinner ≤€${budgetTier.dinner})`);

  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-1 = dayZone 균등 + 좌표 ORDER (= 사용자 SSOT)
  // 식당 = budget WHERE + dayZone 균등 (= core 4 + outskirt 2 = 일자별 zone 매칭 자동)
  // 비식당 = rank 1-20 + ORDER distance_km_from_center ASC (= 도심 → 외곽 자연 흐름)
  const SELECT_COLS = {
    id: placeSeedRaw.id,
    nameEn: placeSeedRaw.nameEn,
    nameKo: placeSeedRaw.nameKo,
    googlePlaceId: placeSeedRaw.googlePlaceId,
    googleMapsUri: placeSeedRaw.googleMapsUri,
    address: placeSeedRaw.address,
    latitude: placeSeedRaw.latitude,
    longitude: placeSeedRaw.longitude,
    imageUrl: placeSeedRaw.imageUrl,           // Google 1 순위
    bestImageUrl: placeSeedRaw.bestImageUrl,    // WK/Wikidata SPARQL 2 순위
    summaryKo: placeSeedRaw.summaryKo,
    editorialSummary: placeSeedRaw.editorialSummary,
    seedCategory: placeSeedRaw.seedCategory,
    rank: placeSeedRaw.rank,
    googleReviewCount: placeSeedRaw.googleReviewCount,
    priceEur: placeSeedRaw.priceEur,
    dayZone: placeSeedRaw.dayZone,
    distanceKmFromCenter: placeSeedRaw.distanceKmFromCenter,
  };

  const allRows: any[] = [];
  try {
    const queries = Object.entries(catSlots)
      .filter(([_, slots]) => slots > 0)
      .map(async ([cat, slots]) => {
        const isRestaurant = cat === 'restaurant';
        if (isRestaurant) {
          // ⚠️ 2026-05-21 = 식당 = dayZone 균등 (= 사용자 SSOT = 일자별 zone 매칭 자동)
          // = restaurant 6 = core 4 + outskirt 2 (= dayCount=3 = Day 1 core 2 + Day 2 outskirt 2 + Day 3 core 2)
          const coreSlots = Math.ceil(slots * (2 / 3));     // = 6 → 4 core
          const outskirtSlots = slots - coreSlots;            // = 6 → 2 outskirt
          // ⚠️ 수정금지(승인필요) 2026-05-21 = collection_phase 완전 폐기 (= 사용자 SSOT = 같은 장소 = 한 데이터)
          const baseWhereCore = [
            eq(placeSeedRaw.cityId, cityId),
            eq(placeSeedRaw.seedCategory, cat),
            between(placeSeedRaw.priceEur, budgetTier.min, budgetTier.max),
            eq(placeSeedRaw.dayZone, 'core'),
          ];
          const baseWhereOutskirt = [
            eq(placeSeedRaw.cityId, cityId),
            eq(placeSeedRaw.seedCategory, cat),
            between(placeSeedRaw.priceEur, budgetTier.min, budgetTier.max),
            eq(placeSeedRaw.dayZone, 'outskirt'),
          ];
          const [coreRows, outskirtRows] = await Promise.all([
            db!.select(SELECT_COLS).from(placeSeedRaw).where(and(...baseWhereCore))
              .orderBy(desc(placeSeedRaw.googleReviewCount)).limit(coreSlots),
            db!.select(SELECT_COLS).from(placeSeedRaw).where(and(...baseWhereOutskirt))
              .orderBy(desc(placeSeedRaw.googleReviewCount)).limit(outskirtSlots),
          ]);
          console.log(`[AG2-DB] restaurant: core ${coreRows.length}/${coreSlots} + outskirt ${outskirtRows.length}/${outskirtSlots} (budget €${budgetTier.min}-${budgetTier.max})`);
          return [...coreRows, ...outskirtRows];
        }
        // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 비식당 = 식당과 동일 day_zone 분리 SELECT
        // = core 2/3 + outskirt 1/3 (= 식당 패턴 동일 = AG3 Day 2 outskirt pool 확보)
        // = 옛 단일 풀 = day_zone 무관 = outskirt 자동 제외 = 사용자 진단 = 시스템 미반영 = 시정
        const coreSlots = Math.ceil(slots * (2 / 3));
        const outskirtSlots = slots - coreSlots;
        const nonFoodWhereCore = [
          eq(placeSeedRaw.cityId, cityId),
          eq(placeSeedRaw.seedCategory, cat),
          eq(placeSeedRaw.dayZone, 'core'),
        ];
        const nonFoodWhereOutskirt = [
          eq(placeSeedRaw.cityId, cityId),
          eq(placeSeedRaw.seedCategory, cat),
          eq(placeSeedRaw.dayZone, 'outskirt'),
        ];
        const [coreRows, outskirtRows] = await Promise.all([
          db!.select(SELECT_COLS).from(placeSeedRaw).where(and(...nonFoodWhereCore))
            .orderBy(asc(placeSeedRaw.rank)).limit(coreSlots),
          db!.select(SELECT_COLS).from(placeSeedRaw).where(and(...nonFoodWhereOutskirt))
            .orderBy(asc(placeSeedRaw.rank)).limit(outskirtSlots),
        ]);
        console.log(`[AG2-DB] ${cat}: core ${coreRows.length}/${coreSlots} + outskirt ${outskirtRows.length}/${outskirtSlots} (ORDER rank ASC)`);
        return [...coreRows, ...outskirtRows];
      });
    const results = await Promise.all(queries);
    for (const rows of results) allRows.push(...rows);
  } catch (e: any) {
    console.error(`[AG2-DB] ❌ SELECT 실패:`, e.message);
    return null;
  }

  // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 부족해도 그대로 반환 (= Gemini fallback X)
  // = 옛 80% null 반환 = DB-only 의도 위반 (= ag2:317-462 Gemini fallback 호출) = 삭제
  // = 빈 슬롯 가능 = 사용자 표시 = 솔직 (= 환각 채움 X)
  console.log(`[AG2-DB] 행 수 = ${allRows.length}/${totalSlots} (= 부족해도 그대로 반환)`);

  // PlaceResult 형식 변환 (= AG3 호환)
  const places: PlaceResult[] = allRows.map((r: any, i: number) => {
    const isFood = r.seedCategory === 'restaurant';
    return {
      id: `db-${r.id}`,
      name: r.nameEn || '',
      geminiPlaceId: r.googlePlaceId || '',
      geminiAddress: r.address || '',
      description: r.summaryKo || r.editorialSummary || '',
      lat: parseFloat(String(r.latitude)) || 0,
      lng: parseFloat(String(r.longitude)) || 0,
      // ⚠️ 수정금지(승인필요) 2026-05-24 = vibeScore/confidenceScore 폐기 (= PSR.rank 단일 SSOT)
      vibeScore: 0,
      confidenceScore: 0,
      rank: r.rank,
      sourceType: "DB Direct (Place Seed Raw)",
      personaFitReason: r.summaryKo || '',
      tags: isFood ? ['restaurant', 'food'] : [],
      vibeTags: isFood ? ['Foodie' as const] : [],
      // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = pickPlaceImage 단일 SSOT (= Google 1 > WK 2)
      image: pickPlaceImage(r),
      priceEstimate: r.priceEur ? `€${r.priceEur}` : '',
      estimatedPriceEur: r.priceEur ?? undefined,
      seedCategory: r.seedCategory as SeedCategory,
      placeTypes: isFood ? ['restaurant'] : [],
      recommendedTime: 'afternoon',
      city: formData.destination,
      region: '',
      koreanPopularityScore: 0,
      // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = DB 의 google_maps_uri (= cid URL) 직접 사용 (= 100% 정확)
      // = 옛 코드 = PID 를 cid 로 잘못 사용 (= PID 형식 ChIJ... ≠ CID decimal) = 시정
      googleMapsUrl: r.googleMapsUri || '',
      googleMapsUri: r.googleMapsUri || '',
      // AG4 동선 최적화에 필요한 추가 정보
      userRatingCount: r.googleReviewCount || 0,
      // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E = dayZone 매핑 (= 옛 (p as any) 캐스트 해결 = 무음 실패 방지)
      dayZone: r.dayZone ?? null,
    } as any;
  });
  console.log(`[AG2-DB] ✅ DB 직접 = ${places.length}곳 (${Date.now() - _t0}ms, Gemini X, Google X)`);
  return places;
}

/**
 * ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = AG2 메인 = DB-only 단일 분기
 *
 * 분기:
 * - ready=true (= rank 1-20 ≥ 70 행) → fetchFromPlaceSeedRaw 결과 그대로 반환 (= Gemini 0)
 * - ready=false → throw MIX_MODE_DISABLED (= MIX path = pipeline-v3.ts step1_geminiItinerary 처리)
 *
 * 폐기 (= 2026-05-24):
 * - 옛 80% 부족 시 Gemini fallback = 삭제 (= DB-only 의도 위반)
 * - 옛 간소화 prompt (= lat/lng 누락 + place_id 환각 유도) = 삭제
 * - 옛 PlaceResult 변환 (= lat/lng=0 + 점수 하드코딩) = 삭제
 * - 옛 repairTruncatedJSON (= Gemini 응답 잘림 복구) = 삭제 (= 사용처 0)
 */
export async function generateRecommendations(skeleton: AG1Output): Promise<PlaceResult[]> {
  const cityCheck = await isCityReady(skeleton.formData.destination);

  if (!cityCheck.ready) {
    console.error(`[AG2] ❌ city='${cityCheck.cityName}' MIX 모드 = ag2 처리 X (= ${cityCheck.count} rows < ${READY_THRESHOLD}) = MIX path = pipeline-v3.ts step1_geminiItinerary 표준 prompt 사용`);
    throw new Error(`MIX_MODE_DISABLED: '${cityCheck.cityName}' 미발굴 도시 = ag2 처리 X (= 사용자 SSOT 2026-05-24)`);
  }

  console.log(`[AG2] ✅ city='${cityCheck.cityName}' (id=${cityCheck.cityId}) ready=true (${cityCheck.count} rows ≥ ${READY_THRESHOLD}) → DB-only`);
  // ⚠️ 수정금지(승인필요) 2026-05-24 = isCityReady 결과 전달 = findCityUnified 2 회 호출 회피
  const dbResults = await fetchFromPlaceSeedRaw(skeleton, { cityId: cityCheck.cityId!, name: cityCheck.cityName });
  return dbResults || [];
}

