// ⚠️ 수정금지(승인필요) — BTS 캐릭터 선택 (화이트 프리미엄 + 삼각함수 원형 배치)
// REF: TeamShowcase 패턴 — 공유 호버, 그레이스케일→컬러, 즉시 표시
// 레이아웃: 상단 타이틀 + 원형(중심=호버 정보) + 상하 여백 균등
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  StatusBar,
  Image,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { BTS_CHARACTERS, type BTSCharacter } from "@/constants/bts-characters";
import { CharacterGradients } from "@/constants/bts-theme";
import { useBTS } from "@/contexts/BTSContext";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";

// ⚠️ 수정금지(승인필요) — Haptics 유틸
const haptic = (t: "light" | "medium" | "success") => {
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — 캐릭터 전신 일러스트 (얼굴 크롭으로 원형 표시)
const CHAR_IMAGES: Record<string, any> = {
  collector: require("../../../assets/images/bts-characters/bts_collector.png"),
  romanticist: require("../../../assets/images/bts-characters/bts_romanticist.png"),
  explorer: require("../../../assets/images/bts-characters/bts_explorer.png"),
  challenger: require("../../../assets/images/bts-characters/bts_challenger.png"),
  companion: require("../../../assets/images/bts-characters/bts_companion.png"),
  recharger: require("../../../assets/images/bts-characters/bts_recharger.png"),
  chiller: require("../../../assets/images/bts-characters/bts_chiller.png"),
};

// ⚠️ 수정금지(승인필요) — 고정 상수
const BORDER_WIDTH = 3.5;
const AVATAR_PADDING = 2;
const ANGLE_OFFSET = -Math.PI / 2;

// ⚠️ 수정금지(승인필요) — 반응형 레이아웃 (useWindowDimensions 기반)
function useCircleLayout() {
  const { width: sw, height: sh } = useWindowDimensions();
  return useMemo(() => {
    // ⚠️ 수정금지(승인필요) — 원형 최대 크기: 세로 85% 활용, 타이틀+여백 100px 확보
    const availH = sh * 0.85 - 100;
    const containerW = Math.min(sw - 8, 440, availH);
    const avatarSize = Math.max(Math.round(containerW * 0.21), 62);
    const circleRadius = (containerW / 2) - (avatarSize / 2) - 2;
    const areaSize = circleRadius * 2 + avatarSize;
    const innerSize = avatarSize - BORDER_WIDTH * 2 - AVATAR_PADDING * 2;
    const positions = BTS_CHARACTERS.map((_, i) => {
      const angle = ANGLE_OFFSET + (2 * Math.PI * i) / 7;
      return {
        x: areaSize / 2 + Math.cos(angle) * circleRadius,
        y: areaSize / 2 + Math.sin(angle) * circleRadius,
      };
    });
    return { containerW, avatarSize, circleRadius, areaSize, innerSize, positions };
  }, [sw, sh]);
}

// ⚠️ 수정금지(승인필요) — 개별 아바타 (TeamShowcase 패턴)
const CharacterAvatar = React.memo(function CharacterAvatar({
  character,
  isHovered,
  isDimmed,
  onSelect,
  onHoverIn,
  onHoverOut,
  posX,
  posY,
  avatarSize,
  innerSize,
}: {
  character: BTSCharacter;
  isHovered: boolean;
  isDimmed: boolean;
  onSelect: () => void;
  onHoverIn: () => void;
  onHoverOut: () => void;
  posX: number;
  posY: number;
  avatarSize: number;
  innerSize: number;
}) {
  const gradient = CharacterGradients[character.id] || CharacterGradients.collector;
  const hoverScale = useSharedValue(1);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: hoverScale.value }],
  }));

  return (
    <Animated.View style={[{
      position: "absolute",
      left: posX - avatarSize / 2,
      top: posY - avatarSize / 2,
      alignItems: "center",
    }, scaleStyle]}>
      <Pressable
        onPress={onSelect}
        onPressIn={() => {
          hoverScale.value = withSpring(1.25, { damping: 12, stiffness: 180 });
          onHoverIn();
          haptic("light");
        }}
        onPressOut={() => {
          hoverScale.value = withSpring(1, { damping: 14, stiffness: 160 });
          onHoverOut();
        }}
        {...(Platform.OS === "web" ? {
          onHoverIn: () => {
            hoverScale.value = withSpring(1.2, { damping: 12, stiffness: 180 });
            onHoverIn();
          },
          onHoverOut: () => {
            hoverScale.value = withSpring(1, { damping: 14, stiffness: 160 });
            onHoverOut();
          },
        } : {})}
      >
        <View style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#FFFFFF",
          borderColor: isHovered ? gradient[0] : gradient[0] + (isDimmed ? "40" : "80"),
          borderWidth: isHovered ? BORDER_WIDTH + 1.5 : BORDER_WIDTH,
          shadowColor: gradient[0],
          shadowOffset: { width: 0, height: isHovered ? 0 : 3 },
          shadowOpacity: isHovered ? 0.6 : 0.15,
          shadowRadius: isHovered ? 20 : 6,
          elevation: isHovered ? 12 : 3,
          opacity: isDimmed ? 0.45 : 1,
        }}>
          <View style={{
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            overflow: "hidden",
          }}>
            <Image
              source={CHAR_IMAGES[character.id]}
              style={{
                width: innerSize,
                height: innerSize * 2.5,
                ...(Platform.OS === "web" ? {
                  filter: isHovered ? "grayscale(0) brightness(1.05)" : "grayscale(0.6) brightness(0.9)",
                } as any : {}),
              }}
              resizeMode="cover"
            />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ⚠️ 수정금지(승인필요) — 원형 중심 캐릭터 정보 (TeamShowcase 우측 패턴)
function CenterInfo({ character }: { character: BTSCharacter | null }) {
  if (!character) {
    return (
      <View style={styles.centerInfo}>
        <Text style={styles.centerHint}>터치하여 선택</Text>
      </View>
    );
  }
  const gradient = CharacterGradients[character.id] || CharacterGradients.collector;
  return (
    <View style={styles.centerInfo}>
      <Text style={[styles.centerNameEn, { color: gradient[0] }]}>
        {character.nameEn}
      </Text>
      <Text style={styles.centerArchetype}>{character.archetype}</Text>
      <View style={styles.tagRow}>
        {character.tags.map((tag) => (
          <Text key={tag} style={[styles.tag, { color: gradient[0] + "CC" }]}>{tag}</Text>
        ))}
      </View>
    </View>
  );
}

// ⚠️ 수정금지(승인필요) — 메인 화면
export default function BTSCharacterSelectScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const { setSelectedCharacter } = useBTS();
  const { avatarSize, areaSize, innerSize, positions } = useCircleLayout();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const hoveredChar = useMemo(
    () => hoveredId ? BTS_CHARACTERS.find((c) => c.id === hoveredId) || null : null,
    [hoveredId]
  );

  const handleSelect = useCallback((char: BTSCharacter) => {
    haptic("medium");
    setSelectedCharacter(char);
    haptic("success");
    navigation.navigate("BTSPlaceCart");
  }, [setSelectedCharacter, navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ⚠️ 수정금지(승인필요) — 상하 균등 여백, 수직 중앙 정렬 */}
      <View style={styles.content}>
        {/* 상단 타이틀 (원형 바로 위) */}
        <View style={styles.titleWrap}>
          <Text style={styles.titleLine}>누구랑</Text>
          <Text style={styles.titleLine}>여행하고 싶으세요?</Text>
        </View>

        {/* 원형 배치 + 중심 정보 */}
        <View style={[styles.circleArea, { width: areaSize, height: areaSize }]}>
          {/* 중심: 호버된 캐릭터 정보 */}
          <View style={styles.centerWrap}>
            <CenterInfo character={hoveredChar} />
          </View>

          {/* 7명 원형 배치 */}
          {BTS_CHARACTERS.map((char, idx) => (
            <CharacterAvatar
              key={char.id}
              character={char}
              isHovered={hoveredId === char.id}
              isDimmed={hoveredId !== null && hoveredId !== char.id}
              onSelect={() => handleSelect(char)}
              onHoverIn={() => setHoveredId(char.id)}
              onHoverOut={() => setHoveredId(null)}
              posX={positions[idx].x}
              posY={positions[idx].y}
              avatarSize={avatarSize}
              innerSize={innerSize}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  // ⚠️ 수정금지(승인필요) — 상하 균등 여백
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  // ⚠️ 수정금지(승인필요) — 타이틀 (원형 바로 위, 콤팩트)
  titleWrap: {
    alignItems: "center",
    marginBottom: 24,
  },
  titleLine: {
    fontSize: 18,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    color: "#1A1A1A",
    textAlign: "center",
    lineHeight: 26,
    letterSpacing: 0.3,
  },
  // ⚠️ 수정금지(승인필요) — 원형 배치 영역
  circleArea: {
    position: "relative",
    overflow: "visible",
  },
  // ⚠️ 수정금지(승인필요) — 중심 정보 영역 (호버 캐릭터)
  centerWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 5,
    pointerEvents: "none",
  },
  centerInfo: {
    alignItems: "center",
  },
  centerHint: {
    fontSize: 11,
    color: "#CCC",
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  centerNameEn: {
    fontSize: 16,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  centerArchetype: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: "#666",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  tagRow: {
    flexDirection: "row",
    marginTop: 4,
    gap: 4,
  },
  tag: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
