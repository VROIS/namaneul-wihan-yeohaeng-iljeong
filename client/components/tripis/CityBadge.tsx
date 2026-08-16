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
import { Fonts, BorderRadius, Shadows } from "@/constants/theme";

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
// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = "이 앱의 꽃" = 세로형(슬롯 오디오가이드)만 실제
//   버튼처럼 두께감(3D) 부여. 위 유리광택(흰빛 위→아래) + 아래 림쉐이드(어둠 아래) = 볼록한 단추 느낌.
//   export = PlaceSlotCard.tsx의 번호원도 같은 유리광택 재사용(§16, 판단3종 simplify 지적 반영
//   2026-08-16 = 값만 다른 인라인 중복 제거).
export const GLOSS_COLORS = [
  "rgba(255,255,255,0.55)",
  "rgba(255,255,255,0)",
] as const;
const RIM_SHADE_COLORS = ["rgba(0,0,0,0)", "rgba(0,0,0,0.18)"] as const;

// 라벨을 항상 정확히 2줄로 강제분리(세로형 전용) = 공백 유무와 무관하게 언어중립.
//   공백 있으면 그 지점에서(예: "Audio guide"→"Audio"/"guide"), 없으면 글자수 절반 지점에서
//   (예: "Audioguide"→"Audio"/"guide", "Audioguía"→"Audi"/"oguía") = 브라우저 자동줄바꿈에
//   의존하지 않음(공백 없는 언어 = 프랑스어·독일어·스페인어에서 옆으로 삐져나오던 문제 실증 해결).
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
  // false = 그 자산이 아직 없음 → 보이지도 눌리지도 않지만 **자리는 그대로 차지**한다.
  //   = 배지 줄 높이·다음 배지 위치가 흔들리지 않는다. 업로드되면 바로 그 자리에 켜진다.
  visible: boolean;
  delay?: number; // 빛줄기 시작 시차(ms) = 셋이 동시에 번쩍이지 않게. 배지 1개짜리 자리는 안 넘긴다
  onPress(): void;
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 슬롯카드 좁은 폭 전용 세로형(아이콘 위 + 글자 아래,
  //   단어 사이 공백에서 자동 줄바꿈 = 언어별 수동분리 불필요). 샤이니·그라데이션·폰트는 그대로 유지,
  //   배치만 세로로. 기본값 row = 도시카드 3배지 가로줄(기존 사용처) 무영향(§16).
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

  // 세로형만 = 그림자를 담는 바깥 View(내부 Pressable은 overflow:hidden이라 그 위에 그림자를 직접
  // 얹으면 iOS에서 잘려 안 보임 = 표준 RN 카드-그림자 패턴 = 바깥(그림자 전용, clip 없음) + 안(clip)).
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
  // 알약 치수 = 옛 배지와 동일(패딩 10/5 · 완전 둥근 모서리) = 카드 레이아웃 불변
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    overflow: "hidden", // 빛줄기가 알약 밖으로 새지 않게
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 세로형 전용 여백(좁은 고정폭 안에 아이콘+2줄
  //   글자를 담기 위해 좌우패딩 축소).
  badgeColumn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 눌렀을 때 살짝 오그라듦 = 실제 단추가 눌리는 느낌.
  badgePressed: { transform: [{ scale: 0.93 }] },
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = "이 앱의 꽃" = 최대한 둥글게 + 3D 두께감
  //   (theme.ts Shadows.elevated 재사용 §16, 새 그림자값 발명 금지). Pressable(badge)은
  //   overflow:hidden이라 그림자를 못 얹어 이 바깥 View가 그림자 전담.
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
  //   위 splitLabelForColumn 근거).
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
