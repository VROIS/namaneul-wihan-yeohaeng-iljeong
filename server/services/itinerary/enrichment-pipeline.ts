import type { TravelPace, TripFormData, PlaceResult } from "./types";
import { RANK_FALLBACK, NON_FOOD_MAX_RANK } from "./types";
import {
  generateSelectionReasons,
  isFoodPlace,
  getRealityCheckForCity,
} from "./helpers";
import { optimizeDayRoute } from "./route-optimizer";
import { distributePlacesWithUserTime } from "./slot-distributor";

export const _enrichmentPipeline = {
  async runFullEnrichment(
    placesArr: PlaceResult[],
    formData: TripFormData,
    skeleton: {
      daySlotsConfig: {
        day: number;
        startTime: string;
        endTime: string;
        slots: number;
      }[];
      travelPace: TravelPace;
      requiredPlaceCount: number;
    },
  ): Promise<{
    scoredPlaces: PlaceResult[];
    schedule: {
      day: number;
      slot: string;
      place: PlaceResult;
      startTime: string;
      endTime: string;
      isMealSlot: boolean;
      mealType?: "lunch" | "dinner";
    }[];
    realityCheck: { weather: string; crowd: string; status: string };
  }> {
    // ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = vibes 빈값 폴백 = 옛 Foodie→Shopping 교체(§19, 버튼 폐기).
    const vibes = formData.vibes || ["Shopping", "Culture", "Healing"];
    const { daySlotsConfig, travelPace, requiredPlaceCount } = skeleton;

    // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 점수 시스템 완전 폐기
    console.log(
      `[AG3] PSR.rank 단일 SSOT (= 옛 점수 시스템 폐기) | 바이브: ${vibes.join(",")}`,
    );

    placesArr = placesArr
      .map((p) => {
        const { reasons, confidence } = generateSelectionReasons(p);
        const rank = p.rank ?? RANK_FALLBACK;
        return {
          ...p,
          finalScore: Math.max(0, NON_FOOD_MAX_RANK + 1 - rank),
          selectionReasons: reasons,
          confidenceLevel: confidence,
        };
      })
      .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
      .slice(0, requiredPlaceCount + 5);

    placesArr.slice(0, 5).forEach((p, i) => {
      console.log(
        `[AG3]   #${i + 1} ${p.name}: rank=${p.rank ?? "?"} finalScore=${(p.finalScore || 0).toFixed(2)}`,
      );
    });

    console.log(
      `[AG3] 슬롯 분배 시작: ${placesArr.length}곳 → ${daySlotsConfig.length}일 (pace: ${travelPace})`,
    );
    console.log(
      `[AG3] 식당: ${placesArr.filter((p) => isFoodPlace(p)).length}곳, 일반: ${placesArr.filter((p) => !isFoodPlace(p)).length}곳`,
    );

    const schedule = await distributePlacesWithUserTime(
      placesArr,
      daySlotsConfig,
      travelPace,
      formData.travelStyle || "Reasonable",
    );

    console.log(`[AG3] 슬롯 분배 완료: ${schedule.length}개`);
    if (schedule.length === 0) {
      console.error(
        `[AG3] ❌ 슬롯 분배 결과 0개! placesArr: ${placesArr.length}곳, daySlotsConfig: ${JSON.stringify(daySlotsConfig)}`,
      );
      console.log(`[AG3] 🚨 비상 분배 실행...`);
      let emergencySlotIdx = 0;
      for (const dayConfig of daySlotsConfig) {
        for (
          let i = 0;
          i < dayConfig.slots && emergencySlotIdx < placesArr.length;
          i++
        ) {
          const place = placesArr[emergencySlotIdx++];
          const startH = parseInt(dayConfig.startTime.split(":")[0]) + i * 2;
          schedule.push({
            day: dayConfig.day,
            slot:
              startH < 12
                ? "morning"
                : startH < 14
                  ? "lunch"
                  : startH < 18
                    ? "afternoon"
                    : "evening",
            place,
            startTime: `${startH.toString().padStart(2, "0")}:00`,
            endTime: `${(startH + 2).toString().padStart(2, "0")}:00`,
            isMealSlot: false,
            mealType: undefined,
          });
        }
      }
      console.log(`[AG3] 🚨 비상 분배 결과: ${schedule.length}개`);
    }

    const dayCount = daySlotsConfig.length;
    for (let d = 1; d <= dayCount; d++) {
      const daySlots = schedule.filter((s) => s.day === d);
      const nonMealPlaces = daySlots
        .filter((s) => !s.isMealSlot)
        .map((s) => s.place);

      if (nonMealPlaces.length > 2) {
        const dayAccom = formData.dayAccommodations?.find((a) => a.day === d);
        const depCoords =
          dayAccom?.coords ||
          formData.accommodationCoords ||
          formData.destinationCoords;
        const optimized = optimizeDayRoute(nonMealPlaces, depCoords);

        let optIdx = 0;
        for (const slot of daySlots) {
          if (!slot.isMealSlot && optIdx < optimized.length) {
            slot.place = optimized[optIdx];
            optIdx++;
          }
        }
      }
    }

    const realityCheck = await getRealityCheckForCity(formData.destination);

    return { scoredPlaces: placesArr, schedule, realityCheck };
  },
};
