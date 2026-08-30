// ⚠️ 수정금지(승인필요) — BTS 랜딩 (VROIS/vrois 변환 + 무대 구도)
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
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { socialLoginWithGoogle, calculateAge } from "@/lib/auth";
import { getIdTokenFromGoogleResponse } from "@/lib/auth-oauth";
import { useGoogleAuthRequest } from "@/lib/auth-google";
import { isAppleAuthAvailable } from "@/lib/auth-apple";
import {
  runNativeSocial,
  isSocialConfigured,
  type SocialProvider,
} from "@/lib/auth-social";
import { getApiUrl } from "@/lib/query-client";
import { useMapToggle } from "@/contexts/MapToggleContext";
import {
  styles,
  STAGE_COLORS,
  PRIMARY,
  SECONDARY,
  GLOBE_SIZE,
} from "./bts/bts-landing-styles";

// ⚠️ 수정금지(승인필요) 2026-07-30 = 아미봉 구체 안 글자에 **똑같이** 적용하는 값 1벌(§0).
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
const EMPTY_CONCERT: ConcertInfo = { city: "", dDay: 0 };

export function BTSLandingScreen() {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation(); // 저장할 언어 = 메인 인증창과 같은 값(§16)
  const [dob, setDob] = useState("");
  const [dobComplete, setDobComplete] = useState(false);
  const [lightingStage, setLightingStage] = useState(0);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [concertInfo, setConcertInfo] = useState(EMPTY_CONCERT);

  // ⚠️ 수정금지(승인필요) — /api/bts/next-concert 실시간 연동
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

  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **이미 로그인했으면 이 창을 건너뛴다.**
  const { isAuthed } = useMapToggle();

  // ⚠️ 수정금지(승인필요) — Google OAuth hook (기존 LoginScreen 패턴 그대로)
  const [googleRequest, googleResponse, googlePromptAsync] =
    useGoogleAuthRequest();
  const processedGoogleRef = useRef<typeof googleResponse>(null);

  const entrance = useSharedValue(0);
  const flare = useSharedValue(0);
  const globeGlow = useSharedValue(0);
  const bgStage = useSharedValue(0);
  const whiteout = useSharedValue(0);
  // ⚠️ 수정금지(승인필요) 2026-07-31 = 생년월일 → 저장할 문자열 + **성인 여부**.
  const { birthDateStr, isAdult } = (() => {
    const digits = dob.replace(/\D/g, "");
    if (digits.length !== 8) return { birthDateStr: "", isAdult: false };
    const d = Number(digits.slice(0, 2));
    const m = Number(digits.slice(2, 4));
    const y = Number(digits.slice(4));
    const date = new Date(y, m - 1, d);
    const real =
      date.getDate() === d &&
      date.getMonth() === m - 1 &&
      date.getFullYear() === y;
    if (!real) return { birthDateStr: "", isAdult: false };
    const str = `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
    return { birthDateStr: str, isAdult: calculateAge(date) >= 18 };
  })();

  // ⚠️ 수정금지(승인필요) — Google OAuth 응답 처리 (기존 LoginScreen 패턴)
  useEffect(() => {
    if (!googleResponse || googleResponse.type !== "success") return;
    if (!birthDateStr || !isAdult) return;
    if (processedGoogleRef.current === googleResponse) return;
    processedGoogleRef.current = googleResponse;
    const idToken = getIdTokenFromGoogleResponse(googleResponse);
    if (!idToken) return;
    setOauthLoading(true);
    socialLoginWithGoogle({
      idToken,
      birthDate: birthDateStr,
      language: i18n.language, // 옛 "ko" 고정 삭제 §19
      deviceType: Platform.OS === "web" ? "web" : "mobile",
    })
      .then((result) => {
        if (result.success) {
          goToWorldMap();
        } else {
          Alert.alert(
            t("login.loginFailed"),
            result.error || t("login.loginFailed"),
          );
        }
      })
      .catch(() =>
        Alert.alert(t("login.loginFailed"), t("login.serverConnectFailed")),
      )
      .finally(() => setOauthLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse, birthDateStr, isAdult, i18n.language]);

  // ⚠️ 수정금지(승인필요) — 등장 시퀀스
  useEffect(() => {
    entrance.value = withDelay(
      800,
      withTiming(1, {
        duration: 2500,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      }),
    );
    // ⚠️ 수정금지(승인필요) 2026-07-30 = 화면을 벗어나면 이 시계를 반드시 끈다.
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

  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **이미 로그인했으면 인증창을 건너뛰고 지구본으로.**
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (!isAuthed || jumpedRef.current || !city) return;
    jumpedRef.current = true;
    goToWorldMap();
  }, [isAuthed, city, goToWorldMap]);

  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **아미봉 인증창도 진짜 로그인을 한다.**
  const handleSocialLogin = useCallback(
    async (provider: SocialProvider) => {
      if (!birthDateStr || !isAdult) {
        Alert.alert(t("login.adultOnly"));
        return;
      }
      if (!isSocialConfigured(provider)) {
        console.error(`[Auth] ${provider} 열쇠 미주입 = 로그인 불가`);
        Alert.alert(t("login.loginFailed"));
        return;
      }
      handleInteraction();
      globeGlow.value = withSpring(1, { damping: 8, stiffness: 200 });
      haptic("success");

      if (provider === "google" && Platform.OS === "web") {
        await googlePromptAsync();
        return;
      }

      setOauthLoading(true);
      try {
        const result = await runNativeSocial(provider, {
          birthDate: birthDateStr,
          language: i18n.language, // 옛 "ko" 고정 삭제 §19 = 메인 인증창과 같은 값
        });
        if (!result) return; // 사용자가 로그인 창을 닫음 = 취소 = 조용히 끝
        if (result.success) goToWorldMap();
        else Alert.alert(result.error || t("login.loginFailed"));
      } catch (err) {
        console.error("[Auth] BTS 소셜 로그인 실패:", err);
        const code = (err as { code?: string | number } | null)?.code;
        Alert.alert(
          code ? `${t("login.loginFailed")} (${code})` : t("login.loginFailed"),
        );
      } finally {
        setOauthLoading(false);
      }
    },
    [
      birthDateStr,
      isAdult,
      i18n.language,
      handleInteraction,
      goToWorldMap,
      googlePromptAsync,
      t,
    ],
  );

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
  // ⚠️ 수정금지(승인필요) 2026-07-31 = **로그인이 도는 중에는 버튼을 잠근다.**
  const isDisabled = !dobComplete || oauthLoading;

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
            {/* ⚠️ 수정금지(승인필요) 2026-07-31 사장님 SSOT = **아미봉 순서 = 생년월일 → 구글 → 애플 → 카톡.**
                (생년월일은 위 구체 안. 메일칸은 자리가 없어 없음 = 사장님 확정)
                ⚠️ 메인 인증창은 **카톡 → 애플** 순이다. **두 창의 순서가 다른 것이 사장님 SSOT 다.**
                  옛것(두 창을 같은 순서로 맞춤) 삭제 §19 = AI 가 "통일"을 명분으로 사장님 지시를 임의로 바꾼 것.
                ⚠️ **버튼의 모양·크기·자리는 3일 연구로 맞춘 것 = 한 픽셀도 안 바꾼다**(사장님 지시).
                  자리는 그대로 두고 **안의 글자와 연결만** 바꿨다. */}
            <View style={styles.btnArea}>
              <TouchableOpacity
                style={[styles.btn, styles.googleBtn, isDisabled && styles.off]}
                onPress={() => handleSocialLogin("google")}
                disabled={isDisabled}
                activeOpacity={0.96}
              >
                <Text style={styles.googleTxt}>Continue with Google</Text>
              </TouchableOpacity>
              {/* 2번째 자리 = 애플(아이폰만). 아이폰이 아니면 이 자리는 비고 카톡이 위로 올라온다. */}
              {isAppleAuthAvailable() && (
                <TouchableOpacity
                  style={[
                    styles.btn,
                    styles.slot2Btn,
                    isDisabled && styles.off,
                  ]}
                  onPress={() => handleSocialLogin("apple")}
                  disabled={isDisabled}
                  activeOpacity={0.96}
                >
                  <Text style={styles.slot2Txt}>Sign in with Apple</Text>
                </TouchableOpacity>
              )}
              {/* 3번째 자리 = 카톡 */}
              <TouchableOpacity
                style={[styles.slot3Link, isDisabled && styles.off]}
                onPress={() => handleSocialLogin("kakao")}
                disabled={isDisabled}
                activeOpacity={0.96}
              >
                <Text style={styles.slot3Txt}>Continue with Kakao</Text>
              </TouchableOpacity>
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
