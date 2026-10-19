// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 여정 수정 시간표 = 사용자가 정한 순서 · 길이 그대로 이동 시간만 맞춰 채운다(계산 1벌 shared/day-retime, 서버 regenerate-day 와 같은 함수) · 카드 높이 = 시간 비례 · 1시간 30분 카드에 요소가 다 참 · 30분은 장소 이름만(320 폭 한 화면 5개 이상) · 자정을 넘는 슬롯도 길이 그대로 (정본 §)
import { retimeDay, toHm, toMin } from "@shared/day-retime";

export const PX_PER_MIN = 0.8;
export const MOVE_MIN_H = 14;
export const STEP_MIN = 30;
export const MIN_STAY_MIN = 30;
export const MAX_END_MIN = 24 * 60;

export type EditSlot = { place: any; stay: number };
type LatLng = { lat: number; lng: number };

const isFinalPlace = (p: any): boolean => p?.seedCategory === "bts_venue";
export const finalOfDay = (places: any[]): any | null =>
  places.find(isFinalPlace) ?? null;

export const cardHeight = (stay: number): number => stay * PX_PER_MIN;

export function timeAxis(
  slots: EditSlot[],
  starts: number[],
  startMin: number,
): (m: number) => number {
  const segs: { a: number; b: number; y: number; px: number }[] = [];
  let y = 0;
  let t = startMin;
  slots.forEach((s, i) => {
    if (starts[i] > t) {
      const px = Math.max((starts[i] - t) * PX_PER_MIN, MOVE_MIN_H);
      segs.push({ a: t, b: starts[i], y, px });
      y += px;
    }
    const px = cardHeight(s.stay);
    segs.push({ a: starts[i], b: starts[i] + s.stay, y, px });
    y += px;
    t = starts[i] + s.stay;
  });
  return (m) => {
    if (m <= startMin) return (m - startMin) * PX_PER_MIN;
    for (const g of segs)
      if (m <= g.b) return g.y + ((m - g.a) / (g.b - g.a)) * g.px;
    return y + (m - t) * PX_PER_MIN;
  };
}

// 화면 높이(px) → 그 높이가 뜻하는 분(시간 축이 곧지 않아도 맞게)
export function minutesAtPx(
  yOf: (m: number) => number,
  startMin: number,
  px: number,
): number {
  let lo = startMin - MAX_END_MIN;
  let hi = startMin + MAX_END_MIN;
  const target = yOf(startMin) + px;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (yOf(mid) < target) lo = mid;
    else hi = mid;
  }
  return lo - startMin;
}

export const slotsOfDay = (places: any[]): EditSlot[] =>
  places
    .filter((p) => !isFinalPlace(p))
    .map((p) => ({
      place: p,
      stay: (toMin(p.endTime) - toMin(p.startTime) + 1440) % 1440 || 1,
    }));

export function layoutDay(
  slots: EditSlot[],
  anchor: LatLng,
  startMin: number,
  endMin: number,
  mult: number,
  final?: LatLng | null,
) {
  const body = slots.map((s) => ({
    lat: s.place.lat,
    lng: s.place.lng,
    base: s.stay,
    kind: "act" as const,
    lock: s.stay,
  }));
  const rt = retimeDay({
    slots: final
      ? [
          ...body,
          { lat: final.lat, lng: final.lng, base: 0, kind: "final" as const },
        ]
      : body,
    anchor,
    startMin,
    endMin,
    mult,
  });
  const n = slots.length;
  return {
    starts: rt.starts.slice(0, n),
    moves: rt.moves.slice(0, n),
    lastEnd: n ? rt.starts[n - 1] + slots[n - 1].stay : startMin,
    finalMove: final ? rt.moves[n] : 0,
    arrival: final ? rt.starts[n] : 0,
  };
}

export function placesForServer(
  slots: EditSlot[],
  starts: number[],
  final?: any | null,
): any[] {
  const body = slots.map((s, i) => ({
    ...s.place,
    startTime: toHm(starts[i]),
    endTime: toHm(starts[i] + s.stay),
  }));
  return final ? [...body, final] : body;
}
