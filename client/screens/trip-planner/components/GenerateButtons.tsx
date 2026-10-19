import React from "react";
import { Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import { inputStyles as styles } from "../styles/input";
import type { PlannerApi } from "../hooks/useTripPlanner";

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 버튼 두 개(모든 사용자) = 위 "인기 명소 고르기"(도시 칩·카드로 고른 준비된 도시 · 도심 출발일 때만 보임 · 목록 → 예상 여정 · 바이브는 안 씀 · 날짜·동행·밀도·예산·이동은 씀) · 아래 "내 취향대로"(바이브까지 반영해 바로 생성) (정본 §)
export default function GenerateButtons({
  planner,
  showPick,
}: {
  planner: PlannerApi;
  showPick: boolean;
}) {
  const { t, openBestList, handleGenerate } = planner;
  const all = [
    {
      key: "pick",
      icon: "award",
      label: t("trip.pickPopular"),
      onPress: openBestList,
    },
    {
      key: "mine",
      icon: "navigation",
      label: t("trip.myTaste"),
      onPress: () => handleGenerate(),
    },
  ] as const;
  const buttons = showPick ? all : all.filter((b) => b.key !== "pick");
  return (
    <>
      {buttons.map((b, i) => (
        <Pressable
          key={b.key}
          style={[styles.generateButton, i > 0 && styles.generateButtonNext]}
          onPress={b.onPress}
        >
          <LinearGradient
            colors={[Brand.primary, Brand.secondary]}
            style={styles.generateGradient}
          >
            <Icon name={b.icon} size={20} color="#FFFFFF" />
            <Text style={styles.generateText}>{b.label}</Text>
          </LinearGradient>
        </Pressable>
      ))}
    </>
  );
}
