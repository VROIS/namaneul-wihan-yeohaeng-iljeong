import React from "react";
import { View, Text } from "react-native";
import { Icon } from "@/components/Icon";
import type { Place, TransitInfo } from "@/types/trip";
import { resultStyles as styles } from "../styles/result";
import type { PlannerApi } from "../hooks/useTripPlanner";

export type TransitLeg = Partial<TransitInfo> & { distance?: number };

export function legFromPlace(place?: Place): TransitLeg | undefined {
  if (!place?.transit_min || place.transit_min <= 0) return undefined;
  return {
    mode: place.transit_mode,
    duration: place.transit_min,
    distance: Math.round((place.distance_from_prev_km ?? 0) * 1000),
  };
}

// ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 이동 칸 1벌(슬롯 사이 · 첫 이동 공용) · 아이콘 = 아래 화살표 (정본 §)
export default function TransitPill({
  leg,
  theme,
  t,
}: {
  leg: TransitLeg;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
}) {
  const rawMode = leg.mode || leg.modeLabel || "";
  let label = t("trip.transitPublic");
  if (rawMode === "guide" || rawMode === "private_guide") {
    label = t("trip.drivingGuide");
  } else if (rawMode === "walk") {
    label = t("trip.walking");
  }
  const dur = t("trip.durationM", { m: leg.duration || 0 });
  const dist = leg.distance ? `${(leg.distance / 1000).toFixed(1)}km` : "";
  return (
    <View style={styles.transitSection}>
      <View style={[styles.transitLine, { backgroundColor: theme.border }]} />
      <View
        style={[
          styles.transitCard,
          { backgroundColor: theme.backgroundSecondary },
        ]}
      >
        <Icon name="arrow-down" size={14} color={theme.textSecondary} />
        <Text style={[styles.transitText, { color: theme.textSecondary }]}>
          {`${label} ${dur}${dist ? ` · ${dist}` : ""}`}
        </Text>
      </View>
      <View style={[styles.transitLine, { backgroundColor: theme.border }]} />
    </View>
  );
}
