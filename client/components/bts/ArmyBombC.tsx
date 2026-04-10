// ⚠️ 수정금지(승인필요) — C안: 아미봄 인증 컴포넌트
// 실제 아미봄 비율: 머리(구) 1 : 손잡이 1.8, 전체 높이 23.5cm
// 머리에 도시명+D-Day, 목에 생년월일, 손잡이에 OAuth 로고
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle, Ellipse, Defs, RadialGradient, Stop, Rect } from "react-native-svg";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 디자인 토큰 (A안과 동일)
const COBALT_DEEP = "#0B1026";
const BORAHAE = "#6C2DC7";
const BORAHAE_DARK = "#4C1D95";
const BORAHAE_LIGHT = "#8B5CF6";
const ARIRANG_RED = "#C73E2D";
const KAKAO_YELLOW = "#FEE500";

// ⚠️ 수정금지(승인필요) — 아미봄 실제 비율 기반 사이즈
const BOMB_WIDTH = SCREEN_W * 0.55;
const HEAD_SIZE = BOMB_WIDTH;                // 머리 = 너비와 동일 (원형)
const NECK_WIDTH = BOMB_WIDTH * 0.38;        // 목 = 머리의 38%
const NECK_HEIGHT = HEAD_SIZE * 0.25;        // 목 높이
const HANDLE_WIDTH = BOMB_WIDTH * 0.35;      // 손잡이 = 머리의 35%
const HANDLE_HEIGHT = HEAD_SIZE * 1.8;       // 손잡이 = 머리의 1.8배 (실제 비율)

// 햅틱 피드백
const triggerHaptic = (type: "light" | "medium" | "heavy" | "success") => {
  try {
    if (type === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (type === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (type === "heavy") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

interface ArmyBombCProps {
  entranceProgress: SharedValue<number>;
  glowLevel: SharedValue<number>;
  onStageChange: (stage: number) => void;
}

// D-Day 자동 계산
function getDDay(): number {
  const concert = new Date("2026-04-09");
  const today = new Date();
  return Math.ceil((concert.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ⚠️ 수정금지(승인필요) — 아미봄 SVG 실루엣 (배경용)
function ArmyBombSilhouette({ width, height, glowOpacity }: { width: number; height: number; glowOpacity: number }) {
  const headR = width / 2;
  const headCY = headR;
  const neckTop = headR * 2 - headR * 0.15;
  const neckW = width * 0.32;
  const handleW = width * 0.3;
  const handleTop = neckTop + headR * 0.35;
  const handleBottom = height - 10;
  const handleR = 15;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={StyleSheet.absoluteFill}>
      <Defs>
        {/* 머리 그라디언트 (발광 효과) */}
        <RadialGradient id="headGlow" cx="50%" cy="45%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.15 + glowOpacity * 0.3} />
          <Stop offset="40%" stopColor={BORAHAE_LIGHT} stopOpacity={0.1 + glowOpacity * 0.2} />
          <Stop offset="100%" stopColor={BORAHAE_DARK} stopOpacity={0.05} />
        </RadialGradient>
      </Defs>

      {/* 머리 (구형) */}
      <Circle cx={width / 2} cy={headCY} r={headR - 2} fill="url(#headGlow)" stroke="rgba(108,45,199,0.3)" strokeWidth={1.5} />

      {/* 목 (테이퍼) */}
      <Path
        d={`M ${width / 2 - neckW / 2} ${neckTop}
            Q ${width / 2 - neckW / 2} ${handleTop} ${width / 2 - handleW / 2} ${handleTop}
            L ${width / 2 + handleW / 2} ${handleTop}
            Q ${width / 2 + neckW / 2} ${handleTop} ${width / 2 + neckW / 2} ${neckTop}
            Z`}
        fill="rgba(108,45,199,0.15)"
        stroke="rgba(108,45,199,0.2)"
        strokeWidth={1}
      />

      {/* 손잡이 */}
      <Rect
        x={width / 2 - handleW / 2}
        y={handleTop}
        width={handleW}
        height={handleBottom - handleTop}
        rx={handleR}
        ry={handleR}
        fill="rgba(0,0,0,0.35)"
        stroke="rgba(108,45,199,0.2)"
        strokeWidth={1}
      />

      {/* 하단 마감선 */}
      <Ellipse
        cx={width / 2}
        cy={handleBottom - 5}
        rx={handleW / 2 - 2}
        ry={4}
        fill="rgba(108,45,199,0.1)"
      />
    </Svg>
  );
}

// ⚠️ 수정금지(승인필요) — 구글 로고 SVG
function GoogleLogo() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  );
}

// ⚠️ 수정금지(승인필요) — 카카오 로고 SVG
function KakaoLogo() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.547 1.8 4.795 4.525 6.096l-.825 3.003c-.08.29.215.527.48.387l3.67-1.945c.37.045.755.069 1.15.069 5.523 0 10-3.477 10-7.61S17.523 3 12 3z" fill="#000000" />
    </Svg>
  );
}

// ⚠️ 수정금지(승인필요) — 애플 로고 SVG
function AppleLogo() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.42-1.09-.48-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.42C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.79 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="#FFFFFF" />
    </Svg>
  );
}

export function ArmyBombC({ entranceProgress, glowLevel, onStageChange }: ArmyBombCProps) {
  const [birthDate, setBirthDate] = useState("");
  const [birthComplete, setBirthComplete] = useState(false);
  const dDay = getDDay();

  const bombScale = useSharedValue(1);
  const bombRotation = useSharedValue(0);
  const headGlow = useSharedValue(0);

  // ⚠️ 수정금지(승인필요) — 생년월일 포맷팅
  const handleBirthInput = useCallback((text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 8);
    let formatted = "";
    if (digits.length > 0) formatted = digits.slice(0, 2);
    if (digits.length > 2) formatted += " / " + digits.slice(2, 4);
    if (digits.length > 4) formatted += " / " + digits.slice(4, 8);
    setBirthDate(formatted);

    if (digits.length === 8) {
      setBirthComplete(true);
      triggerHaptic("medium");
      headGlow.value = withSpring(0.5, { damping: 15 });
      onStageChange(1);
    } else {
      setBirthComplete(false);
      headGlow.value = withTiming(0, { duration: 300 });
    }
  }, [onStageChange]);

  // ⚠️ 수정금지(승인필요) — OAuth 처리
  const handleOAuth = useCallback((provider: string) => {
    if (!birthComplete) return;
    triggerHaptic("heavy");
    headGlow.value = withTiming(1, { duration: 600 });
    bombScale.value = withSequence(
      withSpring(1.08, { damping: 10 }),
      withDelay(200, withSpring(1.03, { damping: 12 }))
    );
    setTimeout(() => {
      triggerHaptic("success");
      onStageChange(2);
    }, 800);
  }, [birthComplete, onStageChange]);

  // GPU 가속 애니메이션 (transform + opacity만)
  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(entranceProgress.value, [0, 1], [SCREEN_H * 0.4, 0], Extrapolation.CLAMP) },
      { scale: bombScale.value },
    ],
    opacity: entranceProgress.value,
  }));

  const headGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(headGlow.value, [0, 0.5, 1], [0.1, 0.4, 0.8], Extrapolation.CLAMP),
    shadowRadius: interpolate(headGlow.value, [0, 0.5, 1], [15, 40, 80], Extrapolation.CLAMP),
  }));

  const TOTAL_H = HEAD_SIZE + NECK_HEIGHT + HANDLE_HEIGHT;

  return (
    <Animated.View style={[styles.container, { width: BOMB_WIDTH, height: TOTAL_H }, containerStyle]}>
      {/* SVG 실루엣 배경 */}
      <ArmyBombSilhouette width={BOMB_WIDTH} height={TOTAL_H} glowOpacity={0} />

      {/* ⚠️ 수정금지(승인필요) — 머리: 도시명 + D-Day */}
      <Animated.View style={[styles.headOverlay, { width: HEAD_SIZE, height: HEAD_SIZE }, headGlowStyle, { shadowColor: BORAHAE }]}>
        <Text style={styles.cityName}>GOYANG</Text>
        <View style={styles.ddayBadge}>
          <Text style={styles.ddayText}>D-{dDay}</Text>
        </View>
      </Animated.View>

      {/* ⚠️ 수정금지(승인필요) — 목: 생년월일 입력 */}
      <View style={[styles.neckOverlay, { top: HEAD_SIZE - HEAD_SIZE * 0.1, width: NECK_WIDTH }]}>
        <TextInput
          style={[styles.birthInput, birthComplete && styles.birthInputActive]}
          placeholder="DD / MM / YYYY"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={birthDate}
          onChangeText={handleBirthInput}
          keyboardType="number-pad"
          maxLength={14}
          onFocus={() => triggerHaptic("light")}
        />
      </View>

      {/* ⚠️ 수정금지(승인필요) — 손잡이: OAuth 로고 버튼 */}
      <View style={[styles.handleOverlay, {
        top: HEAD_SIZE + NECK_HEIGHT * 0.5,
        width: HANDLE_WIDTH,
        height: HANDLE_HEIGHT,
      }]}>
        {/* Google */}
        <Pressable
          style={({ pressed }) => [styles.oauthBtn, styles.googleBtn, !birthComplete && styles.disabledBtn, pressed && styles.pressedBtn]}
          onPress={() => handleOAuth("google")}
          disabled={!birthComplete}
        >
          <GoogleLogo />
        </Pressable>

        {/* Kakao */}
        <Pressable
          style={({ pressed }) => [styles.oauthBtn, styles.kakaoBtn, !birthComplete && styles.disabledBtn, pressed && styles.pressedBtn]}
          onPress={() => handleOAuth("kakao")}
          disabled={!birthComplete}
        >
          <KakaoLogo />
        </Pressable>

        {/* Apple */}
        <Pressable
          style={({ pressed }) => [styles.oauthBtn, styles.appleBtn, !birthComplete && styles.disabledBtn, pressed && styles.pressedBtn]}
          onPress={() => handleOAuth("apple")}
          disabled={!birthComplete}
        >
          <AppleLogo />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    position: "relative",
  },

  // 머리 오버레이 (도시명, D-Day)
  headOverlay: {
    position: "absolute",
    top: 0,
    borderRadius: HEAD_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 0 },
    elevation: 15,
  },
  cityName: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 4,
  },
  ddayBadge: {
    marginTop: 8,
    backgroundColor: ARIRANG_RED,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  ddayText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
  },

  // 목 오버레이 (생년월일)
  neckOverlay: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
  },
  birthInput: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 2,
  },
  birthInputActive: {
    borderColor: BORAHAE,
    backgroundColor: "rgba(108,45,199,0.12)",
  },

  // 손잡이 오버레이 (OAuth)
  handleOverlay: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  oauthBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  googleBtn: {
    backgroundColor: "#FFFFFF",
  },
  kakaoBtn: {
    backgroundColor: KAKAO_YELLOW,
  },
  appleBtn: {
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  disabledBtn: {
    opacity: 0.25,
  },
  pressedBtn: {
    transform: [{ scale: 0.92 }],
    opacity: 0.7,
  },
});