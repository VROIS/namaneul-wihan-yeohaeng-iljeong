// ⚠️ 수정금지(승인필요) — 전역 글라스 버튼 (shadcn LiquidButton RN 어댑트)
// REF: docs/design-references/button-system-shadcn.tsx (원본 웹 버전)
// SVG 필터/Tailwind/backdropFilter(url) 사용 불가 → BlurView + shadow + 반투명 오버레이로 시각 동등 재현
// 전역 사용처: Screen D 도시 버튼, Screen F CTA 등 (2026-04-17 도입)

import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  ViewStyle,
  TextStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";

export type LiquidButtonSize = "sm" | "md" | "lg";
export type LiquidButtonVariant = "default" | "selected";

export interface LiquidButtonProps {
  label: string;
  onPress?: () => void;
  variant?: LiquidButtonVariant;
  size?: LiquidButtonSize;
  // ⚠️ 수정금지(승인필요) — 선택 시 강조색(캐릭터 그라디언트 0번 색)
  tint?: string;
  flex?: number;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

const SIZE_MAP: Record<
  LiquidButtonSize,
  { h: number; px: number; fs: number }
> = {
  sm: { h: 28, px: 10, fs: 11 },
  md: { h: 32, px: 8, fs: 12 },
  lg: { h: 44, px: 16, fs: 14 },
};

export function LiquidButton({
  label,
  onPress,
  variant = "default",
  size = "md",
  tint = "#6C2DC7",
  flex,
  style,
  textStyle,
  disabled = false,
}: LiquidButtonProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const sz = SIZE_MAP[size];
  const isSelected = variant === "selected";

  // ⚠️ 수정금지(승인필요) — 선택/기본 상태별 스타일
  const stateStyles = useMemo(() => {
    if (isSelected) {
      return {
        borderColor: tint,
        borderWidth: 2,
        overlayBg: tint + "14", // 8% 틴트
        textColor: tint,
      };
    }
    return {
      borderColor: "rgba(255,255,255,0.55)",
      borderWidth: 1,
      overlayBg: "rgba(255,255,255,0.18)",
      textColor: "#1A1A1A",
    };
  }, [isSelected, tint]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          height: sz.h,
          flex,
          opacity: disabled ? 0.4 : 1,
        },
        animStyle,
        style,
      ]}
    >
      {/* ⚠️ 수정금지(승인필요) — 블러 글라스 레이어 (배경 투과) */}
      <BlurView
        intensity={45}
        tint="light"
        style={StyleSheet.absoluteFillObject}
      />
      {/* 반투명 오버레이 (극대 투명도) */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: stateStyles.overlayBg },
        ]}
      />
      {/* 상단 하이라이트 (유리 반사 느낌) */}
      <View style={styles.topHighlight} />
      {/* 프레스 가능한 영역 + 테두리 */}
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.96, { damping: 12, stiffness: 200 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 14, stiffness: 160 });
        }}
        {...(Platform.OS === "web"
          ? {
              onHoverIn: () => {
                scale.value = withSpring(1.03, { damping: 12, stiffness: 180 });
              },
              onHoverOut: () => {
                scale.value = withSpring(1, { damping: 14, stiffness: 160 });
              },
            }
          : {})}
        style={[
          styles.pressArea,
          {
            borderColor: stateStyles.borderColor,
            borderWidth: stateStyles.borderWidth,
            paddingHorizontal: sz.px,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { fontSize: sz.fs, color: stateStyles.textColor },
            textStyle,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ⚠️ 수정금지(승인필요) — 외곽 래퍼 (글라스 스택 컨테이너)
  wrap: {
    borderRadius: 16,
    overflow: "hidden",
    // 은은한 그림자
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    backgroundColor: "transparent",
  },
  // 상단 하이라이트 0.5px
  topHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 0.5,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  pressArea: {
    flex: 1,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontFamily: "Pretendard-Bold",
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },
});

export default LiquidButton;
