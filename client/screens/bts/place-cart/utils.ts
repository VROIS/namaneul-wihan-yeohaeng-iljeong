import * as Haptics from "expo-haptics";

// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 정리: 햅틱 함수 한 벌 (정본 §정리)
export const haptic = (t: "light" | "medium" | "success") => {
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — 2026-08-22 사장님 원칙 = 장소명 노출 = nameEn 1순위(로케일 무관, 한국어 분기 폐기 = 2026-08-22 §19).
export function localizedName(
  item: { nameKo?: string | null; nameEn?: string | null },
  _isKorean: boolean,
): string {
  return item.nameEn || item.nameKo || "";
}

// ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 = 최대한 안 겹치게: 80×140 (= 100×178 대비 면적 -37%)
export const CARD_W = 80;
export const CARD_H = 140;

// ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-①: 게이팅 제거로 BATCH_SIZE 불필요. 총 장수만 유지.
export const MAX_PLACES = 8;
// ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = "같이 떠나요" 켜짐 = 담은 카드 5장부터(공연장 1 + 활동 4) (정본 §)
export const MIN_PLACES = 5;
