import { haversineKm } from "../agents/transit-haversine";
import type { PlaceResult } from "./types";

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 동선 = "출발지 + N waypoint + 도착지"

export function _hasValidCoord(p: { lat: number; lng: number }): boolean {
  return p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng);
}

export function optimizeDayRoute(
  dayPlaces: PlaceResult[],
  departureCoords?: { lat: number; lng: number },
  returnCoords?: { lat: number; lng: number }, // 미지정 시 = 출발지 = 호텔 cycle
): PlaceResult[] {
  if (dayPlaces.length <= 2) return dayPlaces;

  const valid = dayPlaces.filter(_hasValidCoord);
  const invalid = dayPlaces.filter((p) => !_hasValidCoord(p));
  if (invalid.length > 0) {
    console.warn(
      `[RouteOpt] ⚠️ NULL 좌표 ${invalid.length}곳 = optimize 제외 + 마지막 배치: ${invalid.map((p) => p.name).join(", ")}`,
    );
  }
  if (valid.length <= 1) return [...valid, ...invalid];

  const start =
    departureCoords && _hasValidCoord(departureCoords)
      ? departureCoords
      : { lat: valid[0].lat, lng: valid[0].lng };
  const end =
    returnCoords && _hasValidCoord(returnCoords) ? returnCoords : start;

  const remaining = [...valid];
  const optimized: PlaceResult[] = [];
  let current = start;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(
        current.lat,
        current.lng,
        remaining[i].lat,
        remaining[i].lng,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    optimized.push(remaining[nearestIdx]);
    current = {
      lat: remaining[nearestIdx].lat,
      lng: remaining[nearestIdx].lng,
    };
    remaining.splice(nearestIdx, 1);
  }

  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (let i = 0; i < optimized.length - 1; i++) {
      for (let j = i + 2; j < optimized.length; j++) {
        const jNext =
          j + 1 < optimized.length
            ? { lat: optimized[j + 1].lat, lng: optimized[j + 1].lng }
            : end; // 종점 = 도착지 anchor
        const d1 = haversineKm(
          optimized[i].lat,
          optimized[i].lng,
          optimized[i + 1].lat,
          optimized[i + 1].lng,
        );
        const d2 = haversineKm(
          optimized[j].lat,
          optimized[j].lng,
          jNext.lat,
          jNext.lng,
        );
        const newD1 = haversineKm(
          optimized[i].lat,
          optimized[i].lng,
          optimized[j].lat,
          optimized[j].lng,
        );
        const newD2 = haversineKm(
          optimized[i + 1].lat,
          optimized[i + 1].lng,
          jNext.lat,
          jNext.lng,
        );
        if (newD1 + newD2 < d1 + d2) {
          const segment = optimized.slice(i + 1, j + 1).reverse();
          optimized.splice(i + 1, j - i, ...segment);
          improved = true;
        }
      }
    }
  }

  if (iterations > 1) {
    console.log(
      `[RouteOpt] 2-opt 개선 ${iterations}회 반복 (= Haversine + ${start.lat.toFixed(3)},${start.lng.toFixed(3)} 출발 / ${end.lat.toFixed(3)},${end.lng.toFixed(3)} 귀환)`,
    );
  }

  return [...optimized, ...invalid];
}
