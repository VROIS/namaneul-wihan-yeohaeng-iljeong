// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 식당 상·중·하 = 그 도시 가격 분포 1벌(= 물가지수, 아래 30%·가운데 50%·위 20% 경계) · 표본 = CID 있고 가격 있는 식당 · 모든 값 유로 · 고정 유로 없음(표본이 모자라면 가격으로 자르지 않는다) · DB 올리 전용(DB 연결은 부르는 쪽이 넘긴다) (정본 B4)

import { and, eq, gt, like, sql } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";
import type { TravelStyle } from "../agents/types";
import type { SelectDb } from "./pool-radius";

/** 하 = €1~lo · 중 = lo~hi · 상 = hi 초과(상한 없음) */
export type CityMealTiers = { lo: number; hi: number };

const MIN_SAMPLE = 5; // 이보다 적으면 분포 자체가 안 나옴 = 가격으로 자르지 않음

/** 그 도시 식당 가격 분포로 경계선 2개를 구한다. 표본 부족이면 null. */
export async function cityMealTiers(
  db: SelectDb,
  cityId: number,
): Promise<CityMealTiers | null> {
  const rows = await db
    .select({ p: sql<number>`${placeSeedRaw.priceEur}::float` })
    .from(placeSeedRaw)
    .where(
      and(
        eq(placeSeedRaw.cityId, cityId),
        eq(placeSeedRaw.seedCategory, "restaurant"),
        eq(placeSeedRaw.status, "active"),
        like(placeSeedRaw.googleMapsUri, "%cid=%"),
        gt(placeSeedRaw.priceEur, 0),
      ),
    )
    .orderBy(placeSeedRaw.priceEur);
  const ps: number[] = rows.map((x: { p: number }) => Number(x.p));
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
  return { min: t.hi, cap: Number.POSITIVE_INFINITY }; // Premium·Luxury = 상 1벌
}

/** 가격 모르는 식사 = 그 등급 구간의 글자("€12 이내" / "€20 이상")와 추정값(구간 가운데, 상은 하한) */
export function tierLabel(style: TravelStyle, t: CityMealTiers): string {
  const r = tierRange(style, t);
  return Number.isFinite(r.cap)
    ? `€${Math.round(r.cap)} 이내`
    : `€${Math.round(r.min)} 이상`;
}
export function tierEstimate(style: TravelStyle, t: CityMealTiers): number {
  const r = tierRange(style, t);
  return Math.round(Number.isFinite(r.cap) ? (r.min + r.cap) / 2 : r.min);
}
