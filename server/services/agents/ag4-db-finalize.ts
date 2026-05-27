// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = DB-only 전용 AG4 = scenario.scenes 직접 사용
// = 옛 itinerary-generator 슬롯 강제 분배 + calcTransitHaversine 자체 계산 = 완전 폐기 (= 단계 4)
// = scenario 성공 = scene 직접 24 슬롯 사용 + scene 의 distance / transit_mode / transit_min 직접 사용
// = scenario 실패 = 옛 itinerary fallback (= 안전망)
// = backfill = fire-and-forget (= FE 우선 노출 + background)
// = dailyPerPersonEur = 1 인 단가 그대로 + group = × companionCount 별도

import { db } from "../../db";
import { exchangeRates } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type {
  PlaceResult,
  TripFormData,
  DaySlotConfig,
  TravelPace,
  AG1Output,
} from "./types";
import { MEAL_BUDGET } from "./types";
import { handleRouteRequest } from "../route/route-handler";
import { backfillFromRoute } from "../route/route-backfill";
import type { RouteResponse } from "../route/route-types";

/** EUR → KRW 환율 = exchangeRates DB 캐시 */
async function getEurToKrwRate(): Promise<number> {
  try {
    if (!db) return 1500;
    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.baseCurrency, "KRW"),
          eq(exchangeRates.targetCurrency, "EUR"),
        ),
      )
      .limit(1);
    if (rate && rate.rate > 0) {
      const eurToKrw = Math.round(1 / rate.rate);
      console.log(`[AG4-DB] 💱 €1 = ₩${eurToKrw.toLocaleString()}`);
      return eurToKrw;
    }
  } catch (error) {
    console.warn("[AG4-DB] 환율 조회 실패, 기본값 사용:", error);
  }
  return 1500;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function classifyMealType(time: string): "lunch" | "dinner" {
  const hour = parseInt(time.split(":")[0], 10);
  return hour < 15 ? "lunch" : "dinner";
}

/**
 * 단순 교통비 추정 = scene.transit_mode + transit_min 기반
 * = 옛 calcTransitHaversine 자체 계산 폐기 후 = scene 응답 직접 사용
 * = 도시별 정확 가격 = 추후 transport-pricing-service 통합 (= 별도 단계)
 */
function estimateTransitCost(
  mode: string,
  minutes: number,
  companionCount: number,
): number {
  switch (mode) {
    case "walk":
      return 0;
    case "metro":
    case "bus":
      return Math.round(2.1 * companionCount * 100) / 100;
    case "RER":
      return Math.round(5.0 * companionCount * 100) / 100;
    case "private_guide":
      return Math.round((minutes / 60) * 60 * 100) / 100; // €60/h
    default:
      return 0;
  }
}

export interface AG4DbInput {
  daySlotsConfig: DaySlotConfig[];
  travelPace: TravelPace;
  formData: TripFormData;
  companionCount: number;
  dayCount: number;
  cityId?: number | null;
  cityCoords?: { lat: number; lng: number };
  skeleton: AG1Output;
  inputPlaces: PlaceResult[];
}

/**
 * AG4-DB 메인 = scenario.scenes 직접 사용 (= 사용자 SSOT 2026-05-26 단계 4)
 * = 옛 슬롯 강제 분배 + zone fallback + placeholder 완전 폐기
 * = scenario 응답 24 씬 = 그대로 일자별 슬롯 = FE 노출
 * = 실패 = 옛 itinerary fallback (= 안전망 = MIX path 동일 코드)
 */
export async function finalizeDbOnlyItinerary(input: AG4DbInput): Promise<any> {
  const _t0 = Date.now();
  const {
    daySlotsConfig,
    travelPace,
    formData,
    companionCount,
    dayCount,
    cityId,
    cityCoords,
    skeleton,
    inputPlaces,
  } = input;

  const eurToKrw = await getEurToKrwRate();

  // ===== 1. scenario 호출 (= 사용자 SSOT = Gemini 자유 동선) =====
  const routeResult = await handleRouteRequest(
    skeleton,
    inputPlaces,
    cityCoords,
  );

  if (!routeResult.ok || !routeResult.response) {
    console.error(
      `[AG4-DB] ❌ route 호출 실패 (${routeResult.elapsedMs}ms) = 옛 itinerary fallback`,
    );
    return await finalizeWithLegacyItinerary(input, eurToKrw);
  }

  const routeResponse = routeResult.response;

  // ===== 2. 백필 = background fire-and-forget (= FE 우선 노출) =====
  if (cityId) {
    backfillFromRoute(routeResponse, cityId, inputPlaces).catch((e: any) =>
      console.warn(`[Route-Backfill] ❌ background error:`, e?.message || e),
    );
  }

  // ===== 3. scene 직접 24 슬롯 사용 =====
  const inputById = new Map(inputPlaces.map((p) => [p.id, p]));
  const slotDuration = skeleton.paceConfig.slotDurationMinutes;
  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];

  // ⚠️ 2026-05-26 = 사용자 SSOT = scene 검증 (= 안전망)
  // = prompt 강제 + 코드 검증 양면 = 환각 차단
  const globalPlaceIdCounts = new Map<string, number>();
  for (const rd of routeResponse.days || []) {
    for (const sc of rd.scenes || []) {
      if (sc.place_id && !sc.place_id.startsWith("auto-")) {
        globalPlaceIdCounts.set(
          sc.place_id,
          (globalPlaceIdCounts.get(sc.place_id) || 0) + 1,
        );
      }
    }
  }
  const dupIds = [...globalPlaceIdCounts.entries()].filter(([, c]) => c > 1);
  if (dupIds.length > 0) {
    dupIds.forEach(([id, c]) =>
      console.warn(`[AG4-DB] ⚠️ place_id 중복 (${c}회 사용): ${id}`),
    );
  }

  const days: any[] = [];
  let totalPerPersonEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find((c) => c.day === d)!;
    const routeDay = routeResponse.days?.find((rd) => rd.day === d);
    const scenes = routeDay?.scenes || [];

    // ⚠️ 2026-05-26 = 일자별 검증 = 사용자 SSOT 위반 검출
    const lastScene = scenes[scenes.length - 1];
    if (lastScene && lastScene.type !== "restaurant") {
      console.warn(
        `[AG4-DB] ⚠️ Day ${d} 마지막 슬롯 = activity (= 저녁 식당 강제 위반): ${lastScene.name_en || "(name null)"}`,
      );
    }
    const nullNames = scenes.filter((s) => !s.name_en);
    if (nullNames.length > 0) {
      nullNames.forEach((s) =>
        console.warn(
          `[AG4-DB] ⚠️ Day ${d} scene name_en null: slot=${s.slot} type=${s.type} place_id=${s.place_id}`,
        ),
      );
    }

    const dayPlaces = scenes.map((scene) => {
      const isAuto = scene.place_id?.startsWith("auto-");
      const inputPlace = !isAuto ? inputById.get(scene.place_id) : undefined;
      const isMeal = scene.type === "restaurant";
      const mealType: "lunch" | "dinner" | undefined = isMeal
        ? classifyMealType(scene.time)
        : undefined;

      const mealPrice = isMeal
        ? (scene.price_per_person_eur ??
          (mealType === "lunch" ? mealBudget.lunch : mealBudget.dinner))
        : undefined;
      const mealPriceLabel = isMeal
        ? scene.price_per_person_eur
          ? `€${scene.price_per_person_eur}`
          : mealType === "lunch"
            ? mealBudget.lunchLabel
            : mealBudget.dinnerLabel
        : undefined;

      // ⚠️ 2026-05-26 = 사용자 SSOT = name_en = 보조 = name_local fallback (= FE 표시)
      const displayName = scene.name_en || scene.name_local;
      return {
        // 식별 (= FE 호환 = 옛 PlaceResult 양식)
        id: scene.place_id,
        name: displayName,
        nameEn: displayName,
        nameKo: scene.name_ko,
        nameLocal: scene.name_local,
        address: scene.address,
        lat: scene.lat,
        lng: scene.lng,
        // 분류
        type: scene.type,
        isMealSlot: isMeal,
        mealType,
        seedCategory:
          inputPlace?.seedCategory || (isMeal ? "restaurant" : "attraction"),
        // 시간
        startTime: scene.time,
        endTime: addMinutes(scene.time, slotDuration),
        // 가격
        estimatedPriceEur: isMeal
          ? scene.price_per_person_eur
          : (inputPlace?.estimatedPriceEur ?? 0),
        mealPrice,
        mealPriceLabel,
        // FE 표시 보강 (= inputPlace = PSR 데이터 = 이미지/리뷰수 등)
        image: inputPlace?.image || null,
        userRatingCount: inputPlace?.userRatingCount,
        selectionReasons: inputPlace?.selectionReasons || [],
        confidenceLevel: inputPlace?.confidenceLevel || "minimal",
        // 본 단계 추가 = scene 의 한국어 카피 (= PSR 백필용 + FE 표시)
        selectionReasonKo:
          scene.selection_reason_ko || inputPlace?.selectionReasons?.[0],
        shortformKo: scene.shortform_ko,
        // 동선 = scene 직접 (= 옛 calcTransitHaversine 폐기)
        distance_from_prev_km: scene.distance_from_prev_km,
        transit_mode: scene.transit_mode,
        transit_min: scene.transit_min,
      };
    });

    // ===== 비용 합산 =====
    const mealCostEur = dayPlaces.reduce(
      (sum, p) => sum + (p.isMealSlot && p.mealPrice ? p.mealPrice : 0),
      0,
    );
    const entranceFeesEur = dayPlaces.reduce(
      (sum, p) =>
        sum +
        (!p.isMealSlot && typeof p.estimatedPriceEur === "number"
          ? p.estimatedPriceEur
          : 0),
      0,
    );

    // ===== 교통 = scene 기반 추정 (= 옛 transit-haversine 폐기) =====
    const transits = scenes.slice(1).map((scene, i) => {
      const cost = estimateTransitCost(
        scene.transit_mode,
        scene.transit_min,
        companionCount,
      );
      return {
        from: scenes[i].name_en,
        to: scene.name_en,
        distance: scene.distance_from_prev_km,
        duration: scene.transit_min,
        mode: scene.transit_mode,
        cost,
        costTotal: cost,
      };
    });
    const transportCostEur = transits.reduce((s, t) => s + (t.cost || 0), 0);

    const dailyPerPersonEur =
      Math.round((mealCostEur + entranceFeesEur + transportCostEur) * 100) /
      100;
    const dailyGroupEur =
      Math.round(dailyPerPersonEur * companionCount * 100) / 100;
    const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);
    const dailyGroupKrw = Math.round(dailyGroupEur * eurToKrw);
    totalPerPersonEur += dailyPerPersonEur;

    days.push({
      day: d,
      places: dayPlaces,
      city: formData.destination,
      summary: `${formData.destination} 하루`,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      transit: {
        transits,
        totalDuration: transits.reduce((s, t) => s + t.duration, 0),
        totalCost: transits.reduce((s, t) => s + t.costTotal, 0),
        totalDistanceKm: routeDay?.total_distance_km || 0,
      },
      dailyCost: {
        mealEur: mealCostEur,
        entranceEur: entranceFeesEur,
        transportEur: transportCostEur,
        totalEur: dailyPerPersonEur,
        totalKrw: dailyGroupKrw,
        perPersonEur: dailyPerPersonEur,
        perPersonKrw: dailyPerPersonKrw,
        groupEur: dailyGroupEur,
        groupKrw: dailyGroupKrw,
      },
    });
  }

  const totalGroupEur =
    Math.round(totalPerPersonEur * companionCount * 100) / 100;
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);
  const totalGroupKrw = Math.round(totalGroupEur * eurToKrw);
  const totalPlaces = days.reduce((s, d) => s + d.places.length, 0);

  console.log(
    `[AG4-DB] ✅ 실시간 완성 (${Date.now() - _t0}ms): ${days.length}일, ${totalPlaces}곳 = scene 직접`,
  );
  console.log(
    `[AG4-DB] 💰 인당: €${totalPerPersonEur.toFixed(2)} / ₩${totalPerPersonKrw.toLocaleString()}`,
  );
  console.log(
    `[AG4-DB] 💰 그룹 ${companionCount}인: €${totalGroupEur.toFixed(2)} / ₩${totalGroupKrw.toLocaleString()}`,
  );
  console.log(
    `[AG4-DB] 🛣️ route Gemini (${routeResult.elapsedMs}ms): ${routeResponse.days?.length || 0}일 동선 = scene 직접 사용`,
  );
  console.log(`[AG4-DB] 🍽️ route 백필 (= background = FE 응답 후 비동기 진행)`);

  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || "09:00",
    endTime: formData.endTime || "21:00",
    days,
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    totalCost: {
      perPersonEur: totalPerPersonEur,
      perPersonKrw: totalPerPersonKrw,
      groupEur: totalGroupEur,
      groupKrw: totalGroupKrw,
      eurToKrwRate: eurToKrw,
      currency: "EUR",
    },
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace,
      totalPlaces,
      companionType: formData.companionType,
      companionCount,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      pipelineVersion: "db-only-v2-scene-direct",
      route: {
        elapsedMs: routeResult.elapsedMs,
        totalDistanceKm: routeResponse.total_distance_km,
        totalDurationSec: routeResponse.total_duration_sec,
        backfill: "background fire-and-forget",
      },
    },
  };
}

/**
 * fallback = 옛 itinerary-generator + calcTransitHaversine (= scenario 실패 시 안전망)
 * = MIX path 와 동일 코드 = 본 함수는 dynamic import (= circular import 회피)
 */
async function finalizeWithLegacyItinerary(
  input: AG4DbInput,
  eurToKrw: number,
): Promise<any> {
  const {
    daySlotsConfig,
    travelPace,
    formData,
    companionCount,
    dayCount,
    skeleton,
    inputPlaces,
  } = input;

  // 옛 enrichment + slot 분배 호출 (= dynamic = circular 회피)
  const { processDbOnly } = await import("./ag3-db-direct");
  const { enriched } = processDbOnly(inputPlaces);
  const { _enrichmentPipeline } = await import("../itinerary-generator");
  const enrichResult = await _enrichmentPipeline.runFullEnrichment(
    enriched,
    formData,
    {
      daySlotsConfig: skeleton.daySlotsConfig,
      travelPace: skeleton.travelPace,
      requiredPlaceCount: skeleton.requiredPlaceCount,
    },
  );

  // 옛 transit-haversine = dynamic = circular 회피
  const { calcTransitHaversine } = await import("./transit-haversine");
  const travelMode: any =
    formData.mobilityStyle === "WalkMore"
      ? "WALK"
      : formData.mobilityStyle === "Minimal"
        ? "DRIVE"
        : "TRANSIT";

  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];
  const days: any[] = [];
  let totalPerPersonEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find((c) => c.day === d)!;
    const dayPlaces = enrichResult.schedule
      .filter((s: any) => s.day === d)
      .map((s: any) => ({
        ...s.place,
        startTime: s.startTime,
        endTime: s.endTime,
        isMealSlot: s.isMealSlot,
        mealType: s.mealType,
        mealPrice: s.isMealSlot
          ? s.place.estimatedPriceEur && s.place.estimatedPriceEur > 0
            ? s.place.estimatedPriceEur
            : s.mealType === "lunch"
              ? mealBudget.lunch
              : mealBudget.dinner
          : undefined,
        mealPriceLabel: s.isMealSlot
          ? s.place.estimatedPriceEur && s.place.estimatedPriceEur > 0
            ? `€${s.place.estimatedPriceEur}`
            : s.mealType === "lunch"
              ? mealBudget.lunchLabel
              : mealBudget.dinnerLabel
          : undefined,
        estimatedPriceEur: s.place.estimatedPriceEur,
        selectionReasons: s.place.selectionReasons || [],
        confidenceLevel: s.place.confidenceLevel || "minimal",
      }));

    const transits: any[] = [];
    for (let i = 0; i < dayPlaces.length - 1; i++) {
      transits.push(
        calcTransitHaversine(
          dayPlaces[i],
          dayPlaces[i + 1],
          travelMode,
          companionCount,
        ),
      );
    }

    const mealCostEur = dayPlaces.reduce(
      (sum: number, p: any) =>
        sum + (p.isMealSlot && p.mealPrice ? p.mealPrice : 0),
      0,
    );
    const entranceFeesEur = dayPlaces.reduce(
      (sum: number, p: any) =>
        sum +
        (!p.isMealSlot && typeof p.estimatedPriceEur === "number"
          ? p.estimatedPriceEur
          : 0),
      0,
    );
    const transportCostEur = transits.reduce(
      (sum: number, t: any) => sum + (t.cost || 0),
      0,
    );
    const dailyPerPersonEur =
      Math.round((mealCostEur + entranceFeesEur + transportCostEur) * 100) /
      100;
    const dailyGroupEur =
      Math.round(dailyPerPersonEur * companionCount * 100) / 100;
    const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);
    const dailyGroupKrw = Math.round(dailyGroupEur * eurToKrw);
    totalPerPersonEur += dailyPerPersonEur;

    days.push({
      day: d,
      places: dayPlaces,
      city: formData.destination,
      summary: `${formData.destination} 하루`,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      transit: {
        transits,
        totalDuration: transits.reduce(
          (s: number, t: any) => s + t.duration,
          0,
        ),
        totalCost: transits.reduce((s: number, t: any) => s + t.costTotal, 0),
        totalDistanceKm: 0, // = fallback = 옛 transit-haversine = 거리 합산 X = FE 호환만
      },
      dailyCost: {
        mealEur: mealCostEur,
        entranceEur: entranceFeesEur,
        transportEur: transportCostEur,
        totalEur: dailyPerPersonEur,
        totalKrw: dailyGroupKrw,
        perPersonEur: dailyPerPersonEur,
        perPersonKrw: dailyPerPersonKrw,
        groupEur: dailyGroupEur,
        groupKrw: dailyGroupKrw,
      },
    });
  }

  const totalGroupEur =
    Math.round(totalPerPersonEur * companionCount * 100) / 100;
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);
  const totalGroupKrw = Math.round(totalGroupEur * eurToKrw);

  console.warn(
    `[AG4-DB] ⚠️ fallback (= 옛 itinerary): ${days.length}일, ${enrichResult.schedule.length}곳`,
  );

  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || "09:00",
    endTime: formData.endTime || "21:00",
    days,
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    totalCost: {
      perPersonEur: totalPerPersonEur,
      perPersonKrw: totalPerPersonKrw,
      groupEur: totalGroupEur,
      groupKrw: totalGroupKrw,
      eurToKrwRate: eurToKrw,
      currency: "EUR",
    },
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace,
      totalPlaces: enrichResult.schedule.length,
      companionType: formData.companionType,
      companionCount,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      pipelineVersion: "db-only-v1-fallback",
      route: { skipped: true, reason: "scenario_failed" },
    },
  };
}
