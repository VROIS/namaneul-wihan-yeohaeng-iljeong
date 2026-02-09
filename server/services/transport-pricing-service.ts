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
 */

import { db } from '../db';
import { guidePrices } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// === 타입 정의 ===
type TransportType = 'sedan' | 'van' | 'minibus' | 'guide_only';
type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';
type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';
type CompanionType = 'Single' | 'Couple' | 'Family' | 'ExtendedFamily' | 'Group';

// === 파리 대중교통 실제 요금 (2026년 기준) ===
const PARIS_TRANSIT_FARES = {
  metro: {
    single: 2.15,         // t+ 티켓 1장
    carnet10: 16.90,      // t+ 카르네 (10장 묶음) = 1.69/장
    navigo_week: 30.75,   // 나비고 주간권 (Zone 1-5)
    navigo_day: 8.65,     // 나비고 일일권 (Zone 1-5 Mobilis)
  },
  rer_zone1: { single: 2.15 },
  rer_versailles: 7.50,
  rer_cdg_airport: 11.45,
  rer_orly_bus: 11.50,
  daily_trips_walkmore: 4,
  daily_trips_moderate: 6,
};

// === 우버 파리 요금 (2026년 기준) ===
const UBER_PARIS_FARES = {
  uberx: {
    base: 2.50, perKm: 1.05, perMin: 0.35, min_fare: 7.00,
  },
  comfort: {
    base: 4.00, perKm: 1.45, perMin: 0.45, min_fare: 10.00,
  },
  black: {
    base: 7.00, perKm: 2.05, perMin: 0.55, min_fare: 20.00,
  },
  daily_uber_trips: 2,
  avg_trip_km: 5.5,
  avg_trip_min: 18,
};

// === 인원별 차량 타입 매핑 ===
const COMPANION_TO_TRANSPORT: Record<CompanionType, {
  transportType: TransportType;
  maxCount: number;
  defaultCount: number;
}> = {
  Single:         { transportType: 'sedan',   maxCount: 1,  defaultCount: 1 },
  Couple:         { transportType: 'sedan',   maxCount: 2,  defaultCount: 2 },
  Family:         { transportType: 'sedan',   maxCount: 4,  defaultCount: 4 },
  ExtendedFamily: { transportType: 'van',     maxCount: 7,  defaultCount: 6 },
  Group:          { transportType: 'minibus', maxCount: 20, defaultCount: 10 },
};

// === 기본 가이드 가격 (DB 조회 실패시 fallback) ===
// basePrice4h = 기본 4시간 포함 가격, pricePerHour = 추가 시간당
const DEFAULT_PRICES: Record<TransportType, { basePrice4h: number; pricePerHour: number }> = {
  sedan:      { basePrice4h: 240, pricePerHour: 60 },   // 8h = 240 + 4×60 = €480
  van:        { basePrice4h: 320, pricePerHour: 80 },   // 8h = 320 + 4×80 = €640
  minibus:    { basePrice4h: 400, pricePerHour: 100 },  // 8h = 400 + 4×100 = €800
  guide_only: { basePrice4h: 0,   pricePerHour: 50 },
};

// === 인터페이스 ===
export interface TransportPriceInput {
  companionType: CompanionType;
  companionCount: number;
  mobilityStyle: MobilityStyle;
  travelStyle: TravelStyle;
  availableHours: number;     // 가용시간 (startTime~endTime 자동 계산, 기본 8시간)
  dayCount: number;
  isRegionalTravel?: boolean; // 지방/도시간 이동 → +50% 할증
}

// 카테고리 A: 가이드 결과
export interface GuidePriceResult {
  category: 'guide';
  perPersonPerDay: number;        // ⭐ 1인 1일 가격 (메인 표시)
  vehicleType: TransportType;
  vehicleDescription: string;
  availableHours: number;
  includes200km: boolean;
  isRegionalSurcharge: boolean;
  dailyVehiclePrice: number;      // 내부 계산용 (고객에게 안 보여줌)
  dayCount: number;
  companionCount: number;
  segmentLabel: '전용차량이동';   // 구간 이동 표시
  notes: string[];
}

// 카테고리 B: 대중교통 결과
export interface TransitPriceResult {
  category: 'transit';
  perPersonPerDay: number;        // ⭐ 1인 1일 가격 (메인 표시)
  method: string;                 // Navigo 일일권, 카르네, etc.
  details: string;                // 상세 설명
  dayCount: number;
  companionCount: number;
  // 업셀: 가이드 이용시 가격
  guideUpsell: {
    perPersonPerDay: number;
    vehicleDescription: string;
    clickable: true;
  };
  notes: string[];
}

// 우버 블랙 비교 결과 (시간제 대절 기준)
export interface UberBlackComparison {
  totalFare: number;              // 하루 전체 우버블랙 요금 (센트 정밀도)
  perPersonPerDay: number;        // 1인 1일 (메인 비교)
  segmentCount: number;           // 실제 이동 구간 수
  totalDistanceKm: number;        // 실제 주행 거리
  totalDurationMin: number;       // 전체 가용시간 (이동+대기 포함)
}

// 통합 결과
export type TransportPricingResult = GuidePriceResult | TransitPriceResult;

// ===================================================================
// 유틸리티
// ===================================================================

export function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * 가이드 카테고리 판별
 * mobilityStyle = Minimal OR travelStyle = Premium/Luxury → 가이드
 */
export function shouldApplyGuidePrice(
  mobilityStyle: MobilityStyle,
  travelStyle: TravelStyle,
): boolean {
  const ms = (mobilityStyle || '').toLowerCase();
  const ts = (travelStyle || '').toLowerCase();
  return ms === 'minimal' || ms === 'drivemore'
    || ts === 'premium' || ts === 'luxury';
}

// ===================================================================
// DB 조회
// ===================================================================

async function getGuidePriceFromDB(serviceType: TransportType): Promise<{
  basePrice4h: number;
  pricePerHour: number;
} | null> {
  try {
    const [priceData] = await db.select().from(guidePrices)
      .where(eq(guidePrices.serviceType, serviceType))
      .limit(1);
    if (!priceData) return null;
    return {
      basePrice4h: priceData.basePrice4h || DEFAULT_PRICES[serviceType].basePrice4h,
      pricePerHour: priceData.pricePerHour || DEFAULT_PRICES[serviceType].pricePerHour,
    };
  } catch (error) {
    console.warn(`[Transport] DB 조회 실패, 기본값 사용: ${serviceType}`, error);
    return null;
  }
}

// ===================================================================
// 가이드 가격 계산 (가용시간 기준, +추가 개념 없음)
// ===================================================================

/**
 * 드라이빙 가이드 1일 차량 가격 계산
 * - 가용시간에서 자동 계산 (기본 8시간)
 * - 200km 포함
 * - 지방이동 시 +50% 할증
 * - "+추가시간" 표기 없이, 1일 가격으로 표시
 */
export async function calculateGuideDailyPrice(
  transportType: TransportType,
  availableHours: number = 8,
  isRegionalTravel: boolean = false,
): Promise<{ dailyVehiclePrice: number; priceConfig: { basePrice4h: number; pricePerHour: number } }> {
  const dbPrice = await getGuidePriceFromDB(transportType);
  const priceConfig = dbPrice || DEFAULT_PRICES[transportType];

  // 가용시간 기준 자동 계산 (최소 4시간)
  const effectiveHours = Math.max(availableHours, 4);
  const additionalHours = Math.max(0, effectiveHours - 4);

  // 1일 차량 가격 = 기본(4h포함) + 추가시간 × 시간당 (내부 계산만, 고객에게는 1일 가격으로 표시)
  let dailyVehiclePrice = round2(priceConfig.basePrice4h + (additionalHours * priceConfig.pricePerHour));

  // 지방/도시간 이동: +50% 할증
  if (isRegionalTravel) {
    dailyVehiclePrice = round2(dailyVehiclePrice * 1.5);
  }

  return { dailyVehiclePrice, priceConfig };
}

/**
 * 가이드 1인 1일 가격 (어디서든 호출 가능 - 업셀 비교용)
 */
export async function getGuidePerPersonPerDay(
  companionType: CompanionType,
  companionCount: number,
  availableHours: number = 8,
  isRegionalTravel: boolean = false,
): Promise<{ perPersonPerDay: number; dailyVehiclePrice: number; vehicleType: TransportType; vehicleDescription: string }> {
  const config = COMPANION_TO_TRANSPORT[companionType];
  const transportType = config.transportType;

  const { dailyVehiclePrice } = await calculateGuideDailyPrice(transportType, availableHours, isRegionalTravel);
  const perPersonPerDay = round2(dailyVehiclePrice / companionCount);

  const vehicleDescription = transportType === 'sedan' ? '전용 세단 (1-4인)'
    : transportType === 'van' ? '전용 밴 (5-7인)'
    : transportType === 'minibus' ? '전용 미니버스 (8인+)'
    : '가이드 서비스';

  return { perPersonPerDay, dailyVehiclePrice, vehicleType: transportType, vehicleDescription };
}

// ===================================================================
// 대중교통 비용 계산
// ===================================================================

/**
 * 대중교통 1인 1일 비용 (최적 패스 자동 선택)
 */
function calculateTransitPerPersonPerDay(dayCount: number, tripCount: number): {
  perPersonPerDay: number;
  method: string;
  details: string;
} {
  const singleFare = PARIS_TRANSIT_FARES.metro.single;
  const carnetFare = PARIS_TRANSIT_FARES.metro.carnet10 / 10;
  const navigoDay = PARIS_TRANSIT_FARES.metro.navigo_day;
  const navigoWeek = PARIS_TRANSIT_FARES.metro.navigo_week;

  const dailyIndividual = tripCount * singleFare;
  const dailyCarnet = tripCount * carnetFare;

  let perPersonPerDay: number;
  let method: string;
  let details: string;

  if (dayCount >= 5) {
    perPersonPerDay = round2(navigoWeek / dayCount);
    method = 'Navigo 주간권';
    details = `€${navigoWeek}/주 ÷ ${dayCount}일 = €${perPersonPerDay}/일/인`;
  } else if (dailyIndividual > navigoDay) {
    perPersonPerDay = navigoDay;
    method = 'Navigo 일일권';
    details = `Mobilis Zone 1-5: €${navigoDay}/일/인`;
  } else if (tripCount >= 5) {
    perPersonPerDay = round2(dailyCarnet);
    method = 't+ 카르네';
    details = `카르네 €1.69/회 × ${tripCount}회 = €${perPersonPerDay}/일/인`;
  } else {
    perPersonPerDay = round2(dailyIndividual);
    method = 't+ 개별';
    details = `€${singleFare}/회 × ${tripCount}회 = €${perPersonPerDay}/일/인`;
  }

  return { perPersonPerDay, method, details };
}

/**
 * UberX 1인 1일 비용 (Moderate에서 대중교통과 혼합)
 */
function calculateUberXDailyPerPerson(tripCount: number, companionCount: number): {
  perPersonPerDay: number;
  farePerTrip: number;
  details: string;
} {
  const fare = UBER_PARIS_FARES.uberx;
  const avgKm = UBER_PARIS_FARES.avg_trip_km;
  const avgMin = UBER_PARIS_FARES.avg_trip_min;

  let farePerTrip = fare.base + (avgKm * fare.perKm) + (avgMin * fare.perMin);
  farePerTrip = Math.max(farePerTrip, fare.min_fare);
  farePerTrip = round2(farePerTrip);

  // 우버는 차량 1대에 같이 탑승 → 총 요금을 인원으로 나눔
  const dailyTotal = round2(farePerTrip * tripCount);
  const perPersonPerDay = round2(dailyTotal / companionCount);

  return {
    perPersonPerDay,
    farePerTrip,
    details: `UberX €${farePerTrip}/회 × ${tripCount}회 ÷ ${companionCount}인 = €${perPersonPerDay}/일/인`,
  };
}

// ===================================================================
// 우버 블랙 시간제 비교 계산 (가이드와 동일 조건 비교)
// ===================================================================

/**
 * 우버블랙 시간제 요금 계산 (가이드와 공정 비교용)
 * 
 * 💡 핵심 원칙:
 *   - 가이드처럼 하루 종일 사용 (가용시간 풀, 대기 포함)
 *   - 구간별 호출이 아니라, 시간제 대절 개념
 *   - 전체 가용시간(예: 09~21시=12시간) 동안:
 *     · 실제 이동 시간(driving) → 주행 요금 (km + min)
 *     · 대기 시간(waiting) → 대기 요금 (min 단위)
 *   - 센트 단위 정밀도 (€168.75)
 *   - 도시별 요금 적용 (현재: 파리, 향후 DB 확장)
 * 
 * @param availableHours 사용자 가용시간 (startTime~endTime, 기본 8시간)
 * @param segments 실제 경로 데이터 (이동 거리/시간)
 * @param companionCount 인원수
 */
export function calculateUberBlackHourly(
  availableHours: number,
  segments: Array<{ distanceKm: number; durationMin: number }>,
  companionCount: number,
): UberBlackComparison {
  const fare = UBER_PARIS_FARES.black;

  // 실제 이동 거리/시간 합산
  let totalDrivingKm = 0;
  let totalDrivingMin = 0;
  for (const seg of segments) {
    totalDrivingKm += seg.distanceKm;
    totalDrivingMin += seg.durationMin;
  }

  // 전체 가용시간 (분)
  const totalAvailableMin = availableHours * 60;

  // 대기 시간 = 가용시간 - 실제 이동시간 (가이드처럼 기다리는 시간도 요금에 포함)
  const waitingMin = Math.max(0, totalAvailableMin - totalDrivingMin);

  // 우버블랙 시간제 요금:
  // = 기본료 (1회만)
  // + 주행 거리 요금 (실제 이동 km)
  // + 주행 시간 요금 (실제 이동 min)
  // + 대기 시간 요금 (대기 min × per-min 요금)
  //
  // ⚠️ 우버블랙은 대기시간도 분당 과금됨 (택시와 동일 원리)
  const drivingFare = (totalDrivingKm * fare.perKm) + (totalDrivingMin * fare.perMin);
  const waitingFare = waitingMin * fare.perMin;  // 대기 중에도 분당 과금
  const totalFare = round2(fare.base + drivingFare + waitingFare);

  // 최소 요금 적용
  const finalFare = Math.max(totalFare, fare.min_fare);
  const perPersonPerDay = round2(finalFare / companionCount);

  return {
    totalFare: round2(finalFare),
    perPersonPerDay,
    segmentCount: segments.length,
    totalDistanceKm: round2(totalDrivingKm),
    totalDurationMin: Math.round(totalAvailableMin),  // 전체 가용시간 표시
  };
}

/**
 * @deprecated 구간별 합산 방식 → calculateUberBlackHourly 사용
 */
export function calculateUberBlackForRoutes(
  segments: Array<{ distanceKm: number; durationMin: number }>,
  companionCount: number,
): UberBlackComparison {
  // 기본 8시간으로 시간제 계산에 위임
  return calculateUberBlackHourly(8, segments, companionCount);
}

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
// 공항 픽업 (기존 유지)
// ===================================================================

export function getAirportTransferPrice(transportType: TransportType): {
  priceLow: number;
  priceHigh: number;
  description: string;
} {
  const airportPrices: Record<TransportType, { priceLow: number; priceHigh: number; description: string }> = {
    sedan:      { priceLow: 117, priceHigh: 152, description: '비즈니스 세단 (E-Class) - CDG 공항 픽업' },
    van:        { priceLow: 117, priceHigh: 149, description: '프라이빗 밴 (4-7인) - CDG 공항 픽업' },
    minibus:    { priceLow: 200, priceHigh: 300, description: '미니버스 - CDG 공항 픽업 (별도 견적)' },
    guide_only: { priceLow: 0,   priceHigh: 0,   description: '공항 픽업 없음' },
  };
  return airportPrices[transportType] || airportPrices.sedan;
}

// ===================================================================
// Export
// ===================================================================

export const transportPricingService = {
  shouldApplyGuidePrice,
  calculateTransportPrice,
  calculateGuideDailyPrice,
  getGuidePerPersonPerDay,
  calculateUberBlackHourly,
  calculateUberBlackForRoutes, // @deprecated → calculateUberBlackHourly 사용
  getAirportTransferPrice,
  round2,
};
