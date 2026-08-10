import React, { useCallback, useEffect } from "react";
import { StyleSheet } from "react-native";
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
import { Asset } from "expo-asset";

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
// 앱을 열면 뜨는 소개 화면(로고 + 슬로건). 폰 시작 그림이 걷힌 직후를 이어받는다.
import IntroSplash from "@/components/IntroSplash";

// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = **첫 실행에 빈 화면이 스치는 것** 제거.
//   전역(컴포넌트 밖)에서 부른다 = 컴포넌트 안이면 이미 걷힌 뒤라 늦는다(expo 공식 주의사항).
SplashScreen.preventAutoHideAsync();
// 걷을 때 툭 끊지 않고 300ms 로 사라지게 한다 = 스플래시(베이지)와 첫 화면(흰색)의 색 차이를 눈이 못 잡는다.
//   ⚠️ JS 옵션이라 **다시 굽지 않아도** 적용된다(app.json 스플래시 설정을 건드리면 다시 구워야 함).
//   fade 는 아이폰 전용 = 안드로이드는 duration 만 적용(부품 타입 주석 명시).
SplashScreen.setOptions({ fade: true, duration: 300 });

// ⚠️ 수정금지(승인필요) 2026-08-10 사장님 지적 = 인트로(IntroSplash) 로고 이미지(114KB)가 늦게 떠서
//   "로고 먼저 → 글자" 연출이 느려 보였다. 폰트를 읽는 이 시간(= 스플래시가 아직 떠 있는 시간)에
//   같은 로고를 **같이 미리 받아둔다**(§0 = 새 로딩창 안 만들고 이미 있는 창 재사용).
//   IntroSplash 가 뜰 때는 이미 캐시돼 있어 그 화면의 onLoad 가 거의 즉시 불린다.
Asset.loadAsync(require("../assets/images/tripis-mark.png")).catch(() => {});

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

  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = 스플래시를 걷는 기준 = **첫 화면이 실제로 자리를 잡은 순간**.
  //   옛 방식(폰트 다 읽자마자 useEffect 에서 걷음) 폐기 = 2026-08-09 §19 —
  //   폰트가 준비된 것과 화면이 그려진 것은 다른 일이라, 그 사이가 **빈 화면으로 스쳤다**(사장님 실기기 관찰).
  //   ⚠️ 폰트 읽기가 **실패해도**(error) 반드시 걷는다 = 안 그러면 스플래시에 영영 갇힌다.
  const onFirstLayout = useCallback(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // 소개 화면이 끝나면 내려간다(2초 뒤 자동 / 누르면 즉시). 앱을 열 때마다 한 번.
  const [introDone, setIntroDone] = React.useState(false);
  const onIntroDone = useCallback(() => setIntroDone(true), []);

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
            {/* onLayout = 이 판이 화면에 자리를 잡은 순간 = 스플래시를 걷는 신호(위 onFirstLayout 주석) */}
            <GestureHandlerRootView
              style={styles.root}
              onLayout={onFirstLayout}
            >
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
                {/* 소개 화면 = 모든 것 위에 덮는다. 끝나면 사라지고 다시 안 뜬다. */}
                {!introDone && <IntroSplash onDone={onIntroDone} />}
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
    // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 확정 = **다크 지원 안 함 = 밝음 고정.**
    //   시작 그림(app.json)의 밝은 바탕과 같은 색 = 그림이 걷히는 순간 색이 안 튄다.
    //   기기 설정을 따라가는 분기는 두지 않는다(사장님: 한국 사용자는 다크를 거의 안 쓴다).
    backgroundColor: "#FAF6EF",
  },
});
