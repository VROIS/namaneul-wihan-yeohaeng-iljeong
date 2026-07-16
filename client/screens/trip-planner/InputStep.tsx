// 입력 화면(Input step) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand, Spacing } from "@/constants/theme";
import Icon from "@/components/Icon";
import {
  VIBE_OPTIONS,
  COMPANION_OPTIONS,
  CURATION_FOCUS_OPTIONS,
  TRAVEL_STYLE_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  MOBILITY_STYLE_OPTIONS,
} from "@/types/trip";
// ⚠️ 2026-06-29 사용자 SSOT = 자체 PlaceAutocomplete(입력창+드롭다운+프록시 과설계) 폐기(§19) → 구글 공식 위젯(PlaceAutocompleteElement) WebView 100% 활용
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
import { inputStyles as styles } from "./styles/input";
import { WebInputModal, NativePicker } from "./components/DateTimePickers";
import type { PlannerApi } from "./hooks/useTripPlanner";

export default function InputStep({ planner }: { planner: PlannerApi }) {
  const {
    navigation, theme, insets, t, i18n,
    formData, setFormData, toggleVibe, openPicker, handleGenerate,
  } = planner;

  const renderSectionHeader = (title: string, subtitle: string) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
        {subtitle}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.inputContainer,
        {
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + 100,
        },
      ]}
      showsVerticalScrollIndicator={false}
      // 🏨 2026-06-29 사용자 SSOT = iOS 키보드 떠 있어도 숙소 자동완성 드롭다운 선택 가능 (= RN 기본 'never' → 첫탭이 키보드닫기에 소비되어 선택 불가 버그). 웹과 동일 동작(입력→드롭다운→선택).
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <Icon name="x" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>TRIPIS</Text>
      </View>

      {/* 🎵 BTS 콘서트 투어 배너 */}
      <Pressable
        testID="bts-concert-planner-banner"
        accessibilityRole="button"
        accessibilityLabel="BTS 콘서트 투어 플래너"
        style={{
          marginHorizontal: 16,
          marginBottom: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          backgroundColor: "#1a1025",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "rgba(139,92,246,0.3)",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
        onPress={() => (navigation as any).navigate("BTSLanding")} // ⚠️ 수정금지(승인필요) — 배너→BTS 랜딩(18KB) 연결
      >
        {/* ⚠️ 2026-06-24 = 💜 이모지 제거 → Lucide heart (= 디자인 SSOT §1-3 이모지금지 / §8 Lucide만, ICON_MAP 기존 Heart 사용 = 보호파일 미변경). 보라색 = BTS 보라해 유지 */}
        <Icon name="heart" size={24} color="#A78BFA" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#A78BFA", fontFamily: "Pretendard-Bold", fontSize: 14 }}>
            {t("trip.btsBanner")}
          </Text>
          <Text style={{ color: "#6B7280", fontFamily: "Pretendard-Medium", fontSize: 11, marginTop: 2 }}>
            {t("trip.btsBannerSub")}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} color="#8B5CF6" />
      </Pressable>

      {/* 🗺️ 목적지 (자유 입력 — 한글/영어 OK, DB city-resolver가 매칭) */}
      <View style={[styles.section, { zIndex: 20 }]}>
        <View style={[styles.inputBox, { backgroundColor: theme.backgroundDefault }]}>
          <Icon name="map-pin" size={20} color={Brand.primary} />
          <TextInput
            style={[styles.textInput, { color: theme.text }]}
            value={formData.destination}
            onChangeText={(text) =>
              setFormData((prev) => ({
                ...prev,
                destination: text,
                destinationCoords: undefined,
                ...(text ? {} : {
                  accommodationName: undefined,
                  accommodationAddress: undefined,
                  accommodationCoords: undefined,
                  accommodationPlaceId: undefined,
                }),
              }))
            }
            placeholder={t("trip.destinationPlaceholder")}
            placeholderTextColor={theme.textTertiary}
          />
        </View>
        <Text style={[styles.sectionSubtitle, { color: theme.textTertiary, marginTop: 4, marginLeft: 4 }]}>
          {t("trip.destinationHint")}
        </Text>
      </View>

      {/* 🏨 숙소 (선택적) = 구글 공식 위젯(PlaceAutocompleteElement) WebView. 자체 입력창+드롭다운 폐기(§19). */}
      {/* 🎹 2026-06-30 사용자 SSOT = 숙소 선택하면 이 섹션 완전히 사라짐(안내문 "나중에 입력해도 됨" 명시대로).
          → 위젯 언마운트 = 키보드 자동 닫힘(iOS·AOS) + prefill "Paris" 리셋 문제 소멸 = 여정속 언마운트와 동일 방식.
          안 고르면 = 파리 도심 자동설정(이전 동작 그대로). 나중 변경 = 여정속 "숙소 변경" 버튼. (옛 재마운트 key방식 폐기 = 껐다켜기하면 prefill이 선택값 덮는 부작용, §19) */}
      {!formData.accommodationName && (
        <View style={[styles.section, { zIndex: 15 }]}>
          {/* 🏨 2026-06-29 = includedPrimaryTypes 미지정 = 호텔+주소+에어비앤비 주소 전부 검색(옛 lodging단독=호텔만 나오던 버그 폐기). */}
          <PlaceAutocompleteWidget
            placeholder={t("trip.accommodation")}
            language={i18n.language || "ko"}
            // 🏨 2026-06-29 = 도시명 prefill(구글맵 방식) = 입력 도시 "Paris " → 사용자가 뒤에 숙소명 = 그 도시만.
            cityPrefix={formData.destination ? `${formData.destination} ` : undefined}
            onSelect={(place: PlaceSelection) => {
              // 선택 저장 → accommodationName 채워짐 → 위 조건으로 이 섹션 언마운트 = 키보드 자동 닫힘
              setFormData((prev) => ({
                ...prev,
                accommodationName: place.name,
                accommodationAddress: place.address,
                accommodationCoords: place.coords,
                accommodationPlaceId: place.placeId,
              }));
            }}
          />
          <Text style={[styles.sectionSubtitle, { color: theme.textTertiary, marginTop: 4, marginLeft: 4 }]}>
            {t("trip.accommodationHint")}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.row}>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => openPicker("startDate")}
          >
            <Icon name="calendar" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>
              {formData.startDate}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => openPicker("endDate")}
          >
            <Icon name="calendar" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>
              {formData.endDate}
            </Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => openPicker("startTime")}
          >
            <Icon name="clock" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>
              {formData.startTime}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => openPicker("endTime")}
          >
            <Icon name="clock" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>
              {formData.endTime}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.companion"), t("trip.companionHint"))}
        <View style={styles.iconGrid}>
          {COMPANION_OPTIONS.map((option) => {
            const isSelected = formData.companionType === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({
                    ...prev,
                    companionType: option.id,
                    companionCount: option.defaultCount,
                    transportType: option.transportType,
                  }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.iconLabel,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.curationFocus"), t("trip.curationFocusHint"))}
        <View style={styles.iconGrid}>
          {CURATION_FOCUS_OPTIONS.map((option) => {
            const isSelected = formData.curationFocus === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, curationFocus: option.id }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.iconLabel,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.vibes"), t("trip.vibesHint"))}
        <View style={styles.vibeGrid}>
          {VIBE_OPTIONS.map((vibe) => {
            const isSelected = formData.vibes.includes(vibe.id);
            const selectionIndex = formData.vibes.indexOf(vibe.id);
            const priorityLabels = [t("trip.priorityHighest"), t("trip.priorityHigh"), t("trip.priorityNormal")];
            const priorityLabel =
              selectionIndex >= 0 ? priorityLabels[selectionIndex] : "";
            return (
              <Pressable
                key={vibe.id}
                style={[
                  styles.vibeButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() => toggleVibe(vibe.id)}
              >
                <Icon
                  name={vibe.icon as any}
                  size={22}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.vibeText,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
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

      <View style={styles.section}>
        {renderSectionHeader(t("trip.travelPace"), t("trip.travelPaceHint"))}
        <View style={styles.toggleRow}>
          {TRAVEL_PACE_OPTIONS.map((option) => {
            const isSelected = formData.travelPace === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.toggleButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, travelPace: option.id }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={20}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleText,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.budget"), t("trip.budgetHint"))}
        <View style={styles.iconGrid}>
          {TRAVEL_STYLE_OPTIONS.map((option) => {
            const isSelected = formData.travelStyle === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, travelStyle: option.id }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.iconLabel,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.mobilityStyle"), t("trip.mobilityStyleHint"))}
        <View style={styles.toggleRow}>
          {MOBILITY_STYLE_OPTIONS.map((option) => {
            const isSelected = formData.mobilityStyle === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.toggleButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, mobilityStyle: option.id }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={20}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleText,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable onPress={handleGenerate} style={styles.generateButton}>
        <LinearGradient
          colors={Brand.gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.generateGradient}
        >
          <Icon name="navigation" size={20} color="#FFFFFF" />
          <Text style={styles.generateText}>{t("trip.generate")}</Text>
        </LinearGradient>
      </Pressable>
      <NativePicker planner={planner} />
      <WebInputModal planner={planner} />
    </ScrollView>
  );
}
