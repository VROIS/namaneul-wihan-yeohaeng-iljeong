// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 도시 찾기 = 원본 services/city-resolver.ts 의 DB 단계
//   1,777줄 한 덩어리에서 그대로 잘라낸 것(§0) = 계산·규칙 한 글자도 안 바꿈.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";

import { READY_THRESHOLD } from "../routes-itinerary-generate-db";

const { cities, placeSeedRaw } = schema;

type Db = PostgresJsDatabase<typeof schema>;

// ── 도시 찾기 (원본 server/services/city-resolver.ts findCityUnified 의 DB 단계) ──

export interface CityResolveResult {
  cityId: number;
  name: string;
  nameEn: string;
  nameLocal: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

export function toCityResult(
  city: typeof cities.$inferSelect,
): CityResolveResult {
  return {
    cityId: city.id,
    name: city.name,
    nameEn: city.nameEn || city.name,
    nameLocal: city.nameLocal || city.name,
    countryCode: city.countryCode,
    latitude: city.latitude,
    longitude: city.longitude,
  };
}

/** 도시 찾기 = 좌표10m → 이름정확 → 별칭 → 부분매칭. 못 찾으면 라우트가 501 로 돌려보낸다(유료 경로로 안 흘림). */
export async function findCityInDb(
  db: Db,
  input: string,
  coords?: { lat: number; lng: number } | null,
): Promise<CityResolveResult | null> {
  if (!input) return null;
  let cleaned = input.trim();
  if (cleaned.includes(",")) cleaned = cleaned.split(",")[0].trim();
  const inputLower = cleaned.toLowerCase();
  if (!inputLower) return null;

  // 원본 :124 0단계 = 도시중심좌표(불변키) 10m 매칭 최우선.
  if (coords && coords.lat != null && coords.lng != null) {
    const near = await db
      .select()
      .from(cities)
      .where(
        sql`ABS(${cities.latitude} - ${coords.lat}) < 0.0001 AND ABS(${cities.longitude} - ${coords.lng}) < 0.0001`,
      )
      .orderBy(cities.id)
      .limit(1);
    if (near.length > 0) return toCityResult(near[0]);
  }

  // 원본 :154 1단계 = 이름 정확 일치.
  const exact = await db
    .select()
    .from(cities)
    .where(
      sql`LOWER(${cities.name}) = ${inputLower}
         OR LOWER(COALESCE(${cities.nameEn}, '')) = ${inputLower}
         OR LOWER(COALESCE(${cities.nameLocal}, '')) = ${inputLower}`,
    )
    .limit(1);
  if (exact.length > 0) return toCityResult(exact[0]);

  // 원본 :184 2단계 = aliases 포함.
  const alias = await db
    .select()
    .from(cities)
    .where(sql`${cities.aliases}::jsonb @> ${JSON.stringify([input])}::jsonb`)
    .limit(1);
  if (alias.length > 0) return toCityResult(alias[0]);

  // 원본 :287 4단계 = 유사어 부분 매칭(양방향 LIKE, 2자 이상).
  const partial = await db
    .select()
    .from(cities)
    .where(
      sql`LOWER(${cities.name}) LIKE ${`%${inputLower}%`} OR ${inputLower} LIKE '%' || LOWER(${cities.name}) || '%'
         OR LOWER(COALESCE(${cities.nameEn}, '')) LIKE ${`%${inputLower}%`} OR (LENGTH(COALESCE(${cities.nameEn},''))>=2 AND ${inputLower} LIKE '%' || LOWER(${cities.nameEn}) || '%')
         OR LOWER(COALESCE(${cities.nameLocal}, '')) LIKE ${`%${inputLower}%`} OR (LENGTH(COALESCE(${cities.nameLocal},''))>=2 AND ${inputLower} LIKE '%' || LOWER(${cities.nameLocal}) || '%')`,
    )
    .limit(1);
  if (partial.length > 0) return toCityResult(partial[0]);

  return null;
}

export interface CityReadyResult {
  ready: boolean;
  cityId: number | null;
  cityName: string;
  count: number;
  latitude: number | null;
  longitude: number | null;
}

/** 원본 server/services/agents/ag2-gemini-recommender.ts:26 isCityReady. */
export async function isCityReady(
  db: Db,
  destination: string,
  destinationCoords?: { lat: number; lng: number } | null,
): Promise<CityReadyResult> {
  const city = await findCityInDb(db, destination, destinationCoords);
  if (!city) {
    return {
      ready: false,
      cityId: null,
      cityName: destination,
      count: 0,
      latitude: null,
      longitude: null,
    };
  }
  // 원본 :61 = 전체 행수 COUNT(후보군 포함).
  const countRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, city.cityId));
  const count = Number(countRows[0]?.count || 0);
  return {
    ready: count >= READY_THRESHOLD,
    cityId: city.cityId,
    cityName: city.name,
    count,
    latitude: city.latitude ?? null,
    longitude: city.longitude ?? null,
  };
}
