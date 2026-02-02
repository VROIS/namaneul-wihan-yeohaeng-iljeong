import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text, Pressable, ScrollView, useColorScheme, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { Spacing, BorderRadius, Brand, Typography, Colors, Shadows } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import { apiRequest } from "@/lib/query-client";
import { getUserData } from "@/lib/auth";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

// 저장된 일정 타입
interface SavedItinerary {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  curationFocus: string;
  companionType: string;
  companionCount: number;
  vibes: string[];
  travelPace: string;
  videoStatus?: string;
  videoUrl?: string;
}

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [persona, setPersona] = useState<"luxury" | "comfort">("comfort");

  // 🗂️ 저장된 일정 목록
  const [savedTrips, setSavedTrips] = useState<SavedItinerary[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);

  // 저장된 일정 불러오기 (admin 고정)
  useEffect(() => {
    const loadSavedTrips = async () => {
      try {
        // 🔧 로그인 제거: admin으로 고정
        const response = await apiRequest("GET", `/api/users/admin/itineraries`);
        const trips = await response.json();
        setSavedTrips(trips || []);
      } catch (error) {
        console.error("[Profile] 일정 로드 오류:", error);
      } finally {
        setIsLoadingTrips(false);
      }
    };
    loadSavedTrips();
  }, []);

  const stats = [
    { label: "여행", value: String(savedTrips.length), icon: "map" },
    { label: "방문", value: String(savedTrips.reduce((sum, t) => sum + (t.companionCount || 0), 0)), icon: "map-pin" },
    { label: "저장", value: String(savedTrips.length), icon: "bookmark" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl + 60,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={styles.profileCard}>
        <LinearGradient
          colors={persona === "luxury" ? [Brand.luxuryGold, "#F97316"] : [Brand.comfortBlue, "#06B6D4"]}
          style={styles.avatarGradient}
        >
          <Feather name="user" size={36} color="#FFFFFF" />
        </LinearGradient>
        <ThemedText style={styles.userName}>여행자</ThemedText>
        <Text style={[styles.userEmail, { color: theme.textSecondary }]}>traveler@vibetrip.app</Text>
      </View>

      <View style={styles.statsRow}>
        {stats.map((stat, index) => (
          <View key={index} style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name={stat.icon as any} size={20} color={Brand.primary} style={styles.statIcon} />
            <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* 🗂️ 나의 여정 섹션 */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>나의 여정</ThemedText>
        {isLoadingTrips ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Brand.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>불러오는 중...</Text>
          </View>
        ) : savedTrips.length === 0 ? (
          <View style={[styles.emptyTrips, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="map" size={40} color={theme.textTertiary} />
            <Text style={[styles.emptyTripsText, { color: theme.textSecondary }]}>
              저장된 여행이 없어요
            </Text>
            <Text style={[styles.emptyTripsHint, { color: theme.textTertiary }]}>
              일정을 생성하고 저장해보세요!
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tripsScroll}>
            {savedTrips.map((trip) => (
              <Pressable
                key={trip.id}
                style={[styles.tripCard, { backgroundColor: theme.backgroundDefault }]}
                onPress={() => navigation.navigate("SavedTripDetail", { itineraryId: trip.id })}
              >
                <View style={styles.tripCardHeader}>
                  <View style={[styles.tripCardIcon, { backgroundColor: `${Brand.primary}20` }]}>
                    <Feather name="map-pin" size={20} color={Brand.primary} />
                  </View>
                  {trip.videoStatus === "succeeded" && (
                    <View style={styles.videoReadyBadge}>
                      <Feather name="film" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Text style={[styles.tripCardTitle, { color: theme.text }]} numberOfLines={1}>
                  {trip.title}
                </Text>
                <Text style={[styles.tripCardDate, { color: theme.textSecondary }]}>
                  {trip.startDate?.split("T")[0]} ~ {trip.endDate?.split("T")[0]}
                </Text>
                <View style={styles.tripCardTags}>
                  <View style={[styles.tripTag, { backgroundColor: `${Brand.primary}15` }]}>
                    <Text style={[styles.tripTagText, { color: Brand.primary }]}>
                      {trip.companionCount}명
                    </Text>
                  </View>
                  {trip.vibes?.[0] && (
                    <View style={[styles.tripTag, { backgroundColor: `${Brand.secondary}15` }]}>
                      <Text style={[styles.tripTagText, { color: Brand.secondary }]}>
                        {trip.vibes[0]}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* 🎬 나의 영상 섹션 */}
      {(() => {
        const videosReady = savedTrips.filter(t => t.videoStatus === "succeeded" && t.videoUrl);
        if (videosReady.length === 0) return null;
        
        return (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>🎬 나의 영상 ({videosReady.length})</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tripsScroll}>
              {videosReady.map((trip) => (
                <Pressable
                  key={trip.id}
                  style={[styles.videoCard, { backgroundColor: theme.backgroundDefault }]}
                  onPress={() => navigation.navigate("SavedTripDetail", { itineraryId: trip.id })}
                >
                  <View style={styles.videoThumbnail}>
                    <LinearGradient
                      colors={["#6366f1", "#8b5cf6"]}
                      style={styles.videoThumbnailGradient}
                    >
                      <Feather name="play-circle" size={32} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                  <Text style={[styles.videoCardTitle, { color: theme.text }]} numberOfLines={1}>
                    {trip.title}
                  </Text>
                  <Text style={[styles.videoCardDate, { color: theme.textSecondary }]}>
                    {trip.startDate?.split("T")[0]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        );
      })()}

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>여행 스타일</ThemedText>
        <View style={styles.personaContainer}>
          <Pressable
            style={[
              styles.personaCard,
              { backgroundColor: theme.backgroundDefault },
              persona === "luxury" && { borderColor: Brand.luxuryGold, borderWidth: 2 }
            ]}
            onPress={() => setPersona("luxury")}
          >
            <View style={[styles.personaIcon, { backgroundColor: `${Brand.luxuryGold}20` }]}>
              <Feather name="star" size={24} color={Brand.luxuryGold} />
            </View>
            <Text style={[styles.personaTitle, { color: theme.text }]}>럭셔리</Text>
            <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>프리미엄 경험</Text>
          </Pressable>

          <Pressable
            style={[
              styles.personaCard,
              { backgroundColor: theme.backgroundDefault },
              persona === "comfort" && { borderColor: Brand.comfortBlue, borderWidth: 2 }
            ]}
            onPress={() => setPersona("comfort")}
          >
            <View style={[styles.personaIcon, { backgroundColor: `${Brand.comfortBlue}20` }]}>
              <Feather name="heart" size={24} color={Brand.comfortBlue} />
            </View>
            <Text style={[styles.personaTitle, { color: theme.text }]}>편안함</Text>
            <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>안전한 여행</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>설정</ThemedText>
        <View style={[styles.menuCard, { backgroundColor: theme.backgroundDefault }]}>
          {[
            { icon: "bell", label: "알림 설정" },
            { icon: "globe", label: "언어 설정" },
            { icon: "shield", label: "개인정보 보호" },
            { icon: "help-circle", label: "도움말" },
          ].map((item, index) => (
            <Pressable
              key={index}
              style={[
                styles.menuItem,
                index < 3 && { borderBottomWidth: 1, borderBottomColor: theme.border }
              ]}
            >
              <View style={styles.menuItemLeft}>
                <Feather name={item.icon as any} size={20} color={theme.textSecondary} />
                <Text style={[styles.menuItemLabel, { color: theme.text }]}>{item.label}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textTertiary} />
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
    ...Shadows.fab,
  },
  userName: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  userEmail: {
    ...Typography.small,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  statIcon: {
    marginBottom: Spacing.sm,
  },
  statValue: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    ...Typography.caption,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  personaContainer: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  personaCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  personaIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  personaTitle: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  personaDesc: {
    ...Typography.caption,
  },
  menuCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  menuItemLabel: {
    ...Typography.body,
  },
  // 🗂️ 나의 여정 스타일
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyTrips: {
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  emptyTripsText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: Spacing.md,
  },
  emptyTripsHint: {
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  tripsScroll: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  tripCard: {
    width: 160,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  tripCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  videoReadyBadge: {
    backgroundColor: "#22c55e",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  tripCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  tripCardDate: {
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  tripCardTags: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  tripTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  tripTagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  // 🎬 나의 영상 스타일
  videoCard: {
    width: 140,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
  },
  videoThumbnail: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  videoThumbnailGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  videoCardTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  videoCardDate: {
    fontSize: 11,
  },
});
