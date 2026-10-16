/** ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = AG2 = DB-only 단일 진입점 */

import type { PlaceResult, SeedCategory } from "./types";
// ⚠️ 수정금지(승인필요) 2026-10-16 = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage } from "../shared/place-image";
// ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 의도 = AG2 데이터 출처 = place_seed_raw 우선
import { db } from "../../db";
import { findHub, hubReadiness } from "../shared/city-hub";
import { VIBE_PRIMARY_CATEGORY } from "@shared/vibe-category";

// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 도시 입력 시점 분기 = 손님상 120곳 이상 + 베스트면 DB-only, 미달이면 MIX(기준 = pool-radius 1벌) (정본 §)
export async function isCityReady(
  destination: string,
  // ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 출발점 좌표(없으면 이름)로 거점 폴더를 찾고 준비됨은 그 출발점 풀 기준 (정본 §)
  destinationCoords?: { lat: number; lng: number } | null,
  countryCode?: string | null,
): Promise<{
  ready: boolean;
  cityId: number | null;
  cityName: string;
  count: number;
  latitude: number | null;
  longitude: number | null;
}> {
  if (!db)
    return {
      ready: false,
      cityId: null,
      cityName: destination,
      count: 0,
      latitude: null,
      longitude: null,
    };

  const cityResult = await findHub(db, {
    input: destination,
    coords: destinationCoords,
    countryCode,
  });
  const cityId = cityResult?.cityId;
  if (!cityResult || !cityId) {
    return {
      ready: false,
      cityId: null,
      cityName: destination,
      count: 0,
      latitude: null,
      longitude: null,
    };
  }

  const { ready, count } = await hubReadiness(
    db,
    cityResult,
    destinationCoords,
  );
  // ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 준비됨 판정 = 출발점 반경 100km 풀 기준(소속 도시 무관) = 서빙 풀과 같은 기준 (정본 §)
  return {
    ready,
    cityId,
    cityName: cityResult.name,
    count,
    latitude: cityResult.latitude ?? null,
    longitude: cityResult.longitude ?? null,
  };
}

// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인 = AG2-DB는 place_seed_raw 직접 SELECT(외부 API 호출 0, 미발굴 도시는 Gemini fallback), VIBE_PRIMARY_CATEGORY는 vibe-category.ts 1벌 재수출(§16)
export { VIBE_PRIMARY_CATEGORY } from "@shared/vibe-category";

// 🧠 2026-07-05 사장님 SSOT = vibe → 6카테고리 슬롯 분배 = 단일 SSOT(§16 재발명금지). DB-only(fetchFromPlaceSeedRaw)와 MIX(pipeline-v3 프롬프트) 공용.
export function computeCatSlots(
  vibeWeights: readonly { vibe: string; weight: number }[],
  totalSlots: number,
  dayCount: number,
): Record<string, number> {
  const catSlots: Record<string, number> = {};
  for (const vw of vibeWeights) {
    const primary = VIBE_PRIMARY_CATEGORY[vw.vibe] || "attraction";
    catSlots[primary] = (catSlots[primary] || 0) + vw.weight * totalSlots;
  }
  const restaurantCap = dayCount * 2;
  if (!catSlots.restaurant || catSlots.restaurant < dayCount) {
    catSlots.restaurant = Math.min(restaurantCap, Math.ceil(totalSlots * 0.4));
  }
  if (catSlots.restaurant > restaurantCap) {
    const overflow = catSlots.restaurant - restaurantCap;
    catSlots.restaurant = restaurantCap;
    const nr = Object.keys(catSlots).filter((k) => k !== "restaurant");
    const nrTotal = nr.reduce((s, k) => s + (catSlots[k] || 0), 0) || 1;
    for (const k of nr)
      catSlots[k] = (catSlots[k] || 0) + overflow * (catSlots[k] / nrTotal);
  }
  const nonRest = Object.keys(catSlots).filter((k) => k !== "restaurant");
  const nonRestSum = nonRest.reduce((s, k) => s + (catSlots[k] || 0), 0);
  const targetNonRest = totalSlots - catSlots.restaurant;
  if (nonRestSum > 0) {
    for (const k of nonRest)
      catSlots[k] = Math.round(
        ((catSlots[k] || 0) / nonRestSum) * targetNonRest,
      );
  }
  for (const k of Object.keys(catSlots))
    catSlots[k] = Math.max(1, Math.round(catSlots[k]));
  const sum = Object.values(catSlots).reduce((s, n) => s + n, 0);
  if (sum !== totalSlots) {
    const top = Object.entries(catSlots).sort((a, b) => b[1] - a[1])[0][0];
    catSlots[top] += totalSlots - sum;
  }
  return catSlots;
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = DB 행 → 화면이 아는 장소 모양 변환 1벌(§16) = DB-only·베스트 두 길이 같은 함수를 쓴다
export function dbRowToPlace(
  r: any,
  imagePidMap: Map<string, string>,
  destination: string,
): PlaceResult {
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
    // ⚠️ 수정금지(승인필요) 2026-05-20 = pickPlaceImage 단일 SSOT (= Google 1 > 2026-08-18 PID공유 폴백)
    image: pickPlaceImage(r, imagePidMap),
    priceEstimate: r.priceEur ? `€${r.priceEur}` : "",
    estimatedPriceEur: r.priceEur ?? undefined,
    bestRank: r.bestRank ?? null,
    seedCategory: r.seedCategory as SeedCategory,
    placeTypes: isFood ? ["restaurant"] : [],
    recommendedTime: "afternoon",
    city: destination,
    region: "",
    // ⚠️ 수정금지(승인필요) 2026-05-20 = DB google_maps_uri (= cid URL) 직접 사용 (= 100% 정확)
    googleMapsUrl: r.googleMapsUri || "",
    googleMapsUri: r.googleMapsUri || "",
    userRatingCount: r.googleReviewCount || 0,
    // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E = dayZone 매핑
    dayZone: r.dayZone ?? null,
    nameKo: r.nameKo ?? null,
    nameLocal: r.nameLocal ?? null,
    address: r.address ?? null,
    summaryKo: r.summaryKo ?? null,
    editorialSummary: r.editorialSummary ?? null,
  } as any;
}
