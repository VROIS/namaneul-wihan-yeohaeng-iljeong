// 교통비 타입·요금표·인터페이스 = transport-pricing-service 분리(2026-07-16 §0 슬림화, 순수 이동)

// === 타입 정의 ===
export type TransportType = "sedan" | "van" | "minibus" | "guide_only";
export type MobilityStyle = "WalkMore" | "Moderate" | "Minimal";
export type TravelStyle = "Luxury" | "Premium" | "Reasonable" | "Economic";
export type CompanionType =
  | "Single"
  | "Couple"
  | "Family"
  | "ExtendedFamily"
  | "Group";

// === 파리 대중교통 실제 요금 (2026년 기준) ===
export const PARIS_TRANSIT_FARES = {
  metro: {
    single: 2.15, // t+ 티켓 1장
    carnet10: 16.9, // t+ 카르네 (10장 묶음) = 1.69/장
    navigo_week: 30.75, // 나비고 주간권 (Zone 1-5)
    navigo_day: 8.65, // 나비고 일일권 (Zone 1-5 Mobilis)
  },
  rer_zone1: { single: 2.15 },
  rer_versailles: 7.5,
  rer_cdg_airport: 11.45,
  rer_orly_bus: 11.5,
  daily_trips_walkmore: 4,
  daily_trips_moderate: 6,
};

// === 우버 파리 요금 (2026년 기준) ===
export const UBER_PARIS_FARES = {
  uberx: {
    base: 2.5,
    perKm: 1.05,
    perMin: 0.35,
    min_fare: 7.0,
  },
  comfort: {
    base: 4.0,
    perKm: 1.45,
    perMin: 0.45,
    min_fare: 10.0,
  },
  black: {
    base: 7.0,
    perKm: 2.05,
    perMin: 0.55,
    min_fare: 20.0,
  },
  daily_uber_trips: 2,
  avg_trip_km: 5.5,
  avg_trip_min: 18,
};

// === 인원별 차량 타입 매핑 ===
export const COMPANION_TO_TRANSPORT: Record<
  CompanionType,
  {
    transportType: TransportType;
    maxCount: number;
    defaultCount: number;
  }
> = {
  Single: { transportType: "sedan", maxCount: 1, defaultCount: 1 },
  Couple: { transportType: "sedan", maxCount: 2, defaultCount: 2 },
  Family: { transportType: "sedan", maxCount: 4, defaultCount: 4 },
  ExtendedFamily: { transportType: "van", maxCount: 7, defaultCount: 6 },
  Group: { transportType: "minibus", maxCount: 20, defaultCount: 10 },
};

// === 기본 가이드 가격 (DB 조회 실패시 fallback) ===
// basePrice4h = 기본 4시간 포함 가격, pricePerHour = 추가 시간당
export const DEFAULT_PRICES: Record<
  TransportType,
  { basePrice4h: number; pricePerHour: number }
> = {
  sedan: { basePrice4h: 240, pricePerHour: 60 }, // 8h = 240 + 4×60 = €480
  van: { basePrice4h: 320, pricePerHour: 80 }, // 8h = 320 + 4×80 = €640
  minibus: { basePrice4h: 400, pricePerHour: 100 }, // 8h = 400 + 4×100 = €800
  guide_only: { basePrice4h: 0, pricePerHour: 50 },
};

// === 인터페이스 ===
export interface TransportPriceInput {
  companionType: CompanionType;
  companionCount: number;
  mobilityStyle: MobilityStyle;
  travelStyle: TravelStyle;
  availableHours: number; // 가용시간 (startTime~endTime 자동 계산, 기본 8시간)
  dayCount: number;
  isRegionalTravel?: boolean; // 지방/도시간 이동 → +50% 할증
}

// 카테고리 A: 가이드 결과
export interface GuidePriceResult {
  category: "guide";
  perPersonPerDay: number; // ⭐ 1인 1일 가격 (메인 표시)
  vehicleType: TransportType;
  vehicleDescription: string;
  availableHours: number;
  includes200km: boolean;
  isRegionalSurcharge: boolean;
  dailyVehiclePrice: number; // 내부 계산용 (고객에게 안 보여줌)
  dayCount: number;
  companionCount: number;
  segmentLabel: "전용차량이동"; // 구간 이동 표시
  notes: string[];
}

// 카테고리 B: 대중교통 결과
export interface TransitPriceResult {
  category: "transit";
  perPersonPerDay: number; // ⭐ 1인 1일 가격 (메인 표시)
  method: string; // Navigo 일일권, 카르네, etc.
  details: string; // 상세 설명
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
  totalFare: number; // 하루 전체 우버블랙 요금 (센트 정밀도)
  perPersonPerDay: number; // 1인 1일 (메인 비교)
  segmentCount: number; // 실제 이동 구간 수
  totalDistanceKm: number; // 실제 주행 거리
  totalDurationMin: number; // 전체 가용시간 (이동+대기 포함)
}

// 통합 결과
export type TransportPricingResult = GuidePriceResult | TransitPriceResult;
