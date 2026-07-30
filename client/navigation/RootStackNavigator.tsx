import React from "react";
import {
  Platform,
  useColorScheme,
  View,
  ActivityIndicator,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import DestinationDetailScreen from "@/screens/DestinationDetailScreen";
import OnboardingScreen from "@/screens/onboarding/OnboardingScreen";
import LoginScreen from "@/screens/login/LoginScreen";
import ExpertInquiryDetailScreen from "@/screens/expert/ExpertInquiryDetailScreen"; // 전문가 문의 상세(2026-07-13) = 옛 VerificationRequestScreen 대체 §19
import ExpertProfileEditScreen from "@/screens/expert/ExpertProfileEditScreen"; // 현지전문가 본인 프로필 편집(2026-07-13)
import SavedTripDetailScreen from "@/screens/saved-trip/SavedTripDetailScreen";
import AdminScreen from "@/screens/AdminScreen";
import BTSConcertPlannerScreen from "@/screens/BTSConcertPlannerScreen";
import BTSStackNavigator from "@/navigation/BTSStackNavigator";
import GuideStackNavigator from "@/navigation/GuideStackNavigator"; // 가이드 미니앱(§12 1단계) = BTS 패턴 독립 스택
import { BTSLandingScreen } from "@/screens/BTSLandingScreen";
import BTSWorldMapScreen from "@/screens/bts/BTSWorldMapScreen";
import VideoPreviewScreen from "@/screens/video/VideoPreviewScreen";
import { Colors } from "@/constants/theme";
import { useMapToggle } from "@/contexts/MapToggleContext";

export type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
  Login: undefined;
  DestinationDetail: { placeId: number };
  ExpertInquiryDetail: { id: string }; // 전문가 문의 상세(2026-07-13) = 옛 VerificationRequest 대체 §19
  ExpertProfileEdit: undefined; // 현지전문가 본인 프로필 편집(2026-07-13)
  SavedTripDetail: { itineraryId: number };
  VideoPreview: { itineraryId: number }; // 🎬 지브리 일별 여행영상 미리보기 (풀스크린, 2026-07-22 실배선)
  AdminModal: undefined;
  BTSConcertPlanner: undefined;
  BTSMiniApp: undefined;
  GuideMiniApp: undefined; // 가이드 미니앱(§12 1단계) = 설정탭에서 진입, 풀스크린 모달
  BTSLanding: undefined;
  BTSWorldMap: {
    city?: string;
    cityId?: number;
    date?: string;
    dDay?: number;
    venue?: string;
  }; // ⚠️ 수정금지(승인필요) — next-concert API 데이터 전달
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];

  // ⚠️ 2026-07-27 = 로그인 판정은 전역 1곳(MapToggleContext)만. 직접 저장소를 읽던 옛 방식 폐기 §19.
  const { authReady: authChecked } = useMapToggle();

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
      initialRouteName="Main" /* ⚠️ 수정금지(승인필요) — NUBI 메인 먼저, BTS는 배너→랜딩→미니앱 */
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
      {/* 가이드 미니앱 (풀스크린 독립 스택) — §12 1단계, 설정탭에서 진입 */}
      <Stack.Screen
        name="GuideMiniApp"
        component={GuideStackNavigator}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: "slide_from_bottom",
        }}
      />
      {/* 🎬 60초 숏폼 AI 비디오 프리뷰 (독립 풀스크린 모달, 👑 유료 전용) */}
      <Stack.Screen
        name="VideoPreview"
        component={VideoPreviewScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: "slide_from_bottom",
        }}
      />
    </Stack.Navigator>
  );
}
