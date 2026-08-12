// Day 섹션(헤더배너·출발바·인라인 숙소위젯·슬롯목록·복귀·일별합계) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import { Itinerary, DayPlan } from "@/types/trip";
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
import { resultStyles as styles } from "../styles/result";
import PlaceSlotCard from "./PlaceSlotCard";
import DailyTotal from "./DailyTotal";
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
    i18n,
    dayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    handleSetDayAccommodation,
    dayLayoutsRef,
    placesListOffsetRef,
    hasFixedFinalPlace,
  } = planner;
  const places = currentDay?.places || [];
  return (
    <View
      // 🗺️ 2026-06-28 = Day별 시작 y 기록 (= 스크롤 감지로 지도 Day 자동 전환)
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
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.dayHeaderTheme, { color: theme.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {(currentDay as any).theme || ""}
          </Text>
          {currentDay.city && (
            <Text
              style={[styles.dayHeaderCity, { color: theme.textSecondary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {currentDay.city}
            </Text>
          )}
        </View>
        {/* ⚠️ 2026-08-01 사장님 지시 = 마지막 슬롯이 고정된 여정(BTS 공연장)에는 [숙소 변경]을 안 보여준다.
            사유(실측): 숙소를 바꾸면 그 날을 통째로 다시 짜는데 그 경로는 고정 슬롯을 몰라서
            마지막에 있어야 할 공연장이 1번 자리에 20:00 으로 박혔다(스크린샷).
            판단 기준 = 아래 useAccommodations 차단과 **같은 값 1벌**(§16). */}
        {!hasFixedFinalPlace && (
          <Pressable
            style={[
              styles.accommodationButton,
              { backgroundColor: Brand.primary },
            ]}
            onPress={() => setHotelModalDay(currentDay?.day || 1)}
          >
            <Icon name="home" size={12} color="#FFFFFF" />
            <Text style={styles.accommodationButtonText}>
              {dayAccommodations.find((a) => a.day === currentDay?.day) ||
              currentDay?.accommodation
                ? t("trip.accommodationSet")
                : t("trip.accommodationSetup")}
            </Text>
          </Pressable>
        )}
      </View>

      {/* 출발 정보 */}
      <View
        style={[
          styles.accommodationBar,
          {
            backgroundColor: `${Brand.primary}06`,
            borderColor: `${Brand.primary}15`,
            marginHorizontal: 12,
            marginBottom: 4,
            borderRadius: 8,
          },
        ]}
      >
        <View style={styles.accommodationInfo}>
          <Icon name="home" size={14} color={Brand.primary} />
          <Text
            style={[
              styles.accommodationText,
              { color: theme.textSecondary, fontSize: 12 },
            ]}
            numberOfLines={1}
          >
            {(() => {
              const dayAccom = dayAccommodations.find(
                (a) => a.day === currentDay?.day,
              );
              const generalAccom = currentDay?.accommodation;
              if (dayAccom) return `${t("trip.departure")}: ${dayAccom.name}`;
              if (generalAccom?.name)
                return `${t("trip.departure")}: ${generalAccom.name}`;
              return `${t("trip.departure")}: ${t("trip.departureCityCenter", { destination: itinerary.destination })}`;
            })()}
          </Text>
          {currentDay?.departureTransit && (
            <Text
              style={[
                styles.accommodationTransit,
                { color: theme.textSecondary },
              ]}
            >
              → {currentDay.departureTransit.durationText}
            </Text>
          )}
        </View>
      </View>

      {/* 🏨 2026-06-29 사용자 SSOT = 인앱 모달 폐기(§19) → "숙소 설정" 버튼 누르면 그 자리에 구글 공식 위젯 인라인 표시.
                    선택 → handleSetDayAccommodation(동선 재최적화 + dayAccommodations) → 출발바에 숙소명 + 지도 깃발 자동.
                    🎹 2026-08-12 사장님 승인 = **웹만 인라인**. 옛 AOS 인라인 전제(2026-07-02) 폐기 = 2026-08-12 §19
                    — Android 15+ 는 키보드가 떠도 창을 안 줄여(edge-to-edge) 인라인이 키보드에 깔림(A36 실측)
                    → 폰(iOS+AOS) = ResultStep 의 공용 전체화면 그릇(FullscreenPlaceSearch) 1벌. */}
      {Platform.OS === "web" && hotelModalDay === currentDay?.day && (
        <View style={{ marginHorizontal: 12, marginBottom: 8, zIndex: 50 }}>
          {/* 🏨 2026-06-29 = includedPrimaryTypes 미지정 = 호텔+주소 전부 검색 (옛 lodging단독=호텔만 버그 폐기). */}
          <PlaceAutocompleteWidget
            placeholder={t("trip.hotelSearchPlaceholder")}
            language={i18n.language || "ko"}
            // 🏨 2026-06-29 = 도시명 prefill(구글맵 방식) = 그 도시 "Paris " → 사용자가 뒤에 숙소명 = 그 도시만.
            cityPrefix={
              itinerary?.destination ? `${itinerary.destination} ` : undefined
            }
            onSelect={(place: PlaceSelection) => {
              handleSetDayAccommodation(currentDay.day, place);
              setHotelModalDay(null);
            }}
          />
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
              {currentDay.returnTransit.durationText})
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
