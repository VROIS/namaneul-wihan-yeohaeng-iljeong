/**
 * BTS 미니앱 - Scene 4: 결과 대시보드
 * 릴스 스타일 미리보기 + 스마트 타임라인 카드 + 저장/공유
 */

import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  StatusBar,
  ScrollView,
  FlatList,
  Share,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInUp,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { BTSColors, CharacterGradients, BTSBorderRadius } from "@/constants/bts-theme";
import { useBTS } from "@/contexts/BTSContext";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";

const { width: SCREEN_W } = Dimensions.get("window");
const REEL_W = SCREEN_W * 0.75;
const REEL_H = REEL_W * 1.2;

// 카테고리 → 색상 맵
const CAT_COLORS: Record<string, string> = {
  attraction: "#3B82F6",
  healing: "#10B981",
  restaurant: "#F59E0B",
  hotspot: "#EC4899",
  adventure: "#EF4444",
};

// ─── Reel Card (릴스 스타일 미리보기) ───
type ReelCardProps = {
  place: {
    name: string;
    description: string;
    startTime: string;
    image: string;
    tags: string[];
  };
  index: number;
  scrollX: { value: number };
};

function ReelCard({ place, index, scrollX }: ReelCardProps) {
  const inputRange = [
    (index - 1) * (REEL_W + 16),
    index * (REEL_W + 16),
    (index + 1) * (REEL_W + 16),
  ];

  const animStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.88, 1, 0.88], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.5, 1, 0.5], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const catColor = CAT_COLORS[place.tags?.[0] || ""] || BTSColors.neonPurple;

  return (
    <Animated.View style={[styles.reelCard, animStyle]}>
      <LinearGradient
        colors={[catColor + "40", BTSColors.spaceBlack]}
        style={styles.reelGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        {/* 카테고리 아이콘 */}
        <View style={[styles.reelCatBadge, { backgroundColor: catColor + "30" }]}>
          <Text style={[styles.reelCatText, { color: catColor }]}>
            {place.tags?.[0] || "spot"}
          </Text>
        </View>

        {/* 시간 */}
        <Text style={styles.reelTime}>{place.startTime}</Text>

        {/* 장소명 */}
        <Text style={styles.reelName} numberOfLines={2}>
          {place.name}
        </Text>

        {/* 설명 */}
        {place.description ? (
          <Text style={styles.reelDesc} numberOfLines={3}>
            {place.description}
          </Text>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Timeline Card ───
type TimelineCardProps = {
  place: {
    name: string;
    description: string;
    startTime: string;
    endTime: string;
    priceEstimate: string;
    tags: string[];
    // ⚠️ 2026-06-11 = nubiReason 폐기 → summaryKo 흡수통합 (후킹 숏폼 차별점)
    summaryKo: string | null;
  };
  index: number;
  isLast: boolean;
};

function TimelineCard({ place, index, isLast }: TimelineCardProps) {
  const catColor = CAT_COLORS[place.tags?.[0] || ""] || BTSColors.neonPurple;
  const catEmoji: Record<string, string> = {
    attraction: "🏛️",
    healing: "🧘",
    restaurant: "🍽️",
    hotspot: "📸",
    adventure: "🏔️",
  };

  return (
    <Animated.View
      entering={SlideInRight.delay(index * 100).springify()}
      style={styles.timelineRow}
    >
      {/* 타임라인 라인 */}
      <View style={styles.timelineLine}>
        <View style={[styles.timelineDot, { backgroundColor: catColor }]} />
        {!isLast && <View style={styles.timelineConnector} />}
      </View>

      {/* 카드 */}
      <View style={styles.timelineCard}>
        <View style={styles.timelineCardHeader}>
          <Text style={styles.timelineEmoji}>
            {catEmoji[place.tags?.[0] || ""] || "📍"}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.timelineName} numberOfLines={1}>
              {place.name}
            </Text>
            <Text style={styles.timelineTime}>
              {place.startTime} - {place.endTime}
            </Text>
          </View>
          {place.priceEstimate ? (
            <View style={styles.priceBadge}>
              <Text style={styles.priceText}>{place.priceEstimate}</Text>
            </View>
          ) : null}
        </View>

        {place.summaryKo && (
          <Text style={styles.timelineReason} numberOfLines={2}>
            💡 {place.summaryKo}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ───
export default function BTSDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const { itinerary, selectedCharacter, reset } = useBTS();
  const scrollX = useSharedValue(0);

  const day = itinerary?.days?.[0];
  const places = day?.places || [];

  const handleShare = useCallback(async () => {
    if (!itinerary) return;
    const placeList = places.map((p) => `  ${p.startTime} ${p.name}`).join("\n");
    try {
      await Share.share({
        message: `🎵 ${itinerary.title}\n\n${placeList}\n\n#TRIPIS #BTS투어 #방탄투어`,
      });
    } catch {}
  }, [itinerary, places]);

  const handleRestart = useCallback(() => {
    reset();
    navigation.popToTop();
  }, [reset, navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[BTSColors.deepViolet, BTSColors.spaceBlack]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.3 }}
      />

      {/* 헤더 */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.headerWrap}>
        <BlurView intensity={40} tint="dark" style={styles.header}>
          <Pressable onPress={handleRestart} style={styles.backBtn}>
            <Text style={styles.backText}>✕</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {itinerary?.title || "나만의 방탄 투어"}
            </Text>
          </View>
          <Pressable onPress={handleShare} style={styles.shareBtn}>
            <Text style={styles.shareIcon}>↗</Text>
          </Pressable>
        </BlurView>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* 릴스 프리뷰 */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.reelsSection}>
          <Text style={styles.sectionTitle}>미리보기</Text>
          <Text style={styles.sectionSub}>스와이프해서 장소를 탐색하세요</Text>

          <Animated.FlatList
            data={places}
            keyExtractor={(_, i) => `reel-${i}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={REEL_W + 16}
            decelerationRate="fast"
            contentContainerStyle={{
              paddingHorizontal: (SCREEN_W - REEL_W) / 2,
            }}
            onScroll={(e) => {
              scrollX.value = e.nativeEvent.contentOffset.x;
            }}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <View style={{ width: REEL_W, marginHorizontal: 8 }}>
                <ReelCard place={item} index={index} scrollX={scrollX} />
              </View>
            )}
          />
        </Animated.View>

        {/* 스마트 타임라인 */}
        <Animated.View entering={FadeInUp.delay(400)} style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>스마트 타임라인</Text>
          <Text style={styles.sectionSub}>
            {day?.city} · {places.length}곳 · {selectedCharacter?.name} 바이브
          </Text>

          {places.map((place, i) => (
            <TimelineCard
              key={`tl-${i}`}
              place={place}
              index={i}
              isLast={i === places.length - 1}
            />
          ))}
        </Animated.View>

        {/* 요약 */}
        <Animated.View entering={FadeInUp.delay(600)} style={styles.summarySection}>
          <LinearGradient
            colors={[BTSColors.purpleGlowLight, "transparent"]}
            style={styles.summaryCard}
          >
            <Text style={styles.summaryTitle}>📊 여행 요약</Text>
            <View style={styles.summaryRow}>
              <SummaryItem label="장소" value={`${places.length}곳`} />
              <SummaryItem label="예상 시간" value={`${places.length * 1.5}시간`} />
              <SummaryItem
                label="예상 비용"
                value={`€${places.reduce((sum, p) => sum + (parseFloat(p.priceEstimate?.replace("€", "") || "0")), 0).toFixed(0)}`}
              />
            </View>
          </LinearGradient>
        </Animated.View>
      </ScrollView>

      {/* 하단 액션 버튼 */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={handleRestart} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>처음부터 다시</Text>
        </Pressable>
        <Pressable onPress={handleShare} style={{ flex: 2 }}>
          <LinearGradient
            colors={[BTSColors.neonPurple, BTSColors.deepViolet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>🗺️ 이 일정 공유하기</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Summary Item ───
function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BTSColors.spaceBlack,
  },

  // Header
  headerWrap: {
    paddingHorizontal: 20,
    marginTop: 8,
    zIndex: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  backText: {
    color: BTSColors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BTSColors.textPrimary,
  },
  shareBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  shareIcon: {
    color: BTSColors.neonPurple,
    fontSize: 18,
    fontWeight: "700",
  },

  // Sections
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: BTSColors.textPrimary,
    paddingHorizontal: 24,
  },
  sectionSub: {
    fontSize: 12,
    color: BTSColors.textTertiary,
    paddingHorizontal: 24,
    marginTop: 4,
    marginBottom: 16,
  },

  // Reels
  reelsSection: {
    marginTop: 20,
  },
  reelCard: {
    height: REEL_H,
    borderRadius: BTSBorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  reelGradient: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 20,
  },
  reelCatBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reelCatText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reelTime: {
    fontSize: 14,
    fontWeight: "800",
    color: BTSColors.neonPurple,
    marginBottom: 6,
  },
  reelName: {
    fontSize: 22,
    fontWeight: "900",
    color: BTSColors.textPrimary,
    marginBottom: 6,
  },
  reelDesc: {
    fontSize: 13,
    color: BTSColors.textSecondary,
    lineHeight: 18,
  },

  // Timeline
  timelineSection: {
    marginTop: 32,
  },
  timelineRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  timelineLine: {
    width: 24,
    alignItems: "center",
    paddingTop: 6,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 4,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: BTSColors.backgroundCard,
    borderRadius: BTSBorderRadius.md,
    padding: 14,
    marginLeft: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  timelineCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timelineEmoji: {
    fontSize: 24,
  },
  timelineName: {
    fontSize: 15,
    fontWeight: "700",
    color: BTSColors.textPrimary,
  },
  timelineTime: {
    fontSize: 11,
    color: BTSColors.neonPurple,
    fontWeight: "600",
    marginTop: 2,
  },
  priceBadge: {
    backgroundColor: BTSColors.purpleGlowLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  priceText: {
    fontSize: 11,
    color: BTSColors.neonPurple,
    fontWeight: "700",
  },
  timelineReason: {
    fontSize: 12,
    color: BTSColors.textTertiary,
    marginTop: 8,
    lineHeight: 17,
  },

  // Summary
  summarySection: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  summaryCard: {
    borderRadius: BTSBorderRadius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BTSColors.textPrimary,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    gap: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "900",
    color: BTSColors.neonPurple,
  },
  summaryLabel: {
    fontSize: 12,
    color: BTSColors.textTertiary,
    fontWeight: "500",
  },

  // Bottom actions
  bottomActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: BTSColors.spaceBlack + "E0",
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: BTSBorderRadius["2xl"],
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: BTSColors.textSecondary,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: BTSBorderRadius["2xl"],
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
