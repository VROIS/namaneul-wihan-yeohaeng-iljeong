// 로딩 화면(Loading step) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Brand, Spacing, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import type { PlannerApi } from "./hooks/useTripPlanner";

export default function LoadingStep({ planner }: { planner: PlannerApi }) {
  const { theme, spin, LOADING_MESSAGES, loadingStep } = planner;

  return (
    <View
      style={[
        styles.loadingContainer,
        { backgroundColor: theme.backgroundRoot },
      ]}
    >
      <View
        style={[
          styles.loadingIconBox,
          { backgroundColor: `${Brand.primary}15` },
        ]}
      >
        <Animated.View
          style={
            Platform.OS === "web"
              ? styles.webSpinner
              : { transform: [{ rotate: spin }] }
          }
        >
          <View style={[styles.spinnerRing, { borderColor: Brand.primary }]} />
        </Animated.View>
        <Icon
          name="navigation"
          size={32}
          color={Brand.primary}
          style={styles.loadingIcon}
        />
      </View>
      <Text style={[styles.loadingTitle, { color: theme.text }]}>TRIPIS</Text>
      <Text style={[styles.loadingMessage, { color: theme.textSecondary }]}>
        {LOADING_MESSAGES[loadingStep]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  loadingIconBox: {
    width: 96,
    height: 96,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  spinnerRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 32,
    borderWidth: 4,
    borderTopColor: "transparent",
  },
  webSpinner: {},
  loadingIcon: { position: "absolute" },
  loadingTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.xs,
  },
  loadingMessage: { fontSize: 14, fontFamily: Fonts.semiBold },
});
