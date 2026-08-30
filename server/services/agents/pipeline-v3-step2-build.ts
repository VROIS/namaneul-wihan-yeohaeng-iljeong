import type {
  TripFormData,
  PlaceResult,
  DaySlotConfig,
  TravelPace,
  VibeWeight,
} from "./types";
import { SEED_CATEGORIES, DEFAULT_START_TIME, DEFAULT_END_TIME } from "./types";
import { matchPlacesWithDB } from "./ag3-match-core";
import { saveNewPlacesToDB } from "./ag3-save-new-places";
import { preloadCityData } from "./ag3-seed-loader";
import {
  calculateTransportPrice,
  shouldApplyGuidePrice,
  round2,
  type GuidePriceResult,
  type TransitPriceResult,
} from "../transport-pricing-service";
import { getEurToKrwRate } from "../exchange-rate";
import {
  sanitizePriceEur,
  resolvePrice,
  normalizeTravelStyle,
  type GeminiPlace,
  type GeminiDay,
} from "./pipeline-v3-types";
import { getEnrichmentFunctions } from "./pipeline-v3-helpers";
import { buildDayResult } from "./pipeline-v3-day-builder";

export async function step2_enrichAndBuild(
  geminiDays: GeminiDay[],
  formData: TripFormData,
  preloaded: Awaited<ReturnType<typeof preloadCityData>>,
  daySlotsConfig: DaySlotConfig[],
  dayCount: number,
  companionCount: number,
  travelPace: TravelPace,
  paceConfig: {
    slotDurationMinutes: number;
    mealDurationMinutes: number;
    maxSlotsPerDay: number;
  },
  vibeWeights: VibeWeight[],
): Promise<any> {
  const _t0 = Date.now();

  const allPlaces: PlaceResult[] = [];
  const scheduleMap: { day: number; gPlace: GeminiPlace; placeId: string }[] =
    [];

  for (const gDay of geminiDays) {
    if (!gDay.places) continue;
    for (const gPlace of gDay.places) {
      const isMeal = gPlace.type === "lunch" || gPlace.type === "dinner";
      const placeId = `v3-d${gDay.day}-${allPlaces.length}`;
      const slotCat = isMeal
        ? "restaurant"
        : SEED_CATEGORIES.has(gPlace.seed_category || "")
          ? gPlace.seed_category
          : null;
      const desc = gPlace.shortform_ko || "";
      const persona = gPlace.selection_reason_ko || "AI 추천 장소";
      const place: PlaceResult = {
        id: placeId,
        name: gPlace.name || "Unknown Place",
        description: desc,
        // 🧠 2026-07-05 사장님 SSOT = Gemini 정확좌표 살림(옛 lat:0/lng:0 폐기 §19). = 트리거 좌표10m 판정 + saveNewPlacesToDB TS 앵커 힌트 = 동명오매칭 방지(코드 매칭 삭제 2026-07-18 §19).
        lat: gPlace.latitude ?? 0,
        lng: gPlace.longitude ?? 0,
        vibeScore: 7,
        confidenceScore: 5,
        sourceType: "Gemini AI (New)",
        personaFitReason: persona,
        // 🧠 2026-07-05 사장님 SSOT = Gemini seed_category(6종) 보존 = ag3 저장 시 restaurant/attraction 2종 뭉갬 대신 이 값 사용(지점4). 식사는 restaurant.
        tags: isMeal ? ["restaurant", "food"] : [],
        vibeTags: isMeal ? ["Foodie" as const] : [],
        image: "",
        priceEstimate:
          sanitizePriceEur(gPlace.price_eur) > 0
            ? `€${sanitizePriceEur(gPlace.price_eur)}`
            : "무료",
        placeTypes: isMeal ? ["restaurant"] : ["tourist_attraction"],
        recommendedTime:
          gPlace.startTime < "12:00"
            ? "morning"
            : gPlace.startTime < "17:00"
              ? "afternoon"
              : "evening",
        city: formData.destination,
        koreanPopularityScore: 0,
        googleMapsUrl: "",
        estimatedPriceEur: sanitizePriceEur(gPlace.price_eur),
        geminiAddress: gPlace.address || "",
        nameKo: gPlace.nameKo || null,
        nameLocal: gPlace.nameLocal || null,
        // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = editorialSummary(FE 한줄요약) = Gemini shortform_ko(=desc)를 place 에 직접 매핑.
        editorialSummary: desc || null,
        // 🧠 2026-07-05 사장님 SSOT = Gemini 도심거리·카테고리 살림(§20) = saveNewPlacesToDB job 전필드 저장(지점4) = 결손컬럼 채움.
        distanceKmFromCenter: gPlace.distance_km_from_center ?? null,
        // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 슬롯 카테고리 1회 계산(중복식 드리프트 방지) + SEED_CATEGORIES 화이트리스트 검증
        seedCategory: slotCat,
        slotCategory: slotCat,
      } as any;
      allPlaces.push(place);
      scheduleMap.push({ day: gDay.day, gPlace, placeId });
    }
  }

  console.log(`[V3-Step2] ${allPlaces.length}곳 PlaceResult 변환 완료`);

  const matchedPlaces = await matchPlacesWithDB(allPlaces, preloaded);
  console.log(`[V3-Step2] DB 매칭 완료 (${Date.now() - _t0}ms)`);

  const startH = parseInt((formData.startTime || "09:00").split(":")[0]);
  const startM = parseInt((formData.startTime || "09:00").split(":")[1] || "0");
  const endH = parseInt((formData.endTime || "18:00").split(":")[0]);
  const endM = parseInt((formData.endTime || "18:00").split(":")[1] || "0");
  const availableHours = Math.max(
    4,
    round2((endH * 60 + endM - startH * 60 - startM) / 60),
  );
  console.log(
    `[V3-Step2] 가용시간: ${availableHours}h (${formData.startTime || "09:00"}~${formData.endTime || "18:00"})`,
  );

  const isGuideCategory = shouldApplyGuidePrice(
    (formData.mobilityStyle || "Moderate") as any,
    (formData.travelStyle || "Reasonable") as any,
  );
  console.log(
    `[V3-Step2] 📍 교통 카테고리: ${isGuideCategory ? "A (드라이빙 가이드)" : "B (대중교통)"}`,
  );

  const enrichFns = await getEnrichmentFunctions(); // = getRealityCheckForCity 만 사용
  const [eurToKrw, realityCheck, transportPrice] = await Promise.all([
    getEurToKrwRate("[V3]"),
    enrichFns.getRealityCheckForCity(formData.destination),
    calculateTransportPrice({
      companionType: (formData.companionType || "Couple") as any,
      companionCount,
      mobilityStyle: (formData.mobilityStyle || "Moderate") as any,
      travelStyle: (formData.travelStyle || "Reasonable") as any,
      availableHours,
      dayCount,
      isRegionalTravel: false,
    }).catch((err) => {
      console.warn("[V3] 교통비 산정 실패, 기본값 사용:", err);
      return null;
    }),
  ]);

  console.log(
    `[V3-Step2] 환율 + 날씨 + 교통비 병렬 완료 (${Date.now() - _t0}ms)`,
  );
  if (transportPrice) {
    console.log(
      `[V3-Step2] 💰 교통비: 카테고리 ${transportPrice.category} | 1인/일 €${transportPrice.perPersonPerDay}`,
    );
  }

  const finalPlaces = await Promise.all(
    matchedPlaces.map(async (p) => {
      const seedNameEn = p.name
        ? p.name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "")
        : "";
      const seedData = preloaded.seedRawMap?.get(seedNameEn);

      // ⚠️ 수정금지(승인필요) 2026-05-20 = price_eur 단일 SSOT = place_seed_raw.priceEur 만 (= ta enrichment 폐기)
      const geminiPrice = p.estimatedPriceEur ?? 0;
      const isMealSlot =
        (p as any).type === "lunch" || (p as any).type === "dinner";
      const mealTypeForPrice: "lunch" | "dinner" | undefined =
        (p as any).type === "lunch"
          ? "lunch"
          : (p as any).type === "dinner"
            ? "dinner"
            : undefined;
      const styleForPrice = normalizeTravelStyle(formData.travelStyle);
      const resolvedPrice = resolvePrice(
        geminiPrice,
        isMealSlot,
        seedData?.priceEur ?? 0,
        mealTypeForPrice,
        styleForPrice,
      );

      const merged = {
        ...p,
        estimatedPriceEur: resolvedPrice,
        priceEstimate:
          resolvedPrice > 0 ? `€${Math.round(resolvedPrice)}` : "무료",
      };

      // ⚠️ 수정금지(승인필요) 2026-06-11 = summary_ko = 후킹 숏폼 한줄요약(앱 차별점) 단일 소스 = seedData.summaryKo 우선 → 구글 리뷰수 폴백.
      const reviewCount = (merged as any).userRatingCount || 0;
      merged.summaryKo =
        seedData?.summaryKo ||
        (reviewCount >= 50
          ? `구글 리뷰 ${reviewCount.toLocaleString()}개`
          : "데이터 수집 중");

      return merged;
    }),
  );

  await saveNewPlacesToDB(finalPlaces, preloaded.cityId, {
    deferPersist: true,
  }).catch((e) =>
    console.error(
      "[V3-Step2] ⚠️ saveNewPlacesToDB(await fetch) 실패:",
      e?.message || e,
    ),
  );

  // 🗑️ 2026-07-08 사장님 = 폐업 슬롯 splice 완전삭제 = 슬롯은 그 무엇도 줄일 권한 없음(무단 감소 로직) §19. 슬롯 = scheduleMap = Gemini 곳수 항상 보존.

  const finalPlaceMap = new Map<string, PlaceResult>();
  for (const fp of finalPlaces) {
    finalPlaceMap.set(fp.id, fp);
  }

  const days: any[] = [];
  let totalTripCostEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const { dayResult, dailyPerPersonEur } = await buildDayResult(d, {
      formData,
      preloaded,
      geminiDays,
      scheduleMap,
      finalPlaceMap,
      daySlotsConfig,
      paceConfig,
      companionCount,
      dayCount,
      isGuideCategory,
      eurToKrw,
      transportPrice,
      availableHours,
      realityCheck,
    });
    totalTripCostEur += dailyPerPersonEur;
    days.push(dayResult);
  }

  const totalPerPersonEur = round2(totalTripCostEur);
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);
  const perPersonPerDay =
    dayCount > 0 ? round2(totalPerPersonEur / dayCount) : 0;

  console.log(`[V3-Step2] ✅ 완료 (${Date.now() - _t0}ms): ${days.length}일`);
  console.log(
    `[V3-Step2] 💰 1인 총 비용: €${totalPerPersonEur} / ₩${totalPerPersonKrw.toLocaleString()}`,
  );
  console.log(`[V3-Step2] 💰 1인 1일 평균: €${perPersonPerDay}`);

  // ⚠️ 2026-07-08 사장님 SSOT = 개수보존 3자대조(발각 전용, 보정·삭제 없음) = Gemini 원본 곳수 = scheduleMap = FE days 총합.
  const geminiPlaceCount = geminiDays.reduce(
    (s, gd) => s + (gd.places?.length || 0),
    0,
  );
  const feDayPlaceCount = days.reduce(
    (s: number, d: any) => s + d.places.length,
    0,
  );
  let assemblyLoss: { gemini: number; schedule: number; fe: number } | null =
    null;
  if (
    geminiPlaceCount !== scheduleMap.length ||
    scheduleMap.length !== feDayPlaceCount
  ) {
    assemblyLoss = {
      gemini: geminiPlaceCount,
      schedule: scheduleMap.length,
      fe: feDayPlaceCount,
    };
    console.error(
      `[V3-Step2] ⚠️ _assemblyLoss 감지: gemini=${geminiPlaceCount} schedule=${scheduleMap.length} fe=${feDayPlaceCount}`,
    );
  }

  // ⚠️ 수정금지(승인필요) 2026-05-09 = saveNewPlacesToDB = 위로 이동 (= days 빌드 전) = 중복 호출 X

  const paceLabel =
    travelPace === "Packed"
      ? "빡빡하게"
      : travelPace === "Normal"
        ? "보통"
        : "여유롭게";

  const transportTotalEur = round2(
    days.reduce(
      (s: number, d: any) => s + (d.dailyCost?.breakdown?.transportEur || 0),
      0,
    ),
  );
  const transportAvgPerDay =
    dayCount > 0 ? round2(transportTotalEur / dayCount) : 0;
  const transportSummary = transportPrice
    ? (() => {
        if (transportPrice.category === "guide") {
          const gp = transportPrice as GuidePriceResult;
          return {
            category: "guide" as const,
            perPersonPerDay: transportAvgPerDay, // 날짜별 요금 평균(대표값)
            perPersonPerDayKrw: Math.round(transportAvgPerDay * eurToKrw),
            perPersonTotal: transportTotalEur, // 일별 합(정확)
            perPersonTotalKrw: Math.round(transportTotalEur * eurToKrw),
            vehicleDescription: gp.vehicleDescription,
            availableHours: gp.availableHours,
            includes200km: gp.includes200km,
            segmentLabel: gp.segmentLabel,
            notes: gp.notes,
          };
        } else {
          const tp = transportPrice as TransitPriceResult;
          return {
            category: "transit" as const,
            perPersonPerDay: transportAvgPerDay,
            perPersonPerDayKrw: Math.round(transportAvgPerDay * eurToKrw),
            perPersonTotal: transportTotalEur,
            perPersonTotalKrw: Math.round(transportTotalEur * eurToKrw),
            method: tp.method,
            details: tp.details,
            guideUpsell: {
              perPersonPerDay: tp.guideUpsell.perPersonPerDay,
              perPersonPerDayKrw: Math.round(
                tp.guideUpsell.perPersonPerDay * eurToKrw,
              ),
              vehicleDescription: tp.guideUpsell.vehicleDescription,
              clickable: true,
            },
            notes: tp.notes,
          };
        }
      })()
    : null;

  const result = {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || DEFAULT_START_TIME,
    endTime: formData.endTime || DEFAULT_END_TIME,
    days,
    vibeWeights,
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    totalCost: {
      perPersonEur: totalPerPersonEur,
      perPersonKrw: totalPerPersonKrw,
      perPersonPerDay: perPersonPerDay,
      perPersonPerDayKrw: Math.round(perPersonPerDay * eurToKrw),
      eurToKrwRate: eurToKrw,
      currency: "EUR",
    },
    budget: {
      travelStyle: formData.travelStyle || "Reasonable",
      dailyBreakdowns: days.map((day: any) => ({
        day: day.day,
        perPersonEur: day.dailyCost?.perPersonEur || 0,
        perPersonKrw: day.dailyCost?.perPersonKrw || 0,
        breakdown: day.dailyCost?.breakdown || {},
      })),
      totals: {
        perPersonTotal: totalPerPersonEur,
        perPersonPerDay: perPersonPerDay,
        transport: days.reduce(
          (sum: number, d: any) =>
            sum + (d.dailyCost?.breakdown?.transportEur || 0),
          0,
        ),
        meals: days.reduce(
          (sum: number, d: any) => sum + (d.dailyCost?.breakdown?.mealEur || 0),
          0,
        ),
        entranceFees: days.reduce(
          (sum: number, d: any) =>
            sum + (d.dailyCost?.breakdown?.entranceEur || 0),
          0,
        ),
      },
    },
    transportSummary,
    realityCheck,
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace,
      travelPaceLabel: paceLabel,
      slotDurationMinutes: paceConfig.slotDurationMinutes,
      totalPlaces: finalPlaces.length,
      mobilityStyle: formData.mobilityStyle,
      companionType: formData.companionType,
      companionCount,
      transportCategory: isGuideCategory ? "guide" : "transit",
      availableHours,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      pipelineVersion: "v3-2step",
      _matched: finalPlaces.filter((p: any) => p.googlePlaceId).length,
      _unmatched: finalPlaces.filter((p: any) => !p.googlePlaceId).length,
      // ⚠️ 2026-07-08 사장님 SSOT = 개수보존 3자대조 결과. null = 정상(보존). 있으면 조립단계 무언손실 = 즉시발각(은폐0).
      _assemblyLoss: assemblyLoss,
    },
  };

  // ⚠️ 수정금지(승인필요) 2026-05-20 = Verifier 완전 폐기 (= 사용자 SSOT = Gemini 0 강제)
  return result;
}
