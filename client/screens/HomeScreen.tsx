import React, { useState } from "react";
import { View, StyleSheet, Pressable, Text, useColorScheme, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Spacing, BorderRadius, Brand, Typography, Colors } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScrollView 
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl + 60,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.logoContainer}>
          <LinearGradient
            colors={Brand.gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoGradient}
          >
            <Feather name="navigation" size={32} color="#FFFFFF" />
          </LinearGradient>
        </View>
        
        <ThemedText style={styles.heroTitle}>VibeTrip</ThemedText>
        <ThemedText style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
          초개인화 AI 여행 에이전트
        </ThemedText>
        
        <Text style={[styles.heroDescription, { color: theme.textSecondary }]}>
          당신의 감성과 취향을 분석하여{"\n"}
          실패 없는 완벽한 여행을 설계합니다
        </Text>
      </View>

      <View style={styles.featuresSection}>
        <View style={[styles.featureCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={[styles.featureIcon, { backgroundColor: `${Brand.primary}15` }]}>
            <Feather name="users" size={24} color={Brand.primary} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureTitle, { color: theme.text }]}>주인공 중심 큐레이션</Text>
            <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
              가족 중 누구를 위한 여행인지에 따라 완전히 다른 일정 제안
            </Text>
          </View>
        </View>

        <View style={[styles.featureCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={[styles.featureIcon, { backgroundColor: `${Brand.secondary}15` }]}>
            <Feather name="zap" size={24} color={Brand.secondary} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureTitle, { color: theme.text }]}>Vibe 기반 추천</Text>
            <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
              힐링, 모험, 미식 등 원하는 감성으로 여행지 최적화
            </Text>
          </View>
        </View>

        <View style={[styles.featureCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={[styles.featureIcon, { backgroundColor: `${Brand.comfortBlue}15` }]}>
            <Feather name="shield" size={24} color={Brand.comfortBlue} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureTitle, { color: theme.text }]}>Reality Check</Text>
            <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
              실시간 날씨, 혼잡도, 운영 현황 반영한 신뢰도 검증
            </Text>
          </View>
        </View>

        <View style={[styles.featureCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={[styles.featureIcon, { backgroundColor: `${Brand.luxuryGold}15` }]}>
            <Feather name="clock" size={24} color={Brand.luxuryGold} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureTitle, { color: theme.text }]}>렌터카식 시간표</Text>
            <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
              시작/종료 시간까지 분 단위로 정밀한 일정 설계
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        style={styles.ctaButton}
        onPress={() => navigation.navigate("PlanModal")}
      >
        <LinearGradient
          colors={Brand.gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaGradient}
        >
          <Text style={styles.ctaText}>새 여정 시작하기</Text>
          <Feather name="arrow-right" size={20} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
    paddingTop: Spacing.xl,
  },
  logoContainer: {
    marginBottom: Spacing.lg,
  },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  heroTitle: {
    ...Typography.display,
    fontSize: 36,
    marginBottom: Spacing.xs,
  },
  heroSubtitle: {
    ...Typography.h3,
    marginBottom: Spacing.lg,
  },
  heroDescription: {
    ...Typography.body,
    textAlign: "center",
    lineHeight: 24,
  },
  featuresSection: {
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...Typography.label,
    fontWeight: "600",
    marginBottom: 2,
  },
  featureDesc: {
    ...Typography.small,
  },
  ctaButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  ctaGradient: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: 56,
    gap: Spacing.sm,
  },
  ctaText: {
    ...Typography.h3,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
