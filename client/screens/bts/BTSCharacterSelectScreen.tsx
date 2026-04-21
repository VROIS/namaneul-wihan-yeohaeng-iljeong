// ⚠️ 수정금지(승인필요) — BTS 캐릭터 선택 (2026-04-21 중앙 쇼케이스 overlay 패턴)
// 사양: 타원 7개 썸네일 배치 + 선택 시 중앙 overlay 줌인 (동일 CharacterAvatar 큰 사이즈)
// 텍스트는 캐릭터 이미지 위 overlay로만 존재 (별도 텍스트 존 없음), 프로포셔널 폰트 스케일
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
  ZoomIn,
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

// ⚠️ 수정금지(승인필요) — 캐릭터 전신 일러스트 (require 하드코딩 유지)
// 사용자 결정: 네트워크 URL 전환 안 함 (속도/안정성 우선)
// iOS Expo Go dev 환경 미지원 허용, APK/TestFlight/App Store 프로덕션에서는 정상
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

// ⚠️ 수정금지(승인필요) — 레이아웃 상수 (사용자 지시 반영)
const TITLE_TOP_OFFSET = 56;   // status bar로부터 타이틀까지 여백
const TITLE_HEIGHT = 76;       // 30pt × 2줄 × lineHeight 1.27
const TITLE_TO_ELLIPSE_GAP = 100; // 타이틀-원형 간격

// ⚠️ 수정금지(승인필요) — 타원 배치 + 중앙 overlay 사이즈 계산
function useCharacterLayout() {
  const { width: sw, height: sh } = useWindowDimensions();
  return useMemo(() => {
    const avatarSize = Math.max(Math.round(Math.min(sw, sh) * 0.28), 96);
    const rx = (sw - avatarSize) / 2 - 12;
    const ry = rx * 1.2; // 세로 1.2배 (기존 1.4 → 1.2, 하단 여유 확보)
    const areaW = 2 * rx + avatarSize;
    const areaH = 2 * ry + avatarSize;
    const heroSize = Math.round(avatarSize * 2.4); // 중앙 overlay = 썸네일 2.4배
    const positions = BTS_CHARACTERS.map((_, i) => {
      const angle = ANGLE_OFFSET + (2 * Math.PI * i) / 7;
      return {
        x: areaW / 2 + Math.cos(angle) * rx,
        y: areaH / 2 + Math.sin(angle) * ry,
      };
    });
    return { avatarSize, heroSize, areaW, areaH, positions };
  }, [sw, sh]);
}

// ⚠️ 수정금지(승인필요) — 캐릭터 아바타 (카카오 글라스 패턴 + 프로포셔널 텍스트 오버레이)
// 썸네일(작은)과 중앙 overlay(큰)에 동일 컴포넌트 사용, 폰트는 avatarSize 기준 자동 스케일
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

  // 선택 상태에 따른 부드러운 스케일 (썸네일용 미세 확대)
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isSelected ? 1.05 : 1, { damping: 12, stiffness: 180 }) }],
  }), [isSelected]);

  // 프로포셔널 폰트: 캐릭터 사이즈 기준 자동 스케일
  const nameEnFontSize = Math.round(avatarSize * 0.095);
  const archetypeFontSize = Math.round(avatarSize * 0.075);

  return (
    <Animated.View style={[{
      position: "absolute",
      left: posX - avatarSize / 2,
      top: posY - avatarSize / 2,
      width: avatarSize,
      height: avatarSize,
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
        {/* 레이어 1: 어두운 그라디언트 베이스 (카카오 패턴 작동 조건) */}
        <LinearGradient
          colors={["rgba(20, 20, 40, 0.92)", "rgba(5, 9, 48, 0.98)"]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* 레이어 2: 캐릭터 이미지 (전신 상단 40% 크롭) */}
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

        {/* 레이어 3: 미선택 시 어두운 오버레이 (선택 시 제거로 컬러 복귀) */}
        {!isSelected && (
          <View style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: isDimmed ? "rgba(30,30,30,0.65)" : "rgba(60,60,60,0.45)" },
          ]} />
        )}

        {/* 레이어 4: 카카오 패턴 유리 오버레이 (Android 포함) */}
        <View style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: "rgba(255,255,255,0.10)",
            borderRadius: avatarSize / 2,
            borderWidth: isSelected ? 2 : 1,
            borderColor: isSelected ? gradient[0] : "rgba(255,255,255,0.22)",
          },
        ]} />

        {/* 레이어 5: 상단 반사광 (유리 엣지) */}
        <View style={{
          position: "absolute",
          top: 0,
          left: "18%",
          right: "18%",
          height: 0.6,
          backgroundColor: "rgba(255,255,255,0.85)",
        }} />

        {/* 레이어 6: 텍스트 오버레이 (캐릭터 위 하단 15% 영역, 프로포셔널) */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: "15%",
            left: 0,
            right: 0,
            alignItems: "center",
            paddingHorizontal: avatarSize * 0.08,
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
      </Pressable>
    </Animated.View>
  );
});

// ⚠️ 수정금지(승인필요) — 메인 화면
export default function BTSCharacterSelectScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const { setSelectedCharacter } = useBTS();
  const insets = useSafeAreaInsets();
  const { avatarSize, heroSize, areaW, areaH, positions } = useCharacterLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const selectedChar = useMemo(
    () => (selectedId ? BTS_CHARACTERS.find((c) => c.id === selectedId) ?? null : null),
    [selectedId]
  );

  // ⚠️ 수정금지(승인필요) — 2단계 탭: 1탭=overlay 등장, 같은 캐릭터 2탭=확정
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

      {/* ⚠️ 수정금지(승인필요) — 타이틀: fontSize 30, 상단 여백 확보 */}
      <View style={[styles.titleWrap, { top: insets.top + TITLE_TOP_OFFSET }]}>
        <Text style={styles.titleLine}>누구랑</Text>
        <Text style={styles.titleLine}>여행하고 싶으세요?</Text>
      </View>

      {/* ⚠️ 수정금지(승인필요) — 타원 영역: 타이틀과 100px 간격, 중앙 overlay는 동일 영역 내 absolute */}
      <View style={[styles.circleWrap, { marginTop: insets.top + TITLE_TOP_OFFSET + TITLE_HEIGHT + TITLE_TO_ELLIPSE_GAP }]}>
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

          {/* ⚠️ 수정금지(승인필요) — 중앙 overlay: 선택 시 줌인 등장, key로 캐릭터 교체 시 재마운트 */}
          {selectedChar && (
            <Animated.View
              key={selectedChar.id}
              entering={ZoomIn.duration(300)}
              style={{
                position: "absolute",
                left: (areaW - heroSize) / 2,
                top: (areaH - heroSize) / 2,
                width: heroSize,
                height: heroSize,
                zIndex: 20,
              }}
            >
              <CharacterAvatar
                character={selectedChar}
                isSelected={true}
                isDimmed={false}
                onTap={handleCharacterTap}
                posX={heroSize / 2}
                posY={heroSize / 2}
                avatarSize={heroSize}
              />
            </Animated.View>
          )}
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
  // ⚠️ 수정금지(승인필요) — 타이틀: 절대 위치, 상단 여백 +56 (사용자 지시)
  titleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
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
  // ⚠️ 수정금지(승인필요) — 타원 영역 감싸기 (marginTop으로 타이틀과 간격 확보)
  circleWrap: {
    alignItems: "center",
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
