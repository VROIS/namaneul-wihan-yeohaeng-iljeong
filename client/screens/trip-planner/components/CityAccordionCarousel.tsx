// ⚠️ 수정금지(승인필요) 2026-11-11 사장님 결정 = 상단 도시 3단 아코디언 = 한 벌 트리 + 높이 애니메이션 · 대표 카드 병렬 조회 · 사진 선로딩 뒤 자동 스냅 (정본 2026-11-11)
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { resolveImageSource } from "@/lib/wikimedia-image";
import { Brand, BorderRadius, Fonts, Shadows } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import { apiRequest } from "@/lib/query-client";
import CityCardScreen, {
  CITY_CARD_WIDTH,
  CITY_CARD_GAP,
} from "@/components/tripis/CityCardScreen";
import type { RepCard } from "@/components/tripis/TripisModal";

export type ReadyCity = {
  id: number;
  nameKo: string;
  nameEn: string;
  countryCode?: string | null;
};

export type AccordionStage = 0 | 1 | 2;

export type RegionKey =
  | "france"
  | "europe"
  | "asia"
  | "northAmerica"
  | "southAmerica"
  | "africa"
  | "oceania";

export const REGION_TABS: readonly {
  id: RegionKey;
  labelKey: string;
}[] = [
  { id: "france", labelKey: "trip.regionFrance" },
  { id: "europe", labelKey: "trip.regionEurope" },
  { id: "asia", labelKey: "trip.regionAsia" },
  { id: "northAmerica", labelKey: "trip.regionNorthAmerica" },
  { id: "southAmerica", labelKey: "trip.regionSouthAmerica" },
  { id: "africa", labelKey: "trip.regionAfrica" },
  { id: "oceania", labelKey: "trip.regionOceania" },
] as const;

const EUROPE_CODES = new Set([
  "AD",
  "AT",
  "BE",
  "CH",
  "CZ",
  "DE",
  "DK",
  "ES",
  "FI",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LU",
  "MC",
  "NL",
  "NO",
  "PL",
  "PT",
  "SE",
  "TR",
]);
const ASIA_CODES = new Set([
  "CN",
  "HK",
  "ID",
  "IN",
  "JP",
  "KR",
  "MY",
  "PH",
  "SG",
  "TH",
  "TW",
  "VN",
]);
const NORTH_AMERICA_CODES = new Set(["CA", "MX", "US"]);
const SOUTH_AMERICA_CODES = new Set(["AR", "BR", "CL", "CO", "PE"]);
const AFRICA_CODES = new Set(["KE", "MA", "TN"]);
const OCEANIA_CODES = new Set(["AU", "NZ"]);

export function regionOfCountry(code?: string | null): RegionKey {
  const c = (code || "").toUpperCase();
  if (c === "FR") return "france";
  if (EUROPE_CODES.has(c)) return "europe";
  if (ASIA_CODES.has(c)) return "asia";
  if (NORTH_AMERICA_CODES.has(c)) return "northAmerica";
  if (SOUTH_AMERICA_CODES.has(c)) return "southAmerica";
  if (AFRICA_CODES.has(c)) return "africa";
  if (OCEANIA_CODES.has(c)) return "oceania";
  return "europe";
}

function fallbackRep(city: ReadyCity): RepCard {
  return {
    itineraryId: null,
    cityId: city.id,
    nameKo: city.nameKo,
    nameEn: city.nameEn,
    country: null,
    countryCode: city.countryCode ?? null,
    highlights: [],
    dayCount: 0,
    imageUrl: null,
    placeId: null,
    hasGuide: false,
    hasVideo: false,
    videoItineraryId: null,
    videoDay: null,
  };
}

const STEP_PX = CITY_CARD_WIDTH + CITY_CARD_GAP;
const STAGE_MS = 220;
const STAGE1_ESTIMATE_PX = 214;
const STAGE2_ESTIMATE_PX = 280;

// 앱을 켜 둔 동안 한 번 받은 대표 카드는 다시 받지 않는다
const repCache = new Map<string, RepCard>();

async function fetchRep(city: ReadyCity, lang: string): Promise<RepCard> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await apiRequest(
        "GET",
        `/api/cities/${city.id}/representative?lang=${encodeURIComponent(lang)}`,
      );
      const data: RepCard = await res.json();
      repCache.set(`${city.id}:${lang}`, data);
      return data;
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return fallbackRep(city);
}

interface Props {
  readyCities: ReadyCity[];
  selectedDestination: string;
  stage: AccordionStage;
  onStageChange(stage: AccordionStage): void;
  onPressBts(): void;
  onSelectCity(city: ReadyCity, collapseToPill: boolean): void;
  onCreatePopularTrip(city: ReadyCity): void;
  onOpenVideo(city: ReadyCity, rep: RepCard): void;
  onOpenGuide(city: ReadyCity, rep: RepCard): void;
  onOpenCourse(city: ReadyCity, rep: RepCard): void;
}

export default function CityAccordionCarousel({
  readyCities,
  selectedDestination,
  stage,
  onStageChange,
  onPressBts,
  onSelectCity,
  onCreatePopularTrip,
  onOpenVideo,
  onOpenGuide,
  onOpenCourse,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "ko";
  const [activeRegion, setActiveRegion] = useState<RegionKey>("france");
  const [repMap, setRepMap] = useState<Record<string, RepCard>>(() =>
    Object.fromEntries(repCache),
  );
  const [photosReady, setPhotosReady] = useState(false);
  const [stage2Mounted, setStage2Mounted] = useState(stage === 2);
  const inflightRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const carouselScrollRef = useRef<ScrollView | null>(null);
  const autoIdxRef = useRef(0);
  const userTouchedRef = useRef(false);
  const stageSv = useSharedValue<number>(stage);
  const h1 = useSharedValue(STAGE1_ESTIMATE_PX);
  const h2 = useSharedValue(STAGE2_ESTIMATE_PX);

  useEffect(() => {
    stageSv.value = withTiming(stage, {
      duration: STAGE_MS,
      easing: Easing.out(Easing.cubic),
    });
    if (stage === 2) setStage2Mounted(true);
  }, [stage, stageSv]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: interpolate(
      stageSv.value,
      [0, 1, 2],
      [0, h1.value, h2.value],
      Extrapolation.CLAMP,
    ),
    marginTop: interpolate(stageSv.value, [0, 1], [0, 6], Extrapolation.CLAMP),
  }));
  const stage1Style = useAnimatedStyle(() => ({
    opacity: interpolate(stageSv.value, [0, 1, 2], [0, 1, 0]),
  }));
  const stage2Style = useAnimatedStyle(() => ({
    opacity: interpolate(stageSv.value, [0, 1, 2], [0, 0, 1]),
  }));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const citiesByRegion = useMemo(() => {
    const grouped: Record<RegionKey, ReadyCity[]> = {
      france: [],
      europe: [],
      asia: [],
      northAmerica: [],
      southAmerica: [],
      africa: [],
      oceania: [],
    };
    for (const city of readyCities) {
      const rep = repMap[`${city.id}:${lang}`];
      const cc = city.countryCode ?? rep?.countryCode;
      grouped[regionOfCountry(cc)].push(city);
    }
    return grouped;
  }, [readyCities, repMap, lang]);

  // 선택된 도시가 바뀌면 그 도시의 대륙 탭으로 자동 전환
  const prevSelectedRef = useRef<string>("");
  useEffect(() => {
    if (prevSelectedRef.current === selectedDestination) return;
    const matched = readyCities.find((c) => c.nameEn === selectedDestination);
    if (!matched) return;
    const rep = repMap[`${matched.id}:${lang}`];
    const cc = matched.countryCode ?? rep?.countryCode;
    if (cc) {
      prevSelectedRef.current = selectedDestination;
      setActiveRegion(regionOfCountry(cc));
    }
  }, [selectedDestination, readyCities, repMap, lang]);

  // 대륙 탭 전환 시 가로 스크롤 맨 앞으로 리셋
  useEffect(() => {
    autoIdxRef.current = 0;
    carouselScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [activeRegion]);

  // 첫 3장 사진을 미리 받아 둔 뒤에만 자동 스냅을 시작한다(빈 카드 위를 달리지 않게)
  const activeCities = citiesByRegion[activeRegion];
  const activeCount = activeCities.length;
  useEffect(() => {
    if (photosReady) return;
    const firstThree = activeCities
      .slice(0, 3)
      .map((c) => repMap[`${c.id}:${lang}`]);
    if (!firstThree.length || firstThree.some((r) => !r)) return;
    const urls = firstThree
      .map((r) => resolveImageSource(r.imageUrl, "card")?.uri)
      .filter((u): u is string => !!u);
    void Promise.race([
      Image.prefetch(urls, "memory-disk"),
      new Promise((r) => setTimeout(r, 2500)),
    ]).then(() => {
      if (mountedRef.current) setPhotosReady(true);
    });
  }, [photosReady, activeCities, repMap, lang]);

  // ⏱️ 1초 간격으로 "탁, 탁, 탁, 탁" 한 칸씩 자동 스냅 이동 (사람들에게 옆에 카드가 있다는 것을 시각적으로 보여줌). 사용자가 한 번 만지면 멈춘다
  useEffect(() => {
    if (stage !== 1 || !photosReady || activeCount <= 1) return;
    const timer = setInterval(() => {
      if (userTouchedRef.current) return;
      autoIdxRef.current = (autoIdxRef.current + 1) % activeCount;
      carouselScrollRef.current?.scrollTo({
        x: autoIdxRef.current * STEP_PX,
        animated: true,
      });
    }, 1100);
    return () => clearInterval(timer);
  }, [stage, photosReady, activeRegion, activeCount]);

  // 현재 단계에서 보이는 도시들의 대표 카드 데이터를 한꺼번에(병렬) 조회, 오는 대로 반영
  useEffect(() => {
    if (!readyCities.length || stage === 0) return;
    const targets =
      stage === 2
        ? readyCities
        : activeCities.length > 0
          ? activeCities
          : readyCities;
    const missing = targets.filter((c) => {
      const key = `${c.id}:${lang}`;
      return !repMap[key] && !inflightRef.current.has(key);
    });
    for (const c of missing) {
      const key = `${c.id}:${lang}`;
      inflightRef.current.add(key);
      void fetchRep(c, lang).then((data) => {
        if (mountedRef.current) setRepMap((prev) => ({ ...prev, [key]: data }));
      });
    }
  }, [readyCities, stage, activeCities, repMap, lang]);

  const pauseAutoTick = () => {
    userTouchedRef.current = true;
  };

  // 웹에서 마우스 드래그 및 휠로 가로 스크롤 지원
  const bindWebDragScroll = (el: any) => {
    if (Platform.OS !== "web" || !el) return;
    const node: HTMLElement | null =
      el.getScrollableNode?.() ?? (el as unknown as HTMLElement);
    if (!node || (node as any).__dragBound) return;
    (node as any).__dragBound = true;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    node.addEventListener("pointerdown", (e: PointerEvent) => {
      isDown = true;
      startX = e.pageX - node.offsetLeft;
      scrollLeft = node.scrollLeft;
      pauseAutoTick();
    });
    node.addEventListener("pointerleave", () => {
      isDown = false;
    });
    node.addEventListener("pointerup", () => {
      isDown = false;
    });
    node.addEventListener("pointermove", (e: PointerEvent) => {
      if (!isDown) return;
      const x = e.pageX - node.offsetLeft;
      const walk = x - startX;
      if (Math.abs(walk) > 4) {
        node.scrollLeft = scrollLeft - walk;
        pauseAutoTick();
      }
    });
    node.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          node.scrollLeft += e.deltaY;
          pauseAutoTick();
        }
      },
      { passive: true },
    );
  };

  // 💜 0. BTS 콘서트 도시 = 운영앱(https://tripis.app/) 디자인·동작 100% 동일
  const renderBtsButton = () => (
    <Pressable
      onPress={onPressBts}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
      accessibilityRole="button"
      accessibilityLabel={t("trip.btsConcertCity")}
    >
      <LinearGradient
        colors={["#4C1D95", "#6D28D9", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.btsPill}
      >
        <Text style={styles.btsPillText}>{t("trip.btsConcertCity")}</Text>
      </LinearGradient>
    </Pressable>
  );

  // 📍 대륙 알약 = 운영앱(https://tripis.app/) 기존 도시 알약과 100% 같은 모양(map-pin 아이콘, 이모지 없음), 문구만 대륙명
  const renderRegionPills = () =>
    REGION_TABS.map((tab) => {
      const isSelected = stage !== 0 && tab.id === activeRegion;
      const label = t(tab.labelKey);
      return (
        <Pressable
          key={tab.id}
          style={[styles.pillButton, isSelected && styles.pillButtonActive]}
          onPress={() => {
            if (stage === 0) {
              setActiveRegion(tab.id);
              onStageChange(1);
            } else if (stage === 1 && tab.id === activeRegion) {
              onStageChange(2);
            } else if (stage === 2 && tab.id === activeRegion) {
              onStageChange(1);
            } else {
              setActiveRegion(tab.id);
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: isSelected }}
        >
          <Icon
            name="map-pin"
            size={13}
            color={isSelected ? "#FFFFFF" : Brand.primary}
          />
          <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
            {label}
          </Text>
        </Pressable>
      );
    });

  const renderCityCard = (city: ReadyCity) => {
    const rep = repMap[`${city.id}:${lang}`] ?? fallbackRep(city);
    const isSelected = selectedDestination === city.nameEn;
    return (
      <CityCardScreen
        key={city.id}
        rep={rep}
        selected={isSelected}
        onSelect={() => onSelectCity(city, true)}
        onCreateTrip={() => onCreatePopularTrip(city)}
        onVideo={() => onOpenVideo(city, rep)}
        onGuide={() => onOpenGuide(city, rep)}
        onCourse={() => onOpenCourse(city, rep)}
      />
    );
  };

  return (
    <View style={styles.stageWrap}>
      <ScrollView
        ref={bindWebDragScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={true}
        overScrollMode="always"
        contentContainerStyle={styles.pillRowContent}
      >
        {renderBtsButton()}
        {renderRegionPills()}
      </ScrollView>

      <Animated.View style={[styles.body, bodyStyle]}>
        <Animated.View
          style={[
            styles.bodyLayer,
            stage1Style,
            { pointerEvents: stage === 1 ? "auto" : "none" },
          ]}
          aria-hidden={stage !== 1}
          onLayout={(e) => {
            h1.value = Math.max(
              h1.value,
              Math.ceil(e.nativeEvent.layout.height),
            );
          }}
        >
          <ScrollView
            ref={(el) => {
              carouselScrollRef.current = el;
              bindWebDragScroll(el);
            }}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={Platform.OS === "web" ? undefined : STEP_PX}
            decelerationRate="fast"
            onTouchStart={pauseAutoTick}
            onScrollBeginDrag={pauseAutoTick}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              autoIdxRef.current = Math.max(0, Math.round(x / STEP_PX));
            }}
            scrollEventThrottle={32}
            contentContainerStyle={styles.carouselContent}
          >
            {activeCities.map(renderCityCard)}
          </ScrollView>
        </Animated.View>

        {stage2Mounted && (
          <Animated.View
            style={[
              styles.bodyLayer,
              stage2Style,
              { pointerEvents: stage === 2 ? "auto" : "none" },
            ]}
            aria-hidden={stage !== 2}
            onLayout={(e) => {
              h2.value = Math.ceil(e.nativeEvent.layout.height);
            }}
          >
            <ScrollView
              style={styles.stage2Scroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {REGION_TABS.map((tab) => {
                const list = citiesByRegion[tab.id];
                if (!list.length) return null;
                return (
                  <View key={tab.id} style={styles.stage2Section}>
                    <View style={styles.stage2Header}>
                      <Icon name="map-pin" size={12} color={Brand.primary} />
                      <Text style={styles.stage2Title}>
                        {`${t(tab.labelKey)} (${list.length})`}
                      </Text>
                    </View>
                    <ScrollView
                      ref={bindWebDragScroll}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.carouselContent}
                    >
                      {list.map(renderCityCard)}
                    </ScrollView>
                  </View>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageWrap: {
    marginBottom: 4,
  },
  pillRowContent: {
    gap: 8,
    paddingRight: 24,
    alignItems: "center",
  },
  body: {
    overflow: "hidden",
  },
  bodyLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  btsPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: "#C084FC",
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.card,
  },
  btsPillText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  pillButton: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    ...Shadows.card,
  },
  pillButtonActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  pillText: {
    fontSize: 12.5,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
  pillTextActive: {
    color: "#FFFFFF",
  },
  carouselContent: {
    gap: CITY_CARD_GAP,
    paddingRight: 24,
    paddingVertical: 2,
  },
  stage2Scroll: {
    maxHeight: 280,
  },
  stage2Section: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 6,
    marginBottom: 6,
  },
  stage2Header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  stage2Title: {
    fontSize: 11.5,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
});
