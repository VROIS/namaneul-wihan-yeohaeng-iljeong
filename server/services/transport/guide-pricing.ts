// 가이드 가격 계산(DB조회+1일가격+1인가격) = transport-pricing-service 분리(2026-07-16 §0 슬림화, 순수 이동)

import { db } from '../../db';
import { guidePrices } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_PRICES, COMPANION_TO_TRANSPORT } from './constants';
import type { TransportType, MobilityStyle, TravelStyle, CompanionType } from './constants';

// ===================================================================
// 유틸리티
// ===================================================================

export function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * ⚠️ 2026-07-04 사장님 SSOT = 드라이빙 가이드 판별 = 아래 4가지 중 하나라도 = 무조건 가이드(사장님 본업 퍼널).
 *   이동 = Minimal(이동최소화) OR Moderate(적당히) / 예산 = Premium OR Luxury.
 *   = 많이걷기(WalkMore) + 합리적/경제적 조합만 대중교통, 나머지는 전부 드라이빙 가이드.
 */
export function shouldApplyGuidePrice(
  mobilityStyle: MobilityStyle,
  travelStyle: TravelStyle,
): boolean {
  const ms = (mobilityStyle || '').toLowerCase();
  const ts = (travelStyle || '').toLowerCase();
  return ms === 'minimal' || ms === 'moderate'
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
