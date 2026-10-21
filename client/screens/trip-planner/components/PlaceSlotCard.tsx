import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
// ⚠️ 수정금지(승인필요) 2026-05-19 = 이미지 NULL placeholder = BTS 맵 마커 동일 SVG (= 사용자 SSOT)
import { SvgXml } from "react-native-svg";
import { LUCIDE as BTS_MARKER_LUCIDE } from "@/components/bts/bts-marker-svg";
import { Brand, Spacing } from "@/constants/theme";
import { Icon } from "@/components/Icon";
// 🎙️ 2026-08-02 사장님 지시 = 슬롯마다 [해설 듣기]. 부품·색 모두 **도시 카드 해설 배지와 같은 1벌**(§16 재발명 금지).
import CityBadge, { GLOSS_COLORS } from "@/components/tripis/CityBadge";
import { BADGE_COLORS } from "@/components/tripis/CityCardScreen";
import { Itinerary, DayPlan } from "@/types/trip";
import { openPlaceInMaps } from "@/lib/openPlaceInMaps";
import { openGuideForPlace } from "@/components/tripis/openGuide";
import { resultStyles as styles } from "../styles/result";
import TransitPill from "./TransitPill";
import SlotThumbnail from "./SlotThumbnail";
import { isMealPlace, slotPriceLabel } from "./slot-price";
import type { PlannerApi } from "../hooks/useTripPlanner";

// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = [점심]/[저녁] 텍스트 프리픽스 폐기(식당명 노출공간
const MEAL_WATERMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BTS_MARKER_LUCIDE.restaurant}</svg>`;

// 🎙️ 2026-08-03 사장님 지시 = 썸네일(위) + [해설 듣기](칸 맨 아래) 를 담는 세로칸.
const slotStyles = StyleSheet.create({
  thumbColumn: {
    alignSelf: "stretch",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
});

export default function PlaceSlotCard({
  place,
  index,
  places,
  currentDay,
  itinerary,
  planner,
}: {
  place: any;
  index: number;
  places: any[];
  currentDay: DayPlan;
  itinerary: Itinerary;
  planner: PlannerApi;
}) {
  const {
    theme,
    t,
    dayLayoutsRef,
    placesListOffsetRef,
    slotLayoutsRef,
    setSelectedSlotId,
    navigation,
    // 🔒 2026-08-05 사장님 SSOT = 여정 슬롯 해설 = 심화 = 로그인 필수(도시카드 샘플과 다름).
    isAuthed,
    requestLogin,
  } = planner;

  // 🎙️ 2026-08-02 사장님 지시 = 이 슬롯의 우리 장소번호.
  const guidePlaceIdMatch = /^db-(\d+)$/.exec(String(place.id ?? ""));
  const guidePlaceId = guidePlaceIdMatch ? Number(guidePlaceIdMatch[1]) : null;

  const openGuide = () => {
    if (guidePlaceId !== null)
      openGuideForPlace(navigation, guidePlaceId, { isAuthed, requestLogin });
  };

  // ⚠️ 수정금지(승인필요) 2026-05-09 = 별점(vibeScore) 폐기 = userRatingCount(rc) 만 사용 (= 사용자 SSOT)

  const isMealSlot = place.isMealSlot === true;

  const isMeal = isMealPlace(place);

  const dayTransits = currentDay?.transit?.transits || [];
  const transitInfo = dayTransits[index]; // index번째 장소에서 다음 장소로의 이동
  const hasTransit = index < places.length - 1;

  const priceLabel = slotPriceLabel(place, isMeal, t);
  return (
    <View
      onLayout={(e) => {
        const dayY = dayLayoutsRef.current[currentDay.day] ?? 0;
        const listY = placesListOffsetRef.current[currentDay.day] ?? 0;
        slotLayoutsRef.current[String(place.id)] =
          dayY + listY + e.nativeEvent.layout.y;
      }}
    >
      {/* 장소 카드 */}
      <View style={styles.placeItem}>
        {/* 타임라인 좌측 - 🍽️ 식사 슬롯은 주황색 강조 */}
        <View style={styles.timelineLeft}>
          {/* ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 번호원도 단추 느낌(그림자+유리광택) =
              CityBadge 세로형과 같은 기법(§16). 바깥(그림자 전용) + 안(overflow:hidden, 광택 클립). */}
          <View style={styles.placeNumberShadow}>
            <View
              style={[
                styles.placeNumber,
                {
                  backgroundColor: isMealSlot
                    ? "#FF6B35"
                    : isMeal
                      ? "#FFA500"
                      : Brand.primary,
                },
              ]}
            >
              <LinearGradient
                colors={GLOSS_COLORS}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.7 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              {(isMealSlot || isMeal) && (
                <SvgXml
                  xml={MEAL_WATERMARK_SVG}
                  width={20}
                  height={20}
                  style={styles.placeNumberWatermark}
                />
              )}
              <Text style={styles.placeNumberText}>{index + 1}</Text>
            </View>
          </View>
          {hasTransit && (
            <View
              style={[styles.timelineLine, { backgroundColor: theme.border }]}
            />
          )}
        </View>

        {/* 🗺️ 2026-06-28 사용자 SSOT = 카드 탭 분리(충돌해소): 썸네일 터치=외부 구글맵 / 슬롯 본문 터치=지도 그 마커 포커스. 카드 전체 Pressable 폐기(§19). */}
        <View
          style={[
            styles.placeCard,
            {
              backgroundColor: theme.backgroundDefault,
              borderLeftWidth: isMealSlot ? 3 : 0,
              borderLeftColor: "#FF6B35",
            },
          ]}
        >
          <View style={styles.placeCardContent}>
            {/* 🎙️ 2026-08-03 사장님 지시 = 썸네일(위) + 칸 맨 아래 [해설 듣기] 세로칸(치수 = slotStyles). */}
            <View style={slotStyles.thumbColumn}>
              {/* 썸네일 이미지 = 터치 시 외부 Google Maps 앱 호출 (= openPlaceInMaps) */}
              {/* ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 SSOT = resolveImageSource (= UA + bucket + Platform 분기) */}
              <Pressable
                style={styles.placeThumbnail}
                onPress={() => openPlaceInMaps(place)}
              >
                <SlotThumbnail
                  place={place}
                  isMealSlot={isMealSlot}
                  isMeal={!!isMeal}
                  theme={theme}
                  t={t}
                />
              </Pressable>

              {/* 🎙️ [해설 듣기] = 이미지가 떠도 아이콘이 떠도 같은 자리(칸 맨 아래)에 뜬다(식사 슬롯도 동일).
                  부품·빛줄기·그라데이션 = 도시 카드 해설 배지와 **같은 CityBadge 1벌 그대로**(§16 재발명 금지),
                  색 = 그 표의 guide 색, 아이콘 = 같은 book-open.
                  빛줄기(샤이니)를 켜 둔다 = 다른 앱에 없는 기능이라 눈에 띄어야 한다(2026-08-03 사장님 지시).
                  ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = layout="column" + width=48(썸네일과 동일 폭)
                  = 슬롯 텍스트칸 폭 최대 확보(가로 알약 → 세로 3단: 아이콘/글자 자동 2줄). */}
              {guidePlaceId !== null && (
                <CityBadge
                  icon="book-open"
                  label={t("trip.listenGuide")}
                  colors={BADGE_COLORS.guide}
                  visible
                  onPress={openGuide}
                  layout="column"
                  width={48}
                />
              )}
            </View>

            {/* ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 슬롯 6요소 + 순서 고정 = ①영어명(메인) ②로컬명(보조) ③시간 ④구글리뷰 ⑤한줄요약(editorial_summary, 차별화) ⑥가격(필수). 그외 노출·구글맵힌트줄 완전삭제(§19).
                한국어 우선 표시(옛 ①로컬 ②한국이름) 폐기 = 2026-08-21 §19 — 도시대표카드 영어통일과 같은 원칙(뷰어 언어 무관 항상 영어 우선).
                PSR 실측(10도시 상위20위 1,327행) = nameEn 결측 0건, nameLocal 결측 3.7%뿐이라 안전. 초기(PSR연동전) 여정은 nameEn 자체가 없어 최종 폴백 = place.name. */}
            {/* 🗺️ 2026-06-28 = 슬롯 본문 터치 = 지도 그 마커 포커스(선택) = 양방향 연동. (썸네일 터치만 외부 구글맵) */}
            <Pressable
              style={styles.placeInfo}
              onPress={() => setSelectedSlotId(String(place.id))}
            >
              {/* ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 이름 = 영어명 → 현지명 → name(프리픽스·줄 제한 없음 그대로) · 예상 여정의 식당 없는 식사 칸만 "점심/저녁" 글자 (정본 §) */}
              <View style={styles.placeHeader}>
                <Text style={[styles.placeName, { color: theme.text }]}>
                  {(place as any).nameEn ||
                    (place as any).nameLocal ||
                    place.name ||
                    (isMealSlot
                      ? t(
                          place.mealType === "dinner"
                            ? "trip.mealDinner"
                            : "trip.mealLunch",
                        )
                      : "")}
                </Text>
              </View>
              {/* ② 로컬명 (보조 = 작게, 있고 메인과 다를 때만) */}
              {(() => {
                const mainName =
                  (place as any).nameEn ||
                  (place as any).nameLocal ||
                  place.name;
                const localName = (place as any).nameLocal;
                return localName && localName !== mainName ? (
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.textTertiary,
                      marginBottom: 2,
                    }}
                  >
                    {localName}
                  </Text>
                ) : null;
              })()}

              {/* ⚠️ 수정금지(승인필요) 2026-09-02 사장님 확정 = 시작 시각만 노출(종료는 감춤) = 사람이 스스로 조정 (정본 B4 v23) */}
              <View style={styles.placeTimeRow}>
                <Icon name="clock" size={12} color={theme.textSecondary} />
                <Text
                  style={[styles.placeTimeText, { color: theme.textSecondary }]}
                >
                  {place.startTime}
                </Text>
              </View>

              {/* ④ 구글리뷰 (별점 폐기 = RC만, 사용자 SSOT) */}
              {(place as any).userRatingCount > 0 ? (
                <View style={styles.placeStars}>
                  <Icon name="star" size={12} color={theme.textSecondary} />
                  <Text style={styles.placeStarsText}>
                    {t("trip.googleReviews")}{" "}
                    {(place as any).userRatingCount.toLocaleString()}
                  </Text>
                </View>
              ) : null}

              {/* ⑤ 한줄요약 = editorial_summary 단일 (차별화 포인트). 옛 description·geminiReason·personaFitReason·summaryKo 노출 완전삭제(§19). summary_ko = 숏폼 재료 = 별도 보전.
                  ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = numberOfLines 제한 폐기(비한국어
                  번역시 더 필요한 공간 확보, 페이지 스크롤 안이라 길어져도 문제없음). */}
              {!!(place as any).editorialSummary && (
                <Text
                  style={[styles.placeReason, { color: theme.textSecondary }]}
                >
                  {(place as any).editorialSummary}
                </Text>
              )}

              {/* ⑥ 가격 = 식사비 또는 입장료 · ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 손님 화면은 "무료" 아니면 금액 두 가지뿐 = 값이 0 이면 무료, 0 보다 크면 금액(500 이상도 실제 값), 모름(NULL)이면 가격 줄을 그리지 않는다 (정본 §) */}
              {priceLabel != null && (
                <View style={styles.placePriceRow}>
                  <Icon
                    name={isMeal ? "credit-card" : "tag"}
                    size={12}
                    color={Brand.primary}
                  />
                  <Text
                    style={[styles.placePriceText, { color: Brand.primary }]}
                  >
                    {priceLabel}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {hasTransit && transitInfo && (
        <TransitPill leg={transitInfo} theme={theme} t={t} />
      )}
    </View>
  );
}
