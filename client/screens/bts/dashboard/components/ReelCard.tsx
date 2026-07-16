// BTSDashboardScreen 분리(2026-07-16 §0 슬림화, 순수 이동) — 릴스 스타일 미리보기 카드
import React from "react";
import { View, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { BTSColors } from "@/constants/bts-theme";
import { CAT_COLORS } from "../constants";
import { styles, REEL_W } from "../styles";

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

export default function ReelCard({ place, index, scrollX }: ReelCardProps) {
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
