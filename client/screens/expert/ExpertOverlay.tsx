// ⚠️ 사장님 SSOT 2026-07-25 = 전문가(현지 전문가 문의) 오버레이 = 전역 1벌(App 마운트). 어느 화면(일정·AI의견·프로필·Tripis)에서든 requestExpert() 신호로 즉시 열림.
//   근본: 옛 구조는 ExpertSheet가 TripPlannerScreen 안에 렌더돼 "일정 탭"에서만 열림 → 전문가는 언제든 어느 화면에서든 답변해야 하는데 제약됨(사장님 지적). = LoginSheet(전역 팝업)와 동일 패턴으로 화면 무관 구조화(§16 재사용·§19 옛 위치 폐기).
//   데이터(currentItinerary 등)는 이미 MapToggleContext(전역)라 그대로 사용. 여정 복원 콜백만 navigation으로 처리(프로필 카드 복원과 동일 = navigate Main>Home>itineraryId).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import SnapSheet from "@/components/SnapSheet";
import ExpertSheet from "@/screens/expert/ExpertSheet";
import { Brand } from "@/constants/theme";
import { useMapToggle } from "@/contexts/MapToggleContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type HeaderInfo = {
  avatarUrl?: string;
  nickname?: string;
  /** 전문가·관리자만 = 프로필 편집. 사용자는 없음(얼굴만 = 누구에게 묻는지) */
  onPress?: () => void;
} | null;

export default function ExpertOverlay() {
  const { t } = useTranslation();
  const { expertRequestedAt, clearExpertRequest, requestLogin } =
    useMapToggle();
  // ⚠️ 2026-08-07 사장님 SSOT = 시트 제목("현지 전문가") 삭제 → **본인 사진 1개**로 대체(터치 = 프로필 편집).
  //   "이 탭을 여는 사람은 뭐하는 탭인지 이미 안다" = 글자 제목이 자리만 차지했다.
  //   역할·프로필 조회는 ExpertSheet 가 이미 하므로 그 결과만 받아 쓴다(§0 = 같은 조회 2벌 금지).
  const [header, setHeader] = useState<HeaderInfo>(null);
  const handleHeaderChange = useCallback((h: HeaderInfo) => setHeader(h), []);
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
  // ⚠️ 수정금지(승인필요) 2026-08-07 §22 판단검증이 잡은 회귀 차단 = **BTS 위에서는 화면을 바꾸지 않는다.**
  //   BTSMiniApp 은 루트스택에서 Main 위에 얹힌 별도 화면이라 navigate("Main") 하면 **BTS 가 통째로 사라진다**
  //   (= MainAppBottomTabBar 주석이 "안드로이드에서 BTS 소실" 사고로 §19 삭제한 바로 그 경로).
  //   전문가 탭이 BTS 에서도 열리게 된 뒤 이 경로가 새로 도달 가능해졌으므로 여기서 막는다.
  //   BTS 에서는 배경 여정 복원(편의)을 포기하고 문의 상세만 연다 = BTS 보존 우선.
  const restoreToHome = (itineraryId: number) => {
    // 현재 최상위 라우트 = state.index 기준(routes 배열 끝과 다를 수 있음 = 2026-08-07 실증에서 잡힘)
    const st: any = navigation.getState?.();
    const current = st?.routes?.[st?.index]?.name ?? st?.routes?.at?.(-1)?.name;
    if (current === "BTSMiniApp") return;
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
      headerLeft={
        header ? (
          // 전문가·관리자 = 터치하면 프로필 편집 / 사용자 = 터치 동작 없음(얼굴만 = 누구에게 묻는지)
          <Pressable
            onPress={header.onPress}
            disabled={!header.onPress}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            accessibilityRole={header.onPress ? "button" : "image"}
            accessibilityLabel={
              header.onPress ? t("expert.editProfile") : header.nickname
            }
          >
            {header.avatarUrl ? (
              <Image
                source={{ uri: header.avatarUrl }}
                style={{ width: 32, height: 32, borderRadius: 16 }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: Brand.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700" }}>
                  {(header.nickname || "P").slice(0, 1)}
                </Text>
              </View>
            )}
          </Pressable>
        ) : undefined
      }
    >
      <ExpertSheet
        onHeaderChange={handleHeaderChange}
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
