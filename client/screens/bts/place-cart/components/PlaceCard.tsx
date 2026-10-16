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
import { resolveImageSource } from "@/lib/wikimedia-image";
import { CARD_W, CARD_H } from "../utils";
import { styles } from "../styles";

// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 정리: 장소 글라스 카드, 사진 주소는 resolveImageSource 한 벌 (정본 §정리)
type PlaceCardProps = {
  place: BTSPlace;
  displayName: string;
  posX: number;
  posY: number;
  onToggle: (place: BTSPlace, gen?: number) => void;
  onReady: (id: number) => void;
  gen: number;
  flyY: number;
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

  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 날아가는 동안 이 카드는 **손에 안 잡힌다.**
  const [flying, setFlying] = useState(false);
  const fly = useCallback(() => {
    const g = gen; // 날아가기 시작한 시점의 세대를 들고 간다
    setFlying(true);
    p.value = withTiming(1, { duration: FLY_MS }, (done) => {
      if (done) runOnJS(onToggle)(place, g);
    });
  }, [onToggle, place, p, gen]);

  useEffect(() => {
    if (!autoPick) return;
    const t = setTimeout(fly, AUTO_PICK_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoPick, fly]);

  const img = resolveImageSource(place.imageUrl, "card");

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
