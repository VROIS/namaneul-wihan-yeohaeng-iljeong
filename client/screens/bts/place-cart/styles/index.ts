// BTS 장소 카트 스타일 = BTSPlaceCartScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import { StyleSheet } from "react-native";
import { CARD_W, CARD_H } from "../utils";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-22 전체 스크롤 컨텐츠 여백. 하단 paddingBottom은 insets.bottom으로 런타임 추가
  scrollContent: {
    paddingTop: 0,
  },

  // ⚠️ 수정금지(승인필요) — 뒤로가기 행
  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 5b: back(좌) ↔ 언어 스위치(우) space-between 정반대 위치.
  backRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 5b: 언어 스위치 컨테이너 (EN ○── 한).
  langSwitchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  langLabel: {
    fontSize: 12,
    fontFamily: "Pretendard-Bold",
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#9A9A9A",
    minWidth: 20,
    textAlign: "center",
  },
  langSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  backText: {
    fontSize: 18,
    fontFamily: "Pretendard-Bold",
    fontWeight: "700",
    color: "#1A1A1A",
  },

  // ⚠️ 수정금지(승인필요) — 도시 버튼 행 (5등분, 세로 여백 최소)
  cityRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-22 HERO 영역 (ScrollView 내부). flex:1 대신 minHeight로 궤도 공간 확보. radiusY(180) * 2 + CARD_H(178) + 여유 → ~540
  heroArea: {
    minHeight: 540,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1c: 8장 로드 대기 스피너 오버레이. heroArea 중앙 배치.
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1c: 카드 + 히어로 레이어. heroArea 와 동일 중앙 정렬 정책 유지.
  cardsLayer: {
    justifyContent: "center",
    alignItems: "center",
  },

  // 중앙 캐릭터 카드
  // ⚠️ 수정금지(승인필요) — 2026-04-22 Part C: zIndex 20 → 1 (카드 z:10 뒤로 이동). 캐릭터는 DIM 뒷장으로 존재감만, 8장 카드가 시각 주인공
  heroCard: {
    borderRadius: 20,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    backgroundColor: "#FFFFFF",
    zIndex: 1,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },

  // 장소 카드 (절대 배치)
  cardAbsolute: {
    position: "absolute",
    width: CARD_W,
    height: CARD_H,
    left: "50%",
    top: "50%",
    zIndex: 10,
  },
  cardPressable: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  cardLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  cardLabelText: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    fontWeight: "700",
    color: "#1A1A1A",
    textAlign: "center",
    lineHeight: 13,
  },
  checkBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  checkText: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "900",
  },

  // ⚠️ 수정금지(승인필요) — 에러 텍스트
  errorText: {
    color: "#EF4444",
    textAlign: "center",
    fontSize: 12,
    paddingHorizontal: 20,
    fontFamily: "Pretendard-Bold",
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-22 게이지+CTA 영역 (스크롤 내부 embed). 하단 고정존 폐기 (사용자 지시). paddingBottom은 scrollContent에서 insets.bottom으로 처리
  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a v2 (사용자 피드백): CTA 는 ScrollView 안 마지막 요소. 스크롤과 함께 움직임.
  bottomArea: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a: 카트 섹션 (가로 캐러셀). 2026-05-06 폐기 = mapSection 으로 교체. (스타일은 잔존 = 향후 참조용)
  cartSection: {
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  // ⚠️ 수정금지(승인필요) — 2026-05-06 BTS Screen 4 v3 SSOT: 카트 캐러셀 → WebView 인앱 지도. cartSection 패턴 그대로.
  mapSection: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a v3: letterSpacing 추가 (Screen 3/Landing 과 자간 일치).
  cartTitle: {
    fontSize: 13,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    letterSpacing: 0.3,
    paddingHorizontal: 20,
  },
  cartCarousel: {
    paddingHorizontal: 20,
    gap: 10,
  },
  cartCard: {
    width: 76,
    gap: 6,
  },
  cartCardImage: {
    width: 76,
    height: 100,
    borderRadius: 10,
    backgroundColor: "#EFEFEF",
  },
  cartCardLabel: {
    fontSize: 11,
    fontFamily: "Pretendard-Bold",
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#1A1A1A",
    textAlign: "center",
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a: 상세 섹션 (큰 이미지 + 장소명 + 제거 버튼 LiquidButton).
  detailSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  detailImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: "#EFEFEF",
  },
  detailInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailIndex: {
    fontSize: 22,
    fontFamily: "Pretendard-Bold",
    fontWeight: "900",
    letterSpacing: 0.5,
    minWidth: 24,
  },
  detailTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#1A1A1A",
  },

  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  gaugeTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F0F0F0",
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 3,
  },
  gaugeText: {
    fontSize: 12,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    minWidth: 40,
    textAlign: "right",
  },
  ctaBtn: {
    paddingVertical: 16,
    borderRadius: 26,
    alignItems: "center",
  },
  ctaText: {
    fontSize: 15,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
