/**
 * BTS 미니앱 전용 스택 네비게이터
 * 메인앱과 독립된 4-screen 플로우
 */

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { BTSProvider } from "@/contexts/BTSContext";
import BTSCharacterSelectScreen from "@/screens/bts/BTSCharacterSelectScreen";
import BTSPlaceCartScreen from "@/screens/bts/BTSPlaceCartScreen";
import BTSLoadingScreen from "@/screens/bts/BTSLoadingScreen";
import BTSDashboardScreen from "@/screens/bts/BTSDashboardScreen";

export type BTSStackParamList = {
  BTSCharacterSelect: undefined;
  BTSPlaceCart: undefined;
  BTSLoading: undefined;
  BTSDashboard: undefined;
};

const Stack = createNativeStackNavigator<BTSStackParamList>();

export default function BTSStackNavigator() {
  return (
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
        <Stack.Screen name="BTSCharacterSelect" component={BTSCharacterSelectScreen} />
        <Stack.Screen name="BTSPlaceCart" component={BTSPlaceCartScreen} />
        <Stack.Screen
          name="BTSLoading"
          component={BTSLoadingScreen}
          options={{
            gestureEnabled: false,
            animation: "fade",
          }}
        />
        <Stack.Screen
          name="BTSDashboard"
          component={BTSDashboardScreen}
          options={{
            gestureEnabled: false,
            animation: "fade",
          }}
        />
      </Stack.Navigator>
    </BTSProvider>
  );
}
