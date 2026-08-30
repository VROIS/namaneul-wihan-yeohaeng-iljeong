//   ⚠️ 2026-07-25 = 전문가 오버레이는 여기서 폐기 → 전역 ExpertOverlay(App 마운트)로 이관(§19) = 어느 화면에서든 열림(사장님 SSOT). 이 화면은 3단계 조립만.
import React from "react";
import { View, StyleSheet } from "react-native";
import { useTripPlanner } from "./hooks/useTripPlanner";
import InputStep from "./InputStep";
import LoadingStep from "./LoadingStep";
import ResultStep from "./ResultStep";
import type { TripFormData } from "@/types/trip";

// ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-4) = initialRequest = 폼을 실어 열면 입력화면 건너뛰고 즉시 생성 1회.
export default function TripPlannerScreen({
  initialRequest,
}: {
  initialRequest?: Partial<TripFormData>;
}) {
  const planner = useTripPlanner(initialRequest);
  const { screen, theme } = planner;

  // ⌨️ 2026-08-13 사장님 확정 = AOS 키보드 대응은 "숙소·도시 검색 = 독립 모달"(ResultStep·InputStep)로 일원화.
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
