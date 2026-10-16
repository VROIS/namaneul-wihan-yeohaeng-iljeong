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

// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 좌표가 절대값 = 행·사진이 붙을 도시 1벌(옮기기 도구·구글맵 사진이 같이 씀) = 지금 도시 중심 100km 안이면 그 도시 · 넘으면 500km 안 가장 가까운 도시 · 없으면 null(삭제) (정본 §)
export const OWN_CITY_KM = 100;
export const MOVE_MAX_KM = 500;
export type CityPoint = { id: number; name?: string; lat: number; lng: number };

export function nearestCity(
  cities: CityPoint[],
  lat: number,
  lng: number,
): { id: number; name?: string; d: number } | null {
  let best: { id: number; name?: string; d: number } | null = null;
  for (const ct of cities) {
    const d = distanceKmFromCoords(ct.lat, ct.lng, lat, lng);
    if (!best || d < best.d) best = { id: ct.id, name: ct.name, d };
  }
  return best;
}

export function cityForCoords(
  cities: CityPoint[],
  lat: number,
  lng: number,
  currentCityId: number,
): number | null {
  const own = cities.find((ct) => ct.id === currentCityId);
  if (own && distanceKmFromCoords(own.lat, own.lng, lat, lng) <= OWN_CITY_KM)
    return currentCityId;
  const n = nearestCity(cities, lat, lng);
  return n && n.d <= MOVE_MAX_KM ? n.id : null;
}

/** 같은 계산을 미터로. */
export const distanceMetersFromCoords = (
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number => Math.round(distanceKmFromCoords(latA, lngA, latB, lngB) * 1000);
