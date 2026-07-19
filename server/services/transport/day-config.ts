// 날짜별 dayConfig·가이드 하루요금·공항픽업 = transport-pricing-service 분리(2026-07-16 §0 슬림화, 순수 이동)

import type {
  TransportType,
  CompanionType,
  MobilityStyle,
  TravelStyle,
} from "./constants";
import { round2 } from "./guide-pricing";
import { calculateTransportPrice } from "../transport-pricing-service";

// ===================================================================
// 공항 픽업 (기존 유지)
// ===================================================================

export function getAirportTransferPrice(transportType: TransportType): {
  priceLow: number;
  priceHigh: number;
  description: string;
} {
  const airportPrices: Record<
    TransportType,
    { priceLow: number; priceHigh: number; description: string }
  > = {
    sedan: {
      priceLow: 117,
      priceHigh: 152,
      description: "비즈니스 세단 (E-Class) - CDG 공항 픽업",
    },
    van: {
      priceLow: 117,
      priceHigh: 149,
      description: "프라이빗 밴 (4-7인) - CDG 공항 픽업",
    },
    minibus: {
      priceLow: 200,
      priceHigh: 300,
      description: "미니버스 - CDG 공항 픽업 (별도 견적)",
    },
    guide_only: { priceLow: 0, priceHigh: 0, description: "공항 픽업 없음" },
  };
  return airportPrices[transportType] || airportPrices.sedan;
}

// ===================================================================
// 날짜별 dayConfig + 가이드 하루요금 = 단일 SSOT (2026-07-06 사장님)
// ===================================================================

/**
 * ⚠️ 2026-07-06 사장님 SSOT = 그 날의 가용 시각(startTime/endTime) 결정 = 단일 SSOT(§16/§20).
 *   = 정답(DB-only ag1-skeleton-builder) 버퍼 규칙: 1일=사용자그대로 / 첫날=사용자시작~기본종료 / 막날=기본시작~사용자종료 / 중간=기본~기본.
 *   = 옛 MIX ±60분 산술 폐기(§19) → 3경로(ag1·MIX·숙소재계산) 이 함수 1벌 공유 = 가이드 날짜별 요금 정합.
 *   = DEFAULT 시각은 호출부(types.ts DEFAULT_START/END_TIME)가 인자로 전달(순환참조 0).
 */
export function buildDayConfig(
  day: number,
  dayCount: number,
  userStart: string,
  userEnd: string,
  defaultStart: string,
  defaultEnd: string,
): { startTime: string; endTime: string } {
  if (dayCount === 1) return { startTime: userStart, endTime: userEnd };
  if (day === 1) return { startTime: userStart, endTime: defaultEnd };
  if (day === dayCount) return { startTime: defaultStart, endTime: userEnd };
  return { startTime: defaultStart, endTime: defaultEnd };
}

/**
 * ⚠️ 2026-07-06 사장님 SSOT = 가이드 하루 1인 교통비 = 그 날 dayConfig 가용시간 기준 1회 계산 = 단일 SSOT(§16).
 *   = 옛 ag4 로컬 guideCostPerPersonPerDay 승격(3경로 공유). MIX/숙소재계산이 못 써서 flat 재발명하던 결함 근본해결.
 *   = 가용시간(종료−시작, 최소4h) → calculateTransportPrice → 가이드면 perPersonPerDay, 아니면 0.
 */
export async function guideCostForDay(args: {
  dayConfig: { startTime: string; endTime: string };
  companionType: CompanionType;
  companionCount: number;
  mobilityStyle: MobilityStyle;
  travelStyle: TravelStyle;
  dayCount: number;
}): Promise<number> {
  const [startH, startM] = (args.dayConfig.startTime || "09:00")
    .split(":")
    .map(Number);
  const [endH, endM] = (args.dayConfig.endTime || "21:00")
    .split(":")
    .map(Number);
  const availableHours = Math.max(
    4,
    round2((endH * 60 + endM - (startH * 60 + startM)) / 60),
  );
  const priceResult = await calculateTransportPrice({
    companionType: args.companionType,
    companionCount: args.companionCount,
    mobilityStyle: args.mobilityStyle,
    travelStyle: args.travelStyle,
    availableHours,
    dayCount: args.dayCount,
  });
  return priceResult.category === "guide" ? priceResult.perPersonPerDay : 0;
}
