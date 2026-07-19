/**
 * ⚠️ 수정금지(승인필요) — 가이드 미니앱 전용 스택 네비게이터 (2026-07-19 §12 4단계)
 * = BTSStackNavigator 패턴 = 메인앱과 독립된 풀스크린 플로우.
 * = 카메라 화면 = CameraOverlay(완성본: 카메라 권한처리·이미지 1024px 최적화·하단 4버튼·X닫기 자체완결).
 *   (MainCameraScreen 은 권한처리·X 없는 구버전이라 미사용 = iOS 블랙·버튼 안보임 원인이었음.)
 * = 흐름: CameraOverlay 촬영/업로드(base64) → GuideResult(/api/analyze → DetailViewer 최적음성 Yuna).
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

// 레거시 모듈은 JS(무타입) = allowJs 로 import(내부 0수정 원칙 = 그대로 이식).
import CameraOverlay from "@/screens/guide/components/CameraOverlay";
import DetailViewer from "@/screens/guide/components/DetailViewer";
import { apiRequest } from "@/lib/query-client";

export type GuideStackParamList = {
  GuideCamera: undefined;
  // 촬영/업로드 결과 = 이미지 base64 + 언어. 해설(description)은 GuideResult 가 /api/analyze 로 생성.
  GuideResult: { imageBase64: string; lang?: string };
};

const Stack = createNativeStackNavigator<GuideStackParamList>();

// ⚠️ CameraOverlay = onCapture/onUpload({base64,uri,location}) · onVoice · onArchive · onClose 콜백.
//   = 촬영·업로드 = base64 → GuideResult(해설). onClose = 미니앱 닫기(RootStack goBack). 내부 0수정, 배선만.
function GuideCameraHost() {
  const navigation =
    useNavigation<
      NativeStackScreenProps<GuideStackParamList, "GuideCamera">["navigation"]
    >();
  // 미니앱 자체를 닫으려면 부모(RootStack)로 나가야 함.
  const rootNavigation = useNavigation<NativeStackNavigationProp<any>>();

  const toResult = useCallback(
    (data?: { base64?: string }) => {
      if (data?.base64) {
        navigation.navigate("GuideResult", { imageBase64: data.base64 });
      }
    },
    [navigation],
  );

  return (
    <CameraOverlay
      lang="ko"
      onCapture={toResult}
      onUpload={toResult}
      onVoice={() => {}} // 음성입력('voice')은 다음 단계 배선.
      onArchive={() => {}} // 보관함(다시보기)은 다음 단계 배선.
      onClose={() => rootNavigation.goBack()} // X = 미니앱 닫기 → 메인앱 복귀.
    />
  );
}

// ⚠️ GuideResult = 이미지 → /api/analyze(geminiVision 해설) → DetailViewer(IOS_VOICE_MAP 최적음성 Yuna).
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
