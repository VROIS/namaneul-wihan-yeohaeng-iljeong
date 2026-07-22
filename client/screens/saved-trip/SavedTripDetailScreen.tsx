// 저장된 여정 상세 화면 = client/screens/SavedTripDetailScreen.tsx(645줄) 분리(2026-07-15 §0 슬림화 → saved-trip/ 폴더 완전분리, 순수 이동)
import React from "react";
import {
  View,
  Text,
  ScrollView,
  useColorScheme,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";

import { Spacing, Brand, Colors } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import Icon from "@/components/Icon";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useVideoGeneration } from "./hooks/useVideoGeneration";
import { styles } from "./styles";

export default function SavedTripDetailScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "SavedTripDetail">>();
  const { itineraryId } = route.params;

  const { itinerary, isLoading, totalDays, doneDays } = useVideoGeneration({
    itineraryId,
  });

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Brand.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            {t("saved.loading")}
          </Text>
        </View>
      </View>
    );
  }

  if (!itinerary) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={48} color={theme.textTertiary} />
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            {t("saved.notFound")}
          </Text>
        </View>
      </View>
    );
  }

  // 라벨 매핑
  const curationLabels: Record<string, string> = {
    Kids: t("labels.curationKids"),
    Parents: t("labels.curationParents"),
    Everyone: t("labels.curationEveryone"),
    Self: t("labels.curationSelf"),
  };
  const companionLabels: Record<string, string> = {
    Single: t("labels.companionSingle"),
    Couple: t("labels.companionCouple"),
    Family: t("labels.companionFamily"),
    ExtendedFamily: t("labels.companionExtended"),
    Group: t("labels.companionGroup"),
  };
  const paceLabels: Record<string, string> = {
    Relaxed: t("labels.paceRelaxed"),
    Normal: t("labels.paceNormal"),
    Packed: t("labels.pacePacked"),
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.md,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.title}>{itinerary.title}</ThemedText>
        </View>

        {/* 🎬 지브리 여행 만화영상 진입 카드 = 일별 생성·진행률·재생·저장은 VideoPreviewScreen 1벌 담당 (2026-07-22 §16) */}
        <Pressable
          style={[
            styles.videoCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
          onPress={() => navigation.navigate("VideoPreview", { itineraryId })}
        >
          <LinearGradient
            colors={[`${Brand.primary}20`, `${Brand.secondary}10`]}
            style={styles.videoCardGradient}
          >
            <View style={styles.videoCardHeader}>
              <Icon name="film" size={24} color={Brand.primary} />
              <Text style={[styles.videoCardTitle, { color: theme.text }]}>
                지브리 여행 만화영상
              </Text>
            </View>
            <Text
              style={[styles.videoCardDesc, { color: theme.textSecondary }]}
            >
              {doneDays > 0
                ? `${totalDays}일 중 ${doneDays}일 생성됨 · 눌러서 보기`
                : "나의 일정이 코믹한 지브리 애니메이션이 됩니다 · 눌러서 만들기"}
            </Text>
          </LinearGradient>
        </Pressable>

        {/* 일정 정보 */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <Text style={[styles.infoTitle, { color: theme.text }]}>
            {t("saved.tripInfo")}
          </Text>

          <View style={styles.infoRow}>
            <Icon name="calendar" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t("saved.date")}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {itinerary.startDate?.split("T")[0]} ~{" "}
              {itinerary.endDate?.split("T")[0]}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Icon name="users" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t("saved.companion")}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {companionLabels[itinerary.companionType] ||
                itinerary.companionType}{" "}
              ({itinerary.companionCount}명)
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Icon name="heart" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t("saved.curationFocus")}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {curationLabels[itinerary.curationFocus] ||
                itinerary.curationFocus}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Icon name="zap" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t("saved.travelPace")}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {paceLabels[itinerary.travelPace] || itinerary.travelPace}
            </Text>
          </View>

          {itinerary.vibes && itinerary.vibes.length > 0 && (
            <View style={styles.vibesRow}>
              <Icon name="star" size={16} color={theme.textSecondary} />
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                {t("saved.vibes")}
              </Text>
              <View style={styles.vibesTags}>
                {itinerary.vibes.map((vibe: string, index: number) => (
                  <View
                    key={index}
                    style={[
                      styles.vibeTag,
                      { backgroundColor: `${Brand.primary}15` },
                    ]}
                  >
                    <Text
                      style={[styles.vibeTagText, { color: Brand.primary }]}
                    >
                      {vibe}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
