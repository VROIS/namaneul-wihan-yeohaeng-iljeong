// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 교통비 = 원본 transport/guide-pricing.ts · day-config.ts

import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";

import {
  COMPANION_TO_TRANSPORT,
  DEFAULT_PRICES,
  type CompanionType,
  type TransportType,
} from "../lib/services/transport/constants";
import { round2 } from "../lib/services/transport/guide-pricing";
import type { Db } from "../db-types";

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
  const availableHours = Math.max(
    4,
    round2((endH * 60 + endM - (startH * 60 + startM)) / 60),
  );
  const transportType =
    COMPANION_TO_TRANSPORT[args.companionType]?.transportType ?? "sedan";
  const priceConfig = await guidePriceConfig(db, transportType);
  const effectiveHours = Math.max(availableHours, 4);
  const additionalHours = Math.max(0, effectiveHours - 4);
  let dailyVehiclePrice = round2(
    priceConfig.basePrice4h + additionalHours * priceConfig.pricePerHour,
  );
  if (args.isRegionalTravel)
    dailyVehiclePrice = round2(dailyVehiclePrice * 1.5);
  return round2(dailyVehiclePrice / Math.max(1, args.companionCount));
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
