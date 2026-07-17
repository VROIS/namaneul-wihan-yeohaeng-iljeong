// ⚠️ 수정금지(승인필요) 2026-07-17 사장님 확정 SSOT = 여정 풀 반경 단일 진입점 (§16 재발명 차단)
// = 장소는 글로벌(도시번호 소유 아님). 슬롯 조립용 풀 = (city_id = 요청도시) ∪ (좌표 유효 AND 요청도시 중심 100km 이내)
//   = 순수 확장: 기존 city_id 풀은 한 행도 잃지 않고(좌표 NULL·100km 초과 자기도시 행 보존) 크로스도시 100km 행만 추가.
//   = 실증: 본(134) 소속 디종 시내 식당 Loiseau des Ducs(78740)가 디종(64) 풀에서 안 보이던 결함의 근본 해소.
// = 크로스도시 행의 day_zone/distance = 요청 도시 중심 기준 "메모리 재계산"만. DB 쓰기 절대 금지(행의 city_id·day_zone 컬럼 불변).
// = 사용처: ag2 fetchFromPlaceSeedRaw(DB-only 슬롯 풀) / ag3 loadSeedRawMap(MIX 매칭·슬롯표시 맵) / ag4 restaurantPool(동선 식당 풀).
//   도시 발굴상태 판정(isCityReady)·fill 발굴도구(enrich-place 등)는 목적이 달라 city_id 유지 = 이 헬퍼 사용 금지.

import { sql, eq, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { cities, placeSeedRaw } from "@shared/schema";

/** 풀 반경 = 100km (외곽 day-trip 풀과 동일 철학) */
export const POOL_RADIUS_M = 100_000;
/** day_zone 경계 = core ≤10km / outskirt 10~100km (기존 기준 그대로) */
export const CORE_KM = 10;

/** 요청 도시 중심좌표 (cities.latitude/longitude = NOT NULL = 도시 행이 있으면 항상 존재) */
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

/**
 * 같은장소 반경 공식(전 요원 byte 동형):
 * 거리m = sqrt( ((latA-latB)*111320)^2 + ((lngA-lngB)*111320*cos(radians((latA+latB)/2)))^2 )
 * @returns 거리 km
 */
export function distanceKmFromCoords(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const dLat = (latA - latB) * 111320;
  const dLng = (lngA - lngB) * 111320 * Math.cos((((latA + latB) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng) / 1000;
}

/** 요청 도시 중심거리 → 유효 day_zone (core ≤10km / outskirt 10~100km) */
export function zoneForDistanceKm(distKm: number): "core" | "outskirt" {
  return distKm <= CORE_KM ? "core" : "outskirt";
}

// 100km ≈ 위도 0.9도(위도 1도 111.32km). 경도 박스는 위도 보정(고위도일수록 넓게) = POOL_LAT_DEG / cos(위도) = 어느 위도든 100km 커버(고위도 누락 0).
//   = sqrt 앞 선필터 = latitude/longitude BETWEEN 박스(idx_psr_latitude sargable) → 정밀 sqrt 는 좁혀진 후보만 (place-identity.sql 좌표10m 와 동일 패턴, 풀스캔 12,930→선필터 후보만).
const POOL_LAT_DEG = 0.9;
/**
 * 합집합 풀 WHERE 조각 = (city_id = 요청도시) OR (좌표 유효 AND 중심 100km 이내)
 * = drizzle .where() / raw sql`` 양쪽에 그대로 합성 가능.
 * = center null(도시 행 부재 = 이론상 없음) = 반경 정의 불가 = 자기도시 풀만.
 */
export function poolWhereSql(
  cityId: number,
  center: { lat: number; lng: number } | null,
): SQL {
  if (!center) return sql`${placeSeedRaw.cityId} = ${cityId}`;
  // 경도 1도 길이 = 위도에 따라 짧아짐 → 박스폭 = 위도폭 / cos(위도). cos 최소 0.15(위도 81°+) 로 클램프(극지 방어) = 어느 위도든 100km 넉넉히 커버.
  const lngDeg = POOL_LAT_DEG / Math.max(Math.cos((center.lat * Math.PI) / 180), 0.15);
  return sql`(${placeSeedRaw.cityId} = ${cityId} OR (
    ${placeSeedRaw.latitude} IS NOT NULL AND ${placeSeedRaw.longitude} IS NOT NULL
    AND ${placeSeedRaw.latitude} <> 0 AND ${placeSeedRaw.longitude} <> 0
    AND ${placeSeedRaw.latitude} BETWEEN ${center.lat - POOL_LAT_DEG} AND ${center.lat + POOL_LAT_DEG}
    AND ${placeSeedRaw.longitude} BETWEEN ${center.lng - lngDeg} AND ${center.lng + lngDeg}
    AND sqrt( power((${center.lat} - ${placeSeedRaw.latitude}) * 111320, 2)
            + power((${center.lng} - ${placeSeedRaw.longitude}) * 111320 * cos(radians((${center.lat} + ${placeSeedRaw.latitude}) / 2)), 2) ) <= ${POOL_RADIUS_M}
  ))`;
}

/** 중심좌표 + WHERE 조각 한 번에 (3 사용처 공통 보일러플레이트 제거)
 * ⚠️ 2026-07-17 사장님 SSOT = 기점 = 동적 출발점(숙소>도심). startCoords 주면 그 기점 100km(숙소가 중간인 이중도시 = 그 기점 공유),
 *   미지정 시에만 도시중심 폴백(getCityCenter). = day-builder accommodationCoords 우선순위(§16 재사용) 를 풀 반경에도 연장. */
export async function getPoolContext(
  cityId: number,
  startCoords?: { lat: number; lng: number } | null,
): Promise<{ center: { lat: number; lng: number } | null; where: SQL }> {
  const center = startCoords ?? (await getCityCenter(cityId));
  return { center, where: poolWhereSql(cityId, center) };
}

/**
 * 크로스도시 행 = 요청 도시 중심 기준 day_zone/distance 메모리 재계산 (DB 쓰기 없음).
 * = 자기도시 행 = 저장값 그대로(자기 도시 중심 기준 = 요청 도시 중심과 동일) = 미변경.
 */
export function recalcCrossCityZone(
  row: { cityId: number; latitude: any; longitude: any; dayZone?: any; distanceKmFromCenter?: any },
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
