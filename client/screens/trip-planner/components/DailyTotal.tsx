// 일별 합계(입장료·식비·교통비) 섹션 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text } from "react-native";
import { Brand, Fonts } from "@/constants/theme";
import { resultStyles as styles } from "../styles/result";
import { DayPlan } from "@/types/trip";
import type { PlannerApi } from "../hooks/useTripPlanner";

export default function DailyTotal({
  currentDay,
  planner,
}: {
  currentDay: DayPlan;
  planner: PlannerApi;
}) {
  const { theme, t } = planner;
  // 백엔드 dailyCost에서 직접 읽기
  const dc = (currentDay as any)?.dailyCost;
  const td = (currentDay as any)?.transportDisplay;
  const entranceEur = dc?.breakdown?.entranceEur || 0;
  const mealEur = dc?.breakdown?.mealEur || 0;
  const transportEur = dc?.breakdown?.transportEur || 0;
  const totalEur = dc?.perPersonEur || entranceEur + mealEur + transportEur;
  return (
    <View
      style={[
        styles.dailyTotalSection,
        { backgroundColor: theme.backgroundSecondary },
      ]}
    >
      {/* 교통비 카테고리 표시 (A/B 분기) */}
      {td && (
        <View
          style={{
            backgroundColor: td.category === "guide" ? "#E3F2FD" : "#E8F5E9",
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: Fonts.bold,
              color: td.category === "guide" ? "#1565C0" : "#2E7D32",
              marginBottom: 4,
            }}
          >
            {td.category === "guide"
              ? t("trip.guideTransport")
              : t("trip.publicTransport")}{" "}
            · 1인 €{td.perPersonPerDay}/일
          </Text>
          {td.category === "guide" && td.uberBlackComparison && (
            <Text style={{ fontSize: 11, color: "#666" }}>
              vs 우버블랙 시간제 1인 €{td.uberBlackComparison.perPersonPerDay}
              /일
            </Text>
          )}
          {td.category === "transit" && td.guideUpsell && (
            <Text style={{ fontSize: 11, color: "#666" }}>
              드라이빙 가이드 이용시 1인 €{td.guideUpsell.perPersonPerDay}/일
            </Text>
          )}
        </View>
      )}

      <Text style={[styles.dailyTotalTitle, { color: theme.text }]}>
        {t("trip.dailySummary", { day: currentDay.day })}
      </Text>
      <View style={styles.dailyTotalRow}>
        <View style={styles.dailyTotalItem}>
          <Text
            style={[styles.dailyTotalLabel, { color: theme.textSecondary }]}
          >
            {t("trip.entranceFee")}
          </Text>
          <Text style={[styles.dailyTotalValue, { color: theme.text }]}>
            €{entranceEur.toFixed(1)}
          </Text>
        </View>
        <View style={styles.dailyTotalItem}>
          <Text
            style={[styles.dailyTotalLabel, { color: theme.textSecondary }]}
          >
            {t("trip.mealCost")}
          </Text>
          <Text style={[styles.dailyTotalValue, { color: theme.text }]}>
            €{mealEur.toFixed(1)}
          </Text>
        </View>
        <View style={styles.dailyTotalItem}>
          <Text
            style={[styles.dailyTotalLabel, { color: theme.textSecondary }]}
          >
            {t("trip.transportCost")}
          </Text>
          <Text style={[styles.dailyTotalValue, { color: theme.text }]}>
            {/* ⚠️ 2026-07-04 사장님 SSOT = 대중교통 구간당 €3 균일 예상가 기반 합산 = "(예상)" 명시로 정직 표기 */}
            €{transportEur.toFixed(1)} ({t("trip.estimated")})
          </Text>
        </View>
      </View>
      <View style={[styles.dailyTotalGrand, { borderTopColor: theme.border }]}>
        <Text style={[styles.dailyTotalGrandLabel, { color: theme.text }]}>
          {t("trip.dailyTotal")}
        </Text>
        <Text style={[styles.dailyTotalGrandValue, { color: Brand.primary }]}>
          €{totalEur.toFixed(1)}
        </Text>
      </View>
    </View>
  );
}
