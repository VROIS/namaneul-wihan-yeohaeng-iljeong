// ⚠️ 수정금지(승인필요) — A1안: BTS 투어 타이틀 (ㅇㄹㄹ 엠블럼 삭제)
// A안에서 ArirangEmblemsRow만 제거, 나머지 그대로
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";

const { width: SCREEN_W } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 디자인 토큰
const BORAHAE = "#6C2DC7";
const ARIRANG_RED = "#C73E2D";

interface BTSTourHeroProps {
  bgOpacity: SharedValue<number>;
}

// ⚠️ 수정금지(승인필요) — D-Day 자동 계산 (고양 2026-04-09 기준)
function getDDay(): number {
  const concert = new Date("2026-04-09");
  const today = new Date();
  return Math.ceil(
    (concert.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export default function BTSTourHeroA1({ bgOpacity }: BTSTourHeroProps) {
  const titleOpacity = useSharedValue(0);
  const titleScale = useSharedValue(0.85);
  const subtitleOpacity = useSharedValue(0);
  const statsOpacity = useSharedValue(0);
  const dDay = getDDay();

  useEffect(() => {
    // Stage 1: 1초 암전 후 타이틀 점화
    titleOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    titleScale.value = withDelay(
      300,
      withSpring(1, { damping: 12, stiffness: 100 }),
    );

    // 부제
    subtitleOpacity.value = withDelay(800, withTiming(1, { duration: 600 }));

    // 공연 정보
    statsOpacity.value = withDelay(1200, withTiming(1, { duration: 600 }));
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }],
  }));

  const subStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value }));
  const statStyle = useAnimatedStyle(() => ({ opacity: statsOpacity.value }));

  return (
    <View style={styles.container}>
      {/* ⚠️ A1안: ㅇㄹㄹ 엠블럼 삭제됨 */}

      {/* WORLD TOUR 2026 */}
      <Animated.View style={subStyle}>
        <Text style={styles.worldTour}>WORLD TOUR 2026</Text>
      </Animated.View>

      {/* ⚠️ 수정금지(승인필요) — 메인 타이틀 점화 (보라색 글로우) */}
      <Animated.View style={[styles.titleWrap, titleStyle]}>
        <Text style={styles.titleBTS}>BTS 아리랑</Text>
        <Text style={styles.titleTour}>월드투어 2026</Text>
        <View style={styles.redAccent} />
      </Animated.View>

      {/* 다음 공연 + D-Day (미니멀) */}
      <Animated.View style={[styles.ddayWrap, statStyle]}>
        <Text style={styles.venueText}>GOYANG</Text>
        <View style={styles.ddayBadge}>
          <Text style={styles.ddayText}>D-{dDay}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  worldTour: {
    fontFamily: "Pretendard-Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 6,
    textAlign: "center",
    marginBottom: 8,
  },
  titleWrap: {
    alignItems: "center",
    marginBottom: 16,
    shadowColor: BORAHAE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  titleBTS: {
    fontFamily: "NotoSerifKR-Bold",
    fontSize: 38,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 2,
    textShadowColor: BORAHAE,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 25,
  },
  titleTour: {
    fontFamily: "NotoSerifKR-Bold",
    fontSize: 28,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    letterSpacing: 1,
  },
  redAccent: {
    width: 60,
    height: 3,
    backgroundColor: ARIRANG_RED,
    borderRadius: 2,
    marginTop: 12,
    opacity: 0.8,
  },
  venueText: {
    fontFamily: "Pretendard-Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 8,
  },
  ddayWrap: { alignItems: "center", marginBottom: 12 },
  ddayBadge: {
    backgroundColor: ARIRANG_RED,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  ddayText: {
    fontFamily: "PlayfairDisplay-Bold",
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: 1,
  },
});
