/**
 * BTS 미니앱 - Scene 2: 장소 카트 (서라운드 카드 + 장바구니)
 * 중앙 아바타 주위에 8장 카드가 원형으로 펼쳐지는 몰입형 선택 UI
 */

import React, { useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  StatusBar,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  FadeIn,
  SlideInDown,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { BTSColors, CharacterGradients, BTSBorderRadius } from "@/constants/bts-theme";
import { useBTS, type BTSPlace } from "@/contexts/BTSContext";
import { getApiUrl } from "@/lib/query-client";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CENTER_SIZE = 100;
const CARD_W = 90;
const CARD_H = 120;
const RADIUS = Math.min(SCREEN_W * 0.32, 140);

// ─── Surround Card ───
type SurroundCardProps = {
  place: BTSPlace;
  index: number;
  total: number;
  isSelected: boolean;
  onToggle: () => void;
};

function SurroundCard({ place, index, total, isSelected, onToggle }: SurroundCardProps) {
  const angle = (index / total) * (2 * Math.PI) - Math.PI / 2;
  const x = Math.cos(angle) * RADIUS;
  const y = Math.sin(angle) * RADIUS;

  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(index * 80, withSpring(1, { damping: 12, stiffness: 120 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x - CARD_W / 2 },
      { translateY: y - CARD_H / 2 },
      { scale: scale.value },
    ],
  }));

  // 카테고리 이모지
  const catEmoji = useMemo(() => {
    const map: Record<string, string> = {
      attraction: "🏛️",
      healing: "🧘",
      restaurant: "🍽️",
      hotspot: "📸",
      adventure: "🏔️",
    };
    return map[place.seedCategory || ""] || "📍";
  }, [place.seedCategory]);

  return (
    <Pressable onPress={onToggle} style={styles.cardPressable}>
      <Animated.View
        style={[
          styles.surroundCard,
          animStyle,
          isSelected && styles.surroundCardSelected,
        ]}
      >
        <Text style={styles.cardEmoji}>{catEmoji}</Text>
        <Text style={styles.cardName} numberOfLines={2}>
          {place.nameKo || place.nameEn}
        </Text>
        {place.priceEur != null && (
          <Text style={styles.cardPrice}>€{place.priceEur}</Text>
        )}
        {isSelected && (
          <View style={styles.checkBadge}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── City Selector ───
function CitySelector() {
  const { cities, selectedCity, setSelectedCity } = useBTS();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.cityRow}
    >
      {cities.map((city) => (
        <Pressable
          key={city.id}
          style={[
            styles.cityChip,
            selectedCity?.id === city.id && styles.cityChipActive,
          ]}
          onPress={() => setSelectedCity(city)}
        >
          <Text
            style={[
              styles.cityChipText,
              selectedCity?.id === city.id && styles.cityChipTextActive,
            ]}
          >
            {city.nameKo}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── Main Screen ───
export default function BTSPlaceCartScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const {
    selectedCharacter,
    selectedCity,
    topPlaces,
    selectedPlaceIds,
    cities,
    isLoadingPlaces,
    error,
    setSelectedCity,
    setCities,
    setTopPlaces,
    setIsLoadingCities,
    setIsLoadingPlaces,
    togglePlace,
    setError,
  } = useBTS();

  const baseUrl = getApiUrl();
  const gradient = CharacterGradients[selectedCharacter?.id || "collector"];

  // 도시 목록 로드
  useEffect(() => {
    setIsLoadingCities(true);
    fetch(`${baseUrl}/api/bts/cities`)
      .then((r) => r.json())
      .then((data) => {
        setCities(data);
        if (data.length > 0 && !selectedCity) {
          setSelectedCity(data[0]);
        }
      })
      .catch(() => setCities([]))
      .finally(() => setIsLoadingCities(false));
  }, [baseUrl]);

  // 장소 로드 (캐릭터 + 도시 선택 시)
  useEffect(() => {
    if (!selectedCharacter || !selectedCity) return;
    setIsLoadingPlaces(true);
    setError(null);
    fetch(
      `${baseUrl}/api/bts/top-places?cityId=${selectedCity.id}&memberId=${selectedCharacter.id}`
    )
      .then((r) => r.json())
      .then((data) => setTopPlaces(Array.isArray(data) ? data : []))
      .catch(() => {
        setTopPlaces([]);
        setError("장소를 불러오지 못했어요");
      })
      .finally(() => setIsLoadingPlaces(false));
  }, [selectedCharacter?.id, selectedCity?.id, baseUrl]);

  const handleNext = useCallback(() => {
    if (selectedPlaceIds.length >= 2) {
      navigation.navigate("BTSLoading");
    }
  }, [selectedPlaceIds, navigation]);

  const selectedCount = selectedPlaceIds.length;
  const canProceed = selectedCount >= 2;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[BTSColors.deepViolet, BTSColors.spaceBlack]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
      />

      {/* 헤더 */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.headerWrap}>
        <BlurView intensity={40} tint="dark" style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {selectedCharacter?.name || ""}의 바이브 스팟
            </Text>
            <Text style={styles.headerSub}>
              {selectedCount}/8 선택됨 · 2개 이상 선택하세요
            </Text>
          </View>
          <View style={styles.backBtn} />
        </BlurView>
      </Animated.View>

      {/* 도시 선택 */}
      <CitySelector />

      {/* 서라운드 영역 */}
      <View style={styles.surroundArea}>
        {isLoadingPlaces ? (
          <ActivityIndicator size="large" color={BTSColors.neonPurple} />
        ) : (
          <>
            {/* 중앙 아바타 */}
            <Animated.View entering={ZoomIn.delay(200).springify()}>
              <LinearGradient
                colors={[gradient[0], gradient[1]]}
                style={styles.centerAvatar}
              >
                <Text style={styles.centerEmoji}>
                  {selectedCharacter?.emoji || "🎵"}
                </Text>
              </LinearGradient>
            </Animated.View>

            {/* 8장 서라운드 카드 */}
            {topPlaces.map((place, i) => (
              <SurroundCard
                key={place.id}
                place={place}
                index={i}
                total={topPlaces.length}
                isSelected={selectedPlaceIds.includes(place.id)}
                onToggle={() => togglePlace(place)}
              />
            ))}
          </>
        )}
      </View>

      {/* 에러 */}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* 하단 게이지 + CTA */}
      <Animated.View
        entering={SlideInDown.delay(600).springify()}
        style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}
      >
        {/* 게이지 바 */}
        <View style={styles.gaugeContainer}>
          <View style={styles.gaugeTrack}>
            <Animated.View
              style={[
                styles.gaugeFill,
                { width: `${(selectedCount / 8) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.gaugeText}>{selectedCount} / 8</Text>
        </View>

        {/* CTA 버튼 */}
        <Pressable onPress={handleNext} disabled={!canProceed}>
          <LinearGradient
            colors={
              canProceed
                ? [BTSColors.neonPurple, BTSColors.deepViolet]
                : ["#374151", "#1F2937"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.ctaBtn, !canProceed && { opacity: 0.5 }]}
          >
            <Text style={styles.ctaText}>AI 동선 최적화 🧠</Text>
          </LinearGradient>
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
  headerWrap: {
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
    fontSize: 20,
    fontWeight: "600",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BTSColors.textPrimary,
  },
  headerSub: {
    fontSize: 10,
    color: BTSColors.textTertiary,
    marginTop: 2,
  },

  // City selector
  cityRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  cityChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  cityChipActive: {
    backgroundColor: BTSColors.purpleGlowLight,
    borderColor: BTSColors.neonPurple,
  },
  cityChipText: {
    fontSize: 13,
    color: BTSColors.textSecondary,
    fontWeight: "500",
  },
  cityChipTextActive: {
    color: BTSColors.neonPurple,
    fontWeight: "700",
  },

  // Surround area
  surroundArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerAvatar: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: BTSColors.neonPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
  },
  centerEmoji: {
    fontSize: 40,
  },

  // Surround cards
  cardPressable: {
    position: "absolute",
  },
  surroundCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: BTSBorderRadius.sm,
    backgroundColor: BTSColors.glassBg,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  surroundCardSelected: {
    borderColor: BTSColors.neonPurple,
    backgroundColor: BTSColors.purpleGlowLight,
    shadowColor: BTSColors.neonPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  cardEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  cardName: {
    fontSize: 10,
    fontWeight: "600",
    color: BTSColors.textPrimary,
    textAlign: "center",
    lineHeight: 14,
  },
  cardPrice: {
    fontSize: 9,
    color: BTSColors.neonPurple,
    fontWeight: "700",
    marginTop: 2,
  },
  checkBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: BTSColors.neonPurple,
    justifyContent: "center",
    alignItems: "center",
  },
  checkText: {
    fontSize: 10,
    color: "#FFF",
    fontWeight: "800",
  },

  // Error
  errorText: {
    color: BTSColors.danger,
    textAlign: "center",
    fontSize: 13,
    paddingHorizontal: 20,
  },

  // Bottom
  bottomArea: {
    paddingHorizontal: 24,
    gap: 12,
  },
  gaugeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  gaugeTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: BTSColors.neonPurple,
  },
  gaugeText: {
    fontSize: 12,
    color: BTSColors.textSecondary,
    fontWeight: "700",
    minWidth: 35,
    textAlign: "right",
  },
  ctaBtn: {
    paddingVertical: 18,
    borderRadius: BTSBorderRadius["2xl"],
    alignItems: "center",
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
