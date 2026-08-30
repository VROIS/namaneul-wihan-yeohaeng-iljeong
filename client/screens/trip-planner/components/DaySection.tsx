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
import { displayCityName, isCityCenterName } from "@/lib/display-city-name";
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
              {/* ⚠️ 2026-08-22 사장님 원칙 = 도시·장소명 노출 nameEn>local>한국어 배제. day.city = 생성기가 destination 복사본(pipeline-v3-day-builder:456·ag4:387) = 일치 시 헤더와 같은 1벌(displayCityName)로 치환 */}
              {currentDay.city === itinerary.destination
                ? displayCityName(itinerary)
                : currentDay.city}
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
              const cityCenterLabel = t("trip.departureCityCenter", {
                destination: displayCityName(itinerary),
              });
              if (dayAccom && !isCityCenterName(dayAccom.name))
                return `${t("trip.departure")}: ${dayAccom.name}`;
              // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 서버가 만들어 저장해 둔 "도심" 이름은 무시하고
              if (generalAccom?.name && !isCityCenterName(generalAccom.name))
                return `${t("trip.departure")}: ${generalAccom.name}`;
              return `${t("trip.departure")}: ${cityCenterLabel}`;
            })()}
          </Text>
          {currentDay?.departureTransit && (
            <Text
              style={[
                styles.accommodationTransit,
                { color: theme.textSecondary },
              ]}
            >
              {/* ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = durationText(서버, 한국어 고정) 대신
                  언어중립 숫자(duration)를 t()로 노출시점 번역(§16 = trip.durationM 재사용). */}
              →{" "}
              {t("trip.durationM", { m: currentDay.departureTransit.duration })}
            </Text>
          )}
        </View>
      </View>

      {/* 🏨 2026-06-29 사용자 SSOT = "숙소 설정" 버튼 누르면 그 자리에 구글 공식 위젯 인라인 표시.
                    선택 → handleSetDayAccommodation(동선 재최적화 + dayAccommodations) → 출발바에 숙소명 + 지도 깃발 자동.
                    🎹 2026-08-13 사장님 확정 = 인라인은 **웹 전용**(웹 = 지금도 정상 = 무변경).
                    iOS(2026-07-02)에 이어 AOS 도 ResultStep 전체화면 Modal 로 이관 = Android 15+ 화면축소 제거 + 웹뷰 소거 결함(A36 실증) §19. */}
      {Platform.OS === "web" && hotelModalDay === currentDay?.day && (
        <View style={{ marginHorizontal: 12, marginBottom: 8, zIndex: 50 }}>
          {/* 🏨 2026-06-29 = includedPrimaryTypes 미지정 = 호텔+주소 전부 검색 (옛 lodging단독=호텔만 버그 폐기). */}
          <PlaceAutocompleteWidget
            placeholder={t("trip.hotelSearchPlaceholder")}
            language={i18n.language || "ko"}
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
