// ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = 여정 수정 시간표 = 사용자가 정한 순서 · 길이 그대로 이동 시간만 맞춰 채운다(계산 1벌 shared/day-retime, 서버 regenerate-day 와 같은 함수) (정본 §)
import { retimeDay, toHm, toMin } from "@shared/day-retime";

export const PX_PER_MIN = 1.9;
export const STEP_MIN = 30;
export const MIN_STAY_MIN = 30;
export const MAX_END_MIN = 24 * 60;

export type EditSlot = { place: any; stay: number };
export type LatLng = { lat: number; lng: number };

// 마지막이 공연장으로 고정된 하루(BTS) = 공연장 슬롯은 수정 대상이 아니다.
export const isFinalPlace = (p: any): boolean =>
  p?.seedCategory === "bts_venue";
export const finalOfDay = (places: any[]): any | null =>
  places.find(isFinalPlace) ?? null;

export const slotsOfDay = (places: any[]): EditSlot[] =>
  places
    .filter((p) => !isFinalPlace(p))
    .map((p) => ({
      place: p,
      stay: Math.max(1, toMin(p.endTime) - toMin(p.startTime)),
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

// 서버에 보낼 하루 = 화면과 같은 시각(시작 · 끝)을 슬롯에 담는다. 서버가 같은 함수로 다시 계산해 돌려준다.
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
