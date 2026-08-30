import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/components/Icon";
import { Fonts, BorderRadius, Shadows } from "@/constants/theme";

const BEAM_WIDTH = 34;
const BEAM_COLORS = [
  "transparent",
  "rgba(147, 51, 234, 0.18)",
  "rgba(255, 255, 255, 0.7)",
  "rgba(192, 132, 252, 0.28)",
  "transparent",
] as const;
// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = "이 앱의 꽃" = 세로형(슬롯 오디오가이드)만 실제
export const GLOSS_COLORS = [
  "rgba(255,255,255,0.55)",
  "rgba(255,255,255,0)",
] as const;
const RIM_SHADE_COLORS = ["rgba(0,0,0,0)", "rgba(0,0,0,0.18)"] as const;

function splitLabelForColumn(label: string): [string, string] {
  const spaceIdx = label.indexOf(" ");
  if (spaceIdx > 0) {
    return [label.slice(0, spaceIdx), label.slice(spaceIdx + 1)];
  }
  const mid = Math.ceil(label.length / 2);
  return [label.slice(0, mid), label.slice(mid)];
}

interface Props {
  icon: string; // Icon 이름(kebab-case)
  label: string; // ⚠️ §23 = 아이콘 + 짧은 명사 1개만("영상"·"해설"·"코스"). 설명형 금지
  colors: readonly [string, string]; // 알약 배경 그라데이션 2색
  visible: boolean;
  delay?: number; // 빛줄기 시작 시차(ms) = 셋이 동시에 번쩍이지 않게. 배지 1개짜리 자리는 안 넘긴다
  onPress(): void;
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 슬롯카드 좁은 폭 전용 세로형(아이콘 위 + 글자 아래,
  layout?: "row" | "column";
  width?: number; // column일 때 고정 폭(호출부가 지정, 예: 슬롯 썸네일과 동일값)
}

export default function CityBadge({
  icon,
  label,
  colors,
  visible,
  delay = 0,
  onPress,
  layout = "row",
  width,
}: Props) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const [pillWidth, setPillWidth] = useState(0);

  useEffect(() => {
    if (!visible) return; // 숨긴 배지는 애니메이션도 안 돌린다(헛도는 타이머 0)
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      if (!active) return;
      shimmer.setValue(0);
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => {
        if (active && finished) timer = setTimeout(run, 1600);
      });
    };

    timer = setTimeout(run, delay);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [shimmer, visible, delay]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-BEAM_WIDTH, (pillWidth || 72) + BEAM_WIDTH],
  });

  const isColumn = layout === "column";
  const [labelLine1, labelLine2] = isColumn
    ? splitLabelForColumn(label)
    : [label, ""];

  const pressable = (
    <Pressable
      style={({ pressed }) => [
        styles.badge,
        isColumn && styles.badgeColumn,
        isColumn && width ? { width } : null,
        // 실제 버튼처럼 눌리는 느낌(2026-08-16 사장님 승인 = "이 앱의 꽃"급 = 세로형 전용).
        isColumn && pressed && styles.badgePressed,
        !visible && styles.hidden,
      ]}
      onPress={onPress}
      disabled={!visible}
      hitSlop={8}
      onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 유리광택(위 밝음) + 림쉐이드(아래 어둠) = 볼록한 3D 단추 느낌(세로형 전용, 아래 §16 근거 참조). */}
      {isColumn && (
        <>
          <LinearGradient
            colors={GLOSS_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.65 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <LinearGradient
            colors={RIM_SHADE_COLORS}
            start={{ x: 0, y: 0.6 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </>
      )}

      {/* 빛줄기 = 아이콘·글자보다 먼저 그려 아래로 지나간다(원본 배너와 같은 겹침 순서) */}
      {visible && (
        <Animated.View
          style={[
            styles.beam,
            { transform: [{ translateX }, { skewX: "-25deg" }] },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={BEAM_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      <View style={[styles.content, isColumn && styles.contentColumn]}>
        <Icon name={icon} size={isColumn ? 14 : 12} color="#FFFFFF" />
        {isColumn ? (
          <>
            <Text style={styles.textColumn}>{labelLine1}</Text>
            <Text style={[styles.textColumn, styles.textColumnLine2]}>
              {labelLine2}
            </Text>
          </>
        ) : (
          <Text style={styles.text}>{label}</Text>
        )}
      </View>
    </Pressable>
  );

  if (!isColumn) return pressable;
  return (
    <View
      style={[
        styles.badge3dShadow,
        width ? { width } : null,
        !visible && styles.hidden,
      ]}
    >
      {pressable}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    overflow: "hidden", // 빛줄기가 알약 밖으로 새지 않게
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 세로형 전용 여백(좁은 고정폭 안에 아이콘+2줄
  badgeColumn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 눌렀을 때 살짝 오그라듦 = 실제 단추가 눌리는 느낌.
  badgePressed: { transform: [{ scale: 0.93 }] },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = "이 앱의 꽃" = 최대한 둥글게 + 3D 두께감
  badge3dShadow: {
    borderRadius: BorderRadius.full,
    ...Shadows.elevated,
  },
  hidden: { opacity: 0 },
  beam: {
    position: "absolute",
    top: -8,
    bottom: -8,
    width: BEAM_WIDTH,
  },
  content: { flexDirection: "row", alignItems: "center", gap: 4 },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 아이콘 위 + 글자 아래(정확히 2줄 강제분리,
  contentColumn: { flexDirection: "column", alignItems: "center", gap: 1 },
  text: { color: "#FFFFFF", fontSize: 11, fontFamily: Fonts.bold },
  textColumn: {
    fontSize: 9,
    lineHeight: 11,
    textAlign: "center",
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
  },
  textColumnLine2: { marginTop: -1 },
});
