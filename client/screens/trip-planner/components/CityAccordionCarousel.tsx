// ⚠️ 수정금지(승인필요) 2026-11-10 최적값 = 상단 도시 3단 아코디언 캐러셀 = 운영앱 알약 버튼(이모지 금지, map-pin 아이콘) 그대로 문구만 대륙명으로 · 1초 간격 탁탁탁탁 자동 스냅 + 마우스 드래그 가로 스크롤 · 설명 글씨 버튼 금지 (정본 2026-11-10)
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
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
  const [repMap, setRepMap] = useState<Record<string, RepCard>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const carouselScrollRef = useRef<ScrollView | null>(null);
  const autoIdxRef = useRef(0);
  const pausedUntilRef = useRef(0);

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

  // ⏱️ 1초 간격으로 "탁, 탁, 탁, 탁" 한 칸씩 자동 스냅 이동 (사람들에게 옆에 카드가 있다는 것을 시각적으로 보여줌)
  const activeCount = citiesByRegion[activeRegion].length;
  useEffect(() => {
    if (stage !== 1 || activeCount <= 1) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntilRef.current) return;
      autoIdxRef.current = (autoIdxRef.current + 1) % activeCount;
      carouselScrollRef.current?.scrollTo({
        x: autoIdxRef.current * STEP_PX,
        animated: true,
      });
    }, 1100);
    return () => clearInterval(timer);
  }, [stage, activeRegion, activeCount]);

  // 현재 단계에서 보이는 도시들의 대표 카드 데이터를 4개씩 순차 조회
  useEffect(() => {
    if (!readyCities.length || stage === 0) return;
    const targets =
      stage === 2
        ? readyCities
        : citiesByRegion[activeRegion].length > 0
          ? citiesByRegion[activeRegion]
          : readyCities;
    const missing = targets.filter((c) => {
      const key = `${c.id}:${lang}`;
      return !repMap[key] && !inflightRef.current.has(key);
    });
    if (!missing.length) return;

    const batch = missing.slice(0, 4);
    for (const c of batch) inflightRef.current.add(`${c.id}:${lang}`);
    void (async () => {
      const results = await Promise.all(
        batch.map(async (c) => {
          const key = `${c.id}:${lang}`;
          try {
            const res = await apiRequest(
              "GET",
              `/api/cities/${c.id}/representative?lang=${encodeURIComponent(lang)}`,
            );
            const data: RepCard = await res.json();
            return { key, data };
          } catch {
            return { key, data: fallbackRep(c) };
          } finally {
            inflightRef.current.delete(key);
          }
        }),
      );
      if (!mountedRef.current) return;
      const next: Record<string, RepCard> = {};
      for (const r of results) {
        next[r.key] = r.data;
      }
      setRepMap((prev) => ({ ...prev, ...next }));
    })();
  }, [readyCities, stage, activeRegion, citiesByRegion, repMap, lang]);

  const pauseAutoTick = () => {
    pausedUntilRef.current = Date.now() + 4000;
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

  if (stage === 0) {
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
      </View>
    );
  }

  if (stage === 1) {
    const activeCities = citiesByRegion[activeRegion];
    return (
      <View style={styles.stageWrap}>
        <ScrollView
          ref={bindWebDragScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={true}
          overScrollMode="always"
          contentContainerStyle={styles.tabRowContent}
        >
          {renderBtsButton()}
          {renderRegionPills()}
        </ScrollView>

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
      </View>
    );
  }

  return (
    <View style={styles.stageWrap}>
      <ScrollView
        ref={bindWebDragScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={true}
        overScrollMode="always"
        contentContainerStyle={styles.tabRowContent}
      >
        {renderBtsButton()}
        {renderRegionPills()}
      </ScrollView>

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
  tabRowContent: {
    gap: 8,
    paddingRight: 24,
    paddingBottom: 6,
    alignItems: "center",
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
