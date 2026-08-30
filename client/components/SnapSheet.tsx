// ⚠️ 사장님 SSOT 2026-07-14 = 배경(여정)을 보면서 쓰는 드래그 스냅 바텀시트 = 오버레이가 배경 가리는 결함 해결.
import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Platform,
  useColorScheme,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Colors, Spacing, BorderRadius, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";

const SPRING = { damping: 20, stiffness: 220, mass: 0.6 };

interface SnapSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // ⚠️ 2026-08-07 사장님 SSOT = 제목 자리를 대신 채우는 요소(전문가 답변함 = 본인 프로필 사진).
  headerLeft?: React.ReactNode;
  fullRatio?: number;
  peekHeight?: number; // peek 상태에서 화면에 보이는 시트 높이(px). 기본 90.
}

export default function SnapSheet({
  visible,
  onClose,
  title,
  children,
  headerLeft,
  fullRatio = 0.9,
  peekHeight = 90,
}: SnapSheetProps) {
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { t } = useTranslation();

  // ⚠️ 사장님 SSOT 2026-07-14 = 시트 상단(top) = translateY 위치. 시트는 그 지점부터 화면 하단까지 = 스냅마다 시트 높이가 달라짐 = 본문 ScrollView(flex:1)가 그 높이에 맞춰 스크롤됨(half 에서 넘치면 스크롤 O).
  const TOP_MARGIN = Math.round(winH * (1 - fullRatio)); // full 일 때 시트 top(상단 여백). fullRatio 0.9 → 상단 10% 는 배경.
  const FULL_Y = TOP_MARGIN;
  const HALF_Y = Math.round(winH * 0.5); // 화면 절반부터 시트 = 상단 절반은 배경 여정(지도 등).
  const PEEK_Y = winH - peekHeight; // 하단에 peekHeight 만 시트.
  const CLOSED_Y = winH; // 완전 숨김.
  const sheetH = winH; // 최대 높이(top 으로 잘라서 실제 노출량 결정).

  const translateY = useSharedValue(CLOSED_Y);
  const startY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(visible ? HALF_Y : CLOSED_Y, SPRING);
  }, [visible]);

  const snapTo = (target: number) => {
    "worklet";
    if (target >= CLOSED_Y - 1) {
      translateY.value = withTiming(CLOSED_Y, { duration: 180 }, () => {
        runOnJS(onClose)();
      });
    } else {
      translateY.value = withSpring(target, SPRING);
    }
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = startY.value + e.translationY;
      translateY.value = Math.max(FULL_Y, Math.min(CLOSED_Y, next));
    })
    .onEnd((e) => {
      const y = translateY.value;
      const v = e.velocityY;
      // ⚠️ 사장님 SSOT 2026-07-14 = 스냅 4지점(full/half/peek/닫힘) 중 최근접. 빠른 위=full, 빠른 아래=peek/닫힘. 맨아래 근처 아래로 던지면 닫힘.
      if (v < -900) {
        snapTo(y > HALF_Y ? HALF_Y : FULL_Y);
        return;
      } // 빠르게 위로 = 한 단계 위(half or full).
      if (v > 900) {
        if (y > PEEK_Y - 10) snapTo(CLOSED_Y);
        else if (y > HALF_Y) snapTo(PEEK_Y);
        else snapTo(HALF_Y);
        return;
      }
      const points = [FULL_Y, HALF_Y, PEEK_Y, CLOSED_Y];
      let best = points[0];
      for (const p of points)
        if (Math.abs(y - p) < Math.abs(y - best)) best = p;
      snapTo(best);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    top: translateY.value,
  }));

  // ⚠️ 사장님 SSOT 2026-07-14 = dim = full(0)일 때만 진하게(0.35) → half(HALF_Y)부터는 0(배경 여정 다 보임). half·peek = 배경 터치 통과.
  const dimStyle = useAnimatedStyle(() => {
    const o = interpolate(
      translateY.value,
      [FULL_Y, HALF_Y],
      [0.35, 0],
      Extrapolation.CLAMP,
    );
    return { opacity: o };
  });

  const [dimTouchable, setDimTouchable] = React.useState(false);
  useAnimatedReaction(
    () => translateY.value,
    (y) => {
      const touchable = y < HALF_Y * 0.5; // full~half 중간보다 위일 때만 배경 막음.
      runOnJS(setDimTouchable)(touchable);
    },
    [HALF_Y],
  );

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* dim = full 일 때만 배경 가림. 탭하면 peek 로 내림(완전 닫힘 아님 = 사장님 SSOT). peek/닫힘이면 pointerEvents none 으로 배경 터치 통과. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
        pointerEvents={dimTouchable ? "auto" : "none"}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            translateY.value = withSpring(HALF_Y, SPRING);
          }}
        />
      </Animated.View>

      {/* 시트 = top(애니메이션) ~ 화면 하단(bottom:0). 스냅마다 높이 달라짐 = 본문 ScrollView 가 그 높이에 맞춰 스크롤. */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.backgroundRoot,
            paddingBottom: insets.bottom + Spacing.md,
          },
          sheetStyle,
        ]}
      >
        {/* 헤더(드래그 핸들 + 제목 + X). 헤더 전체가 드래그 영역 + 탭하면 full 로. */}
        <GestureDetector gesture={pan}>
          <View style={styles.header}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <View style={styles.headerRow}>
              {/* 헤더 빈 영역 탭 = 시트 전체 펼치기(옛 동작 보존). headerLeft(사진)를 넘겨도
                  펼치기 수단이 사라지지 않게 **바깥은 항상 Pressable** = §22 판단검증 지적 2026-08-07.
                  사진 자체의 터치(프로필 편집)는 안쪽 요소가 먼저 받는다. */}
              <Pressable
                onPress={() => {
                  translateY.value = withSpring(FULL_Y, SPRING);
                }}
                style={styles.headerTapArea}
                accessibilityLabel={title}
              >
                {headerLeft ?? (
                  <Text style={[styles.title, { color: theme.text }]}>
                    {title}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
              >
                <Icon name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
          </View>
        </GestureDetector>

        {/* 본문 */}
        <View style={styles.body}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: "#000" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden", // 본문이 시트 높이 넘으면 클립 → 내부 ScrollView 가 스크롤(사장님 SSOT 2026-07-14).
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    ...Platform.select({
      web: { boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 12,
      },
    }),
  },
  header: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTapArea: { flex: 1, alignItems: "center", paddingVertical: 4 },
  title: { fontSize: 16, fontFamily: Fonts.bold, letterSpacing: -0.3 },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    right: 0,
  },
  body: { flex: 1 },
});
