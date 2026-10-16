import React from "react";
import { View, Text, Pressable } from "react-native";
import { Brand, Spacing } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import { Itinerary, DayPlan } from "@/types/trip";
import { resultStyles as styles } from "../styles/result";
import PlaceSlotCard from "./PlaceSlotCard";
import TransitPill, { legFromPlace } from "./TransitPill";
import DailyTotal from "./DailyTotal";
import { displayCityName } from "@/lib/display-city-name";
import { startLabel } from "./day-editor/start-label";
import type { PlannerApi } from "../hooks/useTripPlanner";

export default function DaySection({
  currentDay,
  dayIdx,
  itinerary,
  planner,
}: {
  currentDay: DayPlan;
  dayIdx: number;
  itinerary: Itinerary;
  planner: PlannerApi;
}) {
  const {
    theme,
    t,
    dayAccommodations,
    startDayEdit,
    dayLayoutsRef,
    placesListOffsetRef,
  } = planner;
  const places = currentDay?.places || [];
  const firstLeg = currentDay?.departureTransit ?? legFromPlace(places[0]);
  return (
    <View
      onLayout={(e) => {
        dayLayoutsRef.current[currentDay.day] = e.nativeEvent.layout.y;
      }}
    >
      {/* Day 구분 헤더 */}
      <View
        style={[
          styles.dayHeaderBanner,
          { backgroundColor: `${Brand.primary}12` },
        ]}
      >
        <View
          style={[styles.dayHeaderBadge, { backgroundColor: Brand.primary }]}
        >
          <Text style={styles.dayHeaderBadgeText}>Day {currentDay.day}</Text>
        </View>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          {(currentDay as any).theme ? (
            <Text
              style={[styles.dayHeaderTheme, { color: theme.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {(currentDay as any).theme}
            </Text>
          ) : null}
          {currentDay.city && (
            <Text
              style={[styles.dayHeaderCity, { color: theme.textSecondary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {/* ⚠️ 2026-08-22 사장님 원칙 = 도시·장소명 노출 nameEn>local>한국어 배제. day.city = 생성기가 destination 복사본(pipeline-v3-day-builder:456·ag4:387) = 일치 시 헤더와 같은 1벌(displayCityName)로 치환 */}
              {currentDay.city === itinerary.destination
                ? displayCityName(itinerary)
                : currentDay.city}
            </Text>
          )}
        </View>
        {/* ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = Day 줄 안에 출발지 칸(도심 출발 · 숙소 이름) · 별도 출발 줄 폐지 · 첫 이동은 이동 칸 (정본 §) */}
        <View
          style={[
            styles.dayHeaderStart,
            {
              backgroundColor: theme.backgroundRoot,
              borderColor: `${Brand.primary}30`,
            },
          ]}
        >
          <Icon name="home" size={12} color={Brand.primary} />
          <Text
            style={[styles.dayHeaderStartText, { color: theme.textSecondary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {startLabel(currentDay, dayAccommodations, t)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {/* ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 숙소 변경 버튼 → 여정 수정 버튼(눌러서 들어간 수정 화면에 숙소 변경이 있다) · BTS 날도 수정한다(공연장 슬롯은 고정) (정본 §) */}
        <Pressable
          style={[
            styles.accommodationButton,
            { backgroundColor: Brand.primary },
          ]}
          onPress={() => startDayEdit(currentDay?.day || 1)}
        >
          <Icon name="edit-3" size={12} color="#FFFFFF" />
          <Text style={styles.accommodationButtonText}>
            {t("trip.editItinerary")}
          </Text>
        </Pressable>
      </View>

      {firstLeg && (
        <View style={{ marginTop: Spacing.sm }}>
          <TransitPill leg={firstLeg} theme={theme} t={t} />
        </View>
      )}

      <View
        style={styles.placesList}
        onLayout={(e) => {
          placesListOffsetRef.current[currentDay.day] = e.nativeEvent.layout.y;
        }}
      >
        {places.map((place: any, index: number) => (
          <PlaceSlotCard
            key={place.id}
            place={place}
            index={index}
            places={places}
            currentDay={currentDay}
            itinerary={itinerary}
            planner={planner}
          />
        ))}
      </View>

      {/* 🏨 숙소 복귀 정보 */}
      {currentDay?.returnTransit && (
        <View
          style={[
            styles.accommodationBar,
            {
              backgroundColor: `${Brand.primary}05`,
              borderColor: `${Brand.primary}15`,
              marginTop: 8,
              marginHorizontal: 12,
              borderRadius: 8,
            },
          ]}
        >
          <View style={styles.accommodationInfo}>
            <Icon name="arrow-left" size={14} color={theme.textSecondary} />
            <Text
              style={[
                styles.accommodationTransit,
                { color: theme.textSecondary },
              ]}
            >
              {currentDay.returnTransit.from} → {t("trip.returnToHotel")} (
              {t("trip.durationM", { m: currentDay.returnTransit.duration })})
            </Text>
          </View>
        </View>
      )}

      <DailyTotal currentDay={currentDay} planner={planner} />

      {/* Day 구분선 */}
      {dayIdx < (itinerary.days?.length || 1) - 1 && (
        <View
          style={{
            height: 12,
            backgroundColor: theme.backgroundRoot,
          }}
        />
      )}
    </View>
  );
}
