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
import ExpertInquiryDetailScreen from "@/screens/expert/ExpertInquiryDetailScreen"; // 전문가 문의 상세(2026-07-13) = 옛 VerificationRequestScreen 대체 §19
import ExpertProfileEditScreen from "@/screens/expert/ExpertProfileEditScreen"; // 현지전문가 본인 프로필 편집(2026-07-13)
import SavedTripDetailScreen from "@/screens/SavedTripDetailScreen";
import AdminScreen from "@/screens/AdminScreen";
import BTSConcertPlannerScreen from "@/screens/BTSConcertPlannerScreen";
import BTSStackNavigator from "@/navigation/BTSStackNavigator";
import { BTSLandingScreen } from "@/screens/BTSLandingScreen";
import BTSWorldMapScreen from "@/screens/bts/BTSWorldMapScreen";
// ⚠️ 수정금지(승인필요) — 보관 화면 import 제거 (번들 크기 축소, 14.97MB→Expo Go 30초 타임아웃 초과)
// import { BTSLandingScreenC } from "@/screens/BTSLandingScreenC"; // C안 보관
// import { BTSLandingScreenA1 } from "@/screens/BTSLandingScreenA1"; // A1안 보관
import { Colors } from "@/constants/theme";
import { isAuthenticated } from "@/lib/auth";

export type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
  Login: undefined;
  DestinationDetail: { placeId: number };
  ExpertInquiryDetail: { id: string }; // 전문가 문의 상세(2026-07-13) = 옛 VerificationRequest 대체 §19
  ExpertProfileEdit: undefined; // 현지전문가 본인 프로필 편집(2026-07-13)
  SavedTripDetail: { itineraryId: number };
  AdminModal: undefined;
  BTSConcertPlanner: undefined;
  BTSMiniApp: undefined;
  BTSLanding: undefined;
  BTSWorldMap: { city?: string; cityId?: number; date?: string; dDay?: number; venue?: string }; // ⚠️ 수정금지(승인필요) — next-concert API 데이터 전달
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
      initialRouteName="Main"  /* ⚠️ 수정금지(승인필요) — NUBI 메인 먼저, BTS는 배너→랜딩→미니앱 */
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
        name="ExpertInquiryDetail"
        component={ExpertInquiryDetailScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ExpertProfileEdit"
        component={ExpertProfileEditScreen}
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
