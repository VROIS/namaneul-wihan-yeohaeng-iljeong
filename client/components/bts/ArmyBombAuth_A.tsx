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
    if (type === "light")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (type === "medium")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const AnimatedView = Animated.createAnimatedComponent(View);

// ⚠️ 수정금지(승인필요) — 아미봉 비율 (최대 확대 — 화면 거의 꽉)
const HEAD_SIZE = SCREEN_W * 0.82; // 원형 머리 지름 (최대 확대)
const HANDLE_WIDTH = HEAD_SIZE * 0.88; // 손잡이 너비 (버튼 공간 충분)
const HANDLE_HEIGHT = HEAD_SIZE * 0.55; // 손잡이 높이 (버튼만)
const OVERLAP = 25; // 머리-손잡이 겹침

// ⚠️ 수정금지(승인필요) — 디자인 토큰
const BORAHAE = "#6C2DC7";
const KAKAO_YELLOW = "#FEE500";

interface ArmyBombAuthProps {
  onAuthComplete: (provider: string, birthDate: string) => void;
  glowLevel: SharedValue<number>;
  entranceProgress: SharedValue<number>;
  onGlowChange?: (level: number) => void; // 배경 연동 콜백
}

export function ArmyBombAuth({
  onAuthComplete,
  glowLevel,
  entranceProgress,
  onGlowChange,
}: ArmyBombAuthProps) {
  const [birthDate, setBirthDate] = useState("");
  const [birthComplete, setBirthComplete] = useState(false);

  // ⚠️ 수정금지(승인필요) — 생년월일 존 터치 시 70% 점등
  const handleBirthFocus = useCallback(() => {
    glowLevel.value = withSpring(0.5, { damping: 18, stiffness: 90 });
    onGlowChange?.(0.5);
    triggerHaptic("light");
  }, [onGlowChange]);

  // ⚠️ 수정금지(승인필요) — 생년월일 자동 포맷 (DD/MM/YYYY)
  const handleBirthInput = useCallback(
    (text: string) => {
      const digits = text.replace(/\D/g, "").slice(0, 8);
      let formatted = digits;
      if (digits.length > 2)
        formatted = digits.slice(0, 2) + " / " + digits.slice(2);
      if (digits.length > 4)
        formatted =
          digits.slice(0, 2) +
          " / " +
          digits.slice(2, 4) +
          " / " +
          digits.slice(4);
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
    },
    [onGlowChange],
  );

  // ⚠️ 수정금지(승인필요) — OAuth 터치 = 100% 풀 점등 + 화이트아웃
  const handleOAuth = useCallback(
    (provider: string) => {
      glowLevel.value = withSequence(
        withSpring(1, { damping: 8, stiffness: 200 }),
        withDelay(500, withTiming(1.2, { duration: 300 })),
      );
      onGlowChange?.(1);
      triggerHaptic("success");

      setTimeout(() => {
        onAuthComplete(provider, birthDate);
      }, 2000);
    },
    [birthDate, onGlowChange],
  );

  // ⚠️ 수정금지(승인필요) — 등장: Apple Maps 바텀시트처럼 스윽 올라옴
  const entranceStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          entranceProgress.value,
          [0, 1],
          [SCREEN_H * 0.6, 0],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          entranceProgress.value,
          [0, 0.5, 1],
          [0.85, 0.95, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      entranceProgress.value,
      [0, 0.2, 0.6, 1],
      [0, 0.3, 0.8, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // ⚠️ 수정금지(승인필요) — 외부 글로우 (보라색 전등 — Android/iOS 공통 시각 효과)
  // Android: shadow 안 먹음 → 뒤에 큰 보라색 원으로 글로우 표현
  const outerGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      glowLevel.value,
      [0, 0.5, 0.7, 1, 1.2],
      [0, 0.3, 0.5, 0.8, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          glowLevel.value,
          [0, 0.5, 1, 1.2],
          [0.8, 1, 1.15, 1.25],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // iOS 전용 shadow (있으면 더 좋고 없어도 outerGlow가 커버)
  const shadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(
      glowLevel.value,
      [0, 0.5, 0.7, 1, 1.2],
      [0, 0.4, 0.7, 1, 1],
      Extrapolation.CLAMP,
    ),
    shadowRadius: interpolate(
      glowLevel.value,
      [0, 0.5, 0.7, 1, 1.2],
      [0, 20, 40, 70, 90],
      Extrapolation.CLAMP,
    ),
  }));

  // ⚠️ 수정금지(승인필요) — 머리 전등 효과: 색상이 변하면서 밝아짐
  const headGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      glowLevel.value,
      [0, 0.3, 0.5, 0.7, 1, 1.2],
      [0, 0.1, 0.2, 0.4, 0.65, 0.85],
      Extrapolation.CLAMP,
    ),
    backgroundColor: interpolateColor(
      glowLevel.value,
      [0, 0.5, 0.7, 1, 1.2],
      [
        "rgba(108,45,199,0.0)",
        "rgba(108,45,199,0.3)",
        "rgba(124,58,237,0.5)",
        "rgba(183,148,244,0.7)",
        "rgba(255,255,255,0.9)",
      ],
    ),
  }));

  // ⚠️ 수정금지(승인필요) — 머리 뒤 글로우 링 (전등 빛 확산 — 2겹)
  const glowRing1Style = useAnimatedStyle(() => ({
    opacity: interpolate(
      glowLevel.value,
      [0, 0.5, 0.7, 1],
      [0, 0.15, 0.3, 0.5],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          glowLevel.value,
          [0, 0.5, 1],
          [0.9, 1.05, 1.15],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  const glowRing2Style = useAnimatedStyle(() => ({
    opacity: interpolate(
      glowLevel.value,
      [0, 0.5, 0.7, 1],
      [0, 0.08, 0.15, 0.3],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          glowLevel.value,
          [0, 0.5, 1],
          [0.85, 1.1, 1.3],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // ⚠️ 수정금지(승인필요) — 손잡이 내부 보라빛 오버레이
  const handleGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      glowLevel.value,
      [0, 0.5, 0.7, 1, 1.2],
      [0, 0.08, 0.2, 0.4, 0.6],
      Extrapolation.CLAMP,
    ),
  }));

  const isDisabled = !birthComplete;

  // ⚠️ 수정금지(승인필요) — Android BlurView fallback
  const blurBg = Platform.select({
    android: { backgroundColor: "rgba(11,16,38,0.65)" },
    default: {},
  });

  return (
    <AnimatedView
      style={[
        styles.container,
        entranceStyle,
        shadowStyle,
        { shadowColor: BORAHAE },
      ]}
    >
      {/* ⚠️ 수정금지(승인필요) — 전등 빛 확산 글로우 링 (머리 뒤, 3겹) */}
      <AnimatedView style={[styles.outerGlow, outerGlowStyle]} />
      <AnimatedView style={[styles.glowRing1, glowRing1Style]} />
      <AnimatedView style={[styles.glowRing2, glowRing2Style]} />

      {/* ⚠️ 수정금지(승인필요) — 원형 머리 (생년월일 입력) */}
      <View style={[styles.headClip, blurBg]}>
        <BlurView intensity={80} tint="dark" style={styles.headBlur}>
          {/* 머리 내부 글로우 오버레이 */}
          <AnimatedView style={[styles.headInnerGlow, headGlowStyle]} />

          {/* MAKE YOUR TRIP WITH THEM */}
          <Text style={styles.joinTitle}>MAKE YOUR TRIP</Text>
          <Text style={styles.joinSub}>WITH THEM</Text>

          {/* 생년월일 안내 */}
          <Text style={styles.birthLabel}>Date of Birth</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="DD / MM / YYYY"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={birthDate}
              onChangeText={handleBirthInput}
              onFocus={handleBirthFocus}
              keyboardType="number-pad"
              maxLength={14}
            />
          </View>
        </BlurView>
      </View>

      {/* ⚠️ 수정금지(승인필요) — 손잡이 (OAuth 버튼) */}
      <View style={[styles.handleClip, blurBg]}>
        <BlurView intensity={60} tint="dark" style={styles.handleBlur}>
          {/* 손잡이 내부 글로우 오버레이 */}
          <AnimatedView style={[styles.handleInnerGlow, handleGlowStyle]} />

          <View style={styles.oauthSection}>
            {/* Google */}
            <TouchableOpacity
              style={[
                styles.oauthBtn,
                styles.googleBtn,
                isDisabled && styles.disabledBtn,
              ]}
              onPress={() => handleOAuth("google")}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              <Text style={[styles.oauthText, styles.googleText]}>
                Continue with Google
              </Text>
            </TouchableOpacity>

            {/* Kakao */}
            <TouchableOpacity
              style={[
                styles.oauthBtn,
                styles.kakaoBtn,
                isDisabled && styles.disabledBtn,
              ]}
              onPress={() => handleOAuth("kakao")}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              <Text style={[styles.oauthText, styles.kakaoText]}>
                카카오로 시작하기
              </Text>
            </TouchableOpacity>

            {/* Apple (iOS only) */}
            {Platform.OS === "ios" && (
              <TouchableOpacity
                style={[
                  styles.oauthBtn,
                  styles.appleBtn,
                  isDisabled && styles.disabledBtn,
                ]}
                onPress={() => handleOAuth("apple")}
                disabled={isDisabled}
                activeOpacity={0.8}
              >
                <Text style={[styles.oauthText, styles.appleText]}>
                  Sign in with Apple
                </Text>
              </TouchableOpacity>
            )}
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
    backgroundColor: BORAHAE,
    top: -(HEAD_SIZE * 0.25),
    opacity: 0,
    zIndex: 0,
  },
  glowRing1: {
    position: "absolute",
    width: HEAD_SIZE * 1.25,
    height: HEAD_SIZE * 1.25,
    borderRadius: HEAD_SIZE * 0.625,
    backgroundColor: "rgba(124,58,237,0.4)",
    top: -(HEAD_SIZE * 0.125),
    opacity: 0,
    zIndex: 0,
  },
  glowRing2: {
    position: "absolute",
    width: HEAD_SIZE * 1.8,
    height: HEAD_SIZE * 1.8,
    borderRadius: HEAD_SIZE * 0.9,
    backgroundColor: "rgba(183,148,244,0.2)",
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
    borderColor: "rgba(108,45,199,0.3)",
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
    borderColor: "rgba(108,45,199,0.2)",
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
    backgroundColor: BORAHAE,
    borderRadius: 20,
  },

  // ⚠️ 수정금지(승인필요) — 머리 내부: 문구 + 생년월일
  joinTitle: {
    fontFamily: "PlayfairDisplay-Bold",
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 3,
    marginBottom: 2,
  },
  joinSub: {
    fontFamily: "PlayfairDisplay-Bold",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 12,
  },
  birthLabel: {
    fontFamily: "Pretendard-Medium",
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  inputWrap: {
    width: "85%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  input: {
    fontFamily: "PlayfairDisplay-Regular",
    fontSize: 16,
    color: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: "center",
    letterSpacing: 2,
  },

  // ⚠️ 수정금지(승인필요) — 손잡이 내부: OAuth 버튼
  oauthSection: {
    gap: 8,
  },
  oauthBtn: {
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  googleBtn: {
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  kakaoBtn: {
    backgroundColor: KAKAO_YELLOW,
  },
  appleBtn: {
    backgroundColor: "rgba(0,0,0,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  disabledBtn: {
    opacity: 0.35,
  },
  oauthText: {
    fontFamily: "Pretendard-SemiBold",
    fontSize: 14,
  },
  googleText: {
    color: "#1A1A1A",
  },
  kakaoText: {
    color: "#1A1A1A",
  },
  appleText: {
    color: "#FFFFFF",
  },
});
