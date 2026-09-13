// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 창고·매칭용 거리 계산(평면 근사식) 1벌(§16) = 사본 3벌(pool-radius·recognize-place·gmaps-shared) 폐기 §19. 아무것도 import 하지 않는다 = DB 없는 창고 도구·스크립트도 그대로 부른다.
//   ⚠️ 여정 엔진의 haversineKm(agents/transit-haversine.ts = 진짜 구면식)과는 **쓰는 곳이 다른 별개의 식**이다 = 합치지 말 것(합치면 이동시간이 달라진다).
export function distanceKmFromCoords(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const dLat = (latA - latB) * 111320;
  const dLng =
    (lngA - lngB) * 111320 * Math.cos((((latA + latB) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng) / 1000;
}

/** 같은 계산을 미터로. */
export const distanceMetersFromCoords = (
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number => Math.round(distanceKmFromCoords(latA, lngA, latB, lngB) * 1000);
