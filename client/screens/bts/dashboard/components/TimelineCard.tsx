// BTSDashboardScreen 분리(2026-07-16 §0 슬림화, 순수 이동) — 스마트 타임라인 카드
import React from "react";
import { View, Text } from "react-native";
import Animated, { SlideInRight } from "react-native-reanimated";

import { BTSColors } from "@/constants/bts-theme";
import { CAT_COLORS } from "../constants";
import { styles } from "../styles";

// ─── Timeline Card ───
type TimelineCardProps = {
  place: {
    name: string;
    description: string;
    startTime: string;
    endTime: string;
    priceEstimate: string;
    tags: string[];
    // 후킹 숏폼 차별점 = 한줄요약
    summaryKo: string | null;
  };
  index: number;
  isLast: boolean;
};

export default function TimelineCard({
  place,
  index,
  isLast,
}: TimelineCardProps) {
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
