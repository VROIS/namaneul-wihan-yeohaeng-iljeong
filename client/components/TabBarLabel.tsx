// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 하단탭 라벨 = 메인앱(MainTabNavigator.tsx)·BTS(MainAppBottomTabBar.tsx)
import React from "react";
import { Text, StyleSheet } from "react-native";

export default function TabBarLabel({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  return (
    <Text
      style={[styles.label, { color }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontFamily: "Pretendard-Bold",
  },
});
