// ⚠️ 수정금지(승인필요) — BTS 랜딩 화면: 공연 시작 전 무대 연출
// 배경: 짙은 코발트 블루 → 아미봉(인증창)이 조명등 → 입력마다 배경+아미봉 동시 밝아짐 → 화이트아웃 → 전환
import React, { useEffect, useCallback } from "react";
import { View, StyleSheet, Dimensions, StatusBar } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  interpolate,
  interpolateColor,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

import BTSTourHero from "@/components/BTSTourHero";
import { ArmyBombAuth } from "@/components/bts/ArmyBombAuth";

// ⚠️ 수정금지(승인필요) — 배경색 코발트 블루
const COBALT_DEEP = "#0B1026";
const BORAHAE = "#6C2DC7";

export function BTSLandingScreen() {
  const navigation = useNavigation<any>();

  // ⚠️ 수정금지(승인필요) — 오케스트레이션
  const bgBrightness = useSharedValue(0);
  const armyBombEntrance = useSharedValue(0);
  const glowLevel = useSharedValue(0);
  const whiteout = useSharedValue(0);

  useEffect(() => {
    // Stage 1: 타이틀 점화 → 배경 살짝 밝아짐
    bgBrightness.value = withDelay(1200, withTiming(0.1, { duration: 800 }));
    // Stage 2: 아미봉 등장 — 스윽 느리게 올라옴 (Apple 바텀시트)
    armyBombEntrance.value = withDelay(2000, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    glowLevel.value = withDelay(2800, withTiming(0.3, { duration: 600 }));
    bgBrightness.value = withDelay(3000, withTiming(0.15, { duration: 600 }));
  }, []);

  // ⚠️ 수정금지(승인필요) — 인증 완료 → 화이트아웃 → 전환
  const handleAuthComplete = useCallback((provider: string, birthDate: string) => {
    bgBrightness.value = withTiming(1, { duration: 1200 });
    whiteout.value = withDelay(1500, withTiming(1, { duration: 600 }));
    setTimeout(() => {
      // TODO: navigation.replace("BTSHome", { city: "goyang" })
    }, 2200);
  }, []);

  // ⚠️ 수정금지(승인필요) — 3단 점등: 터치마다 배경 밝기 연동
  const onGlowChange = useCallback((level: number) => {
    // 등장 50% → 배경 20%, 생년월일 터치 70% → 배경 35%, 풀점등 100% → 배경 60%
    if (level >= 1) {
      bgBrightness.value = withTiming(0.6, { duration: 800 });
    } else if (level >= 0.7) {
      bgBrightness.value = withTiming(0.35, { duration: 800 });
    } else if (level >= 0.5) {
      bgBrightness.value = withTiming(0.2, { duration: 800 });
    }
  }, []);

  // ⚠️ 수정금지(승인필요) — 배경색 극적 변화: 코발트→제미니블루→보라→밝은보라→낮모드
  const bgColorStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      bgBrightness.value,
      [0, 0.15, 0.2, 0.35, 0.6, 1],
      ["#0B1026", "#1A2660", "#4285F4", "#7C3AED", "#B794F4", "#F5F0FF"]
    ),
  }));

  // ⚠️ 수정금지(승인필요) — 보라색 글로우 오버레이 (강화 — 확실히 보이게)
  const glowOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bgBrightness.value, [0, 0.15, 0.2, 0.35, 0.6, 1], [0, 0.1, 0.25, 0.45, 0.7, 0.95], Extrapolation.CLAMP),
  }));

  const whiteoutStyle = useAnimatedStyle(() => ({
    opacity: whiteout.value,
  }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Layer 0: 코발트 블루 → 보라색으로 변하는 배경 (점등에 따라) */}
      <Animated.View style={[StyleSheet.absoluteFill, bgColorStyle]} />

      {/* Layer 1: 보라색 글로우 (아미봉 빛 전파 — 조도 단계별) */}
      <Animated.View style={[StyleSheet.absoluteFill, glowOverlayStyle]}>
        <LinearGradient
          colors={["transparent", "rgba(108,45,199,0.8)", "rgba(155,89,182,0.5)", "rgba(108,45,199,0.3)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.75 }}
          end={{ x: 0.5, y: 0.1 }}
        />
      </Animated.View>

      {/* 상단 — 타이틀 (미니멀: 로고 + GOYANG + D-Day) */}
      <View style={styles.heroZone}>
        <BTSTourHero bgOpacity={bgBrightness} />
      </View>

      {/* 하단 — 아미봉 인증 (보라색 전등) */}
      <View style={styles.authZone}>
        <ArmyBombAuth
          onAuthComplete={handleAuthComplete}
          glowLevel={glowLevel}
          entranceProgress={armyBombEntrance}
          onGlowChange={onGlowChange}
        />
      </View>

      {/* 화이트아웃 */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.whiteout, whiteoutStyle, { pointerEvents: "none" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%" as any,
    backgroundColor: COBALT_DEEP,
  },
  heroZone: {
    flex: 45,
  },
  authZone: {
    flex: 55,
    justifyContent: "center",
  },
  whiteout: {
    backgroundColor: "#FFFFFF",
  },
});
