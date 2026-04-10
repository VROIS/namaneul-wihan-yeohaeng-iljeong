// ⚠️ 수정금지(승인필요) — BTS 아리랑 3엠블럼 SVG (ㅇㄹㄹ 한글 초성, 태극기 괘 연상)
import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle, Rect, Line } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withSequence,
  withTiming,
  withRepeat,
} from "react-native-reanimated";
import { useEffect } from "react";

const AnimatedView = Animated.createAnimatedComponent(View);

// ⚠️ 수정금지(승인필요) — 아리랑 색상
const ARIRANG_RED = "#C73E2D";
const BORAHAE = "#6C2DC7";

interface EmblemProps {
  size?: number;
  color?: string;
  glowColor?: string;
}

// ◉ 첫째 엠블럼 (ㅇ) — 속이 찬 원 + 내부 점, 한국 도장 모티프
export function EmblemIeung({ size = 48, color = ARIRANG_RED }: EmblemProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* 외곽 원 */}
      <Circle cx={24} cy={24} r={21} stroke={color} strokeWidth={2.5} fill="none" />
      {/* 내부 링 (도장 느낌) */}
      <Circle cx={24} cy={24} r={16} stroke={color} strokeWidth={0.8} fill="none" opacity={0.3} />
      {/* 중앙 점 */}
      <Circle cx={24} cy={24} r={6} fill={color} />
    </Svg>
  );
}

// ☰ 둘째 엠블럼 (ㄹ) — 수평 2줄, 태극기 건괘 연상
export function EmblemRieul1({ size = 48, color = ARIRANG_RED }: EmblemProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* 외곽 원 */}
      <Circle cx={24} cy={24} r={21} stroke={color} strokeWidth={2.5} fill="none" />
      {/* 내부 링 */}
      <Circle cx={24} cy={24} r={16} stroke={color} strokeWidth={0.8} fill="none" opacity={0.3} />
      {/* 수평 2줄 (괘) */}
      <Rect x={12} y={19} width={24} height={3} rx={1.5} fill={color} />
      <Rect x={12} y={26} width={24} height={3} rx={1.5} fill={color} />
    </Svg>
  );
}

// ⊞ 셋째 엠블럼 (ㄹ) — 격자 십자, 태극기 곤괘 연상
export function EmblemRieul2({ size = 48, color = ARIRANG_RED }: EmblemProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* 외곽 원 */}
      <Circle cx={24} cy={24} r={21} stroke={color} strokeWidth={2.5} fill="none" />
      {/* 내부 링 */}
      <Circle cx={24} cy={24} r={16} stroke={color} strokeWidth={0.8} fill="none" opacity={0.3} />
      {/* 수평선 */}
      <Rect x={12} y={22.5} width={24} height={3} rx={1.5} fill={color} />
      {/* 수직선 */}
      <Rect x={22.5} y={12} width={3} height={24} rx={1.5} fill={color} />
    </Svg>
  );
}

// ⚠️ 수정금지(승인필요) — 3엠블럼 순차 점등 애니메이션 행
interface ArirangEmblemsRowProps {
  size?: number;
  color?: string;
  delay?: number; // 전체 등장 시작 딜레이 (ms)
}

export function ArirangEmblemsRow({
  size = 48,
  color = ARIRANG_RED,
  delay = 0,
}: ArirangEmblemsRowProps) {
  // 각 엠블럼 스케일 + 글로우
  const scale1 = useSharedValue(0);
  const scale2 = useSharedValue(0);
  const scale3 = useSharedValue(0);
  const glow1 = useSharedValue(0);
  const glow2 = useSharedValue(0);
  const glow3 = useSharedValue(0);

  useEffect(() => {
    // 순차 등장 (0.3초 간격, spring)
    scale1.value = withDelay(delay, withSpring(1, { damping: 15, stiffness: 150 }));
    scale2.value = withDelay(delay + 300, withSpring(1, { damping: 15, stiffness: 150 }));
    scale3.value = withDelay(delay + 600, withSpring(1, { damping: 15, stiffness: 150 }));

    // 글로우 펄스 (등장 후 한번 빛나고 은은하게 유지)
    glow1.value = withDelay(
      delay + 200,
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 600 }),
        withRepeat(withSequence(withTiming(0.5, { duration: 2000 }), withTiming(0.3, { duration: 2000 })), -1)
      )
    );
    glow2.value = withDelay(
      delay + 500,
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 600 }),
        withRepeat(withSequence(withTiming(0.5, { duration: 2000 }), withTiming(0.3, { duration: 2000 })), -1)
      )
    );
    glow3.value = withDelay(
      delay + 800,
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 600 }),
        withRepeat(withSequence(withTiming(0.5, { duration: 2000 }), withTiming(0.3, { duration: 2000 })), -1)
      )
    );
  }, []);

  const style1 = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    shadowOpacity: glow1.value,
  }));
  const style2 = useAnimatedStyle(() => ({
    transform: [{ scale: scale2.value }],
    shadowOpacity: glow2.value,
  }));
  const style3 = useAnimatedStyle(() => ({
    transform: [{ scale: scale3.value }],
    shadowOpacity: glow3.value,
  }));

  const glowShadow = {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 8,
  };

  return (
    <View style={styles.row}>
      <AnimatedView style={[styles.emblemWrap, glowShadow, style1]}>
        <EmblemIeung size={size} color={color} />
      </AnimatedView>
      <AnimatedView style={[styles.emblemWrap, glowShadow, style2]}>
        <EmblemRieul1 size={size} color={color} />
      </AnimatedView>
      <AnimatedView style={[styles.emblemWrap, glowShadow, style3]}>
        <EmblemRieul2 size={size} color={color} />
      </AnimatedView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  emblemWrap: {
    borderRadius: 999,
  },
});
