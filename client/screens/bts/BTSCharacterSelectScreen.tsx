// ⚠️ 수정금지(승인필요) — BTS 캐릭터 선택 (2026-04-20 플랜 승인 재설계)
// 사양: 타원 배치 + 카카오 글라스 패턴 + 2단계 탭 + 플로팅 텍스트 오버레이
// 근거: LiquidButton.tsx 유리 스택 + BTSLandingScreen.tsx kakaoBtn 패턴
import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  StatusBar,
  Image,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

const ANGLE_OFFSET = -Math.PI / 2;

// ⚠️ 수정금지(승인필요) — 타원 배치 레이아웃 (가로 좁게/세로 길게 iPhone 긴 화면 활용)
function useEllipseLayout() {
  const { width: sw, height: sh } = useWindowDimensions();
  return useMemo(() => {
    // 아바타 크기: 화면 작은 쪽 28%, 최소 96px (기존 0.21 → 0.28 확대)
    const avatarSize = Math.max(Math.round(Math.min(sw, sh) * 0.28), 96);
    // 가로 반지름: 화면폭 - 아바타 - 여유 마진
    const rx = (sw - avatarSize) / 2 - 12;
    // 세로 반지름: 1.4배 → 타원
    const ry = rx * 1.4;
    const areaW = 2 * rx + avatarSize;
    const areaH = 2 * ry + avatarSize;
    const positions = BTS_CHARACTERS.map((_, i) => {
      const angle = ANGLE_OFFSET + (2 * Math.PI * i) / 7;
      return {
        x: areaW / 2 + Math.cos(angle) * rx,
        y: areaH / 2 + Math.sin(angle) * ry,
      };
    });
    return { avatarSize, areaW, areaH, positions };
  }, [sw, sh]);
}

// ⚠️ 수정금지(승인필요) — 개별 아바타 (카카오 글라스 패턴 + 플로팅 텍스트)
// onTap 안정 레퍼런스(charId 전달) + useAnimatedStyle 직접 withSpring/withTiming (React.memo 유지)
const CharacterAvatar = React.memo(function CharacterAvatar({
  character,
  isSelected,
  isDimmed,
  onTap,
  posX,
  posY,
  avatarSize,
}: {
  character: BTSCharacter;
  isSelected: boolean;
  isDimmed: boolean;
  onTap: (charId: string) => void;
  posX: number;
  posY: number;
  avatarSize: number;
}) {
  const gradient = CharacterGradients[character.id] || CharacterGradients.collector;

  // JS prop 변경 시 워크렛 재실행 → withSpring/withTiming가 자체 보간 (useEffect 불필요)
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isSelected ? 1.1 : 1, { damping: 12, stiffness: 180 }) }],
  }), [isSelected]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isSelected ? 1 : 0, { duration: 200 }),
  }), [isSelected]);

  return (
    <Animated.View style={[{
      position: "absolute",
      left: posX - avatarSize / 2,
      top: posY - avatarSize / 2,
      width: avatarSize,
      height: avatarSize,
      // 3D 깊이감 그림자 (iOS + Android elevation)
      shadowColor: isSelected ? gradient[0] : "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isSelected ? 0.55 : 0.2,
      shadowRadius: isSelected ? 20 : 12,
      elevation: isSelected ? 16 : 8,
    }, scaleStyle]}>
      <Pressable
        onPress={() => onTap(character.id)}
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
          overflow: "hidden",
        }}
      >
        {/* 레이어 1: 어두운 그라디언트 베이스 — 카카오 패턴 작동 조건 */}
        <LinearGradient
          colors={["rgba(20, 20, 40, 0.92)", "rgba(5, 9, 48, 0.98)"]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* 레이어 2: 캐릭터 이미지 (얼굴 크롭, 전신의 상단 40%) */}
        <Image
          source={CHAR_IMAGES[character.id]}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: avatarSize,
            height: avatarSize * 2.5,
          }}
          resizeMode="cover"
        />

        {/* 레이어 3: 기본 어두운 오버레이 (선택 시 제거로 컬러 복귀) */}
        {!isSelected && (
          <View style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: isDimmed ? "rgba(30,30,30,0.65)" : "rgba(60,60,60,0.45)" },
          ]} />
        )}

        {/* 레이어 4: 카카오 패턴 유리 오버레이 (Android 포함 글라스 효과) */}
        <View style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: "rgba(255,255,255,0.10)",
            borderRadius: avatarSize / 2,
            borderWidth: isSelected ? 2 : 1,
            borderColor: isSelected ? gradient[0] : "rgba(255,255,255,0.22)",
          },
        ]} />

        {/* 레이어 5: 상단 1px 화이트 반사광 (유리 엣지) */}
        <View style={{
          position: "absolute",
          top: 0,
          left: "18%",
          right: "18%",
          height: 0.6,
          backgroundColor: "rgba(255,255,255,0.85)",
        }} />

        {/* 레이어 6: 선택 시 플로팅 텍스트 (유리 위에 떠있는 느낌) */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              bottom: "15%",
              left: 0,
              right: 0,
              alignItems: "center",
            },
            textStyle,
          ]}
        >
          <Text style={styles.floatingNameEn}>{character.nameEn}</Text>
          <Text style={styles.floatingArchetype}>{character.archetype}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

// ⚠️ 수정금지(승인필요) — 메인 화면
export default function BTSCharacterSelectScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const { setSelectedCharacter } = useBTS();
  const insets = useSafeAreaInsets();
  const { avatarSize, areaW, areaH, positions } = useEllipseLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ref로 현재 selectedId 참조 → handleCharacterTap 레퍼런스 안정화 (React.memo 보존)
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // ⚠️ 수정금지(승인필요) — 2단계 탭: 1탭=선택 진입, 같은 캐릭터 2탭=확정
  // deps에 selectedId 없음 → 안정 레퍼런스 → 7개 CharacterAvatar memo 유지
  const handleCharacterTap = useCallback((charId: string) => {
    const char = BTS_CHARACTERS.find((c) => c.id === charId);
    if (!char) return;
    if (selectedIdRef.current === charId) {
      haptic("success");
      setSelectedCharacter(char);
      navigation.navigate("BTSPlaceCart");
    } else {
      haptic("light");
      setSelectedId(charId);
    }
  }, [setSelectedCharacter, navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 상단 타이틀 — 최대 크게, 상단 고정 */}
      <View style={[styles.titleWrap, { top: insets.top + 24 }]}>
        <Text style={styles.titleLine}>누구랑</Text>
        <Text style={styles.titleLine}>여행하고 싶으세요?</Text>
      </View>

      {/* 타원 배치 영역 — 중앙 정렬 */}
      <View style={styles.circleWrap}>
        <View style={{ width: areaW, height: areaH, position: "relative" }}>
          {BTS_CHARACTERS.map((char, idx) => (
            <CharacterAvatar
              key={char.id}
              character={char}
              isSelected={selectedId === char.id}
              isDimmed={selectedId !== null && selectedId !== char.id}
              onTap={handleCharacterTap}
              posX={positions[idx].x}
              posY={positions[idx].y}
              avatarSize={avatarSize}
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
  // ⚠️ 수정금지(승인필요) — 타이틀: 최대 크게(32pt) + 상단 고정 + 중앙 정렬
  titleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  titleLine: {
    fontSize: 32,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    color: "#1A1A1A",
    textAlign: "center",
    lineHeight: 42,
    letterSpacing: 0.3,
  },
  // ⚠️ 수정금지(승인필요) — 타원 영역: 화면 중앙 수직/수평, 타이틀과 자연 여백
  circleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  // ⚠️ 수정금지(승인필요) — 플로팅 텍스트: 배경 박스 없이 그림자로 떠있는 느낌
  floatingNameEn: {
    fontSize: 13,
    color: "#FFFFFF",
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  floatingArchetype: {
    marginTop: 2,
    fontSize: 10,
    color: "#FFFFFF",
    fontFamily: "Pretendard-Bold",
    opacity: 0.92,
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
