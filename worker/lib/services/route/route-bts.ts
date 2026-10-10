// ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = BTS 하루 = 고른 활동을 전부 넣고 점심·저녁은 메인 앱과 같은 식당 고르기로 자동 · 점심은 각 자리에 넣어 시각표를 깔아 본 결과로 고르고 저녁은 공연장 근처 · 이동 ×배수 · 끝 = 공연 시작 (정본 §)
import type { PlaceResult } from "../agents/types";
import { haversineKm } from "../agents/transit-haversine";
import { retimeDay } from "@shared/day-retime";

type LatLng = { lat: number; lng: number };
type Item = { p: PlaceResult; rest: boolean; base: number };

export interface BtsDayInput {
  places: PlaceResult[];
  pinnedPlaceIds: number[];
  center: LatLng;
  startMin: number;
  endMin: number;
  mult: number;
  lunchFrom: number;
  lunchBy: number;
  mealDuration: number;
  stayMin: (p: PlaceResult) => number;
  hasCoord: (p: { lat?: number | null; lng?: number | null }) => boolean;
  markUsed: (id: string) => void;
  peekLunch: (near: LatLng) => PlaceResult | null;
  pickDinner: () => PlaceResult | null;
}

export interface BtsDayOutput {
  items: { p: PlaceResult; rest: boolean }[];
  starts: number[];
  stays: number[];
  moves: number[];
  finalMove: number;
  hasDinner: boolean;
}

export function buildBtsDay(inp: BtsDayInput): BtsDayOutput {
  const { center, startMin, endMin, mult, lunchFrom, lunchBy, mealDuration } =
    inp;
  const pinSet = new Set(inp.pinnedPlaceIds.map((n) => `db-${n}`));
  const left = inp.places.filter((p) => pinSet.has(p.id) && inp.hasCoord(p));
  const actsOrd: PlaceResult[] = [];
  let pv: LatLng = center;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++)
      if (
        haversineKm(pv.lat, pv.lng, left[i].lat, left[i].lng) <
        haversineKm(pv.lat, pv.lng, left[bi].lat, left[bi].lng)
      )
        bi = i;
    const [nx] = left.splice(bi, 1);
    actsOrd.push(nx);
    pv = nx;
  }
  const dinnerR = inp.pickDinner();
  const hasDinner = !!dinnerR;
  const actsItems: Item[] = actsOrd.map((p) => ({
    p,
    rest: false,
    base: inp.stayMin(p),
  }));
  const runRt = (its: Item[]) =>
    retimeDay({
      slots: [
        ...its.map((it, i) => ({
          lat: it.p.lat,
          lng: it.p.lng,
          base: it.base,
          kind: (!it.rest
            ? "act"
            : hasDinner && i === its.length - 1
              ? "dinner"
              : "lunch") as "act" | "lunch" | "dinner",
        })),
        { lat: center.lat, lng: center.lng, base: 0, kind: "final" as const },
      ],
      anchor: center,
      startMin,
      endMin,
      mult,
      lunchFrom,
      lunchBy,
      mealsScale: true,
    });
  const dinnerItem: Item[] =
    hasDinner && dinnerR
      ? [{ p: dinnerR, rest: true, base: mealDuration }]
      : [];
  let items: Item[] = [...actsItems, ...dinnerItem];
  let lunchPick: PlaceResult | null = null;
  // 점심 자리 = 각 자리에 넣고(그 자리 직전 활동 가까운 식당) 시각표를 실제로 깔아 본 결과로 고른다
  //  = 점심 시작이 한도 안 → 활동 머묾 중 가장 짧은 것이 긴 쪽 → 이동 합이 짧은 쪽 → 12:30 에 가까운 쪽.
  let bestKey: number[] | null = null;
  for (let j = 0; j <= actsItems.length; j++) {
    const lunchR = inp.peekLunch(j === 0 ? center : actsItems[j - 1].p);
    if (!lunchR) continue;
    const cand: Item[] = [
      ...actsItems.slice(0, j),
      { p: lunchR, rest: true, base: mealDuration },
      ...actsItems.slice(j),
      ...dinnerItem,
    ];
    const r = runRt(cand);
    const lunchStart = r.starts[j];
    const outside =
      lunchStart < lunchFrom
        ? lunchFrom - lunchStart
        : lunchStart > lunchBy
          ? lunchStart - lunchBy
          : 0;
    const bodyStays = r.stays
      .slice(0, cand.length)
      .filter((_, k) => !cand[k].rest);
    const minAct = bodyStays.length ? Math.min(...bodyStays) : 0;
    const moveSum = r.moves.reduce((a, b) => a + b, 0);
    const key = [
      r.overflow > 0 ? 1 : 0,
      outside,
      -minAct,
      moveSum,
      Math.abs(lunchStart - 750),
    ];
    let better = !bestKey;
    if (bestKey) {
      for (let q = 0; q < key.length; q++) {
        if (key[q] !== bestKey[q]) {
          better = key[q] < bestKey[q];
          break;
        }
      }
    }
    if (better) {
      bestKey = key;
      items = cand;
      lunchPick = lunchR;
    }
  }
  if (lunchPick) inp.markUsed(lunchPick.id);
  const rt = runRt(items);
  return {
    items: items.map((it) => ({ p: it.p, rest: it.rest })),
    starts: rt.starts.slice(0, items.length),
    stays: rt.stays.slice(0, items.length),
    moves: rt.moves.slice(0, items.length),
    finalMove: rt.moves[items.length],
    hasDinner,
  };
}
