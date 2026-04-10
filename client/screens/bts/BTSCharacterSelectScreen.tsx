/**
 * BTS 미니앱 - Scene 1: 캐릭터 선택
 * 7명 캐릭터 캐러셀 + 패럴랙스 카드 + 파티클 배경
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  FlatList,
  StatusBar,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  FadeIn,
  SlideInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { BTS_CHARACTERS, type BTSCharacter } from "@/constants/bts-characters";
import { BTSColors, CharacterGradients, BTSBorderRadius } from "@/constants/bts-theme";
import { useBTS } from "@/contexts/BTSContext";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = SCREEN_W * 0.6;
const CARD_H = CARD_W * 1.45;
const CARD_GAP = 16;

// ─── Particle Background ───
function ParticleBackground() {
  const particles = Array.from({ length: 20 }, (_, i) => i);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((i) => (
        <Particle key={i} index={i} />
      ))}
    </View>
  );
}

function Particle({ index }: { index: number }) {
  const translateY = useSharedValue(SCREEN_H + 50);
  const opacity = useSharedValue(0);
  const left = Math.random() * SCREEN_W;
  const size = Math.random() * 4 + 2;
  const duration = Math.random() * 6000 + 6000;
  const delay = Math.random() * 5000;

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(-50, { duration }),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.5, { duration: duration / 2 }),
        -1,
        true
      )
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: BTSColors.neonPurple,
        },
        animStyle,
      ]}
    />
  );
}

// ─── Character Card ───
type CharacterCardProps = {
  character: BTSCharacter;
  index: number;
  scrollX: { value: number };
  isSelected: boolean;
  onSelect: () => void;
};

function CharacterCard({ character, index, scrollX, isSelected, onSelect }: CharacterCardProps) {
  const inputRange = [
    (index - 1) * (CARD_W + CARD_GAP),
    index * (CARD_W + CARD_GAP),
    (index + 1) * (CARD_W + CARD_GAP),
  ];

  const cardStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.85, 1, 0.85], Extrapolation.CLAMP);
    const rotateY = interpolate(scrollX.value, inputRange, [15, 0, -15], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.6, 1, 0.6], Extrapolation.CLAMP);
    return {
      transform: [{ scale }, { rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  const avatarStyle = useAnimatedStyle(() => {
    const translateYVal = interpolate(scrollX.value, inputRange, [10, -20, 10], Extrapolation.CLAMP);
    const scaleVal = interpolate(scrollX.value, inputRange, [0.8, 1, 0.8], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: translateYVal }, { scale: scaleVal }],
    };
  });

  // ⚠️ 수정금지(승인필요) — undefined 방어 (BTSWorldMap → 전환 시 초기화 타이밍)
  if (!character) return null;
  const gradient = CharacterGradients[character.id] || CharacterGradients.collector;

  return (
    <Pressable onPress={onSelect}>
      <Animated.View
        style={[
          styles.card,
          cardStyle,
          isSelected && styles.cardSelected,
        ]}
      >
        {/* 아바타 */}
        <Animated.View style={[styles.avatarContainer, avatarStyle]}>
          <LinearGradient
            colors={[gradient[0], gradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarEmoji}>{character.emoji}</Text>
          </LinearGradient>
        </Animated.View>

        {/* 카드 내용 */}
        <View style={styles.cardContent}>
          <Text style={styles.charName}>{character.name}</Text>
          <Text style={styles.charArchetype}>{character.archetypeEn}</Text>
          <Text style={styles.charDesc} numberOfLines={2}>
            {character.description}
          </Text>

          {/* 태그 */}
          <View style={styles.tagRow}>
            {character.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* 페이스 뱃지 */}
          <View style={styles.paceBadge}>
            <Text style={styles.paceText}>{character.pace}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Main Screen ───
export default function BTSCharacterSelectScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const { selectedCharacter, setSelectedCharacter } = useBTS();
  const scrollX = useSharedValue(0);
  const flatListRef = useRef<FlatList>(null);

  const handleSelect = useCallback(
    (char: BTSCharacter) => {
      setSelectedCharacter(char);
    },
    [setSelectedCharacter]
  );

  const handleNext = useCallback(() => {
    if (selectedCharacter) {
      navigation.navigate("BTSPlaceCart");
    }
  }, [selectedCharacter, navigation]);

  // CTA 버튼 애니메이션
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
    opacity: selectedCharacter ? 1 : 0.4,
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* 배경 그라디언트 */}
      <LinearGradient
        colors={[BTSColors.deepViolet, BTSColors.spaceBlack]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />

      {/* 파티클 */}
      <ParticleBackground />

      {/* 글래스 헤더 */}
      <Animated.View entering={FadeIn.delay(200).duration(600)} style={styles.headerContainer}>
        <BlurView intensity={40} tint="dark" style={styles.header}>
          <Pressable onPress={() => navigation.getParent()?.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>✕</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>나만의 방탄 투어</Text>
            <Text style={styles.headerSub}>Choose your travel persona</Text>
          </View>
          <View style={styles.backBtn} />
        </BlurView>
      </Animated.View>

      {/* 캐릭터 캐러셀 */}
      <View style={styles.carouselContainer}>
        <Animated.FlatList
          ref={flatListRef}
          data={BTS_CHARACTERS}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + CARD_GAP}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: (SCREEN_W - CARD_W) / 2,
          }}
          onScroll={(e) => {
            scrollX.value = e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => (
            <View style={{ width: CARD_W, marginHorizontal: CARD_GAP / 2 }}>
              <CharacterCard
                character={item}
                index={index}
                scrollX={scrollX}
                isSelected={selectedCharacter?.id === item.id}
                onSelect={() => handleSelect(item)}
              />
            </View>
          )}
        />
      </View>

      {/* 인디케이터 */}
      <View style={styles.indicators}>
        {BTS_CHARACTERS.map((char, i) => (
          <View
            key={char.id}
            style={[
              styles.dot,
              selectedCharacter?.id === char.id && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* CTA 버튼 */}
      <Animated.View
        entering={SlideInDown.delay(400).springify()}
        style={[styles.ctaContainer, { paddingBottom: insets.bottom + 20 }]}
      >
        <Pressable
          onPress={handleNext}
          disabled={!selectedCharacter}
          onPressIn={() => {
            btnScale.value = withSpring(0.95);
          }}
          onPressOut={() => {
            btnScale.value = withSpring(1);
          }}
        >
          <Animated.View style={btnStyle}>
            <LinearGradient
              colors={[BTSColors.neonPurple, BTSColors.deepViolet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaText}>
                {selectedCharacter
                  ? `${selectedCharacter.name} 바이브로 시작하기 ✨`
                  : "캐릭터를 선택하세요"}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BTSColors.spaceBlack,
  },

  // Header
  headerContainer: {
    paddingHorizontal: 20,
    marginTop: 8,
    zIndex: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  backText: {
    color: BTSColors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: BTSColors.textPrimary,
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 10,
    color: BTSColors.textTertiary,
    marginTop: 2,
  },

  // Carousel
  carouselContainer: {
    flex: 1,
    justifyContent: "center",
  },

  // Card
  card: {
    height: CARD_H,
    borderRadius: BTSBorderRadius.xl,
    backgroundColor: BTSColors.backgroundCard,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  cardSelected: {
    borderColor: BTSColors.neonPurple,
    shadowColor: BTSColors.neonPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  avatarContainer: {
    position: "absolute",
    top: -30,
    zIndex: 10,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  avatarEmoji: {
    fontSize: 48,
  },

  // Card Content
  cardContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  charName: {
    fontSize: 28,
    fontWeight: "900",
    color: BTSColors.textPrimary,
    letterSpacing: 1,
  },
  charArchetype: {
    fontSize: 14,
    color: BTSColors.textSecondary,
    fontWeight: "500",
  },
  charDesc: {
    fontSize: 12,
    color: BTSColors.textTertiary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  tagRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tagText: {
    fontSize: 11,
    color: BTSColors.textSecondary,
    fontWeight: "500",
  },
  paceBadge: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: BTSColors.purpleGlowLight,
    borderWidth: 1,
    borderColor: BTSColors.neonPurple,
  },
  paceText: {
    fontSize: 11,
    color: BTSColors.neonPurple,
    fontWeight: "700",
  },

  // Indicators
  indicators: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BTSColors.textMuted,
  },
  dotActive: {
    width: 20,
    backgroundColor: BTSColors.neonPurple,
    borderRadius: 3,
  },

  // CTA
  ctaContainer: {
    paddingHorizontal: 24,
  },
  ctaBtn: {
    paddingVertical: 18,
    borderRadius: BTSBorderRadius["2xl"],
    alignItems: "center",
    shadowColor: BTSColors.neonPurple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
