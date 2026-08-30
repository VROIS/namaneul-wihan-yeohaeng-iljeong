import {
  PACE_CONFIG,
  PSR_TIER_OFFSET,
  RANK_FALLBACK,
  type PlaceResult,
  type TravelPace,
  type CurationFocus,
  type Vibe,
} from "./types";

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

export async function calculateRestaurantScore(
  place: PlaceResult,
): Promise<number> {
  const rank = place.rank ?? RANK_FALLBACK;
  const tierRank = rank - getTierOffset(rank);
  return Math.max(0, Math.min(10, 11 - tierRank));
}

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

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

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

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 점수 시스템 완전 폐기

export async function getRealityCheckForCity(
  _destination: string,
): Promise<{ weather: string; crowd: string; status: string }> {
  return { weather: "Sunny", crowd: "Medium", status: "Open" };
}

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

  if (place.estimatedPriceEur !== undefined && place.estimatedPriceEur > 0) {
    reasons.push(`약 EUR${Math.round(place.estimatedPriceEur)}`);
    dataPoints += 1;
  }

  if (place.personaFitReason && reasons.length < 4) {
    reasons.push(place.personaFitReason);
  }

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
