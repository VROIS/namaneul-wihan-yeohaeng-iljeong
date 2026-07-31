/**
 * BTS 미니앱 전용 스택 네비게이터
 * 메인앱과 독립된 4-screen 플로우
 */

import React from "react";
import { View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { BTSProvider } from "@/contexts/BTSContext";
import BTSCharacterSelectScreen from "@/screens/bts/BTSCharacterSelectScreen";
import BTSPlaceCartScreen from "@/screens/bts/place-cart/BTSPlaceCartScreen";
// ⚠️ 2026-07-31 사장님 승인(BTS D단계) = 옛 BTSLoading·BTSDashboard 완전삭제(§19)
//   → 자리 대체 = BTSTripScreen(메인앱 여정화면 그대로 = 생성기 1벌).
import BTSTripScreen from "@/screens/bts/BTSTripScreen";

export type BTSStackParamList = {
  BTSCharacterSelect: undefined;
  BTSPlaceCart: undefined;
  BTSTrip: undefined;
};

const Stack = createNativeStackNavigator<BTSStackParamList>();

export default function BTSStackNavigator() {
  return (
    // ⚠️ 수정금지(승인필요) 2026-07-30 = **바탕을 불투명하게 깐다.**
    //   BTS 미니앱은 `transparentModal` 로 열린다(안드로이드에서도 뒤의 메인앱을 살려두기 위함).
    //   그 값은 말 그대로 "속이 비치는" 모달이라, 이 바탕이 없으면 뒤의 메인앱이 비쳐 보인다.
    <View style={{ flex: 1, backgroundColor: "#05050A" }}>
      <BTSProvider>
        <Stack.Navigator
          initialRouteName="BTSCharacterSelect"
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: { backgroundColor: "#05050A" },
            gestureEnabled: true,
          }}
        >
          <Stack.Screen
            name="BTSCharacterSelect"
            component={BTSCharacterSelectScreen}
          />
          <Stack.Screen name="BTSPlaceCart" component={BTSPlaceCartScreen} />
          <Stack.Screen
            name="BTSTrip"
            component={BTSTripScreen}
            options={{
              animation: "fade",
            }}
          />
        </Stack.Navigator>
      </BTSProvider>
    </View>
  );
}
