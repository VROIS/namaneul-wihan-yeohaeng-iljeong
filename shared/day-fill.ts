// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 인기 명소 여정 하루 계산 1벌(목록 화면 · 수정 화면 · 서버 공용) = 활동 체류(매트릭스 · 입장료 없으면 60) + 이동 + 점심·저녁(기본 60 · 수정 화면에서 30분 단위로 늘리고 줄임 · 자리는 고정) · 점심 = 11:30~14:00 안 활동 사이(12:45 에 가장 가까운 자리) · 저녁 = 마지막 활동 바로 뒤 · 한 곳 4시간 이상 = 점심 없음 · 8시간 이상 = 저녁도 없음 · 체크한 순서대로 그날이 차면 다음 날 · 다 차면 더 못 담음 (정본 §)
import { haversineKm } from "./geo";
import { moveMinKm } from "./day-retime";

export const PICKED_MEAL_MIN = 60;
export const PICKED_LUNCH_FROM = 11 * 60 + 30;
export const PICKED_LUNCH_BY = 14 * 60;
export const PICKED_LUNCH_SKIP_STAY = 240;
export const PICKED_DINNER_SKIP_STAY = 480;

type LatLng = { lat: number; lng: number };
export type FillPlace = LatLng & { stay: number };
export type FillWindow = { startMin: number; endMin: number };
export type FillConfig = { center: LatLng; mult: number };
export type FillItem<T> =
  | { kind: "act"; place: T; start: number; stay: number; move: number }
  | { kind: "lunch" | "dinner"; start: number; stay: number; move: number };
// 수정 화면 → 서버 배치 = 활동(아이디·체류) + 식사 칸(길이·종류)
export type PickedLayoutItem =
  | { id: string; stay: number }
  | { meal: number; kind?: "lunch" | "dinner" };
export type FillOptions = {
  lunchAfter?: number | null; // 점심을 이 번째 활동 뒤에 고정(1-base) · 없으면 가장 맞는 자리
  mealAt?: { lunch?: LatLng | null; dinner?: LatLng | null }; // 식당 좌표(최종) · 없으면 앞 활동 자리
  mealMin?: { lunch?: number; dinner?: number }; // 사용자가 늘리고 줄인 식사 길이 · 없으면 60
};

const LUNCH_MID = (PICKED_LUNCH_FROM + PICKED_LUNCH_BY) / 2;

export function planPickedDay<T extends FillPlace>(
  acts: T[],
  win: FillWindow,
  cfg: FillConfig,
  opts: FillOptions = {},
): { items: FillItem<T>[]; end: number; lunchAfter: number | null } {
  const longest = Math.max(0, ...acts.map((a) => a.stay));
  const lunch = acts.length > 0 && longest < PICKED_LUNCH_SKIP_STAY;
  const dinner = acts.length > 0 && longest < PICKED_DINNER_SKIP_STAY;
  const cands = !lunch
    ? [0]
    : opts.lunchAfter != null
      ? [Math.max(1, Math.min(opts.lunchAfter, acts.length))]
      : acts.map((_, i) => i + 1);
  const mv = (a: LatLng, b: LatLng) =>
    moveMinKm(haversineKm(a.lat, a.lng, b.lat, b.lng), cfg.mult);
  let best: {
    key: number[];
    items: FillItem<T>[];
    end: number;
    li: number;
  } | null = null;
  for (const li of cands) {
    const items: FillItem<T>[] = [];
    let t = win.startMin;
    let prev: LatLng = cfg.center;
    let lunchAt = 0;
    acts.forEach((a, i) => {
      const move = mv(prev, a);
      t += move;
      items.push({ kind: "act", place: a, start: t, stay: a.stay, move });
      t += a.stay;
      prev = a;
      if (li === i + 1) {
        const at = opts.mealAt?.lunch ?? prev;
        const move = mv(prev, at);
        lunchAt = Math.max(t + move, PICKED_LUNCH_FROM);
        const stay = opts.mealMin?.lunch ?? PICKED_MEAL_MIN;
        items.push({ kind: "lunch", start: lunchAt, stay, move });
        t = lunchAt + stay;
        prev = at;
      }
    });
    if (dinner) {
      const at = opts.mealAt?.dinner ?? prev;
      const move = mv(prev, at);
      t += move;
      const stay = opts.mealMin?.dinner ?? PICKED_MEAL_MIN;
      items.push({ kind: "dinner", start: t, stay, move });
      t += stay;
      prev = at;
    }
    const end = t + mv(prev, cfg.center);
    const key = li
      ? [
          lunchAt < PICKED_LUNCH_FROM
            ? PICKED_LUNCH_FROM - lunchAt
            : lunchAt > PICKED_LUNCH_BY
              ? lunchAt - PICKED_LUNCH_BY
              : 0,
          Math.abs(lunchAt - LUNCH_MID),
        ]
      : [0, 0];
    if (
      !best ||
      key[0] < best.key[0] ||
      (key[0] === best.key[0] && key[1] < best.key[1])
    )
      best = { key, items, end, li };
  }
  return { items: best!.items, end: best!.end, lunchAfter: best!.li || null };
}

export function assignPickedDays<T extends FillPlace>(
  ordered: T[],
  windows: FillWindow[],
  cfg: FillConfig,
): { days: T[][]; rest: T[] } {
  const days: T[][] = windows.map(() => []);
  const rest: T[] = [];
  let d = 0;
  for (const p of ordered) {
    let placed = false;
    while (d < windows.length) {
      const trial = [...days[d], p];
      if (planPickedDay(trial, windows[d], cfg).end <= windows[d].endMin) {
        days[d].push(p);
        placed = true;
        break;
      }
      if (days[d].length === 0) break;
      d++;
    }
    if (!placed) rest.push(p);
  }
  return { days, rest };
}
