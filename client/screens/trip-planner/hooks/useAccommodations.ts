// Day별 숙소 설정 + 동선 재최적화 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
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
  // 🏨 Day별 숙소 설정 상태
  const [dayAccommodations, setDayAccommodations] = useState<
    DayAccommodation[]
  >([]);
  const [hotelModalDay, setHotelModalDay] = useState<number | null>(null); // 🏨 숙소 설정 구글 위젯이 인라인으로 펼쳐진 Day (= 모달 폐기 §19, 토글 상태 재활용)
  const [isReoptimizing, setIsReoptimizing] = useState(false);

  // 🏨 Day별 숙소 설정 → 동선 재최적화
  const handleSetDayAccommodation = async (
    day: number,
    place: PlaceSelection,
  ) => {
    // ⚠️ 2026-08-01 사장님 지시 = BTS 여정(마지막 슬롯 = 공연장)은 숙소 변경 금지.
    //   사유(실측): 아래 재최적화(regenerate-day)는 **공연장 슬롯을 모른다** → 그 날을 통째로 다시 짜면서
    //   마지막에 있어야 할 공연장이 1번 자리에 20:00 으로 박혔다(스크린샷). 버튼은 화면에서 숨기지만,
    //   다른 진입로(ResultStep 의 같은 모달)로도 못 들어오게 **여기서 1벌로 막는다**(§16).
    if (formData.finalPlaceId) return;
    // 🏨 2026-07-03 사용자 SSOT = 숙소는 여행 전체 공통(A안). 변경한 Day + 그 이후 Day 전부에 적용, 이전 Day는 유지.
    //   예: Day2에서 B호텔 변경 → Day2·Day3=B, Day1=옛숙소 유지(2일차에 숙소 옮기는 실제 동선). 첫입력 숙소는 전 Day 기본값(A단계).
    const targetDays = (itinerary?.days || [])
      .map((d) => d.day)
      .filter((dNum) => dNum >= day);

    // Day별 숙소 배열 = 변경Day 이상(>=)은 전부 새 숙소로 교체, 이전Day는 그대로
    setDayAccommodations((prev) => {
      const kept = prev.filter((a) => a.day < day);
      const applied: DayAccommodation[] = targetDays.map((dNum) => ({
        day: dNum,
        name: place.name,
        address: place.address,
        coords: place.coords,
        placeId: place.placeId,
      }));
      return [...kept, ...applied];
    });

    // 서버에 동선 재최적화 요청 = 변경Day~마지막Day 각각(출발점 새숙소로 = 실시간 여정 갱신)
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
              formData,
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
          // itinerary의 해당 Day 업데이트 (각 Day 결과 즉시 반영 = 실시간)
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
