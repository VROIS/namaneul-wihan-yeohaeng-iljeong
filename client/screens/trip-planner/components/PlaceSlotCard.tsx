import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
// ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 디버깅 SSOT 완전 적용 (= 단순 expo-image 부족)
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { resolveImageSource } from "@/lib/wikimedia-image";
// ⚠️ 수정금지(승인필요) 2026-05-19 = 이미지 NULL placeholder = BTS 맵 마커 동일 SVG (= 사용자 SSOT)
import { SvgXml } from "react-native-svg";
import {
  COLORS as BTS_MARKER_COLORS,
  LUCIDE as BTS_MARKER_LUCIDE,
} from "@/components/bts/bts-marker-svg";
import { Brand, Spacing } from "@/constants/theme";
import Icon from "@/components/Icon";
// 🎙️ 2026-08-02 사장님 지시 = 슬롯마다 [해설 듣기]. 부품·색 모두 **도시 카드 해설 배지와 같은 1벌**(§16 재발명 금지).
import CityBadge, { GLOSS_COLORS } from "@/components/tripis/CityBadge";
import { BADGE_COLORS } from "@/components/tripis/CityCardScreen";
import { Itinerary, DayPlan } from "@/types/trip";
import { openPlaceInMaps } from "@/lib/openPlaceInMaps";
import { openGuideForPlace } from "@/components/tripis/openGuide";
import { resultStyles as styles } from "../styles/result";
import type { PlannerApi } from "../hooks/useTripPlanner";

// ⚠️ 수정금지(승인필요) 2026-05-19 = 7 카테고리 SVG 모듈 레벨 사전 빌드 (= rendering-hoist-jsx + js-cache-function-results)
const BTS_PLACEHOLDER_SVG_BY_CAT: Record<string, string> = Object.fromEntries(
  Object.keys(BTS_MARKER_LUCIDE).map((cat) => [
    cat,
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="${BTS_MARKER_COLORS[cat] || "#666"}" stroke="white" stroke-width="3"/><g transform="translate(10,10) scale(0.8333)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BTS_MARKER_LUCIDE[cat]}</g></svg>`,
  ]),
);

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

  const isMeal =
    isMealSlot ||
    place.isMeal ||
    place.name?.includes("점심") ||
    place.name?.includes("저녁") ||
    place.name?.includes("아침") ||
    place.name?.includes("식사") ||
    place.name?.includes("카페") ||
    place.name?.includes("레스토랑");

  const dayTransits = currentDay?.transit?.transits || [];
  const transitInfo = dayTransits[index]; // index번째 장소에서 다음 장소로의 이동
  const hasTransit = index < places.length - 1;

  const companionCount = itinerary.companionCount || 1;

  const entranceFee = place.entranceFee || 0;
  const entranceFeeTotal =
    place.entranceFeeTotal || entranceFee * companionCount;
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
                {place.image ? (
                  <Image
                    source={resolveImageSource(place.image, "card")}
                    style={styles.placeThumbnailImage}
                    contentFit="cover"
                    priority="normal"
                    cachePolicy="memory-disk"
                    transition={150}
                  />
                ) : (
                  <View
                    style={[
                      styles.placeThumbnailPlaceholder,
                      {
                        backgroundColor: isMealSlot
                          ? "#FFF5F0"
                          : theme.backgroundSecondary,
                      },
                    ]}
                  >
                    {/* ⚠️ 수정금지(승인필요) 2026-05-19 = BTS 맵 마커 SVG 동일 사용 (= 사전 빌드 lookup) */}
                    {/* ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 카드 아이콘도 취향 슬롯 카테고리(slotCategory) 우선 = 지도 마커와 동일 소스(§16). */}
                    {/* ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 이미지 없이 아이콘 뜨는 모든 슬롯 = 아이콘 밑 '구글맵 정보' 문구(분기 없음 = MIX 신규는 당연, DB-only 도 누락·오류 대비. 썸네일 터치 = openPlaceInMaps 기존 연동). */}
                    {(() => {
                      const cat =
                        (place as any).slotCategory ||
                        (place as any).seedCategory ||
                        (isMealSlot || isMeal ? "restaurant" : null);
                      const svg = cat ? BTS_PLACEHOLDER_SVG_BY_CAT[cat] : null;
                      return svg ? (
                        <SvgXml xml={svg} width={30} height={30} />
                      ) : (
                        <Icon
                          name={isMealSlot || isMeal ? "coffee" : "map-pin"}
                          size={20}
                          color={isMealSlot ? "#FF6B35" : theme.textTertiary}
                        />
                      );
                    })()}
                    <Text
                      style={{
                        fontSize: 8,
                        lineHeight: 10,
                        marginTop: 1,
                        color: theme.textTertiary,
                      }}
                    >
                      {t("trip.googleMapsInfo")}
                    </Text>
                  </View>
                )}
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
              {/* ① 영어명 (메인 = 크게). ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 =
                  [점심]/[저녁] 텍스트 프리픽스 폐기(식당명 노출공간 확보, 위 번호원 워터마크로 구분
                  대체) + numberOfLines 제한 폐기(비한국어 번역시 더 필요한 공간 확보, 슬롯카드는
                  페이지 스크롤 안이라 길어져도 문제없음). */}
              <View style={styles.placeHeader}>
                <Text style={[styles.placeName, { color: theme.text }]}>
                  {(place as any).nameEn ||
                    (place as any).nameLocal ||
                    place.name}
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

              {/* ⑥ 가격 (슬롯마다 필수 = 맨 아래) = 식사비 또는 입장료 */}
              <View style={styles.placePriceRow}>
                <Icon
                  name={isMeal ? "credit-card" : "tag"}
                  size={12}
                  color={Brand.primary}
                />
                <Text style={[styles.placePriceText, { color: Brand.primary }]}>
                  {/* ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = 식사슬롯도 비식사슬롯과 동일한 500유로 가드 적용
                      (= 광장시장 "??" 표시버그 수정 = 0(무료) 오표시 + 가격상한 가드 부재 = 2026-08-19 §19 폐기) */}
                  {isMeal
                    ? typeof place.mealPrice === "number" &&
                      place.mealPrice > 0 &&
                      place.mealPrice < 500
                      ? t("trip.mealPrice", { price: place.mealPrice })
                      : t("common.free")
                    : (place as any).estimatedPriceEur > 0 &&
                        (place as any).estimatedPriceEur < 500
                      ? `€${(place as any).estimatedPriceEur}`
                      : entranceFee > 0 && entranceFee < 500
                        ? `€${entranceFee}`
                        : `${place.priceEstimate || t("common.free")}`}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      {/* 🚇 이동 구간 표시 */}
      {hasTransit && transitInfo && (
        <View style={styles.transitSection}>
          <View
            style={[styles.transitLine, { backgroundColor: theme.border }]}
          />
          <View
            style={[
              styles.transitCard,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Icon name="navigation" size={14} color={theme.textSecondary} />
            <Text style={[styles.transitText, { color: theme.textSecondary }]}>
              {(() => {
                // ⚠️ 2026-07-04 사장님 SSOT = 교통수단 구분 = 3가지(도보 / 대중교통 / 드라이빙 가이드).
                const rawMode = transitInfo.mode || transitInfo.modeLabel || "";
                let label = t("trip.transitPublic");
                if (rawMode === "guide" || rawMode === "private_guide") {
                  label = t("trip.drivingGuide");
                } else if (rawMode === "walk") {
                  label = t("trip.walking");
                }
                // ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = 서버 durationText("15분")는 한국어 고정이라
                const dur = t("trip.durationM", {
                  m: transitInfo.duration || 0,
                });
                const dist = transitInfo.distance
                  ? `${(transitInfo.distance / 1000).toFixed(1)}km`
                  : "";
                // ⚠️ 2026-07-03 사장님 SSOT = 구간당 균일 예상가로 슬롯 단위 금액 표시 제거(일별합계에만 "(예상)").
                return `${label} ${dur}${dist ? ` · ${dist}` : ""}`;
              })()}
            </Text>
          </View>
          <View
            style={[styles.transitLine, { backgroundColor: theme.border }]}
          />
        </View>
      )}
    </View>
  );
}
