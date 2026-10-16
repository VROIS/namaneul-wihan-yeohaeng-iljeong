import type { CompanionType, MobilityStyle, TravelStyle } from "./constants";
import { round2 } from "./guide-pricing";
import { calculateTransportPrice } from "../transport-pricing-service";

// 날짜별 dayConfig + 가이드 하루요금 = 단일 SSOT (2026-07-06 사장님)

/** ⚠️ 2026-07-06 사장님 SSOT = 그 날의 가용 시각(startTime/endTime) 결정 = 단일 SSOT(§16/§20). */
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

/** ⚠️ 2026-07-06 사장님 SSOT = 가이드 하루 1인 교통비 = 그 날 dayConfig 가용시간 기준 1회 계산 = 단일 SSOT(§16). */
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
