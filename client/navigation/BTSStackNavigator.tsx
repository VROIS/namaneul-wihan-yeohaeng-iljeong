import React from "react";
import { View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { BTSProvider } from "@/contexts/BTSContext";
import BTSCharacterSelectScreen from "@/screens/bts/BTSCharacterSelectScreen";
import BTSPlaceCartScreen from "@/screens/bts/place-cart/BTSPlaceCartScreen";
// ⚠️ 2026-07-31 사장님 승인(BTS D단계) = 옛 BTSLoading·BTSDashboard 완전삭제(§19)
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
