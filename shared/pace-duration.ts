// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 밀도(pace)별 슬롯 소요분 단일 SSOT.
//   원래 server/services/agents/types.ts PACE_CONFIG 안에만 있던 걸 여기로 분리(§16).
//   이유 = BTS 밀도 역산(BTSTripScreen.tsx)이 서버 파일을 직접 import 못 해 값을 복제해뒀었다(판단3종 지적,
//   서버 값이 바뀌면 FE 가 자동으로 안 따라가는 드리프트 위험) → 공유 1벌로 통합.

export const PACE_SLOT_MINUTES: Record<
  "Packed" | "Normal" | "Relaxed",
  number
> = {
  Packed: 90,
  Normal: 120,
  Relaxed: 150,
};
