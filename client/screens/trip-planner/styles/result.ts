// Result(결과)·AI의견 스타일 = TripPlannerScreen styles 분리(2026-07-15 §0 슬림화, 순수 이동).
// 미사용 23키(saveButton·dayTab·vibeTag 등 102줄)는 §19 완전삭제(사용처 0 grep 실측 + 키수 대조 147-23=124 무손실 검증).
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
  //   둘 다 22px·headerButton 박스 48×48 고정이라 크기차 버퍼가 아님(코드 실측) = 순수 여백이라 축소
  //   대상. 완전히 0으로 붙이면 답답해 보여 최소 여백만 유지.
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
  // 🏆 대표 올리기 3키(headerActions·repBtn·repBtnText) = 프로필 이관으로 완전삭제 = 2026-08-02 §19.
  // 🗑️ resultTitle(도시명 단독 큰 제목) 완전삭제 = 2026-08-16 §19 = tripDateCity로 흡수(아래).
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 날짜+도시명(1줄, 굵게) + 장소수·1인예산(2줄) 묶음 섹션.
  //   헤더의 도시명 단독 큰 제목을 없앤 자리를 여기로 흡수 = 그만큼 위 여백 확보(§ description 2줄 허용과 연동).
  tripSummarySection: {
    marginHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 도시명만 굵게 부각(날짜는 보통 굵기) = tripDate(보통)
  //   + tripCityName(굵게) 2벌로 분리(위 ResultStep.tsx 중첩 Text 근거).
  //   textAlign left(가운데정렬 폐기) = 날짜가 왼쪽부터 채워 굵은 도시명이 줄 중간에 자연히 위치.
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
  //   장소수·비용 두 항목이 전체폭에 안 늘어나고 가운데로 뭉침(문서 들여쓰기 느낌) = 번역이 길어져도
  //   비용이 오른쪽 끝으로 안 밀리고 같이 중앙으로 수렴(아이폰12 프랑스어 실기기 스샷 실증 요청).
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
  //   안에서 RN 기본값(flexShrink:0)이라 안 줄어들고 옆으로 넘치던 문제(프랑스어 실증) 해결. numberOfLines
  //   는 ResultStep.tsx에서 지정(2줄 상한).
  tripDescriptionText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    textAlign: "center",
    flexShrink: 1,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = flexShrink:1 추가(2차 수정) = 진짜 원인은 이 컨테이너
  //   였음. tripDescriptionText에만 flexShrink 줘도, 그 부모인 이 View(tripOptionsRow 안의 row-item)가
  //   RN 기본값(flexShrink:0)이라 안 줄어들어 자식의 flexShrink가 무력화되던 문제(프랑스어 재실증).
  tripDescriptionContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
    flexShrink: 1,
  },
  // 🗺️ 지도 섹션
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
  // 2026-07-21 expertFooter*→shareFooter* 개명(이름 거짓말 제거 §19, 사용처=ResultStep 1곳뿐 grep 실측, 값 변경 0)
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
  //   재사용 §16, 새 그림자값 발명 금지). placeNumber는 overflow:hidden이라 그림자를 못 얹어 이
  //   바깥 View가 그림자 전담(위 CityBadge badge3dShadow와 같은 패턴).
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
  //   옅게 뒤에 깔림) = 36 원 중앙(=(36-20)/2=8).
  placeNumberWatermark: { position: "absolute", top: 8, left: 8, opacity: 0.4 },
  timelineLine: { flex: 1, width: 2, marginVertical: Spacing.xs },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 슬롯 텍스트칸 폭 확보(아이폰12 영어 실기기 스샷 실증 =
  //   지도·비용섹션보다 훨씬 좁게 오른쪽으로 몰려 번역시 여유 없음). paddingHorizontal 축소로 좌우 4px씩 확보.
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
  //   칸(flex:1) 안에서 단어 중간에 줄바꿈되던 문제(아이폰12 영어 실기기 스샷 실증) = 값과 분리해 작은
  //   글씨로 아래 줄에 표시.
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
  // 재최적화 로딩
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
