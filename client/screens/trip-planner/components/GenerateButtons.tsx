import React from "react";
import { Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import { inputStyles as styles } from "../styles/input";
import type { PlannerApi } from "../hooks/useTripPlanner";

// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 입력 화면 아래 버튼 = "내 취향 여정" 하나(바이브까지 반영해 바로 생성) · 인기 명소 여정은 도시 카드 버튼에서 바로 목록으로 (정본 §)
export default function GenerateButtons({ planner }: { planner: PlannerApi }) {
  const { t, handleGenerate } = planner;
  return (
    <Pressable style={styles.generateButton} onPress={() => handleGenerate()}>
      <LinearGradient
        colors={[Brand.primary, Brand.secondary]}
        style={styles.generateGradient}
      >
        <Icon name="navigation" size={20} color="#FFFFFF" />
        <Text style={styles.generateText}>{t("trip.myTaste")}</Text>
      </LinearGradient>
    </Pressable>
  );
}
