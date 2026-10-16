import { useState } from "react";
import { Alert } from "react-native";
import { Itinerary, TripFormData, DayAccommodation } from "@/types/trip";
import { apiRequest } from "@/lib/query-client";
import { type PlaceAutoSelection as PlaceSelection } from "@/components/PlaceAutocompleteWidget";

export function useAccommodations({
  itinerary,
  setItinerary,
  formData,
  t,
}: {
  itinerary: Itinerary | null;
  setItinerary: React.Dispatch<React.SetStateAction<Itinerary | null>>;
  formData: TripFormData;
  t: (key: string, opts?: any) => string;
}) {
  const [dayAccommodations, setDayAccommodations] = useState<
    DayAccommodation[]
  >([]);
  const [hotelModalDay, setHotelModalDay] = useState<number | null>(null); // 🏨 숙소 설정 구글 위젯이 인라인으로 펼쳐진 Day (= 모달 폐기 §19, 토글 상태 재활용)
  const [isReoptimizing, setIsReoptimizing] = useState(false);

  const handleSetDayAccommodation = async (
    day: number,
    place: PlaceSelection,
  ) => {
    // ⚠️ 2026-08-01 사장님 지시 = 마지막 슬롯이 고정된 여정(BTS 공연장)은 숙소 변경 금지.
    if (formData.finalPlaceId) return;
    // 🏨 2026-08-13 사장님 확정 = 숙소변경은 **변경한 그날만** 적용(깃발·슬롯 동선 재정렬도 그날만, 다른 날 = 기존/도시중심 그대로).
    const targetDays = (itinerary?.days || [])
      .map((d) => d.day)
      .filter((dNum) => dNum === day);

    setDayAccommodations((prev) => {
      const kept = prev.filter((a) => a.day !== day);
      const applied: DayAccommodation[] = targetDays.map((dNum) => ({
        day: dNum,
        name: place.name,
        address: place.address,
        coords: place.coords,
        placeId: place.placeId,
      }));
      return [...kept, ...applied];
    });

    if (itinerary && place.coords.lat && place.coords.lng) {
      setIsReoptimizing(true);
      try {
        for (const dNum of targetDays) {
          const targetDay = itinerary.days?.find((d) => d.day === dNum);
          if (!targetDay) continue;
          const response = await apiRequest(
            "POST",
            "/api/routes/regenerate-day",
            {
              day: dNum,
              accommodationCoords: place.coords,
              places: targetDay.places,
              // ⚠️ 수정금지(승인필요) 2026-08-14 사장님 SSOT = 이미 만든 여정의 값은 그 여정이 갖고 있다.
              formData: {
                travelStyle: itinerary.travelStyle,
                mobilityStyle: itinerary.mobilityStyle,
                companionType: itinerary.companionType,
                startDate: itinerary.startDate,
                endDate: itinerary.endDate,
                startTime: targetDay.startTime,
                endTime: targetDay.endTime,
              },
            },
          );
          const result = await response.json();
          const newAccom: DayAccommodation = {
            day: dNum,
            name: place.name,
            address: place.address,
            coords: place.coords,
            placeId: place.placeId,
          };
          setItinerary((prev) => {
            if (!prev) return prev;
            const updatedDays = prev.days.map((d) =>
              d.day === dNum
                ? {
                    ...d,
                    places: result.places || d.places,
                    accommodation: newAccom,
                    departureTransit: result.departureTransit,
                    returnTransit: result.returnTransit,
                    transit: (result as any).transit || (d as any).transit,
                    // 🧠 2026-07-04 사장님 SSOT = 화면이 읽는 가격·교통표시 갱신 = 숙소 재계산 후 가이드칩·교통비 실제 반영(버그① 해소).
                    dailyCost:
                      (result as any).dailyCost || (d as any).dailyCost,
                    transportDisplay:
                      (result as any).transportDisplay ||
                      (d as any).transportDisplay,
                  }
                : d,
            );
            return { ...prev, days: updatedDays };
          });
        }
      } catch (error) {
        console.error("[TripPlanner] Day 재최적화 실패:", error);
        Alert.alert(t("common.notice"), t("trip.reoptimizeFailed"));
      } finally {
        setIsReoptimizing(false);
      }
    }

    setHotelModalDay(null);
  };

  return {
    dayAccommodations,
    setDayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    isReoptimizing,
    handleSetDayAccommodation,
  };
}
