// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 SSOT = **BTS 미니앱 위로 메인앱을 스르륵 올리는 창.**
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
  const {
    mainAppRequestedAt,
    mainAppOpenTab,
    clearMainAppRequest,
    // ⚠️ 수정금지(승인필요) 2026-08-05 = 열림 여부를 **여기 혼자 알지 않고 공용으로 둔다**(§0 1벌).
    mainAppOverlayOpen: visible,
    setMainAppOverlayOpen: setVisible,
  } = useMapToggle();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **어느 버튼으로 열었는지 기억한다.**
  const [tab, setTab] = useState<"Home" | "Profile">("Home");

  // ⚠️ 수정금지(승인필요) 2026-07-31 = **다시 눌러도 반드시 올라오게** 한 것(§22 검증 지적).
  const [openKey, setOpenKey] = useState(0);
  useEffect(() => {
    if (!mainAppRequestedAt) return;
    setTab(mainAppOpenTab ?? "Home");
    setVisible(true);
    setOpenKey(mainAppRequestedAt); // 누를 때마다 달라지는 값(시각)
    clearMainAppRequest();
  }, [mainAppRequestedAt, mainAppOpenTab, clearMainAppRequest, setVisible]);

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
