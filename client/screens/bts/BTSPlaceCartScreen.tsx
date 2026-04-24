// ⚠️ 수정금지(승인필요) — BTS Screen D: 장소 카트 (화이트 프리미엄 + 글라스 극투명 + HERO 최대화)
// REF: Screen C BTSCharacterSelectScreen 패턴 / docs/design-references/button-system-shadcn.tsx
// 2026-04-17 재설계 — 다크→화이트, 이모지 제거, 헤더 최소화, 도시 5등분, 캐릭터 Rive 폴백
import React, { useEffect, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
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

// ⚠️ 수정금지(승인필요) — Haptics 유틸 (Screen C와 동일)
const haptic = (t: "light" | "medium" | "success") => {
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — 2026-04-24 W-6 옵션 A: Wikimedia 공식 허용 버킷 스냅 방식.
// T414805/Common_thumbnail_sizes 공식 문서 기준 허용 width 목록. 그 외 사이즈는 HTTP 400 거부.
// Screen 4 카드(100×178 dp, dpr 2.75 → 물리 275~490px) → nearest-up bucket = 330px.
const WIKIMEDIA_BUCKETS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];
const WIKIMEDIA_PX_REGEX = /\/\d+px-/;
const UNSPLASH_W_REGEX = /([?&])w=\d+/g;

function snapToWikimediaBucket(targetPx: number): number {
  return WIKIMEDIA_BUCKETS.find((b) => b >= targetPx) ?? 3840;
}

// 카드 썸네일용 (330px). Wikimedia URL 변환 + Unsplash w=300 동시 처리.
function toCardThumbUrl(url: string): string {
  if (url.includes("upload.wikimedia.org/wikipedia/commons/thumb/")) {
    const bucket = snapToWikimediaBucket(330);
    return url.replace(WIKIMEDIA_PX_REGEX, `/${bucket}px-`);
  }
  if (url.includes("images.unsplash.com")) {
    return url.replace(UNSPLASH_W_REGEX, "$1w=300");
  }
  return url;
}

// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 스톡 폴백 제거. imageUrl 없으면 undefined → 빈 카드. 가짜 스톡 사진 절대 노출 안 함.
function resolvePlaceImage(place: BTSPlace): { uri: string } | undefined {
  if (!place.imageUrl) return undefined;
  return { uri: toCardThumbUrl(place.imageUrl) };
}

// ⚠️ 수정금지(승인필요) — 장소 글라스 카드 (사진 내장 + 극투명)
// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 자해 타임아웃 제거. Glide 가 완성할 때까지 무조건 대기. onLoad → readyIds 부모 통보.
type PlaceCardProps = {
  place: BTSPlace;
  posX: number;
  posY: number;
  isSelected: boolean;
  onToggle: (place: BTSPlace) => void;
  onReady: (id: number) => void;
  tint: string;
};

const PlaceCard = React.memo(function PlaceCard({
  place,
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
            withSpring(1, { damping: 14, stiffness: 160 })
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
        <Image
          source={img}
          style={styles.cardImage}
          contentFit="cover"
          priority="normal"
          cachePolicy="memory-disk"
          onLoad={() => onReady(place.id)}
        />
        <View style={styles.cardLabel}>
          <Text numberOfLines={2} style={styles.cardLabelText}>
            {place.nameKo || place.nameEn}
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

// ⚠️ 수정금지(승인필요) — 중앙 캐릭터 카드 (전신 이미지만)
// ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-⑦⑧: DIM 오버레이 제거 + tilt/scale 애니메이션 제거 (selectedCount 의존 useEffect 삭제). 정적 표시로 GPU 레이어 축소.
// TODO: Rive 파일(.riv) 수급 후 <Rive source=... />로 대체 — 캐릭터별 7종
function CharacterHero({
  characterId,
  gradient,
  w,
  h,
}: {
  characterId: string;
  gradient: readonly [string, string];
  w: number;
  h: number;
}) {
  const imgSource = BTS_CHARACTER_IMAGES[characterId] || BTS_CHARACTER_IMAGES.collector;

  return (
    <View
      style={[
        styles.heroCard,
        {
          width: w,
          height: h,
          shadowColor: gradient[0],
        },
      ]}
    >
      <Image
        source={imgSource}
        style={styles.heroImage}
        contentFit="cover"
        priority="low"
        cachePolicy="memory-disk"
        transition={200}
      />
    </View>
  );
}

// ⚠️ 수정금지(승인필요) — 2026-04-22 카드 9:16 세로 비율 + 꽉찬 느낌으로 확대 (사용자 스샷 피드백). 86x116 → 100x178
const CARD_W = 100;
const CARD_H = 178; // 100 * 16 / 9 = 177.77

// ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-①: 게이팅 제거로 BATCH_SIZE 불필요. 총 장수만 유지.
const MAX_PLACES = 8;

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

  // ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-①: 캐스케이드 마운트 게이트 제거.
  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: failedIds/타임아웃/폴백 모두 제거. 실제 이미지 완성까지 무조건 대기 (안전장치 0).
  // 사용자 원칙: "선택지 없이 무조건 완성 될때까지 기다림" → 8/8 실사진 readyIds 도달 전엔 스피너 영구.
  const [readyIds, setReadyIds] = useState<Set<number>>(() => new Set());
  const expectedCount = Math.min(topPlaces.length, MAX_PLACES);
  const allReady = expectedCount > 0 && readyIds.size >= expectedCount;

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 내용 기반 키로 리셋 (참조 비교 시 fetch마다 새 배열 → 불필요 리셋 + 스피너 재노출 방지).
  const topPlacesKey = useMemo(
    () => topPlaces.slice(0, MAX_PLACES).map((p) => p.id).join(","),
    [topPlaces]
  );
  useEffect(() => {
    setReadyIds(new Set());
  }, [topPlacesKey]);

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 로드 성공 통보만 유지. useCallback 으로 PlaceCard React.memo 안정화.
  const handleReady = useCallback((id: number) => {
    setReadyIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

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

    // ⚠️ 수정금지(승인필요) — 2026-04-22 모바일 overflow 해결: 카드 가장자리가 화면 안에 들어오도록 반지름 상한 축소. 캐릭터 DIM 뒷장과 겹침 허용(존재감만)
    const radiusX = Math.min((availW - CARD_W) / 2 - 12, 130);
    const radiusY = Math.min((availH - CARD_H) / 2 - 12, 180);

    return { heroW, heroH, radiusX, radiusY, availW, availH };
  }, [sw, sh, insets.top, insets.bottom]);

  // ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-②: 궤도 위치(angle/x/y) 사전 계산. PlaceCard 안 Math.cos/Math.sin 호출 제거, 렌더마다 재계산 방지.
  const positions = useMemo(() => {
    const total = Math.min(topPlaces.length, MAX_PLACES);
    return Array.from({ length: total }, (_, i) => {
      const angle = (i / total) * (2 * Math.PI) - Math.PI / 2;
      return {
        x: Math.cos(angle) * hero.radiusX,
        y: Math.sin(angle) * hero.radiusY,
      };
    });
  }, [topPlaces.length, hero.radiusX, hero.radiusY]);

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

      {/* ⚠️ 수정금지(승인필요) — 2026-04-22 Part B: 상단 고정존 (뒤로가기 + 도시 버튼). 여기까지만 고정, 이하 전부 스크롤 */}
      <View>
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
      </View>

      {/* ⚠️ 수정금지(승인필요) — 2026-04-22 Part B: 전체 스크롤존. 궤도 + 캐릭터 DIM 뒷장 + 게이지 + CTA 모두 포함 (하단 고정존 없음, 사용자 지시). 향후 추가 콘텐츠는 heroArea 아래/게이지 위에 삽입 */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroArea}>
          {isLoadingPlaces ? (
            <ActivityIndicator size="large" color={tint} />
          ) : (
            <>
              {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1c: allReady 전에는 스피너 오버레이 (사용자 원칙: 불완전 노출 금지). */}
              {!allReady && (
                <View style={styles.spinnerOverlay} pointerEvents="none">
                  <ActivityIndicator size="large" color={tint} />
                </View>
              )}

              {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1c: 카드/히어로는 항상 마운트 (이미지 로드 기회 유지) + opacity 로 allReady 전 숨김. 8장 모두 준비되면 일괄 노출. */}
              <View
                style={[StyleSheet.absoluteFillObject, styles.cardsLayer, { opacity: allReady ? 1 : 0 }]}
                pointerEvents={allReady ? "auto" : "none"}
              >
                {selectedCharacter && (
                  <CharacterHero
                    characterId={selectedCharacter.id}
                    gradient={gradient}
                    w={hero.heroW}
                    h={hero.heroH}
                  />
                )}

                {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1h: 순차 마운트. 카드 i 는 i-1 까지 로드 완료 후에만 마운트. Glide 동시성 8개 → Wikimedia Varnish rate-limit (429) 회피. */}
                {topPlaces.slice(0, MAX_PLACES).map((place, i) =>
                  i <= readyIds.size ? (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      posX={positions[i].x}
                      posY={positions[i].y}
                      isSelected={selectedPlaceIds.includes(place.id)}
                      onToggle={handleTogglePlace}
                      onReady={handleReady}
                      tint={tint}
                    />
                  ) : null
                )}
              </View>
            </>
          )}
        </View>

        {/* 에러 */}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* ⚠️ 수정금지(승인필요) — 2026-04-22 Part B: 게이지 + CTA를 스크롤 내부 embed (하단 고정존 폐기 — 사용자: "고정존 만들면 화면 나뉘어 답답함") */}
        <View style={styles.bottomArea}>
          <View style={styles.gaugeRow}>
            <View style={styles.gaugeTrack}>
              <View
                style={[
                  styles.gaugeFill,
                  {
                    width: `${(selectedCount / MAX_PLACES) * 100}%`,
                    backgroundColor: tint,
                  },
                ]}
              />
            </View>
            <Text style={[styles.gaugeText, { color: tint }]}>
              {selectedCount} / {MAX_PLACES}
            </Text>
          </View>

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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-22 전체 스크롤 컨텐츠 여백. 하단 paddingBottom은 insets.bottom으로 런타임 추가
  scrollContent: {
    paddingTop: 0,
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

  // ⚠️ 수정금지(승인필요) — 2026-04-22 HERO 영역 (ScrollView 내부). flex:1 대신 minHeight로 궤도 공간 확보. radiusY(180) * 2 + CARD_H(178) + 여유 → ~540
  heroArea: {
    minHeight: 540,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1c: 8장 로드 대기 스피너 오버레이. heroArea 중앙 배치.
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1c: 카드 + 히어로 레이어. heroArea 와 동일 중앙 정렬 정책 유지.
  cardsLayer: {
    justifyContent: "center",
    alignItems: "center",
  },

  // 중앙 캐릭터 카드
  // ⚠️ 수정금지(승인필요) — 2026-04-22 Part C: zIndex 20 → 1 (카드 z:10 뒤로 이동). 캐릭터는 DIM 뒷장으로 존재감만, 8장 카드가 시각 주인공
  heroCard: {
    borderRadius: 20,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    backgroundColor: "#FFFFFF",
    zIndex: 1,
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

  // ⚠️ 수정금지(승인필요) — 2026-04-22 게이지+CTA 영역 (스크롤 내부 embed). 하단 고정존 폐기 (사용자 지시). paddingBottom은 scrollContent에서 insets.bottom으로 처리
  bottomArea: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
