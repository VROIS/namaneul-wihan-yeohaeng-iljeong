import React, { useEffect } from "react";
import { StyleSheet, View, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  NotoSerifKR_400Regular,
  NotoSerifKR_700Bold,
} from "@expo-google-fonts/noto-serif-kr"; // ⚠️ 수정금지(승인필요) — BTS 아리랑 한국어 세리프
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display"; // ⚠️ 수정금지(승인필요) — BTS 아리랑 영어 디스플레이
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk"; // ⚠️ 수정금지(승인필요) — BTS 랜딩 모던 타이포
import * as SplashScreen from "expo-splash-screen";

import { initI18nLanguage } from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";
import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MapToggleProvider } from "@/contexts/MapToggleContext";
import LoginSheet from "@/screens/login/LoginSheet";
import ExpertOverlay from "@/screens/expert/ExpertOverlay";
import MainAppOverlay from "@/screens/bts/MainAppOverlay";
// 결제 후 복귀 = 프로필(충전소)로 보내는 1벌(2026-08-05 사장님 TestFlight 실증)
import PaymentReturnHandler from "@/components/PaymentReturnHandler";

// Prevent auto hide while fonts are loading
SplashScreen.preventAutoHideAsync();

export default function App() {
  // ⚠️ 수정금지(승인필요) — 폰트 로드 (Pretendard 4종 + NotoSerifKR 2종 + PlayfairDisplay 2종)
  const [loaded, error] = useFonts({
    "Pretendard-Regular": require("../assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("../assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("../assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("../assets/fonts/Pretendard-Bold.otf"),
    "NotoSerifKR-Regular": NotoSerifKR_400Regular,
    "NotoSerifKR-Bold": NotoSerifKR_700Bold,
    "PlayfairDisplay-Regular": PlayfairDisplay_400Regular,
    "PlayfairDisplay-Bold": PlayfairDisplay_700Bold,
    "SpaceGrotesk-Regular": SpaceGrotesk_400Regular,
    "SpaceGrotesk-Bold": SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    initI18nLanguage().catch(() => {});
    // ⚠️ 수정금지(승인필요) — 글로벌 에러 핸들러 설치 (앱 에러 → 서버 전송 → AI 확인)
    import("@/lib/error-reporter")
      .then(({ installGlobalErrorHandler }) => {
        installGlobalErrorHandler();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }
  return (
    <ErrorBoundary
      onError={(err, stack) => {
        import("@/lib/error-reporter")
          .then(({ reportError }) => {
            reportError(err, {
              component: "ErrorBoundary",
              screen: stack?.slice(0, 100),
            });
          })
          .catch(() => {});
      }}
    >
      <QueryClientProvider client={queryClient}>
        <MapToggleProvider>
          <SafeAreaProvider>
            <GestureHandlerRootView style={styles.root}>
              <KeyboardProvider>
                <NavigationContainer>
                  <RootStackNavigator />
                  {/* ⚠️ 사장님 SSOT 2026-07-25 = 로그인 인앱 팝업(전역 1벌). requestLogin() 신호로 어느 화면에서든 뜸(§16 재사용·§0 1벌). NavigationContainer 자식 = useLogin 의 useNavigation 의존. */}
                  <LoginSheet />
                  {/* ⚠️ 사장님 SSOT 2026-07-25 = 전문가 오버레이(전역 1벌). requestExpert() 신호로 어느 화면(일정·AI의견·프로필·Tripis)에서든 열림 = 전문가는 언제든 답변(§16·§19 옛 TripPlanner 내부 렌더 폐기). NavigationContainer 자식 = 여정 복원 navigation 의존. */}
                  <ExpertOverlay />
                  {/* ⚠️ 사장님 SSOT 2026-07-31 = BTS 미니앱 위로 **메인앱을 스르륵 올리는 창**(전역 1벌).
                      전문가·AI의견 오버레이와 **같은 자리·같은 방식** = 화면이 무엇이든 그 위에 뜬다.
                      BTS 하단 5버튼이 requestMainApp() 신호를 보내면 열린다 = 두 앱이 공존. */}
                  <MainAppOverlay />
                  {/* ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = 결제 후 복귀 뒷정리(전역 1벌) = **주소창 청소만**.
                      복귀 화면을 프로필로 여는 일은 탭의 첫 화면(MainTabNavigator 의 initialRouteName)이 한다
                      = 이동을 두 곳에서 하지 않는다(§0). */}
                  <PaymentReturnHandler />
                </NavigationContainer>
                <StatusBar style="auto" />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </MapToggleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
