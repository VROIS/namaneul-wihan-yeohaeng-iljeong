/**
 * ⚠️ 수정금지(승인필요) — 가이드 미니앱 전용 스택 네비게이터 (2026-07-20 사장님 SSOT = 운영앱 완전 클론)
 * = 검증된 레거시 운영앱(내손안에 가이드 = 6개월 실증본) 그대로:
 *   · 카메라 화면 = MainCameraScreen(5단 버튼) + X 우측상단(완전 투명, 미니앱 탈출 → 쓰던 화면 복귀)
 *   · 이미지 = 운영 imageOptimizer 클론(1024px + 품질 0.85 = 실증 최적값) 후 전송 = 응답속도 근본
 *   · 위치창 = 운영 requestBrowserLocation 클론: 위치 1회 허용 → 주변 랜드마크(/api/guide/landmark) → 위치창
 *   · 해설 = DB 페르소나(/api/prompts) → /api/gemini 스트리밍 → 문장 즉시 표시+즉시 낭독(DetailViewer)
 *   · 저장 = 운영 handleSaveClick 페이로드 그대로 /api/guides/batch. 로그인한 경우만(사장님 확정).
 *   · 음성질문·보관함 화면 배선 = 추후 (사장님 지시)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, StyleSheet, Image, Alert } from "react-native";
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useCameraPermissions } from "expo-camera";
import { fetch as expoFetch } from "expo/fetch";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// 아이콘 = 운영 SVG 직접 렌더 = iOS Expo Go 에서 Ionicons 미표시 근본 해결(2026-07-20 실기기 SSOT).
import GuideIconJs from "@/screens/guide/components/GuideIcons";

// 레거시 모듈은 JS(무타입) = allowJs 로 import.
//   = JS 기본값 추론(never[]·필수화)과 충돌하므로 ComponentType<any> 로 배선(타입만, 동작 무관).
import MainCameraScreenJs from "@/screens/guide/screens/MainCameraScreen";
import DetailViewerJs from "@/screens/guide/components/DetailViewer";
import { CONFIG } from "@/screens/guide/config/constants";
// 프롬프트 조달 = 모듈 자체 서비스 재사용(§16) = 메모리+AsyncStorage 캐시 + 서버 fetch + 폴백.
import {
  fetchPrompt,
  getTTSLanguage,
} from "@/screens/guide/services/PromptService";
// 인증 = 앱 유일 작동 패턴(전문가탭과 동일) = getUserData().token Bearer 직접 첨부.
import { getUserData } from "@/lib/auth";

const MainCameraScreen = MainCameraScreenJs as unknown as React.ComponentType<
  Record<string, unknown>
>;
const DetailViewer = DetailViewerJs as unknown as React.ComponentType<
  Record<string, unknown>
>;
const GuideIcon = GuideIconJs as unknown as React.ComponentType<
  Record<string, unknown>
>;

export type GuideStackParamList = {
  GuideCamera: undefined;
  // 촬영/업로드 결과 = 이미지 base64 + 언어(지금은 ko 디폴트, 언어설정 연결은 추후).
  GuideResult: { imageBase64: string; lang?: string };
};

const Stack = createNativeStackNavigator<GuideStackParamList>();

// ⚠️ 운영 imageOptimizer.js 클론 = 1024px + 품질 0.85 (실증: ~100KB, 속도/인식률 최적 밸런스).
//   ≤1024px = 원본 그대로(운영과 동일). 실패 시 원본 폴백.
async function optimizeImageBase64(base64: string): Promise<string> {
  try {
    const uri = `data:image/jpeg;base64,${base64}`;
    const { width, height } = await new Promise<{
      width: number;
      height: number;
    }>((resolve, reject) =>
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject),
    );
    if (width <= 1024 && height <= 1024) return base64;
    const resize = width > height ? { width: 1024 } : { height: 1024 };
    const out = await ImageManipulator.manipulateAsync(uri, [{ resize }], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    return out.base64 || base64;
  } catch {
    return base64;
  }
}

// ⚠️ 카메라 화면 = 원본 MainCameraScreen(5단 버튼) 그대로 + 바깥(출입구)만 배선.
//   = X 닫기 = 우측상단 완전 투명(2026-07-20 사장님 지시 = 컴포넌트 모든 버튼 통일).
function GuideCameraHost() {
  const navigation =
    useNavigation<
      NativeStackScreenProps<GuideStackParamList, "GuideCamera">["navigation"]
    >();
  const rootNavigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const [, requestPermission] = useCameraPermissions();

  // 카메라 권한 = 진입 시 1회만 요청(거부 시 무한루프 방지 = §22 검증 반영).
  useEffect(() => {
    requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <GuideIcon name="close" size={32} />
      </TouchableOpacity>
    </View>
  );
}

// ⚠️ 해설 화면 = 운영 processImage 흐름 그대로 (RN 배선판):
//   ①이미지 최적화(1024/0.85) ②위치 1회 허용→랜드마크→위치창 ③DB 페르소나 ④/api/gemini 스트리밍
//   ⑤문장 단위 즉시 표시(낭독은 DetailViewer가 첫 문장 즉시 시작) ⑥저장 = 로그인 시 guides.
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
  // 위치창 = 운영 클론: '위치 확인 중...' → 랜드마크명/'위치 정보 없음'/'위치 권한 필요'.
  const [locationName, setLocationName] = useState("위치 확인 중...");
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationNameRef = useRef<string | null>(null);
  const fullTextRef = useRef("");
  const optimizedRef = useRef(imageBase64);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );

  // ① 위치 = 운영 requestBrowserLocation 클론 (권한 1회 → 좌표 → 랜드마크 → 위치창).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (alive) setLocationName("위치 권한 필요");
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        gpsRef.current = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        };
        const r = await fetch(
          `${CONFIG.API.SERVER_URL}/api/guide/landmark?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`,
        );
        const d = r.ok ? await r.json() : null;
        const name = d?.name || "위치 정보 없음";
        locationNameRef.current = d?.name || null;
        if (alive) setLocationName(name);
      } catch {
        if (alive) setLocationName("위치 정보 없음");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ② 해설 = 최적화 → 페르소나 → 스트리밍 → 문장 분리 즉시 표시 (운영 processImage 클론).
  useEffect(() => {
    let alive = true;
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
        // 운영 = optimizeImage 후 전송 (응답속도 근본 = 2026-07-20 사장님 지적 #10).
        const optimized = await optimizeImageBase64(imageBase64);
        optimizedRef.current = optimized;

        const systemInstruction = await fetchPrompt(lang, "image");

        // ⚠️ 2026-07-29 §9 = 로그인 토큰 첨부 필수. 이 호출은 5크레딧 차감 지점(server/guide-routes.ts:47)인데
        //   토큰이 없으면 서버가 "비로그인=무과금" 으로 보고 **영구 무료**가 된다(§22 실측 지적).
        const guideUser = await getUserData();
        const resp = await expoFetch(`${CONFIG.API.SERVER_URL}/api/gemini`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(guideUser?.token?.startsWith("simple_auth_token_v1_")
              ? { Authorization: `Bearer ${guideUser.token}` }
              : {}),
          },
          body: JSON.stringify({
            base64Image: optimized,
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
        readerRef.current = reader; // 언마운트 시 스트림 취소용(§22 검증 반영)
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

          fullTextRef.current += chunkText;
          // 운영 index.js 문장 분리 그대로 = [.?!] 종결부호 단위.
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
      // 화면 이탈 시 스트림 소비 중단(백그라운드 다운로드 방지 = §22 검증 반영).
      readerRef.current?.cancel().catch(() => {});
      readerRef.current = null;
    };
  }, [imageBase64, lang]);

  // ③ 저장 = 운영 handleSaveClick 페이로드 그대로. 로그인한 경우만(사장님 확정 2026-07-20).
  const handleSave = useCallback(async (): Promise<boolean> => {
    const user = await getUserData();
    if (!user?.token || !user.token.startsWith("simple_auth_token_v1_")) {
      Alert.alert(
        "로그인이 필요합니다",
        "저장은 로그인 후 이용할 수 있습니다.",
      );
      return false;
    }
    if (!fullTextRef.current) return false;
    try {
      const tempLocalId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const resp = await fetch(`${CONFIG.API.SERVER_URL}/api/guides/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          language: lang,
          guides: [
            {
              localId: tempLocalId,
              title: "제목 없음",
              description: fullTextRef.current,
              imageDataUrl: `data:image/jpeg;base64,${optimizedRef.current}`,
              latitude: gpsRef.current?.lat?.toString(),
              longitude: gpsRef.current?.lng?.toString(),
              locationName: locationNameRef.current,
              aiGeneratedContent: fullTextRef.current,
              voiceLang: getTTSLanguage(lang),
              voiceName: null,
            },
          ],
        }),
      });
      if (!resp.ok) {
        Alert.alert("저장 실패", "잠시 후 다시 시도해주세요.");
        return false;
      }
      return true;
    } catch {
      Alert.alert("저장 실패", "네트워크를 확인해주세요.");
      return false;
    }
  }, [lang]);

  return (
    <DetailViewer
      imageUri={`data:image/jpeg;base64,${imageBase64}`}
      sentences={sentences}
      loading={loading}
      loadingText={loadingText}
      done={done}
      locationName={locationName}
      voiceQuery={null}
      mode="camera"
      lang={lang}
      onClose={() => navigation.goBack()}
      onSave={handleSave}
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

// ⚠️ X 닫기 = 완전 투명 + 아이콘만(2026-07-20 사장님 지시 = 컴포넌트 모든 버튼 통일). 우측상단 48px 히트영역.
const styles = StyleSheet.create({
  flex1: { flex: 1 },
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
});
