// ⚠️ 수정금지(승인필요) — 아미봉 형태 인증카드 + 3단 점등 인터랙션
// 원형 머리(생년월일) + 손잡이(OAuth) = 아미봉 실루엣
// 터치마다 점등: 등장 50% → 생년월일 터치 70% → OAuth 터치 100%+화이트아웃
// BlurView+borderRadius 버그 회피: 부모 View overflow:'hidden' 클리핑
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  interpolateColor,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";

// ⚠️ 수정금지(승인필요) — 웹/네이티브 Haptics 분기
const triggerHaptic = (type: "light" | "medium" | "success") => {
  try {
    if (type === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (type === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const AnimatedView = Animated.createAnimatedComponent(View);

// ⚠️ 수정금지(승인필요) — 아미봉 비율 (최대 확대 — 화면 거의 꽉)
const HEAD_SIZE = SCREEN_W * 0.82; // 원형 머리 지름 (최대 확대)
const HANDLE_WIDTH = HEAD_SIZE * 0.88; // 손잡이 너비 (버튼 공간 충분)
const HANDLE_HEIGHT = HEAD_SIZE * 1.1; // ⚠️ 수정금지(승인필요) — Stitch Scene 2: 인증폼+버튼+OAuth 전부 수용
const OVERLAP = 25; // 머리-손잡이 겹침

// ⚠️ 수정금지(승인필요) — DESIGN.md "The Ethereal Stage" 디자인 시스템 색상 토큰
const SURFACE = "#050930";        // 배경 (midnight navy)
const PRIMARY = "#8bacff";        // 라이트스틱 글로우
const PRIMARY_CONTAINER = "#759eff"; // 고에너지 핫스팟
const SECONDARY = "#b486ff";      // 네온 보라
const KAKAO_YELLOW = "#FEE500";
// Ghost Border: outline_variant 15% opacity → 포커스 시 primary 100%
const GHOST_BORDER = "rgba(139,172,255,0.15)";
const GHOST_BORDER_FOCUS = PRIMARY;

// ⚠️ 수정금지(승인필요) — D-Day 자동 계산 (고양 2026-04-09 기준)
function getDDay(): number {
  const concert = new Date("2026-04-09");
  const today = new Date();
  return Math.ceil((concert.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface ArmyBombAuthProps {
  onAuthComplete: (provider: string, birthDate: string) => void;
  glowLevel: SharedValue<number>;
  entranceProgress: SharedValue<number>;
  onGlowChange?: (level: number) => void; // 배경 연동 콜백
}

export function ArmyBombAuth({ onAuthComplete, glowLevel, entranceProgress, onGlowChange }: ArmyBombAuthProps) {
  const [birthDate, setBirthDate] = useState("");
  const [birthComplete, setBirthComplete] = useState(false);

  // ⚠️ 수정금지(승인필요) — 생년월일 존 터치 시 70% 점등
  const handleBirthFocus = useCallback(() => {
    glowLevel.value = withSpring(0.5, { damping: 18, stiffness: 90 });
    onGlowChange?.(0.5);
    triggerHaptic("light");
  }, [onGlowChange]);

  // ⚠️ 수정금지(승인필요) — 생년월일 자동 포맷 (DD/MM/YYYY)
  const handleBirthInput = useCallback((text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + " / " + digits.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + " / " + digits.slice(2, 4) + " / " + digits.slice(4);
    setBirthDate(formatted);

    if (digits.length === 8) {
      setBirthComplete(true);
      // 생년월일 완료 → 70% 점등 + 배경 연동
      glowLevel.value = withSpring(0.7, { damping: 18, stiffness: 90 });
      onGlowChange?.(0.7);
      triggerHaptic("medium");
    } else {
      setBirthComplete(false);
    }
  }, [onGlowChange]);

  // ⚠️ 수정금지(승인필요) — OAuth 터치 = 100% 풀 점등 + 화이트아웃
  const handleOAuth = useCallback((provider: string) => {
    glowLevel.value = withSequence(
      withSpring(1, { damping: 8, stiffness: 200 }),
      withDelay(500, withTiming(1.2, { duration: 300 }))
    );
    onGlowChange?.(1);
    triggerHaptic("success");

    setTimeout(() => {
      onAuthComplete(provider, birthDate);
    }, 2000);
  }, [birthDate, onGlowChange]);

  // ⚠️ 수정금지(승인필요) — 등장: Apple Maps 바텀시트처럼 스윽 올라옴
  const entranceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(entranceProgress.value, [0, 1], [SCREEN_H * 0.6, 0], Extrapolation.CLAMP) },
      { scale: interpolate(entranceProgress.value, [0, 0.5, 1], [0.85, 0.95, 1], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(entranceProgress.value, [0, 0.2, 0.6, 1], [0, 0.3, 0.8, 1], Extrapolation.CLAMP),
  }));

  // ⚠️ 수정금지(승인필요) — 외부 글로우 (보라색 전등 — Android/iOS 공통 시각 효과)
  // Android: shadow 안 먹음 → 뒤에 큰 보라색 원으로 글로우 표현
  const outerGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowLevel.value, [0, 0.5, 0.7, 1, 1.2], [0, 0.3, 0.5, 0.8, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(glowLevel.value, [0, 0.5, 1, 1.2], [0.8, 1, 1.15, 1.25], Extrapolation.CLAMP) },
    ],
  }));

  // iOS 전용 shadow (있으면 더 좋고 없어도 outerGlow가 커버)
  const shadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(glowLevel.value, [0, 0.5, 0.7, 1, 1.2], [0, 0.4, 0.7, 1, 1], Extrapolation.CLAMP),
    shadowRadius: interpolate(glowLevel.value, [0, 0.5, 0.7, 1, 1.2], [0, 20, 40, 70, 90], Extrapolation.CLAMP),
  }));

  // ⚠️ 수정금지(승인필요) — 머리 전등 효과: 색상이 변하면서 밝아짐
  const headGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowLevel.value, [0, 0.3, 0.5, 0.7, 1, 1.2], [0, 0.1, 0.2, 0.4, 0.65, 0.85], Extrapolation.CLAMP),
    backgroundColor: interpolateColor(
      glowLevel.value,
      [0, 0.5, 0.7, 1, 1.2],
      ["rgba(180,134,255,0.0)", "rgba(180,134,255,0.3)", "rgba(139,172,255,0.5)", "rgba(180,134,255,0.7)", "rgba(255,255,255,0.9)"]
    ),
  }));

  // ⚠️ 수정금지(승인필요) — 머리 뒤 글로우 링 (전등 빛 확산 — 2겹)
  const glowRing1Style = useAnimatedStyle(() => ({
    opacity: interpolate(glowLevel.value, [0, 0.5, 0.7, 1], [0, 0.15, 0.3, 0.5], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(glowLevel.value, [0, 0.5, 1], [0.9, 1.05, 1.15], Extrapolation.CLAMP) },
    ],
  }));
  const glowRing2Style = useAnimatedStyle(() => ({
    opacity: interpolate(glowLevel.value, [0, 0.5, 0.7, 1], [0, 0.08, 0.15, 0.3], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(glowLevel.value, [0, 0.5, 1], [0.85, 1.1, 1.3], Extrapolation.CLAMP) },
    ],
  }));

  // ⚠️ 수정금지(승인필요) — 손잡이 내부 보라빛 오버레이
  const handleGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowLevel.value, [0, 0.5, 0.7, 1, 1.2], [0, 0.08, 0.2, 0.4, 0.6], Extrapolation.CLAMP),
  }));

  const isDisabled = !birthComplete;

  // ⚠️ 수정금지(승인필요) — Android BlurView fallback
  const blurBg = Platform.select({
    android: { backgroundColor: "rgba(5,9,48,0.75)" }, // ⚠️ 수정금지(승인필요) — DESIGN.md surface #050930 기반
    default: {},
  });

  return (
    <AnimatedView
      style={[
        styles.container,
        entranceStyle,
        shadowStyle,
        { shadowColor: SECONDARY },
      ]}
    >
      {/* ⚠️ 수정금지(승인필요) — 전등 빛 확산 글로우 링 (머리 뒤, 3겹) */}
      <AnimatedView style={[styles.outerGlow, outerGlowStyle]} />
      <AnimatedView style={[styles.glowRing1, glowRing1Style]} />
      <AnimatedView style={[styles.glowRing2, glowRing2Style]} />

      {/* ⚠️ 수정금지(승인필요) — Stitch Scene 2: 구체 헤드 (GOYANG + D-Day) */}
      <View style={[styles.headClip, blurBg]}>
        <BlurView intensity={80} tint="dark" style={styles.headBlur}>
          {/* ⚠️ 수정금지(승인필요) — 머리 내부 글로우 오버레이 (pointerEvents:"none" = iPhone 키보드 입력 버그 수정) */}
          <AnimatedView style={[styles.headInnerGlow, headGlowStyle]} pointerEvents="none" />
          {/* ⚠️ 수정금지(승인필요) — Stitch: 내부 그래디언트 오버레이 (primary/10 → transparent) */}
          <View style={styles.headGradientOverlay} pointerEvents="none" />

          {/* ⚠️ 수정금지(승인필요) — Stitch Scene 2: Seoul Station + GOYANG + D-Day 배지 */}
          <Text style={styles.stationLabel}>Seoul Station</Text>
          <Text style={styles.cityTitle}>GOYANG</Text>
          <View style={styles.ddayBadge}>
            <Text style={styles.ddayText}>D-{getDDay()}</Text>
          </View>
        </BlurView>
      </View>

      {/* ⚠️ 수정금지(승인필요) — Stitch Scene 2: 핸들 (인증폼 + OAuth) */}
      <View style={[styles.handleClip, blurBg]}>
        <BlurView intensity={60} tint="dark" style={styles.handleBlur}>
          {/* ⚠️ 수정금지(승인필요) — 손잡이 내부 글로우 오버레이 (pointerEvents:"none" = 터치 이벤트 차단 방지) */}
          <AnimatedView style={[styles.handleInnerGlow, handleGlowStyle]} pointerEvents="none" />
          {/* ⚠️ 수정금지(승인필요) — Stitch: 내부 라이트빔 (primary → transparent, 상단 중앙) */}
          <View style={styles.innerLightBeam} pointerEvents="none" />

          {/* ⚠️ 수정금지(승인필요) — Stitch Scene 2: 인증 섹션 */}
          <View style={styles.authContent}>
            <Text style={styles.authTitle}>Unlock Your Journey</Text>
            <Text style={styles.authSub}>Verification required for ARMY membership access.</Text>

            {/* 생년월일 */}
            <Text style={styles.birthLabel}>DATE OF BIRTH</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="YYYY / MM / DD"
                placeholderTextColor="rgba(163,168,213,0.4)"
                value={birthDate}
                onChangeText={handleBirthInput}
                onFocus={handleBirthFocus}
                keyboardType="number-pad"
                maxLength={14}
              />
            </View>

            {/* ⚠️ 수정금지(승인필요) — Stitch: 그래디언트 버튼 (primary → primary_container) */}
            <TouchableOpacity
              style={[styles.continueBtn, isDisabled && styles.disabledBtn]}
              onPress={() => handleOAuth("continue")}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.continueBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>

          {/* ⚠️ 수정금지(승인필요) — Stitch Scene 2: "Connect via" 구분선 + OAuth 3개 */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Connect via</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.oauthRow}>
            {/* Google */}
            <TouchableOpacity
              style={[styles.oauthSquare, styles.googleSquare, isDisabled && styles.disabledBtn]}
              onPress={() => handleOAuth("google")}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.oauthIcon}>G</Text>
            </TouchableOpacity>

            {/* Kakao */}
            <TouchableOpacity
              style={[styles.oauthSquare, styles.kakaoSquare, isDisabled && styles.disabledBtn]}
              onPress={() => handleOAuth("kakao")}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.kakaoIcon}>💬</Text>
            </TouchableOpacity>

            {/* Apple */}
            <TouchableOpacity
              style={[styles.oauthSquare, styles.appleSquare, isDisabled && styles.disabledBtn]}
              onPress={() => handleOAuth("apple")}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.appleIcon}></Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  // ⚠️ 수정금지(승인필요) — 아미봉 전체 컨테이너
  container: {
    alignItems: "center",
    alignSelf: "center",
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  // ⚠️ 수정금지(승인필요) — 전등 빛 확산 (3겹 글로우 링)
  outerGlow: {
    position: "absolute",
    width: HEAD_SIZE * 1.5,
    height: HEAD_SIZE * 1.5,
    borderRadius: HEAD_SIZE * 0.75,
    backgroundColor: SECONDARY,
    top: -(HEAD_SIZE * 0.25),
    opacity: 0,
    zIndex: 0,
  },
  glowRing1: {
    position: "absolute",
    width: HEAD_SIZE * 1.25,
    height: HEAD_SIZE * 1.25,
    borderRadius: HEAD_SIZE * 0.625,
    backgroundColor: "rgba(180,134,255,0.4)", // ⚠️ 수정금지(승인필요) — DESIGN.md secondary 기반
    top: -(HEAD_SIZE * 0.125),
    opacity: 0,
    zIndex: 0,
  },
  glowRing2: {
    position: "absolute",
    width: HEAD_SIZE * 1.8,
    height: HEAD_SIZE * 1.8,
    borderRadius: HEAD_SIZE * 0.9,
    backgroundColor: "rgba(139,172,255,0.2)", // ⚠️ 수정금지(승인필요) — DESIGN.md primary 기반
    top: -(HEAD_SIZE * 0.4),
    opacity: 0,
    zIndex: 0,
  },

  // ⚠️ 수정금지(승인필요) — 원형 머리 (BlurView 클리핑 — expo-blur 버그 회피)
  headClip: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    borderRadius: HEAD_SIZE / 2,
    overflow: "hidden",
    zIndex: 2,
    borderWidth: 1,
    borderColor: GHOST_BORDER, // ⚠️ 수정금지(승인필요) — DESIGN.md Ghost Border (outline_variant 15%)
  },
  headBlur: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  headInnerGlow: {
    ...StyleSheet.absoluteFillObject,
  },

  // ⚠️ 수정금지(승인필요) — 손잡이 (BlurView 클리핑)
  handleClip: {
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
    marginTop: -OVERLAP,
    zIndex: 1,
    borderWidth: 1,
    borderColor: GHOST_BORDER, // ⚠️ 수정금지(승인필요) — DESIGN.md Ghost Border
  },
  handleBlur: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: OVERLAP + 8,
    paddingBottom: 16,
  },
  handleInnerGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SECONDARY,
    borderRadius: 20,
  },

  // ⚠️ 수정금지(승인필요) — Stitch Scene 2: 구체 내부 그래디언트 오버레이
  headGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(139,172,255,0.06)",
    borderRadius: HEAD_SIZE / 2,
  },
  // ⚠️ 수정금지(승인필요) — Stitch Scene 2: 구체 내부 텍스트
  stationLabel: {
    fontFamily: "Pretendard-Medium",
    fontSize: 12,
    color: "rgba(139,172,255,0.7)",
    letterSpacing: 4,
    textTransform: "uppercase" as const,
    textAlign: "center",
    marginBottom: 4,
  },
  cityTitle: {
    fontFamily: "Pretendard-Bold",
    fontSize: 32,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -1,
  },
  ddayBadge: {
    marginTop: 10,
    backgroundColor: "rgba(139,172,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(139,172,255,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
  },
  ddayText: {
    fontFamily: "Pretendard-Bold",
    fontSize: 11,
    color: PRIMARY,
    letterSpacing: 3,
    textTransform: "uppercase" as const,
  },

  // ⚠️ 수정금지(승인필요) — Stitch Scene 2: 핸들 내부 라이트빔
  innerLightBeam: {
    position: "absolute" as const,
    top: 0,
    left: "50%",
    marginLeft: -0.5,
    width: 1,
    height: 80,
    backgroundColor: "rgba(139,172,255,0.2)",
  },

  // ⚠️ 수정금지(승인필요) — Stitch Scene 2: 인증 콘텐츠
  authContent: {
    gap: Platform.select({ android: 8, default: 12 }),
    alignItems: "center" as const,
  },
  authTitle: {
    fontFamily: "Pretendard-SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
    textAlign: "center",
  },
  authSub: {
    fontFamily: "Pretendard-Regular",
    fontSize: 12,
    color: "rgba(163,168,213,0.8)",
    textAlign: "center",
    marginBottom: 4,
  },
  birthLabel: {
    fontFamily: "Pretendard-Bold",
    fontSize: 10,
    color: "rgba(99,144,247,0.8)",
    letterSpacing: 3,
    textTransform: "uppercase" as const,
    alignSelf: "flex-start" as const,
    marginLeft: 4,
  },
  inputWrap: {
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(64,69,108,0.3)",
    borderRadius: 12,
    backgroundColor: "rgba(24,32,86,0.4)",
  },
  input: {
    fontFamily: "Pretendard-Regular",
    fontSize: 15,
    color: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: "left",
    letterSpacing: 1,
  },

  // ⚠️ 수정금지(승인필요) — Stitch Scene 2: Continue 그래디언트 버튼
  continueBtn: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    shadowColor: "rgba(139,172,255,0.5)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 8,
  },
  continueBtnText: {
    fontFamily: "Pretendard-Bold",
    fontSize: 13,
    color: "#000000",
    letterSpacing: 3,
    textTransform: "uppercase" as const,
  },

  // ⚠️ 수정금지(승인필요) — Stitch Scene 2: "Connect via" 구분선
  dividerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginTop: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(64,69,108,0.2)",
  },
  dividerText: {
    fontFamily: "Pretendard-Bold",
    fontSize: 9,
    color: "rgba(109,115,157,0.8)",
    letterSpacing: 3,
    textTransform: "uppercase" as const,
  },

  // ⚠️ 수정금지(승인필요) — Stitch Scene 2: OAuth 3열 그리드
  oauthRow: {
    flexDirection: "row" as const,
    gap: Platform.select({ android: 8, default: 12 }),
    marginTop: 8,
  },
  oauthSquare: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  googleSquare: {
    backgroundColor: "rgba(19,26,76,0.6)",
    borderWidth: 1,
    borderColor: "rgba(64,69,108,0.1)",
  },
  kakaoSquare: {
    backgroundColor: KAKAO_YELLOW,
  },
  appleSquare: {
    backgroundColor: "#FFFFFF",
  },
  oauthIcon: {
    fontFamily: "Pretendard-Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  kakaoIcon: {
    fontSize: 18,
  },
  appleIcon: {
    fontFamily: "Pretendard-Bold",
    fontSize: 18,
    color: "#000000",
  },
  disabledBtn: {
    opacity: 0.35,
  },
});
