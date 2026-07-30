// ⚠️ 수정금지(승인필요) — BTS 랜딩 (VROIS/vrois 변환 + 무대 구도)
// 상단 전구 8개(서치라이트) → 히어로 텍스트 → "MAKE YOUR TRIP" (앱 정체성) → 구체+손잡이(하단)
// Skia 서치라이트 + 3단계 조명 + 렌즈플레어
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  interpolateColor,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { socialLoginWithGoogle } from "@/lib/auth";
import { getIdTokenFromGoogleResponse } from "@/lib/auth-oauth";
// 구글 = 웹(auth-google.web.ts) / 앱(auth-google.ts) 자동 선택 (2026-07-26 분리)
import { useGoogleAuthRequest } from "@/lib/auth-google";
import { getApiUrl } from "@/lib/query-client";

const { width: SW, height: SH } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 원본 색상 (VROIS/vrois)
const STAGE_COLORS = ["#001a4d", "#050930", "#9333ea"];
const PRIMARY = "#8bacff";
const SECONDARY = "#b486ff";

// ⚠️ PC 데스크톱 해상도 대응 = 320px / 140px 최대폭 제한 (화면 잘림 완벽 방지)
const GLOBE_SIZE = Math.min(SW * 0.62, 320);
const HANDLE_W = 50;
const HANDLE_H = Math.min(SW * 0.35, 140);
const BTN_AREA_W = Math.min(SW * 0.72, 360);

// ⚠️ 수정금지(승인필요) 2026-07-30 = 아미봉 구체 안 글자에 **똑같이** 적용하는 값 1벌(§0).
//   여러 곳에 흩어 적으면 나중에 한 곳만 고치고 나머지를 빠뜨린다(드리프트).
//   한 줄 유지 + 넘치면 스스로 축소 + 폰 글자확대 상한.
//   ⚠️ **작아지는 하한은 `minimumFontSize`(실제 크기)로 준다.**
//     `minimumFontScale`(배율)은 안드로이드에 **전달조차 되지 않아 무시된다**
//     (RN 소스 conversions.h 가 안드로이드로 보내는 값 목록에 없음 = 하한이 4dp 로 떨어져
//      글자가 개미만 해진다). 두 OS 가 같게 동작하도록 실제 크기로 지정한다.
const FIT_ONE_LINE = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontSize: 8, // 이보다 작아지지 않는다(가장 작은 글자가 9pt 라 8 이 하한)
  maxFontSizeMultiplier: 1.2,
} as const;

// ⚠️ 수정금지(승인필요) — Haptics
const haptic = (t: "light" | "medium" | "success") => {
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — D-Day 실시간(서버 계산) + 공연 상세 데이터. 대체값 없음 = 못 받으면 빈 칸.
type ConcertInfo = {
  city: string;
  dDay: number;
  date?: string;
  venue?: string;
  cityId?: number;
};
// ⚠️ 2026-07-30 §19 = 날짜를 글자로 박아둔 대체값 완전삭제.
//   사유: 그 공연일이 지나 D-Day 가 음수로 표시되고 이미 끝난 도시가 첫 화면에 떴다.
//   API 가 답하기 전에는 도시·D-Day 를 **비워둔다**(빈 값 = 화면이 표시하지 않음). 거짓 숫자보다 빈 칸이 낫다.
const EMPTY_CONCERT: ConcertInfo = { city: "", dDay: 0 };

// 전구/서치라이트 삭제됨 (Expo Go 미지원 + 비율 깨짐)

export function BTSLandingScreen() {
  const navigation = useNavigation<any>();
  const [dob, setDob] = useState("");
  const [dobComplete, setDobComplete] = useState(false);
  const [lightingStage, setLightingStage] = useState(0);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [concertInfo, setConcertInfo] = useState(EMPTY_CONCERT);

  // ⚠️ 수정금지(승인필요) — /api/bts/next-concert 실시간 연동
  //   남은 공연이 없으면 서버가 null 을 준다 = `data?.city` 로 받아야 터지지 않는다(2026-07-30).
  useEffect(() => {
    fetch(`${getApiUrl()}/api/bts/next-concert`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.city)
          setConcertInfo({
            city: data.city.toUpperCase(),
            dDay: data.dDay,
            date: data.date,
            venue: data.venue,
            cityId: data.cityId,
          }); // ⚠️ 수정금지(승인필요) — next-concert 전체 데이터 저장
      })
      .catch(() => {}); // 실패해도 빈 칸 유지 = 거짓 숫자를 만들지 않는다
  }, []);

  const { city, dDay } = concertInfo;

  // ⚠️ 수정금지(승인필요) — Google OAuth hook (기존 LoginScreen 패턴 그대로)
  const [googleRequest, googleResponse, googlePromptAsync] =
    useGoogleAuthRequest();
  const processedGoogleRef = useRef<typeof googleResponse>(null);

  const entrance = useSharedValue(0);
  const flare = useSharedValue(0);
  const globeGlow = useSharedValue(0);
  const bgStage = useSharedValue(0);
  const whiteout = useSharedValue(0);
  // ⚠️ 수정금지(승인필요) — 생년월일 → birthDate 문자열
  const birthDateStr = (() => {
    const digits = dob.replace(/\D/g, "");
    if (digits.length !== 8) return "";
    return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  })();

  // ⚠️ 수정금지(승인필요) — Google OAuth 응답 처리 (기존 LoginScreen 패턴)
  useEffect(() => {
    if (!googleResponse || googleResponse.type !== "success" || !birthDateStr)
      return;
    if (processedGoogleRef.current === googleResponse) return;
    processedGoogleRef.current = googleResponse;
    const idToken = getIdTokenFromGoogleResponse(googleResponse);
    if (!idToken) return;
    setOauthLoading(true);
    socialLoginWithGoogle({
      idToken,
      birthDate: birthDateStr,
      language: "ko",
      deviceType: Platform.OS === "web" ? "web" : "mobile",
    })
      .then((result) => {
        if (result.success) {
          // 인증 성공 → 세계지도 → 캐릭터
          goToWorldMap();
        } else {
          Alert.alert(
            "로그인 실패",
            result.error || "Google 로그인에 실패했습니다.",
          );
        }
      })
      .catch(() => Alert.alert("로그인 실패", "서버 연결에 실패했습니다."))
      .finally(() => setOauthLoading(false));
  }, [googleResponse, birthDateStr]);

  // ⚠️ 수정금지(승인필요) — 등장 시퀀스
  useEffect(() => {
    // 아미봉 스윽 올라옴 (원본: 2.5s cubic-bezier)
    entrance.value = withDelay(
      800,
      withTiming(1, {
        duration: 2500,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      }),
    );
    // stage 1 (Midnight)
    // ⚠️ 수정금지(승인필요) 2026-07-30 = 화면을 벗어나면 이 시계를 반드시 끈다.
    //   안 끄면 3.3초 안에 다음 화면으로 넘어갔을 때 **사라진 화면의 조명을 켜려 든다**.
    const stageTimer = setTimeout(() => {
      bgStage.value = withTiming(1, { duration: 200 });
      setLightingStage(1);
      globeGlow.value = withTiming(0.3, { duration: 600 });
    }, 3300);
    return () => clearTimeout(stageTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚠️ 수정금지(승인필요) — 생년월일 포맷
  const handleDobInput = useCallback((text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 8);
    let fmt = digits;
    if (digits.length > 2) fmt = digits.slice(0, 2) + " / " + digits.slice(2);
    if (digits.length > 4)
      fmt =
        digits.slice(0, 2) +
        " / " +
        digits.slice(2, 4) +
        " / " +
        digits.slice(4);
    setDob(fmt);
    if (digits.length === 8) {
      setDobComplete(true);
      Keyboard.dismiss();
      haptic("medium");
    } else {
      setDobComplete(false);
    }
  }, []);

  // ⚠️ 수정금지(승인필요) — 터치 → stage 2 + 플레어
  const handleInteraction = useCallback(() => {
    bgStage.value = withTiming(2, { duration: 200 });
    setLightingStage(2);
    globeGlow.value = withSpring(0.8, { damping: 12 });
    flare.value = withSequence(
      withTiming(1, { duration: 150 }),
      withTiming(0, { duration: 150 }),
    );
    haptic("light");
  }, []);

  // ⚠️ 수정금지(승인필요) — 세계지도 전환 (인증 성공 후 호출)
  const goToWorldMap = useCallback(() => {
    whiteout.value = withTiming(1, { duration: 600 });
    setTimeout(() => {
      navigation.replace("BTSWorldMap", {
        city,
        cityId: concertInfo.cityId || 0,
        date: concertInfo.date,
        dDay: concertInfo.dDay,
        venue: concertInfo.venue,
      }); // ⚠️ 수정금지(승인필요) — 공연 상세 전달
    }, 700);
  }, [city, concertInfo]);

  // ⚠️ 수정금지(승인필요) — OAuth 실제 연결 (기존 LoginScreen 패턴 그대로)
  // ⚠️ 수정금지(승인필요) 2026-07-30 = 이 함수가 **최신 도시 정보**를 쓰게 고쳤다.
  //   옛것(의존성이 dobComplete·birthDateStr·city)은 실제로 쓰는 값과 하나도 안 맞아서,
  //   공연 정보가 늦게 도착하면 **옛 함수를 붙잡아 다음 화면에 도시·날짜를 빈 값으로 넘겼다** = 삭제 §19.
  const handleLogin = useCallback(async () => {
    handleInteraction();
    globeGlow.value = withSpring(1, { damping: 8, stiffness: 200 });
    haptic("success");

    // ⚠️ 수정금지(승인필요) — BTS 랜딩은 바이패스 (인증은 메인앱에서 처리)
    // 생년월일 입력 완료 + OAuth 터치 = 바로 세계지도 전환
    goToWorldMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleInteraction, goToWorldMap]);

  // ── 애니메이션 스타일 ──

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(bgStage.value, [0, 1, 2], STAGE_COLORS),
  }));

  const entranceStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          entrance.value,
          [0, 1],
          [150, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      entrance.value,
      [0, 0.3, 1],
      [0, 0.5, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const globeShadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: globeGlow.value,
    shadowRadius: interpolate(
      globeGlow.value,
      [0, 0.5, 1],
      [0, 40, 80],
      Extrapolation.CLAMP,
    ),
  }));

  const innerGlowOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      bgStage.value,
      [0, 1, 2],
      [0.1, 0.3, 0.6],
      Extrapolation.CLAMP,
    ),
  }));

  const flareStyle = useAnimatedStyle(() => ({
    opacity: flare.value * 0.4,
    transform: [
      {
        scale: interpolate(
          flare.value,
          [0, 1],
          [0.5, 2.5],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const whiteoutStyle = useAnimatedStyle(() => ({ opacity: whiteout.value }));

  const blurBg = Platform.select({
    android: { backgroundColor: "rgba(255,255,255,0.1)" },
    default: {},
  });
  // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **웹·앱이 똑같이 동작한다.**
  //   옛것(웹이면 생년월일 없이도 눌리게 열어둠)은 시험용이었고, 웹에서 본 것과 폰에서 본 것이
  //   달라지는 원인이었다 = 삭제 §19. 이제 어디서나 생년월일을 넣어야 로그인 버튼이 열린다.
  const isDisabled = !dobComplete;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.root}>
        <StatusBar
          barStyle="light-content"
          translucent
          backgroundColor="transparent"
        />

        {/* Layer 0: 배경 3단계 */}
        <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} />

        {/* Layer 2: 렌즈 플레어 */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            flareStyle,
            { backgroundColor: "rgba(255,255,255,0.4)", pointerEvents: "none" },
          ]}
        />

        {/* ── 상단 히어로 텍스트 ── */}
        <View style={styles.hero}>
          <Text style={styles.tourLabel}>WORLD TOUR 2026</Text>
          <View style={styles.titleRow}>
            <Text style={styles.titleBTS}>BTS </Text>
            <Text style={styles.titleArirang}>'Arirang'</Text>
          </View>
          <View style={styles.sloganWrap}>
            <Text style={styles.slogan}>MAKE YOUR TRIP</Text>
            <Text style={styles.slogan}>WITH THEM</Text>
          </View>
        </View>

        {/* ── 아미봉 (구체 + 손잡이) — 하단 배치, 스윽 올라옴 ── */}
        <Animated.View style={[styles.bombWrap, entranceStyle]}>
          {/* 구체 */}
          <Animated.View
            style={[
              styles.globeShadow,
              globeShadowStyle,
              { shadowColor: lightingStage === 2 ? "#a855f7" : PRIMARY },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.97}
              onPress={handleInteraction}
              style={[styles.globeClip, blurBg]}
            >
              <BlurView intensity={20} tint="dark" style={styles.globeInner}>
                <Animated.View style={[styles.innerGlow, innerGlowOpacity]}>
                  <LinearGradient
                    colors={[`${PRIMARY}25`, "transparent", `${SECONDARY}15`]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                </Animated.View>
                {/* ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **아미봉 그릇(칸 크기·위치)은 한 픽셀도 안 바꾼다**
                    = 3일 연구로 맞춘 최적 크기. 대신 **글자가 그릇에 맞춰 들어가게** 만들었다(FIT_ONE_LINE).
                    사고: 폰 설정에서 글자를 키우면 안드로이드는 **글자와 자간을 함께** 키우는데
                    구체는 화면 폭에만 묶여 안 커진다 → 글자가 넘쳐 잘리고 두 줄로 쪼개졌다. */}
                <Text style={styles.cityLabel} {...FIT_ONE_LINE}>
                  {city}
                </Text>
                <Text style={styles.dDay} {...FIT_ONE_LINE}>
                  {city ? `D-${dDay}` : ""}
                </Text>
                <View style={styles.inputArea}>
                  <Text style={styles.inputLabel} {...FIT_ONE_LINE}>
                    DATE OF BIRTH
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="DD / MM / YYYY"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={dob}
                    onChangeText={handleDobInput}
                    onFocus={handleInteraction}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={14}
                    maxFontSizeMultiplier={1.2}
                  />
                </View>
              </BlurView>
            </TouchableOpacity>
          </Animated.View>

          {/* 손잡이 */}
          <View style={styles.handleWrap}>
            <LinearGradient
              colors={["rgba(255,255,255,0.1)", "rgba(5,9,48,1)"]}
              style={styles.handleGrad}
            />
            <View style={styles.btnArea}>
              <TouchableOpacity
                style={[styles.btn, styles.googleBtn, isDisabled && styles.off]}
                onPress={() => handleLogin()}
                disabled={isDisabled}
                activeOpacity={0.96}
              >
                <Text style={styles.googleTxt}>Continue with Google</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.kakaoBtn, isDisabled && styles.off]}
                onPress={() => handleLogin()}
                disabled={isDisabled}
                activeOpacity={0.96}
              >
                <Text style={styles.kakaoTxt}>Continue with Kakao</Text>
              </TouchableOpacity>
              {Platform.OS === "ios" && (
                <TouchableOpacity
                  style={[styles.appleLink, isDisabled && styles.off]}
                  onPress={() => handleLogin()}
                  disabled={isDisabled}
                  activeOpacity={0.96}
                >
                  <Text style={styles.appleTxt}>Sign in with Apple</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>

        {/* ⚠️ 수정금지(승인필요) — 화이트아웃 (zIndex 99로 모든 레이어 위) */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#FFF", pointerEvents: "none", zIndex: 99 },
            whiteoutStyle,
          ]}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: STAGE_COLORS[0] },

  // ⚠️ 수정금지(승인필요) — 히어로 (상단)
  hero: {
    paddingTop: Platform.OS === "ios" ? 80 : 55,
    paddingLeft: 28,
    paddingRight: 28,
    zIndex: 20,
  },
  tourLabel: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 6,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 20,
  },
  titleBTS: {
    fontSize: 42,
    fontFamily: "Pretendard-Bold",
    color: PRIMARY,
    textShadowColor: "rgba(139,172,255,0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  // ⚠️ 수정금지(승인필요) — Arirang 이탤릭 (고유명사)
  titleArirang: {
    fontSize: 42,
    fontFamily: "Pretendard-Bold",
    fontStyle: "italic",
    color: PRIMARY,
    textShadowColor: "rgba(139,172,255,0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  // ⚠️ 수정금지(승인필요) — 앱 정체성 문구 (가장 크게)
  sloganWrap: {
    marginBottom: 0,
  },
  slogan: {
    fontSize: 30,
    fontFamily: "Pretendard-Bold",
    color: "#FFFFFF",
    letterSpacing: 2,
    lineHeight: 38,
    textShadowColor: "rgba(139,172,255,0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },

  // ⚠️ 수정금지(승인필요) — 아미봉 (하단 배치)
  bombWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
  },
  globeShadow: {
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  globeClip: {
    width: GLOBE_SIZE,
    height: GLOBE_SIZE,
    borderRadius: GLOBE_SIZE / 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  globeInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: GLOBE_SIZE / 2,
  },
  // ⚠️ 수정금지(승인필요) 2026-07-30 = `textAlign:"center"` 는 **빠져 있던 것을 채운 것**이다.
  //   부모의 alignItems:center 만으로는 **자식이 부모보다 넓어지는 순간 왼쪽 기준 넘침**이 되어
  //   글자가 한쪽으로 쏠려 앞글자가 잘렸다(사장님 실기기 관찰). 크기·위치는 그대로다.
  //   ⚠️ 자간(letterSpacing)은 안드로이드에서 **마지막 글자 뒤에도 붙어** 폭이 넓게 잡힌다 = 쏠림을 키운다.
  cityLabel: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 4,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 2,
    textAlign: "center",
    alignSelf: "stretch",
  },
  dDay: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    color: "#FFFFFF",
    letterSpacing: -2,
    marginBottom: 16,
    textAlign: "center",
    alignSelf: "stretch",
  },
  inputArea: { width: "75%", alignItems: "center" },
  inputLabel: {
    fontSize: 9,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 3,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 6,
    textAlign: "center",
    alignSelf: "stretch",
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 50,
    paddingVertical: 10,
    // ⚠️ 수정금지(승인필요) 2026-07-30 = 좌우 여백 20→10, 글자 13→12.
    //   사유: 칸 안쪽 폭이 95px 인데 "DD / MM / YYYY" 가 99px = **4px 모자라 마지막 Y 가 잘렸다**(실측).
    //   입력칸은 글자가 스스로 작아지는 기능(adjustsFontSizeToFit)이 안 먹으므로 이렇게 맞춘다.
    //   ⚠️ **칸 자체의 폭·높이·둥근 정도는 그대로**(아미봉 그릇은 안 건드림).
    paddingHorizontal: 10,
    textAlign: "center",
    fontSize: 12,
    color: "#FFFFFF",
    fontFamily: "Pretendard-Bold",
  },

  // ⚠️ 수정금지(승인필요) — 손잡이
  handleWrap: {
    width: HANDLE_W,
    height: HANDLE_H,
    alignItems: "center",
    marginTop: -16,
    zIndex: -1,
  },
  handleGrad: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  btnArea: {
    position: "absolute",
    top: 20,
    width: BTN_AREA_W,
    alignSelf: "center",
    gap: 10,
  },
  btn: {
    height: 44,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  googleBtn: { backgroundColor: PRIMARY },
  googleTxt: {
    fontSize: 11,
    fontFamily: "Pretendard-Bold",
    color: "#050930",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  kakaoBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  kakaoTxt: {
    fontSize: 11,
    fontFamily: "Pretendard-Bold",
    color: "#FFFFFF",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  appleLink: { height: 32, justifyContent: "center", alignItems: "center" },
  appleTxt: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    color: PRIMARY,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  off: { opacity: 0.35 },
});
