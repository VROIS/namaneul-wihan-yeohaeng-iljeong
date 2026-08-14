// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 하단탭 라벨 = 메인앱(MainTabNavigator.tsx)·BTS(MainAppBottomTabBar.tsx)
//   공용 1벌(§0·§16 재발명 금지). 옛것 = 두 파일이 각자 <Text>를 따로 그려서, BTS 쪽에만 줄바꿈 방지가 빠져
//   비한국어(특히 독일어)에서 BTS 탭바만 글자가 넘치던 원인(2026-08-14 사장님 실기기 스크린샷 실증).
//   여기 1곳에만 방지 로직을 넣으면 메인앱·BTS 둘 다 동시에 적용된다.
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
