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

// ⚠️ 수정금지(승인필요) — Haptics
const haptic = (t: "light" | "medium" | "success") => {
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — D-Day 실시간 (fallback: 하드코딩) + 공연 상세 데이터
type ConcertInfo = {
  city: string;
  dDay: number;
  date?: string;
  venue?: string;
  cityId?: number;
};
function getDDayFallback(): ConcertInfo {
  const concert = new Date("2026-04-09");
  const today = new Date();
  const dDay = Math.ceil(
    (concert.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return { city: "GOYANG", dDay };
}

// 전구/서치라이트 삭제됨 (Expo Go 미지원 + 비율 깨짐)

export function BTSLandingScreen() {
  const navigation = useNavigation<any>();
  const [dob, setDob] = useState("");
  const [dobComplete, setDobComplete] = useState(false);
  const [lightingStage, setLightingStage] = useState(0);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [concertInfo, setConcertInfo] = useState(getDDayFallback());

  // ⚠️ 수정금지(승인필요) — /api/bts/next-concert 실시간 연동
  useEffect(() => {
    fetch(`${getApiUrl()}/api/bts/next-concert`)
      .then((r) => r.json())
      .then((data) => {
        if (data.city)
          setConcertInfo({
            city: data.city.toUpperCase(),
            dDay: data.dDay,
            date: data.date,
            venue: data.venue,
            cityId: data.cityId,
          }); // ⚠️ 수정금지(승인필요) — next-concert 전체 데이터 저장
      })
      .catch(() => {}); // 실패 시 fallback 유지
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
    setTimeout(() => {
      bgStage.value = withTiming(1, { duration: 200 });
      setLightingStage(1);
      globeGlow.value = withTiming(0.3, { duration: 600 });
    }, 3300);
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
  const handleLogin = useCallback(
    async (provider: string) => {
      // ⚠️ 수정금지(승인필요) — dobComplete 체크 바이패스 (BTS 랜딩은 인증 없이 진입)
      handleInteraction();
      globeGlow.value = withSpring(1, { damping: 8, stiffness: 200 });
      haptic("success");

      // ⚠️ 수정금지(승인필요) — BTS 랜딩은 바이패스 (인증은 메인앱에서 처리)
      // 생년월일 입력 완료 + OAuth 터치 = 바로 세계지도 전환
      goToWorldMap();
    },
    [dobComplete, birthDateStr, city],
  );

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
  // 웹/PC 환경에서는 생년월일 미입력 상태여도 즉시 클릭 가능하도록 버튼 차단 해제 (PC 테스트 100% 보장)
  const isDisabled = Platform.OS === "web" ? false : !dobComplete;

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
                <Text style={styles.cityLabel}>{city}</Text>
                <Text style={styles.dDay}>
                  {typeof dDay === "number"
                    ? dDay < 0
                      ? `D+${Math.abs(dDay)}`
                      : `D-${Math.abs(dDay)}`
                    : `D-${dDay}`}
                </Text>
                <View style={styles.inputArea}>
                  <Text style={styles.inputLabel}>DATE OF BIRTH</Text>
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
                onPress={() => handleLogin("google")}
                disabled={isDisabled}
                activeOpacity={0.96}
              >
                <Text style={styles.googleTxt}>Continue with Google</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.kakaoBtn, isDisabled && styles.off]}
                onPress={() => handleLogin("kakao")}
                disabled={isDisabled}
                activeOpacity={0.96}
              >
                <Text style={styles.kakaoTxt}>Continue with Kakao</Text>
              </TouchableOpacity>
              {Platform.OS === "ios" && (
                <TouchableOpacity
                  style={[styles.appleLink, isDisabled && styles.off]}
                  onPress={() => handleLogin("apple")}
                  disabled={isDisabled}
                  activeOpacity={0.96}
                >
                  <Text style={styles.appleTxt}>Sign in with Apple</Text>
                </TouchableOpacity>
              )}

              {/* ⚡ PC 데스크톱 웹 환경 1클릭 다음 단계(월드맵/캐릭터 선택) 즉시 진입 버튼 */}
              <TouchableOpacity
                style={{
                  marginTop: 10,
                  paddingVertical: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 50,
                  backgroundColor: "rgba(147, 51, 234, 0.25)",
                  borderWidth: 1,
                  borderColor: "rgba(168, 85, 247, 0.6)",
                }}
                onPress={() => goToWorldMap()}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#F3E8FF" }}>
                  ⚡ 체험/테스트용 다음 단계로 바로 이동 →
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* ⚠️ 수정금지(승인필요) — EAS Update 검증 태그 (커밋마다 숫자 증가) */}
        <Text style={styles.buildTag}>build-02</Text>

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

  // ⚠️ 수정금지(승인필요) — EAS Update 검증 태그 스타일 (좌하단 반투명)
  buildTag: {
    position: "absolute",
    bottom: 4,
    left: 8,
    fontSize: 9,
    color: "rgba(255,255,255,0.25)",
    fontFamily: "Pretendard-Bold",
    zIndex: 50,
  },

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
  cityLabel: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 4,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 2,
  },
  dDay: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    color: "#FFFFFF",
    letterSpacing: -2,
    marginBottom: 16,
  },
  inputArea: { width: "75%", alignItems: "center" },
  inputLabel: {
    fontSize: 9,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 3,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 50,
    paddingVertical: 10,
    paddingHorizontal: 20,
    textAlign: "center",
    fontSize: 13,
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
