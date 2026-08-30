// ⚠️ 수정금지(승인필요) 2026-07-20 사장님 SSOT = 가이드 미니앱 전용 스택 네비게이터, 검증된 레거시 운영앱(내손안에 가이드) 완전 클론 — 카메라·이미지·위치·해설·저장·창고 동작 전부 운영 로직 그대로, 임의 변경 금지

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
import GuideIconJs from "@/screens/guide/components/GuideIcons";
// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족 공용 헬퍼(§16 5곳 공용).
import {
  parseCreditShortfall,
  useCreditShortfall,
  type CreditShortfall,
} from "@/lib/creditError";

import MainCameraScreenJs from "@/screens/guide/screens/MainCameraScreen";
import DetailViewerJs from "@/screens/guide/components/DetailViewer";
import { CONFIG } from "@/screens/guide/config/constants";
import {
  fetchPrompt,
  getTTSLanguage,
} from "@/screens/guide/services/PromptService";
import { getUserData } from "@/lib/auth";
// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 카메라 경로 앱 언어 배선 = openGuide.ts 와 같은 패턴(§16).
import i18n from "@/lib/i18n";
// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 지시 = 이 화면(가이드 미니앱)의 안내문구·에러문구 다국어 = 이 화면
import { t as guideT, normalizeLang } from "@/screens/guide/i18n/translations";

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
  // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = from = **출발화면**(무료/차감 판정 기준, §9).
  GuideResult: {
    imageBase64?: string;
    placeId?: number;
    lang?: string;
    from?: string;
  };
};

const Stack = createNativeStackNavigator<GuideStackParamList>();

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

function splitSentences(text: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let buf = text;
  let idx = buf.search(/[.?!]/);
  while (idx !== -1) {
    const s = buf.substring(0, idx + 1).trim();
    buf = buf.substring(idx + 1);
    if (s) sentences.push(s);
    idx = buf.search(/[.?!]/);
  }
  return { sentences, rest: buf };
}

async function postGuideBatch(args: {
  token?: string | null;
  warehouse?: boolean;
  lang: string;
  placeId?: number | null;
  text: string;
  imageUrl?: string | null;
  imageBase64?: string | null;
  lat?: unknown;
  lng?: unknown;
  locationName?: string | null;
  cityId?: number | null;
}): Promise<boolean> {
  const resp = await fetch(`${CONFIG.API.SERVER_URL}/api/guides/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(args.token ? { Authorization: `Bearer ${args.token}` } : {}),
    },
    body: JSON.stringify({
      language: args.lang,
      ...(args.warehouse ? { warehouse: true } : {}),
      guides: [
        {
          localId: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          title: guideT("untitled", args.lang),
          description: args.text,
          ...(args.imageUrl
            ? { imageUrl: args.imageUrl }
            : args.imageBase64
              ? { imageDataUrl: `data:image/jpeg;base64,${args.imageBase64}` }
              : {}),
          placeId: args.placeId ?? null,
          cityId: args.cityId ?? null,
          latitude: args.lat != null ? String(args.lat) : undefined,
          longitude: args.lng != null ? String(args.lng) : undefined,
          locationName: args.locationName ?? null,
          aiGeneratedContent: args.text,
          voiceLang: getTTSLanguage(args.lang),
          voiceName: null,
        },
      ],
    }),
  });
  return resp.ok;
}

//   = X 닫기 = 우측상단 완전 투명(2026-07-20 사장님 지시 = 컴포넌트 모든 버튼 통일).
function GuideCameraHost() {
  const navigation =
    useNavigation<
      NativeStackScreenProps<GuideStackParamList, "GuideCamera">["navigation"]
    >();
  const rootNavigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const [, requestPermission] = useCameraPermissions();

  useEffect(() => {
    requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNavigateToWebView = useCallback(
    (page: string, data?: { imageBase64?: string; placeId?: number }) => {
      if (page === "detail" && data?.imageBase64) {
        // ⚠️ 수정금지(승인필요) 2026-08-14 = openGuide.ts 와 같은 패턴(§16) = 앱 언어를 함께 넘긴다.
        navigation.navigate("GuideResult", {
          imageBase64: data.imageBase64,
          lang: i18n.language || "ko",
        });
        return;
      }
      // ⚠️ 2026-08-02 사장님 지시 = 관리자 전용 [장소번호] 입구. 번호만 넘긴다.
      if (page === "detail" && data?.placeId) {
        navigation.navigate("GuideResult", {
          placeId: data.placeId,
          lang: i18n.language || "ko",
        });
        return;
      }
      // ⚠️ 수정금지(승인필요) 2026-08-01 사장님 §B-0 = [보관함] = 프로필 탭의 '나의 TRIPIS' 섹션 1벌로 간다.
      if (page === "archive") {
        rootNavigation.goBack();
        rootNavigation.navigate("Main", { screen: "Profile" });
        return;
      }
    },
    [navigation, rootNavigation],
  );

  return (
    <View style={styles.flex1}>
      <MainCameraScreen
        onNavigateToWebView={handleNavigateToWebView}
        lang={i18n.language || "ko"}
      />
      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + 16 }]}
        onPress={() => rootNavigation.goBack()}
        accessibilityLabel={guideT("closeA11y", i18n.language)}
      >
        <GuideIcon name="close" size={32} />
      </TouchableOpacity>
    </View>
  );
}

//   ⚠️ 2026-08-02 사장님 지시 = 재료가 우리 DB 장소 사진(placeId)일 때도 ③~⑥은 **완전히 같은 1벌**을 탄다.
function GuideResultHost({
  route,
  navigation,
}: NativeStackScreenProps<GuideStackParamList, "GuideResult">) {
  // ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 판단3종 적발(§22) = route.params.lang('zh' 등)을 정규화 없이
  const {
    imageBase64,
    placeId,
    lang: rawLang = "ko",
    from: openedFrom,
  } = route.params;
  const lang = normalizeLang(rawLang);
  const showCreditShortfall = useCreditShortfall();
  // ⚠️ 수정금지(승인필요) 2026-08-05 = 이 화면은 **루트 스택 fullScreenModal**(가이드 미니앱) 안이다
  const [sentences, setSentences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState(guideT("loadingText1", lang));
  const [done, setDone] = useState(false);
  const [locationName, setLocationName] = useState(
    placeId ? "" : guideT("locationChecking", lang),
  );
  const [imageUri, setImageUri] = useState(
    imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : "",
  );
  const [placeCategory, setPlaceCategory] = useState<string | null>(null);
  // ⚠️ 2026-08-03 사장님 지시 = 한 사용자 = 한 장소 = 해설 1행.
  const [alreadySaved, setAlreadySaved] = useState(false);
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationNameRef = useRef<string | null>(null);
  const fullTextRef = useRef("");
  const optimizedRef = useRef("");
  const placeImageUrlRef = useRef<string | null>(null);
  const cityIdRef = useRef<number | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );

  useEffect(() => {
    if (placeId) return;
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (alive) setLocationName(guideT("locationPermissionNeeded", lang));
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
        // ⚠️ 2026-08-02 사장님 지시 = 저장할 좌표는 **랜드마크(구글이 준 인근 대표장소) 좌표**를 우선한다.
        if (Number.isFinite(d?.lat) && Number.isFinite(d?.lng)) {
          gpsRef.current = { lat: d.lat, lng: d.lng };
        }
        const name = d?.name || guideT("locationNotFound", lang);
        locationNameRef.current = d?.name || null; // 화면·저장 표시는 이름 그대로(좌표는 안 보임)
        if (alive) setLocationName(name);
      } catch {
        if (alive) setLocationName(guideT("locationNotFound", lang));
      }
    })();
    return () => {
      alive = false;
    };
  }, [placeId]);

  useEffect(() => {
    let alive = true;
    const loadingMessages = [
      guideT("loadingText1", lang),
      guideT("loadingText2", lang),
    ];
    let msgIndex = 0;
    const loadingInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % loadingMessages.length;
      if (alive) setLoadingText(loadingMessages[msgIndex]);
    }, 2000);

    (async () => {
      // 🪙 서버가 준 실패 사유(잔액부족 등) = 화면에서 뭉개지 않고 그대로 보여준다(2026-07-31 사장님 SSOT).
      let failMsg: string | null = null;
      // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족이면 해설칸 텍스트 대신 공용 Alert+충전이동(§16).
      let creditShortfall: CreditShortfall | null = null;
      try {
        const guideUser = await getUserData();
        const authHeader: Record<string, string> = guideUser?.token?.startsWith(
          "simple_auth_token_v1_",
        )
          ? { Authorization: `Bearer ${guideUser.token}` }
          : {};

        // ⓪ ⚠️ 2026-08-02 사장님 확정 = 우리 DB 장소는 **창고를 먼저 본다**.
        if (placeId) {
          // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = from = 출발화면(§9 무료/차감 판정, 서버 1벌).
          const wr = await fetch(
            `${CONFIG.API.SERVER_URL}/api/guide/place-guide?placeId=${placeId}&lang=${lang}${openedFrom ? `&from=${encodeURIComponent(openedFrom)}` : ""}`,
            { headers: authHeader },
          );
          if (wr.status === 402) {
            const wd = await wr.json().catch(() => null);
            failMsg = String(wd?.message || guideT("creditShort", lang));
            creditShortfall = parseCreditShortfall(wd);
            throw new Error(failMsg);
          }
          if (wr.status === 200) {
            const wd = await wr.json();
            const stored = String(wd.content || "");
            fullTextRef.current = stored;
            placeImageUrlRef.current = wd.imageUrl || null;
            cityIdRef.current = wd.cityId ?? null;
            gpsRef.current = { lat: wd.latitude, lng: wd.longitude };
            locationNameRef.current = wd.locationName;
            clearInterval(loadingInterval);
            if (alive) {
              setLocationName(wd.locationName || "");
              setImageUri(wd.imageUrl || "");
              setPlaceCategory(wd.seedCategory || null);
              setAlreadySaved(!!wd.mine); // 내가 이미 담아둔 해설 = [저장] 잠금(중복 저장 차단)
              const { sentences: whole, rest } = splitSentences(stored);
              const tail = rest.trim();
              setSentences(tail ? [...whole, tail] : whole);
              setLoading(false);
              setDone(true);
            }
            return; // 창고에서 나왔다 = 새로 만들지도, 다시 담지도 않는다
          }
        }

        //   · 기기 사진 = 운영 optimizeImage 후 전송 (응답속도 근본 = 2026-07-20 사장님 지적 #10).
        let hintHeader = "";
        if (placeId) {
          const pr = await fetch(
            `${CONFIG.API.SERVER_URL}/api/guide/place-image?placeId=${placeId}&lang=${lang}`,
          );
          const pd = await pr.json().catch(() => null);
          // 🔴 서버가 준 사유를 **그대로** 화면에 보여준다(2026-07-31 사장님 SSOT = 뭉갠 문구로 덮지 않는다).
          if (!pr.ok) {
            failMsg = String(
              pd?.error || `${guideT("placeError", lang)}: ${pr.status}`,
            );
            throw new Error(failMsg);
          }
          hintHeader = pd.hintHeader || "";
          placeImageUrlRef.current = pd.imageUrl; // 보관함에는 이 URL 그대로 저장(사진을 base64 로 다시 담지 않는다)
          cityIdRef.current = pd.cityId;
          gpsRef.current = { lat: pd.latitude, lng: pd.longitude };
          locationNameRef.current = pd.placeName;
          if (alive) {
            setLocationName(pd.placeName);
            setImageUri(pd.imageUrl || ""); // 사진 없으면 빈 값 = 뷰어가 아이콘을 띄운다
            setPlaceCategory(pd.seedCategory || null);
          }
        }

        // ⚠️ 2026-08-03 사장님 지시 = **우리 DB 장소는 사진을 Gemini 에 보내지 않는다**(빈 문자열 = 사진 없음).
        const optimized = placeId
          ? ""
          : await optimizeImageBase64(imageBase64 || "");
        optimizedRef.current = optimized;

        // ⚠️ 2026-08-02 사장님 SSOT = 우리 DB 장소는 **확정 정보 머리글을 페르소나 앞에** 붙여 보낸다.
        const systemInstruction =
          hintHeader + (await fetchPrompt(lang, "image"));

        const resp = await expoFetch(`${CONFIG.API.SERVER_URL}/api/gemini`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({
            ...(optimized ? { base64Image: optimized } : {}),
            prompt: optimized
              ? lang === "ko"
                ? "이 이미지를 분석하고 생생하게 설명해주세요."
                : "Analyze this image and describe it vividly."
              : lang === "ko"
                ? "이 장소를 생생하게 설명해주세요."
                : "Describe this place vividly.",
            systemInstruction,
          }),
        });
        if (resp.status === 402) {
          const d = await resp.json().catch(() => null);
          failMsg = String(d?.message || guideT("creditShort", lang));
          creditShortfall = parseCreditShortfall(d);
          throw new Error(failMsg);
        }
        if (!resp.ok || !resp.body)
          throw new Error(`${guideT("serverError", lang)}: ${resp.status}`);

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
          sentenceBuffer += chunkText;
          const { sentences: completed, rest } = splitSentences(sentenceBuffer);
          sentenceBuffer = rest;
          if (completed.length && alive) {
            setSentences((prev) => [...prev, ...completed]);
          }
        }

        const tail = sentenceBuffer.trim();
        if (tail && alive) setSentences((prev) => [...prev, tail]);
        if (alive) {
          setLoading(false);
          setDone(true);
        }

        // 🏷️ 2026-08-02 사장님 확정 = **새로 만든 해설은 창고에 자동으로 담는다**(공용 = 관리자 소유).
        if (placeId && fullTextRef.current) {
          postGuideBatch({
            warehouse: true,
            lang,
            placeId,
            text: fullTextRef.current,
            imageUrl: placeImageUrlRef.current,
            lat: gpsRef.current?.lat,
            lng: gpsRef.current?.lng,
            locationName: locationNameRef.current,
            cityId: cityIdRef.current,
          }).catch((err) => console.warn("[guide] 창고 자동저장 실패:", err));
        }
      } catch (e) {
        console.error("[guide] 해설 스트리밍 오류:", e);
        clearInterval(loadingInterval);
        if (alive) {
          setLoading(false);
          setDone(true);
          // ⚠️ 수정금지(승인필요) 2026-08-05 = 실패 사유는 **언제나** 화면에 남긴다(2026-07-31 SSOT = 서버가 준 사유를 뭉개지 마라).
          setSentences((prev) =>
            prev.length ? prev : [failMsg || guideT("guideLoadFailed", lang)],
          );
          if (creditShortfall) {
            showCreditShortfall(creditShortfall, () =>
              navigation.getParent()?.goBack(),
            );
          }
        }
      }
    })();

    return () => {
      alive = false;
      clearInterval(loadingInterval);
      readerRef.current?.cancel().catch(() => {});
      readerRef.current = null;
    };
  }, [imageBase64, placeId, lang]);

  // ③ 저장 = 운영 handleSaveClick 페이로드 그대로. 로그인한 경우만(사장님 확정 2026-07-20).
  const handleSave = useCallback(async (): Promise<boolean> => {
    const user = await getUserData();
    if (!user?.token || !user.token.startsWith("simple_auth_token_v1_")) {
      Alert.alert(
        guideT("loginRequiredTitle", lang),
        guideT("loginRequiredBody", lang),
      );
      return false;
    }
    if (!fullTextRef.current) return false;
    try {
      const ok = await postGuideBatch({
        token: user.token,
        lang,
        placeId: placeId ?? null,
        text: fullTextRef.current,
        imageUrl: placeImageUrlRef.current,
        imageBase64: optimizedRef.current,
        lat: gpsRef.current?.lat,
        lng: gpsRef.current?.lng,
        locationName: locationNameRef.current,
        cityId: cityIdRef.current,
      });
      if (!ok) {
        Alert.alert(
          guideT("saveFailedTitle", lang),
          guideT("saveFailedRetryBody", lang),
        );
        return false;
      }
      return true;
    } catch {
      Alert.alert(
        guideT("saveFailedTitle", lang),
        guideT("saveFailedNetworkBody", lang),
      );
      return false;
    }
  }, [lang, placeId]);

  return (
    <DetailViewer
      imageUri={imageUri}
      placeholderCategory={placeCategory}
      sentences={sentences}
      loading={loading}
      loadingText={loadingText}
      done={done}
      // 이미 내 것으로 담아둔 해설 = 뷰어가 [저장] 첫 클릭부터 "이미 저장되었습니다"만 안내(2026-08-03 사장님).
      alreadySaved={alreadySaved}
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
