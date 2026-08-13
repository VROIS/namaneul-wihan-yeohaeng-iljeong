// 여정 플래너 메인 화면 = Input/Loading/Result 3단계 조립 전용 = 2026-07-15 §0 슬림화 분리(옛 3,415줄 단일파일 → trip-planner/ 폴더 완전분리, 순수 이동)
//   ⚠️ 2026-07-25 = 전문가 오버레이는 여기서 폐기 → 전역 ExpertOverlay(App 마운트)로 이관(§19) = 어느 화면에서든 열림(사장님 SSOT). 이 화면은 3단계 조립만.
import React from "react";
import { Platform, StyleSheet } from "react-native";
// ⚠️ 2026-08-13 사장님 승인 = **검증된 범용 키보드 부품**(react-native-keyboard-controller, 앱에 이미 설치·KeyboardProvider 가동 중).
//   Android 15+ 가 OS 차원에서 없앤 "키보드만큼 화면 축소"(= 7/2 당시 AOS 가 잘 되던 그 동작)를 이 부품이 복원한다.
//   공식 문서 패턴 그대로: ScrollView 화면 = behavior="padding". enabled = 안드로이드만(iOS 모달·웹 = 기존 동작 무변경).
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useTripPlanner } from "./hooks/useTripPlanner";
import InputStep from "./InputStep";
import LoadingStep from "./LoadingStep";
import ResultStep from "./ResultStep";
import type { TripFormData } from "@/types/trip";

// ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-4) = initialRequest = 폼을 실어 열면 입력화면 건너뛰고 즉시 생성 1회.
//   BTS "같이 떠나요"가 이 화면을 그대로 재사용(재발명 0). 인자 없으면 = 지금까지와 완전 동일.
export default function TripPlannerScreen({
  initialRequest,
}: {
  initialRequest?: Partial<TripFormData>;
}) {
  const planner = useTripPlanner(initialRequest);
  const { screen, theme } = planner;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled={Platform.OS === "android"}
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
    >
      {screen === "Input" && <InputStep planner={planner} />}
      {screen === "Loading" && <LoadingStep planner={planner} />}
      {screen === "Result" && <ResultStep planner={planner} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
