// 일별 동선 최적화(nearest-neighbor + 2-opt) = itinerary-generator 분리(2026-07-15 §0 슬림화, 순수 이동)
import { haversineKm } from "../agents/transit-haversine";
import type { PlaceResult } from "./types";

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 동선 = "출발지 + N waypoint + 도착지"
// = 3 fix: (A) Haversine 거리 (= 옛 Euclidean 폐기 = 위도 왜곡 33%)
//          (B) NULL 좌표 행 = 사전 제외 + 마지막 슬롯 배치 (= "999km" 폭탄 0)
//          (C) 출발지 + 도착지 anchor (= 호텔 출발/귀환 cycle = nearest-neighbor start + 2-opt 종점 anchor)
// = Google Routes / Mapbox / or-tools = 외부 호출 0 = 자체 구현

// 🗑️ 2026-07-06 = _haversineKm 로컬정의 삭제 §19 = 공용 haversineKm(transit-haversine.ts) 단일 SSOT(§16) = optimizeDayRoute 순서최적화도 표시계산과 동일 거리함수(route-local 동형). 객체→4arg 호출로 전환.

export function _hasValidCoord(p: { lat: number; lng: number }): boolean {
  return p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng);
}

/**
 * 일별 동선 최적화 = "출발지 + N waypoint + 도착지" 1 회 cycle
 * - NULL 좌표 행 = 사전 제외 + 마지막에 그대로 배치 (= "999km" 폭탄 차단)
 * - nearest-neighbor (출발지 시작) + 2-opt (종점 = 도착지 anchor)
 * - Haversine 거리 = 위도 왜곡 0
 */
export function optimizeDayRoute(
  dayPlaces: PlaceResult[],
  departureCoords?: { lat: number; lng: number },
  returnCoords?: { lat: number; lng: number }, // 미지정 시 = 출발지 = 호텔 cycle
): PlaceResult[] {
  if (dayPlaces.length <= 2) return dayPlaces;

  // === Fix B = NULL 좌표 행 사전 제외 ===
  const valid = dayPlaces.filter(_hasValidCoord);
  const invalid = dayPlaces.filter((p) => !_hasValidCoord(p));
  if (invalid.length > 0) {
    console.warn(
      `[RouteOpt] ⚠️ NULL 좌표 ${invalid.length}곳 = optimize 제외 + 마지막 배치: ${invalid.map((p) => p.name).join(", ")}`,
    );
  }
  if (valid.length <= 1) return [...valid, ...invalid];

  // === Fix C = 출발지/도착지 anchor ===
  const start =
    departureCoords && _hasValidCoord(departureCoords)
      ? departureCoords
      : { lat: valid[0].lat, lng: valid[0].lng };
  const end =
    returnCoords && _hasValidCoord(returnCoords) ? returnCoords : start;

  // nearest-neighbor 시작 = 출발지에서 가장 가까운 행
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

  // === Fix A = 2-opt + Haversine (= 도착지 anchor) ===
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

  // NULL 좌표 행 = 마지막 슬롯 배치 (= 일자 끝 = 호텔 인근)
  return [...optimized, ...invalid];
}
