// 여정 플래너 메인 화면 = Input/Loading/Result 3단계 조립 전용 = 2026-07-15 §0 슬림화 분리(옛 3,415줄 단일파일 → trip-planner/ 폴더 완전분리, 순수 이동)
import React from "react";
import { View, StyleSheet } from "react-native";
import SnapSheet from "@/components/SnapSheet"; // 배경 여정 보이는 드래그 스냅 시트(peek↔full, 2026-07-14 리서치)
import ExpertSheet from "@/screens/expert/ExpertSheet"; // 전문가 오버레이 시트(2026-07-14 = AI의견처럼 여정화면 위)
import { useTripPlanner } from "./hooks/useTripPlanner";
import InputStep from "./InputStep";
import LoadingStep from "./LoadingStep";
import ResultStep from "./ResultStep";

export default function TripPlannerScreen() {
  const planner = useTripPlanner();
  const {
    screen,
    theme,
    t,
    navigation,
    expertVisible,
    setExpertVisible,
    restoreItineraryById,
  } = planner;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {screen === "Input" && <InputStep planner={planner} />}
      {screen === "Loading" && <LoadingStep planner={planner} />}
      {screen === "Result" && <ResultStep planner={planner} />}

      {/* ⚠️ 사장님 SSOT 2026-07-14 = "전문가" 오버레이 = 배경 여정 보이는 드래그 스냅 시트(SnapSheet). 최상위 렌더(어느 화면이든) = 전문가는 여정 없어도 답변함.
          아래로 드래그→peek(뒤 여정 상세히 봄), 위로 드래그/헤더탭→full(작성), X/맨아래스와이프→닫힘. 시트 본문 = ExpertSheet(자체 상태머신). §16·§19. */}
      <SnapSheet
        visible={expertVisible}
        onClose={() => setExpertVisible(false)}
        title={t("expert.title")}
      >
        <ExpertSheet
          onClose={() => setExpertVisible(false)}
          onOpenItinerary={(itineraryId) => {
            // [여정 전체 보기] = 시트 닫고 그 여정 원본으로 복원(배경 전환).
            setExpertVisible(false);
            restoreItineraryById(itineraryId);
          }}
          onRestoreBackground={(itineraryId) => {
            // 답변대기 문의 누름 = 그 여정을 배경에 복원(시트 열린 채) = 실제 여정 보며 답변(restore-by-id).
            restoreItineraryById(itineraryId);
          }}
          onRequestLogin={() => {
            setExpertVisible(false);
            navigation.navigate("Login");
          }}
        />
      </SnapSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
