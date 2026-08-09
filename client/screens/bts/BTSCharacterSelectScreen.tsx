// ⚠️ 수정금지(승인필요) — BTS 캐릭터 선택 (2026-08-08 사장님 확정 = 원통 룰렛)
// 사양: 카드 7장이 **원기둥 옆면**에 붙어 저절로 돈다 → 화면을 **터치하면 멈춘다**
//       → 앞에 선 캐릭터를 누르면 확정. 손으로 돌리면 관성으로 더 돌다 선다.
//   옛 타원 배치 + 2단계 탭(1탭 확대 → 2탭 확정) 폐기 = 2026-08-08 §19.
//   사유: 멈춰 있는 화면은 만지라는 신호가 없었고, "두 번째 탭"은 눈에 보이지 않는 동작이라
//        글로 설명해야만 알 수 있었다. 도는 화면은 그 설명 자체를 없앤다(§23 정합).
//
// ⚠️ 왜 웹 부품을 그대로 못 쓰는가(2026-08-08 실측) =
//   웹의 원통은 3D 무대(transform-style: preserve-3d) 위에서 링을 통째로 돌린다.
//   React Native 에는 그 무대가 **없다**(StyleSheetTypes.d.ts 에 transformStyle 자체가 없음).
//   그래서 무대를 빌리지 않고 **카드마다 제 자리를 직접 계산**한다 = RN 이 주는 것만으로 만든다:
//     perspective · rotateX · rotateY (RN 지원 변환).
//   덕분에 웹·아이폰·안드로이드가 같은 그림이 된다(§11).
//   ⚠️ 뒷면은 **가리지 않는다**(backfaceVisibility 를 쓰지 않는다) = 180도 넘어간 카드가 거울처럼
//      뒤집혀 보이는 것이 의도다(원본 Round Carousel 의 "양면 카드"). 어둡게만 덮는다(BACK_DIM).
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
// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 — 원통은 타이틀 **바로 밑**에 붙는다.
//   남는 칸을 위:아래 = 15:85 로 나눈다(고정 px 아님 = 화면이 커지면 같이 커진다).
//   옛 고정 간격 100 + 가운데 정렬 폐기 = 2026-08-08 §19(원통이 화면 한가운데로 내려가 위가 텅 빔).
const RING_TOP_RATIO = 0.15;

const COUNT = BTS_CHARACTERS.length;
const SLICE = (Math.PI * 2) / COUNT; // 카드 한 칸이 차지하는 각도

// ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 읽어주는 기능에게 원통은 **하나의 돌리는 조작기**다.
//   위·아래로 쓸면 이전·다음 캐릭터(increment/decrement), 두 번 두드리면 확정(activate).
//   세 동작 다 **양쪽 폰 공통**(ViewAccessibility.d.ts:27·78 = 플랫폼 표기 없음).
//   한쪽 폰 전용(onAccessibilityTap=아이폰 :307 / importantForAccessibility=안드로이드 :268)만 쓰면
//   반대쪽이 깨진다 = 옛 방식 폐기 2026-08-08 §19.
const RING_ACTIONS = [
  { name: "increment" as const },
  { name: "decrement" as const },
  { name: "activate" as const },
];

// ⚠️ 수정금지(승인필요) — 원통 다이얼 (사장님이 값으로 조절하는 자리)
const SPIN_DEG_PER_SEC = 15; // 저절로 도는 속도 = 카드 한 장에 3.4초(아주 천천히, 사장님 지시)
const TILT_DEG = -8; // 링 전체를 앞으로 살짝 눕힌 각도(카메라 각도)
// ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 — 깊이감은 **반지름의 배수**로 잡는다(고정값 금지).
//   고정 650 이었을 때: 반지름은 화면 크기에서 나오므로 아이패드 세로(app.json:12 supportsTablet)에서
//   반지름 643 이 되어 앞 카드가 54% 로 쪼그라들고 옆 카드는 3.7% 점이 된다.
//   반지름이 깊이감을 **넘어서면 크기가 음수** = 좌우 뒤집힌 카드가 그려진다. 폰에서는 안 나타난다.
//   2.65 = 아이폰12 에서 옛 고정값 650 과 **같은 그림**이 나오는 배수(반지름 245 × 2.65 = 650, 실측).
const PERSPECTIVE_RATIO = 2.65;
const RING_GAP = 1.12; // 카드 사이 벌림
const BACK_DIM = 0.62; // 뒤로 돌아간 면이 어두워지는 최대치
const DRAG_SENS = 0.006; // 손가락 1px 당 도는 라디안

// ⚠️ 수정금지(승인필요) — 크기·자리 계산 (2026-08-08 사장님 확정 = 9:16 세로 카드 + 위로 붙임)
// 폭 0.54 = 옆 카드가 화면 안에 충분히 보이는 최대치(실측 2026-08-08 아이폰12).
//   더 키우면 원통 반지름이 커져 양옆 카드가 화면 밖으로 다 나간다.
// 높이는 폭의 16/9. 위아래로 넘치면 남는 칸에 맞춰 통째로 줄인다 = 제일 작은 화면에서도 안 넘친다.
function useRingLayout(insetTop: number, insetBottom: number) {
  const { width: sw, height: sh } = useWindowDimensions();
  return useMemo(() => {
    // 타이틀 아래 ~ 탭바 위 = 원통이 쓸 수 있는 전체 칸
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
    // 원통 반지름 = 카드 7장이 서로 안 겹치게 둘러설 수 있는 거리
    const radius = (w * RING_GAP) / (2 * Math.tan(Math.PI / COUNT));
    // 남는 칸을 비율로 나눠 원통을 타이틀 쪽으로 붙인다.
    //   ⚠️ 링을 눕히면(TILT) 앞 카드가 그만큼 아래로 내려간다 = 그 값을 빼야 눈에 보이는 간격이 비율과 맞는다
    //      (안 빼면 32px 밀린다, 실측 2026-08-08 아이폰12).
    const tiltRad = Math.abs(TILT_DEG) * (Math.PI / 180);
    const tiltDrop = Math.round(radius * Math.sin(tiltRad));
    const topGap = Math.max(
      Math.round((band - h) * RING_TOP_RATIO) - tiltDrop,
      8,
    );
    // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **앞 카드가 실제로 그려지는 네모**를 여기서 같이 낸다.
    //   근본 = 카드를 그리는 계산(RingCard 의 눕힘·원근 축소)과 손가락을 받는 판이 **따로 놀았다.**
    //   그래서 한쪽 변을 막으면 다른 변이 남는 일이 3차례 반복됐다(9·10·11차).
    //   이제 그리는 쪽과 **같은 식**으로 뽑아 한 벌만 둔다 = 눕힘 각도를 바꾸면 판도 같이 움직인다.
    //   ⚠️ 옛 방식(판 높이 = 카드 높이, 가로만 검사) 폐기 = 2026-08-08 §19 —
    //     눕힘으로 카드가 내려간 만큼 **위로 34px 빈칸 / 아래로 34px 삐져나감**이 생겨,
    //     빈칸을 눌러도 확정되고 **캐릭터 이름 글자를 눌러도 아무 반응이 없었다**(아이폰12 기준).
    //   ⚠️ 눕히면 카드는 반듯한 네모가 아니라 **사다리꼴**로 그려진다(윗변이 앞으로 나와 커지고
    //     아랫변은 뒤로 물러나 작아진다). 반듯한 네모로 어림하면 위 4px·아래 10px 이 어긋난다(실측).
    //     그래서 RingCard 와 **똑같은 차례**(scale → rotateX → translateY → 원근)로 위·아래 끝을 낸다.
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
      // 가로도 위가 넓은 사다리꼴 = 위·아래 평균으로 잡는다(네 귀퉁이 오차 4px = 눈에 안 보임)
      w: halfW * (magTop + magBot),
      h: botY - topY,
    };
    return { cardW: w, cardH: h, radius, topGap, frontRect };
  }, [sw, sh, insetTop, insetBottom]);
}

// ⚠️ 수정금지(승인필요) — 카드 1장 = 원기둥 옆면의 한 조각
// 무대가 없으므로 이 카드가 **자기 자리를 스스로 계산**한다. 계산은 회전값 하나로만 한다
// (= 손가락·룰렛을 실시간으로 따라간다. 상태를 다시 그리지 않으므로 안 끊긴다.)
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
    // 링을 눕히면 뒤쪽 카드가 위로 올라가고 깊이가 줄어든다
    const y = -zRaw * Math.sin(tilt);
    const z = zRaw * Math.cos(tilt);
    // 깊이감은 반지름에 비례 = 화면이 커져도 그림이 같다(위 PERSPECTIVE_RATIO 주석)
    const persp = radius * PERSPECTIVE_RATIO;
    // 앞에 선 카드가 정확히 1.0 이 되도록 맞춘 원근 축소
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

  // 뒤로 돌아갈수록 어두워진다(= 지금 어느 것이 앞에 걸렸는지 밝기로 보인다)
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
      //   원통은 손가락 제스처로만 도는데, 그 방식은 읽어주는 기능이 붙잡을 것이 없다.
      //   그래서 **앞에 선 카드 한 장에만** 꼬리표를 단다 = 그 기능을 켠 분에게는
      //   "Collector, 문화 수집가, 버튼" 으로 읽히고 두 번 두드리면 확정된다.
      //   ⚠️ 화면에는 아무것도 안 보인다 = 일반 사용자의 화면·동작은 100% 그대로다(§23 정합).
      //   ⚠️ 읽어주는 기능 대응은 **카드가 아니라 원통 전체**가 맡는다(아래 무대 View).
      //     옛 방식(앞 카드 한 장에만 꼬리표) 폐기 = 2026-08-08 §19 — 회전을 멈춰 놓고
      //     **다른 캐릭터로 넘어갈 길을 안 줘서 7명 중 1명밖에 못 고르는** 기능 후퇴였다(판단3종 지적).
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
          {character.archetype}
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
  //   포커스 이펙트가 "동작 줄이기"가 꺼져 있을 때만 true 로 올린다.
  //   true 로 시작하면: 동작 줄이기를 켠 기기에서 **실제로는 안 도는데 값만 true** 라
  //   첫 탭이 '세우기'로 소모돼 **두 번 눌러야 선택된다**(옛 초기값 true 폐기 = 2026-08-08 §19).
  const spinning = useSharedValue(false);
  // 손이 닿은 그 순간 이미 칸에 서 있었는가 = 이번 손짓이 '확정'이 될 자격이 있는가
  const settledOnTouch = useSharedValue(false);

  const [front, setFront] = useState(0); // 지금 앞에 선 카드
  const frontRef = useRef(0);
  frontRef.current = front;

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 승인 = **"동작 줄이기"를 켠 분에게는 안 돈다.**
  //   카드 날기·게이지 차오름·숫자 톡은 이미 자동으로 이 설정을 따른다(reanimated 기본).
  //   **원통 회전만** 매 프레임을 손수 더하는 방식이라 그 보호 밖이었다 = 한쪽만 된 상태였다.
  //   어지럼·멀미로 이 설정을 켠 분에게는 다른 건 다 멈추는데 원통만 영원히 돌았다.
  //   ⚠️ 손으로 돌리는 것·탭·확정은 그대로 된다 = 못 쓰게 막는 게 아니라 **저절로 도는 것만** 끈다.
  const reduceMotion = useReducedMotion();

  // 룰렛 = 매 프레임 조금씩 돌린다.
  //   ⚠️ dt 는 40ms 로 자른다 = 화면이 잠깐 멈췄다 돌아올 때 한 번에 확 튀는 것 방지(실측 2026-08-08).
  const spin = useFrameCallback((f) => {
    "worklet";
    if (!spinning.value) return;
    const ms = f.timeSincePreviousFrame;
    const dt = Math.min(typeof ms === "number" && ms > 0 ? ms : 16, 40) / 1000;
    rot.value += ((SPIN_DEG_PER_SEC * Math.PI) / 180) * dt;
  }, false);
  // ⚠️ 수정금지(승인필요) 2026-08-08 = 이 통은 **useFocusEffect 의 조건에 넣지 않는다.**
  //   조건에 넣으면 렌더될 때마다 처음 자리로 되돌아간다(실측 2026-08-08 = 회전이 계속 초기화됨).
  //   ⚠️ 옛 사유("통이 렌더마다 새로 생긴다") 폐기 = 2026-08-08 §19 — 사실이 아니다.
  //     useFrameCallback.ts:35,61 실측 = useRef 안의 **같은 통을 계속 돌려준다**(return ref.current).
  //     통은 그대로지만 조건에 넣는 것 자체가 이펙트를 다시 돌리므로, 이 우회는 그대로 둔다.
  const spinRef = useRef(spin);
  spinRef.current = spin;

  // 앞에 선 카드가 바뀔 때만 다시 그린다(겹치는 순서 때문에 필요). 한 장에 3.4초 = 아주 드물다.
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
  //   ① 회전 스위치는 손가락이 닿은 그 순간 UI 스레드에서 끈다(worklet)
  //   ② 뒷정리(프레임 콜백 해제·햅틱·시각 기록)만 JS 로 넘긴다
  //   합쳐서 JS 로 넘기면 그 사이(수 프레임) 동안 룰렛이 더 돌아 **칸에 안 맞게 선다**(실측 2026-08-08 = 59px 어긋남).
  const afterStop = useCallback(() => {
    spinRef.current.setActive(false);
    haptic("medium");
  }, []);

  // 확정 알맹이 1벌. 손가락 탭도, 소리로 읽어주는 기능의 두 번 두드리기도 이 길을 탄다(§0).
  const confirmNow = useCallback(() => {
    haptic("success");
    setSelectedCharacter(BTS_CHARACTERS[frontRef.current]);
    navigation.navigate("BTSPlaceCart");
  }, [navigation, setSelectedCharacter]);

  // ⚠️ 수정금지(승인필요) — **멈추는 길은 하나다 = pan.onBegin.**
  //   손가락이 닿으면 Race 안에서 pan.onBegin 이 **항상 먼저** 돈다. 그래서 멈춤+칸맞춤을 여기서 끝낸다.
  //   옛 구조(탭 쪽에서 멈춤+칸맞춤) 폐기 = 2026-08-08 §19 — pan 이 먼저 spinning 을 꺼버려
  //   탭의 그 분기가 **한 번도 실행되지 않는 죽은 코드**였고, 원통이 칸에 안 맞은 채(최대 ±25.7도)
  //   비스듬히 서서 화면상 정면이 아닌 카드가 확정됐다(판단3종 지적 2026-08-08).
  //
  //   손이 닿은 그 순간 **이미 칸에 서 있었는지**를 기록해 둔다.
  //   돌고 있었거나 관성으로 미끄러지는 중이었으면 이번 손짓은 **세우기만** 하고 확정하지 않는다
  //   (= 움직이는 카드가 골라지는 것을 막는다).
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
        //   옛 방식(onBegin 에서 읽기) 폐기 = 2026-08-08 §19 — 바로 위에서 칸맞춤을 걸어도
        //   그 프레임의 회전값은 **아직 옛 각도**라, 그걸 시작점으로 잡고 끌면 칸맞춤이 취소되며
        //   링이 최대 25.7도(카드 반 장) **뒤로 튄다**. 재현 = 도는 룰렛을 세우고 곧바로 끌기 = 주 동선.
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
  //   멈추기는 큰 과녁이라야 하고(사양 = 화면 아무 데나 터치하면 멈춤), 확정은 눈에 보이는 카드와
  //   **정확히 같은 네모**라야 한다. 그 네모는 손으로 다시 재지 않고 useRingLayout 의 frontRect 를 쓴다
  //   (= 그리는 계산과 한 벌, §0·§16). 옛 방식(가로만 검사) 폐기 = 2026-08-08 §19.
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
      //   돌면 방금 읽어준 캐릭터가 3.4초 뒤 다른 사람으로 바뀌어, 무엇을 고르는지 알 수 없게 된다.
      //   꺼져 있으면(대다수) 종전 그대로 돈다 = 일반 사용자 화면은 아무 변화 없다.
      //   ⚠️ 기본은 **돈다**. 읽어주는 기능이 켜진 것으로 확인됐을 때만 멈춘다.
      //     반대로 짜면(확인된 뒤에 돌리기) 그 확인이 실패하거나 늦는 기기에서 **아무도 안 도는**
      //     화면이 된다 = 대다수를 희생하게 된다(실측 2026-08-08).
      //   ⚠️ 이 판정은 **폰에서만** 쓴다. 웹은 실제로 켰는지와 무관하게 무조건 '켜짐'을 돌려준다
      //     (react-native-web 의 AccessibilityInfo 가 resolve(true) 한 줄, 실측 2026-08-08)
      //     = 웹에서 원통이 통째로 멈춘다. 사장님 확인 경로가 웹이므로 그대로 두면 매번 오해가 난다.
      //   ⚠️⚠️ 미검증 = 실기기 확인 필요 (2026-08-08, 판단3종 6차 지적 · 사장님 승인으로 열어둠)
      //     ① 이 판정은 **화면에 들어올 때 1회뿐**이다. 이 화면에 머무는 중 보이스오버·톡백을 켜면
      //        원통이 계속 돌아, 위·아래 쓸기가 매 프레임 덮여 **먹통이 된다**.
      //        (고치려면 AccessibilityInfo.addEventListener('screenReaderChanged') 구독.
      //         지금 안 넣은 이유 = 웹에서는 이 판정이 가짜 값을 주어 **고쳤는지 확인할 방법이 없다.**)
      //     ② 아이폰 보이스오버가 실제로 "이름 + n/7"을 읽는지도 미확인.
      //     재현 = 아이폰 설정 › 손쉬운 사용 › VoiceOver 켜고 이 화면에서 위아래로 쓸어보기.
      //     정본 문서 = docs/2026-08-08 화면·모달·버튼 구조도.md §8-4
      let alive = true;
      // "동작 줄이기"를 켰으면 저절로 도는 것만 끈다(손으로 돌리기·탭·확정은 그대로)
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
      // ⚠️ 조건은 **reduceMotion 하나만.** 통(객체)을 넣으면 렌더마다 다시 돌아 처음 자리로 튄다(위 spinRef 주석).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reduceMotion]),
  );

  // ⚠️ 수정금지(승인필요) 2026-08-08 = 읽어주는 기능의 위·아래 쓸기로 한 칸씩 돌린다.
  //   손가락 제스처는 읽어주는 기능이 가로채므로, 이것이 그분들의 **유일한 회전 수단**이다.
  //   확정은 손가락 탭과 같은 알맹이(confirmNow) 1벌을 쓴다(§0).
  const onRingAction = useCallback(
    (e: { nativeEvent: { actionName: string } }) => {
      const name = e.nativeEvent.actionName;
      if (name === "activate") {
        confirmNow();
        return;
      }
      // 다음 캐릭터를 앞으로 = 회전값을 한 칸 줄인다(front = round(-rot / SLICE))
      const dir = name === "increment" ? 1 : name === "decrement" ? -1 : 0;
      if (!dir) return;
      const slot = Math.round(rot.value / SLICE) * SLICE;
      rot.value = withTiming(slot - dir * SLICE, { duration: 260 });
    },
    [confirmNow, rot],
  );

  // 앞칸에서 몇 칸 떨어졌는지(원형 거리) = 그릴 순서. 앞선 것이 맨 위.
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
            /* ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 읽어주는 문구도 **영어**다.
               이 화면은 전세계 ARMY 를 보고 눈에 보이는 글자를 일부러 영어로만 두고 언어 토글도 없앴다
               (파일 머리 주석). 여기만 한국어면 영어 기기가 한국어 문장을 영어 음성으로 읽어 못 알아듣는다.
               옛 한국어 문구 폐기 = 2026-08-08 §19. */
            accessibilityLabel="Choose your travel companion"
            /* ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 아이폰은 쓸고 난 뒤 **값(Value)만** 다시 읽는다.
               지금 앞에 선 캐릭터를 여기에 넣어야 쓸 때마다 소리가 난다.
               옛 방식(캐릭터 이름을 라벨에, 자리를 힌트에) 폐기 = 2026-08-08 §19 —
               라벨이 바뀌어도 아이폰은 다시 안 읽어 **쓸어도 아무 소리가 안 났다**(= 누가 앞인지 모름). */
            accessibilityValue={{
              min: 1,
              max: COUNT,
              now: front + 1,
              // archetype 은 한국어라 넣지 않는다 = 영어 음성이 못 읽는다. 화면 문구 기준(영어)에 맞춘다.
              text: `${BTS_CHARACTERS[front].nameEn}, ${front + 1} of ${COUNT}`,
            }}
            accessibilityHint="Swipe up or down to change, double tap to choose"
            accessibilityActions={RING_ACTIONS}
            onAccessibilityAction={onRingAction}
            /* ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 손가락을 받는 판 = **칸 전체**(flex:1).
               옛 방식(높이 = 카드 높이인 띠 하나) 폐기 = 2026-08-08 §19 — 그 띠 밖은 아무 handler 가
               없어, 눕힘으로 띠 밖까지 내려간 **카드 아래쪽(캐릭터 이름 글자 자리)을 눌러도
               멈추지도 확정되지도 않는 먹통**이었다. 원통 자리는 아래 무대 View 가 그대로 잡는다. */
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
