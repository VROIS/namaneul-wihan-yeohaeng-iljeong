// ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = 조정 뒤 슬롯 시간 = 사용자가 정한 순서와 길이 그대로 이동 시간만 맞춰 채운다(계산 1벌 shared/day-retime, 남는 시간을 슬롯에 나누지 않는다) (정본 §)
import {
  retimeDay,
  moveMult,
  toMin,
  toHm,
  type RetimeKind,
} from "@shared/day-retime";

type Leg = { duration: number; durationText: string };
type Slot = {
  lat: number;
  lng: number;
  isMealSlot?: boolean;
  [key: string]: unknown;
};

export function retimePlaces(args: {
  places: Slot[];
  anchor: { lat: number; lng: number };
  startTime: string;
  endTime: string;
  isGuideDay: boolean;
  departure?: Leg;
  between: Leg[];
  ret?: Leg;
}): void {
  const { places, anchor } = args;
  const stayOf = (p: Slot) =>
    typeof p.startTime === "string" && typeof p.endTime === "string"
      ? Math.max(1, toMin(p.endTime) - toMin(p.startTime))
      : 60;
  const isFinal = (p: Slot) => p.seedCategory === "bts_venue";
  const finalIdx = places.findIndex(isFinal);
  const endMin =
    finalIdx >= 0
      ? toMin(places[finalIdx].startTime as string)
      : toMin(args.endTime);
  const rt = retimeDay({
    slots: places.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      base: isFinal(p) ? 0 : stayOf(p),
      kind: (isFinal(p) ? "final" : "act") as RetimeKind,
      lock: isFinal(p) ? null : stayOf(p),
    })),
    anchor,
    startMin: toMin(args.startTime),
    endMin,
    mult: moveMult(args.isGuideDay),
  });
  places.forEach((p, i) => {
    const keep = stayOf(p);
    const start = isFinal(p) ? endMin : rt.starts[i];
    p.startTime = toHm(start);
    p.endTime = toHm(start + (isFinal(p) ? keep : rt.stays[i]));
    p.transit_min = rt.moves[i];
  });
  const setDur = (t: Leg | undefined, d: number) => {
    if (t) {
      t.duration = d;
      t.durationText = `${d}분`;
    }
  };
  setDur(args.departure, rt.moves[0]);
  args.between.forEach((t, i) => setDur(t, rt.moves[i + 1]));
  setDur(args.ret, rt.returnMove);
}
