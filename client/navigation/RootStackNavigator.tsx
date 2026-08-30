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
import AdminScreen from "@/screens/AdminScreen";
import BTSStackNavigator from "@/navigation/BTSStackNavigator";
import GuideStackNavigator from "@/navigation/GuideStackNavigator"; // 가이드 미니앱(§12 1단계) = BTS 패턴 독립 스택
import { BTSLandingScreen } from "@/screens/BTSLandingScreen";
import BTSWorldMapScreen from "@/screens/bts/BTSWorldMapScreen";
import { Colors } from "@/constants/theme";
import { useMapToggle } from "@/contexts/MapToggleContext";

export type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
  Login: undefined;
  DestinationDetail: { placeId: number };
  ExpertInquiryDetail: { id: string }; // 전문가 문의 상세(2026-07-13) = 옛 VerificationRequest 대체 §19
  ExpertProfileEdit: undefined; // 현지전문가 본인 프로필 편집(2026-07-13)
  AdminModal: undefined;
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
      {/* BTS 미니앱 (독립 스택) */}
      {/* ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **안드로이드를 아이폰과 같게 맞춘다.**
          사장님 실기기 결과 = 아이폰은 BTS 위에 메인앱이 얹히고 **BTS 가 뒤에 살아있으며 손가락으로 내려간다**(정상).
          안드로이드는 BTS 가 **사라지고** 완전히 갈아치워졌다(잘못).

          원인 = 옛 값 `fullScreenModal` 은 **아이폰 전용**이라 안드로이드에서는 `modal` 로 낮춰진다.
            근거1 ScreenViewManager.kt:126-131 = "modal·containedModal·fullScreenModal·pageSheet" 가 전부 MODAL 로 묶임.
            근거2 Screen.kt:279-286 = **TRANSPARENT_MODAL 과 FORM_SHEET 만** 뒤 화면을 살려둔다(isTranslucent).
            근거3 ScreenStack.kt:240-244 = 위가 불투명(MODAL)이면 아래 화면을 아예 떼어낸다(remove).
          ⇒ 두 OS 에서 **똑같이** 뒤 화면을 살려두는 값 = `transparentModal` 로 교체 §19.
          (`contained*` 계열은 한 스택에 다른 모달과 섞으면 크래시 위험이라 쓰지 않는다 = types.d.ts:360-361)

          ⚠️ 배경이 비치면 안 되므로 BTS 스택 자체가 불투명해야 한다(BTSStackNavigator 배경 #05050A). */}
      <Stack.Screen
        name="BTSMiniApp"
        component={BTSStackNavigator}
        options={{
          // ⚠️ 수정금지(승인필요) 2026-07-31 = **일반 화면(card)** 으로 되돌림. 옛 `transparentModal` 삭제 §19.
          presentation: "card",
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
    </Stack.Navigator>
  );
}
