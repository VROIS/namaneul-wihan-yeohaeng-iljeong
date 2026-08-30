// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 진행표시를 큰 아이콘박스 대신 압축 1줄 바(작은 스피너+
import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Brand, Spacing, Fonts } from "@/constants/theme";
import LoadingCarousel from "./components/LoadingCarousel";
import type { PlannerApi } from "./hooks/useTripPlanner";

export default function LoadingStep({ planner }: { planner: PlannerApi }) {
  const { theme, LOADING_MESSAGES, loadingStep, carouselOpen, insets } =
    planner;

  return (
    <View
      style={[
        styles.loadingContainer,
        { backgroundColor: theme.backgroundRoot },
        carouselOpen
          ? [
              styles.loadingContainerOpen,
              {
                // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 실측 지적 = 상단바가 화면 맨 위에 바짝 붙어
                paddingTop: Math.max(22, insets.top + 14),
                paddingBottom: 55 + insets.bottom + Spacing.lg,
              },
            ]
          : styles.loadingContainerCentered,
      ]}
    >
      <View style={styles.progressRow}>
        <ActivityIndicator size="small" color={Brand.primary} />
        <Text style={[styles.progressBrand, { color: Brand.primary }]}>
          TRIPIS
        </Text>
        <View
          style={[styles.progressDivider, { backgroundColor: theme.border }]}
        />
        <Text
          style={[styles.progressMessage, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {LOADING_MESSAGES[loadingStep]}
        </Text>
      </View>

      {carouselOpen && (
        <View style={styles.carouselArea}>
          <LoadingCarousel theme={theme} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  loadingContainerCentered: {
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  loadingContainerOpen: {
    justifyContent: "flex-start",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    maxWidth: "100%",
  },
  progressBrand: {
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  progressDivider: {
    width: 1,
    height: 14,
  },
  progressMessage: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    flexShrink: 1,
  },
  carouselArea: {
    width: "100%",
    marginTop: Spacing.lg,
    // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = flex:1 = 남은 세로공간을 실측(onLayout)해
    flex: 1,
  },
});
