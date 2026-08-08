// 나의 여정 섹션 (아이폰 12 화면 가득 채우는 풍성한 3D 카드 - 입체감 & 칼라)
import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { styles, getResponsiveFullTripCardWidth } from "../styles";
import { shortDateCard, summaryLineCard } from "../utils";
import type { ProfileApi } from "../hooks/useProfile";
// 숨김 이름표(종류:id) = 공용 1벌(§16). 목록·저장은 useProfile 이 1번만 부른다.
import { cardKey } from "../hooks/useHiddenCards";

export default function TripsSection({ profile }: { profile: ProfileApi }) {
  const {
    theme,
    t,
    navigation,
    savedTrips,
    isLoadingTrips,
    // 🏆 2026-08-02 = 대표 올리기(관리자 전용). 판정·호출은 useProfile 1벌, 여기는 그리기만.
    isAdmin,
    promotingTripId,
    handleSetRepresentative,
  } = profile;

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 SSOT = X 는 **화면에서만 감춘다. DB 는 무조건 남는다.**
  //   옛 handleDeleteTrip(DELETE /api/itineraries/:id = DB 영구삭제) 완전삭제 §19.
  //   ⚠️ 훅을 여기서 직접 부르지 않는다(§22 판단검증) = useProfile 이 1번만 부른 것을 받아 쓴다.
  //     각자 부르면 같은 저장소 열쇠를 서로 덮어써 여정 X → 영상 X 순서에서 앞의 숨김이 사라진다.
  const { hiddenKeys, hiddenReady, hideCard } = profile;
  const visibleTrips = savedTrips.filter(
    (tr) => !hiddenKeys.includes(cardKey("trip", String(tr.id))),
  );

  // 아이폰 12 (390pt) 화면을 가득 채우는 넉넉하고 읽기 쉬운 카드 폭 (약 250pt)
  const fullCardWidth = getResponsiveFullTripCardWidth();

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleHeader}>
        <View
          style={[
            styles.sectionIconBox,
            { backgroundColor: "rgba(66, 133, 244, 0.12)" },
          ]}
        >
          <Icon name="map" size={18} color={Brand.primary} />
        </View>
        <ThemedText style={styles.sectionTitle}>나의 여정</ThemedText>
        {visibleTrips.length > 0 && (
          <Text style={styles.sectionBadge}>{visibleTrips.length}</Text>
        )}
      </View>

      {isLoadingTrips || !hiddenReady ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Brand.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            불러오는 중...
          </Text>
        </View>
      ) : visibleTrips.length === 0 ? (
        <View
          style={[
            styles.emptyTrips,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
        >
          <Icon name="map" size={36} color={theme.textTertiary} />
          <Text style={[styles.emptyTripsText, { color: theme.textSecondary }]}>
            저장된 여행이 없어요
          </Text>
          <Text style={[styles.emptyTripsHint, { color: theme.textTertiary }]}>
            일정을 생성하고 저장해보세요!
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tripsScroll}
        >
          {visibleTrips.map((trip) => (
            <Pressable
              key={trip.id}
              style={[
                styles.tripCardRich,
                {
                  width: fullCardWidth,
                },
              ]}
              onPress={() =>
                navigation.navigate("Main", {
                  screen: "Home",
                  params: { itineraryId: trip.id },
                } as any)
              }
            >
              {/* 🏆 대표 올리기 = **관리자에게만** 그린다 = 일반 사용자 카드는 이 자리 자체가 없다(화면 100% 그대로).
                  §23 = 아이콘 하나 = 별. 채운 별 = 지금 그 도시 카드에 걸린 대표 / 빈 별 = 아님.
                  누르면 서버가 같은 도시의 옛 대표를 내리고 이 여정을 올린다 = 화면은 목록만 다시 읽는다(§0 = 로직 1벌). */}
              {isAdmin && (
                <Pressable
                  style={styles.cardRepBtnRich}
                  hitSlop={8}
                  disabled={promotingTripId === trip.id}
                  // 아이콘뿐인 버튼 = 스크린리더용 이름 필수(2026-08-03 §22 판단검증)
                  accessibilityRole="button"
                  accessibilityLabel={
                    trip.status === "representative" ? "대표" : "대표 올리기"
                  }
                  onPress={(e) => {
                    e.stopPropagation();
                    handleSetRepresentative(trip.id);
                  }}
                >
                  {promotingTripId === trip.id ? (
                    <ActivityIndicator size="small" color={Brand.primary} />
                  ) : (
                    <Icon
                      name="star"
                      size={13}
                      color={
                        trip.status === "representative"
                          ? Brand.primary
                          : "#64748B"
                      }
                      fill={
                        trip.status === "representative"
                          ? Brand.primary
                          : "none"
                      }
                    />
                  )}
                </Pressable>
              )}

              {/* 우측 상단 X = 이 기기에서만 숨김(기억됨). DB 는 건드리지 않는다.
                  아이콘뿐인 버튼 = 스크린리더용 이름 필수(2026-08-03 §22 판단검증) — TRIPIS 카드와 같은 문구 1벌 */}
              <Pressable
                style={styles.cardDeleteBtnRich}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="숨기기"
                onPress={(e) => {
                  e.stopPropagation();
                  hideCard(cardKey("trip", String(trip.id)));
                }}
              >
                <Icon name="x" size={13} color="#64748B" />
              </Pressable>

              {/* 1. 도시명 = 관리자일 때만 별 자리만큼 오른쪽 여백을 더 준다(일반 사용자 = 옛 값 24 그대로) */}
              <View
                style={[styles.cardHeaderRow, isAdmin && { paddingRight: 54 }]}
              >
                <Text style={styles.cardCityRich} numberOfLines={1}>
                  {trip.rawData?.destination || trip.title}
                </Text>
              </View>

              {/* 2. 기간 */}
              <Text style={styles.cardMetaRich} numberOfLines={1}>
                {shortDateCard(trip.startDate)} - {shortDateCard(trip.endDate)}
              </Text>

              {/* 3. 예산 뱃지 */}
              {(() => {
                const per = (trip.rawData?.days || []).reduce(
                  (s, d) => s + (d.dailyCost?.perPersonEur || 0),
                  0,
                );
                if (per <= 0) return null;
                return (
                  <Text style={styles.cardBudgetPill}>
                    1인 €{per.toFixed(0)}
                  </Text>
                );
              })()}

              {/* 4. 요약 */}
              <Text style={styles.cardSummaryRich} numberOfLines={2}>
                {summaryLineCard(trip, t)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
