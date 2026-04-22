// ⚠️ 수정금지(승인필요) — BTS Screen D: 장소 카트 (화이트 프리미엄 + 글라스 극투명 + HERO 최대화)
// REF: Screen C BTSCharacterSelectScreen 패턴 / docs/design-references/button-system-shadcn.tsx
// 2026-04-17 재설계 — 다크→화이트, 이모지 제거, 헤더 최소화, 도시 5등분, 캐릭터 Rive 폴백
import React, { useEffect, useCallback, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
// ⚠️ 수정금지(승인필요) — 2026-04-21 expo-image로 교체: react-native Image는 newArchEnabled + Android Fresco 조합에서 Wikimedia URL 로드 실패(실기 증상). DestinationDetailScreen 이 검증된 루트
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { CharacterGradients } from "@/constants/bts-theme";
import { BTS_CHARACTER_IMAGES } from "@/constants/bts-characters";
import { useBTS, type BTSPlace, type BTSCity } from "@/contexts/BTSContext";
import { getApiUrl } from "@/lib/query-client";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";
import LiquidButton from "@/components/ui/LiquidButton";

// ⚠️ 수정금지(승인필요) — 카테고리별 목업 사진 폴백
// TODO: assets/images/bts-place-mocks/ 실제 이미지 수급 후 require() 로 교체
// 현재는 imageUrl이 null일 때 캐릭터 대표 이미지 재활용 (임시)
const CATEGORY_MOCK_URL: Record<string, string> = {
  attraction: "https://images.unsplash.com/photo-1566127992631-137a642a90f4?w=400",
  healing: "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=400",
  restaurant: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400",
  hotspot: "https://images.unsplash.com/photo-1470004914212-05527e49370b?w=400",
  adventure: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400",
};
const DEFAULT_MOCK_URL =
  "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=400";

// ⚠️ 수정금지(승인필요) — Haptics 유틸 (Screen C와 동일)
const haptic = (t: "light" | "medium" | "success") => {
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — 장소 사진 소스 결정 (로우데이터 → 카테고리 목업 → 기본)
function resolvePlaceImage(place: BTSPlace): { uri: string } {
  if (place.imageUrl) return { uri: place.imageUrl };
  const cat = place.seedCategory || "";
  return { uri: CATEGORY_MOCK_URL[cat] || DEFAULT_MOCK_URL };
}

// ⚠️ 수정금지(승인필요) — 장소 글라스 카드 (사진 내장 + 극투명)
type PlaceCardProps = {
  place: BTSPlace;
  index: number;
  total: number;
  isSelected: boolean;
  onToggle: () => void;
  radiusX: number;
  radiusY: number;
  tint: string;
};

const PlaceCard = React.memo(function PlaceCard({
  place,
  index,
  total,
  isSelected,
  onToggle,
  radiusX,
  radiusY,
  tint,
}: PlaceCardProps) {
  // ⚠️ 수정금지(승인필요) — 타원형 원주 배치 (perspective 느낌)
  const angle = (index / total) * (2 * Math.PI) - Math.PI / 2;
  const x = Math.cos(angle) * radiusX;
  const y = Math.sin(angle) * radiusY;

  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x - CARD_W / 2 },
      { translateY: y - CARD_H / 2 },
      { scale: scale.value * (isSelected ? 1.05 : 1) },
    ],
  }));

  const img = resolvePlaceImage(place);

  // ⚠️ 수정금지(승인필요) — 2026-04-22 Android 네트워크 실패 onError 재시도 (최대 2회)
  // 원인: Android OkHttp/Glide 8장 동시 fetch 중 일부 Failed to load. key 변경으로 재마운트하여 재fetch
  // useRef로 timer 추적 + unmount cleanup → 언마운트된 컴포넌트 setState 방지
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return (
    <Animated.View style={[styles.cardAbsolute, animStyle]}>
      <Pressable
        onPress={() => {
          scale.value = withSequence(
            withSpring(0.9, { damping: 12, stiffness: 220 }),
            withSpring(1, { damping: 14, stiffness: 160 })
          );
          onToggle();
        }}
        style={[
          styles.cardPressable,
          {
            // ⚠️ 수정금지(승인필요) — 2026-04-21 인스타 스타일 전환: 테두리 제거 (선택은 shadow glow로 구분)
            borderWidth: 0,
            shadowColor: isSelected ? tint : "#000",
            shadowOpacity: isSelected ? 0.45 : 0.12,
            shadowRadius: isSelected ? 14 : 6,
          },
        ]}
      >
        {/* ⚠️ 수정금지(승인필요) — 2026-04-21 인스타 스타일: BlurView 글라스 + 흰 오버레이 제거, 사진 자체만 노출 */}
        {/* ⚠️ 수정금지(승인필요) — 2026-04-21 Android 타이밍/네트워크 대응: priority high + cachePolicy memory-disk + transition (8장 동시 fetch 시 일부 실패 방지) */}
        <Image
          key={`${place.id}-${retryCount}`}
          source={img}
          style={styles.cardImage}
          contentFit="cover"
          priority="high"
          cachePolicy="memory-disk"
          transition={200}
          onError={() => {
            if (retryCount < 2) {
              retryTimerRef.current = setTimeout(() => setRetryCount((c) => c + 1), 400);
            }
          }}
        />
        {/* 하단 텍스트 영역 */}
        <View style={styles.cardLabel}>
          <Text numberOfLines={2} style={styles.cardLabelText}>
            {place.nameKo || place.nameEn}
          </Text>
        </View>
        {/* 선택 배지 */}
        {isSelected && (
          <View style={[styles.checkBadge, { backgroundColor: tint }]}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

// ⚠️ 수정금지(승인필요) — 중앙 캐릭터 카드 (전신 + 장소 선택 시 반응 애니메이션)
// TODO: Rive 파일(.riv) 수급 후 <Rive source=... />로 대체 — 캐릭터별 7종
function CharacterHero({
  characterId,
  gradient,
  selectedCount,
  w,
  h,
}: {
  characterId: string;
  gradient: readonly [string, string];
  selectedCount: number;
  w: number;
  h: number;
}) {
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);

  // 선택 개수 변화 시 반응 애니메이션 (Rive 폴백)
  useEffect(() => {
    if (selectedCount === 0) return;
    scale.value = withSequence(
      withSpring(1.08, { damping: 10, stiffness: 220 }),
      withSpring(1, { damping: 14, stiffness: 160 })
    );
    tilt.value = withSequence(
      withSpring(3, { damping: 10, stiffness: 220 }),
      withSpring(0, { damping: 14, stiffness: 160 })
    );
  }, [selectedCount]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotateZ: `${tilt.value}deg` }],
  }));

  const imgSource = BTS_CHARACTER_IMAGES[characterId] || BTS_CHARACTER_IMAGES.collector;

  return (
    <Animated.View
      style={[
        styles.heroCard,
        {
          width: w,
          height: h,
          // ⚠️ 수정금지(승인필요) — 2026-04-21 인스타 스타일: borderColor 제거 (heroCard의 borderWidth 0). shadowColor만 유지
          shadowColor: gradient[0],
        },
        animStyle,
      ]}
    >
      <Image
        source={imgSource}
        style={styles.heroImage}
        contentFit="cover"
        priority="high"
        cachePolicy="memory-disk"
        transition={200}
      />
    </Animated.View>
  );
}

// 카드 사이즈 상수
const CARD_W = 86;
const CARD_H = 116;

// ⚠️ 수정금지(승인필요) — 메인 화면
export default function BTSPlaceCartScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const { width: sw, height: sh } = useWindowDimensions();
  const {
    selectedCharacter,
    selectedCity,
    topPlaces,
    selectedPlaceIds,
    cities,
    isLoadingPlaces,
    error,
    setSelectedCity,
    setTopPlaces,
    setIsLoadingPlaces,
    togglePlace,
    clearSelectedPlaces,
    setError,
  } = useBTS();

  const baseUrl = getApiUrl();
  const gradient = CharacterGradients[selectedCharacter?.id || "collector"];
  const tint = gradient[0];

  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // ⚠️ 수정금지(승인필요) — 공연 임박 순 상위 5개 도시 (폴백: btsRank 순)
  const cityButtons = useMemo(() => {
    const withDate = cities.filter((c) => c.nextConcertDate);
    if (withDate.length > 0) {
      const sorted = [...withDate].sort((a, b) =>
        (a.nextConcertDate || "").localeCompare(b.nextConcertDate || "")
      );
      return sorted.slice(0, 5);
    }
    return cities.slice(0, 5);
  }, [cities]);

  // 장소 로드 (캐릭터 + 도시 선택 시)
  useEffect(() => {
    if (!selectedCharacter || !selectedCity) return;
    setIsLoadingPlaces(true);
    setError(null);
    clearSelectedPlaces(); // 도시 전환 시 선택 초기화
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

  // ⚠️ 수정금지(승인필요) — 2026-04-22 Android 동시성 완화: topPlaces 변경 시 이미지 URL을 순차로 prefetch
  // 원인: 8장 병렬 fetch에서 Android OkHttp/Glide가 일부 연결 실패(Failed to load). 순차 prefetch로 동시성 회피 + disk 캐시 적재
  // expo-image 공식 API: https://docs.expo.dev/versions/latest/sdk/image/#imageprefetchurl-cachepolicy
  useEffect(() => {
    if (!topPlaces.length) return;
    let cancelled = false;
    (async () => {
      for (const p of topPlaces) {
        if (cancelled) break;
        try {
          await Image.prefetch(resolvePlaceImage(p).uri, "memory-disk");
        } catch {
          // prefetch 실패는 무시 — 카드의 onError retry가 처리
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topPlaces]);

  const handleNext = useCallback(() => {
    if (selectedPlaceIds.length >= 2) {
      haptic("success");
      navigation.navigate("BTSLoading");
    }
  }, [selectedPlaceIds.length, navigation]);

  const handleTogglePlace = useCallback(
    (place: BTSPlace) => {
      haptic("light");
      togglePlace(place);
    },
    [togglePlace]
  );

  const handleCityPick = useCallback(
    (city: BTSCity) => {
      haptic("light");
      setSelectedCity(city);
    },
    [setSelectedCity]
  );

  const selectedCount = selectedPlaceIds.length;
  const canProceed = selectedCount >= 2;

  // ⚠️ 수정금지(승인필요) — 반응형 HERO 영역 계산
  const hero = useMemo(() => {
    const topArea = insets.top + 4 + 36 + 8 + 32 + 8; // ~100
    const bottomArea = insets.bottom + 16 + 24 + 10 + 52 + 16; // ~120
    const availH = sh - topArea - bottomArea;
    const availW = sw;

    // 중앙 캐릭터 카드 크기 — 가용 공간의 55% 또는 최대 220
    const heroH = Math.min(availH * 0.58, 260);
    const heroW = heroH * (16 / 22); // 16:22 비율 유지

    // 원주 배치 반지름 — 타원형(가로 넓고, 세로 짧음)
    const radiusX = Math.min(availW * 0.42, 170);
    const radiusY = Math.min(availH * 0.42, 200);

    return { heroW, heroH, radiusX, radiusY, availW, availH };
  }, [sw, sh, insets.top, insets.bottom]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ⚠️ 수정금지(승인필요) — 미세 틴트 그라디언트 배경 (글라스 효과 확보용) */}
      <LinearGradient
        colors={["#FFFFFF", (tint + "0A") as any]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* 뒤로가기 행 */}
      <View style={[styles.backRow, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="뒤로가기"
        >
          <BlurView
            intensity={40}
            tint="light"
            style={StyleSheet.absoluteFillObject}
          />
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(255,255,255,0.3)" },
            ]}
          />
          <Text style={styles.backText}>←</Text>
        </Pressable>
      </View>

      {/* 도시 버튼 5등분 (공연 임박 순) */}
      <View style={styles.cityRow}>
        {cityButtons.map((city) => (
          <LiquidButton
            key={city.id}
            label={city.nameKo || city.nameEn}
            size="md"
            flex={1}
            tint={tint}
            variant={selectedCity?.id === city.id ? "selected" : "default"}
            onPress={() => handleCityPick(city)}
          />
        ))}
      </View>

      {/* HERO 영역 — 중앙 캐릭터 + 8장 장소 카드 */}
      <View style={styles.heroArea}>
        {isLoadingPlaces ? (
          <ActivityIndicator size="large" color={tint} />
        ) : (
          <>
            {selectedCharacter && (
              <CharacterHero
                characterId={selectedCharacter.id}
                gradient={gradient}
                selectedCount={selectedCount}
                w={hero.heroW}
                h={hero.heroH}
              />
            )}
            {topPlaces.map((place, i) => (
              <PlaceCard
                key={place.id}
                place={place}
                index={i}
                total={topPlaces.length}
                isSelected={selectedPlaceIds.includes(place.id)}
                onToggle={() => handleTogglePlace(place)}
                radiusX={hero.radiusX}
                radiusY={hero.radiusY}
                tint={tint}
              />
            ))}
          </>
        )}
      </View>

      {/* 에러 */}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* 하단 — 게이지 + CTA "같이 떠나요" */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}>
        {/* 게이지 바 */}
        <View style={styles.gaugeRow}>
          <View style={styles.gaugeTrack}>
            <View
              style={[
                styles.gaugeFill,
                {
                  width: `${(selectedCount / 8) * 100}%`,
                  backgroundColor: tint,
                },
              ]}
            />
          </View>
          <Text style={[styles.gaugeText, { color: tint }]}>
            {selectedCount} / 8
          </Text>
        </View>

        {/* CTA 버튼 */}
        <Pressable onPress={handleNext} disabled={!canProceed}>
          <LinearGradient
            colors={canProceed ? [gradient[0], gradient[1]] : ["#CCCCCC", "#999999"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.ctaBtn, !canProceed && { opacity: 0.5 }]}
          >
            <Text style={styles.ctaText}>같이 떠나요</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // ⚠️ 수정금지(승인필요) — 뒤로가기 행
  backRow: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  backText: {
    fontSize: 18,
    fontFamily: "Pretendard-Bold",
    fontWeight: "700",
    color: "#1A1A1A",
  },

  // ⚠️ 수정금지(승인필요) — 도시 버튼 행 (5등분, 세로 여백 최소)
  cityRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },

  // ⚠️ 수정금지(승인필요) — HERO 영역 (flex: 1로 모든 여유 공간 흡수)
  heroArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },

  // 중앙 캐릭터 카드
  // ⚠️ 수정금지(승인필요) — 2026-04-21 인스타 스타일: heroCard 테두리(borderWidth 3) 제거. 형태는 borderRadius 20 유지, shadow로 입체감
  heroCard: {
    borderRadius: 20,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    backgroundColor: "#FFFFFF",
    zIndex: 20,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },

  // 장소 카드 (절대 배치)
  cardAbsolute: {
    position: "absolute",
    width: CARD_W,
    height: CARD_H,
    left: "50%",
    top: "50%",
    zIndex: 10,
  },
  cardPressable: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  cardLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  cardLabelText: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    fontWeight: "700",
    color: "#1A1A1A",
    textAlign: "center",
    lineHeight: 13,
  },
  checkBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  checkText: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "900",
  },

  // ⚠️ 수정금지(승인필요) — 에러 텍스트
  errorText: {
    color: "#EF4444",
    textAlign: "center",
    fontSize: 12,
    paddingHorizontal: 20,
    fontFamily: "Pretendard-Bold",
  },

  // ⚠️ 수정금지(승인필요) — 하단 영역
  bottomArea: {
    paddingHorizontal: 20,
    gap: 10,
  },
  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  gaugeTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F0F0F0",
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 3,
  },
  gaugeText: {
    fontSize: 12,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    minWidth: 40,
    textAlign: "right",
  },
  ctaBtn: {
    paddingVertical: 16,
    borderRadius: 26,
    alignItems: "center",
  },
  ctaText: {
    fontSize: 15,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
