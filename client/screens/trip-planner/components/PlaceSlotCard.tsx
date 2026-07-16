// 슬롯(장소) 카드 + 이동구간 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable } from "react-native";
// ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 디버깅 SSOT 완전 적용 (= 단순 expo-image 부족)
// = client/lib/wikimedia-image.ts = Wikimedia 버킷 변환 + User-Agent 헤더 + Platform 분기
// = AOS Samsung A36 5G Wikimedia 5/8 실패 → 8/8 3초 (= BTS 검증)
import { Image } from "expo-image";
import { resolveImageSource } from "@/lib/wikimedia-image";
// ⚠️ 수정금지(승인필요) 2026-05-19 = 이미지 NULL placeholder = BTS 맵 마커 동일 SVG (= 사용자 SSOT)
// = bts-marker-svg.ts 직접 import (= BTSPlaceMap 우회 = webview/Google Maps SDK 코드 번들 제외)
import { SvgXml } from "react-native-svg";
import { COLORS as BTS_MARKER_COLORS, LUCIDE as BTS_MARKER_LUCIDE } from "@/components/bts/bts-marker-svg";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import { Itinerary, DayPlan } from "@/types/trip";
import { openPlaceInMaps } from "@/lib/openPlaceInMaps";
import { resultStyles as styles } from "../styles/result";
import type { PlannerApi } from "../hooks/useTripPlanner";

// ⚠️ 수정금지(승인필요) 2026-05-19 = 7 카테고리 SVG 모듈 레벨 사전 빌드 (= rendering-hoist-jsx + js-cache-function-results)
// 매 슬롯 렌더마다 SVG 문자열 재생성 비용 0 = static lookup
const BTS_PLACEHOLDER_SVG_BY_CAT: Record<string, string> = Object.fromEntries(
  Object.keys(BTS_MARKER_LUCIDE).map((cat) => [
    cat,
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="${BTS_MARKER_COLORS[cat] || '#666'}" stroke="white" stroke-width="3"/><g transform="translate(10,10) scale(0.8333)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BTS_MARKER_LUCIDE[cat]}</g></svg>`,
  ])
);

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
  const { theme, t, dayLayoutsRef, placesListOffsetRef, slotLayoutsRef, setSelectedSlotId } = planner;

                    // ⚠️ 수정금지(승인필요) 2026-05-09 = 별점(vibeScore) 폐기 = userRatingCount(rc) 만 사용 (= 사용자 SSOT)

                    // 🍽️ 식사 슬롯 여부 (백엔드에서 isMealSlot 제공 - 1순위)
                    const isMealSlot = place.isMealSlot === true;
                    const mealType = place.mealType; // 'lunch' | 'dinner'

                    // 식사 여부 (isMealSlot 또는 이름으로 판단)
                    const isMeal =
                      isMealSlot ||
                      place.isMeal ||
                      place.name?.includes("점심") ||
                      place.name?.includes("저녁") ||
                      place.name?.includes("아침") ||
                      place.name?.includes("식사") ||
                      place.name?.includes("카페") ||
                      place.name?.includes("레스토랑");

                    // 이동 구간 정보 (백엔드에서 제공)
                    const dayTransits = currentDay?.transit?.transits || [];
                    const transitInfo = dayTransits[index]; // index번째 장소에서 다음 장소로의 이동
                    const hasTransit = index < places.length - 1;

                    // 인원수 (itinerary에서 가져오기)
                    const companionCount = itinerary.companionCount || 1;

                    // 가격 정보
                    const entranceFee = place.entranceFee || 0;
                    const entranceFeeTotal =
                      place.entranceFeeTotal || entranceFee * companionCount;
                    return (
                      <View
                        // 🗺️ 2026-06-28 = 지도 마커 클릭 → 이 슬롯으로 스크롤 (= ScrollView 기준 절대 y 기록)
                        onLayout={(e) => {
                          const dayY = dayLayoutsRef.current[currentDay.day] ?? 0;
                          const listY = placesListOffsetRef.current[currentDay.day] ?? 0;
                          slotLayoutsRef.current[String(place.id)] = dayY + listY + e.nativeEvent.layout.y;
                        }}
                      >
                        {/* 장소 카드 */}
                        <View style={styles.placeItem}>
                          {/* 타임라인 좌측 - 🍽️ 식사 슬롯은 주황색 강조 */}
                          <View style={styles.timelineLeft}>
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
                              <Text style={styles.placeNumberText}>
                                {index + 1}
                              </Text>
                            </View>
                            {hasTransit && (
                              <View
                                style={[
                                  styles.timelineLine,
                                  { backgroundColor: theme.border },
                                ]}
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
                                      const cat = (place as any).slotCategory || (place as any).seedCategory || (isMealSlot || isMeal ? 'restaurant' : null);
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
                                    <Text style={{ fontSize: 8, lineHeight: 10, marginTop: 1, color: theme.textTertiary }}>구글맵 정보</Text>
                                  </View>
                                )}
                              </Pressable>

                              {/* ⚠️ 수정금지(승인필요) 2026-06-24 사용자 SSOT = 슬롯 6요소 + 순서 고정 = ①로컬네임(메인) ②한국이름(보조) ③시간 ④구글리뷰 ⑤한줄요약(editorial_summary, 차별화) ⑥가격(필수). 그외 노출·구글맵힌트줄 완전삭제(§19). */}
                              {/* 🗺️ 2026-06-28 = 슬롯 본문 터치 = 지도 그 마커 포커스(선택) = 양방향 연동. (썸네일 터치만 외부 구글맵) */}
                              <Pressable
                                style={styles.placeInfo}
                                onPress={() => setSelectedSlotId(String(place.id))}
                              >
                                {/* ① 로컬네임 (메인 = 크게) + 식사 프리픽스 */}
                                <View style={styles.placeHeader}>
                                  <Text
                                    style={[
                                      styles.placeName,
                                      { color: theme.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {isMealSlot
                                      ? mealType === "lunch"
                                        ? `[${t("trip.lunch")}] `
                                        : `[${t("trip.dinner")}] `
                                      : ""}
                                    {(place as any).nameLocal || place.name}
                                  </Text>
                                </View>
                                {/* ② 한국이름 (보조 = 작게) */}
                                {(() => {
                                  const localName = (place as any).nameLocal || place.name;
                                  const koName = (place as any).nameKo;
                                  return koName && koName !== localName ? (
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        color: theme.textTertiary,
                                        marginBottom: 2,
                                      }}
                                    >
                                      {koName}
                                    </Text>
                                  ) : null;
                                })()}

                                {/* ③ 시간 */}
                                <View style={styles.placeTimeRow}>
                                  <Icon
                                    name="clock"
                                    size={12}
                                    color={theme.textSecondary}
                                  />
                                  <Text
                                    style={[
                                      styles.placeTimeText,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {place.startTime} - {place.endTime}
                                  </Text>
                                </View>

                                {/* ④ 구글리뷰 (별점 폐기 = RC만, 사용자 SSOT) */}
                                {(place as any).userRatingCount > 0 ? (
                                  <View style={styles.placeStars}>
                                    <Icon name="star" size={12} color={theme.textSecondary} />
                                    <Text style={styles.placeStarsText}>
                                      {t("trip.googleReviews")} {(place as any).userRatingCount.toLocaleString()}
                                    </Text>
                                  </View>
                                ) : null}

                                {/* ⑤ 한줄요약 = editorial_summary 단일 (차별화 포인트). 옛 description·geminiReason·personaFitReason·summaryKo 노출 완전삭제(§19). summary_ko = 숏폼 재료 = 별도 보전. */}
                                {!!(place as any).editorialSummary && (
                                  <Text
                                    style={[
                                      styles.placeReason,
                                      { color: theme.textSecondary },
                                    ]}
                                    numberOfLines={2}
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
                                  <Text
                                    style={[
                                      styles.placePriceText,
                                      { color: Brand.primary },
                                    ]}
                                  >
                                    {isMeal
                                      ? `식사: €${place.mealPrice || "??"}`
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
                              style={[
                                styles.transitLine,
                                { backgroundColor: theme.border },
                              ]}
                            />
                            <View
                              style={[
                                styles.transitCard,
                                { backgroundColor: theme.backgroundSecondary },
                              ]}
                            >
                              <Icon
                                name="navigation"
                                size={14}
                                color={theme.textSecondary}
                              />
                              <Text
                                style={[
                                  styles.transitText,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {(() => {
                                  // ⚠️ 2026-07-04 사장님 SSOT = 교통수단 구분 = 3가지(도보 / 대중교통 / 드라이빙 가이드).
                                  //   백엔드 mode(walk / metro / private_guide) 3종을 그대로 3분기 라벨로. 세부수단(bus/RER)은 대중교통에 흡수.
                                  const rawMode =
                                    transitInfo.mode ||
                                    transitInfo.modeLabel ||
                                    "";
                                  // 3분기 = 중첩 삼항 회피(헌법) = if로 label 결정. 드라이빙 가이드(전용차) → 도보 → 그 외 대중교통.
                                  let label = t("trip.transitPublic");
                                  if (rawMode === "guide" || rawMode === "private_guide") {
                                    label = t("trip.drivingGuide");
                                  } else if (rawMode === "walk") {
                                    label = t("trip.walking");
                                  }
                                  const dur =
                                    transitInfo.durationText ||
                                    `${transitInfo.duration || 0}분`;
                                  const dist = transitInfo.distance
                                    ? `${(transitInfo.distance / 1000).toFixed(1)}km`
                                    : "";
                                  // ⚠️ 2026-07-03 사장님 SSOT = 구간당 균일 예상가로 슬롯 단위 금액 표시 제거(일별합계에만 "(예상)").
                                  return `${label} ${dur}${dist ? ` · ${dist}` : ""}`;
                                })()}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.transitLine,
                                { backgroundColor: theme.border },
                              ]}
                            />
                          </View>
                        )}
                      </View>
                    );
}
