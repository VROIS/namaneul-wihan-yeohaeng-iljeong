// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = DB-only 전용 AG4
// = Google Routes API 호출 = 0 (= transit-haversine.ts 사용)
// = dailyPerPersonEur = ÷ companionCount X = 1 인 단가 그대로 + group = × companionCount 별도
//
// ⚠️ 수정금지(승인필요) 2026-05-25 = 사용자 SSOT = scenario/ Gemini 호출 통합 (= DB-only 전용)
// = 표준 prompt (= 10-main-app-route-scenario) 1 회 호출
// = cascade 효과: 신규 식당 발견 → upsertPlace 백필 / 좌표 NULL 보정 / 시나리오 카피 추가
// = transit/distance/cost 자체 계산 = 단계 4 까지 유지 (= 사용자 명시 = 옛 동선 폐기 = 마일스톤 후)

import { db } from "../../db";
import { exchangeRates } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type {
  PlaceResult,
  TripFormData,
  DaySlotConfig,
  TravelPace,
  ScheduleSlot,
  AG1Output,
} from "./types";
import { MEAL_BUDGET } from "./types";
import { calcTransitHaversine, type TravelMode } from "./transit-haversine";
import { handleScenarioRequest } from "../scenario/scenario-handler";
import { backfillFromScenario } from "../scenario/scenario-backfill";
import type {
  ScenarioResponse,
  ScenarioScene,
} from "../scenario/scenario-types";

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

function isValidCoord(lat: number, lng: number): boolean {
  return (
    lat !== 0 &&
    lng !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export interface AG4DbInput {
  schedule: ScheduleSlot[];
  daySlotsConfig: DaySlotConfig[];
  travelPace: TravelPace;
  formData: TripFormData;
  companionCount: number;
  dayCount: number;
  // ⚠️ 수정금지(승인필요) 2026-05-25 = scenario/ Gemini 호출 통합 = cityId 필수 (= backfill)
  cityId?: number | null;
  cityCoords?: { lat: number; lng: number };
  skeleton?: AG1Output; // = scenario-prompt 입력 = AG1 매트릭스 전체
  inputPlaces?: PlaceResult[]; // = scenario-backfill 입력 = AG3-DB 원본 풀
}

/**
 * scenario.scene → (day, slot) 매칭 lookup 구축
 * = dayPlaces array index (= 0-based) ↔ scene.slot (= 1-based)
 */
function buildSceneLookup(
  response: ScenarioResponse | null,
): Map<string, ScenarioScene> {
  const map = new Map<string, ScenarioScene>();
  if (!response?.days) return map;
  for (const day of response.days) {
    if (!day.scenes) continue;
    for (const scene of day.scenes) {
      const key = `${day.day}:${scene.slot}`;
      map.set(key, scene);
    }
  }
  return map;
}

/**
 * AG4-DB 메인 = DB-only 일정 완성
 * = Routes 0 + 단위 일치 (= 1 인 perPerson + group 별도)
 * = scenario/ Gemini 호출 통합 (= 동선 정렬 + 신규 식당 발견 + 시나리오 카피)
 */
export async function finalizeDbOnlyItinerary(input: AG4DbInput): Promise<any> {
  const _t0 = Date.now();
  const {
    schedule,
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

  const travelMode: TravelMode =
    formData.mobilityStyle === "WalkMore"
      ? "WALK"
      : formData.mobilityStyle === "Minimal"
        ? "DRIVE"
        : "TRANSIT";

  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];
  const eurToKrw = await getEurToKrwRate();

  // ⚠️ 수정금지(승인필요) 2026-05-25 = 사용자 SSOT = scenario/ Gemini 호출 통합
  // = 결함 4 종 cascade 해결: 좌표 NULL / 신규 식당 발견 / 시나리오 카피 / 동선 검증
  let scenarioResponse: ScenarioResponse | null = null;
  let scenarioElapsedMs = 0;
  let scenarioBackfillSummary: {
    inserted: number;
    updated: number;
    skipped: number;
  } | null = null;

  if (skeleton && inputPlaces && inputPlaces.length > 0) {
    const scenarioResult = await handleScenarioRequest(
      skeleton,
      inputPlaces,
      cityCoords,
    );
    scenarioElapsedMs = scenarioResult.elapsedMs;
    if (scenarioResult.ok && scenarioResult.response) {
      scenarioResponse = scenarioResult.response;
      // 백필 = 신규 식당 INSERT + 좌표 NULL UPDATE (= 다음 trip cascade)
      if (cityId) {
        const backfill = await backfillFromScenario(
          scenarioResponse,
          cityId,
          inputPlaces,
        );
        scenarioBackfillSummary = {
          inserted: backfill.inserted,
          updated: backfill.updated,
          skipped: backfill.skipped,
        };
      }
    } else {
      console.warn(
        `[AG4-DB] scenario 호출 실패 → 옛 동작 fallback (${scenarioElapsedMs}ms)`,
      );
    }
  }

  const sceneLookup = buildSceneLookup(scenarioResponse);

  const days: any[] = [];
  let totalPerPersonEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find((c) => c.day === d)!;
    const dayPlaces = schedule
      .filter((s) => s.day === d)
      .map((s, idx) => {
        // ⚠️ 수정금지(승인필요) 2026-05-25 = scenario.scene 매칭 = (day, slot=idx+1)
        const scene = sceneLookup.get(`${d}:${idx + 1}`);

        // 좌표 보정 = 옛 lat/lng 0/NULL = scenario 응답 lat/lng 사용 (= 본 trip 즉시 효과)
        const needsCoordFix = !isValidCoord(s.place.lat, s.place.lng);
        const fixedLat =
          needsCoordFix && scene && isValidCoord(scene.lat, scene.lng)
            ? scene.lat
            : s.place.lat;
        const fixedLng =
          needsCoordFix && scene && isValidCoord(scene.lat, scene.lng)
            ? scene.lng
            : s.place.lng;

        return {
          ...s.place,
          lat: fixedLat,
          lng: fixedLng,
          startTime: s.startTime,
          endTime: s.endTime,
          isMealSlot: s.isMealSlot,
          mealType: s.mealType,
          // ⚠️ 수정금지(승인필요) 2026-05-20 = price_eur 실제값 우선 = MEAL_BUDGET fallback (= NULL 시만)
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
          // ⚠️ 수정금지(승인필요) 2026-05-25 = scenario/ Gemini 카피 = FE 시나리오 표시
          scenarioCue: scene
            ? {
                visual_cue_ko: scene.visual_cue_ko,
                narration_ko: scene.narration_ko,
                subtitle_ko: scene.subtitle_ko,
                theme_day_ko: undefined as string | undefined, // day-level 은 아래에서 별도
              }
            : undefined,
        };
      });

    // 숙소 좌표 = 첫 장소 좌표 (= AG4-DB = 단순화)
    const accommodationCoords =
      dayPlaces.length > 0
        ? { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng }
        : undefined;
    const accommodationName = "도심 기준";

    // 이동 구간 = Haversine 자체 계산 (= Routes API 0)
    const transits: any[] = [];
    let departureTransit: any;
    let returnTransit: any;

    if (accommodationCoords && dayPlaces.length > 0) {
      departureTransit = calcTransitHaversine(
        { ...accommodationCoords, name: accommodationName },
        dayPlaces[0],
        travelMode,
        companionCount,
      );
    }

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

    if (accommodationCoords && dayPlaces.length > 0) {
      const last = dayPlaces[dayPlaces.length - 1];
      returnTransit = calcTransitHaversine(
        last,
        { ...accommodationCoords, name: `🏨 ${accommodationName}` },
        travelMode,
        companionCount,
      );
    }

    const allTransits = [
      ...(departureTransit ? [departureTransit] : []),
      ...transits,
      ...(returnTransit ? [returnTransit] : []),
    ];

    // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = priceEur 모든 값 합산 (= 0 = 무료 포함 / null = 제외)
    // = 옛 `> 0` 조건 = healing/hotspot priceEur=0 다수 누락 = 시정 = typeof === 'number'
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
    const transportCostEur = allTransits.reduce(
      (sum: number, t: any) => sum + (t.cost || 0),
      0,
    );

    // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = price_eur 단일 = 1 인 단가 (= ÷ companionCount X)
    const dailyPerPersonEur =
      Math.round((mealCostEur + entranceFeesEur + transportCostEur) * 100) /
      100;
    const dailyGroupEur =
      Math.round(dailyPerPersonEur * companionCount * 100) / 100;
    const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);
    const dailyGroupKrw = Math.round(dailyGroupEur * eurToKrw);

    totalPerPersonEur += dailyPerPersonEur;

    // 좌표 유효성 검증
    for (const p of dayPlaces) {
      if (!isValidCoord(p.lat, p.lng)) {
        console.warn(`[AG4-DB] ⚠️ 좌표 무효: ${p.name} (${p.lat}, ${p.lng})`);
      }
    }

    // ⚠️ 수정금지(승인필요) 2026-05-25 = scenario 응답 day 카피 (= theme_ko + transit_summary_ko)
    const scenarioDay = scenarioResponse?.days?.find((sd) => sd.day === d);

    days.push({
      day: d,
      places: dayPlaces,
      city: formData.destination,
      summary: scenarioDay?.theme_ko || `${formData.destination} 하루`,
      themeKo: scenarioDay?.theme_ko,
      transitSummaryKo: scenarioDay?.transit_summary_ko,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      accommodation: accommodationCoords
        ? {
            day: d,
            name: accommodationName,
            coords: accommodationCoords,
          }
        : undefined,
      departureTransit,
      returnTransit,
      transit: {
        transits: allTransits,
        totalDuration: allTransits.reduce(
          (s: number, t: any) => s + t.duration,
          0,
        ),
        totalCost: allTransits.reduce(
          (s: number, t: any) => s + t.costTotal,
          0,
        ),
      },
      // ⚠️ 수정금지(승인필요) 2026-05-21 = MIX AG4 와 동일 형식 정합 (= 사용자 SSOT) = totalEur + totalKrw 추가 = FE 호환
      dailyCost: {
        mealEur: mealCostEur,
        entranceEur: entranceFeesEur,
        transportEur: transportCostEur,
        totalEur: dailyPerPersonEur, // = MIX 호환 = perPersonEur 동일 (= 1 인 기준 합)
        totalKrw: dailyGroupKrw, // = 그룹 KRW (= 사용자가 본 일일 합산)
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

  console.log(
    `[AG4-DB] ✅ 실시간 완성 (${Date.now() - _t0}ms): ${days.length}일, ${schedule.length}곳`,
  );
  console.log(
    `[AG4-DB] 💰 인당: €${totalPerPersonEur.toFixed(2)} / ₩${totalPerPersonKrw.toLocaleString()}`,
  );
  console.log(
    `[AG4-DB] 💰 그룹 ${companionCount}인: €${totalGroupEur.toFixed(2)} / ₩${totalGroupKrw.toLocaleString()}`,
  );
  if (scenarioResponse) {
    console.log(
      `[AG4-DB] 🎬 scenario Gemini (${scenarioElapsedMs}ms): ${scenarioResponse.days?.length || 0}일 시나리오`,
    );
    if (scenarioBackfillSummary) {
      console.log(
        `[AG4-DB] 🍽️ scenario 백필: INSERT ${scenarioBackfillSummary.inserted} / UPDATE ${scenarioBackfillSummary.updated} / SKIP ${scenarioBackfillSummary.skipped}`,
      );
    }
  }

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
      totalPlaces: schedule.length,
      companionType: formData.companionType,
      companionCount,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      pipelineVersion: "db-only-v1",
      // ⚠️ 수정금지(승인필요) 2026-05-25 = scenario/ Gemini 통합 결과 노출
      scenario: scenarioResponse
        ? {
            elapsedMs: scenarioElapsedMs,
            protagonistSummaryKo: scenarioResponse.protagonist_summary_ko,
            totalDistanceKm: scenarioResponse.total_distance_km,
            totalDurationSec: scenarioResponse.total_duration_sec,
            backfill: scenarioBackfillSummary,
          }
        : { elapsedMs: scenarioElapsedMs, skipped: true },
    },
  };
}
