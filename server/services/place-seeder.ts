/**
 * 장소 시딩 시스템 (Place Seeder)
 * 
 * 3중 데이터 소스로 바이브별 장소를 DB에 사전 수집:
 * 1. Google Places API - 장소 기본정보 + 사진 + 리뷰수 + 가격대
 * 2. Wikimedia Commons API (무료) - 좌표 기반 고품질 CC 사진
 * 3. OpenTripMap API (무료) - Wikipedia 기반 장소 설명
 * 
 * 시딩 완료 후 기존 크롤러(TripAdvisor, Michelin, 가격, 포토스팟 등)가 자동 실행
 */

import { googlePlacesFetcher } from "./google-places";
import { storage } from "../storage";
import { db } from "../db";
import { cities, places, dataSyncLog } from "@shared/schema";
import { eq, sql, count, and, isNull, isNotNull } from "drizzle-orm";

// ============================================
// 바이브별 Google Places 타입 매핑
// ============================================
const VIBE_SEARCH_CONFIG: Record<string, { types: string[]; placeType: "restaurant" | "attraction" | "cafe" | "hotel" | "landmark" }[]> = {
  Hotspot: [
    { types: ["night_club"], placeType: "attraction" },
    { types: ["bar"], placeType: "attraction" },
    { types: ["shopping_mall"], placeType: "attraction" },
    { types: ["landmark"], placeType: "landmark" },
    { types: ["tourist_attraction"], placeType: "attraction" },
  ],
  Foodie: [
    { types: ["restaurant"], placeType: "restaurant" },
    { types: ["cafe"], placeType: "cafe" },
    { types: ["bakery"], placeType: "restaurant" },
    { types: ["meal_delivery"], placeType: "restaurant" },
    { types: ["food"], placeType: "restaurant" },
  ],
  Culture: [
    { types: ["museum"], placeType: "attraction" },
    { types: ["art_gallery"], placeType: "attraction" },
    { types: ["library"], placeType: "attraction" },
    { types: ["historical_landmark"], placeType: "landmark" },
    { types: ["church"], placeType: "landmark" },
  ],
  Healing: [
    { types: ["spa"], placeType: "attraction" },
    { types: ["park"], placeType: "attraction" },
    { types: ["natural_feature"], placeType: "attraction" },
    { types: ["botanical_garden"], placeType: "attraction" },
    { types: ["campground"], placeType: "attraction" },
  ],
  Adventure: [
    { types: ["tourist_attraction"], placeType: "attraction" },
    { types: ["hiking_area"], placeType: "attraction" },
    { types: ["amusement_park"], placeType: "attraction" },
    { types: ["zoo"], placeType: "attraction" },
    { types: ["aquarium"], placeType: "attraction" },
  ],
  Romantic: [
    { types: ["restaurant"], placeType: "restaurant" },
    { types: ["park"], placeType: "attraction" },
    { types: ["museum"], placeType: "attraction" },
    { types: ["art_gallery"], placeType: "attraction" },
    { types: ["performing_arts_theater"], placeType: "attraction" },
  ],
};

// ============================================
// Wikimedia Commons API (무료)
// ============================================
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
    
    // 파일 이름으로 실제 이미지 URL 가져오기
    const titles = pages.map((p: any) => p.title).join("|");
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?` +
      `action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`;
    
    const imgResponse = await fetch(imageInfoUrl);
    if (!imgResponse.ok) return [];
    
    const imgData = await imgResponse.json();
    const imagePages = imgData?.query?.pages || {};
    
    const urls: string[] = [];
    for (const pageId of Object.keys(imagePages)) {
      const imageInfo = imagePages[pageId]?.imageinfo?.[0];
      if (imageInfo?.thumburl) {
        urls.push(imageInfo.thumburl);
      } else if (imageInfo?.url) {
        urls.push(imageInfo.url);
      }
    }
    
    return urls;
  } catch (error) {
    console.warn(`[PlaceSeeder] Wikimedia 사진 가져오기 실패 (${lat},${lng}):`, error);
    return [];
  }
}

// ============================================
// OpenTripMap API (무료)
// ============================================
const OPENTRIPMAP_API_KEY = "5ae2e3f221c38a28845f05b6"; // 공개 데모 키 (무료)

async function fetchOpenTripMapDescription(lat: number, lng: number, placeName: string): Promise<string | null> {
  try {
    // 1단계: 좌표 근처 POI 검색
    const radiusUrl = `https://api.opentripmap.com/0.1/en/places/radius?` +
      `radius=300&lon=${lng}&lat=${lat}&limit=3&format=json&apikey=${OPENTRIPMAP_API_KEY}`;
    
    const response = await fetch(radiusUrl);
    if (!response.ok) return null;
    
    const pois = await response.json();
    if (!Array.isArray(pois) || pois.length === 0) return null;
    
    // 이름이 가장 비슷한 POI 선택 (또는 첫 번째)
    let bestPoi = pois[0];
    for (const poi of pois) {
      if (poi.name && placeName.toLowerCase().includes(poi.name.toLowerCase())) {
        bestPoi = poi;
        break;
      }
    }
    
    if (!bestPoi.xid) return null;
    
    // 2단계: POI 상세 정보 가져오기 (Wikipedia 설명 포함)
    const detailUrl = `https://api.opentripmap.com/0.1/en/places/xid/${bestPoi.xid}?apikey=${OPENTRIPMAP_API_KEY}`;
    const detailResponse = await fetch(detailUrl);
    if (!detailResponse.ok) return null;
    
    const detail = await detailResponse.json();
    
    // Wikipedia 설명 추출
    if (detail.wikipedia_extracts?.text) {
      return detail.wikipedia_extracts.text.substring(0, 500); // 500자 제한
    }
    if (detail.info?.descr) {
      return detail.info.descr.substring(0, 500);
    }
    
    return null;
  } catch (error) {
    console.warn(`[PlaceSeeder] OpenTripMap 설명 가져오기 실패 (${placeName}):`, error);
    return null;
  }
}

// ============================================
// 딜레이 유틸리티
// ============================================
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 메인 시딩 클래스
// ============================================
export class PlaceSeeder {
  private isRunning: boolean = false;
  private currentCity: string = "";
  private progress: { total: number; completed: number; current: string } = { total: 0, completed: 0, current: "" };

  /**
   * 단일 도시 시딩: Google Places + Wikimedia + OpenTripMap
   */
  async seedCityPlaces(cityId: number): Promise<{ success: boolean; seeded: number; skipped: number; errors: string[] }> {
    const city = await db.select().from(cities).where(eq(cities.id, cityId)).then(r => r[0]);
    if (!city) {
      return { success: false, seeded: 0, skipped: 0, errors: [`도시 ID ${cityId} 없음`] };
    }

    console.log(`\n[PlaceSeeder] ===== ${city.name} (${city.country}) 시딩 시작 =====`);
    this.currentCity = city.name;
    
    let totalSeeded = 0;
    let totalSkipped = 0;
    const errors: string[] = [];
    const seenGoogleIds = new Set<string>();

    // 6개 바이브별 검색
    for (const [vibe, searches] of Object.entries(VIBE_SEARCH_CONFIG)) {
      console.log(`[PlaceSeeder] ${city.name} - ${vibe} 카테고리 검색 중...`);
      
      for (const search of searches) {
        try {
          // Google Places Nearby Search
          const googlePlaces = await googlePlacesFetcher.searchNearby(
            city.latitude,
            city.longitude,
            search.placeType === "landmark" ? "attraction" : search.placeType,
            8000 // 8km 반경
          );
          
          console.log(`[PlaceSeeder]   ${vibe}/${search.types[0]}: ${googlePlaces.length}개 발견`);
          
          for (const gPlace of googlePlaces) {
            // 중복 스킵
            if (seenGoogleIds.has(gPlace.id)) {
              totalSkipped++;
              continue;
            }
            seenGoogleIds.add(gPlace.id);
            
            // DB에 이미 있는지 확인
            const existing = await storage.getPlaceByGoogleId(gPlace.id);
            if (existing) {
              // 이미 있으면 vibeKeywords만 업데이트
              await this.updateVibeKeywords(existing.id, vibe);
              totalSkipped++;
              continue;
            }
            
            try {
              // Google Places 상세 정보 가져오기
              const details = await googlePlacesFetcher.getPlaceDetails(gPlace.id);
              
              // DB에 저장 (기존 fetchAndStorePlace 활용)
              const placeId = await googlePlacesFetcher.fetchAndStorePlace(
                details,
                cityId,
                search.placeType
              );
              
              // vibeKeywords 업데이트
              await this.updateVibeKeywords(placeId, vibe);
              
              // Wikimedia 사진 보강 (무료)
              try {
                const wikiPhotos = await fetchWikimediaPhotos(
                  gPlace.location.latitude,
                  gPlace.location.longitude,
                  3
                );
                if (wikiPhotos.length > 0) {
                  await this.appendPhotoUrls(placeId, wikiPhotos);
                }
              } catch (e) { /* 무시 - 보조 데이터 */ }
              
              // OpenTripMap 설명 보강 (무료)
              try {
                const description = await fetchOpenTripMapDescription(
                  gPlace.location.latitude,
                  gPlace.location.longitude,
                  gPlace.displayName?.text || ""
                );
                if (description) {
                  await this.updateDescription(placeId, description);
                }
              } catch (e) { /* 무시 - 보조 데이터 */ }
              
              totalSeeded++;
              
              // Rate limit 방지
              await delay(200);
              
            } catch (error: any) {
              errors.push(`${gPlace.displayName?.text || gPlace.id}: ${error.message}`);
              console.warn(`[PlaceSeeder]   실패: ${gPlace.displayName?.text}`, error.message);
            }
          }
          
          // 검색 간 딜레이
          await delay(300);
          
        } catch (error: any) {
          errors.push(`${vibe}/${search.types[0]}: ${error.message}`);
          console.warn(`[PlaceSeeder]   검색 실패: ${vibe}/${search.types[0]}`, error.message);
        }
      }
    }

    // 시딩 결과 로그
    await storage.logDataSync({
      entityType: "place_seed",
      entityId: cityId,
      source: "google_wiki_otm",
      status: errors.length === 0 ? "success" : "partial",
      itemsProcessed: totalSeeded,
      itemsFailed: errors.length,
      completedAt: new Date(),
      errorMessage: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
    });

    console.log(`[PlaceSeeder] ===== ${city.name} 시딩 완료: ${totalSeeded}개 저장, ${totalSkipped}개 스킵, ${errors.length}개 오류 =====\n`);
    
    return { success: true, seeded: totalSeeded, skipped: totalSkipped, errors };
  }

  /**
   * 여러 도시 순차 시딩
   */
  async seedBatchCities(cityIds: number[]): Promise<{ totalSeeded: number; citiesProcessed: number; errors: string[] }> {
    let totalSeeded = 0;
    let citiesProcessed = 0;
    const allErrors: string[] = [];

    for (const cityId of cityIds) {
      try {
        const result = await this.seedCityPlaces(cityId);
        totalSeeded += result.seeded;
        citiesProcessed++;
        allErrors.push(...result.errors.slice(0, 3));
        
        // 도시 간 딜레이
        await delay(1000);
      } catch (error: any) {
        allErrors.push(`cityId ${cityId}: ${error.message}`);
        console.error(`[PlaceSeeder] 도시 ${cityId} 시딩 실패:`, error);
      }
    }

    return { totalSeeded, citiesProcessed, errors: allErrors };
  }

  /**
   * 시딩 안 된 도시 자동 처리 (연쇄 실행)
   * - 시딩 완료 후 기존 크롤러도 연쇄 실행
   */
  async seedAllPendingCities(): Promise<{ totalSeeded: number; citiesProcessed: number }> {
    if (this.isRunning) {
      console.log("[PlaceSeeder] 이미 시딩 진행 중...");
      return { totalSeeded: 0, citiesProcessed: 0 };
    }

    this.isRunning = true;
    let totalSeeded = 0;
    let citiesProcessed = 0;

    try {
      // 모든 도시 가져오기
      const allCities = await db.select().from(cities);
      
      // 이미 시딩된 도시 확인 (dataSyncLog에서 place_seed 성공 기록)
      const seededLogs = await db.select({ entityId: dataSyncLog.entityId })
        .from(dataSyncLog)
        .where(and(
          eq(dataSyncLog.entityType, "place_seed"),
          eq(dataSyncLog.status, "success")
        ));
      
      const seededCityIds = new Set(seededLogs.map(l => l.entityId).filter(Boolean));
      
      // 시딩 안 된 도시 필터링
      const pendingCitiesRaw = allCities.filter(c => !seededCityIds.has(c.id));
      
      if (pendingCitiesRaw.length === 0) {
        console.log("[PlaceSeeder] 모든 도시 시딩 완료됨");
        this.isRunning = false;
        return { totalSeeded: 0, citiesProcessed: 0 };
      }

      // ★ 1차 목표 우선순위 정렬: 유럽5개 → 프랑스30개 → 유럽30개 → 나머지
      const PRIORITY_EURO5 = ["파리", "런던", "로마", "바르셀로나", "프라하"];
      const pendingCities = pendingCitiesRaw.sort((a, b) => {
        const getPriority = (city: typeof a) => {
          // 1순위: 유럽 핵심 5개 도시
          const euro5idx = PRIORITY_EURO5.indexOf(city.name);
          if (euro5idx >= 0) return euro5idx;
          // 2순위: 프랑스 도시 (countryCode FR)
          if (city.countryCode === "FR") return 100;
          // 3순위: 유럽 도시 (timezone이 Europe/)
          if (city.timezone?.startsWith("Europe/")) return 200;
          // 4순위: 나머지
          return 300;
        };
        return getPriority(a) - getPriority(b);
      });

      this.progress = { total: pendingCities.length, completed: 0, current: "" };
      const euro5Pending = pendingCities.filter(c => PRIORITY_EURO5.includes(c.name)).map(c => c.name);
      const francePending = pendingCities.filter(c => c.countryCode === "FR" && !PRIORITY_EURO5.includes(c.name)).map(c => c.name);
      const euroPending = pendingCities.filter(c => c.timezone?.startsWith("Europe/") && c.countryCode !== "FR" && !PRIORITY_EURO5.includes(c.name)).map(c => c.name);
      console.log(`[PlaceSeeder] ★ 시딩 우선순위:`);
      console.log(`  1순위 유럽5: ${euro5Pending.length > 0 ? euro5Pending.join(", ") : "✅ 완료"}`);
      console.log(`  2순위 프랑스30: ${francePending.length > 0 ? francePending.length + "개 대기" : "✅ 완료"}`);
      console.log(`  3순위 유럽30: ${euroPending.length > 0 ? euroPending.length + "개 대기" : "✅ 완료"}`);
      console.log(`  총 대기: ${pendingCities.length}개`);

      for (const city of pendingCities) {
        this.progress.current = city.name;
        console.log(`\n[PlaceSeeder] === [${this.progress.completed + 1}/${this.progress.total}] ${city.name} 시작 ===`);
        
        try {
          // 1단계: 장소 시딩
          const seedResult = await this.seedCityPlaces(city.id);
          totalSeeded += seedResult.seeded;
          
          citiesProcessed++;
          this.progress.completed++;
          
          console.log(`[PlaceSeeder] === [${this.progress.completed}/${this.progress.total}] ${city.name} 시딩 완료 (${seedResult.seeded}개) ===`);
          
          // 2단계: 즉시 연쇄 크롤러 실행 (도시별 - 시딩 직후 바로 보강)
          if (seedResult.seeded > 0) {
            console.log(`[PlaceSeeder] 🔄 ${city.name} - 연쇄 크롤러 즉시 시작...`);
            try {
              await this.runChainedCrawlers(city.id, city.name);
              console.log(`[PlaceSeeder] ✅ ${city.name} - 시딩+크롤러 완전 완료!`);
            } catch (crawlError: any) {
              console.warn(`[PlaceSeeder] ${city.name} 크롤러 일부 실패 (시딩은 성공):`, crawlError.message);
            }
          }
          
          await delay(500);
          
        } catch (error: any) {
          console.error(`[PlaceSeeder] ${city.name} 처리 실패:`, error.message);
          this.progress.completed++;
        }
      }

      // ★ 전체 완료!
      console.log(`\n[PlaceSeeder] ★★★ 전체 시딩+크롤러 완료: ${citiesProcessed}개 도시, ${totalSeeded}개 장소 ★★★`);

    } finally {
      this.isRunning = false;
    }

    return { totalSeeded, citiesProcessed };
  }

  /**
   * 시딩 완료된 도시에 대해 기존 크롤러 연쇄 실행
   * TripAdvisor -> Michelin -> 가격 -> 포토스팟 -> 한국플랫폼 -> 패키지투어
   */
  private async runChainedCrawlers(cityId: number, cityName: string): Promise<void> {
    console.log(`[PlaceSeeder] ${cityName} - 크롤러 연쇄 실행 시작...`);
    
    // 해당 도시의 장소 수 확인
    const cityPlaces = await storage.getPlacesByCity(cityId);
    if (cityPlaces.length === 0) {
      console.log(`[PlaceSeeder] ${cityName} - 장소 없음, 크롤러 스킵`);
      return;
    }
    
    console.log(`[PlaceSeeder] ${cityName} - ${cityPlaces.length}개 장소에 대해 크롤러 실행`);

    // 1. TripAdvisor
    try {
      const { crawlTripAdvisorForCity } = await import("./tripadvisor-crawler");
      const result = await crawlTripAdvisorForCity(cityId);
      console.log(`[PlaceSeeder]   ✓ TripAdvisor: ${result?.collected || 0}개 처리`);
    } catch (e: any) {
      console.warn(`[PlaceSeeder]   ✗ TripAdvisor 실패:`, e.message);
    }
    await delay(1000);

    // 2. Michelin (레스토랑/카페만)
    try {
      const { crawlMichelinForCity } = await import("./michelin-crawler");
      const result = await crawlMichelinForCity(cityId);
      console.log(`[PlaceSeeder]   ✓ Michelin: ${result?.collected || 0}개 처리`);
    } catch (e: any) {
      console.warn(`[PlaceSeeder]   ✗ Michelin 실패:`, e.message);
    }
    await delay(1000);

    // 3. 가격 크롤러
    try {
      const { crawlPricesForCity } = await import("./price-crawler");
      const result = await crawlPricesForCity(cityId);
      console.log(`[PlaceSeeder]   ✓ 가격: ${result?.pricesCollected || 0}개 처리`);
    } catch (e: any) {
      console.warn(`[PlaceSeeder]   ✗ 가격 크롤러 실패:`, e.message);
    }
    await delay(1000);

    // 4. 포토스팟
    try {
      const { scorePhotospotsForCity } = await import("./photospot-scorer");
      const result = await scorePhotospotsForCity(cityId);
      console.log(`[PlaceSeeder]   ✓ 포토스팟: ${result?.scored || 0}개 처리`);
    } catch (e: any) {
      console.warn(`[PlaceSeeder]   ✗ 포토스팟 실패:`, e.message);
    }
    await delay(1000);

    // 5. 한국 플랫폼
    try {
      const { crawlKoreanPlatformsForCity } = await import("./korean-platform-crawler");
      const result = await crawlKoreanPlatformsForCity(cityId);
      console.log(`[PlaceSeeder]   ✓ 한국플랫폼: ${result?.collected || 0}개 처리`);
    } catch (e: any) {
      console.warn(`[PlaceSeeder]   ✗ 한국플랫폼 실패:`, e.message);
    }
    await delay(1000);

    // 6. 패키지 투어
    try {
      const { validatePackageToursForCity } = await import("./package-tour-validator");
      const result = await validatePackageToursForCity(cityId);
      console.log(`[PlaceSeeder]   ✓ 패키지투어: ${result?.validated || 0}개 처리`);
    } catch (e: any) {
      console.warn(`[PlaceSeeder]   ✗ 패키지투어 실패:`, e.message);
    }

    console.log(`[PlaceSeeder] ${cityName} - 크롤러 연쇄 실행 완료`);
  }

  /**
   * vibeKeywords 업데이트 (기존 키워드에 추가)
   */
  private async updateVibeKeywords(placeId: number, vibe: string): Promise<void> {
    try {
      const [place] = await db.select({ vibeKeywords: places.vibeKeywords })
        .from(places).where(eq(places.id, placeId));
      
      const currentKeywords = (place?.vibeKeywords as string[]) || [];
      if (!currentKeywords.includes(vibe)) {
        currentKeywords.push(vibe);
        await db.update(places)
          .set({ vibeKeywords: currentKeywords, updatedAt: new Date() })
          .where(eq(places.id, placeId));
      }
    } catch (e) { /* 무시 */ }
  }

  /**
   * Wikimedia 사진 URL 추가
   */
  private async appendPhotoUrls(placeId: number, newUrls: string[]): Promise<void> {
    try {
      const [place] = await db.select({ photoUrls: places.photoUrls })
        .from(places).where(eq(places.id, placeId));
      
      const currentUrls = (place?.photoUrls as string[]) || [];
      const combined = [...currentUrls, ...newUrls].slice(0, 15); // 최대 15장
      
      await db.update(places)
        .set({ photoUrls: combined, updatedAt: new Date() })
        .where(eq(places.id, placeId));
    } catch (e) { /* 무시 */ }
  }

  /**
   * OpenTripMap 설명 업데이트 (기존 설명 없을 때만)
   */
  private async updateDescription(placeId: number, description: string): Promise<void> {
    try {
      const [place] = await db.select({ editorialSummary: places.editorialSummary })
        .from(places).where(eq(places.id, placeId));
      
      if (!place?.editorialSummary) {
        await db.update(places)
          .set({ editorialSummary: description, updatedAt: new Date() })
          .where(eq(places.id, placeId));
      }
    } catch (e) { /* 무시 */ }
  }

  /**
   * 시딩 현황 조회
   */
  async getSeedingStatus(): Promise<{
    totalCities: number;
    seededCities: number;
    pendingCities: number;
    totalPlaces: number;
    isRunning: boolean;
    currentCity: string;
    progress: { total: number; completed: number; current: string };
    cityDetails: { id: number; name: string; country: string; placeCount: number; isSeeded: boolean }[];
  }> {
    // 전체 도시
    const allCities = await db.select().from(cities);
    
    // 시딩 완료 도시
    const seededLogs = await db.select({ entityId: dataSyncLog.entityId })
      .from(dataSyncLog)
      .where(and(
        eq(dataSyncLog.entityType, "place_seed"),
        eq(dataSyncLog.status, "success")
      ));
    const seededCityIds = new Set(seededLogs.map(l => l.entityId).filter(Boolean));
    
    // 도시별 장소 수
    const placeCounts = await db.select({
      cityId: places.cityId,
      count: count(),
    }).from(places).groupBy(places.cityId);
    
    const placeCountMap = new Map(placeCounts.map(p => [p.cityId, p.count]));
    
    // 전체 장소 수
    const [totalResult] = await db.select({ total: count() }).from(places);
    
    const cityDetails = allCities.map(c => ({
      id: c.id,
      name: c.name,
      country: c.country,
      placeCount: placeCountMap.get(c.id) || 0,
      isSeeded: seededCityIds.has(c.id),
    }));

    return {
      totalCities: allCities.length,
      seededCities: seededCityIds.size,
      pendingCities: allCities.length - seededCityIds.size,
      totalPlaces: totalResult.total,
      isRunning: this.isRunning,
      currentCity: this.currentCity,
      progress: this.progress,
      cityDetails,
    };
  }
}

export const placeSeeder = new PlaceSeeder();
