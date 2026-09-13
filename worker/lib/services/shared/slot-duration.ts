// ⚠️ 수정금지(승인필요) 2026-08-31 사장님 결정 = 입장료 기반 슬롯시간 단일 진입점 (정본 B4)

import { sql } from "drizzle-orm";
import { db } from "../../db";
import { placeSeedRaw } from "@shared/schema";

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

/** 그 도시 유료 입장지 평균 ÷ 2 = 시간당요금(EUR). 표본 0 이면 null. */
export async function cityHourlyRate(cityId: number): Promise<number | null> {
  if (!db) return null;
  const rows = await db.execute(sql`
    SELECT avg(${placeSeedRaw.priceEur})::float AS avg_price
    FROM ${placeSeedRaw}
    WHERE ${placeSeedRaw.cityId} = ${cityId}
      AND ${placeSeedRaw.status} = 'active'
      AND ${placeSeedRaw.priceEur} > ${FREE_THRESHOLD_EUR}
      AND ${placeSeedRaw.seedCategory} = ANY(${sql.raw("ARRAY[" + [...PRICED_STAY_CATEGORIES].map((c) => `'${c}'`).join(",") + "]::text[]")})
      AND NOT (COALESCE(${placeSeedRaw.categoryTags}, '{}') && ARRAY['restaurant','hotel']::text[])
  `);
  const avg = Number(
    (rows as any).rows?.[0]?.avg_price ?? (rows as any)[0]?.avg_price,
  );
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
