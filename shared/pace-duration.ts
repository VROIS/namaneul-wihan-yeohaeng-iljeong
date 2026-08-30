// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 밀도(pace)별 슬롯 소요분 단일 SSOT.

export const PACE_SLOT_MINUTES: Record<
  "Packed" | "Normal" | "Relaxed",
  number
> = {
  Packed: 90,
  Normal: 120,
  Relaxed: 150,
};
