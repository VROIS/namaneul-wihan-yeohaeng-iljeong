import React, { useEffect, useState } from "react";
import {
  Platform,
  useColorScheme,
  View,
  ActivityIndicator,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import DestinationDetailScreen from "@/screens/DestinationDetailScreen";
import OnboardingScreen from "@/screens/OnboardingScreen";
import LoginScreen from "@/screens/LoginScreen";
import VerificationRequestScreen from "@/screens/VerificationRequestScreen";
import SavedTripDetailScreen from "@/screens/SavedTripDetailScreen";
import AdminScreen from "@/screens/AdminScreen";
import BTSConcertPlannerScreen from "@/screens/BTSConcertPlannerScreen";
import BTSStackNavigator from "@/navigation/BTSStackNavigator";
import { BTSLandingScreen } from "@/screens/BTSLandingScreen";
import BTSWorldMapScreen from "@/screens/bts/BTSWorldMapScreen";
import { BTSLandingScreenC } from "@/screens/BTSLandingScreenC"; // C안 보관
import { BTSLandingScreenA1 } from "@/screens/BTSLandingScreenA1"; // ⚠️ 수정금지(승인필요) — A1안
import { Colors } from "@/constants/theme";
import { Itinerary } from "@/types/trip";
import { isAuthenticated } from "@/lib/auth";

export type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
  Login: undefined;
  DestinationDetail: { placeId: number };
  VerificationRequest: { itinerary: Itinerary };
  SavedTripDetail: { itineraryId: number };
  AdminModal: undefined;
  BTSConcertPlanner: undefined;
  BTSMiniApp: undefined;
  BTSLanding: undefined;
  BTSWorldMap: { city?: string; cityId?: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];

  const [authChecked, setAuthChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    isAuthenticated().then((result) => {
      setLoggedIn(result);
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.backgroundRoot,
        }}
      >
        <ActivityIndicator size="large" color={theme.link} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName="BTSLanding"  /* P1 테스트: 항상 BTS 랜딩부터 */
      screenOptions={{
        headerTitleAlign: "center",
        headerTransparent: true,
        headerBlurEffect: isDark ? "dark" : "light",
        headerTintColor: theme.text,
        headerStyle: {
          backgroundColor: Platform.select({
            ios: undefined,
            android: theme.backgroundRoot,
            web: theme.backgroundRoot,
          }),
        },
        gestureEnabled: true,
        gestureDirection: "horizontal",
        fullScreenGestureEnabled: Platform.OS === "ios",
        contentStyle: {
          backgroundColor: theme.backgroundRoot,
        },
      }}
    >
      {/* ⚠️ 수정금지(승인필요) — A안 원본 복원 */}
      <Stack.Screen
        name="BTSLanding"
        component={BTSLandingScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="BTSWorldMap"
        component={BTSWorldMapScreen}
        options={{
          headerShown: false,
          animation: "fade",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="DestinationDetail"
        component={DestinationDetailScreen}
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="VerificationRequest"
        component={VerificationRequestScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SavedTripDetail"
        component={SavedTripDetailScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      {/* 관리자 대시보드 (전체화면 모달) */}
      <Stack.Screen
        name="AdminModal"
        component={AdminScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="BTSConcertPlanner"
        component={BTSConcertPlannerScreen}
        options={{
          headerShown: false,
        }}
      />
      {/* BTS 미니앱 (풀스크린 독립 스택) */}
      <Stack.Screen
        name="BTSMiniApp"
        component={BTSStackNavigator}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: "slide_from_bottom",
        }}
      />
    </Stack.Navigator>
  );
}
