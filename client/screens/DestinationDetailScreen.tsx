import React from "react";
import { View, StyleSheet, Text, ScrollView, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { Typography, Spacing, BorderRadius, Brand, Shadows, getVibeScoreGradient } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HERO_HEIGHT = SCREEN_WIDTH * 9 / 16;

type RouteParams = RouteProp<RootStackParamList, "DestinationDetail">;

export default function DestinationDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const { theme, isDark } = useTheme();
  const { placeId } = route.params;

  const { data: place, isLoading } = useQuery({
    queryKey: ["/api/places", placeId],
  });

  const vibeScore = place?.finalScore ?? 7.5;
  const vibeGradient = getVibeScoreGradient(vibeScore);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: place?.photoUrls?.[0] || "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b" }}
            style={styles.heroImage}
            contentFit="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.heroGradient}
          />
          
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { top: insets.top + Spacing.sm }]}
          >
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={styles.backButtonBlur}>
              <Feather name="arrow-left" size={24} color={theme.text} />
            </BlurView>
          </Pressable>

          <Pressable style={[styles.saveButton, { top: insets.top + Spacing.sm }]}>
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={styles.backButtonBlur}>
              <Feather name="bookmark" size={24} color={theme.text} />
            </BlurView>
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <ThemedText style={styles.title}>
                {place?.name || "로딩 중..."}
              </ThemedText>
              <View style={styles.locationRow}>
                <Feather name="map-pin" size={14} color={theme.textSecondary} />
                <Text style={[styles.location, { color: theme.textSecondary }]}>
                  {place?.address || "주소 정보 없음"}
                </Text>
              </View>
            </View>

            <View style={styles.vibeScoreContainer}>
              <LinearGradient
                colors={vibeGradient as [string, string]}
                style={styles.vibeScoreCircle}
              >
                <Text style={styles.vibeScoreText}>{vibeScore.toFixed(1)}</Text>
              </LinearGradient>
              <Text style={[styles.vibeLabel, { color: theme.textSecondary }]}>Vibe</Text>
            </View>
          </View>

          <View style={styles.tagsContainer}>
            {(place?.vibeKeywords as string[] || ["힙한", "인스타그래머블"]).map((tag, index) => (
              <View key={index} style={[styles.tag, { backgroundColor: `${Brand.primary}15` }]}>
                <Text style={[styles.tagText, { color: Brand.primary }]}>{tag}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.cardHeader}>
              <Feather name="zap" size={20} color={Brand.primary} />
              <ThemedText style={styles.cardTitle}>AI 분석</ThemedText>
            </View>
            <Text style={[styles.cardContent, { color: theme.textSecondary }]}>
              이 장소는 현지인들에게 사랑받는 곳으로, 특히 사진 촬영하기 좋은 분위기가 특징입니다. 
              방문객 리뷰를 분석한 결과, 분위기와 서비스에서 높은 평가를 받고 있습니다.
            </Text>
          </View>

          {place?.type === "restaurant" && place?.isVerified && (
            <View style={[styles.card, { backgroundColor: `${Brand.comfortBlue}10` }]}>
              <View style={styles.cardHeader}>
                <Feather name="check-circle" size={20} color={Brand.comfortBlue} />
                <Text style={[styles.cardTitle, { color: Brand.comfortBlue }]}>맛집 인증</Text>
              </View>
              <Text style={[styles.cardContent, { color: theme.textSecondary }]}>
                현지인 리뷰 분석 결과, 이 레스토랑은 오리지널 맛을 유지하고 있는 것으로 확인되었습니다.
              </Text>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.cardHeader}>
              <Feather name="cloud" size={20} color={Brand.warning} />
              <ThemedText style={styles.cardTitle}>실시간 정보</ThemedText>
            </View>
            <Text style={[styles.cardContent, { color: theme.textSecondary }]}>
              현재 날씨: 맑음 22°C{"\n"}
              혼잡도: 보통
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  heroContainer: {
    height: HERO_HEIGHT,
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  backButton: {
    position: "absolute",
    left: Spacing.lg,
    zIndex: 10,
  },
  saveButton: {
    position: "absolute",
    right: Spacing.lg,
    zIndex: 10,
  },
  backButtonBlur: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  titleContainer: {
    flex: 1,
    marginRight: Spacing.md,
  },
  title: {
    ...Typography.h1,
    marginBottom: Spacing.xs,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  location: {
    ...Typography.small,
  },
  vibeScoreContainer: {
    alignItems: "center",
  },
  vibeScoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    ...Shadows.fab,
  },
  vibeScoreText: {
    ...Typography.h2,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  vibeLabel: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  tagText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    ...Typography.h3,
  },
  cardContent: {
    ...Typography.body,
    lineHeight: 24,
  },
});
