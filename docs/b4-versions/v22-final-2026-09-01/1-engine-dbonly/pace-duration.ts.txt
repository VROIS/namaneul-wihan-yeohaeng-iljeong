// ⚠️ 수정금지(승인필요) 2026-08-31 사장님 승인 = 밀도별 슬롯 소요분 단일 SSOT(식사도 동일값) (정본 B4)

export const PACE_SLOT_MINUTES: Record<
  "Packed" | "Normal" | "Relaxed",
  number
> = {
  Packed: 60,
  Normal: 90,
  Relaxed: 120,
};
