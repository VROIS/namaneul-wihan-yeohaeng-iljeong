import { StyleSheet, Platform } from "react-native";
import { Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";

export const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl },

  loginOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  loginBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  // ⚠️ 사장님 SSOT 2026-07-25 = 상단 고정 + 슬로건 제거 = 콘텐츠(로고글자+생년월일+소셜3)가 스크롤 없이 이메일까지 다 보이되(maxHeight 60%),
  loginCard: {
    width: "92%",
    maxWidth: 480,
    maxHeight: "60%",
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.18)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 16,
      },
    }),
  },
  // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = zIndex 없어서 뒤에 그려지는 로그인폼 ScrollView가
  loginCloseBtn: {
    position: "absolute",
    right: Spacing.md,
    top: Spacing.sm,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loginCardBody: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  loginBrand: {
    alignItems: "center",
    paddingBottom: Spacing.xs,
  },
  loginBrandTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 2,
  },
  // ⚠️ 사장님 SSOT 2026-07-25 = LoginSheet 전용 Tripis 글자 = 38→26 축소(삼성폰 키보드 회피 = 상단 콤팩트).
  loginBrandTitle: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: Brand.primary,
    lineHeight: 28,
  },

  divider: {
    height: 1,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.xl,
  },

  formSection: { marginBottom: Spacing.sm },
  label: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  // "(필수 입력)" = 라벨 같은 줄, 작고 흐리게 = 설명 아닌 필수 마커(사장님 SSOT 2026-07-25 §23). 간격 = marginLeft(공백 하드코딩 아님).
  labelRequired: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    marginLeft: Spacing.xs,
  },
  dateInputRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  dateInputBox: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    width: 56,
    height: 52,
    justifyContent: "center",
  },
  // ⚠️ 사장님 SSOT 2026-07-25 = LoginSheet 전용 = 칸을 옆으로 최대한 늘리고(flex:1 = 카드 폭 꽉 채움) 높이 축소(52→40) = 세로 콤팩트(삼성폰 키보드 회피) + 넓어진 폭으로 "MM"/"YYYY" 잘림 해소. width:"auto"로 원본 고정폭 무효화.
  sheetDateBox: {
    flex: 1,
    width: "auto",
    height: 40,
  },
  sheetYearBox: {
    flex: 1.4,
    width: "auto",
  },
  // ⚠️ 사장님 SSOT 2026-07-25 = 삼성폰(안드) TextInput 글자 위쪽 쏠림·잘림 버그 수정 = 세로중앙 강제.
  dateInput: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 0,
    textAlignVertical: "center",
    includeFontPadding: false,
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

  socialSection: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  emailLoginBox: { gap: Spacing.xs, marginTop: Spacing.sm },
  emailLoginRow: { flexDirection: "row", gap: Spacing.sm },
  emailInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: Spacing.md,
    paddingVertical: 0,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: Fonts.medium,
    // ⚠️ 사장님 SSOT 2026-07-25 = 삼성폰(안드) placeholder/입력 글자 위쪽 쏠림 수정 = 세로중앙 강제(dateInput과 동일). iOS 무해.
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  emailLoginBtn: {
    paddingHorizontal: Spacing.lg,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  emailLoginBtnText: { color: "#FFF", fontSize: 14, fontFamily: Fonts.bold },
  // ⚠️ 사장님 SSOT 2026-07-25 = 삼성폰 키보드 회피 = 버튼 높이 최대한 축소(고정 40 = 세로 콤팩트).
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 40,
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
  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = 애플 로그인 버튼(아이폰 전용).
  appleButton: { backgroundColor: "#000000" },
  appleIcon: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  appleIconText: { color: "#FFFFFF", fontSize: 18, fontFamily: Fonts.bold },
  appleButtonText: { color: "#FFFFFF", fontSize: 16, fontFamily: Fonts.bold },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },

  // ⚠️ 사장님 SSOT 2026-07-27(AOS 실기기) = 로그인 처리 1초 동안 화면이 그대로라
  loginBusyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: Spacing.sm,
  },
  loginBusyText: { fontSize: 14, fontFamily: Fonts.semiBold },
});
