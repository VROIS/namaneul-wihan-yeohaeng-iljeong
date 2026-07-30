/**
 * ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = AG2 = DB-only 단일 진입점
 *
 * AG2: place_seed_raw 직접 SELECT (= Gemini 호출 0)
 * = ready=true (= 전체 행수 ≥ 300) → fetchFromPlaceSeedRaw 반환
 * = ready=false → throw MIX_MODE_DISABLED (= MIX path = pipeline-v3.ts step1_geminiItinerary 표준 prompt 사용)
 */

import type { AG1Output, PlaceResult, SeedCategory } from "./types";
import { MEAL_BUDGET } from "./types";
// ⚠️ 수정금지(승인필요) 2026-05-20 = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage } from "../shared/place-image";
// ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 의도 = AG2 데이터 출처 = place_seed_raw 우선
import { db } from "../../db";
import { placeSeedRaw } from "@shared/schema";
import { eq, and, between, sql } from "drizzle-orm";
import { findCityUnified } from "../city-resolver";
// ⚠️ 2026-07-17 사장님 확정 = 슬롯 풀 = (city_id=요청도시) ∪ (중심 100km) 합집합 = shared/pool-radius 단일 SSOT(§16)
import { getPoolContext, recalcCrossCityZone } from "../shared/pool-radius";

/**
 * ⚠️ 수정금지(승인필요) 2026-05-07 = 사용자 명시 = 도시 입력 시점 분기 (백엔드만)
 * 도시 ready 판정 = 발굴 도시인지 미발굴 도시인지
 * = 발굴 (= place_seed_raw 전체 행수 ≥ 300) → DB-only 경로
 * = 미발굴 → Gemini + Google fallback + auto-learn 저장 (= Geneva 패턴)
 *
 * 🧠 2026-07-05 사장님 SSOT = 임계값 = 전체 행수 300 (= 도시특성 반영: 뮌헨 vs 보르도 식당 부족 차이가
 *   후보군 포함 발굴 결과에 나타남 = 보통 완성도시는 300 이상). 옛 "rank 1-20 ≥ 70"(2026-05-07) 폐기(§19)
 *   = rank 조건 제거 = place_seed_raw 의 city_id 별 전체 행수로 판정 (= 복잡할 이유 없음, 사장님 명시).
 * 프론트 UI 노출 X (= 사용자 명시 = 별도 안내 페이지 존재)
 */
// ⚠️ export 이유(2026-07-30) = 여정 플래너 상단 도시버튼(GET /api/cities/ready)이 **같은 기준 1벌**을 써야 함(§16).
//   숫자를 그쪽에 다시 적으면 두 벌이 되어 기준이 갈린다.
export const READY_THRESHOLD = 300;

export async function isCityReady(
  destination: string,
  // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 도시중심좌표(불변키) = ready 판정(DB-only vs MIX 라우팅)도 좌표 우선.
  //   = "본느"≠"본" 이름실패로 ready=false→MIX→재발굴 사고 근본. 좌표10m 로 기존도시 잡으면 ready 판정 정확.
  destinationCoords?: { lat: number; lng: number } | null,
): Promise<{
  ready: boolean;
  cityId: number | null;
  cityName: string;
  count: number;
}> {
  if (!db)
    return { ready: false, cityId: null, cityName: destination, count: 0 };

  const cityResult = await findCityUnified(destination, destinationCoords);
  const cityId = cityResult?.cityId;
  if (!cityId) {
    return { ready: false, cityId: null, cityName: destination, count: 0 };
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = collection_phase 완전 폐기 (= 같은 장소 = 다른 phase = 같은 데이터)
  // 🧠 2026-07-05 사장님 SSOT = 전체 행수 COUNT (= 후보군 포함). 옛 rank 1-20 제한(2026-05-07) 폐기(§19) = 도시특성이 전체 발굴량에 반영됨.
  const countRows = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, cityId));
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
// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Romantic 모든 흔적 삭제 + Shopping 1:1 매핑
// = PSR seedCategory 7 종과 1:1 직접 대응 (= 가짜 매핑 X)
export const VIBE_PRIMARY_CATEGORY: Record<string, string> = {
  Foodie: "restaurant", // = 내부 식당태그 유지(버튼 X)
  Healing: "healing",
  Hotspot: "hotspot",
  Adventure: "adventure",
  Shopping: "shopping",
  Culture: "heritage",
  Attraction: "attraction", // = 즐길거리(신규 버튼) → 테마파크·유람선·아쿠아리움·체험전시
};

// 🧠 2026-07-05 사장님 SSOT = vibe → 6카테고리 슬롯 분배 = 단일 SSOT(§16 재발명금지). DB-only(fetchFromPlaceSeedRaw)와 MIX(pipeline-v3 프롬프트) 공용.
//   = 옛날엔 이 로직이 ag2 안에 인라인이라 MIX 가 못 씀 → 순수함수 추출 = DB-only 동작 불변(내부이동) + MIX 가 카테고리별 개수를 Gemini 에 전달 가능.
//   = 식당 cap(일자×2 = 점심+저녁), 비식당 vibe 비율 재조정, 정수화·합계보정 = 기존 로직 그대로.
export function computeCatSlots(
  // 🧠 2026-07-05 = readonly + 구조적 최소필드(vibe/weight) = VibeWeight[](percentage 초과필드·Vibe→string 넓힘)를 캐스트 없이 수용 = 호출부 `as any` 제거
  vibeWeights: readonly { vibe: string; weight: number }[],
  totalSlots: number,
  dayCount: number,
): Record<string, number> {
  const catSlots: Record<string, number> = {};
  for (const vw of vibeWeights) {
    const primary = VIBE_PRIMARY_CATEGORY[vw.vibe] || "attraction";
    catSlots[primary] = (catSlots[primary] || 0) + vw.weight * totalSlots;
  }
  // 식당 = 2/일자 cap (= 점심 1 + 저녁 1)
  const restaurantCap = dayCount * 2;
  if (!catSlots.restaurant || catSlots.restaurant < dayCount) {
    catSlots.restaurant = Math.min(restaurantCap, Math.ceil(totalSlots * 0.4));
  }
  // 식당 cap 적용 (= 초과 분 = 비식당 으로 재분배)
  if (catSlots.restaurant > restaurantCap) {
    const overflow = catSlots.restaurant - restaurantCap;
    catSlots.restaurant = restaurantCap;
    const nr = Object.keys(catSlots).filter((k) => k !== "restaurant");
    const nrTotal = nr.reduce((s, k) => s + (catSlots[k] || 0), 0) || 1;
    for (const k of nr)
      catSlots[k] = (catSlots[k] || 0) + overflow * (catSlots[k] / nrTotal);
  }
  // 비식당 비율 재조정 (= 식당 정해진 후, 나머지 = 사용자 vibe 비율)
  const nonRest = Object.keys(catSlots).filter((k) => k !== "restaurant");
  const nonRestSum = nonRest.reduce((s, k) => s + (catSlots[k] || 0), 0);
  const targetNonRest = totalSlots - catSlots.restaurant;
  if (nonRestSum > 0) {
    for (const k of nonRest)
      catSlots[k] = Math.round(
        ((catSlots[k] || 0) / nonRestSum) * targetNonRest,
      );
  }
  // 정수화 + 합계 보정
  for (const k of Object.keys(catSlots))
    catSlots[k] = Math.max(1, Math.round(catSlots[k]));
  const sum = Object.values(catSlots).reduce((s, n) => s + n, 0);
  if (sum !== totalSlots) {
    const top = Object.entries(catSlots).sort((a, b) => b[1] - a[1])[0][0];
    catSlots[top] += totalSlots - sum;
  }
  return catSlots;
}

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
    // ⚠️ 2026-07-08 사장님 SSOT = 좌표(불변키) 전달 = 중복도시·재발굴 차단.
    const cityResult = await findCityUnified(
      formData.destination,
      formData.destinationCoords,
    );
    cityId = cityResult?.cityId;
    cityName = cityResult?.name ?? formData.destination;
    if (!cityId) {
      console.log(
        `[AG2-DB] 도시 "${formData.destination}" 미발견 = Gemini fallback`,
      );
      return null;
    }
  }
  // ⚠️ 2026-07-17 사장님 확정 = 풀 컨텍스트(중심좌표 + 합집합 WHERE) 1회 확보 = 아래 카테고리별 SELECT 공용
  const cid: number = cityId;
  // 2026-07-17 = 기점 = 동적 출발점(숙소 입력 시 그 좌표 = 이중도시·숙소중간 100km 공유). 미입력 = getPoolContext 가 도시중심 폴백.
  const { center, where: poolWhere } = await getPoolContext(
    cid,
    (formData as any).accommodationCoords ?? null,
  );

  // 🧠 2026-07-05 사장님 SSOT = vibe → 카테고리 슬롯 분배 = computeCatSlots 단일 SSOT(§16). 옛 인라인 계산 폐기(§19) = 로직 그대로 함수로 이동(DB-only 동작 불변).
  const totalSlots = requiredPlaceCount;
  const dayCount = skeleton.dayCount || skeleton.daySlotsConfig?.length || 3;
  const catSlots = computeCatSlots(vibeWeights, totalSlots, dayCount);

  console.log(
    `[AG2-DB] 도시 "${cityName}" (id=${cityId}) 카테고리 슬롯:`,
    catSlots,
  );

  // ⚠️ 수정금지(승인필요) 2026-05-19 = budget 매트릭스 (= 4:6 split)
  // 식당 = travelStyle MEAL_BUDGET tier 별 price_eur 범위로 필터 = rank 제한 X
  // 비식당 = rank 1-20 유지 (= FE 우선 노출 순위)
  const budgetTier = MEAL_BUDGET[formData.travelStyle];
  console.log(
    `[AG2-DB] travelStyle=${formData.travelStyle} = price €${budgetTier.min}-${budgetTier.max} (lunch ≤€${budgetTier.lunch} / dinner ≤€${budgetTier.dinner})`,
  );

  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-1 = dayZone 균등 (= 사용자 SSOT)
  // 식당 = budget WHERE + dayZone 균등 (= core 4 + outskirt 2 = 일자별 zone 매칭 자동)
  const SELECT_COLS = {
    id: placeSeedRaw.id,
    // ⚠️ 2026-07-17 = cityId 프로젝션 추가 = 크로스도시 행 판별(zone 재계산·로그) 용
    cityId: placeSeedRaw.cityId,
    nameEn: placeSeedRaw.nameEn,
    nameKo: placeSeedRaw.nameKo,
    // ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT = nameLocal (= buildRouteInputJson `name_local` 정확 inject)
    nameLocal: placeSeedRaw.nameLocal,
    googlePlaceId: placeSeedRaw.googlePlaceId,
    googleMapsUri: placeSeedRaw.googleMapsUri,
    address: placeSeedRaw.address,
    latitude: placeSeedRaw.latitude,
    longitude: placeSeedRaw.longitude,
    imageUrl: placeSeedRaw.imageUrl, // ⚠️ 2026-06-11 = image_url(구글 PM) 1종
    summaryKo: placeSeedRaw.summaryKo,
    editorialSummary: placeSeedRaw.editorialSummary,
    seedCategory: placeSeedRaw.seedCategory,
    rank: placeSeedRaw.rank,
    googleReviewCount: placeSeedRaw.googleReviewCount,
    priceEur: placeSeedRaw.priceEur,
    dayZone: placeSeedRaw.dayZone,
    // = distanceKmFromCenter 2026-05-28 제거 = PlaceResult 매핑 X = 데드 컬럼 (= ag3/place-upsert 별도 SELECT)
  };

  // ⚠️ 수정금지(승인필요) 2026-07-17 사장님 확정 = 식당 + 비식당 = 합집합 풀 + 유효 zone 분리 통합 헬퍼(§16 pool-radius)
  // = 풀 = (city_id=요청도시) ∪ (좌표 유효 100km 이내) = 순수 확장(자기도시 행 손실 0) = 장소는 글로벌(도시번호 소유 아님)
  // = 크로스도시 행 day_zone = 요청 도시 중심 기준 메모리 재계산(core ≤10km / outskirt 10~100km) = DB 쓰기 절대 없음
  // = 자기도시 행 = 저장 day_zone 그대로 + zone NULL 행 풀 제외(기존 동작 보존)
  // = core 2/3 + outskirt 1/3 (= 사용자 SSOT = AG3 Day 2 outskirt pool 확보)
  // = 정렬 = 식당 RC DESC NULLS LAST(2026-06-02 SSOT 유지) / 비식당 rank ASC NULLS LAST + 동순위 RC DESC(크로스도시 rank 혼합 대비)
  const selectByDayZone = async (cat: string, slots: number) => {
    const isRestaurant = cat === "restaurant";
    const coreSlots = Math.ceil(slots * (2 / 3));
    const outskirtSlots = slots - coreSlots;
    const baseWhere = [poolWhere, eq(placeSeedRaw.seedCategory, cat)];
    if (isRestaurant)
      baseWhere.push(
        between(placeSeedRaw.priceEur, budgetTier.min, budgetTier.max),
      );
    const rows: any[] = await db!
      .select(SELECT_COLS)
      .from(placeSeedRaw)
      .where(and(...baseWhere));
    for (const r of rows) recalcCrossCityZone(r, cid, center);
    const rc = (r: any) => r.googleReviewCount ?? -1;
    rows.sort(
      isRestaurant
        ? (a, b) => rc(b) - rc(a)
        : (a, b) =>
            (a.rank ?? Number.MAX_SAFE_INTEGER) -
              (b.rank ?? Number.MAX_SAFE_INTEGER) || rc(b) - rc(a),
    );
    const coreRows = rows
      .filter((r) => r.dayZone === "core")
      .slice(0, coreSlots);
    const outskirtRows = rows
      .filter((r) => r.dayZone === "outskirt")
      .slice(0, outskirtSlots);
    const picked = [...coreRows, ...outskirtRows];
    const crossCount = picked.filter((r) => r.cityId !== cid).length;
    const budgetLabel = isRestaurant
      ? ` (budget €${budgetTier.min}-${budgetTier.max})`
      : " (rank ASC)";
    console.log(
      `[AG2-DB] ${cat}: core ${coreRows.length}/${coreSlots} + outskirt ${outskirtRows.length}/${outskirtSlots}${budgetLabel}${crossCount ? ` [크로스도시 ${crossCount}곳 포함]` : ""}`,
    );
    return picked;
  };

  const allRows: any[] = [];
  try {
    const queries = Object.entries(catSlots)
      .filter(([_, slots]) => slots > 0)
      .map(([cat, slots]) => selectByDayZone(cat, slots));
    const results = await Promise.all(queries);
    for (const rows of results) allRows.push(...rows);
  } catch (e: any) {
    console.error(`[AG2-DB] ❌ SELECT 실패:`, e.message);
    return null;
  }

  // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 부족해도 그대로 반환 (= Gemini fallback X)
  // = 빈 슬롯 가능 = 사용자 표시 = 솔직 (= 환각 채움 X)
  console.log(
    `[AG2-DB] 행 수 = ${allRows.length}/${totalSlots} (= 부족해도 그대로 반환)`,
  );

  // PlaceResult 형식 변환 (= AG3 호환)
  const places: PlaceResult[] = allRows.map((r: any, i: number) => {
    const isFood = r.seedCategory === "restaurant";
    return {
      id: `db-${r.id}`,
      name: r.nameEn || "",
      geminiPlaceId: r.googlePlaceId || "",
      geminiAddress: r.address || "",
      description: r.summaryKo || r.editorialSummary || "",
      lat: parseFloat(String(r.latitude)) || 0,
      lng: parseFloat(String(r.longitude)) || 0,
      // ⚠️ 수정금지(승인필요) 2026-05-24 = PSR.rank 단일 SSOT
      rank: r.rank,
      sourceType: "DB Direct (Place Seed Raw)",
      personaFitReason: r.summaryKo || "",
      tags: isFood ? ["restaurant", "food"] : [],
      vibeTags: isFood ? ["Foodie" as const] : [],
      // ⚠️ 수정금지(승인필요) 2026-05-20 = pickPlaceImage 단일 SSOT (= Google 1 > WK 2)
      image: pickPlaceImage(r),
      priceEstimate: r.priceEur ? `€${r.priceEur}` : "",
      estimatedPriceEur: r.priceEur ?? undefined,
      seedCategory: r.seedCategory as SeedCategory,
      placeTypes: isFood ? ["restaurant"] : [],
      recommendedTime: "afternoon",
      city: formData.destination,
      region: "",
      // ⚠️ 수정금지(승인필요) 2026-05-20 = DB google_maps_uri (= cid URL) 직접 사용 (= 100% 정확)
      googleMapsUrl: r.googleMapsUri || "",
      googleMapsUri: r.googleMapsUri || "",
      userRatingCount: r.googleReviewCount || 0,
      // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E = dayZone 매핑
      dayZone: r.dayZone ?? null,
      // = types.ts PlaceResult 5 신규 필드 매핑 (= 결함 5 해소 = ag4 활동 카피/주소)
      nameKo: r.nameKo ?? null,
      nameLocal: r.nameLocal ?? null,
      address: r.address ?? null,
      summaryKo: r.summaryKo ?? null,
      editorialSummary: r.editorialSummary ?? null,
    } as any;
  });
  console.log(
    `[AG2-DB] ✅ DB 직접 = ${places.length}곳 (${Date.now() - _t0}ms, Gemini X, Google X)`,
  );
  return places;
}

/**
 * ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = AG2 메인 = DB-only 단일 분기
 *
 * 분기:
 * - ready=true (= 전체 행수 ≥ 300) → fetchFromPlaceSeedRaw 결과 그대로 반환 (= Gemini 0)
 * - ready=false → throw MIX_MODE_DISABLED (= MIX path = pipeline-v3.ts step1_geminiItinerary 처리)
 */
export async function generateRecommendations(
  skeleton: AG1Output,
): Promise<PlaceResult[]> {
  // ⚠️ 2026-07-08 사장님 SSOT = 좌표(불변키) 전달 = DB-only↔MIX 예외없이 모두 좌표 우선.
  const cityCheck = await isCityReady(
    skeleton.formData.destination,
    skeleton.formData.destinationCoords,
  );

  if (!cityCheck.ready) {
    console.error(
      `[AG2] ❌ city='${cityCheck.cityName}' MIX 모드 = ag2 처리 X (= ${cityCheck.count} rows < ${READY_THRESHOLD}) = MIX path = pipeline-v3.ts step1_geminiItinerary 표준 prompt 사용`,
    );
    throw new Error(
      `MIX_MODE_DISABLED: '${cityCheck.cityName}' 미발굴 도시 = ag2 처리 X (= 사용자 SSOT 2026-05-24)`,
    );
  }

  console.log(
    `[AG2] ✅ city='${cityCheck.cityName}' (id=${cityCheck.cityId}) ready=true (${cityCheck.count} rows ≥ ${READY_THRESHOLD}) → DB-only`,
  );
  // ⚠️ 수정금지(승인필요) 2026-05-24 = isCityReady 결과 전달 = findCityUnified 2 회 호출 회피
  const dbResults = await fetchFromPlaceSeedRaw(skeleton, {
    cityId: cityCheck.cityId!,
    name: cityCheck.cityName,
  });
  return dbResults || [];
}
