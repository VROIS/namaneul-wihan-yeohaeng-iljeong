// ⚠️ 수정금지(승인필요) — C안: Ultimate BTS 아미봄 랜딩 (Digital Concert Opening)
// 모든 디자인 도구와 스킬을 활용한 최고의 작품
import React, { useEffect, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  interpolate,
  interpolateColor,
  Extrapolation,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

import { ArmyBombC } from "@/components/bts/ArmyBombC";
import { LightParticles } from "@/components/bts/LightParticles";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 디자인 토큰
const COBALT_DEEP = "#0B1026";
const BORAHAE = "#6C2DC7";
const BORAHAE_DARK = "#4C1D95";
const BORAHAE_LIGHT = "#8B5CF6";
const WHITE = "#FFFFFF";

export function BTSLandingScreenC() {
  const navigation = useNavigation<any>();

  // ⚠️ 수정금지(승인필요) — 마스터 오케스트레이션
  const progress = useSharedValue(0); // 0 → 0.3 → 0.5 → 1.0
  const bombEntrance = useSharedValue(0);
  const bombGlow = useSharedValue(0);
  const particlesTrigger = useSharedValue(0);
  const whiteout = useSharedValue(0);

  // 배경 밝기 단계별 전환
  const bgOpacity = useSharedValue(0);

  useEffect(() => {
    // 초기 진입 애니메이션
    bombEntrance.value = withDelay(
      500,
      withSpring(1, { damping: 18, stiffness: 80 }),
    );

    // 배경 30% 밝아짐
    progress.value = withDelay(800, withTiming(0.3, { duration: 1000 }));
    bgOpacity.value = withDelay(800, withTiming(0.3, { duration: 1000 }));
  }, []);

  // ⚠️ 수정금지(승인필요) — 3단계 진행 콜백
  const onStageChange = useCallback(
    (stage: number) => {
      "worklet";

      if (stage === 1) {
        // Stage 1: 생년월일 입력 (50% 밝기)
        progress.value = withTiming(0.5, { duration: 800 });
        bgOpacity.value = withTiming(0.5, { duration: 800 });
        bombGlow.value = withSpring(0.5, { damping: 20 });
      } else if (stage === 2) {
        // Stage 2: 인증 완료 (100% 밝기 + 화이트아웃)
        progress.value = withTiming(1, { duration: 1200 });
        bgOpacity.value = withTiming(1, { duration: 1200 });
        bombGlow.value = withSequence(
          withSpring(1, { damping: 8 }),
          withDelay(300, withTiming(1.5, { duration: 400 })),
        );

        // 파티클 트리거
        particlesTrigger.value = withTiming(1, { duration: 100 });

        // 화이트아웃 전환
        whiteout.value = withDelay(
          1800,
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        );

        // 다음 화면으로
        const navigateNext = () => {
          navigation.replace("Main");
        };

        runOnJS(setTimeout)(() => {
          runOnJS(navigateNext)();
        }, 2800);
      }
    },
    [navigation],
  );

  // ⚠️ 수정금지(승인필요) — 배경 그라디언트 애니메이션
  const bgAnimatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 0.3, 0.5, 1],
      [COBALT_DEEP, "#1A1A3E", "#2D1B69", BORAHAE_DARK],
    );

    return {
      backgroundColor,
      opacity: interpolate(bgOpacity.value, [0, 1], [1, 0.6]),
    };
  });

  // 보라색 글로우 오버레이
  const glowOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      bombGlow.value,
      [0, 0.5, 1, 1.5],
      [0, 0.2, 0.5, 0.8],
      Extrapolation.CLAMP,
    ),
  }));

  // 화이트아웃 레이어
  const whiteoutStyle = useAnimatedStyle(() => ({
    opacity: whiteout.value,
    transform: [
      {
        scale: interpolate(
          whiteout.value,
          [0, 1],
          [0.8, 1.2],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // ⚠️ 수정금지(승인필요) — 펄스 애니메이션 (아미봄 주변)
  const pulseAnimation = useSharedValue(0);
  useEffect(() => {
    pulseAnimation.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 2000 }),
      ),
      -1,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnimation.value, [0, 1], [0, 0.3]),
    transform: [
      {
        scale: interpolate(pulseAnimation.value, [0, 1], [1, 1.5]),
      },
    ],
  }));

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      {/* Layer 0: 배경 베이스 */}
      <Animated.View style={[StyleSheet.absoluteFill, bgAnimatedStyle]} />

      {/* Layer 1: 그라디언트 오버레이 */}
      <LinearGradient
        colors={["transparent", BORAHAE_DARK, "transparent"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      {/* Layer 2: 보라색 글로우 */}
      <Animated.View
        style={[StyleSheet.absoluteFill, glowOverlayStyle]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            "transparent",
            `${BORAHAE}40`,
            `${BORAHAE_LIGHT}60`,
            `${BORAHAE}40`,
            "transparent",
          ]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.8 }}
          end={{ x: 0.5, y: 0.2 }}
        />
      </Animated.View>

      {/* Layer 3: 펄스 이펙트 (아미봄 뒤) */}
      <Animated.View
        style={[styles.pulseCircle, pulseStyle]}
        pointerEvents="none"
      />

      {/* Layer 4: 파티클 효과 */}
      <LightParticles trigger={particlesTrigger} />

      {/* Layer 5: 메인 - 아미봄 컴포넌트 */}
      <View style={styles.centerContainer}>
        <ArmyBombC
          entranceProgress={bombEntrance}
          glowLevel={bombGlow}
          onStageChange={onStageChange}
        />
      </View>

      {/* Layer 6: 화이트아웃 */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.whiteout, whiteoutStyle]}
        pointerEvents="none"
      >
        <BlurView
          intensity={100}
          tint="light"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COBALT_DEEP,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  pulseCircle: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: BORAHAE,
    top: SCREEN_H / 2 - 200,
    left: SCREEN_W / 2 - 200,
  },
  whiteout: {
    backgroundColor: WHITE,
  },
});
