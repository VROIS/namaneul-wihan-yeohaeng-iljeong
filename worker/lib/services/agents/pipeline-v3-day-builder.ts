import type { TripFormData, PlaceResult, DaySlotConfig } from "./types";
import { MEAL_BUDGET, minutesToTime } from "./types";
import {
  haversineKm,
  calcTransitHaversine,
  pickTransitMode,
  estimateTransitCost,
} from "./transit-haversine";
import {
  calculateUberBlackHourly,
  guideCostForDay,
  round2,
  type TransportPricingResult,
  type GuidePriceResult,
  type TransitPriceResult,
} from "../transport-pricing-service";
import {
  normalizeTravelStyle,
  sanitizePriceEur,
  type GeminiPlace,
  type GeminiDay,
} from "./pipeline-v3-types";
import { isValidCoord } from "./pipeline-v3-helpers";

export interface DayBuilderDeps {
  formData: TripFormData;
  preloaded: { cityCoords?: { lat: number; lng: number }; cityName?: string };
  geminiDays: GeminiDay[];
  scheduleMap: { day: number; gPlace: GeminiPlace; placeId: string }[];
  finalPlaceMap: Map<string, PlaceResult>;
  daySlotsConfig: DaySlotConfig[];
  paceConfig: {
    slotDurationMinutes: number;
    mealDurationMinutes: number;
    maxSlotsPerDay: number;
  };
  companionCount: number;
  dayCount: number;
  isGuideCategory: boolean;
  eurToKrw: number;
  transportPrice: TransportPricingResult | null;
  availableHours: number;
  realityCheck: any;
}

export async function buildDayResult(
  d: number,
  deps: DayBuilderDeps,
): Promise<{ dayResult: any; dailyPerPersonEur: number }> {
  const {
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
  } = deps;
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];

  const dayConfig = daySlotsConfig.find((c) => c.day === d)!;

  const dayScheduleItems = scheduleMap.filter((s) => s.day === d);
  const [dh, dm] = (dayConfig.startTime || "09:00").split(":").map(Number);
  const slotDur = paceConfig.slotDurationMinutes;
  const mealDur = paceConfig.mealDurationMinutes;
  const mealAt = (i: number) =>
    ["lunch", "dinner"].includes(dayScheduleItems[i]?.gPlace.type as string);
  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 슬롯 시각·체류 = 제미니가 계산해 준 ts·m 그대로(인간의 여정), 슬롯 수도 제미니가 준 만큼 (정본 B4 v26 세트)
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const slotStartMins: number[] = [];
  const slotDurMins: number[] = [];
  let acc = dh * 60 + dm;
  dayScheduleItems.forEach((s, i) => {
    const ts = s.gPlace.startTime;
    const start = /^\d{1,2}:\d{2}$/.test(ts || "") ? toMin(ts) : acc;
    const dur =
      Number.isFinite(s.gPlace.stayMin) && (s.gPlace.stayMin as number) > 0
        ? Math.round(s.gPlace.stayMin as number)
        : mealAt(i)
          ? mealDur
          : slotDur;
    slotStartMins.push(start);
    slotDurMins.push(dur);
    acc = start + dur;
  });
  const dayPlaces = dayScheduleItems.map((s, slotIdx) => {
    const enrichedPlace = finalPlaceMap.get(s.placeId)!;
    const isMeal = mealAt(slotIdx);
    const { finalScore, buzzScore, ...safePlace } = enrichedPlace as any;

    // ⚠️ 2026-07-18 사장님 SSOT = 슬롯 = enrichedPlace(place) 직접 flat = 재조회(loadSeedRawMap) 폐기 §0/§19. 흡수 시 원행 재활용데이터 RETURNING 으로 place 에 완비(신규는 Gemini값) = PSR 재조회 불필요.
    const ep = enrichedPlace as any;

    return {
      ...safePlace,
      // 🎙️ 2026-08-12 사장님 승인 = 슬롯 id = 창고 행 번호(`db-<번호>`, DB-only 동형) = [해설 듣기] 버튼 조건 충족.
      ...(ep.psrRowId != null ? { id: `db-${ep.psrRowId}` } : {}),
      ...(finalScore ? { finalScore } : {}),
      ...(buzzScore ? { buzzScore } : {}),
      startTime: minutesToTime(slotStartMins[slotIdx]),
      endTime: minutesToTime(slotStartMins[slotIdx] + slotDurMins[slotIdx]),
      type: isMeal ? ("restaurant" as const) : ("activity" as const), // FE 슬롯 = DB-only 동형(§16)
      nameEn: ep.nameEn || enrichedPlace.name,
      isMealSlot: isMeal,
      mealType:
        s.gPlace.type === "lunch"
          ? ("lunch" as const)
          : s.gPlace.type === "dinner"
            ? ("dinner" as const)
            : undefined,
      mealPrice: isMeal
        ? (enrichedPlace.estimatedPriceEur ?? undefined)
        : undefined,
      mealPriceLabel: isMeal
        ? s.gPlace.type === "lunch"
          ? mealBudget.lunchLabel
          : mealBudget.dinnerLabel
        : undefined,
      nameKo: ep.nameKo || s.gPlace.nameKo,
      nameLocal: ep.nameLocal || s.gPlace.nameLocal || null,
      userRatingCount: ep.userRatingCount,
      image: enrichedPlace.image || "",
      summaryKo: ep.summaryKo || null,
      // ⚠️ 수정금지(승인필요) 2026-06-24 사용자 SSOT = 슬롯 한줄요약 = editorial_summary 단일.
      editorialSummary: ep.editorialSummary || null,
      transitNote: s.gPlace.transitNote || null,
      selectionReasons: enrichedPlace.selectionReasons || [],
      confidenceLevel: enrichedPlace.confidenceLevel || "medium",
      realityCheck,
    };
  });

  const dayAccommodation = formData.dayAccommodations?.find((a) => a.day === d);
  let accommodationCoords: { lat: number; lng: number } | undefined;
  let accommodationName = "";
  let accommodationAddress = "";

  if (dayAccommodation?.coords?.lat && dayAccommodation?.coords?.lng) {
    accommodationCoords = dayAccommodation.coords;
    accommodationName = dayAccommodation.name;
    accommodationAddress = dayAccommodation.address;
  } else if (
    formData.accommodationCoords?.lat &&
    formData.accommodationCoords?.lng
  ) {
    accommodationCoords = formData.accommodationCoords;
    accommodationName = formData.accommodationName || "숙소";
    accommodationAddress = formData.accommodationAddress || "";
    // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 아래 3분기(숙소 미입력 = 도심 기준)는 **이름을 비운다**(§19).
  } else if (
    formData.destinationCoords?.lat &&
    formData.destinationCoords?.lng
  ) {
    accommodationCoords = formData.destinationCoords;
  } else if (preloaded.cityCoords?.lat && preloaded.cityCoords?.lng) {
    accommodationCoords = preloaded.cityCoords;
  } else if (dayPlaces.length > 0 && dayPlaces[0].lat && dayPlaces[0].lng) {
    accommodationCoords = { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng };
  }

  // ⚠️ 2026-07-06 사장님 SSOT = 거리(haversineKm)→pickTransitMode(1km 도보/초과 metro)→calcTransitHaversine. 옛 haversineTransit 완전삭제 §19 = 파리(DB-only) 동일.
  const hasAccommodation = !!accommodationCoords;
  const center =
    accommodationCoords ||
    (dayPlaces[0]
      ? { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng }
      : undefined);
  const buildTransit = (
    from: { lat: number; lng: number },
    fromName: string,
    to: { lat: number; lng: number },
    toName: string,
  ) => {
    const km = round2(haversineKm(from.lat, from.lng, to.lat, to.lng));
    const { mode, calc } = pickTransitMode(km, isGuideCategory);
    const tr = calcTransitHaversine(
      { ...from, name: fromName },
      { ...to, name: toName },
      calc,
      companionCount,
      center,
    );
    const cost = isGuideCategory ? 0 : estimateTransitCost(mode); // 가이드 = 구간표시 숨김·일합계만 / 대중교통 = 구간 균일예상가
    return {
      from: fromName,
      to: toName,
      distance: Math.round(km * 1000), // m (FE ÷1000 표준)
      duration: tr.duration,
      durationText: `${tr.duration}분`, // ⚠️ 2026-07-06 = FE departure/return 이 폴백없이 읽음(TripPlannerScreen) = 필수.
      mode,
      modeLabel:
        mode === "walk"
          ? "도보"
          : mode === "private_guide"
            ? "전용차량이동"
            : "지하철/버스",
      cost,
      costTotal: cost,
      km, // place 역주입용(내부)
    };
  };

  const departureTransit =
    hasAccommodation && center && dayPlaces.length > 0
      ? buildTransit(
          center,
          `🏨 ${accommodationName}`,
          dayPlaces[0],
          dayPlaces[0].name,
        )
      : undefined;

  const betweenTransits: any[] = [];
  for (let i = 0; i < dayPlaces.length - 1; i++) {
    betweenTransits.push(
      buildTransit(
        dayPlaces[i],
        dayPlaces[i].name,
        dayPlaces[i + 1],
        dayPlaces[i + 1].name,
      ),
    );
  }

  const returnTransit =
    hasAccommodation && center && dayPlaces.length > 0
      ? buildTransit(
          dayPlaces[dayPlaces.length - 1],
          dayPlaces[dayPlaces.length - 1].name,
          center,
          `🏨 ${accommodationName}`,
        )
      : undefined;

  dayPlaces.forEach((p: any, i: number) => {
    const inbound = i === 0 ? departureTransit : betweenTransits[i - 1];
    if (inbound) {
      p.distance_from_prev_km = inbound.km;
      p.transit_mode = inbound.mode;
      p.transit_min = inbound.duration;
    }
  });

  const allTransits = [
    ...(departureTransit ? [departureTransit] : []),
    ...betweenTransits,
    ...(returnTransit ? [returnTransit] : []),
  ];

  let displayTransits: any[]; // 프론트엔드에 보여줄 이동 정보
  let transportPerPersonPerDay = 0; // 1인 1일 교통비
  let transportDisplay: any = null; // 교통비 표시 데이터

  if (isGuideCategory) {
    displayTransits = betweenTransits.map((t) => ({
      from: t.from,
      to: t.to,
      mode: "guide",
      modeLabel: "전용차량이동",
      duration: t.duration,
      durationText: `${t.duration}분`,
      distance: t.distance,
      cost: 0, // 구간별 비용 안 보여줌
      costTotal: 0, // 구간별 비용 안 보여줌
    }));

    // ⚠️ 2026-07-06 사장님 SSOT = 가이드 1인 1일 가격 = 그 날 dayConfig 가용시간 기준 재계산(DB-only ag4:328 동형, §16 guideCostForDay 공용).
    const guidePP = await guideCostForDay({
      dayConfig,
      companionType: (formData.companionType || "Couple") as any,
      companionCount,
      mobilityStyle: (formData.mobilityStyle || "Moderate") as any,
      travelStyle: (formData.travelStyle || "Reasonable") as any,
      dayCount,
    });
    transportPerPersonPerDay = guidePP;

    const CITY_AVG_SEGMENT_KM = 3.0; // 도시 내 평균 구간 이동거리
    const CITY_AVG_SEGMENT_MIN = 12; // 도시 내 평균 구간 이동시간

    const routeSegments = allTransits.map((t) => {
      const hasRealData = t.distance > 0 && t.duration > 0;
      return {
        distanceKm: hasRealData
          ? round2((t.distance || 0) / 1000)
          : CITY_AVG_SEGMENT_KM,
        durationMin: hasRealData ? t.duration || 0 : CITY_AVG_SEGMENT_MIN,
      };
    });

    const uberBlackComp =
      routeSegments.length > 0
        ? calculateUberBlackHourly(
            availableHours,
            routeSegments,
            companionCount,
          )
        : null;

    transportDisplay = {
      category: "guide" as const,
      perPersonPerDay: guidePP,
      perPersonPerDayKrw: Math.round(guidePP * eurToKrw),
      uberBlackComparison: uberBlackComp
        ? {
            perPersonPerDay: uberBlackComp.perPersonPerDay,
            perPersonPerDayKrw: Math.round(
              uberBlackComp.perPersonPerDay * eurToKrw,
            ),
            totalDistanceKm: uberBlackComp.totalDistanceKm,
            totalDurationMin: uberBlackComp.totalDurationMin,
          }
        : null,
      vehicleDescription:
        transportPrice?.category === "guide"
          ? (transportPrice as GuidePriceResult).vehicleDescription
          : "전용 차량",
      notes: transportPrice?.notes || [],
    };

    console.log(
      `[V3-Day${d}] 🚗 가이드 1인/일 €${guidePP} | 우버블랙 1인/일 €${uberBlackComp?.perPersonPerDay || "?"}`,
    );
  } else {
    displayTransits = betweenTransits;

    // ⚠️ 2026-07-06 사장님 SSOT = 대중교통 1인 1일 교통비 = 구간별 estimateTransitCost 합산(DB-only ag4:345 동형, §16).
    const transitPP = betweenTransits.reduce(
      (s: number, t: any) => s + (t.cost || 0),
      0,
    );
    transportPerPersonPerDay = transitPP;

    const guideUpsell =
      transportPrice?.category === "transit"
        ? (transportPrice as TransitPriceResult).guideUpsell
        : null;

    transportDisplay = {
      category: "transit" as const,
      perPersonPerDay: transitPP,
      perPersonPerDayKrw: Math.round(transitPP * eurToKrw),
      method:
        transportPrice?.category === "transit"
          ? (transportPrice as TransitPriceResult).method
          : "대중교통",
      details:
        transportPrice?.category === "transit"
          ? (transportPrice as TransitPriceResult).details
          : "",
      guideUpsell: guideUpsell
        ? {
            perPersonPerDay: guideUpsell.perPersonPerDay,
            perPersonPerDayKrw: Math.round(
              guideUpsell.perPersonPerDay * eurToKrw,
            ),
            vehicleDescription: guideUpsell.vehicleDescription,
            clickable: true,
          }
        : null,
      notes: transportPrice?.notes || [],
    };

    console.log(
      `[V3-Day${d}] 🚇 대중교통 1인/일 €${transitPP} | 가이드 업셀 1인/일 €${guideUpsell?.perPersonPerDay || "?"}`,
    );
  }

  // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = mealCostEur 에도 entranceFeesEur 와 동일한 500유로
  const mealCostEur = dayPlaces.reduce(
    (sum: number, p: any) =>
      p.isMealSlot ? sum + sanitizePriceEur(p.mealPrice) : sum,
    0,
  );
  const entranceFeesEur = dayPlaces.reduce(
    (sum: number, p: any) =>
      !p.isMealSlot ? sum + sanitizePriceEur(p.estimatedPriceEur) : sum,
    0,
  );

  const mealPerPerson = mealCostEur; // Gemini가 1인 기준 추천
  const entrancePerPerson = entranceFeesEur; // 입장료도 1인
  const dailyPerPersonEur = round2(
    mealPerPerson + entrancePerPerson + transportPerPersonPerDay,
  );
  const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);

  const invalidCoords = dayPlaces.filter(
    (p: any) => !isValidCoord(p.lat, p.lng),
  ).length;
  if (invalidCoords > 0) {
    console.warn(`[V3] ⚠️ Day ${d}: ${invalidCoords}곳 좌표 무효`);
  }

  const geminiDay = geminiDays.find((g) => g.day === d);

  return {
    dayResult: {
      day: d,
      places: dayPlaces,
      city: formData.destination,
      summary: geminiDay?.theme || `${formData.destination} Day ${d}`,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      accommodation: accommodationCoords
        ? {
            day: d,
            name: accommodationName,
            address: accommodationAddress,
            coords: accommodationCoords,
          }
        : undefined,
      departureTransit: isGuideCategory
        ? departureTransit
          ? {
              ...departureTransit,
              mode: "guide",
              modeLabel: "전용차량이동",
              cost: 0,
              costTotal: 0,
            }
          : undefined
        : departureTransit,
      returnTransit: isGuideCategory
        ? returnTransit
          ? {
              ...returnTransit,
              mode: "guide",
              modeLabel: "전용차량이동",
              cost: 0,
              costTotal: 0,
            }
          : undefined
        : returnTransit,
      transit: {
        transits: displayTransits,
        totalDuration: betweenTransits.reduce(
          (sum: number, t: any) => sum + t.duration,
          0,
        ),
        totalCost: betweenTransits.reduce(
          (sum: number, t: any) => sum + (t.costTotal || 0),
          0,
        ),
        totalDistanceKm: round2(
          betweenTransits.reduce(
            (sum: number, t: any) => sum + (t.distance || 0) / 1000,
            0,
          ),
        ),
      },
      dailyCost: {
        perPersonEur: dailyPerPersonEur,
        perPersonKrw: dailyPerPersonKrw,
        breakdown: {
          mealEur: mealPerPerson,
          entranceEur: entrancePerPerson,
          transportEur: transportPerPersonPerDay,
        },
      },
      transportDisplay,
    },
    dailyPerPersonEur,
  };
}
