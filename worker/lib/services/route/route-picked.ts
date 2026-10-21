// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 여정 하루(고른 장소 그대로) = 들어온 버튼으로 가른다 · 인기 명소 여정 = shared/day-fill 1벌(목록·수정 화면과 같은 계산 · 식사 자리 고정 · 길이는 사용자가 늘리고 줄인 값) · 예상 여정 = 식당 없는 빈 식사 칸 · 내 취향 여정 수정 완료 = 사용자가 남긴 활동·식사 칸 자리·길이 그대로 · 둘 다 식사 칸마다 식당(규칙 = route-local pickMeal) (정본 §)
import type { PlaceResult } from "../agents/types";
import {
  planPickedDay,
  type FillItem,
  type PickedLayoutItem,
} from "@shared/day-fill";
import { retimeDay } from "@shared/day-retime";

type LatLng = { lat: number; lng: number };
type Act = PlaceResult & { stay: number };

export type { PickedLayoutItem };
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
  stayMin: (p: PlaceResult) => number;
  estimate: boolean;
  pickMeal: (prev?: PlaceResult, next?: PlaceResult) => PlaceResult | null;
  markUsed: (id: string) => void;
}

const emptyMeal = (kind: "lunch" | "dinner", at: LatLng): PlaceResult =>
  ({
    id: `meal-${kind}`,
    name: "",
    lat: at.lat,
    lng: at.lng,
    seedCategory: "restaurant",
  }) as PlaceResult;

// 수정 화면이 보낸 배치 = 활동 순서 + 점심 자리(앞 활동 수) + 식사 길이
function readLayout(
  layout: PickedLayoutItem[],
  byId: Map<string, PlaceResult>,
) {
  const acts: Act[] = [];
  let lunchAfter: number | null = null;
  const mealMin: { lunch?: number; dinner?: number } = {};
  layout.forEach((x) => {
    if (!("meal" in x)) {
      const p = byId.get(x.id);
      if (p) acts.push({ ...p, stay: x.stay });
      return;
    }
    if (x.kind === "lunch") {
      lunchAfter = acts.length;
      mealMin.lunch = x.meal;
    } else mealMin.dinner = x.meal;
  });
  return { acts, lunchAfter, mealMin };
}

export function buildPickedDay(inp: PickedDayInput) {
  const byId = new Map(inp.acts.map((p) => [p.id, p]));
  const read = inp.layout
    ? readLayout(inp.layout, byId)
    : {
        acts: inp.acts.map((p) => ({ ...p, stay: inp.stayMin(p) })),
        lunchAfter: null,
        mealMin: {},
      };
  const acts = read.acts;
  const win = { startMin: inp.startMin, endMin: inp.endMin };
  const cfg = { center: inp.center, mult: inp.mult };

  const first = planPickedDay(acts, win, cfg, {
    lunchAfter: read.lunchAfter,
    mealMin: read.mealMin,
  });
  const actOf = (items: FillItem<Act>[], k: number, dir: -1 | 1) => {
    for (let i = k + dir; i >= 0 && i < items.length; i += dir) {
      const it = items[i];
      if (it.kind === "act") return it.place;
    }
    return undefined;
  };
  const meals: { lunch?: PlaceResult | null; dinner?: PlaceResult | null } = {};
  first.items.forEach((it, k) => {
    if (it.kind === "act") return;
    const prev = actOf(first.items, k, -1);
    const next = actOf(first.items, k, 1);
    if (inp.estimate) {
      meals[it.kind] = emptyMeal(it.kind, prev ?? next ?? inp.center);
      return;
    }
    const r = inp.pickMeal(prev, next);
    if (r) inp.markUsed(r.id);
    meals[it.kind] = r;
  });
  const plan = planPickedDay(acts, win, cfg, {
    lunchAfter: first.lunchAfter,
    mealAt: { lunch: meals.lunch, dinner: meals.dinner },
    mealMin: read.mealMin,
  });
  const items = plan.items.filter((it) => it.kind === "act" || meals[it.kind]);
  const last = items[items.length - 1];
  return {
    items: items.map((it) => ({
      p: it.kind === "act" ? (it.place as PlaceResult) : meals[it.kind]!,
      rest: it.kind !== "act",
    })),
    starts: items.map((it) => it.start),
    stays: items.map((it) => it.stay),
    moves: items.map((it) => it.move),
    finalMove: plan.end - (last ? last.start + last.stay : inp.startMin),
    hasDinner: items.some((it) => it.kind === "dinner"),
  };
}

type LayoutItem = { p: PlaceResult | null; rest: boolean; base: number };

const hasActAfter = (its: LayoutItem[], k: number) =>
  its.slice(k + 1).some((x) => !x.rest);

// 내 취향 여정 수정 완료 = 사용자가 둔 활동·식사 칸 자리·길이 그대로 · 식사 칸마다 식당만 새로
export function buildLayoutDay(
  inp: Omit<PickedDayInput, "estimate" | "layout"> & {
    layout: PickedLayoutItem[];
    lunchFrom: number;
    lunchBy: number;
  },
) {
  const byId = new Map(inp.acts.map((p) => [p.id, p]));
  let items: LayoutItem[] = inp.layout.flatMap((x): LayoutItem[] => {
    if ("meal" in x) return [{ p: null, rest: true, base: x.meal }];
    const p = byId.get(x.id);
    return p ? [{ p, rest: false, base: x.stay }] : [];
  });
  const prevAct = (k: number) =>
    items
      .slice(0, k)
      .reverse()
      .find((x) => !x.rest)?.p ?? undefined;
  const nextAct = (k: number) =>
    items.slice(k + 1).find((x) => !x.rest)?.p ?? undefined;
  items.forEach((x, k) => {
    if (!x.rest) return;
    const r = inp.pickMeal(prevAct(k), nextAct(k));
    if (r) inp.markUsed(r.id);
    x.p = r;
  });
  items = items.filter((x) => x.p);
  const rt = retimeDay({
    slots: [
      ...items.map((it, k) => ({
        lat: it.p!.lat,
        lng: it.p!.lng,
        base: it.base,
        lock: it.base,
        kind: (!it.rest
          ? "act"
          : hasActAfter(items, k)
            ? "lunch"
            : "dinner") as "act" | "lunch" | "dinner",
      })),
      {
        lat: inp.center.lat,
        lng: inp.center.lng,
        base: 0,
        kind: "final" as const,
      },
    ],
    anchor: inp.center,
    startMin: inp.startMin,
    endMin: inp.endMin,
    mult: inp.mult,
    lunchFrom: inp.lunchFrom,
    lunchBy: inp.lunchBy,
  });
  return {
    items: items.map((it) => ({ p: it.p!, rest: it.rest })),
    starts: rt.starts.slice(0, items.length),
    stays: rt.stays.slice(0, items.length),
    moves: rt.moves.slice(0, items.length),
    finalMove: rt.moves[items.length],
    hasDinner: items.some((x, k) => x.rest && !hasActAfter(items, k)),
  };
}
