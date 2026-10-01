// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 입장료 기반 슬롯시간 1벌(워커·엔진 공용, 계산식·값 그대로, DB 연결은 부르는 쪽이 넘긴다) (정본 B4)

import { and, eq, inArray, sql } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";
import type { SelectDb } from "./pool-radius";

/** 이 값 이하 = 국가 기부 개념·무료로 보고 계산 대상에서 제외 = 원 여행밀도 */
export const FREE_THRESHOLD_EUR = 3;

/** 입장료 있는 곳의 표준 체류 = 2시간 → 도시 평균 입장료가 곧 2시간치 요금 */
const HOURS_PER_AVERAGE_PLACE = 2;

const SLOT_STEP_MIN = 30;

/** 입장료가 체류시간을 대변하는 카테고리 1벌 (평균 표본·슬롯 계산 동일 적용) */
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

/** 장소 1곳 슬롯 소요분 = 유료는 입장료÷시간당요금(30분 반올림), 그 외는 밀도 기본값. */
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
  return Math.max(
    SLOT_STEP_MIN,
    Math.round(raw / SLOT_STEP_MIN) * SLOT_STEP_MIN,
  );
}
