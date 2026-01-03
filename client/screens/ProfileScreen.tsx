import React, { useState } from "react";
import { View, StyleSheet, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Brand, Typography, Shadows } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const [persona, setPersona] = useState<"luxury" | "comfort">("comfort");

  const stats = [
    { label: "여행", value: "12", icon: "map" },
    { label: "방문", value: "48", icon: "map-pin" },
    { label: "저장", value: "156", icon: "bookmark" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl + 60,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={styles.profileCard}>
        <LinearGradient
          colors={persona === "luxury" ? [Brand.luxuryGold, "#F97316"] : [Brand.comfortBlue, "#06B6D4"]}
          style={styles.avatarGradient}
        >
          <Feather name="user" size={36} color="#FFFFFF" />
        </LinearGradient>
        <ThemedText style={styles.userName}>여행자</ThemedText>
        <Text style={[styles.userEmail, { color: theme.textSecondary }]}>traveler@vibetrip.app</Text>
      </View>

      <View style={styles.statsRow}>
        {stats.map((stat, index) => (
          <View key={index} style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name={stat.icon as any} size={20} color={Brand.primary} style={styles.statIcon} />
            <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>여행 스타일</ThemedText>
        <View style={styles.personaContainer}>
          <Pressable
            style={[
              styles.personaCard,
              { backgroundColor: theme.backgroundDefault },
              persona === "luxury" && { borderColor: Brand.luxuryGold, borderWidth: 2 }
            ]}
            onPress={() => setPersona("luxury")}
          >
            <View style={[styles.personaIcon, { backgroundColor: `${Brand.luxuryGold}20` }]}>
              <Feather name="star" size={24} color={Brand.luxuryGold} />
            </View>
            <Text style={[styles.personaTitle, { color: theme.text }]}>럭셔리</Text>
            <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>프리미엄 경험</Text>
          </Pressable>

          <Pressable
            style={[
              styles.personaCard,
              { backgroundColor: theme.backgroundDefault },
              persona === "comfort" && { borderColor: Brand.comfortBlue, borderWidth: 2 }
            ]}
            onPress={() => setPersona("comfort")}
          >
            <View style={[styles.personaIcon, { backgroundColor: `${Brand.comfortBlue}20` }]}>
              <Feather name="heart" size={24} color={Brand.comfortBlue} />
            </View>
            <Text style={[styles.personaTitle, { color: theme.text }]}>편안함</Text>
            <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>안전한 여행</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>설정</ThemedText>
        <View style={[styles.menuCard, { backgroundColor: theme.backgroundDefault }]}>
          {[
            { icon: "bell", label: "알림 설정" },
            { icon: "globe", label: "언어 설정" },
            { icon: "shield", label: "개인정보 보호" },
            { icon: "help-circle", label: "도움말" },
          ].map((item, index) => (
            <Pressable
              key={index}
              style={[
                styles.menuItem,
                index < 3 && { borderBottomWidth: 1, borderBottomColor: theme.border }
              ]}
            >
              <View style={styles.menuItemLeft}>
                <Feather name={item.icon as any} size={20} color={theme.textSecondary} />
                <Text style={[styles.menuItemLabel, { color: theme.text }]}>{item.label}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textTertiary} />
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
    ...Shadows.fab,
  },
  userName: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  userEmail: {
    ...Typography.small,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  statIcon: {
    marginBottom: Spacing.sm,
  },
  statValue: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    ...Typography.caption,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  personaContainer: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  personaCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  personaIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  personaTitle: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  personaDesc: {
    ...Typography.caption,
  },
  menuCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  menuItemLabel: {
    ...Typography.body,
  },
});
