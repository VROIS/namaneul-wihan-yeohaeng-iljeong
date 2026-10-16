// ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 도시 찾기 = 거점 100km 구조 1벌(city-hub.ts) = 읽기만, 도시를 만들지 않음 · 준비됨은 출발점 풀 기준 (정본 §)

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";

import { readySql, servingGateSql } from "../lib/services/shared/pool-radius";
import { findHub, hubReadiness } from "../lib/services/shared/city-hub";

const { cities, placeSeedRaw } = schema;

type Db = PostgresJsDatabase<typeof schema>;

/** 도시 카드 = 전환 기준을 넘은 도시(손님상 많은 순). */
export function readyCities(db: Db) {
  return db
    .select({
      id: cities.id,
      nameKo: cities.name,
      nameEn: cities.nameEn,
      rows: sql<number>`COUNT(*)::int`,
    })
    .from(cities)
    .innerJoin(
      placeSeedRaw,
      and(eq(placeSeedRaw.cityId, cities.id), servingGateSql()),
    )
    .groupBy(cities.id, cities.name, cities.nameEn)
    .having(readySql())
    .orderBy(desc(sql`COUNT(*)`));
}

export interface CityReadyResult {
  ready: boolean;
  cityId: number | null;
  cityName: string;
  count: number;
  latitude: number | null;
  longitude: number | null;
}

export async function isCityReady(
  db: Db,
  destination: string,
  startCoords?: { lat: number; lng: number } | null,
  countryCode?: string | null,
): Promise<CityReadyResult> {
  const hub = await findHub(db, {
    input: destination,
    coords: startCoords,
    countryCode,
  });
  if (!hub) {
    return {
      ready: false,
      cityId: null,
      cityName: destination,
      count: 0,
      latitude: null,
      longitude: null,
    };
  }
  const { ready, count } = await hubReadiness(db, hub, startCoords);
  return {
    ready,
    cityId: hub.cityId,
    cityName: hub.name,
    count,
    latitude: hub.latitude,
    longitude: hub.longitude,
  };
}
