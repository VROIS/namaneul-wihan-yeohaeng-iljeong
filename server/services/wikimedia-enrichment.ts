/**
 * Wikimedia Commons API 동기화 (무료)
 * 좌표 기반 CC(크리에이티브 커먼즈) 고품질 사진 → places.photoUrls 보강
 * 
 * 날씨/환율처럼 정기 스케줄 + 대시보드 수동 동기화 지원
 */

import { db } from "../db";
import { places, cities, apiServiceStatus } from "@shared/schema";
import { eq, or, and, sql, isNull } from "drizzle-orm";

const MAX_PLACES_PER_RUN = 50;
const BATCH_DELAY_MS = 300;

async function fetchWikimediaPhotos(lat: number, lng: number, limit: number = 5): Promise<string[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?` +
      `action=query&list=geosearch&gsprimary=all&gsnamespace=6` +
      `&gsradius=500&gscoord=${lat}|${lng}&gslimit=${limit}&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    const pages = data?.query?.geosearch || [];
    if (pages.length === 0) return [];
    
    const titles = pages.map((p: any) => p.title).join("|");
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?` +
      `action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`;
    
    const imgResponse = await fetch(imageInfoUrl);
    if (!imgResponse.ok) return [];
    
    const imgData = await imgResponse.json();
    const imagePages = imgData?.query?.pages;
    const urls: string[] = [];
    if (imagePages == null || typeof imagePages !== "object") return urls;
    for (const pageId of Object.keys(imagePages)) {
      const imageInfo = imagePages[pageId]?.imageinfo?.[0];
      if (imageInfo?.thumburl) urls.push(imageInfo.thumburl);
      else if (imageInfo?.url) urls.push(imageInfo.url);
    }
    return urls;
  } catch (e) {
    console.warn(`[Wikimedia] fetch 실패 (${lat},${lng}):`, e);
    return [];
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
      .where(eq(apiServiceStatus.serviceName, "wikimedia_commons"));
  } catch (e) {
    console.error("[Wikimedia] API 상태 업데이트 실패:", e);
  }
}

/**
 * 도시별 Wikimedia 사진 보강 (runChainedCrawlers 연쇄용)
 */
export async function syncWikimediaForCity(cityId: number): Promise<{
  success: boolean;
  placesProcessed: number;
  photosAdded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let placesProcessed = 0;
  let photosAdded = 0;

  try {
    const toEnrich = await db
      .select({
        id: places.id,
        name: places.name,
        latitude: places.latitude,
        longitude: places.longitude,
        photoUrls: places.photoUrls,
      })
      .from(places)
      .where(
        and(
          eq(places.cityId, cityId),
          or(
            isNull(places.photoUrls),
            sql`jsonb_array_length(COALESCE(${places.photoUrls}, '[]'::jsonb)) < 2`
          )
        )
      )
      .limit(MAX_PLACES_PER_RUN);

    for (const place of toEnrich) {
      try {
        const lat = place.latitude ?? 0;
        const lng = place.longitude ?? 0;
        if (!lat || !lng) continue;

        const wikiUrls = await fetchWikimediaPhotos(lat, lng, 5);
        if (wikiUrls.length === 0) continue;

        const current = (place.photoUrls as string[]) || [];
        const combined = [...current, ...wikiUrls].slice(0, 15);

        await db!
          .update(places)
          .set({ photoUrls: combined, updatedAt: new Date() })
          .where(eq(places.id, place.id));

        placesProcessed++;
        photosAdded += Math.min(wikiUrls.length, 15 - current.length);
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      } catch (e) {
        errors.push(`${place.name}: ${(e as Error).message}`);
      }
    }

    return { success: errors.length === 0, placesProcessed, photosAdded, errors };
  } catch (e) {
    return { success: false, placesProcessed: 0, photosAdded: 0, errors: [(e as Error).message] };
  }
}

export async function syncWikimediaPhotos(cityId?: number): Promise<{
  success: boolean;
  placesProcessed: number;
  photosAdded: number;
  errors: string[];
}> {
  if (cityId != null) {
    const r = await syncWikimediaForCity(cityId);
    try {
      await updateApiStatus(r.errors.length === 0);
    } catch (_) {}
    return r;
  }

  const errors: string[] = [];
  let placesProcessed = 0;
  let photosAdded = 0;

  try {
    const toEnrich = await db
      .select({
        id: places.id,
        name: places.name,
        latitude: places.latitude,
        longitude: places.longitude,
        photoUrls: places.photoUrls,
      })
      .from(places)
      .innerJoin(cities, eq(places.cityId, cities.id))
      .where(
        or(
          isNull(places.photoUrls),
          sql`jsonb_array_length(COALESCE(${places.photoUrls}, '[]'::jsonb)) < 2`
        )
      )
      .limit(MAX_PLACES_PER_RUN);

    for (const place of toEnrich) {
      try {
        const lat = place.latitude ?? 0;
        const lng = place.longitude ?? 0;
        if (!lat || !lng) continue;

        const wikiUrls = await fetchWikimediaPhotos(lat, lng, 5);
        if (wikiUrls.length === 0) continue;

        const current = (place.photoUrls as string[]) || [];
        const combined = [...current, ...wikiUrls].slice(0, 15);

        await db
          .update(places)
          .set({ photoUrls: combined, updatedAt: new Date() })
          .where(eq(places.id, place.id));

        placesProcessed++;
        photosAdded += Math.min(wikiUrls.length, 15 - current.length);
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      } catch (e) {
        errors.push(`${place.name}: ${(e as Error).message}`);
      }
    }

    await updateApiStatus(errors.length === 0);
    console.log(`[Wikimedia] 동기화 완료: ${placesProcessed}곳, ${photosAdded}장 사진 추가`);
    return {
      success: errors.length === 0,
      placesProcessed,
      photosAdded,
      errors,
    };
  } catch (e) {
    const msg = (e as Error).message;
    await updateApiStatus(false, msg);
    return { success: false, placesProcessed: 0, photosAdded: 0, errors: [msg] };
  }
}
