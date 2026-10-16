import {
  COMPANION_TO_TRANSPORT,
  PARIS_TRANSIT_FARES,
  UBER_PARIS_FARES,
} from "./transport/constants";
import type {
  TransportPriceInput,
  GuidePriceResult,
  TransitPriceResult,
  TransportPricingResult,
} from "./transport/constants";
import {
  round2,
  shouldApplyGuidePrice,
  calculateGuideDailyPrice,
  getGuidePerPersonPerDay,
} from "./transport/guide-pricing";
import {
  calculateTransitPerPersonPerDay,
  calculateUberXDailyPerPerson,
  calculateUberBlackHourly,
  calculateUberBlackForRoutes,
} from "./transport/transit-pricing";
import {
  buildDayConfig,
  guideCostForDay,
  getAirportTransferPrice,
} from "./transport/day-config";

export type {
  TransportPriceInput,
  GuidePriceResult,
  TransitPriceResult,
  TransportPricingResult,
  UberBlackComparison,
} from "./transport/constants";
export {
  round2,
  shouldApplyGuidePrice,
  calculateGuideDailyPrice,
  getGuidePerPersonPerDay,
} from "./transport/guide-pricing";
export {
  calculateUberBlackHourly,
  calculateUberBlackForRoutes, // @deprecated → calculateUberBlackHourly 사용
} from "./transport/transit-pricing";
export {
  buildDayConfig,
  guideCostForDay,
  getAirportTransferPrice,
} from "./transport/day-config";

export async function calculateTransportPrice(
  input: TransportPriceInput,
): Promise<TransportPricingResult> {
  const {
    companionType,
    companionCount,
    mobilityStyle,
    travelStyle,
    availableHours,
    dayCount,
    isRegionalTravel,
  } = input;

  const isGuide = shouldApplyGuidePrice(mobilityStyle, travelStyle);
  const config = COMPANION_TO_TRANSPORT[companionType];
  const transportType = config.transportType;

  if (isGuide) {
    const { dailyVehiclePrice } = await calculateGuideDailyPrice(
      transportType,
      availableHours,
      isRegionalTravel || false,
    );
    const perPersonPerDay = round2(dailyVehiclePrice / companionCount);

    const vehicleDescription =
      transportType === "sedan"
        ? "전용 세단 (1-4인)"
        : transportType === "van"
          ? "전용 밴 (5-7인)"
          : transportType === "minibus"
            ? "전용 미니버스 (8인+)"
            : "가이드 서비스";

    const notes: string[] = [];

    if (
      mobilityStyle === "Minimal" &&
      (travelStyle === "Premium" || travelStyle === "Luxury")
    ) {
      notes.push("이동 최소화 + 프리미엄/럭셔리");
    } else if (mobilityStyle === "Minimal") {
      notes.push("이동 최소화 → 전용 드라이빙 가이드");
    } else {
      notes.push(`${travelStyle} → 전용 드라이빙 가이드 포함`);
    }

    notes.push(`${availableHours}시간 기준, 200km 포함`);
    if (isRegionalTravel) {
      notes.push("지방/도시 간 이동 포함 (+50%)");
    }

    return {
      category: "guide",
      perPersonPerDay,
      vehicleType: transportType,
      vehicleDescription,
      availableHours,
      includes200km: true,
      isRegionalSurcharge: isRegionalTravel || false,
      dailyVehiclePrice,
      dayCount,
      companionCount,
      segmentLabel: "전용차량이동",
      notes,
    } as GuidePriceResult;
  }

  const guideUpsell = await getGuidePerPersonPerDay(
    companionType,
    companionCount,
    availableHours,
    false,
  );

  if (mobilityStyle === "WalkMore") {
    const tripCount = PARIS_TRANSIT_FARES.daily_trips_walkmore;
    const transit = calculateTransitPerPersonPerDay(dayCount, tripCount);

    return {
      category: "transit",
      perPersonPerDay: transit.perPersonPerDay,
      method: transit.method,
      details: transit.details,
      dayCount,
      companionCount,
      guideUpsell: {
        perPersonPerDay: guideUpsell.perPersonPerDay,
        vehicleDescription: guideUpsell.vehicleDescription,
        clickable: true as const,
      },
      notes: [
        transit.details,
        "파리 대중교통 2026년 실제 요금",
        "메트로/버스/RER Zone 1-5",
      ],
    } as TransitPriceResult;
  }

  const transitTrips =
    PARIS_TRANSIT_FARES.daily_trips_moderate -
    UBER_PARIS_FARES.daily_uber_trips;
  const transit = calculateTransitPerPersonPerDay(dayCount, transitTrips);
  const uber = calculateUberXDailyPerPerson(
    UBER_PARIS_FARES.daily_uber_trips,
    companionCount,
  );

  const perPersonPerDay = round2(
    transit.perPersonPerDay + uber.perPersonPerDay,
  );

  return {
    category: "transit",
    perPersonPerDay,
    method: `${transit.method} + UberX`,
    details: `대중교통 €${transit.perPersonPerDay}/인/일 + UberX €${uber.perPersonPerDay}/인/일`,
    dayCount,
    companionCount,
    guideUpsell: {
      perPersonPerDay: guideUpsell.perPersonPerDay,
      vehicleDescription: guideUpsell.vehicleDescription,
      clickable: true as const,
    },
    notes: [
      `대중교통: ${transit.details}`,
      `우버: ${uber.details}`,
      "파리 2026년 실제 요금",
    ],
  } as TransitPriceResult;
}

export const transportPricingService = {
  shouldApplyGuidePrice,
  calculateTransportPrice,
  calculateGuideDailyPrice,
  getGuidePerPersonPerDay,
  guideCostForDay,
  buildDayConfig,
  calculateUberBlackHourly,
  calculateUberBlackForRoutes, // @deprecated → calculateUberBlackHourly 사용
  getAirportTransferPrice,
  round2,
};
