// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 교통비 = 원본 transport/guide-pricing.ts · day-config.ts
//   1,777줄 한 덩어리에서 그대로 잘라낸 것(§0) = 계산·규칙 한 글자도 안 바꿈.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";

import {
  COMPANION_TO_TRANSPORT,
  DEFAULT_PRICES,
  type CompanionType,
  type MobilityStyle,
  type TransportType,
  type TravelStyle,
} from "../../server/services/transport/constants";

type Db = PostgresJsDatabase<typeof schema>;

// ── 교통비 (원본 server/services/transport/guide-pricing.ts · day-config.ts) ──

/** 원본 server/services/transport/guide-pricing.ts:12 round2 */
export function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/** 원본 server/services/transport/guide-pricing.ts:17 shouldApplyGuidePrice — 순수. */
export function shouldApplyGuidePrice(
  mobilityStyle: MobilityStyle,
  travelStyle: TravelStyle,
): boolean {
  const ms = (mobilityStyle || "").toLowerCase();
  const ts = (travelStyle || "").toLowerCase();
  return (
    ms === "minimal" || ms === "moderate" || ts === "premium" || ts === "luxury"
  );
}

/** 교통수단별 가이드 요금 = DB 값, 없으면 기본표. */
export async function guidePriceConfig(
  db: Db,
  transportType: TransportType,
): Promise<{ basePrice4h: number; pricePerHour: number }> {
  try {
    const [row] = await db
      .select()
      .from(schema.guidePrices)
      .where(eq(schema.guidePrices.serviceType, transportType))
      .limit(1);
    if (!row) return DEFAULT_PRICES[transportType];
    return {
      basePrice4h: row.basePrice4h || DEFAULT_PRICES[transportType].basePrice4h,
      pricePerHour:
        row.pricePerHour || DEFAULT_PRICES[transportType].pricePerHour,
    };
  } catch (error) {
    console.warn(
      `[Transport] DB 조회 실패, 기본값 사용: ${transportType}`,
      (error as Error)?.message,
    );
    return DEFAULT_PRICES[transportType];
  }
}

/** 그 날 가이드 비용 = 가이드를 쓰는 날에만 부른다. */
export async function guideCostForDay(
  db: Db,
  args: {
    dayConfig: { startTime: string; endTime: string };
    companionType: CompanionType;
    companionCount: number;
    isRegionalTravel?: boolean;
  },
): Promise<number> {
  const [startH, startM] = (args.dayConfig.startTime || "09:00")
    .split(":")
    .map(Number);
  const [endH, endM] = (args.dayConfig.endTime || "21:00")
    .split(":")
    .map(Number);
  // 원본 day-config.ts:64 = 최소 4시간.
  const availableHours = Math.max(
    4,
    round2((endH * 60 + endM - (startH * 60 + startM)) / 60),
  );
  const transportType =
    COMPANION_TO_TRANSPORT[args.companionType]?.transportType ?? "sedan";
  const priceConfig = await guidePriceConfig(db, transportType);
  // 원본 guide-pricing.ts:64 calculateGuideDailyPrice.
  const effectiveHours = Math.max(availableHours, 4);
  const additionalHours = Math.max(0, effectiveHours - 4);
  let dailyVehiclePrice = round2(
    priceConfig.basePrice4h + additionalHours * priceConfig.pricePerHour,
  );
  if (args.isRegionalTravel)
    dailyVehiclePrice = round2(dailyVehiclePrice * 1.5);
  // 원본 transport-pricing-service.ts:76 = 1인 하루치.
  return round2(dailyVehiclePrice / Math.max(1, args.companionCount));
}

/** 원본 server/services/agents/ag4-db-finalize.ts:38 addMinutes */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
