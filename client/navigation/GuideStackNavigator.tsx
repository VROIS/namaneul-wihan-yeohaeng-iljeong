/**
 * ⚠️ 수정금지(승인필요) — 가이드 미니앱 전용 스택 네비게이터 (2026-07-20 사장님 SSOT = 원본 복원)
 * = 검증된 레거시 원본 배선 그대로 (내손안에 가이드 main-input-screen-rn-v1.0/App.js + public/index.js):
 *   · 카메라 화면 = MainCameraScreen(5단 버튼: 라이브·촬영·업로드·여행비서·보관함) + 카메라 권한 요청(원본 App.js 방식)
 *   · X 닫기 = 우측상단(원본 closeWindowBtn 스타일) = 미니앱 탈출 → 쓰던 화면 즉시 복귀 (리턴 아님)
 *   · 해설 = 원본 processImage 흐름: DB 언어별 페르소나(/api/prompts) → /api/gemini 스트리밍
 *     → 문장 단위 즉시 표시(상단부터) → 스트림 완료 후 자동 낭독(DetailViewer, iOS=Yuna)
 *   · 음성질문·보관함 배선 = 추후 (사장님 지시: 교체·연결은 추후 단계)
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
  NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useCameraPermissions } from "expo-camera";
import { fetch as expoFetch } from "expo/fetch";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 레거시 모듈은 JS(무타입) = allowJs 로 import(내부 0수정 원칙 = 그대로 이식).
//   = JS 기본값 추론(never[]·필수화)과 충돌하므로 ComponentType<any> 로 배선(타입만, 동작 무관).
import MainCameraScreenJs from "@/screens/guide/screens/MainCameraScreen";
import DetailViewerJs from "@/screens/guide/components/DetailViewer";
import { CONFIG } from "@/screens/guide/config/constants";
// 프롬프트 조달 = 모듈 자체 서비스 재사용(§16 재발명 금지) = 메모리+AsyncStorage 캐시 + 서버 fetch + 폴백.
import { fetchPrompt } from "@/screens/guide/services/PromptService";

const MainCameraScreen = MainCameraScreenJs as unknown as React.ComponentType<
  Record<string, unknown>
>;
const DetailViewer = DetailViewerJs as unknown as React.ComponentType<
  Record<string, unknown>
>;

export type GuideStackParamList = {
  GuideCamera: undefined;
  // 촬영/업로드 결과 = 이미지 base64 + 언어(지금은 ko 디폴트, 언어설정 연결은 추후).
  GuideResult: { imageBase64: string; lang?: string };
};

const Stack = createNativeStackNavigator<GuideStackParamList>();

// ⚠️ 카메라 화면 = 원본 MainCameraScreen(5단 버튼) 그대로 + 바깥(출입구)만 배선.
//   = 카메라 권한 = 원본 패키지 App.js 방식(진입 시 자동 요청 = iOS 블랙화면 방지).
//   = X 닫기 = 원본 closeWindowBtn(우측상단, 반투명 원) = 미니앱 탈출 → 쓰던 화면 복귀.
function GuideCameraHost() {
  const navigation =
    useNavigation<
      NativeStackScreenProps<GuideStackParamList, "GuideCamera">["navigation"]
    >();
  const rootNavigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const [, requestPermission] = useCameraPermissions();

  // 카메라 권한 = 진입 시 1회만 요청(원본 App.js 의도). permission 의존 재요청 =
  // 거부 시 무한 네이티브 호출 루프(§22 검증 적발) = 마운트 1회로 고정.
  useEffect(() => {
    requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 원본 App.js handleNavigateToWebView 대응 = RN 에선 화면 전환으로 배선.
  const handleNavigateToWebView = useCallback(
    (page: string, data?: { imageBase64?: string }) => {
      if (page === "detail" && data?.imageBase64) {
        navigation.navigate("GuideResult", { imageBase64: data.imageBase64 });
      }
      // 'archive'(보관함)·'voice'(음성질문) = 추후 배선 (사장님 지시).
    },
    [navigation],
  );

  return (
    <View style={styles.flex1}>
      <MainCameraScreen
        onNavigateToWebView={handleNavigateToWebView}
        lang="ko"
      />
      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + 16 }]}
        onPress={() => rootNavigation.goBack()}
        accessibilityLabel="닫기"
      >
        <Ionicons name="close" size={28} color="#4285F4" />
      </TouchableOpacity>
    </View>
  );
}

// ⚠️ 해설 화면 = 원본 index.js processImage 흐름 그대로 (RN 배선판):
//   ①로딩 문구 로테이션(2초) ②DB 페르소나 로드 ③/api/gemini 스트리밍
//   ④문장 단위([.?!]) 분리 = 도착 즉시 표시 ⑤스트림 완료 = done → DetailViewer 자동 낭독.
function GuideResultHost({
  route,
  navigation,
}: NativeStackScreenProps<GuideStackParamList, "GuideResult">) {
  const { imageBase64, lang = "ko" } = route.params;
  const [sentences, setSentences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState(
    "사진 속 이야기를 찾아내고 있어요...",
  );
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    // 원본 index.js 로딩 문구 로테이션 그대로.
    const loadingMessages = [
      "사진 속 이야기를 찾아내고 있어요...",
      "곧 재미있는 이야기를 들려드릴게요!",
    ];
    let msgIndex = 0;
    const loadingInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % loadingMessages.length;
      if (alive) setLoadingText(loadingMessages[msgIndex]);
    }, 2000);

    (async () => {
      try {
        const systemInstruction = await fetchPrompt(lang, "image");

        // 원본 geminiService.js 요청 본문 그대로.
        const resp = await expoFetch(`${CONFIG.API.SERVER_URL}/api/gemini`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Image: imageBase64,
            prompt:
              lang === "ko"
                ? "이 이미지를 분석하고 생생하게 설명해주세요."
                : "Analyze this image and describe it vividly.",
            systemInstruction,
          }),
        });
        if (!resp.ok || !resp.body)
          throw new Error(`서버 오류: ${resp.status}`);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let sentenceBuffer = "";
        let firstChunk = true;

        for (;;) {
          const { done: readDone, value } = await reader.read();
          if (readDone) break;
          const chunkText = decoder.decode(value, { stream: true });
          if (!chunkText) continue;

          if (firstChunk) {
            firstChunk = false;
            clearInterval(loadingInterval);
            if (alive) setLoading(false);
          }

          // 원본 index.js 문장 분리 그대로 = [.?!] 종결부호 단위.
          sentenceBuffer += chunkText;
          const completed: string[] = [];
          let idx = sentenceBuffer.search(/[.?!]/);
          while (idx !== -1) {
            const sentence = sentenceBuffer.substring(0, idx + 1).trim();
            sentenceBuffer = sentenceBuffer.substring(idx + 1);
            if (sentence) completed.push(sentence);
            idx = sentenceBuffer.search(/[.?!]/);
          }
          if (completed.length && alive) {
            setSentences((prev) => [...prev, ...completed]);
          }
        }

        // 원본 = 남은 버퍼도 문장으로 flush.
        const rest = sentenceBuffer.trim();
        if (rest && alive) setSentences((prev) => [...prev, rest]);
        if (alive) {
          setLoading(false);
          setDone(true);
        }
      } catch (e) {
        console.error("[guide] 해설 스트리밍 오류:", e);
        clearInterval(loadingInterval);
        if (alive) {
          setLoading(false);
          setDone(true);
          setSentences((prev) =>
            prev.length
              ? prev
              : ["해설을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."],
          );
        }
      }
    })();

    return () => {
      alive = false;
      clearInterval(loadingInterval);
    };
  }, [imageBase64, lang]);

  return (
    <DetailViewer
      imageUri={`data:image/jpeg;base64,${imageBase64}`}
      sentences={sentences}
      loading={loading}
      loadingText={loadingText}
      done={done}
      locationName={null}
      voiceQuery={null}
      mode="camera"
      lang={lang}
      onClose={() => navigation.goBack()}
      onSave={undefined}
      onAskAgain={undefined}
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

// ⚠️ X 닫기 스타일 = 원본 closeWindowBtn(public/index.js) 그대로: 우측상단 1rem,
//   48px 반투명 검정 원 + 제미니블루 아이콘. 좌측상단은 원본에서 번역 버튼 자리 = 비워둠.
const styles = StyleSheet.create({
  flex1: { flex: 1 },
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});
