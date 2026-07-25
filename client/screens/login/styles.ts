// 로그인 화면 스타일 = LoginScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { StyleSheet, Platform } from "react-native";
import { Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";

export const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl },

  /* ── 2026-07-25(세션2) 로그인 = 상단 센터 모달 ── */
  // 오버레이 = 화면 전체, 카드를 상단(flex-start)에 = 키보드(하단)와 최대 이격.
  loginOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  // dim = 뒤 여정 흐리게(맥락 유지) + 탭하면 닫기. 카드 뒤 전체.
  loginBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  // 카드 = 상단에 뜨는 로그인 박스. marginTop은 컴포넌트에서 safe-area+여백 주입.
  // ⚠️ 사장님 SSOT 2026-07-25 = 상단 고정 + 슬로건 제거 = 콘텐츠(로고글자+생년월일+소셜3)가 스크롤 없이 이메일까지 다 보이되(maxHeight 60%),
  //   키보드(하단 ~40%)와는 안 겹침(카드 하단이 키보드 위 = 아이폰12 기준 60%≈506pt ≤ 키보드위 508pt). 넘치는 소형기기만 내부 ScrollView.
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
  loginCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  loginCardTitle: { fontSize: 16, fontFamily: Fonts.bold, letterSpacing: -0.3 },
  loginCloseBtn: {
    position: "absolute",
    right: Spacing.md,
    top: Spacing.sm,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  loginCardBody: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  // 브랜드존 = 최소화(로고 이미지 제거, Tripis 글자 + 슬로건 축소). 상단 고정 카드라 여백 최소로 = 소셜 버튼이 스크롤 없이 최대한 보이게(사장님 SSOT).
  loginBrand: {
    alignItems: "center",
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  // LoginSheet 브랜드 = Tripis 글자행. tripisTitleRow(marginBottom 28)는 LoginScreen 전용이라 여기선 작은 간격으로 오버라이드(§0 화면별 분리).
  loginBrandTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 4,
  },
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
  // 라벨 + "(필수 입력)" 한 줄 = baseline 정렬 행(LoginSheet 생년월일 전용, LoginScreen 무영향).
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
  emailLoginLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    textAlign: "center",
  },
  emailLoginRow: { flexDirection: "row", gap: Spacing.sm },
  emailInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
  emailLoginBtn: {
    paddingHorizontal: Spacing.lg,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  emailLoginBtnText: { color: "#FFF", fontSize: 14, fontFamily: Fonts.bold },
  // ⚠️ 사장님 SSOT 2026-07-25 = 상단 모달에 카카오·구글·이메일이 스크롤 없이 다 보이게 = 버튼 세로여백 lg→md 축소(터치영역 48pt+ 유지). 나머지 화면(LoginScreen 보관)은 자체 스타일이라 무영향.
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
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
