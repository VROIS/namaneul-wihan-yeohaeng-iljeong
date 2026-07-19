// ⚠️ 수정금지(승인필요) — A1안: 아미봉 형태 인증 컴포넌트
// A안 색감/연출 + B안 형태(원형 머리+손잡이) + 전문가 검증 반영
// 3단 점등 스위치: 등장(50%) → 생년월일(70%) → 인증(100%+화이트아웃)
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
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

const { width: SCREEN_W } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 디자인 토큰 (A안과 동일)
const BORAHAE = "#6C2DC7";
const KAKAO_YELLOW = "#FEE500";

// ⚠️ 수정금지(승인필요) — 아미봉 비율 (A안 기존 너비 유지, 버튼 공간 확보)
const HEAD_SIZE = SCREEN_W * 0.85;
const HANDLE_WIDTH = HEAD_SIZE * 0.85;
const HANDLE_HEIGHT = HEAD_SIZE * 1.0;
const OVERLAP = 30;
const BOMB_TOTAL_H = HEAD_SIZE + HANDLE_HEIGHT - OVERLAP;

// ⚠️ 수정금지(승인필요) — 햅틱 (전문가 검증: Success가 Heavy보다 적합)
const triggerHaptic = (type: "light" | "medium" | "success") => {
  try {
    if (type === "light")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (type === "medium")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — Android BlurView fallback (전문가 검증: Android에서 BlurView 비용 높음)
const AuthBackground = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) => {
  if (Platform.OS === "android") {
    return (
      <View style={[style, { backgroundColor: "rgba(108,45,199,0.15)" }]}>
        {children}
      </View>
    );
  }
  return (
    <BlurView intensity={80} tint="dark" style={style}>
      {children}
    </BlurView>
  );
};

interface ArmyBombAuthA1Props {
  onAuthComplete: (provider: string, birthDate: string) => void;
  glowLevel: SharedValue<number>;
  entranceProgress: SharedValue<number>;
  onGlowChange?: (level: number) => void;
}

export function ArmyBombAuthA1({
  onAuthComplete,
  glowLevel,
  entranceProgress,
  onGlowChange,
}: ArmyBombAuthA1Props) {
  const [birthDate, setBirthDate] = useState("");
  const [birthComplete, setBirthComplete] = useState(false);

  // 내부 애니메이션
  const pressScale = useSharedValue(1);

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
        // Stage 2: 생년월일 완료 → 70% 밝기
        glowLevel.value = withSpring(0.7, { damping: 20, stiffness: 80 });
        onGlowChange?.(0.7);
        triggerHaptic("medium");
      } else {
        setBirthComplete(false);
        if (glowLevel.value > 0) {
          glowLevel.value = withTiming(0, { duration: 300 });
          onGlowChange?.(0);
        }
      }
    },
    [onGlowChange],
  );

  // ⚠️ 수정금지(승인필요) — OAuth 탭 = 풀 점등 (100%)
  const handleOAuth = useCallback(
    (provider: string) => {
      // Stage 3: 풀 점등
      glowLevel.value = withSequence(
        withSpring(1, { damping: 8, stiffness: 200 }),
        withDelay(500, withTiming(1.2, { duration: 300 })),
      );
      onGlowChange?.(1);
      triggerHaptic("success");

      // 전문가 검증: setTimeout 대신 withTiming callback 사용은 LandingScreen에서 처리
      setTimeout(() => {
        onAuthComplete(provider, birthDate);
      }, 2000);
    },
    [birthDate, onGlowChange],
  );

  // ⚠️ 수정금지(승인필요) — 등장 애니메이션 (GPU: transform + opacity만)
  const entranceStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          entranceProgress.value,
          [0, 1],
          [400, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      entranceProgress.value,
      [0, 0.3, 1],
      [0, 0.5, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // ⚠️ 수정금지(승인필요) — 글로우 효과 (아미봉 전체에서 발광)
  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(
      glowLevel.value,
      [0, 0.7, 1, 1.2],
      [0.1, 0.5, 0.8, 1],
      Extrapolation.CLAMP,
    ),
    shadowRadius: interpolate(
      glowLevel.value,
      [0, 0.7, 1, 1.2],
      [15, 40, 70, 90],
      Extrapolation.CLAMP,
    ),
  }));

  // 내부 보라빛 오버레이 (점등 느낌)
  const innerGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      glowLevel.value,
      [0, 0.7, 1, 1.2],
      [0, 0.2, 0.5, 0.7],
      Extrapolation.CLAMP,
    ),
  }));

  const isDisabled = !birthComplete;

  return (
    <Animated.View
      style={[
        styles.bombContainer,
        entranceStyle,
        glowStyle,
        { shadowColor: BORAHAE },
      ]}
    >
      {/* ⚠️ 수정금지(승인필요) — 아미봉 머리 (원형 발광부) — B안 형태 참고 */}
      <View style={styles.headWrapper}>
        <AuthBackground style={styles.bombHead}>
          {/* 내부 글로우 오버레이 */}
          <Animated.View style={[styles.innerGlow, innerGlowStyle]} />

          {/* 생년월일 입력 (1단계 스위치) */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>DATE OF BIRTH</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="DD / MM / YYYY"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={birthDate}
                onChangeText={handleBirthInput}
                keyboardType="number-pad"
                maxLength={14}
              />
            </View>
          </View>
        </AuthBackground>
      </View>

      {/* ⚠️ 수정금지(승인필요) — 아미봉 손잡이 (OAuth 버튼 영역) — B안 형태 참고 */}
      <View style={styles.handleWrapper}>
        <AuthBackground style={styles.bombHandle}>
          <View style={styles.oauthSection}>
            {/* Google */}
            <Animated.View style={[styles.oauthBtnWrap]}>
              <View
                style={[
                  styles.oauthBtn,
                  styles.googleBtn,
                  isDisabled && styles.disabledBtn,
                ]}
                onTouchEnd={() => !isDisabled && handleOAuth("google")}
              >
                <Text
                  style={[
                    styles.oauthText,
                    styles.googleText,
                    isDisabled && styles.disabledText,
                  ]}
                >
                  Continue with Google
                </Text>
              </View>
            </Animated.View>

            {/* Kakao */}
            <Animated.View style={[styles.oauthBtnWrap]}>
              <View
                style={[
                  styles.oauthBtn,
                  styles.kakaoBtn,
                  isDisabled && styles.disabledBtn,
                ]}
                onTouchEnd={() => !isDisabled && handleOAuth("kakao")}
              >
                <Text
                  style={[
                    styles.oauthText,
                    styles.kakaoText,
                    isDisabled && styles.disabledKakao,
                  ]}
                >
                  카카오로 시작하기
                </Text>
              </View>
            </Animated.View>

            {/* Apple (iOS only) */}
            {Platform.OS === "ios" && (
              <Animated.View style={[styles.oauthBtnWrap]}>
                <View
                  style={[
                    styles.oauthBtn,
                    styles.appleBtn,
                    isDisabled && styles.disabledBtn,
                  ]}
                  onTouchEnd={() => !isDisabled && handleOAuth("apple")}
                >
                  <Text
                    style={[
                      styles.oauthText,
                      styles.appleText,
                      isDisabled && styles.disabledText,
                    ]}
                  >
                    Sign in with Apple
                  </Text>
                </View>
              </Animated.View>
            )}
          </View>
        </AuthBackground>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ⚠️ 수정금지(승인필요) — sized container (전문가 검증: absolute positioning)
  bombContainer: {
    width: HEAD_SIZE,
    height: BOMB_TOTAL_H,
    alignSelf: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },

  // ⚠️ 수정금지(승인필요) — 머리 (원형, B안 참고)
  headWrapper: {
    position: "absolute",
    top: 0,
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    zIndex: 2,
  },
  bombHead: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    borderRadius: HEAD_SIZE / 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(108,45,199,0.25)",
    backgroundColor: "rgba(108,45,199,0.12)",
    // 웹 fallback
    ...Platform.select({
      web: {
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      },
    }),
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BORAHAE,
    borderRadius: HEAD_SIZE / 2,
  },

  // ⚠️ 수정금지(승인필요) — 손잡이 (B안 참고)
  handleWrapper: {
    position: "absolute",
    top: HEAD_SIZE - OVERLAP,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    zIndex: 1,
  },
  bombHandle: {
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: OVERLAP + 10,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "rgba(108,45,199,0.15)",
    backgroundColor: "rgba(108,45,199,0.08)",
    ...Platform.select({
      web: {
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      },
    }),
  },

  // 생년월일 입력
  inputSection: {
    marginBottom: 0,
    alignItems: "center",
    width: "100%",
  },
  inputLabel: {
    fontFamily: "Pretendard-SemiBold",
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 2,
    marginBottom: 8,
  },
  inputWrap: {
    width: "80%",
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
    paddingVertical: 12,
    textAlign: "center",
    letterSpacing: 2,
  },

  // OAuth 버튼
  oauthSection: {
    width: "100%",
    paddingHorizontal: 16,
    gap: 10,
  },
  oauthBtnWrap: {},
  oauthBtn: {
    height: 52,
    borderRadius: 26,
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
    opacity: 0.4,
  },
  oauthText: {
    fontFamily: "Pretendard-SemiBold",
    fontSize: 15,
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
  disabledText: {
    opacity: 0.5,
  },
  disabledKakao: {
    opacity: 0.5,
  },
});
