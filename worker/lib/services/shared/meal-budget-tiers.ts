// ⚠️ 수정금지(승인필요) 2026-08-31 사장님 확정 = 식당 예산 저·중·고 = 그 도시 분포 경계선(30/50/20) (정본 B4)

import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { TravelStyle } from "../agents/types";

/** 저예산 = €1~lo · 중급 = lo~hi · 고급 = hi 초과(상한 없음) */
export type CityMealTiers = { lo: number; hi: number };

const MIN_SAMPLE = 5; // 이보다 적으면 분포 자체가 안 나옴 = 고정값으로 되돌림

/** 그 도시 손님상 가능 식당 가격 분포로 경계선 2개를 구한다. 표본 부족이면 null. */
export async function cityMealTiers(
  cityId: number,
): Promise<CityMealTiers | null> {
  if (!db) return null;
  const r = (await db.execute(sql`
    SELECT price_eur::float AS p FROM place_seed_raw
    WHERE city_id = ${cityId} AND seed_category = 'restaurant' AND status = 'active'
      AND google_review_count > 0 AND google_place_id IS NOT NULL
      AND price_eur IS NOT NULL AND price_eur > 0
      AND image_url IS NOT NULL AND image_url <> ''
    ORDER BY price_eur
  `)) as any;
  const ps: number[] = (r.rows ?? r).map((x: any) => Number(x.p));
  if (ps.length < MIN_SAMPLE) return null;
  const at = (f: number) =>
    ps[Math.min(ps.length - 1, Math.floor(ps.length * f))];
  return { lo: at(0.3), hi: at(0.8) };
}

/** 손님 예산 등급 → 그 도시의 실제 가격 구간(하한, 상한). 상한 Infinity = 천장 없음. */
export function tierRange(
  style: TravelStyle,
  t: CityMealTiers,
): { min: number; cap: number } {
  if (style === "Economic") return { min: 1, cap: t.lo };
  if (style === "Reasonable") return { min: t.lo, cap: t.hi };
  return { min: t.hi, cap: Number.POSITIVE_INFINITY }; // Premium·Luxury = 고급 1벌
}
