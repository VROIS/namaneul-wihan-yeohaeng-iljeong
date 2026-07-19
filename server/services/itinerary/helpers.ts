// 공통 헬퍼 함수 모음 = itinerary-generator 분리(2026-07-15 §0 슬림화, 순수 이동)
import {
  PACE_CONFIG,
  PSR_TIER_OFFSET,
  RANK_FALLBACK,
  type PlaceResult,
  type TravelPace,
  type CurationFocus,
  type Vibe,
} from "./types";

// === 인원수 계산 (companionType 기반) ===
export function getCompanionCount(companionType: string): number {
  const mapping: Record<string, number> = {
    Single: 1,
    Couple: 2,
    Family: 4,
    ExtendedFamily: 8, // 대가족 8명 (밴)
    Group: 10, // 친구 10명 (미니버스)
  };
  return mapping[companionType] || 1;
}

/**
 * 장소가 식당/카페인지 확인
 */
export function isFoodPlace(place: PlaceResult): boolean {
  const foodTags = [
    "restaurant",
    "cafe",
    "bakery",
    "food",
    "bar",
    "bistro",
    "brasserie",
  ];
  // ⚠️ vibeTags에 'Foodie'만 있는 것으로 식당 판단 금지!
  // AG2가 vibes에 Foodie 포함 시 관광지에도 Foodie 태그 부여 가능 → 모든 장소가 식당으로 분류되는 버그
  // 대신 tags, placeTypes, 이름으로만 판단 (더 정확)
  const hasFoodTag = place.tags?.some((t) =>
    foodTags.includes(t.toLowerCase()),
  );
  const hasFoodType = place.placeTypes?.some((t) =>
    foodTags.includes(t.toLowerCase()),
  );
  const nameHasFood =
    /레스토랑|식당|카페|비스트로|브라세리|restaurant|cafe|bistro|boulangerie|pâtisserie/i.test(
      place.name,
    );

  return hasFoodTag || hasFoodType || nameHasFood;
}

export function getTierOffset(rank: number): number {
  if (rank >= PSR_TIER_OFFSET.HighEnd + 1) return PSR_TIER_OFFSET.HighEnd;
  if (rank >= PSR_TIER_OFFSET.Reasonable + 1) return PSR_TIER_OFFSET.Reasonable;
  return 0;
}

// 식당 점수 = tier 안 1 등 = 10 점 / 20 등 = 0 점
export async function calculateRestaurantScore(
  place: PlaceResult,
): Promise<number> {
  const rank = place.rank ?? RANK_FALLBACK;
  const tierRank = rank - getTierOffset(rank);
  return Math.max(0, Math.min(10, 11 - tierRank));
}

// ===== PlaceResult → Route Optimizer 호환 변환 =====
// route-optimizer.ts는 Place 타입 (latitude/longitude)을 기대하지만
// itinerary-generator에서는 PlaceResult (lat/lng)를 사용함
export function toRoutablePlace(p: PlaceResult): {
  id: number;
  latitude: number;
  longitude: number;
  name: string;
} {
  return {
    id:
      typeof p.id === "number"
        ? p.id
        : parseInt(p.id) || Math.abs(hashCode(p.id || p.name)),
    latitude: p.lat,
    longitude: p.lng,
    name: p.name,
  };
}

// 문자열 → 숫자 해시 (PlaceResult.id가 문자열일 때)
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

/**
 * 가용 시간으로 슬롯 수 계산
 * @param startTime 시작시간 (HH:MM)
 * @param endTime 종료시간 (HH:MM)
 * @param pace 여행 밀도
 * @returns 슬롯 수
 */
export function calculateSlotsForDay(
  startTime: string,
  endTime: string,
  pace: TravelPace,
): number {
  const config = PACE_CONFIG[pace];

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const availableMinutes = endMinutes - startMinutes;

  if (availableMinutes <= 0) return 0;

  const slots = Math.floor(availableMinutes / config.slotDurationMinutes);
  return Math.min(slots, config.maxSlotsPerDay);
}

/**
 * 분(minutes)을 HH:MM 형식으로 변환
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(Math.min(23, hours)).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function calculateVibeWeights(
  selectedVibes: Vibe[],
  protagonist: CurationFocus,
) {
  if (selectedVibes.length === 0) return [];

  const PRIORITY_WEIGHTS: Record<number, number[]> = {
    1: [100],
    2: [60, 40],
    3: [50, 30, 20],
  };

  const weights = PRIORITY_WEIGHTS[selectedVibes.length] || [50, 30, 20];

  return selectedVibes.map((vibe, index) => ({
    vibe,
    weight: weights[index] / 100,
    percentage: weights[index],
  }));
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = MIX path + 옛 점수 코드 완전 삭제
// = 옛 searchGooglePlaces / isFreePlace / isPackageTourPriceSource / enrichPlacesWith* = 모두 폐기
// = ag2-DB 가 place_seed_raw 직접 SELECT = Google Places / TripAdvisor / Gemini 호출 0
// = DB-only path = pipeline-db-only.ts 단일 분기 (= MIX = ag2:throw MIX_MODE_DISABLED)

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 점수 시스템 완전 폐기
// = VIBE_WEIGHT_MATRIX + DATA_GRADE_ADJUSTMENT + detectDataGrade + calculateDynamicWeights + calculateFinalScore = 모두 삭제
// = PSR.rank 단일 SSOT = ag2-DB 가 카테고리/tier 별 RC DESC 정렬 = 이미 정렬됨
// = AG3 = `finalScore = Math.max(0, 21 - place.rank)` 단순 부여

export async function getRealityCheckForCity(
  _destination: string,
): Promise<{ weather: string; crowd: string; status: string }> {
  return { weather: "Sunny", crowd: "Medium", status: "Open" };
}

/**
 * Phase 1-6: 선정 이유 생성 (최소 2개) + 신뢰도 레벨 판단
 * 데이터 기반 이유 → AI 기반 이유 → 실용적 이유 순으로 채움
 */
export function generateSelectionReasons(place: PlaceResult): {
  reasons: string[];
  confidence: "high" | "medium" | "low" | "minimal";
} {
  const reasons: string[] = [];
  let dataPoints = 0;

  // ⚠️ 수정금지(승인필요) 2026-05-24 = PSR.googleReviewCount = as any (= PlaceResult userRatingCount 옛 폐기 cascade)
  const _p = place as any;
  if (_p.userRatingCount && _p.userRatingCount > 100) {
    const count = _p.userRatingCount;
    const countText =
      count >= 10000
        ? `${(count / 1000).toFixed(0)}K`
        : count >= 1000
          ? `${(count / 1000).toFixed(1)}K`
          : count.toLocaleString();
    reasons.push(`구글 리뷰 ${countText}개`);
    dataPoints += 2;
  }

  // 가격 정보 (= PSR.price_eur 단일 SSOT)
  if (place.estimatedPriceEur !== undefined && place.estimatedPriceEur > 0) {
    reasons.push(`약 EUR${Math.round(place.estimatedPriceEur)}`);
    dataPoints += 1;
  }

  // 페르소나 매칭 이유
  if (place.personaFitReason && reasons.length < 4) {
    reasons.push(place.personaFitReason);
  }

  // 바이브 태그 기반
  if (place.vibeTags && place.vibeTags.length > 0 && reasons.length < 4) {
    const vibeLabels: Record<string, string> = {
      Healing: "힐링",
      Adventure: "모험",
      Hotspot: "핫플",
      Foodie: "미식",
      Shopping: "쇼핑",
      Culture: "문화",
    };
    const tags = place.vibeTags.map((v) => vibeLabels[v] || v).join(", ");
    reasons.push(`${tags} 분위기 매칭`);
  }

  // 최소 2개 보장
  if (reasons.length < 2 && place.description) {
    reasons.push(
      place.description.length > 60
        ? place.description.substring(0, 57) + "..."
        : place.description,
    );
  }
  if (reasons.length < 2) {
    reasons.push("여행 동선 최적화 기반 선정");
  }

  // ===== 신뢰도 레벨 =====
  // high: 3개 이상 데이터 소스 + 한국 인기도 있음
  // medium: 2개 데이터 소스 또는 TripAdvisor 데이터 있음
  // low: 1개 데이터 소스
  // minimal: 데이터 없음, AI 추천만
  let confidence: "high" | "medium" | "low" | "minimal";
  if (dataPoints >= 4) {
    confidence = "high";
  } else if (dataPoints >= 2) {
    confidence = "medium";
  } else if (dataPoints >= 1) {
    confidence = "low";
  } else {
    confidence = "minimal";
  }

  return { reasons: reasons.slice(0, 5), confidence }; // 최대 5개
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = MIX path helper 모두 폐기
// = 옛 getPlaceTypesForVibes / calculatePlaceVibeScore / getPersonaFitReason /
//   mapPlaceTypesToVibes / getPriceEstimate = 모두 삭제

export function calculateDayCount(startDate: string, endDate: string): number {
  console.log(
    `[Itinerary] Date inputs: startDate="${startDate}", endDate="${endDate}"`,
  );
  const start = new Date(startDate);
  const end = new Date(endDate);
  console.log(
    `[Itinerary] Parsed dates: start=${start.toISOString()}, end=${end.toISOString()}`,
  );
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  console.log(`[Itinerary] Calculated dayCount: ${dayCount}`);
  return dayCount;
}

export function groupPlacesByCity(
  places: PlaceResult[],
): Map<string, PlaceResult[]> {
  const cityGroups = new Map<string, PlaceResult[]>();

  for (const place of places) {
    const city = place.city || "Unknown";
    if (!cityGroups.has(city)) {
      cityGroups.set(city, []);
    }
    cityGroups.get(city)!.push(place);
  }

  return cityGroups;
}

export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function optimizeCityOrder(
  cityGroups: Map<string, PlaceResult[]>,
): string[] {
  const cities = Array.from(cityGroups.keys());
  if (cities.length <= 1) return cities;

  const cityCoords = new Map<string, { lat: number; lng: number }>();
  for (const [city, places] of cityGroups) {
    const avgLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
    const avgLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
    cityCoords.set(city, { lat: avgLat, lng: avgLng });
  }

  const ordered: string[] = [cities[0]];
  const remaining = new Set(cities.slice(1));

  while (remaining.size > 0) {
    const lastCity = ordered[ordered.length - 1];
    const lastCoords = cityCoords.get(lastCity)!;

    let nearestCity = "";
    let minDistance = Infinity;

    for (const city of remaining) {
      const coords = cityCoords.get(city)!;
      const dist = calculateDistance(
        lastCoords.lat,
        lastCoords.lng,
        coords.lat,
        coords.lng,
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestCity = city;
      }
    }

    ordered.push(nearestCity);
    remaining.delete(nearestCity);
  }

  return ordered;
}
