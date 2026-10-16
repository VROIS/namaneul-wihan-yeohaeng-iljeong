// ⚠️ 수정금지(승인필요) — C안: 빛 파티클 이펙트 (아미봄 풀 점등 시 발산)
import React, { useMemo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 파티클 설정
const PARTICLE_COUNT = 16;
const BORAHAE = "#6C2DC7";
const CENTER_X = SCREEN_W / 2;
const CENTER_Y = SCREEN_H / 2;

interface LightParticlesProps {
  trigger: SharedValue<number>;
}

// ⚠️ 수정금지(승인필요) — 개별 파티클 컴포넌트 (GPU 가속: transform + opacity만 사용)
function Particle({
  trigger,
  targetX,
  targetY,
  delay,
  size,
  color,
}: {
  trigger: SharedValue<number>;
  targetX: number;
  targetY: number;
  delay: number;
  size: number;
  color: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const progress = trigger.value;

    return {
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1],
            [0, targetX],
            Extrapolation.CLAMP,
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1],
            [0, targetY],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            progress,
            [0, 0.3, 0.7, 1],
            [0, 1.5, 1, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
      opacity: interpolate(
        progress,
        [0, 0.1, 0.6, 1],
        [0, 1, 0.6, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          left: CENTER_X - size / 2,
          top: CENTER_Y - size / 2,
        },
        animatedStyle,
      ]}
    />
  );
}

export function LightParticles({ trigger }: LightParticlesProps) {
  // ⚠️ 수정금지(승인필요) — 파티클 데이터 (메모이제이션)
  const particles = useMemo(() => {
    const colors = [
      "#FFFFFF",
      "#E0CFFC",
      BORAHAE,
      "#8B5CF6",
      "#C4B5FD",
      "#FFFFFF",
    ];

    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const distance = 150 + Math.random() * 200;

      return {
        id: i,
        targetX: Math.cos(angle) * distance,
        targetY: Math.sin(angle) * distance - 100,
        delay: i * 30,
        size: 3 + Math.random() * 6,
        color: colors[i % colors.length],
      };
    });
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((p) => (
        <Particle
          key={p.id}
          trigger={trigger}
          targetX={p.targetX}
          targetY={p.targetY}
          delay={p.delay}
          size={p.size}
          color={p.color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none",
  },
  particle: {
    position: "absolute",
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
});
