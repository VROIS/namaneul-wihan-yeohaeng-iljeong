import {
  calcTransitHaversine,
  haversineKm,
  pickTransitMode,
  estimateTransitCost,
} from "../agents/transit-haversine";
// ⚠️ 2026-07-04 사장님 SSOT = 숙소 재계산(regenerate)의 교통 판별·가격·표시 = 최초생성(pipeline-v3/ag4)과 동일 SSOT 재사용(§16 재발명금지).
import {
  shouldApplyGuidePrice,
  calculateTransportPrice,
  calculateUberBlackHourly,
  guideCostForDay,
  buildDayConfig,
  round2,
  type GuidePriceResult,
  type TransitPriceResult,
} from "../transport-pricing-service";
import { DEFAULT_START_TIME, DEFAULT_END_TIME } from "./types";
import { getCompanionCount, calculateDayCount } from "./helpers";
import { optimizeDayRoute } from "./route-optimizer";

export async function regenerateDay(params: {
  day: number;
  accommodationCoords?: { lat: number; lng: number };
  places: any[];
  formData?: any;
}): Promise<{
  day: number;
  places: any[];
  departureTransit?: any;
  returnTransit?: any;
  transit?: any;
  // ⚠️ 2026-07-04 사장님 SSOT = 화면이 실제 읽는 가격·교통표시 = 반드시 반환(없으면 숙소 재계산해도 칩·가격 stale = 버그 미해결).
  dailyCost?: any;
  transportDisplay?: any;
}> {
  const { day, accommodationCoords, places, formData } = params;

  if (!places || places.length === 0) {
    return { day, places: [] };
  }

  const nonMealPlaces = places.filter((p: any) => !p.isMealSlot);
  const mealPlaces = places.filter((p: any) => p.isMealSlot);

  let optimized = nonMealPlaces;
  if (nonMealPlaces.length > 2 && accommodationCoords) {
    optimized = optimizeDayRoute(nonMealPlaces, accommodationCoords);
  }

  const reordered: any[] = [];
  let optIdx = 0;
  for (const p of places) {
    if (p.isMealSlot) {
      reordered.push(p);
    } else if (optIdx < optimized.length) {
      reordered.push(optimized[optIdx]);
      optIdx++;
    }
  }

  // ⚠️ 2026-07-04 사장님 SSOT = 가이드 판별 = shouldApplyGuidePrice(이동+예산) 단일 SSOT(옛 mobilityStyle 3분기 폐기).
  const isGuideDay = shouldApplyGuidePrice(
    formData?.mobilityStyle,
    formData?.travelStyle,
  );
  const companionCount = formData
    ? getCompanionCount(formData.companionType || "Solo")
    : 2;

  // ⚠️ 수정금지(승인필요) 2026-05-20 = Google Routes API 폐기 = Haversine 자체 계산 (= 사용자 SSOT)
  // ⚠️ 2026-07-06 사장님 SSOT = 한 구간 계산 = MIX·DB-only 단일 SSOT(§16) = 거리(haversineKm)→pickTransitMode(1km 도보/초과 metro)→calcTransitHaversine(시간)→estimateTransitCost(구간 €3).
  const center = accommodationCoords;
  const buildTransit = (
    from: { lat: number; lng: number },
    fromName: string,
    to: { lat: number; lng: number },
    toName: string,
  ) => {
    const km = round2(haversineKm(from.lat, from.lng, to.lat, to.lng));
    const { mode, calc } = pickTransitMode(km, isGuideDay);
    const tr = calcTransitHaversine(
      { ...from, name: fromName },
      { ...to, name: toName },
      calc,
      companionCount,
      center,
    );
    const cost = isGuideDay ? 0 : estimateTransitCost(mode);
    return {
      from: fromName,
      to: toName,
      distance: Math.round(km * 1000),
      duration: tr.duration,
      durationText: `${tr.duration}분`, // FE departure/return 폴백없이 읽음 = 필수
      mode,
      modeLabel:
        mode === "walk"
          ? "도보"
          : mode === "private_guide"
            ? "전용차량이동"
            : "지하철/버스",
      cost,
      costTotal: cost,
    };
  };

  const departureTransit =
    accommodationCoords && reordered.length > 0
      ? buildTransit(
          accommodationCoords,
          "🏨 숙소",
          reordered[0],
          reordered[0].name,
        )
      : undefined;

  const transits: any[] = [];
  for (let i = 0; i < reordered.length - 1; i++) {
    transits.push(
      buildTransit(
        reordered[i],
        reordered[i].name,
        reordered[i + 1],
        reordered[i + 1].name,
      ),
    );
  }

  const returnTransit =
    accommodationCoords && reordered.length > 0
      ? buildTransit(
          reordered[reordered.length - 1],
          reordered[reordered.length - 1].name,
          accommodationCoords,
          "🏨 숙소",
        )
      : undefined;

  const allTransits = [
    ...(departureTransit ? [departureTransit] : []),
    ...transits,
    ...(returnTransit ? [returnTransit] : []),
  ];

  // ⚠️ 2026-07-04 사장님 SSOT = 교통비·표시 = 최초생성(pipeline-v3:955~1066)과 동일 조립 = calculateTransportPrice 단일 SSOT(§16).
  // ⚠️ 2026-07-04 사장님 SSOT = dayCount = 최초생성과 동일 계산(calculateDayCount) = startDate~endDate에서 도출.
  const dayCount =
    formData?.startDate && formData?.endDate
      ? calculateDayCount(formData.startDate, formData.endDate)
      : 1;
  // ⚠️ 2026-07-06 사장님 SSOT = 그 날 가용시각 = buildDayConfig 단일 SSOT(DB-only ag1 버퍼) = 최초생성과 동일 dayConfig(§16/§20).
  const dc = buildDayConfig(
    day,
    dayCount,
    formData?.startTime || DEFAULT_START_TIME,
    formData?.endTime || DEFAULT_END_TIME,
    DEFAULT_START_TIME,
    DEFAULT_END_TIME,
  );
  const [sh, sm] = dc.startTime.split(":").map(Number);
  const [eh, em] = dc.endTime.split(":").map(Number);
  const availableHours = Math.max(
    4,
    round2((eh * 60 + em - (sh * 60 + sm)) / 60),
  );

  const priceResult = await calculateTransportPrice({
    companionType: (formData?.companionType || "Couple") as any,
    companionCount,
    mobilityStyle: (formData?.mobilityStyle || "Moderate") as any,
    travelStyle: (formData?.travelStyle || "Reasonable") as any,
    availableHours,
    dayCount,
  });
  // ⚠️ 2026-07-06 사장님 SSOT = 1인 1일 교통비 = 가이드는 그 날 dayConfig 기준 재계산(guideCostForDay 공용, DB-only 동형), 대중교통은 구간별 합산(between).
  const transportPerPersonPerDay = isGuideDay
    ? await guideCostForDay({
        dayConfig: dc,
        companionType: (formData?.companionType || "Couple") as any,
        companionCount,
        mobilityStyle: (formData?.mobilityStyle || "Moderate") as any,
        travelStyle: (formData?.travelStyle || "Reasonable") as any,
        dayCount,
      })
    : transits.reduce((s: number, t: any) => s + (t.cost || 0), 0);

  let transportDisplay: any;
  if (isGuideDay) {
    allTransits.forEach((t: any) => {
      t.cost = 0;
      t.costTotal = 0;
    });
    const routeSegments = allTransits.map((t: any) => {
      const hasRealData = t.distance > 0 && t.duration > 0;
      return {
        distanceKm: hasRealData ? round2((t.distance || 0) / 1000) : 3.0,
        durationMin: hasRealData ? t.duration || 0 : 12,
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
      perPersonPerDay: transportPerPersonPerDay,
      uberBlackComparison: uberBlackComp
        ? {
            perPersonPerDay: uberBlackComp.perPersonPerDay,
            totalDistanceKm: uberBlackComp.totalDistanceKm,
            totalDurationMin: uberBlackComp.totalDurationMin,
          }
        : null,
      vehicleDescription:
        priceResult.category === "guide"
          ? (priceResult as GuidePriceResult).vehicleDescription
          : "전용 차량",
      notes: priceResult.notes || [],
    };
  } else {
    const guideUpsell =
      priceResult.category === "transit"
        ? (priceResult as TransitPriceResult).guideUpsell
        : null;
    transportDisplay = {
      category: "transit" as const,
      perPersonPerDay: transportPerPersonPerDay,
      method:
        priceResult.category === "transit"
          ? (priceResult as TransitPriceResult).method
          : "대중교통",
      details:
        priceResult.category === "transit"
          ? (priceResult as TransitPriceResult).details
          : "",
      guideUpsell: guideUpsell
        ? {
            perPersonPerDay: guideUpsell.perPersonPerDay,
            vehicleDescription: guideUpsell.vehicleDescription,
            clickable: true,
          }
        : null,
      notes: priceResult.notes || [],
    };
  }

  const mealEur = reordered.reduce(
    (s: number, p: any) => s + (p.isMealSlot && p.mealPrice ? p.mealPrice : 0),
    0,
  );
  const entranceEur = reordered.reduce(
    (s: number, p: any) =>
      s +
      (!p.isMealSlot &&
      typeof p.estimatedPriceEur === "number" &&
      p.estimatedPriceEur > 0 &&
      p.estimatedPriceEur < 500
        ? p.estimatedPriceEur
        : 0),
    0,
  );
  const perPersonEur = round2(mealEur + entranceEur + transportPerPersonPerDay);

  return {
    day,
    places: reordered,
    departureTransit,
    returnTransit,
    transit: {
      transits,
      totalDuration: transits.reduce(
        (sum: number, t: any) => sum + t.duration,
        0,
      ),
      totalCost: transits.reduce((sum: number, t: any) => sum + t.costTotal, 0),
      totalDistanceKm: round2(
        transits.reduce(
          (sum: number, t: any) => sum + (t.distance || 0) / 1000,
          0,
        ),
      ),
    },
    dailyCost: {
      perPersonEur,
      breakdown: {
        mealEur,
        entranceEur,
        transportEur: transportPerPersonPerDay,
      },
    },
    transportDisplay,
  };
}
