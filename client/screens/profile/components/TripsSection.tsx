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
import { displayCityName } from "@/lib/display-city-name";
import type { ProfileApi } from "../hooks/useProfile";
import { cardKey } from "../hooks/useHiddenCards";

export default function TripsSection({ profile }: { profile: ProfileApi }) {
  const {
    theme,
    t,
    navigation,
    savedTrips,
    isLoadingTrips,
    isAdmin,
    promotingTripId,
    handleSetRepresentative,
  } = profile;

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 SSOT = X 는 **화면에서만 감춘다. DB 는 무조건 남는다.**
  const { hiddenKeys, hiddenReady, hideCard } = profile;
  const visibleTrips = savedTrips.filter(
    (tr) => !hiddenKeys.includes(cardKey("trip", String(tr.id))),
  );

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
        <ThemedText style={styles.sectionTitle}>
          {t("profile.myTrips")}
        </ThemedText>
        {visibleTrips.length > 0 && (
          <Text style={styles.sectionBadge}>{visibleTrips.length}</Text>
        )}
      </View>

      {isLoadingTrips || !hiddenReady ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Brand.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            {t("saved.loading")}
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
            {t("profile.noSavedTripsHeading")}
          </Text>
          <Text style={[styles.emptyTripsHint, { color: theme.textTertiary }]}>
            {t("profile.noSavedTripsHint")}
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
                  accessibilityRole="button"
                  accessibilityLabel={
                    trip.status === "representative"
                      ? t("profile.representative")
                      : t("profile.setRepresentative")
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
                accessibilityLabel={t("common.hide")}
                onPress={(e) => {
                  e.stopPropagation();
                  hideCard(cardKey("trip", String(trip.id)));
                }}
              >
                <Icon name="x" size={13} color="#64748B" />
              </Pressable>

              {/* 1. 도시명 = 관리자일 때만 **왼쪽** 별 자리만큼 여백(2026-08-12 별 좌상단 이동 §22 지적 반영).
                  옛 오른쪽 54 보정 폐기 §19(별이 왼쪽으로 갔으므로 오른쪽은 X 버튼 몫 = cardHeaderRow 기본 24 그대로). */}
              <View
                style={[styles.cardHeaderRow, isAdmin && { paddingLeft: 32 }]}
              >
                {/* ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 도시명 = displayCityName 1벌(§16) =
                    결과화면 헤더·출발바와 같은 규칙(destinationEn → destination). 서버 목록 라우트가
                    읽을 때 cities.name_en 을 이어붙이므로 옛 여정도 영어로 나온다. */}
                <Text style={styles.cardCityRich} numberOfLines={1}>
                  {displayCityName(trip.rawData || {}) || trip.title}
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
                    {t("common.perPerson")} €{per.toFixed(0)}
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
