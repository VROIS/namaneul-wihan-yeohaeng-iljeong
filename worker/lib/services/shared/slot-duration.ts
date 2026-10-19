// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 입장료 기반 슬롯시간 1벌(워커·엔진 공용, 계산식·값 그대로, DB 연결은 부르는 쪽이 넘긴다) (정본 B4)

import { and, eq, inArray, sql } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";
import type { SelectDb } from "./pool-radius";

export const FREE_THRESHOLD_EUR = 3;

const HOURS_PER_AVERAGE_PLACE = 2;

const SLOT_STEP_MIN = 30;

export const PRICED_STAY_CATEGORIES: ReadonlySet<string> = new Set([
  "heritage",
  "attraction",
  "adventure",
  "healing",
]);

export async function cityHourlyRate(
  db: SelectDb,
  cityId: number,
): Promise<number | null> {
  const rows = await db
    .select({
      avgPrice: sql<number | null>`avg(${placeSeedRaw.priceEur})::float`,
    })
    .from(placeSeedRaw)
    .where(
      and(
        eq(placeSeedRaw.cityId, cityId),
        eq(placeSeedRaw.status, "active"),
        sql`${placeSeedRaw.priceEur} > ${FREE_THRESHOLD_EUR}`,
        inArray(placeSeedRaw.seedCategory, [...PRICED_STAY_CATEGORIES]),
        sql`NOT (COALESCE(${placeSeedRaw.categoryTags}, '{}') && ARRAY['restaurant','hotel']::text[])`,
      ),
    );
  const avg = Number(rows[0]?.avgPrice);
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return avg / HOURS_PER_AVERAGE_PLACE;
}

export function slotMinutesFor(
  priceEur: number | null | undefined,
  paceSlotMinutes: number,
  hourlyRate: number | null,
  seedCategory?: string | null,
): number {
  if (
    !hourlyRate ||
    priceEur == null ||
    !(priceEur > FREE_THRESHOLD_EUR) ||
    !PRICED_STAY_CATEGORIES.has(seedCategory ?? "")
  ) {
    return paceSlotMinutes;
  }
  const raw = (priceEur / hourlyRate) * 60;
  // ⚠️ 수정금지(승인필요) 2026-10-18 사장님 결정 = 체류 = 30분 단위 올림 (정본 §)
  return Math.max(
    SLOT_STEP_MIN,
    Math.ceil(raw / SLOT_STEP_MIN) * SLOT_STEP_MIN,
  );
}
