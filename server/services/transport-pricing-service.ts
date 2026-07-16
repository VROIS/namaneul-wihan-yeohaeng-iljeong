/**
 * 교통비 계산 서비스 V2 (OTA 방식 - 1인 1일 기준)
 *
 * 💰 카테고리별 교통비 표시:
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ 카테고리 A (가이드): Premium/Luxury OR Minimal                     │
 * │  → 구간: "전용차량이동"                                            │
 * │  → 표시: 가이드 1인/일 €120 vs 우버블랙 1인/일 €185               │
 * │  → 대중교통 상세 ❌ 안 보여줌                                      │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ 카테고리 B (대중교통): WalkMore/Moderate + Economic/Reasonable      │
 * │  → 구간: 도보/메트로/버스 상세 (노선,시간,거리,실제요금)           │
 * │  → 표시: 대중교통 1인/일 €14.60                                   │
 * │  → 업셀: "(드라이빙 가이드 이용 시 1인 €120/일)" 클릭 가능        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * 💡 가이드 가격 산정:
 *   - 가용시간 자동 계산 (startTime~endTime), 기본 8시간
 *   - 200km 포함
 *   - 지방/도시 간 이동: +50% 할증
 *   - 최종: 차량 1일 가격 ÷ 인원 = 1인 1일 가격 (OTA 방식)
 *   - 차량 전체 가격은 표시 안 함 (고객이 물어보면 그때 답변)
 *
 * = 내부 헬퍼·상수는 server/services/transport/ 로 분리(2026-07-16 §0 슬림화, 순수 이동).
 *   이 파일 = 진입 경로 유지용 배럴 + 메인 오케스트레이터(calculateTransportPrice) 단독 보유.
 */

import { COMPANION_TO_TRANSPORT, PARIS_TRANSIT_FARES, UBER_PARIS_FARES } from './transport/constants';
import type {
  TransportPriceInput,
  GuidePriceResult,
  TransitPriceResult,
  TransportPricingResult,
} from './transport/constants';
import { round2, shouldApplyGuidePrice, calculateGuideDailyPrice, getGuidePerPersonPerDay } from './transport/guide-pricing';
import {
  calculateTransitPerPersonPerDay,
  calculateUberXDailyPerPerson,
  calculateUberBlackHourly,
  calculateUberBlackForRoutes,
} from './transport/transit-pricing';
import { buildDayConfig, guideCostForDay, getAirportTransferPrice } from './transport/day-config';

// === 재수출 (진입 파일 경로·이름 유지 = importer 무수정) ===
export type {
  TransportPriceInput,
  GuidePriceResult,
  TransitPriceResult,
  TransportPricingResult,
  UberBlackComparison,
} from './transport/constants';
export { round2, shouldApplyGuidePrice, calculateGuideDailyPrice, getGuidePerPersonPerDay } from './transport/guide-pricing';
export {
  calculateUberBlackHourly,
  calculateUberBlackForRoutes, // @deprecated → calculateUberBlackHourly 사용
} from './transport/transit-pricing';
export { buildDayConfig, guideCostForDay, getAirportTransferPrice } from './transport/day-config';

// ===================================================================
// 🎯 메인: 교통비 산정 (카테고리 자동 분류)
// ===================================================================

/**
 * 사용자 입력 기반 교통비 산정
 * - 카테고리 A(가이드) / B(대중교통) 자동 분류
 * - 모든 가격은 1인 1일 기준 (OTA 방식)
 * - 차량 전체 가격 표시 안 함
 */
export async function calculateTransportPrice(input: TransportPriceInput): Promise<TransportPricingResult> {
  const { companionType, companionCount, mobilityStyle, travelStyle, availableHours, dayCount, isRegionalTravel } = input;

  const isGuide = shouldApplyGuidePrice(mobilityStyle, travelStyle);
  const config = COMPANION_TO_TRANSPORT[companionType];
  const transportType = config.transportType;

  // ═══════════════════════════════════════════════════════════════════
  // 카테고리 A: 드라이빙 가이드 (1인 1일 가격)
  // ═══════════════════════════════════════════════════════════════════
  if (isGuide) {
    const { dailyVehiclePrice } = await calculateGuideDailyPrice(
      transportType, availableHours, isRegionalTravel || false,
    );
    const perPersonPerDay = round2(dailyVehiclePrice / companionCount);

    const vehicleDescription = transportType === 'sedan' ? '전용 세단 (1-4인)'
      : transportType === 'van' ? '전용 밴 (5-7인)'
      : transportType === 'minibus' ? '전용 미니버스 (8인+)'
      : '가이드 서비스';

    const notes: string[] = [];

    if (mobilityStyle === 'Minimal' && (travelStyle === 'Premium' || travelStyle === 'Luxury')) {
      notes.push('이동 최소화 + 프리미엄/럭셔리');
    } else if (mobilityStyle === 'Minimal') {
      notes.push('이동 최소화 → 전용 드라이빙 가이드');
    } else {
      notes.push(`${travelStyle} → 전용 드라이빙 가이드 포함`);
    }

    notes.push(`${availableHours}시간 기준, 200km 포함`);
    if (isRegionalTravel) {
      notes.push('지방/도시 간 이동 포함 (+50%)');
    }

    return {
      category: 'guide',
      perPersonPerDay,
      vehicleType: transportType,
      vehicleDescription,
      availableHours,
      includes200km: true,
      isRegionalSurcharge: isRegionalTravel || false,
      dailyVehiclePrice,
      dayCount,
      companionCount,
      segmentLabel: '전용차량이동',
      notes,
    } as GuidePriceResult;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 카테고리 B: 대중교통 (1인 1일 가격 + 가이드 업셀)
  // ═══════════════════════════════════════════════════════════════════

  // 가이드 업셀 가격 계산 (비교용)
  const guideUpsell = await getGuidePerPersonPerDay(
    companionType, companionCount, availableHours, false,
  );

  if (mobilityStyle === 'WalkMore') {
    // 많이 걷기: 대중교통만
    const tripCount = PARIS_TRANSIT_FARES.daily_trips_walkmore;
    const transit = calculateTransitPerPersonPerDay(dayCount, tripCount);

    return {
      category: 'transit',
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
        '파리 대중교통 2026년 실제 요금',
        '메트로/버스/RER Zone 1-5',
      ],
    } as TransitPriceResult;
  }

  // 적당히 (Moderate): 대중교통 + UberX 혼합
  const transitTrips = PARIS_TRANSIT_FARES.daily_trips_moderate - UBER_PARIS_FARES.daily_uber_trips;
  const transit = calculateTransitPerPersonPerDay(dayCount, transitTrips);
  const uber = calculateUberXDailyPerPerson(UBER_PARIS_FARES.daily_uber_trips, companionCount);

  const perPersonPerDay = round2(transit.perPersonPerDay + uber.perPersonPerDay);

  return {
    category: 'transit',
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
      '파리 2026년 실제 요금',
    ],
  } as TransitPriceResult;
}

// ===================================================================
// Export
// ===================================================================

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
