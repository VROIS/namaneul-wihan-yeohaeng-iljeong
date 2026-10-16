// ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 하루 시각표 계산 1벌 = 숙소 출발 · 끝 시각 고정 · 이동 직선 시간 × 배수 · 식사 길이 고정 · 활동이 늘고 줄어 끝에 맞춤 (정본 §)
import { haversineKm } from "./geo";

export type RetimeKind = "act" | "lunch" | "dinner" | "final";

export interface RetimeSlot {
  lat: number;
  lng: number;
  base: number;
  kind: RetimeKind;
  lock?: number | null;
}

export interface RetimeInput {
  slots: RetimeSlot[];
  anchor: { lat: number; lng: number };
  startMin: number;
  endMin: number;
  mult: number;
  lunchFrom?: number;
  lunchBy?: number;
  mealsScale?: boolean;
}

export interface RetimeOutput {
  starts: number[];
  stays: number[];
  moves: number[];
  returnMove: number;
  lastEnd: number;
  overflow: number;
  unfilled: number;
  lunchAdjusted: boolean;
}

export const moveMult = (isGuide: boolean): number => (isGuide ? 1.5 : 2);

export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const toHm = (x: number): string =>
  `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;

export function moveMinKm(km: number, mult: number): number {
  const straight =
    km <= 1.0 ? (km / 5) * 60 : km <= 30 ? (km / 25) * 60 : (km / 75) * 60;
  return Math.round(straight * mult);
}

function spread(weights: number[], total: number): number[] {
  const W = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  const t = Math.max(weights.length, Math.round(total));
  const raw = weights.map((w) => (W > 0 ? (t * w) / W : t / weights.length));
  const base = raw.map(Math.floor);
  let rem = t - base.reduce((a, b) => a + b, 0);
  raw
    .map((x, i) => [x - Math.floor(x), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (rem > 0) {
        base[i]++;
        rem--;
      }
    });
  return base.map((x) => Math.max(1, x));
}

export function retimeDay(inp: RetimeInput): RetimeOutput {
  const { slots, anchor, startMin, endMin, mult } = inp;
  const n = slots.length;
  if (!n)
    return {
      starts: [],
      stays: [],
      moves: [],
      returnMove: 0,
      lastEnd: startMin,
      overflow: 0,
      unfilled: Math.max(0, endMin - startMin),
      lunchAdjusted: false,
    };

  const moves: number[] = [];
  let prev: { lat: number; lng: number } = anchor;
  for (const s of slots) {
    moves.push(moveMinKm(haversineKm(prev.lat, prev.lng, s.lat, s.lng), mult));
    prev = s;
  }
  const returnMove = moveMinKm(
    haversineKm(prev.lat, prev.lng, anchor.lat, anchor.lng),
    mult,
  );

  const mealsScale = !!inp.mealsScale;
  const isBody = (i: number) =>
    (slots[i].kind === "act" ||
      (mealsScale &&
        (slots[i].kind === "lunch" || slots[i].kind === "dinner"))) &&
    slots[i].lock == null;
  const fixedStay = (i: number) => slots[i].lock ?? slots[i].base;
  const stays: number[] = slots.map((_, i) => (isBody(i) ? 0 : fixedStay(i)));
  const bodyIdx = slots.map((_, i) => i).filter(isBody);
  const lunchIdx = slots.findIndex((s) => s.kind === "lunch");

  const sumMoves = moves.reduce((a, b) => a + b, 0);
  const sumFixed = stays.reduce((a, b) => a + b, 0);
  const bodyAvail = endMin - startMin - sumMoves - sumFixed;

  let lunchAdjusted = false;
  let unfilled = 0;
  let waitLunchTo: number | null = null;

  if (bodyIdx.length) {
    const W = bodyIdx.reduce((a, i) => a + slots[i].base, 0);
    const kGlobal = bodyAvail / W;
    let handled = false;
    if (lunchIdx >= 0 && inp.lunchFrom != null && inp.lunchBy != null) {
      const pre = bodyIdx.filter((i) => i < lunchIdx);
      const post = bodyIdx.filter((i) => i > lunchIdx);
      const movesToLunch = moves
        .slice(0, lunchIdx + 1)
        .reduce((a, b) => a + b, 0);
      const fixedBeforeLunch = stays
        .slice(0, lunchIdx)
        .reduce((a, b) => a + b, 0);
      const Wpre = pre.reduce((a, i) => a + slots[i].base, 0);
      const lunchAtK =
        startMin + movesToLunch + fixedBeforeLunch + kGlobal * Wpre;
      if (lunchAtK < inp.lunchFrom || lunchAtK > inp.lunchBy) {
        if (mealsScale && isBody(lunchIdx))
          stays[lunchIdx] = Math.max(
            1,
            Math.round(kGlobal * slots[lunchIdx].base),
          );
        const target = Math.min(inp.lunchBy, Math.max(inp.lunchFrom, lunchAtK));
        if (pre.length) {
          const preTotal = Math.max(
            Math.round(Wpre * 0.5),
            Math.round(target - startMin - movesToLunch - fixedBeforeLunch),
          );
          const postTotal = Math.round(
            endMin -
              (startMin +
                movesToLunch +
                fixedBeforeLunch +
                preTotal +
                stays[lunchIdx]) -
              moves.slice(lunchIdx + 1).reduce((a, b) => a + b, 0) -
              stays.slice(lunchIdx + 1).reduce((a, b) => a + b, 0),
          );
          const preS = spread(
            pre.map((i) => slots[i].base),
            preTotal,
          );
          pre.forEach((i, j) => (stays[i] = preS[j]));
          if (post.length) {
            const postS = spread(
              post.map((i) => slots[i].base),
              postTotal,
            );
            post.forEach((i, j) => (stays[i] = postS[j]));
          } else if (postTotal > 0) unfilled = postTotal;
          handled = true;
          lunchAdjusted = true;
        } else if (lunchAtK < inp.lunchFrom) {
          waitLunchTo = inp.lunchFrom;
        }
      }
    }
    if (!handled) {
      const waitCost =
        waitLunchTo != null
          ? Math.max(
              0,
              waitLunchTo -
                (startMin +
                  moves.slice(0, lunchIdx + 1).reduce((a, b) => a + b, 0) +
                  stays.slice(0, lunchIdx).reduce((a, b) => a + b, 0)),
            )
          : 0;
      const total = bodyAvail - waitCost;
      const s = spread(
        bodyIdx.map((i) => slots[i].base),
        total,
      );
      bodyIdx.forEach((i, j) => (stays[i] = s[j]));
    }
  } else {
    unfilled = Math.max(0, bodyAvail);
  }

  const starts: number[] = [];
  let t = startMin;
  let idle = 0;
  for (let i = 0; i < n; i++) {
    t += moves[i];
    if (i === lunchIdx && waitLunchTo != null && t < waitLunchTo)
      t = waitLunchTo;
    if (i === n - 1 && slots[i].kind === "dinner" && t < endMin - stays[i]) {
      idle += endMin - stays[i] - t;
      t = endMin - stays[i];
    }
    starts.push(t);
    t += stays[i];
  }
  return {
    starts,
    stays,
    moves,
    returnMove,
    lastEnd: t,
    overflow: Math.max(0, t - endMin),
    unfilled: Math.max(unfilled, idle, Math.max(0, endMin - t)),
    lunchAdjusted,
  };
}
