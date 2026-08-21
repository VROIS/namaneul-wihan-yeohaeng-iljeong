/**
 * ⚠️ 수정금지(승인필요) — 가이드 미니앱 전용 스택 네비게이터 (2026-07-20 사장님 SSOT = 운영앱 완전 클론)
 * = 검증된 레거시 운영앱(내손안에 가이드 = 6개월 실증본) 그대로:
 *   · 카메라 화면 = MainCameraScreen(5단 버튼) + X 우측상단(완전 투명, 미니앱 탈출 → 쓰던 화면 복귀)
 *   · 이미지 = 운영 imageOptimizer 클론(1024px + 품질 0.85 = 실증 최적값) 후 전송 = 응답속도 근본
 *   · 위치창 = 운영 requestBrowserLocation 클론: 위치 1회 허용 → 주변 랜드마크(/api/guide/landmark) → 위치창
 *   · 해설 = DB 페르소나(/api/prompts) → /api/gemini 스트리밍 → 문장 즉시 표시+즉시 낭독(DetailViewer)
 *   · 저장 = 운영 handleSaveClick 페이로드 그대로 /api/guides/batch. 로그인한 경우만(사장님 확정).
 *   · 창고 = 우리 DB 장소(placeId)로 열면 (장소,언어)로 만들어 둔 해설을 먼저 찾고(/api/guide/place-guide),
 *     없을 때만 새로 만든 뒤 그 결과를 공용 창고에 자동으로 담는다(2026-08-02 사장님 확정).
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
// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족 공용 헬퍼(§16 5곳 공용).
import {
  parseCreditShortfall,
  useCreditShortfall,
  type CreditShortfall,
} from "@/lib/creditError";

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
// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 카메라 경로 앱 언어 배선 = openGuide.ts 와 같은 패턴(§16).
import i18n from "@/lib/i18n";
// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 지시 = 이 화면(가이드 미니앱)의 안내문구·에러문구 다국어 = 이 화면
//   전용 i18n(guide/i18n/translations.js) 재사용(§16, MainCameraScreen.js 와 같은 시스템 1벌).
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
  // 해설 화면 입구 = 둘 중 하나만 준다(둘 다 이후 흐름은 완전히 같다):
  //   · imageBase64 = 기기 카메라·갤러리 사진 (원래 입구)
  //   · placeId     = 우리 DB 장소(place_seed_raw.id) = 서버가 그 장소 사진을 재료로 내어준다 (2026-08-02 사장님 지시)
  // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = from = **출발화면**(무료/차감 판정 기준, §9).
  //   "card" = 도시 대표카드 맛보기(무료) / 없음 = 여정 슬롯 등 심화(로그인+차감). openGuide.ts 가 넣는다.
  GuideResult: {
    imageBase64?: string;
    placeId?: number;
    lang?: string;
    from?: string;
  };
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

// ⚠️ 문장 분리 1벌(§16) = 운영 index.js 규칙 그대로 [.?!] 종결부호 단위.
//   스트리밍은 끝이 잘린 조각을 다음 덩어리와 이어 붙여야 하므로 남은 꼬리(rest)를 함께 돌려준다.
//   창고에서 통째로 받은 글도 같은 규칙으로 나눈다 = 낭독 단위가 두 벌이 되지 않는다.
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

// ⚠️ 보관함 저장 페이로드 1벌(§16) = [저장] 버튼과 **창고 자동저장**이 같은 모양을 쓴다.
//   warehouse:true = 새로 만든 해설을 공용 창고에 담는 것 = 서버가 관리자 소유로 넣는다(토큰 불필요).
//   warehouse 없음 = 사용자가 [저장]을 눌러 **본인 '나의 TRIPIS'** 에 담는 것(토큰 필수).
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
          // 사진 = 우리 DB 장소면 Storage 원본 URL 을 그대로(이미 있는 사진을 base64 로 다시 넣으면 장당 110KB 낭비).
          //   기기 사진은 우리 저장소에 없으므로 인라인 data URL. 사진이 아예 없는 장소는 이미지 칸 없이 저장.
          ...(args.imageUrl
            ? { imageUrl: args.imageUrl }
            : args.imageBase64
              ? { imageDataUrl: `data:image/jpeg;base64,${args.imageBase64}` }
              : {}),
          // 창고 열쇠 = 어느 장소의 해설인지. 기기 사진이면 없음(null) = 창고에는 안 뜬다.
          placeId: args.placeId ?? null,
          // 도시 = 우리 DB 장소면 그 장소의 city_id(좌표 최근접 계산보다 정확). 없으면 서버가 좌표로 계산.
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
    (page: string, data?: { imageBase64?: string; placeId?: number }) => {
      if (page === "detail" && data?.imageBase64) {
        // ⚠️ 수정금지(승인필요) 2026-08-14 = openGuide.ts 와 같은 패턴(§16) = 앱 언어를 함께 넘긴다.
        //   안 넘기면 GuideResultHost 의 기본값 "ko" 로 열려 AI 해설이 항상 한국어로만 생성됐다.
        navigation.navigate("GuideResult", {
          imageBase64: data.imageBase64,
          lang: i18n.language || "ko",
        });
        return;
      }
      // ⚠️ 2026-08-02 사장님 지시 = 관리자 전용 [장소번호] 입구. 번호만 넘긴다.
      //   그 뒤(창고 조회 → 없으면 생성 → 자동 저장)는 해설 화면의 완성된 1벌이 그대로 한다(§16).
      if (page === "detail" && data?.placeId) {
        navigation.navigate("GuideResult", {
          placeId: data.placeId,
          lang: i18n.language || "ko",
        });
        return;
      }
      // ⚠️ 수정금지(승인필요) 2026-08-01 사장님 §B-0 = [보관함] = 프로필 탭의 '나의 TRIPIS' 섹션 1벌로 간다.
      //   보관함 화면을 따로 만들지 않는다(§16 재발명 금지) = 저장된 TRIPIS 카드가 이미 그 섹션에 뜬다.
      //   미니앱은 루트 스택 모달이라 navigate 만으로는 안 닫힌다(DevTools 실측: 뒤만 프로필로 바뀌고 미니앱이 위에 남음)
      //   → 이 화면 [X]와 같은 goBack 으로 **먼저 닫고**(검증된 1벌) 그 다음 프로필 탭을 켠다.
      if (page === "archive") {
        rootNavigation.goBack();
        rootNavigation.navigate("Main", { screen: "Profile" });
        return;
      }
      // 'voice'(음성질문) = 추후 배선 (사장님 지시).
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

// ⚠️ 해설 화면 = 운영 processImage 흐름 그대로 (RN 배선판):
//   ①이미지 최적화(1024/0.85) ②위치 1회 허용→랜드마크→위치창 ③DB 페르소나 ④/api/gemini 스트리밍
//   ⑤문장 단위 즉시 표시(낭독은 DetailViewer가 첫 문장 즉시 시작) ⑥저장 = 로그인 시 guides.
//   ⚠️ 2026-08-02 사장님 지시 = 재료가 우리 DB 장소 사진(placeId)일 때도 ③~⑥은 **완전히 같은 1벌**을 탄다.
//     다른 점은 재료를 어디서 얻는지 뿐이고, 장소가 이미 확정이라 ②(GPS·랜드마크)는 아예 실행하지 않는다.
function GuideResultHost({
  route,
  navigation,
}: NativeStackScreenProps<GuideStackParamList, "GuideResult">) {
  // ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 판단3종 적발(§22) = route.params.lang('zh' 등)을 정규화 없이
  //   그대로 쓰면 DetailViewer.js/IOS_VOICE_MAP 가 'zh-CN' 키만 있어 한국어로 폴백됨. 여기 1곳에서 정규화하면
  //   이 화면의 guideT() 전부(§0 = 같은 값 여러 곳에서 각자 정규화 금지)와 DetailViewer 전달까지 한 번에 해결.
  const {
    imageBase64,
    placeId,
    lang: rawLang = "ko",
    from: openedFrom,
  } = route.params;
  const lang = normalizeLang(rawLang);
  const showCreditShortfall = useCreditShortfall();
  // ⚠️ 수정금지(승인필요) 2026-08-05 = 이 화면은 **루트 스택 fullScreenModal**(가이드 미니앱) 안이다
  //   (RootStackNavigator.tsx:198). 충전 화면으로 보내려면 **미니앱을 먼저 닫아야** 한다:
  //   · 안 닫고 navigate 하면 = StackRouter 의 NAVIGATE 는 pop 표시가 없으면 기존 Main 을 찾지 않고
  //     **새로 push** 한다(routers/src/StackRouter.tsx:371-382 소스 확인) → [Main, 미니앱, Main] = 메인 두 벌
  //     = RootStackNavigator.tsx:185-187 이 기록한 사고(여정 화면 두 벌이 전역 슬롯을 서로 지움).
  //   · 닫을 때 이 화면의 goBack 을 쓰면 안 된다 = navigation prop 은 **가이드 스택**의 것이라,
  //     카메라로 들어온 경우 스택이 [GuideCamera, GuideResult](initialRouteName="GuideCamera", :606)라서
  //     카메라로 돌아갈 뿐 미니앱은 그대로 남는다. → **루트를 직접 지목**(getParent)해서 닫는다.
  const [sentences, setSentences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState(guideT("loadingText1", lang));
  const [done, setDone] = useState(false);
  // 위치창 = 운영 클론: '위치 확인 중...' → 랜드마크명/'위치 정보 없음'/'위치 권한 필요'.
  //   우리 DB 장소로 연 경우 = 장소명이 곧 위치이므로 서버가 준 이름으로 바로 채운다.
  const [locationName, setLocationName] = useState(
    placeId ? "" : guideT("locationChecking", lang),
  );
  // 화면에 띄울 사진 = 기기 사진이면 인라인 data URL, 우리 DB 장소면 Storage 원본 URL.
  const [imageUri, setImageUri] = useState(
    imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : "",
  );
  // 사진이 없는 장소일 때 화면에 띄울 아이콘 종류(= 그 장소의 분류). 여정 슬롯 카드와 같은 결(§16).
  const [placeCategory, setPlaceCategory] = useState<string | null>(null);
  // ⚠️ 2026-08-03 사장님 지시 = 한 사용자 = 한 장소 = 해설 1행.
  //   창고 응답의 mine(= 내가 이미 담아둔 장소·언어)을 뷰어에 넘겨 [저장]을 처음부터 잠근다.
  //   기기 사진(장소번호 없음)은 창고를 부르지 않으므로 항상 거짓 = 지금 그대로 매번 저장된다.
  const [alreadySaved, setAlreadySaved] = useState(false);
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationNameRef = useRef<string | null>(null);
  const fullTextRef = useRef("");
  const optimizedRef = useRef("");
  // 우리 DB 장소로 연 경우에만 채워진다 = 보관함에 사진 URL·도시를 그대로 넣기 위한 값.
  const placeImageUrlRef = useRef<string | null>(null);
  const cityIdRef = useRef<number | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );

  // ① 위치 = 운영 requestBrowserLocation 클론 (권한 1회 → 좌표 → 랜드마크 → 위치창).
  //   ⚠️ 우리 DB 장소(placeId)로 연 경우 = 장소·좌표가 이미 확정 = GPS 도 유료 랜드마크 호출도 하지 않는다(§15 비용).
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
        //   기기 GPS 는 오차(실내·건물 사이에서 수십~수백 m)가 있고, 우리가 화면에 보여주고 기록하는 대상은
        //   그 대표장소이기 때문. 랜드마크가 안 잡혔을 때만 위에서 받아둔 기기 GPS 를 그대로 쓴다.
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

  // ② 해설 = 재료 확보 → 페르소나 → 스트리밍 → 문장 분리 즉시 표시 (운영 processImage 클론).
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
        // 로그인 토큰 = 아래 **창고 조회·해설 생성 둘 다 차감 지점**이라 먼저 확보한다.
        //   토큰이 없으면 서버가 "비로그인=무과금"으로 보고 영구 무료가 된다(§22 실측 지적).
        const guideUser = await getUserData();
        const authHeader: Record<string, string> = guideUser?.token?.startsWith(
          "simple_auth_token_v1_",
        )
          ? { Authorization: `Bearer ${guideUser.token}` }
          : {};

        // ⓪ ⚠️ 2026-08-02 사장님 확정 = 우리 DB 장소는 **창고를 먼저 본다**.
        //   (장소, 언어)로 이미 만들어 둔 해설이 있으면 그대로 보여준다 = 유료 외부호출 0.
        //   204 = 창고에 없음 → 아래에서 새로 만들고, 다 만들면 창고에 자동으로 담는다.
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

        // 재료 확보 = 두 입구가 여기서 하나로 합쳐진다(아래 해설·저장 흐름은 완전히 같은 1벌).
        //   · 우리 DB 장소(placeId) = 서버가 **확정 정보 머리글**만 조립해 준다(사진은 Gemini 에 안 보낸다 = 아래 참조).
        //   · 기기 사진 = 운영 optimizeImage 후 전송 (응답속도 근본 = 2026-07-20 사장님 지적 #10).
        let hintHeader = "";
        if (placeId) {
          const pr = await fetch(
            `${CONFIG.API.SERVER_URL}/api/guide/place-image?placeId=${placeId}&lang=${lang}`,
          );
          const pd = await pr.json().catch(() => null);
          // 🔴 서버가 준 사유를 **그대로** 화면에 보여준다(2026-07-31 사장님 SSOT = 뭉갠 문구로 덮지 않는다).
          //   없는 번호 = 404 "그런 장소가 없습니다" / 구글 식별정보 없음 = 409 "검증되지 않은 장소(구글 식별정보 없음)".
          //   표시 경로는 아래 catch 의 failMsg 1벌을 그대로 탄다(§16 = 새 표시 장치를 만들지 않는다).
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
        //   해설의 정확도를 만드는 것은 사진이 아니라 위 머리글이고(2026-08-02 4종 실측),
        //   사진을 같이 보내면 요청이 799KB·6.0초 / 머리글만 보내면 1KB·3.9초 = 속도·비용 둘 다 손해다.
        //   화면에 뜨는 사진은 위 setImageUri(pd.imageUrl) = 우리 이미지 그대로다(사진과 해설은 별개).
        //   기기 카메라·갤러리 사진은 그 사진이 곧 재료이므로 지금 그대로 최적화 후 보낸다.
        const optimized = placeId
          ? ""
          : await optimizeImageBase64(imageBase64 || "");
        optimizedRef.current = optimized;

        // ⚠️ 2026-08-02 사장님 SSOT = 우리 DB 장소는 **확정 정보 머리글을 페르소나 앞에** 붙여 보낸다.
        //   실측: 사진이 엉뚱해도 머리글이 이기고, 사진이 없어도 머리글만으로 해설이 나온다.
        //   기기 사진 경로는 장소가 확정이 아니므로 머리글 없이 지금 그대로 간다(hintHeader = 빈 문자열).
        const systemInstruction =
          hintHeader + (await fetchPrompt(lang, "image"));

        // ⚠️ 2026-07-29 §9 = 로그인 토큰 첨부 필수(위에서 만든 authHeader 1벌). 이 호출은 5크레딧 차감 지점인데
        //   토큰이 없으면 서버가 "비로그인=무과금" 으로 보고 **영구 무료**가 된다(§22 실측 지적).
        const resp = await expoFetch(`${CONFIG.API.SERVER_URL}/api/gemini`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({
            // 사진이 없으면 base64Image 를 아예 보내지 않는다(서버는 prompt 만 있어도 받는다 = guide-routes.ts ①).
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
        // 🪙 잔액부족(402) = 서버가 준 사유 그대로. "다시 시도해 주세요"로 뭉개면 원인을 알 수 없다.
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
          // 문장 분리 = splitSentences 1벌(§16). 끝이 잘린 꼬리(rest)는 다음 덩어리와 이어 붙인다.
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
        //   다음 사람이 같은 장소·같은 언어로 열면 위 ⓪에서 그대로 나온다 = 유료 외부호출 0.
        //   본인 '나의 TRIPIS' 는 [저장]을 눌렀을 때만 따로 1건 생긴다(아래 handleSave) = 사장님 "필요시 저장".
        //   ⚠️ 서버가 본문을 모아 저장하지 않는 이유 = 스트림이 중간에 끊기면 반쪽 해설이 창고에 박힌다.
        //   화면을 떠났어도(alive=false) 담는다 = 이미 돈이 나간 결과물이라 버리지 않는다.
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
          //   크레딧부족이면 그 위에 공용 Alert+충전이동을 얹는다(§16 5곳 공용).
          //   ⚠️ 크레딧부족을 else 로 가르면 안 된다 = 안드로이드는 Alert 을 뒤로가기로 닫을 수 있어
          //     (cancelable 기본 true) 본문이 비어 있으면 **빈 해설칸만 남는다**(§22 판단검증이 잡음).
          setSentences((prev) =>
            prev.length ? prev : [failMsg || guideT("guideLoadFailed", lang)],
          );
          if (creditShortfall) {
            // 미니앱을 **루트에서** 먼저 닫고(어느 진입경로든 확실) → 그 다음 프로필.
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
      // 화면 이탈 시 스트림 소비 중단(백그라운드 다운로드 방지 = §22 검증 반영).
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
      // 페이로드 = postGuideBatch 1벌(§16). 창고 자동저장과 같은 모양이고, 주인만 본인으로 달라진다.
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
      // 사진이 없는 장소 = 뷰어가 이 분류의 아이콘을 대신 띄운다(여정 슬롯 카드와 같은 결).
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
