// 🗂️ 나의 여정 섹션 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
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
import { styles } from "../styles";
import { shortDateCard, summaryLineCard } from "../utils";
import type { ProfileApi } from "../hooks/useProfile";

export default function TripsSection({ profile }: { profile: ProfileApi }) {
  const { theme, t, navigation, savedTrips, isLoadingTrips, handleDeleteTrip } =
    profile;

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>나의 여정</ThemedText>
      {isLoadingTrips ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Brand.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            불러오는 중...
          </Text>
        </View>
      ) : savedTrips.length === 0 ? (
        <View
          style={[
            styles.emptyTrips,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <Icon name="map" size={40} color={theme.textTertiary} />
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
          {savedTrips.map((trip) => (
            <Pressable
              key={trip.id}
              style={[
                styles.tripCard,
                { backgroundColor: theme.backgroundDefault },
              ]}
              onPress={() =>
                // 🗂️ 2026-07-03 사용자 SSOT = 나의여정 카드 탭 → 여정 생성화면(Home) 그대로 재현(SavedTripDetail 요약전용 아님).
                //   Main(탭)의 Home으로 itineraryId 전달 → TripPlanner가 GET으로 raw_data 불러와 renderResult 복원. (나의영상 카드는 SavedTripDetail 유지)
                navigation.navigate("Main", {
                  screen: "Home",
                  params: { itineraryId: trip.id },
                } as any)
              }
            >
              {/* 🗂️ 2026-07-03 사용자 SSOT = 여정 생성화면 헤더 4요소(도시·기간·예산·요약) 텍스트. 폰트·색=메인앱 통일(Fonts=Pretendard·Brand·textSecondary). */}
              {/* 1. 도시 = rawData.destination 우선, 없으면 title */}
              <Text
                style={[styles.cardCity, { color: theme.text }]}
                numberOfLines={1}
              >
                {trip.rawData?.destination || trip.title}
              </Text>
              {/* 2. 기간 = 26년 07-03 ~ 07-05 (메인앱 shortDate 동일 표기) */}
              <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                {shortDateCard(trip.startDate)} ~ {shortDateCard(trip.endDate)}
              </Text>
              {/* 3. 예산 = 1인 €N (rawData.days[].dailyCost.perPersonEur 합산) */}
              {(() => {
                const per = (trip.rawData?.days || []).reduce(
                  (s, d) => s + (d.dailyCost?.perPersonEur || 0),
                  0,
                );
                if (per <= 0) return null;
                return (
                  <Text style={[styles.cardBudget, { color: Brand.primary }]}>
                    {t("common.perPerson")} €{per.toFixed(0)}
                  </Text>
                );
              })()}
              {/* 4. 요약 = 동행(N명)·대상·vibe 조합 (결과화면 요약섹션2 위계) */}
              <Text
                style={[styles.cardSummary, { color: theme.text }]}
                numberOfLines={2}
              >
                {summaryLineCard(trip, t)}
              </Text>
              {Object.values(trip.videoByDay || {}).some(
                (v) => v?.status === "succeeded",
              ) && (
                <View style={styles.videoReadyBadge}>
                  <Icon name="film" size={12} color="#FFFFFF" />
                </View>
              )}
              {/* ⚠️ 2026-07-03 사장님 SSOT = 카드 우측 상단 X = 항상 표시, 터치 시 즉시 삭제(확인 없음). 카드 탭(복원)과 분리 위해 절대위치+전파차단. */}
              <Pressable
                style={styles.cardDeleteBtn}
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteTrip(trip.id);
                }}
              >
                <Icon name="x" size={14} color={theme.textSecondary} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
