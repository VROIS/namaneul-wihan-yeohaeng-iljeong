// ⚠️ 수정금지(승인필요) 2026-07-13 = 문의 상태 → 배지 색/라벨(전문가 화면 공용). theme 토큰 계열 색.
import type { Colors } from "@/constants/theme";
import type { InquiryStatus } from "./expertApi";

export function statusStyle(s: InquiryStatus, theme: typeof Colors.light, t: (k: string) => string) {
  switch (s) {
    case "answered": return { label: t("expert.stAnswered"), bg: `${theme.success}1A`, fg: theme.success };
    case "in_review": return { label: t("expert.stReview"), bg: `${theme.info}1A`, fg: theme.info };
    case "rejected": return { label: t("expert.stRejected"), bg: `${theme.danger}1A`, fg: theme.danger };
    default: return { label: t("expert.stPending"), bg: `${theme.warning}1A`, fg: theme.warning };
  }
}
