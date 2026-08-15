// 입력 화면(InputStep.tsx) = 상단 고정 + DB 도시 동적 버튼 + '누구랑' 및 '누구를 위한' 100% 복원 완료
import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Brand,
  Spacing,
  Shadows,
  BorderRadius,
  Fonts,
} from "@/constants/theme";
import Icon from "@/components/Icon";
import {
  VIBE_OPTIONS,
  COMPANION_OPTIONS,
  CURATION_FOCUS_OPTIONS,
  TRAVEL_STYLE_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  MOBILITY_STYLE_OPTIONS,
} from "@/types/trip";
// ⚠️ 구글 공식 위젯(PlaceAutocompleteElement) 100% 활용
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
import { inputStyles as styles } from "./styles/input";
import CitySearchAndroid from "./components/CitySearchAndroid";
import { WebInputModal, NativePicker } from "./components/DateTimePickers";
import TripisModal, { type RepCard } from "@/components/tripis/TripisModal";
import type { PlannerApi } from "./hooks/useTripPlanner";
import { apiRequest } from "@/lib/query-client";
import { fitTextProps } from "./utils";

import ShinyPillBanner from "@/components/ShinyPillBanner";

// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 도시버튼 목록 = **서버가 DB 실측으로 내려주는 것만.**
//   손으로 적어둔 목록은 완전삭제 §19 = 발굴이 안 된 도시까지 버튼에 떠서 가짜 정보를 보여줬다.
//   정본 = GET /api/cities/ready (완비 도시만·완비순). 도시를 더 발굴하면 **코드 수정 없이 자동 추가.**
type ReadyCity = {
  id: number;
  nameKo: string;
  nameEn: string;
};

export default function InputStep({ planner }: { planner: PlannerApi }) {
  const {
    navigation,
    theme,
    insets,
    t,
    i18n,
    formData,
    setFormData,
    toggleVibe,
    openPicker,
    handleGenerate,
  } = planner;

  // 도시 카드 = 서버가 조립해 준 값 그대로(null = 아직 안 열림). ref = 늦게 온 응답이 새로 고른 도시를 덮지 않게.
  const [repCard, setRepCard] = useState<RepCard | null>(null);
  const lastCityRef = useRef<number>(0);

  // ⌨️ 2026-08-13 사장님 확정 = AOS 숙소·도시 검색 = 독립 전체화면 모달(CitySearchAndroid, ResultStep 숙소 Modal 과 같은 검증 구조).
  const searchPlaceholder = t("trip.searchPlaceholder");
  // 선택 배선 1벌 = 인라인(iOS·웹)과 AOS 모달이 같은 함수를 쓴다(§0). 내용은 기존 로직 그대로.
  const handlePlaceSelect = (place: PlaceSelection) => {
    setFormData((prev) => ({
      ...prev,
      destination: place.name || prev.destination,
      accommodationName: place.name,
      accommodationAddress: place.address,
      accommodationCoords: place.coords,
      accommodationPlaceId: place.placeId,
    }));
  };

  // 🏙️ 도시버튼 목록 = 서버 DB 실측(완비 도시만·완비순). 실패하면 빈 줄 = 가짜 도시 표시 금지.
  //   조회는 이 폴더의 다른 훅들과 같은 apiRequest 1벌(§16) = 주소 조립·오류 처리를 다시 만들지 않는다.
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

  // ⚠️ 2026-07-30 §19 = 슬로건 펄스 애니메이션 완전삭제.
  //   사유: 슬로건이 ShinyPillBanner 로 교체돼 계산값을 쓰는 곳이 0인데도 무한 루프가 화면 진입마다 돌고 있었다.
  //   (이 파일이 500줄 가드 상한에 붙어 다음 수정이 막히던 원인 중 하나)

  // 도시 칩 = 그 도시를 목적지로 잡고 **항상** 카드를 띄운다(2026-08-02 사장님 지시 = 옛 "대표여정 없으면 안 띄움" 폐기 §19).
  //   대표여정이 없어도 서버가 도시 DB(사진·한 줄 요약·리뷰 상위 3곳)로 채워 내려주므로 카드는 늘 채워져 온다.
  //   조회 자체가 실패했을 때(네트워크·서버 오류 = apiRequest 가 던짐)만 카드를 열지 않는다 = 폴백이 아니라 오류 처리.
  const handleCityPress = async (city: ReadyCity) => {
    lastCityRef.current = city.id;
    setFormData((prev) => ({
      ...prev,
      destination: city.nameEn,
    }));
    try {
      // 🎙️ 지금 화면 언어를 함께 넘긴다 = 서버가 그 언어의 해설이 창고에 있는지 보고 [해설] 배지를 켠다(2026-08-02).
      //   언어값은 앱 언어 1벌(i18n.language = 7종 두 글자 코드)에서만 읽는다 = 새 상태를 만들지 않는다(§16).
      const res = await apiRequest(
        "GET",
        `/api/cities/${city.id}/representative?lang=${encodeURIComponent(i18n.language || "ko")}`,
      );
      // 그 사이 다른 도시를 눌렀으면 이 응답은 버린다(늦게 온 응답이 새 선택을 덮지 않게)
      if (lastCityRef.current !== city.id) return;
      setRepCard(await res.json());
    } catch (e) {
      console.error("[InputStep] 도시 카드 조회 실패:", e);
    }
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
      {/* 📌 1~5 상단 고정 섹션 (최상단 여백 쾌적·여유롭게 확대) */}
      <View
        style={{
          paddingTop: Math.max(22, insets.top + 14),
          paddingHorizontal: Spacing.md,
          paddingBottom: 12,
          backgroundColor: theme.backgroundDefault,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          zIndex: 50,
          ...Shadows.card,
        }}
      >
        {/* 🌟 OriginKit Shiny Pill 스타일 '지금 핫한 [TRIPIS Mark + TRIPIS] 여정' 3D 쉬머 빔 알약 배너 */}
        <View style={{ marginBottom: 12, marginTop: 2 }}>
          <ShinyPillBanner />
        </View>

        {/* 1. 완비 도시 버튼 = 서버가 내려준 목록 그대로(개수 고정 아님). 가로 스와이프 */}
        <View style={{ marginBottom: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={true}
            overScrollMode="always"
            contentContainerStyle={{ gap: 8, paddingRight: 24 }}
          >
            {/* 💜 0. BTS 콘서트 도시 (정식 BTS 랜딩 및 아미봉 무대 라이트쇼 스택 연결 = BTSLanding) */}
            <Pressable
              onPress={() => {
                if (navigation) {
                  (navigation as any).navigate("BTSLanding");
                }
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <LinearGradient
                colors={["#4C1D95", "#6D28D9", "#7C3AED"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: BorderRadius.full,
                  borderWidth: 1.5,
                  borderColor: "#C084FC",
                  alignItems: "center",
                  justifyContent: "center",
                  ...Shadows.card,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: Fonts.bold,
                    fontWeight: "800",
                    color: "#FFFFFF",
                    letterSpacing: -0.2,
                    textShadowColor: "rgba(0, 0, 0, 0.4)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                  }}
                >
                  {t("trip.btsConcertCity")}
                </Text>
              </LinearGradient>
            </Pressable>

            {readyCities.map((city) => {
              const isSelected = formData.destination === city.nameEn;
              // ⚠️ 수정금지(승인필요) 2026-08-14 = 도시명 = 고유명사라 t() 번역 대상이 아니다.
              //   서버가 이미 주는 nameKo/nameEn 중 언어에 맞는 것만 고른다(새 서버 필드·번역 불필요).
              const cityLabel =
                i18n.language === "ko" ? city.nameKo : city.nameEn;
              return (
                <Pressable
                  key={city.id}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: BorderRadius.full,
                    backgroundColor: isSelected ? Brand.primary : "#F8FAFC",
                    borderWidth: 1.5,
                    borderColor: isSelected ? Brand.primary : "#E2E8F0",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    ...Shadows.card,
                  }}
                  onPress={() => handleCityPress(city)}
                  // 칩 높이가 약 30px 이라 손가락 기준(iOS 44 / 안드로이드 48)에 못 미친다 → 픽셀은 그대로 두고 누를 수 있는 범위만 넓힘
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={cityLabel}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Icon
                    name="map-pin"
                    size={13}
                    color={isSelected ? "#FFFFFF" : Brand.primary}
                  />
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontFamily: Fonts.bold,
                      color: isSelected ? "#FFFFFF" : "#0F172A",
                    }}
                  >
                    {cityLabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 3-4번 통합: 구글맵 위젯 통합 1개 필드 ('숙소명이나 도시명을 한글이나 원어로 입력해주세요')
            ⌨️ 2026-08-13 사장님 확정 = AOS 만 돋보기 필드 → 독립 전체화면 모달(CitySearchAndroid). iOS·웹 = 인라인 그대로 무변경. */}
        <View style={{ marginBottom: 10, zIndex: 30 }}>
          {Platform.OS === "android" ? (
            <CitySearchAndroid
              theme={theme}
              topInset={insets.top}
              // 🏙️ iOS 인라인과 동일 UX(사장님 지적 2026-08-13) = 숙소 선택 전엔 도시명(디폴트 파리·칩/도시카드 선택 즉시 반영)이 필드에 보인다
              selectedName={formData.accommodationName || formData.destination}
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
              cityPrefix={
                formData.destination ? `${formData.destination} ` : undefined
              }
              onSelect={handlePlaceSelect}
            />
          )}
        </View>

        {/* 5. 일정 및 시간 선택 (디폴트 시작 09:00, 종료 21:00) */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              {
                backgroundColor: "#F8FAFC",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                borderRadius: 14,
                paddingVertical: 10,
              },
            ]}
            onPress={() => openPicker("startDate")}
          >
            <Icon name="calendar" size={16} color={Brand.primary} />
            <Text
              style={[styles.dateText, { color: theme.text, fontSize: 13 }]}
            >
              {formData.startDate}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              {
                backgroundColor: "#F8FAFC",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                borderRadius: 14,
                paddingVertical: 10,
              },
            ]}
            onPress={() => openPicker("endDate")}
          >
            <Icon name="calendar" size={16} color={Brand.primary} />
            <Text
              style={[styles.dateText, { color: theme.text, fontSize: 13 }]}
            >
              {formData.endDate}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              {
                backgroundColor: "#F8FAFC",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                borderRadius: 14,
                paddingVertical: 10,
              },
            ]}
            onPress={() => openPicker("startTime")}
          >
            <Icon name="clock" size={16} color={Brand.primary} />
            <Text
              style={[styles.dateText, { color: theme.text, fontSize: 13 }]}
            >
              {formData.startTime || "09:00"}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              {
                backgroundColor: "#F8FAFC",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                borderRadius: 14,
                paddingVertical: 10,
              },
            ]}
            onPress={() => openPicker("endTime")}
          >
            <Icon name="clock" size={16} color={Brand.primary} />
            <Text
              style={[styles.dateText, { color: theme.text, fontSize: 13 }]}
            >
              {formData.endTime || "21:00"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 📜 6~11 하단 스크롤 영역 (3D 애플 스타일 tactile 버튼) */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.inputContainer,
          {
            paddingTop: Spacing.md,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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

        {/* 11. 메인 CTA 버튼 ('여정 생성') */}
        <Pressable style={styles.generateButton} onPress={handleGenerate}>
          <LinearGradient
            colors={[Brand.primary, Brand.secondary]}
            style={styles.generateGradient}
          >
            <Icon name="navigation" size={20} color="#FFFFFF" />
            <Text style={styles.generateText}>{t("trip.generate")}</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>

      {/* 🏙️ 도시 카드 = TRIPIS 통합 모달 1벌(§16). ▶ 배지를 누르면 같은 모달이 대표 숏폼 재생으로 바뀐다 */}
      <TripisModal
        visible={repCard !== null}
        params={repCard ? { mode: "city", rep: repCard } : null}
        onClose={() => setRepCard(null)}
      />

      <WebInputModal planner={planner} />
      <NativePicker planner={planner} />
    </View>
  );
}
