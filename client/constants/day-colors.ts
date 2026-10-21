// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 날짜색 = 프로필 "나의 TRIPIS" 영상 카드 3색을 그대로 1·2·3 순환(5·7일도 반복) · 인기 명소 목록의 번호 배지·지도 마커 · 영상 카드 그라데이션 공용 1벌 (정본 §)
export const TRIO_GRADIENTS = [
  ["#4F46E5", "#7C3AED"],
  ["#06B6D4", "#3B82F6"],
  ["#EC4899", "#8B5CF6"],
] as const;

export const dayColor = (day: number): string =>
  TRIO_GRADIENTS[(day - 1) % TRIO_GRADIENTS.length][0];
