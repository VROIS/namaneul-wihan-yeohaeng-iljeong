/**
 * ⚠️ 수정금지(승인필요) — 가이드 미니앱 전용 스택 네비게이터 (2026-07-19 §12 4단계)
 * = BTSStackNavigator 패턴 = 메인앱과 독립된 풀스크린 플로우.
 * = 레거시 카메라 모듈(mobile-app/src, DetailViewer 포함)을 client/screens/guide/ 로 통째 이식(내부 0수정).
 * = 흐름(레거시 index.js processImage→playAudio 의 RN판): MainCameraScreen 촬영 → GuideResult(DetailViewer, 최적음성).
 *   레거시는 이 흐름을 WebView(웹앱 index.js)로 위임 → Tripis 는 WebView 없음 → DetailViewer(RN 구현체)로 연결(§1).
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";

// 레거시 모듈은 JS(무타입) = allowJs 로 import(내부 0수정 원칙 = 그대로 이식).
import MainCameraScreen from "@/screens/guide/screens/MainCameraScreen";
import DetailViewer from "@/screens/guide/components/DetailViewer";
import { apiRequest } from "@/lib/query-client";

export type GuideStackParamList = {
  GuideCamera: undefined;
  // 촬영/업로드 결과 = 이미지 base64 + 언어. 해설(description)은 GuideResult 가 /api/analyze 로 생성.
  GuideResult: { imageBase64: string; lang?: string };
};

const Stack = createNativeStackNavigator<GuideStackParamList>();

// ⚠️ 모듈 MainCameraScreen 은 onNavigateToWebView('detail', {imageBase64}) 를 부름(레거시 WebView 위임 시그니처).
//   = Tripis 는 WebView 없음 → 이 콜백을 GuideResult 화면 이동으로 잇는다(내부 0수정, 배선만).
function GuideCameraHost() {
  const navigation =
    useNavigation<
      NativeStackScreenProps<GuideStackParamList, "GuideCamera">["navigation"]
    >();
  const handleNavigate = useCallback(
    (page: string, data?: { imageBase64?: string; text?: string }) => {
      // 촬영·업로드 = 'detail' + imageBase64 → 결과화면(DetailViewer). 'voice'·'archive' 는 추후.
      if (page === "detail" && data?.imageBase64) {
        navigation.navigate("GuideResult", { imageBase64: data.imageBase64 });
      }
    },
    [navigation],
  );
  // onInjectJS·lang = 모듈 prop(WebView 위임용). Tripis 는 WebView 없어 onInjectJS no-op, lang 기본 ko.
  return (
    <MainCameraScreen
      onNavigateToWebView={handleNavigate}
      onInjectJS={() => {}}
      lang="ko"
    />
  );
}

// ⚠️ GuideResult = 이미지 → /api/analyze(내가 배선한 라우트, 레거시 generateDescriptionStream 역할) → 해설 →
//   DetailViewer(레거시 index.js playAudio 의 RN 구현체 = IOS_VOICE_MAP 최적음성 Yuna) 로 표시.
//   DetailViewer·라우트 내부는 0수정 = 이 래퍼가 둘을 잇기만 함.
function GuideResultHost({
  route,
  navigation,
}: NativeStackScreenProps<GuideStackParamList, "GuideResult">) {
  const { imageBase64, lang = "ko" } = route.params;
  const [description, setDescription] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 레거시 backendApi.analyzeImageViaServer 와 동일 계약: { image, prompt, language } → { description }.
        const res = await apiRequest("POST", "/api/analyze", {
          image: imageBase64,
          language: lang,
        });
        const data = (await res.json()) as {
          description?: string;
          text?: string;
        };
        if (alive) setDescription(data.description || data.text || "");
      } catch {
        if (alive) setDescription("해설을 불러오지 못했습니다.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [imageBase64, lang]);

  if (description === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  return (
    <DetailViewer
      imageUri={`data:image/jpeg;base64,${imageBase64}`}
      description={description}
      lang={lang}
      locationName={null}
      voiceQuery={null}
      mode="camera"
      onClose={() => navigation.goBack()}
      onSave={undefined}
      onAskAgain={() => navigation.goBack()}
    />
  );
}

export default function GuideStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="GuideCamera"
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#000" },
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="GuideCamera" component={GuideCameraHost} />
      <Stack.Screen name="GuideResult" component={GuideResultHost} />
    </Stack.Navigator>
  );
}
