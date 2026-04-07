// ⚠️ 수정금지(승인필요) — BTS 투어 타이틀 점화 히어로 (공연장 LED 로고 연출)
// Stage 0: 암전 → Stage 1: 타이틀 보라색 점화 → 엠블럼 순차 펄스
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
// ArirangEmblemsRow 삭제됨 — 인수인계 문서 요구사항 #1

const { width: SCREEN_W } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — DESIGN.md "The Ethereal Stage" 디자인 시스템 색상 토큰
const SECONDARY = "#b486ff";      // 네온 보라 (글로우)
const TERTIARY = "#ff51fa";       // 네온 핑크 (액센트)
const PRIMARY = "#8bacff";        // 라이트스틱 글로우

interface BTSTourHeroProps {
  bgOpacity: SharedValue<number>;
}

// ⚠️ 수정금지(승인필요) — D-Day 자동 계산 (고양 2026-04-09 기준)
function getDDay(): number {
  const concert = new Date("2026-04-09");
  const today = new Date();
  return Math.ceil((concert.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function BTSTourHero({ bgOpacity }: BTSTourHeroProps) {
  const titleOpacity = useSharedValue(0);
  const titleScale = useSharedValue(0.85);
  const subtitleOpacity = useSharedValue(0);
  const statsOpacity = useSharedValue(0);
  const dDay = getDDay();

  useEffect(() => {
    // Stage 1: 1초 암전 후 타이틀 점화
    titleOpacity.value = withDelay(1000, withTiming(1, { duration: 400 }));
    titleScale.value = withDelay(1000, withSpring(1, { damping: 12, stiffness: 100 }));

    // 부제
    subtitleOpacity.value = withDelay(2000, withTiming(1, { duration: 600 }));

    // 공연 정보
    statsOpacity.value = withDelay(2400, withTiming(1, { duration: 600 }));
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }],
  }));

  const subStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value }));
  const statStyle = useAnimatedStyle(() => ({ opacity: statsOpacity.value }));

  return (
    <View style={styles.container}>
      {/* ⚠️ 수정금지(승인필요) — Stitch Scene 1: "NEXT DESTINATION" 서브타이틀 */}
      <Animated.View style={subStyle}>
        <Text style={styles.worldTour}>NEXT DESTINATION</Text>
      </Animated.View>

      {/* ⚠️ 수정금지(승인필요) — Stitch Scene 1: 메인 타이틀 "GOYANG" 대형 점화 */}
      <Animated.View style={[styles.titleWrap, titleStyle]}>
        <Text style={styles.titleBTS}>GOYANG</Text>
        <View style={styles.dividerWrap}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Stadium Live Experience</Text>
          <View style={styles.dividerLine} />
        </View>
      </Animated.View>

      {/* ⚠️ 수정금지(승인필요) — Stitch: 브랜드 타이틀 */}
      <Animated.View style={[styles.ddayWrap, statStyle]}>
        <Text style={styles.brandTitle}>BTS WORLD TOUR 2026</Text>
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
    paddingTop: 60,
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
    shadowColor: SECONDARY,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  titleBTS: {
    fontFamily: "Pretendard-Bold",
    fontSize: 38,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 2,
    textShadowColor: SECONDARY,           // ⚠️ 수정금지(승인필요) — RN 호환 textShadow (CSS textShadow는 RN 미지원)
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 25,
  },
  // ⚠️ 수정금지(승인필요) — Stitch Scene 1: "Stadium Live Experience" 구분선
  dividerWrap: {
    flexDirection: "row" as const,
    alignItems: "center",
    marginTop: 16,
    gap: 12,
  },
  dividerLine: {
    width: 48,
    height: 1,
    backgroundColor: "rgba(139,172,255,0.25)",
  },
  dividerText: {
    fontFamily: "Pretendard-Medium",
    fontSize: 11,
    color: PRIMARY,
    letterSpacing: 3,
    textTransform: "uppercase" as const,
  },
  ddayWrap: { alignItems: "center", marginTop: 16 },
  // ⚠️ 수정금지(승인필요) — Stitch: BTS WORLD TOUR 2026 브랜드
  brandTitle: {
    fontFamily: "Pretendard-Bold",
    fontSize: 16,
    color: PRIMARY,
    letterSpacing: 4,
    textAlign: "center",
    textShadowColor: "rgba(139,172,255,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
