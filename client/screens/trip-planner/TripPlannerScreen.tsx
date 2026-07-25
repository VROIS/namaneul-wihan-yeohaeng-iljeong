// 여정 플래너 메인 화면 = Input/Loading/Result 3단계 조립 전용 = 2026-07-15 §0 슬림화 분리(옛 3,415줄 단일파일 → trip-planner/ 폴더 완전분리, 순수 이동)
//   ⚠️ 2026-07-25 = 전문가 오버레이는 여기서 폐기 → 전역 ExpertOverlay(App 마운트)로 이관(§19) = 어느 화면에서든 열림(사장님 SSOT). 이 화면은 3단계 조립만.
import React from "react";
import { View, StyleSheet } from "react-native";
import { useTripPlanner } from "./hooks/useTripPlanner";
import InputStep from "./InputStep";
import LoadingStep from "./LoadingStep";
import ResultStep from "./ResultStep";

export default function TripPlannerScreen() {
  const planner = useTripPlanner();
  const { screen, theme } = planner;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {screen === "Input" && <InputStep planner={planner} />}
      {screen === "Loading" && <LoadingStep planner={planner} />}
      {screen === "Result" && <ResultStep planner={planner} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
