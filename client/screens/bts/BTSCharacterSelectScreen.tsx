// ⚠️ 수정금지(승인필요) — BTS 캐릭터 선택 (2026-08-08 사장님 확정 = 원통 룰렛)
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  StatusBar,
} from "react-native";
// ⚠️ 수정금지(승인필요) — 2026-04-21 expo-image로 교체: react-native Image는 newArchEnabled + Android Fresco 조합에서 일부 URL 로드 실패. DestinationDetailScreen 이 검증된 루트
import { Image } from "expo-image";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  BTS_CHARACTERS,
  BTS_CHARACTER_IMAGES,
  type BTSCharacter,
} from "@/constants/bts-characters";
import { useBTS } from "@/contexts/BTSContext";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";
import MainAppBottomTabBar from "@/components/MainAppBottomTabBar";

// ⚠️ 수정금지(승인필요) — Haptics 유틸
const haptic = (t: "light" | "medium" | "success") => {
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — 레이아웃 상수 (사용자 지시 반영)
const TITLE_TOP_OFFSET = 56; // status bar로부터 타이틀까지 여백
const TITLE_HEIGHT = 76; // 30pt × 2줄 × lineHeight 1.27
const TAB_BAR_HEIGHT = 52; // MainAppBottomTabBar.tsx:226 = 화면 아래에 겹쳐 붙는 높이
// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 — 남는 칸을 위:아래 = **50:50**(고정 px 아님).
const RING_TOP_RATIO = 0.5;

const COUNT = BTS_CHARACTERS.length;
const SLICE = (Math.PI * 2) / COUNT; // 카드 한 칸이 차지하는 각도

// ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 읽어주는 기능에게 원통은 **하나의 돌리는 조작기**다.
const RING_ACTIONS = [
  { name: "increment" as const },
  { name: "decrement" as const },
  { name: "activate" as const },
];

// ⚠️ 수정금지(승인필요) — 원통 다이얼 (사장님이 값으로 조절하는 자리)
const SPIN_DEG_PER_SEC = 15; // 저절로 도는 속도 = 카드 한 장에 3.4초(아주 천천히, 사장님 지시)
const TILT_DEG = -8; // 링 전체를 앞으로 살짝 눕힌 각도(카메라 각도)
// ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 — 깊이감은 **반지름의 배수**로 잡는다(고정값 금지).
const PERSPECTIVE_RATIO = 2.65;
const RING_GAP = 1.12; // 카드 사이 벌림
const BACK_DIM = 0.62; // 뒤로 돌아간 면이 어두워지는 최대치
const DRAG_SENS = 0.006; // 손가락 1px 당 도는 라디안

// ⚠️ 수정금지(승인필요) — 크기·자리 계산 (2026-08-08 사장님 확정 = 9:16 세로 카드 + 위로 붙임)
function useRingLayout(insetTop: number, insetBottom: number) {
  const { width: sw, height: sh } = useWindowDimensions();
  return useMemo(() => {
    const band =
      sh -
      (insetTop + TITLE_TOP_OFFSET + TITLE_HEIGHT) -
      (TAB_BAR_HEIGHT + insetBottom);
    let w = Math.max(Math.round(Math.min(sw, sh) * 0.54), 160);
    let h = Math.round((w * 16) / 9);
    const maxH = Math.round(band * 0.86); // 위아래 숨 쉴 자리 14% 는 남긴다
    if (h > maxH) {
      h = Math.max(maxH, 220);
      w = Math.round((h * 9) / 16);
    }
    const radius = (w * RING_GAP) / (2 * Math.tan(Math.PI / COUNT));
    const tiltRad = Math.abs(TILT_DEG) * (Math.PI / 180);
    const tiltDrop = Math.round(radius * Math.sin(tiltRad));
    const topGap = Math.max(
      Math.round((band - h) * RING_TOP_RATIO) - tiltDrop,
      8,
    );
    // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **앞 카드가 실제로 그려지는 네모**를 여기서 같이 낸다.
    const persp = radius * PERSPECTIVE_RATIO;
    const kFront = (persp - radius) / (persp - radius * Math.cos(tiltRad));
    const halfH = (h / 2) * kFront;
    const halfW = (w / 2) * kFront;
    const yEdge = halfH * Math.cos(tiltRad); // rotateX 뒤 세로 거리
    const zEdge = halfH * Math.sin(tiltRad); // 윗변 = +앞으로 / 아랫변 = -뒤로
    const dropY = tiltDrop * kFront; // 링을 눕혀 내려간 양
    const magTop = persp / (persp - zEdge); // 앞으로 나온 만큼 커짐
    const magBot = persp / (persp + zEdge); // 뒤로 물러난 만큼 작아짐
    const topY = (-yEdge + dropY) * magTop;
    const botY = (yEdge + dropY) * magBot;
    const frontRect = {
      cx: sw / 2,
      cy: topGap + h / 2 + (topY + botY) / 2,
      w: halfW * (magTop + magBot),
      h: botY - topY,
    };
    return { cardW: w, cardH: h, radius, topGap, frontRect };
  }, [sw, sh, insetTop, insetBottom]);
}

// ⚠️ 수정금지(승인필요) — 카드 1장 = 원기둥 옆면의 한 조각
const RingCard = React.memo(function RingCard({
  character,
  index,
  rot,
  cardW,
  cardH,
  radius,
  zIndex,
}: {
  character: BTSCharacter;
  index: number;
  rot: SharedValue<number>;
  cardW: number;
  cardH: number;
  radius: number;
  zIndex: number;
}) {
  const cardStyle = useAnimatedStyle(() => {
    const a = rot.value + index * SLICE; // 이 카드가 지금 서 있는 각도(0 = 정면)
    const tilt = (TILT_DEG * Math.PI) / 180;
    const x = Math.sin(a) * radius;
    const zRaw = Math.cos(a) * radius;
    const y = -zRaw * Math.sin(tilt);
    const z = zRaw * Math.cos(tilt);
    const persp = radius * PERSPECTIVE_RATIO;
    const k = (persp - radius) / (persp - z);
    return {
      transform: [
        { perspective: persp },
        { translateX: x * k },
        { translateY: y * k },
        { rotateX: `${TILT_DEG}deg` },
        { rotateY: `${(a * 180) / Math.PI}deg` },
        { scale: k },
      ],
    };
  }, [index, radius]);

  const dimStyle = useAnimatedStyle(() => {
    const z = Math.cos(rot.value + index * SLICE);
    return {
      opacity: interpolate(
        z,
        [-1, 0, 1],
        [BACK_DIM, BACK_DIM * 0.6, 0],
        Extrapolation.CLAMP,
      ),
    };
  }, [index]);

  const nameEnFontSize = Math.round(cardW * 0.105);
  const archetypeFontSize = Math.round(cardW * 0.082);

  return (
    <Animated.View
      // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 승인 = **소리로 읽어주는 기능(보이스오버·톡백) 대응.**
      style={[
        {
          position: "absolute",
          width: cardW,
          height: cardH,
          borderRadius: 28,
          overflow: "hidden",
          zIndex,
          backgroundColor: "#111",
        },
        cardStyle,
      ]}
    >
      {/* 캐릭터 전신 (9:16 이라 자르지 않고 그대로 들어간다) */}
      <Image
        source={BTS_CHARACTER_IMAGES[character.id]}
        style={{ width: cardW, height: cardH }}
        contentFit="cover"
      />

      {/* 뒤로 돌아간 면이 어두워지는 막 */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "#0A0A0A" },
          dimStyle,
        ]}
      />

      {/* ⚠️ 수정금지(승인필요) — 텍스트 오버레이 (캐릭터 위 하단, 프로포셔널) */}
      {/* ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = archetype(한국어) → archetypeEn 전환.
          nameEn 처럼 언어 무관 고정 영문 표기(브랜드성 아키타입명) = 7개국어 신규번역 대신 기존 필드 재사용(§16). */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: "7%",
          left: 0,
          right: 0,
          alignItems: "center",
          paddingHorizontal: cardW * 0.08,
        }}
      >
        <Text
          numberOfLines={1}
          style={[styles.floatingNameEn, { fontSize: nameEnFontSize }]}
        >
          {character.nameEn}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.floatingArchetype, { fontSize: archetypeFontSize }]}
        >
          {character.archetypeEn}
        </Text>
      </View>
    </Animated.View>
  );
});

// ⚠️ 수정금지(승인필요) — 메인 화면
export default function BTSCharacterSelectScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const { setSelectedCharacter } = useBTS();
  const insets = useSafeAreaInsets();
  const { cardW, cardH, radius, topGap, frontRect } = useRingLayout(
    insets.top,
    insets.bottom,
  );

  const rot = useSharedValue(0); // 링 전체 회전(라디안). 0 = 0번 캐릭터가 정면
  const dragStart = useSharedValue(0);
  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 처음은 **안 도는 상태**로 둔다.
  const spinning = useSharedValue(false);
  const settledOnTouch = useSharedValue(false);

  const [front, setFront] = useState(0); // 지금 앞에 선 카드
  const frontRef = useRef(0);
  frontRef.current = front;

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 승인 = **"동작 줄이기"를 켠 분에게는 안 돈다.**
  const reduceMotion = useReducedMotion();

  const spin = useFrameCallback((f) => {
    "worklet";
    if (!spinning.value) return;
    const ms = f.timeSincePreviousFrame;
    const dt = Math.min(typeof ms === "number" && ms > 0 ? ms : 16, 40) / 1000;
    rot.value += ((SPIN_DEG_PER_SEC * Math.PI) / 180) * dt;
  }, false);
  // ⚠️ 수정금지(승인필요) 2026-08-08 = 이 통은 **useFocusEffect 의 조건에 넣지 않는다.**
  const spinRef = useRef(spin);
  spinRef.current = spin;

  useAnimatedReaction(
    () => {
      const t = -rot.value / SLICE;
      const i = Math.round(t) % COUNT;
      return i < 0 ? i + COUNT : i;
    },
    (cur, prev) => {
      if (cur !== prev) runOnJS(setFront)(cur);
    },
    [],
  );

  // ⚠️ 수정금지(승인필요) — 앞칸에 딱 맞춰 세운다(= 카드가 비스듬히 선 채로 멈추지 않게)
  const snapToSlot = useCallback(() => {
    "worklet";
    const slot = Math.round(rot.value / SLICE) * SLICE;
    rot.value = withTiming(slot, { duration: 420 });
  }, [rot]);

  // ⚠️ 수정금지(승인필요) — 멈춤은 **두 단계**로 나눈다.
  const afterStop = useCallback(() => {
    spinRef.current.setActive(false);
    haptic("medium");
  }, []);

  const confirmNow = useCallback(() => {
    haptic("success");
    setSelectedCharacter(BTS_CHARACTERS[frontRef.current]);
    navigation.navigate("BTSPlaceCart");
  }, [navigation, setSelectedCharacter]);

  // ⚠️ 수정금지(승인필요) — **멈추는 길은 하나다 = pan.onBegin.**
  const haltAndSnap = useCallback(() => {
    "worklet";
    const nearest = Math.round(rot.value / SLICE) * SLICE;
    settledOnTouch.value =
      !spinning.value && Math.abs(rot.value - nearest) < 0.01;
    if (spinning.value) {
      spinning.value = false;
      runOnJS(afterStop)();
    }
    snapToSlot();
  }, [rot, spinning, settledOnTouch, afterStop, snapToSlot]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          "worklet";
          haltAndSnap();
        })
        // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 끌기 시작점은 **onStart(손가락이 실제로 움직인 뒤)** 에서 읽는다.
        .onStart(() => {
          "worklet";
          dragStart.value = rot.value;
        })
        .onUpdate((e) => {
          "worklet";
          rot.value = dragStart.value + e.translationX * DRAG_SENS;
        })
        .onEnd((e) => {
          "worklet";
          rot.value = withDecay(
            { velocity: e.velocityX * DRAG_SENS, deceleration: 0.996 },
            (done) => {
              if (done) snapToSlot();
            },
          );
        }),
    [dragStart, rot, snapToSlot, haltAndSnap],
  );

  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **멈추는 판은 칸 전체 / 확정은 앞 카드 네모 안에서만.**
  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        "worklet";
        if (!settledOnTouch.value) return; // 돌던 중·미끄러지던 중 = 세우기만 했다
        if (Math.abs(e.x - frontRect.cx) > frontRect.w / 2) return;
        if (Math.abs(e.y - frontRect.cy) > frontRect.h / 2) return;
        runOnJS(confirmNow)();
      }),
    [confirmNow, settledOnTouch, frontRect],
  );

  const gesture = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

  // ⚠️ 수정금지(승인필요) — 들어올 때마다 처음 상태(= 다시 돈다). 장소 화면에서 돌아와도 같다.
  useFocusEffect(
    useCallback(() => {
      rot.value = 0;
      setFront(0);
      // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 승인 = **소리로 읽어주는 기능이 켜져 있으면 안 돈다.**
      //   ⚠️⚠️ 미검증 = 실기기 확인 필요 (2026-08-08, 판단3종 6차 지적 · 사장님 승인으로 열어둠)
      let alive = true;
      if (!reduceMotion) {
        spinning.value = true;
        spinRef.current.setActive(true);
      }
      if (Platform.OS !== "web") {
        AccessibilityInfo.isScreenReaderEnabled()
          .then((on) => {
            if (!alive || !on) return;
            spinning.value = false;
            spinRef.current.setActive(false);
          })
          .catch(() => {});
      }
      return () => {
        alive = false;
        spinning.value = false;
        spinRef.current.setActive(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reduceMotion]),
  );

  // ⚠️ 수정금지(승인필요) 2026-08-08 = 읽어주는 기능의 위·아래 쓸기로 한 칸씩 돌린다.
  const onRingAction = useCallback(
    (e: { nativeEvent: { actionName: string } }) => {
      const name = e.nativeEvent.actionName;
      if (name === "activate") {
        confirmNow();
        return;
      }
      const dir = name === "increment" ? 1 : name === "decrement" ? -1 : 0;
      if (!dir) return;
      const slot = Math.round(rot.value / SLICE) * SLICE;
      rot.value = withTiming(slot - dir * SLICE, { duration: 260 });
    },
    [confirmNow, rot],
  );

  const zOf = (i: number) => {
    const d = Math.abs(i - front);
    return 20 - Math.min(d, COUNT - d);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ⚠️ 수정금지(승인필요) — 타이틀: fontSize 30, 상단 여백 확보 */}
      {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 5a: 전세계 BTS ARMY 고려 영어 문구. 캐릭터 한/영 병기라 이 화면은 토글 불필요. */}
      <View style={[styles.titleWrap, { top: insets.top + TITLE_TOP_OFFSET }]}>
        <Text style={styles.titleLine}>Who&apos;s your</Text>
        <Text style={styles.titleLine}>travel companion?</Text>
      </View>

      {/* ⚠️ 수정금지(승인필요) — 원통 자리: 타이틀 아래 · 탭바 위 남는 칸의 한가운데 */}
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + TITLE_TOP_OFFSET + TITLE_HEIGHT,
          paddingBottom: TAB_BAR_HEIGHT + insets.bottom,
        }}
      >
        <GestureDetector gesture={gesture}>
          {/* ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 — 읽어주는 기능에게 이 원통은 **조작기 하나**다.
              위·아래 쓸기 = 이전·다음 캐릭터 / 두 번 두드리기 = 확정.
              카드마다 꼬리표를 달던 옛 방식은 회전이 멈춘 상태에서 **7명 중 1명밖에 못 고르게** 만들었다.
              ⚠️ 화면에는 아무 변화도 없다 = 일반 사용자의 눈·손에는 그대로다. */}
          <View
            accessible
            accessibilityRole="adjustable"
            /** ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 읽어주는 문구도 **영어**다. */
            accessibilityLabel="Choose your travel companion"
            /** ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 아이폰은 쓸고 난 뒤 **값(Value)만** 다시 읽는다. */
            accessibilityValue={{
              min: 1,
              max: COUNT,
              now: front + 1,
              text: `${BTS_CHARACTERS[front].nameEn}, ${front + 1} of ${COUNT}`,
            }}
            accessibilityHint="Swipe up or down to change, double tap to choose"
            accessibilityActions={RING_ACTIONS}
            onAccessibilityAction={onRingAction}
            /** ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 손가락을 받는 판 = **칸 전체**(flex:1). */
            style={{ flex: 1 }}
          >
            {/* 원통이 서는 자리 = 옛 바깥 여백(topGap)을 여기로 옮겼다 = 그림은 1px 도 안 변한다.
                pointerEvents="none" = 카드는 손가락을 가로채지 않고 위 판이 다 받는다. */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: topGap,
                height: cardH,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {BTS_CHARACTERS.map((char, i) => (
                <RingCard
                  key={char.id}
                  character={char}
                  index={i}
                  rot={rot}
                  cardW={cardW}
                  cardH={cardH}
                  radius={radius}
                  zIndex={zOf(i)}
                />
              ))}
            </View>
          </View>
        </GestureDetector>
      </View>

      {/* 📌 메인앱 5단 하단 탭바 고정 부착 */}
      <MainAppBottomTabBar activeTab="BTS" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  // ⚠️ 수정금지(승인필요) — 타이틀: 절대 위치, 상단 여백 +56 (사용자 지시)
  titleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  titleLine: {
    fontSize: 30,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    color: "#1A1A1A",
    textAlign: "center",
    lineHeight: 38,
    letterSpacing: 0.3,
  },
  // ⚠️ 수정금지(승인필요) — 텍스트 오버레이 (프로포셔널 폰트, textShadow 강화)
  floatingNameEn: {
    color: "#FFFFFF",
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  floatingArchetype: {
    marginTop: 2,
    color: "#FFFFFF",
    fontFamily: "Pretendard-Bold",
    opacity: 0.95,
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
});
