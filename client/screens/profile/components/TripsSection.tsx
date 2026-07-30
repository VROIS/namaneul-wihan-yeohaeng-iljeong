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

export default function TripsSection({ profile }: { profile: ProfileApi }) {
  const { theme, t, navigation, savedTrips, isLoadingTrips, handleDeleteTrip } =
    profile;

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
        {savedTrips.length > 0 && (
          <Text style={styles.sectionBadge}>{savedTrips.length}</Text>
        )}
      </View>

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
          {savedTrips.map((trip) => (
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
              {/* 우측 상단 X 삭제 버튼 */}
              <Pressable
                style={styles.cardDeleteBtnRich}
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteTrip(trip.id);
                }}
              >
                <Icon name="x" size={13} color="#64748B" />
              </Pressable>

              {/* 1. 도시명 */}
              <View style={styles.cardHeaderRow}>
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
