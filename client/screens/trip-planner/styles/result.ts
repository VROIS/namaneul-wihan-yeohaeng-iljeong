import { StyleSheet } from "react-native";
import {
  Brand,
  Spacing,
  BorderRadius,
  Fonts,
  Shadows,
} from "@/constants/theme";

export const resultStyles = StyleSheet.create({
  hotelIosModal: { flex: 1 },
  hotelIosModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  resultContainer: { flex: 1 },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = paddingBottom 12(md)→4(xs) = 저장⇄영상 아이콘
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    minHeight: 56, // 모바일 터치 영역 확보
  },
  headerButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 날짜+도시명(1줄, 굵게) + 장소수·1인예산(2줄) 묶음 섹션.
  tripSummarySection: {
    marginHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 도시명만 굵게 부각(날짜는 보통 굵기) = tripDate(보통)
  tripDate: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    textAlign: "left",
    marginBottom: 4,
  },
  tripCityName: {
    fontFamily: Fonts.bold,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = space-between(양끝 밀착) 폐기 → center + gap.
  tripSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    flexWrap: "wrap",
    rowGap: Spacing.xs,
  },
  tripSummaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tripSummaryText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
  tripOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: 4,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = flexShrink:1 = row 컨테이너(tripDescriptionContainer)
  tripDescriptionText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    textAlign: "center",
    flexShrink: 1,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = flexShrink:1 추가(2차 수정) = 진짜 원인은 이 컨테이너
  tripDescriptionContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
    flexShrink: 1,
  },
  mapSection: {
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  dayHeaderBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    gap: 10,
  },
  dayHeaderBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dayHeaderBadgeText: { fontSize: 13, fontFamily: Fonts.bold, color: "#fff" },
  dayHeaderTheme: { fontSize: 14, fontFamily: Fonts.bold },
  dayHeaderCity: { fontSize: 11, marginTop: 1 },
  resultScrollView: { flex: 1 },
  shareFooter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md + 56,
    gap: Spacing.sm,
  },
  shareFooterCta: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    textAlign: "center",
  },
  shareFooterRow: { flexDirection: "row", gap: Spacing.sm },
  shareFooterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  shareFooterBtnPrimary: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  shareFooterBtnText: { fontSize: 14, fontFamily: Fonts.semiBold },
  placesList: { paddingHorizontal: Spacing.sm },
  placeItem: { flexDirection: "row", marginBottom: Spacing.sm }, // 간격 최소화
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 44→38(원 36+여유2) = 슬롯 텍스트칸 폭 추가 확보(§ placeCard 근거 동일).
  timelineLeft: { width: 38, alignItems: "center" },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 번호원도 단추 느낌(그림자 = theme.ts Shadows.card
  placeNumberShadow: {
    borderRadius: 18,
    ...Shadows.card,
  },
  placeNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden", // 유리광택 그라데이션이 원 밖으로 안 새게
  },
  placeNumberText: { color: "#FFFFFF", fontSize: 15, fontFamily: Fonts.bold },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 식사 슬롯 구분 워터마크(숫자는 유지, 아이콘은
  placeNumberWatermark: { position: "absolute", top: 8, left: 8, opacity: 0.4 },
  timelineLine: { flex: 1, width: 2, marginVertical: Spacing.xs },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 슬롯 텍스트칸 폭 확보(아이폰12 영어 실기기 스샷 실증 =
  placeCard: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    marginLeft: 0,
  },
  placeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  placeName: { fontSize: 18, fontFamily: Fonts.bold, flex: 1 },
  placeTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  placeTimeText: { fontSize: 14, fontFamily: Fonts.semiBold },
  placeStars: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  placeStarsText: { fontSize: 12 },
  placePriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  placePriceText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
  },
  placeReason: { fontSize: 14, lineHeight: 20 },
  placeCardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 56→48 축소(텍스트칸 폭 확보, 위 placeCard 근거 동일).
  //   ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = marginRight 4→6(실측 4px 확인 후 사장님 재지시, 확정치).
  placeThumbnail: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    marginRight: 6,
  },
  placeThumbnailImage: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
  },
  placeThumbnailPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  placeInfo: {
    flex: 1,
  },
  transitSection: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 20,
    marginBottom: Spacing.md,
  },
  transitLine: {
    width: 2,
    height: 20,
  },
  transitCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.sm,
  },
  transitText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
  },
  dailyTotalSection: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  dailyTotalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.md,
  },
  dailyTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  dailyTotalItem: {
    alignItems: "center",
    flex: 1,
  },
  dailyTotalLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dailyTotalValue: {
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = "(estimated)" 라벨을 값과 한 줄에 합치면 좁은 3등분
  dailyTotalValueNote: {
    fontSize: 10,
    marginTop: 1,
  },
  dailyTotalGrand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  dailyTotalGrandLabel: {
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  dailyTotalGrandValue: {
    fontSize: 20,
    fontFamily: Fonts.bold,
  },
  // 2026-07-24 사장님 승인 = 일별 2버튼(동선 바로가기·바로 예약하기) = 드라이빙 가이드 전용
  dailyActionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  dailyActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  dailyActionText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
  },
  dailyActionEta: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  accommodationBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  accommodationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  accommodationText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    flex: 1,
  },
  accommodationTransit: {
    fontSize: 12,
  },
  accommodationButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    gap: 4,
    // ⚠️ 수정금지(승인필요) 2026-05-19 = 사용자 사고 (= dd99018 Icon 교체 시 누락) = 버튼 축소 X = 중앙 텍스트 짤림 방지
    flexShrink: 0,
  },
  accommodationButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: Fonts.bold,
  },
  reoptimizeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: BorderRadius.sm,
    gap: 8,
  },
  reoptimizeText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
  aiOpinionLoadingText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  aiOpinionSection: {
    paddingVertical: Spacing.md,
  },
  aiOpinionSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiOpinionSectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  aiOpinionSubheading: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    marginTop: Spacing.sm,
  },
  aiOpinionVerdict: {
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  aiOpinionBody: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    marginTop: 6,
    lineHeight: 21,
  },
  aiOpinionDivider: {
    height: 1,
    width: "100%",
  },
  aiOpinionDayBlock: {
    marginTop: Spacing.md,
  },
  aiOpinionPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  aiOpinionEstimateNote: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    marginTop: Spacing.sm,
  },
});
