// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 예상 여정 하루 = 사용자가 목록에서 고른 순서 그대로 · 체류 = 매트릭스(고정) · 점심 = 각 자리에 넣어 11~14시에 가장 맞는 자리 · 저녁 = 마지막 · 한 곳 4시간 이상 = 점심 없음 · 8시간 이상 = 저녁도 없음 · 최종 완료 = 사용자가 남긴 활동·식사 칸 자리·길이 그대로 식사 칸마다 식당을 새로 · 시각 = 계산 1벌 shared/day-retime (정본 §)
import type { PlaceResult } from "../agents/types";
import { retimeDay } from "@shared/day-retime";

type LatLng = { lat: number; lng: number };
type Item = { p: PlaceResult | null; rest: boolean; base: number };

const LUNCH_SKIP_STAY_MIN = 240;
const DINNER_SKIP_STAY_MIN = 480;

export type PickedLayoutItem = { id: string; stay: number } | { meal: number };
export type PickedFinalDay = {
  items: PickedLayoutItem[];
  startTime: string;
  endTime: string;
  anchor?: LatLng | null;
};

interface PickedDayInput {
  acts: PlaceResult[];
  layout?: PickedLayoutItem[];
  center: LatLng;
  startMin: number;
  endMin: number;
  mult: number;
  lunchFrom: number;
  lunchBy: number;
  mealDuration: number;
  stayMin: (p: PlaceResult) => number;
  // 식사 칸 하나의 식당 = 앞뒤 활동 기준(뒤가 없으면 저녁)
  pickMeal: (prev?: PlaceResult, next?: PlaceResult) => PlaceResult | null;
  markUsed: (id: string) => void;
}

const hasActAfter = (its: Item[], k: number) =>
  its.slice(k + 1).some((x) => !x.rest);

export function buildPickedDay(inp: PickedDayInput) {
  const { center, startMin, endMin, mult, lunchFrom, lunchBy, mealDuration } =
    inp;
  const byId = new Map(inp.acts.map((p) => [p.id, p]));
  let items: Item[] = inp.layout
    ? inp.layout.flatMap((x): Item[] => {
        if ("meal" in x) return [{ p: null, rest: true, base: x.meal }];
        const p = byId.get(x.id);
        return p ? [{ p, rest: false, base: x.stay }] : [];
      })
    : inp.acts.map((p) => ({ p, rest: false, base: inp.stayMin(p) }));
  const acts = items.filter((x) => !x.rest);
  const longest = Math.max(0, ...acts.map((a) => a.base));
  const needLunch = acts.length > 0 && longest < LUNCH_SKIP_STAY_MIN;
  const needDinner = acts.length > 0 && longest < DINNER_SKIP_STAY_MIN;

  if (!needLunch)
    items = items.filter((x, k) => !x.rest || !hasActAfter(items, k));
  if (!needDinner) items = items.filter((x) => !x.rest);
  if (needDinner && !items.some((x, k) => x.rest && !hasActAfter(items, k)))
    items.push({ p: null, rest: true, base: mealDuration });

  const run = (its: Item[]) =>
    retimeDay({
      slots: [
        ...its.map((it, k) => ({
          lat: it.p!.lat,
          lng: it.p!.lng,
          base: it.base,
          lock: it.base,
          kind: (!it.rest
            ? "act"
            : hasActAfter(its, k)
              ? "lunch"
              : "dinner") as "act" | "lunch" | "dinner",
        })),
        { lat: center.lat, lng: center.lng, base: 0, kind: "final" as const },
      ],
      anchor: center,
      startMin,
      endMin,
      mult,
      lunchFrom,
      lunchBy,
    });
  const prevAct = (its: Item[], k: number) =>
    its
      .slice(0, k)
      .reverse()
      .find((x) => !x.rest)?.p ?? undefined;
  const nextAct = (its: Item[], k: number) =>
    its.slice(k + 1).find((x) => !x.rest)?.p ?? undefined;

  items.forEach((x, k) => {
    if (!x.rest) return;
    const r = inp.pickMeal(prevAct(items, k), nextAct(items, k));
    if (r) inp.markUsed(r.id);
    x.p = r;
  });
  items = items.filter((x) => x.p);

  if (needLunch && !items.some((x, k) => x.rest && hasActAfter(items, k))) {
    let bestKey: number[] | null = null;
    let bestItems: Item[] | null = null;
    let bestLunch: PlaceResult | null = null;
    for (let j = 1; j <= items.length; j++) {
      if (items[j - 1].rest || !hasActAfter(items, j - 1)) continue;
      const r = inp.pickMeal(items[j - 1].p!, nextAct(items, j - 1));
      if (!r) continue;
      const cand: Item[] = [
        ...items.slice(0, j),
        { p: r, rest: true, base: mealDuration },
        ...items.slice(j),
      ];
      const ls = run(cand).starts[j];
      const key = [
        ls < lunchFrom ? lunchFrom - ls : ls > lunchBy ? ls - lunchBy : 0,
        Math.abs(ls - 750),
      ];
      if (
        !bestKey ||
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && key[1] < bestKey[1])
      ) {
        bestKey = key;
        bestItems = cand;
        bestLunch = r;
      }
    }
    if (bestItems && bestLunch) {
      items = bestItems;
      inp.markUsed(bestLunch.id);
    }
  }

  const rt = run(items);
  return {
    items: items.map((it) => ({ p: it.p!, rest: it.rest })),
    starts: rt.starts.slice(0, items.length),
    stays: rt.stays.slice(0, items.length),
    moves: rt.moves.slice(0, items.length),
    finalMove: rt.moves[items.length],
    hasDinner: items.some((x, k) => x.rest && !hasActAfter(items, k)),
  };
}
