// 로딩 화면(Loading step) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 진행표시를 큰 아이콘박스 대신 압축 1줄 바(작은 스피너+
//   TRIPIS+구분선+메시지)로 교체 = 카드를 "폰처럼" 최대한 크게 보이려면 상단 여백을 최소화해야 함(사장님
//   지시: "상단을 이젼2번졔 시안처럼 1줄로 만들어야함"). 로고 이미지(tripis-mark.png)는 이 맥락에서 제거
//   (작은 스피너 옆엔 텍스트 워드마크만, 이미지+스피너 중첩은 이 크기에서 불필요).
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
                //   보임(세이프에어리어 미반영). InputStep.tsx:137과 동일 공식으로 통일(§16 재사용).
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
    //   LoadingCarousel이 그 안에서 9:16 비율로 카드를 알아서 줄인다(탭바 겹침 방지, useRingLayout과 동일 원리).
    flex: 1,
  },
});
