// ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 도시 찾기 = 거점 100km 구조 1벌(city-hub.ts) = 읽기만, 도시를 만들지 않음 · 준비됨은 출발점 풀 기준 (정본 §)

import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";

import { readySql, servingGateSql } from "../lib/services/shared/pool-radius";
import {
  findHub,
  findHubById,
  hubReadiness,
} from "../lib/services/shared/city-hub";
import type { Db } from "../db-types";

const { cities, placeSeedRaw } = schema;

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

export const cityCoordsOf = (c: CityReadyResult) =>
  c.latitude != null && c.longitude != null
    ? { lat: c.latitude, lng: c.longitude }
    : undefined;

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
  return readyResult(db, hub, destination, startCoords);
}

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 여정 수정 완료 = 그 여정에 이미 정해진 거점(city_id)으로 계산 · 이름으로 다시 찾지 않음 (정본 §)
export async function cityReadyById(
  db: Db,
  cityId: number,
): Promise<CityReadyResult> {
  return readyResult(db, await findHubById(db, cityId), String(cityId));
}

async function readyResult(
  db: Db,
  hub: Awaited<ReturnType<typeof findHub>>,
  destination: string,
  startCoords?: { lat: number; lng: number } | null,
): Promise<CityReadyResult> {
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
