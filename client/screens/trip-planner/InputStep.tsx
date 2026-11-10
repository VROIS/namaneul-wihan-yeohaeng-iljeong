import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { Brand, Spacing, Shadows } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import {
  VIBE_OPTIONS,
  COMPANION_OPTIONS,
  CURATION_FOCUS_OPTIONS,
  TRAVEL_STYLE_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  MOBILITY_STYLE_OPTIONS,
} from "@/types/trip";
import PlaceAutocompleteWidget, {
  CITY_LEVEL_TYPES,
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
import { inputStyles as styles } from "./styles/input";
import CitySearchAndroid from "./components/CitySearchAndroid";
import { WebInputModal, NativePicker } from "./components/DateTimePickers";
import TripisModal, {
  type RepCard,
  type TripisOpenParams,
} from "@/components/tripis/TripisModal";
import { openGuideForPlace } from "@/components/tripis/openGuide";
import type { PlannerApi } from "./hooks/useTripPlanner";
import { apiRequest } from "@/lib/query-client";
import { takeCityFromUrl } from "@/lib/cityLink";
import { takeBtsFromUrl } from "@/lib/btsLink";
import { cityDestination, useVideoLinkCity } from "./hooks/useVideoLinkCity";
import { fitTextProps } from "./utils";
import GenerateButtons from "./components/GenerateButtons";
import ShinyPillBanner from "@/components/ShinyPillBanner";
import AppGetButton, { HAS_APP_GET } from "@/components/AppGetButton";
import CityAccordionCarousel, {
  type AccordionStage,
  type ReadyCity,
} from "./components/CityAccordionCarousel";

export default function InputStep({ planner }: { planner: PlannerApi }) {
  const {
    navigation,
    theme,
    insets,
    t,
    i18n,
    isAuthed,
    requestLogin,
    formData,
    setFormData,
    toggleVibe,
    openPicker,
    openBestList,
  } = planner;

  const [videoParams, setVideoParams] = useState<TripisOpenParams | null>(null);
  const [accordionStage, setAccordionStage] = useState<AccordionStage>(1);
  const lastCityRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);

  const collapseCards = () => {
    setAccordionStage((prev) => (prev === 0 ? prev : 0));
  };

  // ⌨️ 2026-08-13 사장님 확정 = AOS 숙소·도시 검색 = 독립 전체화면 모달(CitySearchAndroid, ResultStep 숙소 Modal 과 같은 검증 구조).
  const searchPlaceholder = t("trip.searchPlaceholder");
  // ⚠️ 수정금지(승인필요) 2026-11-10 최적값 = 위젯이 준 구글 종류·주소 조각(destinationPlace, 나라 포함)을 서버로 보내고 도시 카드는 즉시 숨김(0단)으로 접는다 (정본 2026-11-10)
  const handlePlaceSelect = (place: PlaceSelection) => {
    collapseCards();
    setFormData((prev) => ({
      ...prev,
      destination: place.name || prev.destination,
      accommodationName: place.name,
      accommodationAddress: place.address,
      accommodationCoords: place.coords,
      destinationPlace: {
        types: place.types ?? [],
        components: place.components ?? [],
      },
      accommodationPlaceId: place.placeId,
    }));
  };

  // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 도시버튼 목록 = **서버가 DB 실측으로 내려주는 것만.**
  const [readyCities, setReadyCities] = useState<ReadyCity[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/cities/ready");
        const data = await res.json();
        if (alive && Array.isArray(data)) setReadyCities(data);
      } catch (e) {
        console.warn("[InputStep] 완비도시 조회 실패:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectCity = (city: ReadyCity, collapseToPill: boolean) => {
    lastCityRef.current = city.id;
    setFormData(cityDestination(city));
    if (collapseToPill) setAccordionStage(0);
  };

  // ⚠️ 수정금지(승인필요) 2026-11-10 최적값 = 링크 `?city=` = 도시 목록이 오면 그 도시를 목적지로 잡고 1단 캐러셀로 연다 (정본 2026-11-10)
  const selectCityRef = useRef(selectCity);
  selectCityRef.current = selectCity;
  useEffect(() => {
    if (!readyCities.length) return;
    const linked = takeCityFromUrl();
    const city = readyCities.find((c) => c.id === linked);
    if (city) {
      selectCityRef.current(city, false);
      setAccordionStage(1);
    }
  }, [readyCities]);
  useVideoLinkCity(readyCities, setFormData, lastCityRef);
  // ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 링크 `?bts` = 메인이 뜬 뒤 BTS 랜딩으로 바로(BTS 버튼과 같은 이동) (정본 2026-11-05)
  useEffect(() => {
    if (navigation && takeBtsFromUrl())
      (navigation as any).navigate("BTSLanding");
  }, [navigation]);

  const handleOpenVideo = (city: ReadyCity, rep: RepCard) => {
    selectCity(city, false);
    const targetId = rep.videoItineraryId ?? rep.itineraryId;
    if (targetId == null) return;
    setVideoParams({
      mode: "itinerary",
      itineraryId: targetId,
      day: rep.videoDay ?? undefined,
    });
  };

  const handleOpenGuide = (city: ReadyCity, rep: RepCard) => {
    selectCity(city, false);
    if (rep.placeId == null) return;
    openGuideForPlace(
      navigation,
      rep.placeId,
      rep.hasGuide ? "sample" : { isAuthed, requestLogin },
    );
  };

  const handleOpenCourse = (city: ReadyCity, rep: RepCard) => {
    selectCity(city, false);
    if (rep.itineraryId == null) return;
    navigation.navigate("Main", {
      screen: "Home",
      params: { itineraryId: rep.itineraryId },
    } as any);
  };

  const renderSectionHeader = (title: string, subtitle: string) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
        {subtitle}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      {/* 📌 1~5 상단 고정 섹션 = 운영앱과 동일한 1개 헤더 컨테이너 (회색 구분 막대기 없음) */}
      <View
        style={{
          paddingTop: Math.max(16, insets.top + 8),
          paddingHorizontal: Spacing.md,
          paddingBottom: 10,
          backgroundColor: theme.backgroundDefault,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          zIndex: 50,
          ...Shadows.card,
        }}
      >
        {/* 🌟 OriginKit Shiny Pill 스타일 '지금 핫한 [TRIPIS Mark + TRIPIS] 여정' 3D 쉬머 빔 알약 배너 */}
        <View style={{ marginBottom: 8, marginTop: 2 }}>
          <ShinyPillBanner alignStart={HAS_APP_GET} />
          <AppGetButton />
        </View>

        {/* 1. 완비 도시 3단 아코디언 캐러셀 = 0단(알약) · 1단(대륙탭+1줄 카드) · 2단(대륙별 줄줄줄 펼침) */}
        <CityAccordionCarousel
          readyCities={readyCities}
          selectedDestination={formData.destination}
          stage={accordionStage}
          onStageChange={setAccordionStage}
          onPressBts={() => {
            if (navigation) (navigation as any).navigate("BTSLanding");
          }}
          onSelectCity={selectCity}
          onCreatePopularTrip={(city) => {
            selectCity(city, true);
            void openBestList(city);
          }}
          onOpenVideo={handleOpenVideo}
          onOpenGuide={handleOpenGuide}
          onOpenCourse={handleOpenCourse}
        />

        {/* 3~5. 도시 입력창 + 날짜/시간 입력 컨테이너 = 터치(도시입력·날짜/시간 변경 등 무엇을 하든) 시 즉시 도시 카드 숨김(0단) */}
        <View
          onTouchEnd={collapseCards}
          {...(Platform.OS === "web"
            ? ({
                onClick: collapseCards,
                onFocusCapture: collapseCards,
              } as any)
            : {})}
        >
          {/* 3-4번 통합: 구글맵 위젯 통합 1개 필드 ('숙소명이나 도시명을 한글이나 원어로 입력해주세요')
              ⌨️ 2026-08-13 사장님 확정 = AOS 만 돋보기 필드 → 독립 전체화면 모달(CitySearchAndroid). iOS·웹 = 인라인 그대로 무변경. */}
          <View style={{ marginBottom: 8, zIndex: 30 }}>
            {Platform.OS === "android" ? (
              <CitySearchAndroid
                theme={theme}
                topInset={insets.top}
                // 🏙️ iOS 인라인과 동일 UX(사장님 지적 2026-08-13) = 숙소 선택 전엔 도시명(디폴트 파리·칩/도시카드 선택 즉시 반영)이 필드에 보인다
                selectedName={
                  formData.accommodationName || formData.destination
                }
                placeholder={searchPlaceholder}
                language={i18n.language || "ko"}
                cityPrefix={
                  formData.destination ? `${formData.destination} ` : undefined
                }
                onSelect={handlePlaceSelect}
              />
            ) : (
              <PlaceAutocompleteWidget
                placeholder={searchPlaceholder}
                language={i18n.language || "ko"}
                includedPrimaryTypes={CITY_LEVEL_TYPES}
                cityPrefix={
                  formData.destination ? `${formData.destination} ` : undefined
                }
                onSelect={handlePlaceSelect}
              />
            )}
          </View>

          {/* 5. 일정 및 시간 선택 (디폴트 시작 09:00, 종료 21:00) */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
            {(["startDate", "endDate"] as const).map((field) => (
              <Pressable
                key={field}
                style={[
                  styles.dateBox,
                  styles.flex1,
                  {
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 12,
                    paddingVertical: 8,
                  },
                ]}
                onPress={() => {
                  collapseCards();
                  openPicker(field);
                }}
              >
                <Icon name="calendar" size={15} color={Brand.primary} />
                <Text
                  style={[
                    styles.dateText,
                    { color: theme.text, fontSize: 12.5 },
                  ]}
                >
                  {formData[field]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                ["startTime", "09:00"],
                ["endTime", "21:00"],
              ] as const
            ).map(([field, fallback]) => (
              <Pressable
                key={field}
                style={[
                  styles.dateBox,
                  styles.flex1,
                  {
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 12,
                    paddingVertical: 8,
                  },
                ]}
                onPress={() => {
                  collapseCards();
                  openPicker(field);
                }}
              >
                <Icon name="clock" size={15} color={Brand.primary} />
                <Text
                  style={[
                    styles.dateText,
                    { color: theme.text, fontSize: 12.5 },
                  ]}
                >
                  {formData[field] || fallback}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* 📜 6~11 하단 스크롤 영역 (터치/스크롤 시 도시 카드 숨김 · 맨 위에서 아래로 당기면 카드 펼침) */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.inputContainer,
          {
            paddingTop: Spacing.sm,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onTouchStart={(e) => {
          dragStartYRef.current = e.nativeEvent.pageY;
        }}
        onTouchEnd={(e) => {
          const dy = e.nativeEvent.pageY - dragStartYRef.current;
          if (dy > 45 && accordionStage === 0) setAccordionStage(1);
          else if (accordionStage !== 0) collapseCards();
        }}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (y > 10 && accordionStage !== 0) {
            collapseCards();
          } else if (y < -25 && accordionStage === 0) {
            setAccordionStage(1);
          } else if (y < -55 && accordionStage === 1) {
            setAccordionStage(2);
          }
        }}
      >
        {/* 6. 누구랑 (동행) */}
        <View style={styles.section}>
          {renderSectionHeader(t("trip.companion"), t("trip.companionHint"))}
          <View style={styles.iconGrid}>
            {COMPANION_OPTIONS.map((opt) => {
              const selected = formData.companionType === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.iconButton,
                    {
                      backgroundColor: selected ? Brand.primary : "#FFFFFF",
                      borderWidth: 1.5,
                      borderColor: selected ? Brand.primary : "#E2E8F0",
                      borderRadius: 18,
                      ...Shadows.card,
                    },
                  ]}
                  onPress={() =>
                    setFormData((prev) => ({
                      ...prev,
                      companionType: opt.id,
                      companionCount: opt.defaultCount,
                      transportType: opt.transportType,
                    }))
                  }
                >
                  <Icon
                    name={opt.icon as any}
                    size={22}
                    color={selected ? "#FFFFFF" : Brand.primary}
                  />
                  <Text
                    style={[
                      styles.iconLabel,
                      { color: selected ? "#FFFFFF" : theme.text },
                    ]}
                    {...fitTextProps}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 6-2. 누구를 위한 */}
        <View style={styles.section}>
          {renderSectionHeader(
            t("trip.curationFocus"),
            t("trip.curationFocusHint"),
          )}
          <View style={styles.iconGrid}>
            {CURATION_FOCUS_OPTIONS.map((opt) => {
              const selected = formData.curationFocus === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.iconButton,
                    {
                      backgroundColor: selected ? Brand.primary : "#FFFFFF",
                      borderWidth: 1.5,
                      borderColor: selected ? Brand.primary : "#E2E8F0",
                      borderRadius: 18,
                      ...Shadows.card,
                    },
                  ]}
                  onPress={() =>
                    setFormData((prev) => ({
                      ...prev,
                      curationFocus: opt.id,
                    }))
                  }
                >
                  <Icon
                    name={opt.icon as any}
                    size={22}
                    color={selected ? "#FFFFFF" : Brand.primary}
                  />
                  <Text
                    style={[
                      styles.iconLabel,
                      { color: selected ? "#FFFFFF" : theme.text },
                    ]}
                    {...fitTextProps}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 7. 무엇을 (원하는 여행 스타일 최대 3개) */}
        <View style={styles.section}>
          {renderSectionHeader(t("trip.vibes"), t("trip.vibesHint"))}
          <View style={styles.vibeGrid}>
            {VIBE_OPTIONS.map((vibe) => {
              const selected = formData.vibes.includes(vibe.id);
              const selectionIndex = formData.vibes.indexOf(vibe.id);
              const priorityLabels = [
                t("trip.priorityHighest"),
                t("trip.priorityHigh"),
                t("trip.priorityNormal"),
              ];
              const priorityLabel =
                selectionIndex >= 0 ? priorityLabels[selectionIndex] : "";
              return (
                <Pressable
                  key={vibe.id}
                  style={[
                    styles.vibeButton,
                    {
                      backgroundColor: selected ? Brand.primary : "#FFFFFF",
                      borderWidth: 1.5,
                      borderColor: selected ? Brand.primary : "#E2E8F0",
                      borderRadius: 18,
                      ...Shadows.card,
                    },
                  ]}
                  onPress={() => toggleVibe(vibe.id)}
                >
                  <Icon
                    name={vibe.icon as any}
                    size={22}
                    color={selected ? "#FFFFFF" : Brand.primary}
                  />
                  <Text
                    style={[
                      styles.vibeText,
                      { color: selected ? "#FFFFFF" : theme.text },
                    ]}
                    {...fitTextProps}
                  >
                    {t(vibe.labelKey)}
                    {/* ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 우선순위 괄호를 항상 별도 줄로 강제.
                        같은 줄에 붙이면 언어·조합에 따라 축약해도 여전히 괄호 중간에서 깨질 수 있음
                        (사장님 운영 스샷 실증 = 영문 vibe 라벨+우선순위 괄호가 한 줄에서 단어 중간에 끊김).
                        줄바꿈을 코드로 못박아 원천 차단. */}
                    {priorityLabel ? `\n${priorityLabel}` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 8. 여행 스타일 */}
        <View style={styles.section}>
          {renderSectionHeader(t("trip.travelPace"), t("trip.travelPaceHint"))}
          <View style={styles.toggleRow}>
            {TRAVEL_PACE_OPTIONS.map((opt) => {
              const selected = formData.travelPace === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.toggleButton,
                    {
                      backgroundColor: selected ? Brand.primary : "#FFFFFF",
                      borderWidth: 1.5,
                      borderColor: selected ? Brand.primary : "#E2E8F0",
                      borderRadius: 18,
                      ...Shadows.card,
                    },
                  ]}
                  onPress={() =>
                    setFormData((prev) => ({ ...prev, travelPace: opt.id }))
                  }
                >
                  <Icon
                    name={opt.icon as any}
                    size={16}
                    color={selected ? "#FFFFFF" : Brand.primary}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      { color: selected ? "#FFFFFF" : theme.text },
                    ]}
                    {...fitTextProps}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 9. 예산 */}
        <View style={styles.section}>
          {renderSectionHeader(t("trip.budget"), t("trip.budgetHint"))}
          <View style={styles.iconGrid}>
            {TRAVEL_STYLE_OPTIONS.map((opt) => {
              const selected = formData.travelStyle === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.iconButton,
                    {
                      backgroundColor: selected ? Brand.primary : "#FFFFFF",
                      borderWidth: 1.5,
                      borderColor: selected ? Brand.primary : "#E2E8F0",
                      borderRadius: 18,
                      ...Shadows.card,
                    },
                  ]}
                  onPress={() =>
                    setFormData((prev) => ({
                      ...prev,
                      travelStyle: opt.id,
                    }))
                  }
                >
                  <Icon
                    name={opt.icon as any}
                    size={22}
                    color={selected ? "#FFFFFF" : Brand.primary}
                  />
                  <Text
                    style={[
                      styles.iconLabel,
                      { color: selected ? "#FFFFFF" : theme.text },
                    ]}
                    {...fitTextProps}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 10. 이동 스타일 */}
        <View style={styles.section}>
          {renderSectionHeader(
            t("trip.mobilityStyle"),
            t("trip.mobilityStyleHint"),
          )}
          <View style={styles.toggleRow}>
            {MOBILITY_STYLE_OPTIONS.map((opt) => {
              const selected = formData.mobilityStyle === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.toggleButton,
                    {
                      backgroundColor: selected ? Brand.primary : "#FFFFFF",
                      borderWidth: 1.5,
                      borderColor: selected ? Brand.primary : "#E2E8F0",
                      borderRadius: 18,
                      ...Shadows.card,
                    },
                  ]}
                  onPress={() =>
                    setFormData((prev) => ({
                      ...prev,
                      mobilityStyle: opt.id,
                    }))
                  }
                >
                  <Icon
                    name={opt.icon as any}
                    size={16}
                    color={selected ? "#FFFFFF" : Brand.primary}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      { color: selected ? "#FFFFFF" : theme.text },
                    ]}
                    {...fitTextProps}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <GenerateButtons planner={planner} />
      </ScrollView>

      {/* 🎬 도시 카드 [▷ 영상] 배지 = TRIPIS 통합 모달 1벌(§16)로 대표 숏폼 재생 */}
      <TripisModal
        visible={videoParams !== null}
        params={videoParams}
        onClose={() => setVideoParams(null)}
      />
      <WebInputModal planner={planner} />
      <NativePicker planner={planner} />
    </View>
  );
}
