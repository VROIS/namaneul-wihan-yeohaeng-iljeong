// ⚠️ 수정금지(승인필요) — A1안: A안 기반 최소 수정 (엠블럼 삭제 + 아미봉 형태 변경)
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
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

// ⚠️ 수정금지(승인필요) — A1안: BTSTourHeroA1 + ArmyBombAuthA1 사용
import BTSTourHeroA1 from "@/components/BTSTourHeroA1";
import { ArmyBombAuthA1 } from "@/components/bts/ArmyBombAuthA1";

// ⚠️ 수정금지(승인필요) — 배경색 코발트 블루
const COBALT_DEEP = "#0B1026";
const BORAHAE = "#6C2DC7";

export function BTSLandingScreenA1() {
  const navigation = useNavigation<any>();

  // ⚠️ 수정금지(승인필요) — 오케스트레이션
  const bgBrightness = useSharedValue(0);
  const armyBombEntrance = useSharedValue(0);
  const glowLevel = useSharedValue(0);
  const whiteout = useSharedValue(0);

  useEffect(() => {
    // Stage 1: 아미봉 등장 → 배경 50% 밝아짐
    armyBombEntrance.value = withDelay(800, withSpring(1, { damping: 14, stiffness: 100 }));
    bgBrightness.value = withDelay(1200, withTiming(0.5, { duration: 1000 }));
  }, []);

  // ⚠️ 수정금지(승인필요) — 인증 완료 → 화이트아웃 → 전환 (전문가 검증: withTiming callback 사용)
  const handleAuthComplete = useCallback((provider: string, birthDate: string) => {
    bgBrightness.value = withTiming(1, { duration: 1200 });
    whiteout.value = withDelay(1500, withTiming(1, { duration: 600 }, (finished) => {
      if (finished) {
        runOnJS(navigateNext)();
      }
    }));
  }, []);

  const navigateNext = useCallback(() => {
    // TODO: navigation.replace("BTSHome", { city: "goyang" })
  }, []);

  // ⚠️ 수정금지(승인필요) — 3단 점등: 아미봉 밝기 → 배경 연동
  const onGlowChange = useCallback((level: number) => {
    if (level >= 1) {
      // Stage 3: 풀점등 (100%) → 배경 80%
      bgBrightness.value = withTiming(0.8, { duration: 800 });
    } else if (level >= 0.7) {
      // Stage 2: 생년월일 완료 (70%) → 배경 50%
      bgBrightness.value = withTiming(0.5, { duration: 800 });
    }
  }, []);

  // ⚠️ 수정금지(승인필요) — 보라색 글로우 오버레이 (조도 단계별)
  const glowOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bgBrightness.value, [0, 0.5, 0.7, 1], [0, 0.2, 0.4, 0.8], Extrapolation.CLAMP),
  }));

  const whiteoutStyle = useAnimatedStyle(() => ({
    opacity: whiteout.value,
  }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Layer 0: 코발트 블루 배경 */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: COBALT_DEEP }]} />

      {/* Layer 1: 보라색 글로우 (아미봉 빛 전파 — 조도 단계별) */}
      <Animated.View style={[StyleSheet.absoluteFill, glowOverlayStyle]} pointerEvents="none">
        <LinearGradient
          colors={["transparent", "rgba(108,45,199,0.6)", "rgba(155,89,182,0.3)", "transparent"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.8 }}
          end={{ x: 0.5, y: 0 }}
        />
      </Animated.View>

      {/* 상단 — 타이틀 (엠블럼 삭제됨) */}
      <View style={styles.heroZone}>
        <BTSTourHeroA1 bgOpacity={bgBrightness} />
      </View>

      {/* 하단 — 아미봉 인증 (원형 머리 + 손잡이 형태) */}
      <View style={styles.authZone}>
        <ArmyBombAuthA1
          onAuthComplete={handleAuthComplete}
          glowLevel={glowLevel}
          entranceProgress={armyBombEntrance}
          onGlowChange={onGlowChange}
        />
      </View>

      {/* 화이트아웃 */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.whiteout, whiteoutStyle]}
        pointerEvents="none"
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
    flex: 25,
  },
  authZone: {
    flex: 75,
    justifyContent: "center",
  },
  whiteout: {
    backgroundColor: "#FFFFFF",
  },
});