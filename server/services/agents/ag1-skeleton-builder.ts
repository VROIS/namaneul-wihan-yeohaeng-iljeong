// ⚠️ 수정금지(승인필요) 2026-05-20 = KoreanSentiment 완전 폐기 (= 사용자 SSOT)
import {
  type AG1Output,
  type TripFormData,
  type TravelPace,
  type DaySlotConfig,
  PACE_CONFIG,
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
  getCompanionCount,
  calculateSlotsForDay,
  calculateDayCount,
} from "./types";

function calculateVibeWeights(selectedVibes: string[], _protagonist: string) {
  if (selectedVibes.length === 0) return [];
  const PRIORITY_WEIGHTS: Record<number, number[]> = {
    1: [100],
    2: [60, 40],
    3: [50, 30, 20],
  };
  const weights = PRIORITY_WEIGHTS[selectedVibes.length] || [50, 30, 20];
  return selectedVibes.map((vibe, index) => ({
    vibe: vibe as any,
    weight: weights[index] / 100,
    percentage: weights[index],
  }));
}

export async function buildSkeleton(
  formData: TripFormData,
): Promise<AG1Output> {
  const _t0 = Date.now();

  // ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = vibes 빈값 폴백 = 옛 Foodie→Shopping 교체(§19, 버튼 폐기). 헤더 "미식" 오염 차단.
  const vibes = formData.vibes || ["Shopping", "Culture", "Healing"];
  const curationFocus = formData.curationFocus || "Everyone";
  const vibeWeights = calculateVibeWeights(vibes, curationFocus);

  let travelPace: TravelPace = (formData.travelPace as TravelPace) || "Normal";
  if (travelPace === ("Moderate" as any)) travelPace = "Normal";

  const paceConfig = PACE_CONFIG[travelPace];
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);

  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;

  const daySlotsConfig: DaySlotConfig[] = [];
  let totalRequiredPlaces = 0;

  for (let d = 1; d <= dayCount; d++) {
    let dayStart: string;
    let dayEnd: string;

    if (dayCount === 1) {
      dayStart = userStartTime;
      dayEnd = userEndTime;
    } else if (d === 1) {
      dayStart = userStartTime;
      dayEnd = DEFAULT_END_TIME;
    } else if (d === dayCount) {
      dayStart = DEFAULT_START_TIME;
      dayEnd = userEndTime;
    } else {
      dayStart = DEFAULT_START_TIME;
      dayEnd = DEFAULT_END_TIME;
    }

    let slots = calculateSlotsForDay(dayStart, dayEnd, travelPace);
    // ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 핀(pinnedPlaceIds) = "고른 장소는 반드시 포함"(ag2-gemini-recommender.ts
    if (dayCount === 1 && Array.isArray(formData.pinnedPlaceIds)) {
      slots = Math.max(slots, formData.pinnedPlaceIds.length + 2);
    }
    daySlotsConfig.push({
      day: d,
      startTime: dayStart,
      endTime: dayEnd,
      slots,
    });
    totalRequiredPlaces += slots;
  }

  const requiredPlaceCount = totalRequiredPlaces + 4; // 여유분
  const companionCount = getCompanionCount(formData.companionType || "Solo");

  console.log(`[AG1] ===== 뼈대 생성 완료 (${Date.now() - _t0}ms) =====`);
  console.log(
    `[AG1] ${dayCount}일, ${totalRequiredPlaces}슬롯, 밀도: ${travelPace} (${paceConfig.slotDurationMinutes}분)`,
  );
  daySlotsConfig.forEach((d) => {
    console.log(
      `[AG1]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`,
    );
  });

  return {
    formData,
    vibeWeights,
    travelPace,
    paceConfig,
    dayCount,
    daySlotsConfig,
    totalRequiredPlaces,
    requiredPlaceCount,
    companionCount,
  };
}
