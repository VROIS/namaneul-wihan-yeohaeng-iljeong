// ⚠️ 사장님 SSOT 2026-07-25 = 전문가(현지 전문가 문의) 오버레이 = 전역 1벌(App 마운트). 어느 화면(일정·AI의견·프로필·Tripis)에서든 requestExpert() 신호로 즉시 열림.
//   근본: 옛 구조는 ExpertSheet가 TripPlannerScreen 안에 렌더돼 "일정 탭"에서만 열림 → 전문가는 언제든 어느 화면에서든 답변해야 하는데 제약됨(사장님 지적). = LoginSheet(전역 팝업)와 동일 패턴으로 화면 무관 구조화(§16 재사용·§19 옛 위치 폐기).
//   데이터(currentItinerary 등)는 이미 MapToggleContext(전역)라 그대로 사용. 여정 복원 콜백만 navigation으로 처리(프로필 카드 복원과 동일 = navigate Main>Home>itineraryId).
import React, { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import SnapSheet from "@/components/SnapSheet";
import ExpertSheet from "@/screens/expert/ExpertSheet";
import { useMapToggle } from "@/contexts/MapToggleContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export default function ExpertOverlay() {
  const { t } = useTranslation();
  const { expertRequestedAt, clearExpertRequest, requestLogin } =
    useMapToggle();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [visible, setVisible] = useState(false);

  // requestExpert() 신호 수신 → 오버레이 열기(AI의견·로그인 팝업과 동일 패턴). 소비 후 clear.
  useEffect(() => {
    if (!expertRequestedAt) return;
    setVisible(true);
    clearExpertRequest();
  }, [expertRequestedAt, clearExpertRequest]);

  // 여정 복원(문의 여정 배경에 띄우기·전체 보기) = 일정 탭(Home)으로 이동하며 itineraryId 전달 = TripPlanner가 GET으로 복원(프로필 "나의 여정" 카드와 동일 §16). 시트는 열린 채 유지 = 실제 여정 보며 답변.
  const restoreToHome = (itineraryId: number) => {
    navigation.navigate("Main", {
      screen: "Home",
      params: { itineraryId },
    } as never);
  };

  return (
    <SnapSheet
      visible={visible}
      onClose={() => setVisible(false)}
      title={t("expert.title")}
    >
      <ExpertSheet
        onClose={() => setVisible(false)}
        onOpenItinerary={(itineraryId) => {
          // [여정 전체 보기] = 시트 닫고 그 여정으로 이동(배경 전환).
          setVisible(false);
          restoreToHome(itineraryId);
        }}
        onRestoreBackground={(itineraryId) => {
          // 답변대기 문의 누름 = 그 여정을 배경(일정 탭)에 복원(시트 열린 채) = 실제 여정 보며 답변.
          restoreToHome(itineraryId);
        }}
        onRequestLogin={() => {
          setVisible(false);
          requestLogin();
        }}
      />
    </SnapSheet>
  );
}
