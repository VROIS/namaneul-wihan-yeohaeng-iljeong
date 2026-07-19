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
