// Step2 일별(day) 스케줄 조립 = pipeline-v3 분리(2026-07-15 §0 슬림화, 순수 이동)
// = step2_enrichAndBuild 의 for(d=1..dayCount) 루프 본문을 그대로 옮긴 것(로직 변경 0). 호출부가 day 마다 이 함수를 부른다.
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
  type GeminiPlace,
  type GeminiDay,
} from "./pipeline-v3-types";
import { isValidCoord, computeSlotStartMins } from "./pipeline-v3-helpers";

export interface DayBuilderDeps {
  formData: TripFormData;
  // 🗑️ 2026-07-18 = seedRawMap 제거 = 슬롯 place 직접(재조회 폐기) 로 day-builder 가 seedRawMap 미사용 §0/§19.
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

/** 하루 스케줄(장소+이동+비용) 조립 = step2 루프 본문(순수 이동, 2026-07-15) */
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

  // 이 날의 스케줄
  const dayScheduleItems = scheduleMap.filter((s) => s.day === d);
  // 슬롯 시각 = 활동/식사 소요 누적(computeSlotStartMins 공용 1벌 §16, DB-only route-local 동형). 저녁이 실제 저녁시각·마지막 활동 직후.
  const [dh, dm] = (dayConfig.startTime || "09:00").split(":").map(Number);
  const slotDur = paceConfig.slotDurationMinutes;
  const mealDur = paceConfig.mealDurationMinutes;
  const mealAt = (i: number) =>
    ["lunch", "dinner"].includes(dayScheduleItems[i]?.gPlace.type as string);
  const slotStartMins = computeSlotStartMins(
    dayScheduleItems.length,
    dh * 60 + dm,
    slotDur,
    mealDur,
    mealAt,
  );
  const dayPlaces = dayScheduleItems.map((s, slotIdx) => {
    const enrichedPlace = finalPlaceMap.get(s.placeId)!;
    const isMeal = mealAt(slotIdx);
    // 프론트 전달 시 불필요한 0값 필드 제거 (React Native에서 {0}이 "0" 텍스트로 표시되는 문제 방지)
    const { finalScore, buzzScore, ...safePlace } = enrichedPlace as any;

    // ⚠️ 2026-07-18 사장님 SSOT = 슬롯 = enrichedPlace(place) 직접 flat = 재조회(loadSeedRawMap) 폐기 §0/§19. 흡수 시 원행 재활용데이터 RETURNING 으로 place 에 완비(신규는 Gemini값) = PSR 재조회 불필요.
    const ep = enrichedPlace as any;

    return {
      ...safePlace,
      // 🎙️ 2026-08-12 사장님 승인 = 슬롯 id = 창고 행 번호(`db-<번호>`, DB-only 동형) = [해설 듣기] 버튼 조건 충족.
      //   MIX 는 창고 저장(ag3-save-new-places)이 돌려준 행 번호(psrRowId)가 이 시점에 이미 place 에 실려 있다.
      //   번호가 없으면(저장 실패 등) 임시 id(v3-…) 유지 = 화면 규칙대로 배지를 안 그린다(헛클릭 방지).
      ...(ep.psrRowId != null ? { id: `db-${ep.psrRowId}` } : {}),
      // 0이 아닌 경우만 포함
      ...(finalScore ? { finalScore } : {}),
      ...(buzzScore ? { buzzScore } : {}),
      // 슬롯 시각 = 소요 누적(DB-only 동형). 종료 = 시작 + (식사 mealDur / 활동 slotDur).
      startTime: minutesToTime(slotStartMins[slotIdx]),
      endTime: minutesToTime(
        slotStartMins[slotIdx] + (isMeal ? mealDur : slotDur),
      ),
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
      // ⚠️ 2026-07-18 = 표시필드 = place 직접(흡수 RETURNING·Gemini·TS mutate 완비), Gemini 폴백만.
      nameKo: ep.nameKo || s.gPlace.nameKo,
      nameLocal: ep.nameLocal || s.gPlace.nameLocal || null,
      userRatingCount: ep.userRatingCount,
      image: enrichedPlace.image || "",
      // summary_ko = 숏폼 재료 = 보전(FE 슬롯 노출 아님, 추후 숏폼).
      summaryKo: ep.summaryKo || null,
      // ⚠️ 수정금지(승인필요) 2026-06-24 사용자 SSOT = 슬롯 한줄요약 = editorial_summary 단일.
      editorialSummary: ep.editorialSummary || null,
      // Gemini가 생성한 교통편 안내 (강화 프롬프트 v3.1)
      transitNote: s.gPlace.transitNote || null,
      // 부가 정보
      selectionReasons: enrichedPlace.selectionReasons || [],
      confidenceLevel: enrichedPlace.confidenceLevel || "medium",
      realityCheck,
    };
  });

  // 숙소/출발 좌표 결정
  // 우선순위: 사용자 입력 숙소 > 사용자 입력 도착지 좌표 > DB 도시 중심 좌표 > 첫 장소 좌표
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
  } else if (
    formData.destinationCoords?.lat &&
    formData.destinationCoords?.lng
  ) {
    accommodationCoords = formData.destinationCoords;
    accommodationName = `${formData.destination} 도심`;
  } else if (preloaded.cityCoords?.lat && preloaded.cityCoords?.lng) {
    // ⭐ DB cities 테이블의 도시 중심 좌표 자동 사용 (사용자가 숙소 미입력 시)
    accommodationCoords = preloaded.cityCoords;
    accommodationName = `${preloaded.cityName || formData.destination} 도심`;
  } else if (dayPlaces.length > 0 && dayPlaces[0].lat && dayPlaces[0].lng) {
    accommodationCoords = { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng };
    accommodationName = "도심 기준";
  }

  // ── 이동 구간 계산 = DB-only(route-local) 계산법 단일 SSOT(§16) ──
  // ⚠️ 2026-07-06 사장님 SSOT = 거리(haversineKm)→pickTransitMode(1km 도보/초과 metro)→calcTransitHaversine. 옛 haversineTransit 완전삭제 §19 = 파리(DB-only) 동일.
  //   구간 = 숙소→place[0], place[i]→[i+1], place[last]→숙소. transits 배열 = place 간(betweenTransits)만 = n-1. center = 숙소/도심좌표 우선, 없으면 place[0] 폴백(departure/return 억제).
  const hasAccommodation = !!accommodationCoords;
  const center =
    accommodationCoords ||
    (dayPlaces[0]
      ? { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng }
      : undefined);
  // 한 구간 계산 = 거리 + mode + 시간 + 구간비용(대중교통 균일 예상가).
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

  // 숙소/도심 → 첫 장소 (= 별도 필드 departureTransit, transits 배열엔 미포함). 숙소/도심좌표 있을 때만(place[0] 자기이동 방지 = 옛 동작).
  const departureTransit =
    hasAccommodation && center && dayPlaces.length > 0
      ? buildTransit(
          center,
          `🏨 ${accommodationName}`,
          dayPlaces[0],
          dayPlaces[0].name,
        )
      : undefined;

  // 장소 간 이동 (연속) = transits 배열 = n-1
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

  // 마지막 장소 → 숙소/도심 (= 별도 필드 returnTransit). 숙소/도심좌표 있을 때만.
  const returnTransit =
    hasAccommodation && center && dayPlaces.length > 0
      ? buildTransit(
          dayPlaces[dayPlaces.length - 1],
          dayPlaces[dayPlaces.length - 1].name,
          center,
          `🏨 ${accommodationName}`,
        )
      : undefined;

  // ⚠️ 2026-07-06 = place 에 이동 필드 flat 역주입 = DB-only(ag4:307) 동형. place[i] 로 들어오는 이동 = departure(i=0) / betweenTransits[i-1].
  dayPlaces.forEach((p: any, i: number) => {
    const inbound = i === 0 ? departureTransit : betweenTransits[i - 1];
    if (inbound) {
      p.distance_from_prev_km = inbound.km;
      p.transit_mode = inbound.mode;
      p.transit_min = inbound.duration;
    }
  });

  // 일 총합·우버비교용 = 전 구간(departure+between+return). transits 배열(FE)엔 between 만.
  const allTransits = [
    ...(departureTransit ? [departureTransit] : []),
    ...betweenTransits,
    ...(returnTransit ? [returnTransit] : []),
  ];

  // ═══════════════════════════════════════════════════════════════════
  // 💰 카테고리별 교통비 + 이동 표시 분기 (마케팅 핵심)
  // ═══════════════════════════════════════════════════════════════════

  let displayTransits: any[]; // 프론트엔드에 보여줄 이동 정보
  let transportPerPersonPerDay = 0; // 1인 1일 교통비
  let transportDisplay: any = null; // 교통비 표시 데이터

  if (isGuideCategory) {
    // ── 카테고리 A: 드라이빙 가이드 ──
    // ⚠️ 2026-07-06 = transits 배열(FE) = place 간(betweenTransits)만 = n-1(DB-only 동형). departure/return = 별도 필드.
    //   구간별 이동: 전부 "전용차량이동"으로 덮어쓰기
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
    //   = 옛 전체 availableHours flat(첫날/막날 버퍼 미반영 = 1인 €30 과다) 완전삭제 §19. 반일요금 없어 구간합산 아닌 하루 1회.
    const guidePP = await guideCostForDay({
      dayConfig,
      companionType: (formData.companionType || "Couple") as any,
      companionCount,
      mobilityStyle: (formData.mobilityStyle || "Moderate") as any,
      travelStyle: (formData.travelStyle || "Reasonable") as any,
      dayCount,
    });
    transportPerPersonPerDay = guidePP;

    // 우버블랙 비교: 실제 경로 + 좌표 없는 구간 추정값 포함
    // ⚠️ 좌표 0,0인 구간도 도시 내 평균 이동거리(3km, 12분)로 추정
    //     → 가이드와 동일 조건 비교를 위해 모든 구간을 포함해야 함
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

    // ⭐ 우버블랙 시간제 비교: 가이드와 동일 조건 (가용시간 풀, 대기 포함)
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
      // 우버블랙 비교 (마케팅: 가이드가 더 저렴한 걸 보여줌)
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
    // ── 카테고리 B: 대중교통 ──
    // ⚠️ 2026-07-06 = transits 배열(FE) = place 간(betweenTransits)만 = n-1(DB-only 동형). departure/return = 별도 필드.
    //   구간별 이동: 상세 그대로 (도보/메트로/버스 - 구간 균일 예상가).
    displayTransits = betweenTransits;

    // ⚠️ 2026-07-06 사장님 SSOT = 대중교통 1인 1일 교통비 = 구간별 estimateTransitCost 합산(DB-only ag4:345 동형, §16).
    //   = 옛 calculateTransportPrice(여정당 flat €8.6) 완전삭제 §19 = 파리(구간합산 가변)와 동일 기준.
    //   = 구간 = place 간(betweenTransits)만 합산(DB-only transits.reduce = scenes.slice(1) 동형 = departure/return 제외).
    const transitPP = betweenTransits.reduce(
      (s: number, t: any) => s + (t.cost || 0),
      0,
    );
    transportPerPersonPerDay = transitPP;

    // 업셀: 가이드 이용시 가격 (클릭 가능) = 마케팅 업셀 유지(calculateTransportPrice 부가정보).
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
      // 업셀: 가이드 이용시 (클릭 가능)
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

  // ── 일일 비용 계산 (1인 기준) ──
  const mealCostEur = dayPlaces.reduce(
    (sum: number, p: any) =>
      p.isMealSlot && p.mealPrice ? sum + p.mealPrice : sum,
    0,
  );
  const entranceFeesEur = dayPlaces.reduce((sum: number, p: any) => {
    // 식사 슬롯 제외, 비정상 가격(€500 초과) 필터
    if (
      !p.isMealSlot &&
      p.estimatedPriceEur &&
      p.estimatedPriceEur > 0 &&
      p.estimatedPriceEur < 500
    ) {
      return sum + p.estimatedPriceEur;
    }
    return sum;
  }, 0);

  // 1인 1일 비용 합산 (식사 + 입장료는 이미 1인 기준)
  const mealPerPerson = mealCostEur; // Gemini가 1인 기준 추천
  const entrancePerPerson = entranceFeesEur; // 입장료도 1인
  const dailyPerPersonEur = round2(
    mealPerPerson + entrancePerPerson + transportPerPersonPerDay,
  );
  const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);

  // 좌표 검증
  const invalidCoords = dayPlaces.filter(
    (p: any) => !isValidCoord(p.lat, p.lng),
  ).length;
  if (invalidCoords > 0) {
    console.warn(`[V3] ⚠️ Day ${d}: ${invalidCoords}곳 좌표 무효`);
  }

  // Gemini 테마 가져오기
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
        // ⚠️ 2026-07-06 = 총합 = transits 배열(betweenTransits, n-1) 기준 = DB-only(ag4:365) 동형. departure/return 은 별도 필드.
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
      // 💰 일일 비용 (1인 기준 - OTA 방식)
      dailyCost: {
        perPersonEur: dailyPerPersonEur,
        perPersonKrw: dailyPerPersonKrw,
        breakdown: {
          mealEur: mealPerPerson,
          entranceEur: entrancePerPerson,
          transportEur: transportPerPersonPerDay,
        },
      },
      // 💰 교통비 표시 (카테고리별 분기)
      transportDisplay,
    },
    dailyPerPersonEur,
  };
}
