// ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 두 점 직선 거리(km) 계산 1벌 (정본 §)
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 출발점에서 가장 가까운 곳 → 그 곳에서 가장 가까운 곳 … 순서로 한 줄 세운다(되돌아가지 않는 기차 줄) */
export function nearestChain<T extends { lat: number; lng: number }>(
  from: { lat: number; lng: number },
  items: T[],
): T[] {
  const left = [...items];
  const out: T[] = [];
  let cur = from;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++)
      if (
        haversineKm(cur.lat, cur.lng, left[i].lat, left[i].lng) <
        haversineKm(cur.lat, cur.lng, left[bi].lat, left[bi].lng)
      )
        bi = i;
    const [nx] = left.splice(bi, 1);
    out.push(nx);
    cur = nx;
  }
  return out;
}
