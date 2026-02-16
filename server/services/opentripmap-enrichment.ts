/**
 * OpenTripMap API 동기화 (무료)
 * 좌표 + 장소명 → Wikipedia 기반 설명 → places.editorialSummary 보강
 * 
 * 날씨/환율처럼 정기 스케줄 + 대시보드 수동 동기화 지원
 */

import { db } from "../db";
import { places, cities, apiServiceStatus } from "@shared/schema";
import { eq, or, and, isNull, sql } from "drizzle-orm";

const OPENTRIPMAP_API_KEY = "5ae2e3f221c38a28845f05b6";
const MAX_PLACES_PER_RUN = 50;
const BATCH_DELAY_MS = 400;

async function fetchOpenTripMapDescription(lat: number, lng: number, placeName: string): Promise<string | null> {
  try {
    const radiusUrl = `https://api.opentripmap.com/0.1/en/places/radius?` +
      `radius=300&lon=${lng}&lat=${lat}&limit=3&format=json&apikey=${OPENTRIPMAP_API_KEY}`;
    
    const response = await fetch(radiusUrl);
    if (!response.ok) return null;
    
    const pois = await response.json();
    if (!Array.isArray(pois) || pois.length === 0) return null;
    
    let bestPoi = pois[0];
    for (const poi of pois) {
      if (poi.name && placeName.toLowerCase().includes(poi.name.toLowerCase())) {
        bestPoi = poi;
        break;
      }
    }
    
    if (!bestPoi.xid) return null;
    
    const detailUrl = `https://api.opentripmap.com/0.1/en/places/xid/${bestPoi.xid}?apikey=${OPENTRIPMAP_API_KEY}`;
    const detailResponse = await fetch(detailUrl);
    if (!detailResponse.ok) return null;
    
    const detail = await detailResponse.json();
    
    if (detail.wikipedia_extracts?.text) {
      return detail.wikipedia_extracts.text.substring(0, 500);
    }
    if (detail.info?.descr) {
      return detail.info.descr.substring(0, 500);
    }
    return null;
  } catch (e) {
    console.warn(`[OpenTripMap] fetch 실패 (${placeName}):`, e);
    return null;
  }
}

/**
 * 도시별 OpenTripMap 설명 보강 (runChainedCrawlers 연쇄용)
 */
export async function syncOpenTripMapForCity(cityId: number): Promise<{
  success: boolean;
  placesProcessed: number;
  descriptionsAdded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let placesProcessed = 0;
  let descriptionsAdded = 0;

  try {
    const toEnrich = await db
      .select({
        id: places.id,
        name: places.name,
        latitude: places.latitude,
        longitude: places.longitude,
        editorialSummary: places.editorialSummary,
      })
      .from(places)
      .where(
        and(
          eq(places.cityId, cityId),
          or(
            isNull(places.editorialSummary),
            sql`trim(COALESCE(${places.editorialSummary}, '')) = ''`
          )
        )
      )
      .limit(MAX_PLACES_PER_RUN);

    for (const place of toEnrich) {
      try {
        const lat = place.latitude ?? 0;
        const lng = place.longitude ?? 0;
        if (!lat || !lng) continue;

        const desc = await fetchOpenTripMapDescription(lat, lng, place.name);
        if (!desc) continue;

        await db
          .update(places)
          .set({ editorialSummary: desc, updatedAt: new Date() })
          .where(eq(places.id, place.id));

        placesProcessed++;
        descriptionsAdded++;
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      } catch (e) {
        errors.push(`${place.name}: ${(e as Error).message}`);
      }
    }

    return { success: errors.length === 0, placesProcessed, descriptionsAdded, errors };
  } catch (e) {
    return { success: false, placesProcessed: 0, descriptionsAdded: 0, errors: [(e as Error).message] };
  }
}

async function updateApiStatus(success: boolean, errorMsg?: string) {
  try {
    await db
      .update(apiServiceStatus)
      .set({
        lastCallAt: new Date(),
        lastSuccessAt: success ? new Date() : undefined,
        lastErrorAt: success ? undefined : new Date(),
        lastErrorMessage: errorMsg || null,
        isConfigured: true,
      })
      .where(eq(apiServiceStatus.serviceName, "opentripmap"));
  } catch (e) {
    console.error("[OpenTripMap] API 상태 업데이트 실패:", e);
  }
}

export async function syncOpenTripMapDescriptions(): Promise<{
  success: boolean;
  placesProcessed: number;
  descriptionsAdded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let placesProcessed = 0;
  let descriptionsAdded = 0;

  try {
    const toEnrich = await db
      .select({
        id: places.id,
        name: places.name,
        latitude: places.latitude,
        longitude: places.longitude,
        editorialSummary: places.editorialSummary,
      })
      .from(places)
      .innerJoin(cities, eq(places.cityId, cities.id))
      .where(
        or(
          isNull(places.editorialSummary),
          sql`trim(COALESCE(${places.editorialSummary}, '')) = ''`
        )
      )
      .limit(MAX_PLACES_PER_RUN);

    for (const place of toEnrich) {
      try {
        const lat = place.latitude ?? 0;
        const lng = place.longitude ?? 0;
        if (!lat || !lng) continue;

        const desc = await fetchOpenTripMapDescription(lat, lng, place.name);
        if (!desc) continue;

        await db
          .update(places)
          .set({ editorialSummary: desc, updatedAt: new Date() })
          .where(eq(places.id, place.id));

        placesProcessed++;
        descriptionsAdded++;
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      } catch (e) {
        errors.push(`${place.name}: ${(e as Error).message}`);
      }
    }

    await updateApiStatus(errors.length === 0);
    console.log(`[OpenTripMap] 동기화 완료: ${placesProcessed}곳, ${descriptionsAdded}개 설명 추가`);
    return {
      success: errors.length === 0,
      placesProcessed,
      descriptionsAdded,
      errors,
    };
  } catch (e) {
    const msg = (e as Error).message;
    await updateApiStatus(false, msg);
    return { success: false, placesProcessed: 0, descriptionsAdded: 0, errors: [msg] };
  }
}
