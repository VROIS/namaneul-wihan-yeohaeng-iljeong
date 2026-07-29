// 입력 화면(InputStep.tsx) = 상단 고정 + DB 도시 동적 버튼 + '누구랑' 및 '누구를 위한' 100% 복원 완료
import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, Animated, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand, Spacing, Shadows, BorderRadius, Fonts } from "@/constants/theme";
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
import { WebInputModal, NativePicker } from "./components/DateTimePickers";
import RepresentativeTripShortForm, {
  CITY_PREVIEW_MAP,
} from "./components/RepresentativeTripShortForm";
import type { PlannerApi } from "./hooks/useTripPlanner";

import ShinyPillBanner from "@/components/ShinyPillBanner";

const DB_COMPLETED_CITIES = [
  { id: "Paris", nameKo: "파리", nameEn: "Paris" },
  { id: "Brussels", nameKo: "브뤼셀", nameEn: "Brussels" },
  { id: "Madrid", nameKo: "마드리드", nameEn: "Madrid" },
  { id: "Munich", nameKo: "뮌헨", nameEn: "Munich" },
  { id: "London", nameKo: "런던", nameEn: "London" },
  { id: "Tokyo", nameKo: "도쿄", nameEn: "Tokyo" },
  { id: "Osaka", nameKo: "오사카", nameEn: "Osaka" },
  { id: "Singapore", nameKo: "싱가포르", nameEn: "Singapore" },
  { id: "Bangkok", nameKo: "방콕", nameEn: "Bangkok" },
  { id: "LA", nameKo: "LA", nameEn: "Los Angeles" },
  { id: "NewYork", nameKo: "뉴욕", nameEn: "New York" },
  { id: "Sydney", nameKo: "시드니", nameEn: "Sydney" },
  { id: "Barcelona", nameKo: "바르셀로나", nameEn: "Barcelona" },
  { id: "Rome", nameKo: "로마", nameEn: "Rome" },
  { id: "Prague", nameKo: "프라하", nameEn: "Prague" },
  { id: "Danang", nameKo: "다낭", nameEn: "Danang" },
];

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

  const [previewCityName, setPreviewCityName] = useState<string>("Paris");
  const [previewModalVisible, setPreviewModalVisible] = useState<boolean>(false);

  // ✨ '지금 핫한 TRIPIS 여정' 브랜드 슬로건 다이나믹 RN 애니메이션 (이모지 없음, 3D 플로팅 + 스케일 펄스)
  const sloganPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sloganPulse, {
          toValue: 1,
          duration: 950,
          useNativeDriver: true,
        }),
        Animated.timing(sloganPulse, {
          toValue: 0,
          duration: 950,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [sloganPulse]);

  const sloganScale = sloganPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const sloganTranslateY = sloganPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3.5],
  });

  const sloganOpacity = sloganPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });

  const handleCityPress = (cityId: string) => {
    setFormData((prev) => ({
      ...prev,
      destination: cityId,
    }));
    setPreviewCityName(cityId);
    setPreviewModalVisible(true);
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

        {/* 1. DB-Only 완성된 16개 전세계 인기도시 동적 버튼 (100% 사용자 자유 가로 스와이프) */}
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
                  BTS 콘서트 도시
                </Text>
              </LinearGradient>
            </Pressable>

            {DB_COMPLETED_CITIES.map((city) => {
              const isSelected = formData.destination === city.nameEn;
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
                  onPress={() => handleCityPress(city.nameEn)}
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
                    {city.nameKo}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 3-4번 통합: 구글맵 위젯 통합 1개 필드 ('숙소명이나 도시명을 한글이나 원어로 입력해주세요') */}
        <View style={{ marginBottom: 10, zIndex: 30 }}>
          <PlaceAutocompleteWidget
            placeholder="숙소명이나 도시명을 한글이나 원어로 입력해주세요"
            language={i18n.language || "ko"}
            cityPrefix={
              formData.destination ? `${formData.destination} ` : undefined
            }
            onSelect={(place: PlaceSelection) => {
              setFormData((prev) => ({
                ...prev,
                destination: place.name || prev.destination,
                accommodationName: place.name,
                accommodationAddress: place.address,
                accommodationCoords: place.coords,
                accommodationPlaceId: place.placeId,
              }));
            }}
          />
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
            <Text style={[styles.dateText, { color: theme.text, fontSize: 13 }]}>
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
            <Text style={[styles.dateText, { color: theme.text, fontSize: 13 }]}>
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
            <Text style={[styles.dateText, { color: theme.text, fontSize: 13 }]}>
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
            <Text style={[styles.dateText, { color: theme.text, fontSize: 13 }]}>
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
                  >
                    {t(vibe.labelKey)}
                    {priorityLabel}
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

      {/* 🏙️ 도시별 대표여정 숏폼 모달 */}
      <RepresentativeTripShortForm
        visible={previewModalVisible}
        cityName={previewCityName}
        onClose={() => setPreviewModalVisible(false)}
        onSelectCity={(cityNameEn) => {
          setFormData((prev) => ({
            ...prev,
            destination: cityNameEn,
          }));
        }}
      />

      <WebInputModal planner={planner} />
      <NativePicker planner={planner} />
    </View>
  );
}
