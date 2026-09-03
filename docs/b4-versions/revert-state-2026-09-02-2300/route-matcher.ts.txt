// ⚠️ 수정금지(승인필요) — 2026-04-30 사용자 SSOT: haversine 좌표 매칭 (Gemini AI 폐기).

export interface GeoPoint {
  id: number;
  latitude: number | null;
  longitude: number | null;
  bestRank?: number | null; // 7자리 언어코드(1 ko·2 en·3 ja·4 fr·5 zh·6 es·7 de)
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

// ⚠️ 수정금지(승인필요) 2026-09-02 사장님 확정 = 동선 위 식당 = 베스트 먼저(같은 근처면 만장일치 우선) (정본 B4)
//   = 거리만 보면 0.3km 에 ★7 이 있는데 ★5 가 뽑힌다(보고타 우사켄 실측).
const NEAR_KM = 1.5;
export function pickRestaurantBySegment<T extends GeoPoint>(
  pool: T[],
  anchorA: T | null | undefined,
  anchorB: T | null | undefined,
  excludeIds: number[] = [],
): T | null {
  if (!anchorA || !anchorB) return null;
  const items = eligible(pool, excludeIds);
  if (!items.length) return null;
  const langs = (b?: number | null) =>
    b
      ? String(b)
          .split("")
          .filter((c) => c !== "0").length
      : 0;
  const dist = new Map<number, number>(
    items.map((p) => [p.id, perpendicularKm(p, anchorA, anchorB)]),
  );
  const nearest = Math.min(...items.map((p) => dist.get(p.id)!));
  // 최근접에서 NEAR_KM 안 = 사실상 같은 자리 = 그 안에서 베스트 언어수로 고른다.
  const near = items.filter((p) => dist.get(p.id)! <= nearest + NEAR_KM);
  const bestLangs = Math.max(...near.map((p) => langs(p.bestRank)));
  const pickFrom =
    bestLangs > 0 ? near.filter((p) => langs(p.bestRank) === bestLangs) : near;
  return pickMin(pickFrom, (p) => dist.get(p.id)!);
}
