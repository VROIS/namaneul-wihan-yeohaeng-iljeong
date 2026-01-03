import React, { useState } from "react";
import { View, FlatList, StyleSheet, TextInput, Pressable, Text, Dimensions, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Spacing, BorderRadius, Brand, Typography, Colors } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const RECENT_TRIPS = [
  { 
    id: 1, 
    title: "파리 3일 여행", 
    destination: "파리, 프랑스", 
    dates: "2024.12.24 - 12.26",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34",
    vibeScore: 9.2,
    status: "completed"
  },
  { 
    id: 2, 
    title: "도쿄 맛집 투어", 
    destination: "도쿄, 일본", 
    dates: "2025.01.15 - 01.18",
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
    vibeScore: 8.7,
    status: "upcoming"
  },
];

const POPULAR_DESTINATIONS = [
  { id: 1, name: "파리", country: "프랑스", image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34", score: 9.2 },
  { id: 2, name: "도쿄", country: "일본", image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf", score: 8.7 },
  { id: 3, name: "바르셀로나", country: "스페인", image: "https://images.unsplash.com/photo-1583422409516-2895a77efded", score: 8.4 },
  { id: 4, name: "뉴욕", country: "미국", image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9", score: 8.9 },
];

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <LinearGradient
        colors={Brand.gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>VibeTrip</Text>
          <Text style={styles.heroSubtitle}>
            당신만을 위한{"\n"}초개인화 AI 여행 에이전트
          </Text>
          <Pressable
            style={styles.heroButton}
            onPress={() => navigation.navigate("PlanModal")}
          >
            <Text style={styles.heroButtonText}>새 여정 시작하기</Text>
            <Feather name="arrow-right" size={18} color={Brand.primary} />
          </Pressable>
        </View>
        <View style={styles.heroIconContainer}>
          <Feather name="navigation" size={80} color="rgba(255,255,255,0.2)" />
        </View>
      </LinearGradient>

      {RECENT_TRIPS.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>나의 여정</ThemedText>
            <Pressable>
              <ThemedText style={[styles.sectionLink, { color: Brand.primary }]}>전체 보기</ThemedText>
            </Pressable>
          </View>
          <FlatList
            horizontal
            data={RECENT_TRIPS}
            keyExtractor={(item) => item.id.toString()}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tripListContainer}
            renderItem={({ item }) => (
              <Pressable style={[styles.tripCard, { backgroundColor: theme.backgroundDefault }]}>
                <Image
                  source={{ uri: item.image }}
                  style={styles.tripCardImage}
                  contentFit="cover"
                />
                <View style={styles.tripCardContent}>
                  <Text style={[styles.tripCardTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[styles.tripCardSubtitle, { color: theme.textSecondary }]}>{item.dates}</Text>
                  <View style={styles.tripCardBadge}>
                    <LinearGradient
                      colors={Brand.gradient as [string, string]}
                      style={styles.vibeScoreBadge}
                    >
                      <Text style={styles.vibeScoreText}>{item.vibeScore}</Text>
                    </LinearGradient>
                    <Text style={[styles.tripStatus, { 
                      color: item.status === "upcoming" ? Brand.primary : theme.textTertiary 
                    }]}>
                      {item.status === "upcoming" ? "예정됨" : "완료"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>인기 여행지</ThemedText>
        </View>
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl + 60,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      ListHeaderComponent={renderHeader}
      data={POPULAR_DESTINATIONS}
      numColumns={2}
      columnWrapperStyle={styles.destinationRow}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => navigation.navigate("DestinationDetail", { placeId: item.id })}
          style={({ pressed }) => [
            styles.destinationCard,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Image
            source={{ uri: item.image }}
            style={styles.destinationImage}
            contentFit="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.destinationGradient}
          />
          <LinearGradient
            colors={Brand.gradient as [string, string]}
            style={styles.destinationScore}
          >
            <Text style={styles.destinationScoreText}>{item.score}</Text>
          </LinearGradient>
          <View style={styles.destinationContent}>
            <Text style={styles.destinationName}>{item.name}</Text>
            <Text style={styles.destinationCountry}>{item.country}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 3) / 2;

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: Spacing.lg,
  },
  heroCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    minHeight: 180,
    flexDirection: "row",
    overflow: "hidden",
  },
  heroContent: {
    flex: 1,
  },
  heroTitle: {
    ...Typography.display,
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    ...Typography.body,
    color: "rgba(255,255,255,0.9)",
    marginBottom: Spacing.lg,
    lineHeight: 24,
  },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
    gap: Spacing.sm,
  },
  heroButtonText: {
    ...Typography.label,
    color: Brand.primary,
    fontWeight: "700",
  },
  heroIconContainer: {
    position: "absolute",
    right: -20,
    bottom: -20,
    opacity: 0.5,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h2,
  },
  sectionLink: {
    ...Typography.label,
  },
  tripListContainer: {
    gap: Spacing.md,
  },
  tripCard: {
    width: 260,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  tripCardImage: {
    width: "100%",
    height: 120,
  },
  tripCardContent: {
    padding: Spacing.md,
  },
  tripCardTitle: {
    ...Typography.h3,
    marginBottom: 2,
  },
  tripCardSubtitle: {
    ...Typography.caption,
    marginBottom: Spacing.sm,
  },
  tripCardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  vibeScoreBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  vibeScoreText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  tripStatus: {
    ...Typography.caption,
  },
  destinationRow: {
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  destinationCard: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.3,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  destinationImage: {
    width: "100%",
    height: "100%",
  },
  destinationGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  destinationScore: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  destinationScoreText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  destinationContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
  },
  destinationName: {
    ...Typography.h3,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  destinationCountry: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.8)",
  },
});
