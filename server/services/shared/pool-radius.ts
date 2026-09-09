// ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 여정 풀 반경·손님상 게이트 단일 진입점(자기도시도 100km 물리검사 · 베스트는 RC 면제)

import { sql, eq, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { cities, placeSeedRaw } from "@shared/schema";
import { distanceKmFromCoords } from "./geo-distance";

export const POOL_RADIUS_M = 100_000;
export const CORE_KM = 10;

export async function getCityCenter(
  cityId: number,
): Promise<{ lat: number; lng: number } | null> {
  if (!db) return null;
  const rows = await db
    .select({ lat: cities.latitude, lng: cities.longitude })
    .from(cities)
    .where(eq(cities.id, cityId))
    .limit(1);
  const c = rows[0];
  return c && c.lat != null && c.lng != null
    ? { lat: Number(c.lat), lng: Number(c.lng) }
    : null;
}

// 거리 계산 = geo-distance.ts 1벌(§16). 여기서는 기존 부르던 곳들을 위해 그대로 다시 내보낸다.
export { distanceKmFromCoords };

/** ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = 100km 상한 추가(옛 무상한 = 폐기 §19). */
export function zoneForDistanceKm(distKm: number): "core" | "outskirt" | null {
  if (!(distKm >= 0) || distKm > POOL_RADIUS_M / 1000) return null;
  return distKm <= CORE_KM ? "core" : "outskirt";
}

const POOL_LAT_DEG = 0.9;
/** ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = 물리 상한 소속무관 일관 적용(옛 2026-07-17 "자기도시 행 손실 0" = 폐기 §19). */
export function poolWhereSql(
  cityId: number,
  center: { lat: number; lng: number } | null,
): SQL {
  if (!center) return sql`${placeSeedRaw.cityId} = ${cityId}`;
  const lngDeg =
    POOL_LAT_DEG / Math.max(Math.cos((center.lat * Math.PI) / 180), 0.15);
  return sql`((
    ${placeSeedRaw.latitude} IS NOT NULL AND ${placeSeedRaw.longitude} IS NOT NULL
    AND ${placeSeedRaw.latitude} <> 0 AND ${placeSeedRaw.longitude} <> 0
    AND ${placeSeedRaw.latitude} BETWEEN ${center.lat - POOL_LAT_DEG} AND ${center.lat + POOL_LAT_DEG}
    AND ${placeSeedRaw.longitude} BETWEEN ${center.lng - lngDeg} AND ${center.lng + lngDeg}
    AND sqrt( power((${center.lat} - ${placeSeedRaw.latitude}) * 111320, 2)
            + power((${center.lng} - ${placeSeedRaw.longitude}) * 111320 * cos(radians((${center.lat} + ${placeSeedRaw.latitude}) / 2)), 2) ) <= ${POOL_RADIUS_M}
  ) OR (${placeSeedRaw.cityId} = ${cityId} AND (
    ${placeSeedRaw.latitude} IS NULL OR ${placeSeedRaw.longitude} IS NULL
    OR ${placeSeedRaw.latitude} = 0 OR ${placeSeedRaw.longitude} = 0
  )))`;
}

// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 결정 = 손님상 게이트 1벌 = active + (RC 또는 best_rank) + 확인된 곳(PID 또는 구글맵 검증) + 폐업·임시휴업 제외(창고엔 남기고 풀리면 저절로 복귀. NULL 은 통과 = 1,310행 보존).
export function servingGateSql(): SQL {
  return sql`(${placeSeedRaw.status} = 'active'
    AND (COALESCE(${placeSeedRaw.googleReviewCount}, 0) > 0 OR ${placeSeedRaw.bestRank} IS NOT NULL)
    AND (${placeSeedRaw.googlePlaceId} IS NOT NULL OR ${placeSeedRaw.verifySource} LIKE 'gmaps%')
    AND (${placeSeedRaw.businessStatus} IS NULL OR ${placeSeedRaw.businessStatus} NOT IN ('CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY')))`;
}

/** ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 기점 = 동적 출발점(숙소>도심) 100km 물리검사 · 손님상 게이트와 한 진입점 */
export async function getPoolContext(
  cityId: number,
  startCoords?: { lat: number; lng: number } | null,
): Promise<{ center: { lat: number; lng: number } | null; where: SQL }> {
  const center = startCoords ?? (await getCityCenter(cityId));
  return { center, where: poolWhereSql(cityId, center) };
}

export function recalcCrossCityZone(
  row: {
    cityId: number;
    latitude: any;
    longitude: any;
    dayZone?: any;
    distanceKmFromCenter?: any;
  },
  requestCityId: number,
  center: { lat: number; lng: number } | null,
): void {
  if (!center || row.cityId === requestCityId) return;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!lat || !lng) return; // 합집합 풀의 크로스도시 행 = 좌표 유효가 전제 = 방어적 종료만
  const distKm = distanceKmFromCoords(center.lat, center.lng, lat, lng);
  row.distanceKmFromCenter = Math.round(distKm * 10) / 10;
  row.dayZone = zoneForDistanceKm(distKm);
}
