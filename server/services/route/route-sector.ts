import type { PlaceResult } from "../agents/types";
import { haversineKm } from "../agents/transit-haversine";

type LatLng = { lat: number; lng: number };

// ⚠️ 2026-07-21 사장님 SSOT = NEAR_KM(붙은곳 회피)·CITY_KM·CITY_BONUS(도심날 +1 편중) 폐기(§19) = 도심 편중·회피 연쇄가

const hasCoord = (p: { lat?: number | null; lng?: number | null }): boolean =>
  p.lat != null && p.lng != null && p.lat !== 0 && p.lng !== 0;

const distFrom = (p: PlaceResult, c: LatLng) =>
  haversineKm(c.lat, c.lng, p.lat, p.lng);

function nnFromFarthest(pts: PlaceResult[], center: LatLng): PlaceResult[] {
  if (pts.length <= 1) return [...pts];
  let start = pts[0],
    sd = -1;
  for (const p of pts) {
    const d = distFrom(p, center);
    if (d > sd) {
      sd = d;
      start = p;
    }
  }
  const rem = pts.filter((p) => p !== start);
  const ord = [start];
  let cur: LatLng = start;
  while (rem.length) {
    let bi = 0,
      bd = Infinity;
    for (let i = 0; i < rem.length; i++) {
      const d = haversineKm(cur.lat, cur.lng, rem[i].lat, rem[i].lng);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    ord.push(rem[bi]);
    cur = rem[bi];
    rem.splice(bi, 1);
  }
  return ord;
}

export function sectorIntoDays(
  items: PlaceResult[],
  slotsPerDay: number[],
  center: LatLng,
): PlaceResult[][] {
  const pts = items.filter(hasCoord);
  const k = slotsPerDay.length;
  if (k <= 1) return [pts];
  if (pts.length <= k)
    return Array.from({ length: k }, (_, i) => (pts[i] ? [pts[i]] : []));

  const chain = nnFromFarthest(pts, center);
  const n = chain.length;

  // ⚠️ 2026-07-04 사장님 SSOT = 후보 총량이 목표(Σ slotsPerDay)보다 부족할 때, 마지막 날에 부족분이 몰리는 결함 수정(§0).
  const totalDemand = slotsPerDay.reduce((s, v) => s + Math.max(1, v), 0);
  const shortage = Math.max(0, totalDemand - n);
  const effectiveSlots =
    shortage === 0
      ? slotsPerDay
      : (() => {
          const arr = slotsPerDay.map((v) => Math.max(1, v));
          let remain = shortage;
          while (remain > 0) {
            const maxIdx = arr.reduce((mi, v, i) => (v > arr[mi] ? i : mi), 0);
            if (arr[maxIdx] <= 1) break; // 모든 Day가 최소 1까지 내려가면 중단(0개 Day 방지)
            arr[maxIdx] -= 1;
            remain -= 1;
          }
          return arr;
        })();

  // ② 절단 = 각 Day 에 정확히 effectiveSlots[d] 곳씩 배분 (= 사장님 SSOT 2026-07-21 "슬롯수대로 균등배분").
  const perDay = effectiveSlots.map((v) => Math.max(1, v)); // 각 Day 목표 활동수
  let surplus = n - perDay.reduce((s, v) => s + v, 0); // 활동 > Σ슬롯 이면 잔여 발생
  for (let d = 0; surplus > 0; d = (d + 1) % k) {
    perDay[d] += 1; // 잔여를 앞 Day 부터 1개씩 순환 분산(한 날 몰림 방지)
    surplus -= 1;
  }
  const groups: PlaceResult[][] = [];
  let start = 0;
  for (let d = 0; d < k - 1; d++) {
    const cut = Math.min(start + perDay[d], n);
    groups.push(chain.slice(start, cut));
    start = cut;
  }
  groups.push(chain.slice(start)); // 마지막 날 = 나머지

  groups.sort((a, b) => {
    const ca = a.length
      ? a.reduce((s, p) => s + distFrom(p, center), 0) / a.length
      : Infinity;
    const cb = b.length
      ? b.reduce((s, p) => s + distFrom(p, center), 0) / b.length
      : Infinity;
    return ca - cb;
  });
  return groups;
}

export function orderHoming(
  items: PlaceResult[],
  center: LatLng,
): PlaceResult[] {
  const valid = items.filter(hasCoord);
  const invalid = items.filter((p) => !hasCoord(p));
  if (valid.length <= 1) return [...valid, ...invalid];
  return [...nnFromFarthest(valid, center), ...invalid]; // 최외곽 1코스 → 도심/숙소 귀환 (= 귀소)
}
