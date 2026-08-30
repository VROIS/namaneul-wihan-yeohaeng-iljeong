import { haversineKm } from "../agents/transit-haversine";
import { MEAL_BUDGET, type TravelStyle } from "../agents/types";
import { PACE_CONFIG, type PlaceResult, type TravelPace } from "./types";
import {
  isFoodPlace,
  calculateRestaurantScore,
  minutesToTime,
} from "./helpers";

export async function distributePlacesWithUserTime(
  places: PlaceResult[],
  daySlotsConfig: {
    day: number;
    startTime: string;
    endTime: string;
    slots: number;
  }[],
  travelPace: TravelPace,
  travelStyle: TravelStyle = "Reasonable",
): Promise<
  {
    day: number;
    slot: string;
    place: PlaceResult;
    startTime: string;
    endTime: string;
    isMealSlot: boolean;
    mealType?: "lunch" | "dinner";
  }[]
> {
  const schedule: {
    day: number;
    slot: string;
    place: PlaceResult;
    startTime: string;
    endTime: string;
    isMealSlot: boolean;
    mealType?: "lunch" | "dinner";
  }[] = [];
  const paceConfig = PACE_CONFIG[travelPace];

  const foodPlaces = places.filter((p) => isFoodPlace(p));
  const nonFoodPlaces = places.filter((p) => !isFoodPlace(p));

  console.log(
    `[Itinerary] 🍽️ 식사 장소: ${foodPlaces.length}곳, 일반 장소: ${nonFoodPlaces.length}곳 (총 ${places.length}곳)`,
  );
  if (foodPlaces.length > 0) {
    console.log(
      `[Itinerary]   식당 목록: ${foodPlaces.map((p) => `${p.name}(tags:${p.tags?.join(",") || "없음"})`).join(", ")}`,
    );
  }
  if (nonFoodPlaces.length === 0) {
    console.error(`[Itinerary] ❌ 일반 장소 0곳! 전체 장소 태그 점검:`);
    places.forEach((p) => {
      console.log(
        `  - ${p.name}: tags=${JSON.stringify(p.tags)}, placeTypes=${JSON.stringify(p.placeTypes)}, vibeTags=${JSON.stringify(p.vibeTags)}`,
      );
    });
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-2 = 일자별 zone 매핑 + 비식당 클러스터링 (= 사용자 SSOT)

  const dayCount = daySlotsConfig.length;
  const dayZoneMap: ("core" | "outskirt" | "mixed")[] = [];
  for (let d = 0; d < dayCount; d++) {
    if (dayCount === 1) dayZoneMap.push("core");
    else if (d === 0) dayZoneMap.push("core");
    else if (d === 1) dayZoneMap.push("outskirt");
    else dayZoneMap.push("mixed");
  }
  console.log(
    `[Itinerary] 🗺️ 일자별 zone 매핑: ${dayZoneMap.map((z, i) => `Day ${i + 1}=${z}`).join(" / ")}`,
  );

  const coreNonFood = nonFoodPlaces.filter((p) => p.dayZone !== "outskirt");
  const outskirtNonFood = nonFoodPlaces.filter((p) => p.dayZone === "outskirt");
  const coreFood = foodPlaces.filter((p) => p.dayZone !== "outskirt");
  const outskirtFood = foodPlaces.filter((p) => p.dayZone === "outskirt");
  console.log(
    `[Itinerary] 🌿 비식당 zone: core ${coreNonFood.length} / outskirt ${outskirtNonFood.length} | 🍽️ 식당 zone: core ${coreFood.length} / outskirt ${outskirtFood.length}`,
  );

  const dayPools: PlaceResult[][] = dayZoneMap.map((zone) => {
    if (zone === "core") return [...coreNonFood];
    if (zone === "outskirt") return [...outskirtNonFood];
    return [...coreNonFood, ...outskirtNonFood]; // mixed
  });

  const foodWithScores: { place: PlaceResult; restaurantScore: number }[] = [];
  for (const fp of foodPlaces) {
    const score = await calculateRestaurantScore(fp);
    foodWithScores.push({ place: fp, restaurantScore: score });
  }

  console.log(
    `[Itinerary] 🍽️ 식당 점수 계산 완료 (${foodWithScores.length}곳, 상위: ${foodWithScores
      .sort((a, b) => b.restaurantScore - a.restaurantScore)
      .slice(0, 3)
      .map((f) => `${f.place.name}=${f.restaurantScore.toFixed(1)}`)
      .join(", ")})`,
  );

  const mealBudget = MEAL_BUDGET[travelStyle];

  /** ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-3 = 식당 선정 단순화 (= 사용자 SSOT) */
  function selectBestRestaurant(
    candidates: { place: PlaceResult; restaurantScore: number }[],
    prevPlace: PlaceResult | null,
    mealBudgetMax: number,
    usedIds: Set<string>,
  ): { place: PlaceResult; restaurantScore: number } | null {
    const available = candidates.filter((c) => !usedIds.has(c.place.id));
    if (available.length === 0) return null;

    const inBudget = available.filter((c) => {
      const price = c.place.estimatedPriceEur;
      if (price === undefined || price <= 0) return true; // 가격 정보 X = 통과 (= 풀 자체 신뢰)
      return price <= mealBudgetMax * 1.3; // 30% 이내 초과 허용
    });
    const pool = inBudget.length > 0 ? inBudget : available; // 모두 초과 시 fallback

    // ⚠️ 수정금지(승인필요) 2026-05-21 = 이전 슬롯 좌표 = 가장 가까운 식당 (= Haversine = 위도/경도 정확 거리)
    if (!prevPlace || !prevPlace.lat || !prevPlace.lng) {
      const winner = pool[0];
      console.log(
        `[Restaurant선정] ${winner.place.name}: 이전슬롯 X = 1등 (€${winner.place.estimatedPriceEur ?? "?"})`,
      );
      return winner;
    }

    const scored = pool.map((c) => {
      const distKm =
        c.place.lat && c.place.lng
          ? haversineKm(prevPlace.lat, prevPlace.lng, c.place.lat, c.place.lng)
          : 999;
      return { ...c, distKm };
    });
    scored.sort((a, b) => a.distKm - b.distKm);
    const winner = scored[0];
    console.log(
      `[Restaurant선정] ${winner.place.name}: 거리=${winner.distKm.toFixed(2)}km (€${winner.place.estimatedPriceEur ?? "?"} ≤ €${mealBudgetMax})`,
    );
    return winner;
  }

  const usedFoodIds = new Set<string>();
  // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 전역 비식당 중복 차단 (= 일자 간 = Day 1 Eiffel + Day 3 Eiffel 사고 차단)
  const usedNonFoodIds = new Set<string>();

  function createDefaultRestaurant(
    type: "lunch" | "dinner",
    refPlace: PlaceResult | null,
  ): PlaceResult {
    const typeLabel = type === "lunch" ? "점심" : "저녁";
    const budget = type === "lunch" ? mealBudget.lunch : mealBudget.dinner;
    const budgetLabel =
      type === "lunch" ? mealBudget.lunchLabel : mealBudget.dinnerLabel;
    let fallbackLat = 48.8566;
    let fallbackLng = 2.3522;
    if (refPlace && refPlace.lat !== 0 && refPlace.lng !== 0) {
      fallbackLat = refPlace.lat;
      fallbackLng = refPlace.lng;
    } else {
      const anyValid = places.find((p) => p.lat !== 0 && p.lng !== 0);
      if (anyValid) {
        fallbackLat = anyValid.lat;
        fallbackLng = anyValid.lng;
      }
    }
    return {
      id: `default-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `현지 인기 ${typeLabel} 식당`,
      description: `${budgetLabel} 예산 내 현지 맛집 추천 (동선 고려)`,
      lat: fallbackLat,
      lng: fallbackLng,
      sourceType: "Default",
      personaFitReason: `${budgetLabel} 예산에 맞는 현지 맛집`,
      tags: ["restaurant", "food"],
      vibeTags: ["Foodie"],
      image: "",
      priceEstimate: budgetLabel,
      placeTypes: ["restaurant"],
      city: refPlace?.city,
      region: refPlace?.region,
      googleMapsUrl: "",
      estimatedPriceEur: budget,
    };
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-2 = 일자별 풀 인덱스 (= 옛 nonFoodIndex 단일 → 일자별 분리)
  const dayPoolIndex: number[] = dayPools.map(() => 0);

  for (let dIdx = 0; dIdx < daySlotsConfig.length; dIdx++) {
    const dayConfig = daySlotsConfig[dIdx];
    const { day, startTime, endTime, slots } = dayConfig;
    const dayZone = dayZoneMap[dIdx]; // 본 일자 zone (= 'core' / 'outskirt' / 'mixed')
    const dayPool = dayPools[dIdx]; // 본 일자 비식당 풀

    const primaryFoodPool: PlaceResult[] =
      dayZone === "outskirt"
        ? outskirtFood
        : dayZone === "core"
          ? coreFood
          : [...coreFood, ...outskirtFood];
    const dayFoodWithScores = foodWithScores.filter((fs) =>
      primaryFoodPool.some((fp) => fp.id === fs.place.id),
    );

    console.log(
      `[Itinerary] === Day ${day} (zone=${dayZone}) = 비식당 풀 ${dayPool.length} + 식당 풀 ${dayFoodWithScores.length} ===`,
    );

    let lunchAssigned = false;
    let dinnerAssigned = false;

    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const dayStartMinutes = startH * 60 + startM;
    const dayEndMinutes = endH * 60 + endM;

    let currentMinutes = dayStartMinutes;
    let prevPlaceInDay: PlaceResult | null = null; // 동선 계산용

    for (let slotIdx = 0; slotIdx < slots; slotIdx++) {
      const slotStart = minutesToTime(currentMinutes);
      currentMinutes += paceConfig.slotDurationMinutes;
      const slotEnd = minutesToTime(Math.min(currentMinutes, dayEndMinutes));

      const slotStartMinutes = currentMinutes - paceConfig.slotDurationMinutes;
      const slotEndMinutes = currentMinutes;
      const slotMidMinutes = Math.round(
        (slotStartMinutes + slotEndMinutes) / 2,
      );
      const slotMidHour = slotMidMinutes / 60;
      const slotHour = parseInt(slotStart.split(":")[0]);

      let slotType: "morning" | "lunch" | "afternoon" | "evening";
      if (slotMidHour < 12) slotType = "morning";
      else if (slotMidHour < 14.5) slotType = "lunch";
      else if (slotMidHour < 18) slotType = "afternoon";
      else slotType = "evening";

      // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = 저녁 = 시간 고정 X = 일일 마지막 슬롯 = 무조건 dinner
      let isMealSlot = false;
      let mealType: "lunch" | "dinner" | undefined;

      const lunchWindowStart = 11.5 * 60; // 11:30
      const lunchWindowEnd = 14 * 60; // 14:00
      const isLastSlot = slotIdx === slots - 1;

      if (isLastSlot && !dinnerAssigned) {
        isMealSlot = true;
        mealType = "dinner";
        dinnerAssigned = true;
      } else if (
        slotMidMinutes >= lunchWindowStart &&
        slotMidMinutes <= lunchWindowEnd &&
        !lunchAssigned
      ) {
        isMealSlot = true;
        mealType = "lunch";
        lunchAssigned = true;
      }

      let selectedPlace: PlaceResult;

      if (isMealSlot) {
        // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = zone pool 만 = fallback 제거
        const budgetMax =
          mealType === "lunch" ? mealBudget.lunch : mealBudget.dinner;
        const bestFood = selectBestRestaurant(
          dayFoodWithScores,
          prevPlaceInDay,
          budgetMax,
          usedFoodIds,
        );

        if (bestFood) {
          selectedPlace = bestFood.place;
          usedFoodIds.add(bestFood.place.id);
          const budgetLabel =
            mealType === "lunch"
              ? mealBudget.lunchLabel
              : mealBudget.dinnerLabel;
          console.log(
            `[Itinerary] Day ${day} ${mealType}: ${selectedPlace.name} (${budgetLabel})`,
          );
        } else {
          selectedPlace = createDefaultRestaurant(mealType!, prevPlaceInDay);
          console.log(
            `[Itinerary] Day ${day} ${mealType}: placeholder 생성 (= zone='${dayZone}' 식당 부족)`,
          );
        }
      } else {
        // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 전역 usedNonFoodIds = 일자 간 중복 차단
        while (
          dayPoolIndex[dIdx] < dayPool.length &&
          usedNonFoodIds.has(dayPool[dayPoolIndex[dIdx]].id)
        ) {
          dayPoolIndex[dIdx]++;
        }
        if (dayPoolIndex[dIdx] < dayPool.length) {
          selectedPlace = dayPool[dayPoolIndex[dIdx]];
          usedNonFoodIds.add(selectedPlace.id);
          dayPoolIndex[dIdx]++;
        } else {
          const remainingNonFood = nonFoodPlaces.filter(
            (p) => !usedNonFoodIds.has(p.id),
          );
          if (remainingNonFood.length > 0) {
            selectedPlace = remainingNonFood[0];
            usedNonFoodIds.add(selectedPlace.id);
            console.log(
              `[Itinerary] Day ${day} slot ${slotIdx}: 일자 풀 소진 → 다른 일자 fallback: ${selectedPlace.name}`,
            );
          } else {
            const remainingFood = foodWithScores.filter(
              (f) => !usedFoodIds.has(f.place.id),
            );
            if (remainingFood.length > 0) {
              const fallback = remainingFood[0];
              selectedPlace = fallback.place;
              usedFoodIds.add(fallback.place.id);
              console.log(
                `[Itinerary] Day ${day} slot ${slotIdx}: 모든 비식당 소진 → 식당 대체: ${selectedPlace.name}`,
              );
            } else {
              console.log(
                `[Itinerary] Day ${day} slot ${slotIdx}: 모든 장소 소진, 남은 슬롯 스킵`,
              );
              continue;
            }
          }
        }
      }

      prevPlaceInDay = selectedPlace; // 동선 계산용 이전 장소 업데이트

      schedule.push({
        day,
        slot: slotType,
        place: selectedPlace,
        startTime: slotStart,
        endTime: slotEnd,
        isMealSlot,
        mealType,
      });
    }
  }

  const mealSlots = schedule.filter((s) => s.isMealSlot);
  const lunchCount = mealSlots.filter((s) => s.mealType === "lunch").length;
  const dinnerCount = mealSlots.filter((s) => s.mealType === "dinner").length;
  const totalDays = daySlotsConfig.length;
  console.log(
    `[Itinerary] 🍽️ 식사 배치 완료: ${totalDays}일 × (점심1+저녁1) = 점심${lunchCount}개 + 저녁${dinnerCount}개`,
  );
  console.log(
    `[Itinerary] 🍽️ 예산: 점심 ${mealBudget.lunchLabel}/인, 저녁 ${mealBudget.dinnerLabel}/인 (일일 총 €${mealBudget.dailyTotal}/인)`,
  );

  const nonMealFoodSlots = schedule.filter(
    (s) => !s.isMealSlot && isFoodPlace(s.place),
  );
  if (nonMealFoodSlots.length > 0) {
    console.log(
      `[Itinerary] ℹ️ 식당 ${nonMealFoodSlots.length}곳이 일반 슬롯에 대체 배치됨 (일반 장소 부족 시 정상)`,
    );
  }

  return schedule;
}
