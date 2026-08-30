// ⚠️ 수정금지(승인필요) — BTS Screen D: 장소 카트 (화이트 프리미엄 + 글라스 극투명 + HERO 최대화)
import React, {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useRef,
} from "react";
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
import { useTranslation } from "react-i18next";
// ⚠️ 수정금지(승인필요) — 2026-04-21 expo-image로 교체: react-native Image는 newArchEnabled + Android Fresco 조합에서 Wikimedia URL 로드 실패(실기 증상). DestinationDetailScreen 이 검증된 루트
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainAppBottomTabBar from "@/components/MainAppBottomTabBar";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { CharacterGradients } from "@/constants/bts-theme";
import {
  useBTS,
  pickImminentCities,
  type BTSPlace,
  type BTSCity,
} from "@/contexts/BTSContext";
import { getApiUrl } from "@/lib/query-client";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";
import LiquidButton from "@/components/ui/LiquidButton";
import { changeLanguageAndPersist } from "@/lib/i18n";
// ⚠️ 수정금지(승인필요) — 2026-05-06 BTS Screen 4 카트 캐러셀 → WebView 지도 (인앱)
import BTSPlaceMap from "@/components/bts/BTSPlaceMap";

import { styles } from "./styles";
import {
  haptic,
  localizedName,
  resolvePlaceImage,
  resolvePlaceImageFull,
  CARD_W,
  CARD_H,
  MAX_PLACES,
} from "./utils";
import PlaceCard from "./components/PlaceCard";
import CharacterHero from "./components/CharacterHero";
import TopHeader from "./components/TopHeader";

// ⚠️ 수정금지(승인필요) — 메인 화면
export default function BTSPlaceCartScreen() {
  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 5b: i18n (메인앱 react-i18next 재사용). BTS ARMY 전세계인 → 언어 전환 지원.
  const { t, i18n } = useTranslation();
  const isKorean = i18n.language?.startsWith("ko") ?? false;
  const handleLangToggle = useCallback((toKo: boolean) => {
    changeLanguageAndPersist(toKo ? "ko" : "en");
  }, []);

  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
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

  // ⚠️ 수정금지(승인필요) — 2026-05-06 Screen 4 카트→지도 = Google Maps API key fetch + ScrollView/카드 ref
  const [mapApiKey, setMapApiKey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}/api/bts/map-config`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!cancelled) setMapApiKey(d?.googleMapsApiKey || null);
      })
      .catch(() => {
        if (!cancelled) setMapApiKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const scrollRef = useRef<ScrollView>(null);
  const cardRefs = useRef<Record<number, View | null>>({});

  // ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-①: 캐스케이드 마운트 게이트 제거.
  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: failedIds/타임아웃/폴백 모두 제거. 실제 이미지 완성까지 무조건 대기 (안전장치 0).
  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 내용 기반 키 (참조 비교 시 fetch마다 새 배열 → 불필요 리셋 + 스피너 재노출 방지).
  const topPlacesKey = useMemo(
    () =>
      topPlaces
        .slice(0, MAX_PLACES)
        .map((p) => p.id)
        .join(","),
    [topPlaces],
  );

  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **다 떴는지 여부는 "어느 도시 것인지"와 한 덩어리**로 둔다.
  const [ready, setReady] = useState<{ key: string; ids: Set<number> }>(() => ({
    key: "",
    ids: new Set(),
  }));
  const expectedCount = Math.min(topPlaces.length, MAX_PLACES);
  const readyCount = ready.key === topPlacesKey ? ready.ids.size : 0;
  const allReady = expectedCount > 0 && readyCount >= expectedCount;

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1j: cardsLayer opacity Reanimated fade-in (allReady 전환 시 부드러움, 깝빡 현상 완화).
  const cardsOpacity = useSharedValue(0);
  useEffect(() => {
    cardsOpacity.value = withTiming(allReady ? 1 : 0, { duration: 300 });
  }, [allReady, cardsOpacity]);
  const cardsLayerStyle = useAnimatedStyle(() => ({
    opacity: cardsOpacity.value,
  }));

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 로드 성공 통보만 유지. useCallback 으로 PlaceCard React.memo 안정화.
  const topPlacesKeyRef = useRef(topPlacesKey);
  topPlacesKeyRef.current = topPlacesKey;
  const handleReady = useCallback((id: number) => {
    const key = topPlacesKeyRef.current;
    setReady((prev) => {
      if (prev.key !== key) return { key, ids: new Set([id]) };
      if (prev.ids.has(id)) return prev;
      const ids = new Set(prev.ids);
      ids.add(id);
      return { key, ids };
    });
  }, []);

  // ⚠️ 수정금지(승인필요) — 공연 임박 상위 5개 = BTSContext 의 pickImminentCities 1벌(§16).
  const cityButtons = useMemo(() => pickImminentCities(cities), [cities]);

  useEffect(() => {
    if (!selectedCharacter || !selectedCity) return;
    // ⚠️ 수정금지(승인필요) 2026-07-30 = **도시를 빠르게 연달아 누를 때의 뒤바뀜 차단.**
    let cancelled = false;
    setIsLoadingPlaces(true);
    setError(null);
    clearSelectedPlaces(); // 도시 전환 시 선택 초기화
    fetch(
      `${baseUrl}/api/bts/top-places?cityId=${selectedCity.id}&memberId=${selectedCharacter.id}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return; // 이미 다른 도시를 누름 = 이 답은 버린다
        // ⚠️ 수정금지(승인필요) — 2026-05-07 안전장치: id=null slot 제외 + 중복 id dedup
        const arr = Array.isArray(data) ? data : [];
        const seen = new Set<number>();
        const dedup = arr.filter((p: any) => {
          if (!p || !p.id || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        setTopPlaces(dedup);
      })
      .catch(() => {
        if (cancelled) return;
        setTopPlaces([]);
        setError(t("bts.placeCart.errorLoad"));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPlaces(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCharacter?.id, selectedCity?.id, baseUrl]);

  const handleNext = useCallback(() => {
    // ⚠️ 수정금지(승인필요) — 2026-08-15 v4 SSOT: 카드 ≥ 4 부터 일정 생성.
    if (selectedPlaceIds.length >= 4) {
      haptic("success");
      navigation.navigate("BTSTrip");
    }
  }, [selectedPlaceIds.length, navigation]);

  // ⚠️ 수정금지(승인필요) — 2026-05-06 마커 클릭 → 인앱 ScrollView 의 해당 카드 상세 섹션으로 scrollTo (= 모달 X)
  const handleMarkerPress = useCallback((placeId: number) => {
    haptic("light");
    const node = cardRefs.current[placeId];
    if (!node || !scrollRef.current) return;
    node.measureLayout(
      scrollRef.current as any,
      (_x, y) =>
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }),
      () => {},
    );
  }, []);

  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **날아가는 도중에 도시가 바뀌면 담지 않는다.**
  const cartGen = useRef(0);
  const handleTogglePlace = useCallback(
    (place: BTSPlace, gen?: number) => {
      if (gen !== undefined && gen !== cartGen.current) return; // 지난 도시의 카드 = 버린다
      haptic("light");
      togglePlace(place);
    },
    [togglePlace],
  );

  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **지금 보고 있는 도시를 다시 누르면 아무 일도 안 한다.**
  const handleCityPick = useCallback(
    (city: BTSCity) => {
      if (city.id === selectedCity?.id) return;
      cartGen.current += 1; // 도시가 실제로 바뀌는 그 순간에만 세대를 올린다
      haptic("light");
      setSelectedCity(city);
    },
    [setSelectedCity, selectedCity?.id],
  );

  const selectedCount = selectedPlaceIds.length;
  // ⚠️ 수정금지(승인필요) — 2026-08-15 v4 SSOT: 카드 ≥ 4 부터 CTA 활성. 옛 "3부터" 폐기 사유 = handleNext 주석 참고.
  const canProceed = selectedCount >= 4;

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 — 담길 때마다 게이지가 **차오르고** 숫자칸이 톡 튄다.
  const gaugePct = useSharedValue(0);
  const cartPop = useSharedValue(1);
  useEffect(() => {
    gaugePct.value = withTiming((selectedCount / MAX_PLACES) * 100, {
      duration: 420,
    });
    if (selectedCount > 0) {
      cartPop.value = withSequence(
        withTiming(1.18, { duration: 140 }),
        withTiming(1, { duration: 220 }),
      );
    }
  }, [selectedCount, gaugePct, cartPop]);
  const gaugeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: gaugePct.value / 100 }],
  }));
  const cartTitleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cartPop.value }],
  }));

  // ⚠️ 수정금지(승인필요) — 2026-05-06 venue (slot 1 = bts_venue) id 추출 = 지도 마커 항상 표시 + 2 중 상태
  const venueId = useMemo(() => {
    const v = topPlaces.find((p) => p.seedCategory === "bts_venue");
    return v?.id ?? null;
  }, [topPlaces]);

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 — 들어오면 **공연장 카드가 스스로 한 번 담긴다.**
  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 — 기준은 **도시 번호가 아니라 실제 장소 8장의 목록**(topPlacesKey).
  const autoDemoedKey = useRef<string | null>(null);
  const [autoPickId, setAutoPickId] = useState<number | null>(null);
  useEffect(() => {
    if (autoDemoedKey.current !== topPlacesKey) {
      autoDemoedKey.current = null; // 장소 목록이 바뀌면 다시 무장
      setAutoPickId(null);
    }
    if (selectedPlaceIds.length > 0) {
      if (autoPickId !== null) setAutoPickId(null);
      return;
    }
    if (!allReady || autoDemoedKey.current === topPlacesKey) return;
    autoDemoedKey.current = topPlacesKey;
    setAutoPickId(venueId ?? topPlaces[0]?.id ?? null);
  }, [
    allReady,
    topPlacesKey,
    selectedPlaceIds.length,
    venueId,
    topPlaces,
    autoPickId,
  ]);

  // ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a: 카트 배열 = selectedPlaceIds 순서대로 topPlaces 에서 조회.
  const topPlacesById = useMemo(
    () => new Map(topPlaces.map((p) => [p.id, p])),
    [topPlaces],
  );
  const selectedPlaces = useMemo(
    () =>
      selectedPlaceIds
        .map((id) => topPlacesById.get(id))
        .filter((p): p is BTSPlace => !!p),
    [selectedPlaceIds, topPlacesById],
  );

  // ⚠️ 수정금지(승인필요) — 반응형 HERO 영역 계산
  const hero = useMemo(() => {
    const topArea = insets.top + 4 + 36 + 8 + 32 + 8; // ~100
    const bottomArea = insets.bottom + 16 + 24 + 10 + 52 + 16; // ~120
    const availH = sh - topArea - bottomArea;
    const availW = sw;

    const heroH = Math.min(availH * 0.58, 260);
    const heroW = heroH * (16 / 22); // 16:22 비율 유지

    // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 = 최대한 안 겹치게: cap 145/210 → 155/240
    const radiusX = Math.min((availW - CARD_W) / 2 - 12, 155);
    const radiusY = Math.min((availH - CARD_H) / 2 - 12, 240);

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
      {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 5b: 우측 상단 언어 스위치 (iOS 스타일). back 반대 위치. Screen 4 부터 노출. */}
      <TopHeader
        insetsTop={insets.top}
        tint={tint}
        isKorean={isKorean}
        onBack={() => navigation.goBack()}
        onLangToggle={handleLangToggle}
        backLabel={t("common.back")}
        cityButtons={cityButtons}
        selectedCityId={selectedCity?.id}
        onCityPick={handleCityPick}
      />

      {/* ⚠️ 수정금지(승인필요) — 2026-04-22 Part B: 전체 스크롤존. 궤도 + 카트 + 상세 섹션 + CTA 모두 포함. */}
      {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a v2 (사용자 피드백): CTA 가 스크롤과 함께 움직이도록 ScrollView 안으로 복귀. */}
      {/* ⚠️ 2026-07-31 = 여백 + 하단바 높이. 그 뒤(7-30) 하단 5단바가 고정 부착됐는데 여백이 그대로라
          스크롤 끝에서 [같이 떠나요]가 바에 덮여 안 눌렸다(DevTools 좌표 실측). 최신 결정 우선 = 바 높이만큼 보정. */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 88 },
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
              {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1j: Reanimated withTiming 300ms 로 부드러운 fade-in. */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFillObject,
                  styles.cardsLayer,
                  cardsLayerStyle,
                ]}
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
                {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a: 카트에 담긴 카드는 궤도에서 완전히 사라짐 (frame + image + label 전체). 빈 액자 금지. 캐릭터 노출 효과. */}
                {topPlaces.slice(0, MAX_PLACES).map((place, i) =>
                  i <= readyCount && !selectedPlaceIds.includes(place.id) ? (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      displayName={localizedName(place, isKorean)}
                      posX={positions[i].x}
                      posY={positions[i].y}
                      onToggle={handleTogglePlace}
                      onReady={handleReady}
                      flyY={hero.radiusY + 90}
                      gen={cartGen.current}
                      /** ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 — 공연장 카드 **한 장만** */
                      autoPick={place.id === autoPickId}
                    />
                  ) : null,
                )}
              </Animated.View>
            </>
          )}
        </View>

        {/* 에러 */}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* ⚠️ 수정금지(승인필요) — 2026-05-06 BTS Screen 4 v3 SSOT: 카트 가로 캐러셀 (76×100 썸네일) → WebView 인앱 지도 교체 */}
        {/* venue (= 별 마커) 항상 표시. 첫 카드 떼면 → 별 + "BTS" 라벨 활성화 (= 사용자 직관 = 공연장) */}
        {/* 마커 클릭 → 아래 상세 섹션의 해당 카드로 인앱 scrollTo (= 모달 X) */}
        <View style={styles.mapSection}>
          {/* ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 — 카드가 날아와 **꽂히는 자리**.
              한 장 담길 때마다 숫자가 톡 튄다 = 착지 신호(설명문을 넣으려던 자리를 목적지로 씀). */}
          <Animated.Text
            style={[styles.cartTitle, { color: tint }, cartTitleStyle]}
          >
            {t("bts.placeCart.cartTitle", {
              count: selectedCount,
              max: MAX_PLACES,
            })}
          </Animated.Text>
          <BTSPlaceMap
            places={topPlaces.slice(0, MAX_PLACES)}
            selectedIds={selectedPlaceIds}
            venueId={venueId}
            apiKey={mapApiKey}
            onMarkerPress={handleMarkerPress}
            tint={tint}
            height={240}
          />
        </View>

        {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a: 상세 섹션 쭈르륵 쌓임. placeholder=330 즉시 + source=1280 백그라운드 교체 (사용자 체감 딜레이 0, 점점 선명). */}
        {/* ⚠️ 수정금지(승인필요) — 2026-05-06: 카드별 ref = 지도 마커 클릭 시 scrollTo 대상 (= 인앱 처리, 모달 X) */}
        {selectedPlaces.map((p, idx) => (
          <View
            key={p.id}
            ref={(el) => {
              cardRefs.current[p.id] = el;
            }}
            style={styles.detailSection}
          >
            {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a: recyclingKey 로 Samsung A36 5G 메모리 관리. 1280px × 8 = ~39MB 우려 완화. */}
            <Image
              source={resolvePlaceImageFull(p)}
              placeholder={resolvePlaceImage(p)}
              style={styles.detailImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              recyclingKey={`detail-${p.id}`}
            />
            <View style={styles.detailInfo}>
              <Text style={[styles.detailIndex, { color: tint }]}>
                {idx + 1}
              </Text>
              <Text style={styles.detailTitle} numberOfLines={2}>
                {localizedName(p, isKorean)}
              </Text>
              {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a v3: 도시 버튼(LiquidButton)과 껍데기 + 폰트 완전 통일. */}
              <LiquidButton
                label={t("bts.placeCart.remove")}
                size="sm"
                tint={tint}
                onPress={() => handleTogglePlace(p)}
              />
            </View>
          </View>
        ))}

        {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a v2 (사용자 피드백): CTA 플로팅 고정 해제 → ScrollView 안 마지막 위치 (컨텐츠와 함께 스크롤). 하단 고정이 카트 캐러셀을 가리던 문제 해결. */}
        <View style={styles.bottomArea}>
          <View style={styles.gaugeRow}>
            <View style={styles.gaugeTrack}>
              {/* ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 — 게이지는 **차오른다**.
                  옛 즉시 폭 변경 폐기 = 2026-08-08 §19(툭 바뀌어 차오르는 느낌이 없었음). */}
              <Animated.View
                style={[
                  styles.gaugeFill,
                  { backgroundColor: tint },
                  gaugeStyle,
                ]}
              />
            </View>
            <Text style={[styles.gaugeText, { color: tint }]}>
              {selectedCount} / {MAX_PLACES}
            </Text>
          </View>

          <Pressable onPress={handleNext} disabled={!canProceed}>
            <LinearGradient
              colors={
                canProceed ? [gradient[0], gradient[1]] : ["#CCCCCC", "#999999"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.ctaBtn, !canProceed && { opacity: 0.5 }]}
            >
              <Text style={styles.ctaText}>{t("bts.placeCart.cta")}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>

      {/* 📌 메인앱 5단 하단 탭바 고정 부착 */}
      <MainAppBottomTabBar activeTab="BTS" />
    </View>
  );
}
