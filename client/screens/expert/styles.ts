// ExpertSheet 스타일 = ExpertSheet.tsx 분리(2026-07-15 §0 슬림화, 순수 이동, 리팩토링 금지).
// 메인앱(TripPlannerScreen) 토큰과 동일: Pretendard·inputBox=backgroundDefault·BorderRadius.md·Brand.primary.
// 시트 자체 헤더(제목·X)는 부모 모달 = 여기 title 크기는 서브헤더용(28→20 축소 = 시트 내부 위계).
import { StyleSheet } from "react-native";
import { Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";

export const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  flex1: { flex: 1 },
  // 상단 세그먼트 토글(사용자↔전문가) = 개발단계 양쪽 화면 열람(2026-07-14)
  toggleRow: { flexDirection: "row", gap: 4, padding: 4, borderRadius: BorderRadius.md },
  toggleBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm },
  toggleText: { fontSize: 13, fontFamily: Fonts.bold },
  // 답변함/사용자 서브헤더(부모 모달 헤더 아래) = 상단 SafeArea 없음(부모 담당)
  subHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  subHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subTitle: { fontSize: 20, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  iconBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  // 소개/여정 카드
  card: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  attachCard: { padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md, gap: Spacing.xs },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Brand.primary, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#FFF", fontFamily: Fonts.bold, fontSize: 18 },
  cardTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 2 },
  cardSub: { fontSize: 13, fontFamily: Fonts.medium },
  cardBio: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: Spacing.sm },
  sectionSub: { fontSize: 12, fontFamily: Fonts.medium },
  attachTitle: { fontSize: 18, fontFamily: Fonts.bold },
  aiLine: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.sm, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#7A5AF8" },
  aiText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium }, // color = 인라인(다크모드 대응)
  input: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 15, fontFamily: Fonts.medium, minHeight: 100, textAlignVertical: "top", marginBottom: Spacing.md },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, height: Spacing.buttonHeight, borderRadius: BorderRadius.md },
  submitText: { color: "#FFF", fontSize: 16, fontFamily: Fonts.bold },
  creditNote: { fontSize: 12, fontFamily: Fonts.medium, textAlign: "center", marginTop: Spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: Spacing.xl },
  emptyText: { fontSize: 14, fontFamily: Fonts.medium, textAlign: "center", paddingVertical: Spacing.lg },
  // 문의 카드(사용자 내문의함 / 전문가 답변함 공용)
  inquiryCard: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.primary },
  inquiryTitle: { fontSize: 14, fontFamily: Fonts.semiBold },
  inquiryPreview: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontFamily: Fonts.bold },
  // 답변함 필터 칩
  chips: { gap: Spacing.sm, paddingBottom: Spacing.md },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: Fonts.semiBold },
  empty: { fontSize: 14, fontFamily: Fonts.medium, textAlign: "center", paddingVertical: Spacing.xl },
  // 상세 서브헤더(← 뒤로 + 제목 + 상태배지)
  detailHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  detailTitle: { flex: 1, fontSize: 18, fontFamily: Fonts.bold },
  badgePlaceholder: { width: 44 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  // 첨부 여정(요약/원본열람)
  attach: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, padding: Spacing.sm, borderRadius: BorderRadius.sm, marginBottom: Spacing.lg },
  attachText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium },
  attachFull: { flexDirection: "row", alignItems: "center", padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth, marginBottom: Spacing.lg },
  attachHead: { fontSize: 14, fontFamily: Fonts.bold },
  attachMeta: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
  attachOpen: { fontSize: 12, fontFamily: Fonts.semiBold, marginTop: Spacing.sm },
  // 말풍선
  from: { fontSize: 11, fontFamily: Fonts.medium, marginBottom: 4 },
  bubble: { maxWidth: "88%", padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.lg },
  bubbleMe: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleMeText: { color: "#FFF", fontSize: 14, fontFamily: Fonts.medium, lineHeight: 21 },
  bubbleThem: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleThemText: { fontSize: 14, fontFamily: Fonts.medium, lineHeight: 21 },
  waiting: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, alignSelf: "flex-start", padding: Spacing.md, borderRadius: BorderRadius.md },
  waitingText: { fontSize: 13, fontFamily: Fonts.semiBold },
  // 답변 입력/답변완료
  replyBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.lg, marginTop: Spacing.sm },
  replyLabel: { fontSize: 14, fontFamily: Fonts.bold, marginBottom: Spacing.sm },
  doneRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  doneText: { fontSize: 14, fontFamily: Fonts.bold },
  editBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: Spacing.buttonHeight, borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth },
  editText: { fontSize: 14, fontFamily: Fonts.semiBold },
  replyInput: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 15, fontFamily: Fonts.medium, minHeight: 90, textAlignVertical: "top", marginBottom: Spacing.md },
  replyActions: { flexDirection: "row", gap: Spacing.sm },
  actBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, height: Spacing.buttonHeight, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md },
  actPrimary: { flex: 1 },
  actText: { fontSize: 13, fontFamily: Fonts.bold },
  // 프로필 편집
  pfHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  pfBack: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  pfTitle: { flex: 1, fontSize: 20, fontFamily: Fonts.bold, letterSpacing: -0.5, textAlign: "center" },
  pfLabel: { fontSize: 14, fontFamily: Fonts.semiBold, marginBottom: Spacing.xs, marginTop: Spacing.md },
  pfInput: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 15, fontFamily: Fonts.medium },
  pfInputMultiline: { minHeight: 100, textAlignVertical: "top" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, height: Spacing.buttonHeight, borderRadius: BorderRadius.md, marginTop: Spacing.xl },
  saveText: { color: "#FFF", fontSize: 16, fontFamily: Fonts.bold },
});
