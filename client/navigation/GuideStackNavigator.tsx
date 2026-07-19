/**
 * ⚠️ 수정금지(승인필요) — 가이드 미니앱 전용 스택 네비게이터 (2026-07-19 §12 1단계)
 * = BTSStackNavigator 패턴 복제 = 메인앱과 독립된 풀스크린 플로우.
 * = 1단계는 placeholder 1화면만. 3단계에서 레거시 카메라 모듈 화면들로 교체(내부 0수정).
 */

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import GuidePlaceholderScreen from "@/screens/guide/GuidePlaceholderScreen";

export type GuideStackParamList = {
  GuideCamera: undefined;
};

const Stack = createNativeStackNavigator<GuideStackParamList>();

export default function GuideStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="GuideCamera"
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#000" },
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="GuideCamera" component={GuidePlaceholderScreen} />
    </Stack.Navigator>
  );
}
