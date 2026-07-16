// 로그인 화면 스타일 = LoginScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { StyleSheet } from "react-native";
import { Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";

export const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl },

  /* ── TRIPIS 통합 헤더 = 시안 tripia-onboarding.jsx:35-45 ── */
  tripisHeader: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.md,
  },
  tripisMark: {
    height: 120,
    width: 120,
    marginBottom: 24,
  },
  tripisTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 28,
  },
  tripisTitle: {
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1.2,
    color: Brand.primary,
    lineHeight: 38,
  },
  tripisTitleKo: {
    fontSize: 14,
    color: "#6B6459",
    letterSpacing: 1,
  },
  tripisSubtitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -0.6,
    textAlign: "center",
    color: "#1A1A1A",
  },

  /* ── 구분선 ── */
  divider: {
    height: 1,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.xl,
  },

  /* ── 폼 ── */
  formSection: { marginBottom: Spacing.md },
  label: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  birthDateHint: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  flagText: { fontSize: 24 },
  selectorText: { flex: 1, fontSize: 16, fontFamily: Fonts.medium },
  dateInputRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  dateInputBox: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    width: 56,
    height: 52,
    justifyContent: "center",
  },
  yearBox: { width: 80 },
  dateInput: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    paddingHorizontal: Spacing.sm,
  },
  dateSeparator: { fontSize: 20, fontFamily: Fonts.medium },
  ageBadge: {
    backgroundColor: Brand.primary,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    marginLeft: Spacing.sm,
  },
  ageBadgeText: { color: "#FFFFFF", fontSize: 13, fontFamily: Fonts.bold },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    fontFamily: Fonts.sans,
    marginTop: Spacing.sm,
    marginLeft: Spacing.xs,
  },

  /* ── 소셜 버튼 ── */
  socialSection: { gap: Spacing.md, paddingBottom: Spacing.lg },
  // 개발단계 이메일 로그인(2026-07-14)
  emailLoginBox: { gap: Spacing.xs, marginTop: Spacing.sm },
  emailLoginLabel: { fontSize: 12, fontFamily: Fonts.medium, textAlign: "center" },
  emailLoginRow: { flexDirection: "row", gap: Spacing.sm },
  emailInput: { flex: 1, height: 48, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, fontSize: 14, fontFamily: Fonts.medium },
  emailLoginBtn: { paddingHorizontal: Spacing.lg, height: 48, borderRadius: BorderRadius.md, alignItems: "center", justifyContent: "center" },
  emailLoginBtnText: { color: "#FFF", fontSize: 14, fontFamily: Fonts.bold },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    gap: Spacing.md,
  },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.6 },
  kakaoButton: { backgroundColor: "#FEE500" },
  kakaoIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#3C1E1E",
    justifyContent: "center",
    alignItems: "center",
  },
  kakaoIconText: { color: "#FEE500", fontSize: 14, fontFamily: Fonts.bold },
  kakaoButtonText: { color: "#000000", fontSize: 16, fontFamily: Fonts.bold },
  whatsappButton: { backgroundColor: "#25D366" },
  whatsappButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  googleButton: { backgroundColor: "#FFFFFF", borderWidth: 1 },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#4285F4",
    justifyContent: "center",
    alignItems: "center",
  },
  googleIconText: { color: "#FFFFFF", fontSize: 14, fontFamily: Fonts.bold },
  googleButtonText: { fontSize: 16, fontFamily: Fonts.bold },
  disclaimer: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    textAlign: "center",
    marginTop: Spacing.md,
    lineHeight: 18,
  },

  /* ── 언어 모달 ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    paddingTop: Spacing.lg,
    paddingBottom: Spacing["3xl"],
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  languageList: { paddingHorizontal: Spacing.xl },
  languageItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  languageItemSelected: { backgroundColor: "rgba(66, 133, 244, 0.08)" },
  languageTextContainer: { flex: 1 },
  languageName: { fontSize: 16, fontWeight: "600" },
  languageSubname: { fontSize: 13, marginTop: 2 },

  /* ── WhatsApp OTP 모달 ── */
  whatsappModalBody: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  whatsappModalHint: { fontSize: 13, marginBottom: Spacing.md },
  whatsappInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  whatsappSubmit: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
});
