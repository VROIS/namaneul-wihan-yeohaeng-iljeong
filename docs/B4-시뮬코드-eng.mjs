// ===== 실제 엔진 알고리즘 이식 (route-sector(v22 당시 파일, 2026-09-03 삭제) / route-local.ts) =====
const R = 6371;
const hav = (a, b) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180,
    dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
// route-sector(v22 당시 파일, 2026-09-03 삭제):12-41  nnFromFarthest
function nnFromFarthest(pts, center) {
  if (pts.length <= 1) return [...pts];
  let start = pts[0],
    sd = -1;
  for (const p of pts) {
    const d = hav(center, p);
    if (d > sd) {
      sd = d;
      start = p;
    }
  }
  const rem = pts.filter((p) => p !== start);
  const ord = [start];
  let cur = start;
  while (rem.length) {
    let bi = 0,
      bd = Infinity;
    for (let i = 0; i < rem.length; i++) {
      const d = hav(cur, rem[i]);
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
// route-sector(v22 당시 파일, 2026-09-03 삭제):44-101  sectorIntoDays
function sectorIntoDays(items, slotsPerDay, center) {
  const pts = items.filter((p) => p.lat && p.lng);
  const k = slotsPerDay.length;
  if (k <= 1) return [pts];
  if (pts.length <= k)
    return Array.from({ length: k }, (_, i) => (pts[i] ? [pts[i]] : []));
  const chain = nnFromFarthest(pts, center);
  const n = chain.length;
  const totalDemand = slotsPerDay.reduce((s, v) => s + Math.max(1, v), 0);
  const shortage = Math.max(0, totalDemand - n);
  let eff = slotsPerDay;
  if (shortage > 0) {
    const arr = slotsPerDay.map((v) => Math.max(1, v));
    let rm = shortage;
    while (rm > 0) {
      const mi = arr.reduce((m, v, i) => (v > arr[m] ? i : m), 0);
      if (arr[mi] <= 1) break;
      arr[mi]--;
      rm--;
    }
    eff = arr;
  }
  const perDay = eff.map((v) => Math.max(1, v));
  let surplus = n - perDay.reduce((s, v) => s + v, 0);
  for (let d = 0; surplus > 0; d = (d + 1) % k) {
    perDay[d]++;
    surplus--;
  }
  const groups = [];
  let st = 0;
  for (let d = 0; d < k - 1; d++) {
    const cut = Math.min(st + perDay[d], n);
    groups.push(chain.slice(st, cut));
    st = cut;
  }
  groups.push(chain.slice(st));
  groups.sort((a, b) => {
    const ca = a.length
      ? a.reduce((s, p) => s + hav(center, p), 0) / a.length
      : Infinity;
    const cb = b.length
      ? b.reduce((s, p) => s + hav(center, p), 0) / b.length
      : Infinity;
    return ca - cb;
  });
  return groups;
}
const orderHoming = (items, center) =>
  nnFromFarthest(
    items.filter((p) => p.lat && p.lng),
    center,
  );
export { hav, nnFromFarthest, sectorIntoDays, orderHoming };
