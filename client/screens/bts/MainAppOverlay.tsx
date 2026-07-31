// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 SSOT = **BTS 미니앱 위로 메인앱을 스르륵 올리는 창.**
//
// 사장님 지시 그대로:
//   "메인앱에서 열리는 전문가 검증이나 AI의견 모달처럼 구현하되, BTS 독립앱 구조이니 **부모 화면만 다름**.
//    캐릭터 화면부터 하단 5버튼이 생성되는 **모든 BTS 화면**에서 메인앱이 모달로 뜬다.
//    (인증창·지구본은 제외 = 거기엔 하단 5버튼이 없다) = **두 앱이 공존하는 상태**가 된다."
//
// 무엇을 하나
//   화면을 **바꾸지 않고** 그 위에 메인앱을 절반 높이로 얹는다.
//   → 뒤의 BTS 가 그대로 살아 있고, 손가락(마우스)으로 내리거나 X 로 닫을 수 있다.
//   사용자가 "뒤를 볼지, 크게 볼지"를 직접 고른다.
//
// 왜 이 방식인가 (옛것 완전삭제 §19)
//   옛것 = 화면 자체를 모달로 갈아끼우기(`presentation`). 그 방식은 **아이폰만 정상이고
//   안드로이드에서는 BTS 가 통째로 사라졌다**(사장님 실기기 2회 확인). 웹으로는 확인조차 불가했다.
//   지금은 전문가·AI의견 오버레이와 **똑같은 방식**(SnapSheet) = 이미 작동이 확인된 것을 그대로 쓴다(§16).
//
// ⚠️ **부모가 핵심이다**(사장님 지적).
//   이 창은 `App.tsx` 의 NavigationContainer **바로 밑**에 둔다 = 화면이 무엇이든 그 위에 뜬다.
//   전문가 오버레이(ExpertOverlay)가 어느 화면에서든 열리는 것과 **같은 이유·같은 자리**.
//
// ⚠️ 안에 **네비게이터를 통째로 넣지 않는다.**
//   넣으면 화면 관리자가 두 벌이 되어, 여정화면이 자기가 어느 쪽 소속인지 몰라 앱이 죽는다
//   (2026-07-30 실제로 겪은 사고). 그래서 **화면 하나만** 담는다.
import React, { useEffect, useState } from "react";
import { View, StyleSheet, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";

import SnapSheet from "@/components/SnapSheet";
import TripPlannerScreen from "@/screens/trip-planner/TripPlannerScreen";
import ProfileScreen from "@/screens/profile/ProfileScreen";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { Colors } from "@/constants/theme";

export default function MainAppOverlay() {
  const { t } = useTranslation();
  const { mainAppRequestedAt, mainAppOpenTab, clearMainAppRequest } =
    useMapToggle();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const [visible, setVisible] = useState(false);
  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **어느 버튼으로 열었는지 기억한다.**
  //   사고: [프로필] 을 눌러도 여정 화면이 떠서, 창 안에서 프로필로 갈 방법이 없었다(사장님 실증).
  //   신호에 실려 온 값(mainAppOpenTab)을 여기 담아 **그 화면을 바로 보여준다.**
  const [tab, setTab] = useState<"Home" | "Profile">("Home");

  // requestMainApp() 신호 수신 → 창 열기(전문가·로그인 팝업과 동일 패턴). 소비 후 clear.
  // ⚠️ 수정금지(승인필요) 2026-07-31 = **다시 눌러도 반드시 올라오게** 한 것(§22 검증 지적).
  //   사고: 창을 아래로 살짝 내려둔 상태에서 같은 버튼을 또 누르면 "이미 열림"이라 아무 일도 안 났다
  //   = 사용자는 버튼이 먹통이라고 느낀다.
  //   해법: 열 때마다 `key` 를 새 번호로 준다 → 창이 새로 만들어지며 **항상 절반 높이로 다시 올라온다.**
  const [openKey, setOpenKey] = useState(0);
  useEffect(() => {
    if (!mainAppRequestedAt) return;
    setTab(mainAppOpenTab ?? "Home");
    setVisible(true);
    setOpenKey(mainAppRequestedAt); // 누를 때마다 달라지는 값(시각)
    clearMainAppRequest();
  }, [mainAppRequestedAt, mainAppOpenTab, clearMainAppRequest]);

  // ⚠️ 닫혀 있을 때는 **아예 만들지 않는다.**
  //   메인앱 화면을 항상 켜 두면 배터리·메모리를 계속 쓴다. 필요할 때만 만든다.
  if (!visible) return null;

  const isProfile = tab === "Profile";

  return (
    <SnapSheet
      key={openKey}
      visible={visible}
      onClose={() => setVisible(false)}
      title={isProfile ? t("tab.profile", "프로필") : t("tab.plan", "일정")}
    >
      {/* 배경 불투명 = 뒤 BTS 가 시트 **안까지** 비치지 않게(시트 밖은 비쳐야 함). */}
      <View style={[styles.body, { backgroundColor: theme.backgroundRoot }]}>
        {isProfile ? <ProfileScreen /> : <TripPlannerScreen />}
      </View>
    </SnapSheet>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
});
