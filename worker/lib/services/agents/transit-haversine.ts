// ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 두 점 직선 거리 계산은 shared/geo 1벌을 가져다 쓴다 (정본 §)
import { haversineKm } from "@shared/geo";

export type TravelMode = "WALK" | "TRANSIT" | "DRIVE";

/** = DRIVE = 도심반경 10km 이내 30km/h · 밖 70km/h (2026-07-04 사장님 SSOT, TomTom/Sanef 실측 기반 리서치 확정). */
const AVG_SPEED_KMH: Record<Exclude<TravelMode, "DRIVE">, number> = {
  WALK: 5,
  TRANSIT: 25,
};
const CITY_RADIUS_KM = 10;
const DRIVE_URBAN_KMH = 30;
const DRIVE_SUBURBAN_KMH = 70;

const COST_PER_KM_EUR: Record<TravelMode, number> = {
  WALK: 0,
  TRANSIT: 0.15,
  DRIVE: 0.5,
};

const BASE_FARE_EUR: Record<TravelMode, number> = {
  WALK: 0,
  TRANSIT: 2,
  DRIVE: 0,
};

/** ⚠️ 2026-07-06 사장님 SSOT = 대중교통 구간당 균일 예상가 = 단일 SSOT(§16). */
export function estimateTransitCost(mode: string): number {
  switch (mode) {
    case "walk":
      return 0;
    case "metro":
    case "bus":
    case "RER":
      return 3;
    default:
      return 0;
  }
}

/** ⚠️ 2026-07-06 사장님 SSOT = 거리(km) → 이동수단 결정 = 단일 SSOT(§16). */
export function pickTransitMode(
  km: number,
  isGuide: boolean,
): { mode: "walk" | "metro" | "private_guide"; calc: TravelMode } {
  if (isGuide) return { mode: "private_guide", calc: "DRIVE" };
  if (km <= 1.0) return { mode: "walk", calc: "WALK" };
  return { mode: "metro", calc: "TRANSIT" };
}

export interface TransitResult {
  from: string;
  to: string;
  mode: "walk" | "transit" | "drive";
  modeLabel: string;
  duration: number; // = 분
  durationText: string;
  distance: number; // = 미터
  cost: number; // = EUR / 1 인 단가
  costTotal: number; // = EUR / 그룹 총액 (= cost × companionCount)
}

export { haversineKm };

export function calcTransitHaversine(
  from: { lat: number; lng: number; name?: string },
  to: { lat: number; lng: number; name?: string },
  mode: TravelMode = "WALK",
  companionCount = 1,
  cityCenter?: { lat: number; lng: number },
): TransitResult {
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const meters = Math.round(km * 1000);
  let speedKmh: number;
  if (mode === "DRIVE") {
    if (cityCenter) {
      const midLat = (from.lat + to.lat) / 2;
      const midLng = (from.lng + to.lng) / 2;
      const distFromCenter = haversineKm(
        cityCenter.lat,
        cityCenter.lng,
        midLat,
        midLng,
      );
      speedKmh =
        distFromCenter <= CITY_RADIUS_KM ? DRIVE_URBAN_KMH : DRIVE_SUBURBAN_KMH;
    } else {
      speedKmh = DRIVE_URBAN_KMH;
    }
  } else {
    speedKmh = AVG_SPEED_KMH[mode];
  }
  const durationMin = Math.round((km / speedKmh) * 60);
  const costPerPerson =
    km > 0
      ? Math.round((BASE_FARE_EUR[mode] + km * COST_PER_KM_EUR[mode]) * 100) /
        100
      : 0;
  return {
    from: from.name || "",
    to: to.name || "",
    mode: mode.toLowerCase() as TransitResult["mode"],
    modeLabel:
      mode === "WALK" ? "도보" : mode === "TRANSIT" ? "지하철" : "차량",
    duration: durationMin,
    durationText: `${durationMin}분`,
    distance: meters,
    cost: costPerPerson,
    costTotal: Math.round(costPerPerson * companionCount * 100) / 100,
  };
}
