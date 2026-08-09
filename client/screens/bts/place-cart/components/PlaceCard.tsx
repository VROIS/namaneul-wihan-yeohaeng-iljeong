// 장소 글라스 카드 = BTSPlaceCartScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
// ⚠️ 수정금지(승인필요) — 2026-04-21 expo-image로 교체: react-native Image는 newArchEnabled + Android Fresco 조합에서 Wikimedia URL 로드 실패(실기 증상). DestinationDetailScreen 이 검증된 루트
import { Image } from "expo-image";
import Animated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import type { BTSPlace } from "@/contexts/BTSContext";
import { resolvePlaceImage, CARD_W, CARD_H } from "../utils";
import { styles } from "../styles";

// ⚠️ 수정금지(승인필요) — 장소 글라스 카드 (사진 내장 + 극투명)
// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 자해 타임아웃 제거. Glide 가 완성할 때까지 무조건 대기. onLoad → readyIds 부모 통보.
//
// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 — 이 화면의 연출 2가지가 여기 산다.
//   ① 누르면 **아래 숫자칸 쪽으로 휙 날아가 작아지며 사라진 뒤** 담긴다
//      → 그냥 없어지면 "지워졌나?"가 된다. 어디로 갔는지 보여야 담긴 것이 된다.
//   ② autoPick = 들어오고 0.7초 뒤 **공연장 카드가 스스로 그 동작을 한 번 해 보인다**
//      → 사람이 누른 것과 **똑같은 길**(fly)을 타므로 "아, 이렇게 하는 거구나"가 그대로 학습된다.
//      → 살짝 들렸다 놓는 힌트 폐기 = 2026-08-08 §19(움직임만 있고 무슨 뜻인지 안 남음, 사장님 판정).
//      → 헛 동작이 아니다. 공연장은 어차피 가는 곳이라 **실제로 담긴 채** 시작한다(빼려면 아래 [제거]).
type PlaceCardProps = {
  place: BTSPlace;
  displayName: string;
  posX: number;
  posY: number;
  onToggle: (place: BTSPlace, gen?: number) => void;
  onReady: (id: number) => void;
  /** 날아가기 시작한 시점의 카트 세대 = 도중에 도시가 바뀌면 부모가 이 카드를 버린다 */
  gen: number;
  /** 날아가 꽂힐 자리(중심 기준 세로 오프셋) = 아래 숫자칸 쪽 */
  flyY: number;
  /** 공연장 카드 한 장만 true = 스스로 한 번 담기는 시범 */
  autoPick?: boolean;
};

const FLY_MS = 360;
const AUTO_PICK_DELAY_MS = 700;

const PlaceCard = React.memo(function PlaceCard({
  place,
  displayName,
  posX,
  posY,
  onToggle,
  onReady,
  flyY,
  gen,
  autoPick = false,
}: PlaceCardProps) {
  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 공유값은 **진행도 하나**뿐이다(0=제자리, 1=다 날아감).
  //   옛 방식(자리·크기·기울기·투명도를 공유값 5개로 따로 들고, 시작값을 posX/posY 로 한 번만 받음)
  //   폐기 = 2026-08-08 §19 — 그 방식은 **마운트 순간의 좌표에 얼어붙어** 부모가 계속 넘기는
  //   posX/posY(화면 크기·safe-area 로부터 계산)가 죽은 값이 됐다. 창 크기·분할화면에서 가운데
  //   캐릭터만 다시 그려지고 카드 8장은 옛 자리에 남는다.
  //   지금은 animStyle 이 매번 posX/posY 를 직접 읽으므로 항상 최신이고, 공유값도 1개로 줄었다.
  const p = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => {
    const v = p.value;
    return {
      opacity: 1 - v,
      transform: [
        { translateX: posX + (0 - posX) * v - CARD_W / 2 },
        { translateY: posY + (flyY - posY) * v - CARD_H / 2 },
        { rotateZ: `${-10 * v}deg` },
        { scale: 1 - 0.78 * v },
      ],
    };
  }, [posX, posY, flyY]);

  // ① 아래 숫자칸 쪽으로 휙 날아간 **뒤에** 담는다(= 담기는 순간이 눈에 보인다)
  //    손가락으로 눌러도, 스스로 시범을 보여도 **이 길 하나**만 탄다(§0 = 같은 동작은 1벌).
  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 날아가는 동안 이 카드는 **손에 안 잡힌다.**
  //   없으면: 카드가 궤도 한가운데를 가로질러 내려가는데 **투명한데 터치는 살아 있어**,
  //   그 위에 겹친 다른 카드를 누르면 보이지 않는 이 카드가 탭을 먹어 **아무 일도 안 난다**.
  //   (3장 이상 연달아 담는 주 동선이라 실제로 밟힌다. 착지 직전 같은 자리를 또 누르면
  //    fly 가 다시 돌아 방금 담은 것이 도로 빠지는 유령 카드도 이걸로 같이 막힌다.)
  const [flying, setFlying] = useState(false);
  const fly = useCallback(() => {
    const g = gen; // 날아가기 시작한 시점의 세대를 들고 간다
    setFlying(true);
    p.value = withTiming(1, { duration: FLY_MS }, (done) => {
      if (done) runOnJS(onToggle)(place, g);
    });
  }, [onToggle, place, p, gen]);

  // ② 공연장 카드가 스스로 한 번 담기는 시범 (들어오고 0.7초 뒤, 한 번만)
  useEffect(() => {
    if (!autoPick) return;
    const t = setTimeout(fly, AUTO_PICK_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoPick, fly]);

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 폴백 스왑 없음. imageUrl 없으면 undefined → 빈 카드 노출.
  const img = resolvePlaceImage(place);

  return (
    <Animated.View
      style={[
        styles.cardAbsolute,
        animStyle,
        flying && { pointerEvents: "none" as const },
      ]}
    >
      <Pressable
        onPress={fly}
        style={[
          styles.cardPressable,
          {
            borderWidth: 0,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 6,
          },
        ]}
      >
        {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 타임아웃/폴백/onError 핸들러 전부 제거. Glide 가 완성할 때까지 무조건 대기. onLoad 만 부모 통보. */}
        {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1j: transition={150} 으로 이미지 로드 시 부드러운 fade-in (깝빡 현상 완화). */}
        <Image
          source={img}
          style={styles.cardImage}
          contentFit="cover"
          priority="normal"
          cachePolicy="memory-disk"
          transition={150}
          onLoad={() => onReady(place.id)}
        />
        <View style={styles.cardLabel}>
          <Text numberOfLines={2} style={styles.cardLabelText}>
            {displayName}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default PlaceCard;
