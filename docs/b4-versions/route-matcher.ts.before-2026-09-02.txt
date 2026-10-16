// ⚠️ 수정금지(승인필요) — 2026-04-30 사용자 SSOT: haversine 좌표 매칭 (Gemini AI 폐기).

export interface GeoPoint {
  id: number;
  latitude: number | null;
  longitude: number | null;
}

const R_KM = 6371;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  if (
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function perpendicularKm(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  if (
    p.latitude == null ||
    p.longitude == null ||
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  )
    return Number.POSITIVE_INFINITY;

  const dx = b.latitude - a.latitude;
  const dy = b.longitude - a.longitude;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineKm(p, a);

  const t =
    ((p.latitude - a.latitude) * dx + (p.longitude - a.longitude) * dy) / lenSq;
  if (t < 0) return haversineKm(p, a);
  if (t > 1) return haversineKm(p, b);

  return haversineKm(p, {
    id: -1,
    latitude: a.latitude + t * dx,
    longitude: a.longitude + t * dy,
  });
}

function pickMin<T>(items: T[], score: (x: T) => number): T | null {
  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const it of items) {
    const s = score(it);
    if (s < bestScore) {
      best = it;
      bestScore = s;
    }
  }
  return best;
}

function eligible<T extends GeoPoint>(pool: T[], excludeIds: number[]): T[] {
  const exclude = new Set(excludeIds);
  return pool.filter(
    (p) => !exclude.has(p.id) && p.latitude != null && p.longitude != null,
  );
}

export function pickRestaurantBySegment<T extends GeoPoint>(
  pool: T[],
  anchorA: T | null | undefined,
  anchorB: T | null | undefined,
  excludeIds: number[] = [],
): T | null {
  if (!anchorA || !anchorB) return null;
  return pickMin(eligible(pool, excludeIds), (p) =>
    perpendicularKm(p, anchorA, anchorB),
  );
}
