// ✨ 도시 카드 배지 부품 1벌 (정본 = docs/2026-07-30 도시버튼·베스트갤러리·BTS 통합.md B-0 "A. 도시 카드")
// = 영상·해설·코스 세 배지가 **이 부품 1벌만** 쓴다(§0 = 같은 기능 코드는 프로젝트 전체에서 항상 1벌).
// = 색 = 프로필 '나의 TRIPIS' 영상 카드의 3색 그대로. 값은 카드가 넘겨준다(고르는 책임 = CityCardScreen).
// = 빛줄기(샤이니) = 여정 플래너 상단 배너 client/components/ShinyPillBanner.tsx 의 shimmer 방식 재사용(§16 재발명 금지)
//   — 무한 반복 + 기울인 빔 + 선형 2200ms. 배지가 작고 셋이라 ① 시작 시차(delay) ② 사이 쉼 ③ 흰빛 약화로 은은하게.
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
import { Fonts, BorderRadius } from "@/constants/theme";

// 빛줄기 폭 = 원본(배너 75)보다 좁게. 배지 알약이 작아 그대로 쓰면 통째로 번쩍인다.
const BEAM_WIDTH = 34;
// 원본 5단 구성 그대로. 배지가 작아 흰빛만 0.95 → 0.7 로 낮춤(사장님 "은은하게, 산만하지 않게").
const BEAM_COLORS = [
  "transparent",
  "rgba(147, 51, 234, 0.18)",
  "rgba(255, 255, 255, 0.7)",
  "rgba(192, 132, 252, 0.28)",
  "transparent",
] as const;

interface Props {
  icon: string; // Icon 이름(kebab-case)
  label: string; // ⚠️ §23 = 아이콘 + 짧은 명사 1개만("영상"·"해설"·"코스"). 설명형 금지
  colors: readonly [string, string]; // 알약 배경 그라데이션 2색
  // false = 그 자산이 아직 없음 → 보이지도 눌리지도 않지만 **자리는 그대로 차지**한다.
  //   = 배지 줄 높이·다음 배지 위치가 흔들리지 않는다. 업로드되면 바로 그 자리에 켜진다.
  visible: boolean;
  delay?: number; // 빛줄기 시작 시차(ms) = 셋이 동시에 번쩍이지 않게. 배지 1개짜리 자리는 안 넘긴다
  onPress(): void;
}

export default function CityBadge({
  icon,
  label,
  colors,
  visible,
  delay = 0,
  onPress,
}: Props) {
  const shimmer = useRef(new Animated.Value(0)).current;
  // 알약 실제 폭 = 빛줄기가 지나갈 거리. 재기 전 첫 프레임은 대략값으로 시작한다.
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
        // 한 번 지나간 뒤 잠깐 쉬고 다시 = 쉼 없이 계속 흐르면 배지 3개가 산만해진다
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

  return (
    <Pressable
      style={[styles.badge, !visible && styles.hidden]}
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

      <View style={styles.content}>
        <Icon name={icon} size={12} color="#FFFFFF" />
        <Text style={styles.text}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 알약 치수 = 옛 배지와 동일(패딩 10/5 · 완전 둥근 모서리) = 카드 레이아웃 불변
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    overflow: "hidden", // 빛줄기가 알약 밖으로 새지 않게
  },
  hidden: { opacity: 0 },
  beam: {
    position: "absolute",
    top: -8,
    bottom: -8,
    width: BEAM_WIDTH,
  },
  content: { flexDirection: "row", alignItems: "center", gap: 4 },
  text: { color: "#FFFFFF", fontSize: 11, fontFamily: Fonts.bold },
});
