// 장소 글라스 카드 = BTSPlaceCartScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable } from "react-native";
// ⚠️ 수정금지(승인필요) — 2026-04-21 expo-image로 교체: react-native Image는 newArchEnabled + Android Fresco 조합에서 Wikimedia URL 로드 실패(실기 증상). DestinationDetailScreen 이 검증된 루트
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from "react-native-reanimated";

import type { BTSPlace } from "@/contexts/BTSContext";
import { resolvePlaceImage, CARD_W, CARD_H } from "../utils";
import { styles } from "../styles";

// ⚠️ 수정금지(승인필요) — 장소 글라스 카드 (사진 내장 + 극투명)
// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 자해 타임아웃 제거. Glide 가 완성할 때까지 무조건 대기. onLoad → readyIds 부모 통보.
type PlaceCardProps = {
  place: BTSPlace;
  displayName: string;
  posX: number;
  posY: number;
  isSelected: boolean;
  onToggle: (place: BTSPlace) => void;
  onReady: (id: number) => void;
  tint: string;
};

const PlaceCard = React.memo(function PlaceCard({
  place,
  displayName,
  posX,
  posY,
  isSelected,
  onToggle,
  onReady,
  tint,
}: PlaceCardProps) {
  // ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-③: scale 만 유지 (tap 피드백). x/y 이동 애니메이션 제거.
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: posX - CARD_W / 2 },
      { translateY: posY - CARD_H / 2 },
      { scale: scale.value * (isSelected ? 1.05 : 1) },
    ],
  }));

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 폴백 스왑 없음. imageUrl 없으면 undefined → 빈 카드 노출.
  const img = resolvePlaceImage(place);

  return (
    <Animated.View style={[styles.cardAbsolute, animStyle]}>
      <Pressable
        onPress={() => {
          scale.value = withSequence(
            withSpring(0.9, { damping: 12, stiffness: 220 }),
            withSpring(1, { damping: 14, stiffness: 160 }),
          );
          onToggle(place);
        }}
        style={[
          styles.cardPressable,
          {
            borderWidth: 0,
            shadowColor: isSelected ? tint : "#000",
            shadowOpacity: isSelected ? 0.45 : 0.12,
            shadowRadius: isSelected ? 14 : 6,
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
        {isSelected && (
          <View style={[styles.checkBadge, { backgroundColor: tint }]}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

export default PlaceCard;
