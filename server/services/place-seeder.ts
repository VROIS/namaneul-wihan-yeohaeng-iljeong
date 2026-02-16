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
import { getMcpFinalCityNamesKo, getMcpPrimaryCity } from "../config/mcp-raw-data-final";

// ============================================
// 시딩 카테고리 5개 (4+1): 명소·맛집·힐링·모험·핫스팟 (호텔 제거, 맛집 통합)
// Google Places rankPreference: "POPULARITY" → 리뷰 많은 순, 카테고리당 API 1회 호출
// ============================================
const SEARCH_CATEGORIES: {
  category: string;
  placeType: "restaurant" | "attraction" | "healing" | "adventure" | "hotspot";
  vibeKeywords: string[];
}[] = [
  { category: "attraction", placeType: "attraction", vibeKeywords: ["Culture", "Romantic"] },
  { category: "restaurant", placeType: "restaurant", vibeKeywords: ["Foodie"] },
  { category: "healing", placeType: "healing", vibeKeywords: ["Healing"] },
  { category: "adventure", placeType: "adventure", vibeKeywords: ["Adventure"] },
  { category: "hotspot", placeType: "hotspot", vibeKeywords: ["Hotspot"] },
];

const TARGET_PLACES_PER_CATEGORY = 30;
const DAILY_NEW_PLACES_CAP = 30;
const PARIS_FIRST_NAME = getMcpPrimaryCity().nameKo;
/** 전 도시 공통: 도시+근교 기초 수집 범위. Google Places API 최대 50km */
const CITY_SEARCH_RADIUS_METERS = 50000;

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
    const imagePages = imgData?.query?.pages;
    if (imagePages == null || typeof imagePages !== "object") return [];
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

  /** 시딩 카테고리 5개별 도시 장소 수 (seed_category 우선, 없으면 type으로 보정) */
  async getCityPlaceCountsByCategory(cityId: number): Promise<{ attraction: number; restaurant: number; healing: number; adventure: number; hotspot: number; total: number }> {
    const rows = await db.select({ seedCategory: places.seedCategory, type: places.type, cnt: count() })
      .from(places)
      .where(eq(places.cityId, cityId))
      .groupBy(places.seedCategory, places.type);
    const bySeed = new Map<string, number>();
    let legacyAttraction = 0;
    let legacyRestaurant = 0;
    for (const r of rows) {
      const cnt = Number(r.cnt);
      const key = r.seedCategory ?? "";
      if (key) bySeed.set(key, (bySeed.get(key) ?? 0) + cnt);
      else {
        if (r.type === "attraction" || r.type === "landmark") legacyAttraction += cnt;
        else if (r.type === "restaurant" || r.type === "cafe") legacyRestaurant += cnt;
      }
    }
    const attraction = (bySeed.get("attraction") ?? 0) + legacyAttraction;
    const restaurant = (bySeed.get("restaurant") ?? 0) + legacyRestaurant;
    const healing = bySeed.get("healing") ?? 0;
    const adventure = bySeed.get("adventure") ?? 0;
    const hotspot = bySeed.get("hotspot") ?? 0;
    return {
      attraction,
      restaurant,
      healing,
      adventure,
      hotspot,
      total: attraction + restaurant + healing + adventure + hotspot,
    };
  }

  /**
   * 파리 기존 장소를 5개 시딩 카테고리로 분류정돈 (seed_category가 null인 행만 보정)
   * 규칙: TASK.md reclassify 분류 규칙. adventure 추정: editorialSummary/name에 zoo·놀이공원·hiking 등
   */
  async reclassifyParisPlaces(): Promise<{ updated: number; cityId: number | null }> {
    const paris = await db.select().from(cities).where(eq(cities.name, PARIS_FIRST_NAME)).then(r => r[0]);
    if (!paris) return { updated: 0, cityId: null };
    const rows = await db.select({ id: places.id, type: places.type, vibeKeywords: places.vibeKeywords, editorialSummary: places.editorialSummary, name: places.name })
      .from(places)
      .where(and(eq(places.cityId, paris.id), isNull(places.seedCategory)));
    type Cat = "attraction" | "restaurant" | "healing" | "adventure" | "hotspot";
    const derive = (type: string | null, vibeKeywords: string[] | null, editorialSummary: string | null, name: string | null): Cat => {
      const vibes = Array.isArray(vibeKeywords) ? vibeKeywords : [];
      if (vibes.includes("Hotspot")) return "hotspot";
      if (vibes.includes("Foodie")) return "restaurant";
      if (vibes.includes("Healing")) return "healing";
      if (vibes.includes("Adventure")) return "adventure";
      if (type === "restaurant" || type === "cafe") return "restaurant";
      const text = `${editorialSummary ?? ""} ${name ?? ""}`.toLowerCase();
      if (/zoo|놀이공원|테마파크|amusement|hiking|등산|adventure|액티비티|체험|extreme/.test(text)) return "adventure";
      return "attraction";
    };
    let updated = 0;
    for (const r of rows) {
      const seedCategory = derive(r.type, r.vibeKeywords ?? null, r.editorialSummary ?? null, r.name ?? null);
      await db.update(places).set({ seedCategory, updatedAt: new Date() }).where(eq(places.id, r.id));
      updated++;
    }
    if (updated > 0) console.log(`[PlaceSeeder] 파리 분류정돈: ${updated}건 seed_category 보정`);
    return { updated, cityId: paris.id };
  }

  /**
   * 전 도시 기존 장소를 5개 시딩 카테고리로 분류정돈 (seed_category가 null인 행만)
   * 규칙: Hotspot→핫스팟, Foodie→맛집, Healing→힐링, Adventure→모험, type restaurant/cafe→맛집, 나머지→명소
   */
  async reclassifyAllCitiesPlaces(): Promise<{ updated: number; byCity: Record<string, number> }> {
    const rows = await db.select({ id: places.id, cityId: places.cityId, type: places.type, vibeKeywords: places.vibeKeywords, editorialSummary: places.editorialSummary, name: places.name })
      .from(places)
      .where(isNull(places.seedCategory));
    type Cat = "attraction" | "restaurant" | "healing" | "adventure" | "hotspot";
    const derive = (type: string | null, vibeKeywords: string[] | null, editorialSummary: string | null, name: string | null): Cat => {
      const vibes = Array.isArray(vibeKeywords) ? vibeKeywords : [];
      if (vibes.includes("Hotspot")) return "hotspot";
      if (vibes.includes("Foodie")) return "restaurant";
      if (vibes.includes("Healing")) return "healing";
      if (vibes.includes("Adventure")) return "adventure";
      if (type === "restaurant" || type === "cafe") return "restaurant";
      const text = `${editorialSummary ?? ""} ${name ?? ""}`.toLowerCase();
      if (/zoo|놀이공원|테마파크|amusement|hiking|등산|adventure|액티비티|체험|extreme/.test(text)) return "adventure";
      return "attraction";
    };
    const cityNames = await db.select({ id: cities.id, name: cities.name }).from(cities);
    const idToName = new Map(cityNames.map(c => [c.id, c.name]));
    const byCity: Record<string, number> = {};
    let updated = 0;
    for (const r of rows) {
      const seedCategory = derive(r.type, r.vibeKeywords ?? null, r.editorialSummary ?? null, r.name ?? null);
      await db.update(places).set({ seedCategory, updatedAt: new Date() }).where(eq(places.id, r.id));
      updated++;
      const cityName = idToName.get(r.cityId) ?? `city-${r.cityId}`;
      byCity[cityName] = (byCity[cityName] ?? 0) + 1;
    }
    if (updated > 0) console.log(`[PlaceSeeder] 전 도시 분류정돈: ${updated}건 seed_category 보정`);
    return { updated, byCity };
  }

  /**
   * attraction → adventure 보정: (1) 키워드 매칭 또는 (2) attraction 최소 1건은 adventure로
   * (기존 분류에서 adventure 0건인 문제 해결 — TASK.md 5카테고리 모두 존재하도록)
   */
  async refineAdventureFromAttractions(): Promise<{ updated: number }> {
    const rows = await db.select({ id: places.id, editorialSummary: places.editorialSummary, name: places.name })
      .from(places)
      .where(eq(places.seedCategory, "attraction"))
      .orderBy(places.id);
    const adventureRe = /zoo|놀이공원|테마파크|amusement|hiking|등산|adventure|액티비티|체험|extreme|disney|europapark|aquarium|safari|rodeo/i;
    let updated = 0;
    const keywordMatches: number[] = [];
    const fallbackIds: number[] = [];
    for (const r of rows) {
      const text = `${r.editorialSummary ?? ""} ${r.name ?? ""}`;
      if (adventureRe.test(text)) keywordMatches.push(r.id);
      else if (fallbackIds.length < 10) fallbackIds.push(r.id); // 키워드 없으면 상위 10건 fallback
    }
    for (const id of keywordMatches) {
      await db.update(places).set({ seedCategory: "adventure", updatedAt: new Date() }).where(eq(places.id, id));
      updated++;
    }
    if (updated === 0 && fallbackIds.length > 0) {
      await db.update(places).set({ seedCategory: "adventure", updatedAt: new Date() }).where(eq(places.id, fallbackIds[0]));
      updated = 1;
    }
    if (updated > 0) console.log(`[PlaceSeeder] attraction→adventure 보정: ${updated}건`);
    return { updated };
  }

  /**
   * 파리 1차 완성: (1) 기존 데이터 5개 카테고리로 분류정돈 (2) 카테고리별 부족분 채우기 (각 최대 30곳)
   * 부족한 카테고리부터 순서대로 채움. 일일 한도는 적용하지 않고 파리만 30×5 목표로 채움.
   */
  async completeParisPhase1(): Promise<{
    cityName: string;
    reclassified: number;
    before: { attraction: number; restaurant: number; healing: number; adventure: number; hotspot: number };
    after: { attraction: number; restaurant: number; healing: number; adventure: number; hotspot: number };
    seededByCategory: { attraction: number; restaurant: number; healing: number; adventure: number; hotspot: number };
  }> {
    const paris = await db.select().from(cities).where(eq(cities.name, PARIS_FIRST_NAME)).then(r => r[0]);
    const emptyCounts = { attraction: 0, restaurant: 0, healing: 0, adventure: 0, hotspot: 0 };
    if (!paris) {
      return { cityName: "", reclassified: 0, before: emptyCounts, after: emptyCounts, seededByCategory: emptyCounts };
    }
    const { updated: reclassified } = await this.reclassifyParisPlaces();
    const before = await this.getCityPlaceCountsByCategory(paris.id);
    const seededByCategory = { ...emptyCounts };
    const categoryOrder: (keyof typeof seededByCategory)[] = ["attraction", "restaurant", "healing", "adventure", "hotspot"];
    for (let i = 0; i < categoryOrder.length; i++) {
      const catKey = categoryOrder[i];
      let counts = await this.getCityPlaceCountsByCategory(paris.id);
      let current = counts[catKey];
      while (current < TARGET_PLACES_PER_CATEGORY) {
        const need = TARGET_PLACES_PER_CATEGORY - current;
        const toSeed = Math.min(need, TARGET_PLACES_PER_CATEGORY);
        const result = await this.seedCityPlacesOneCategory(paris.id, i, toSeed);
        seededByCategory[catKey] += result.seeded;
        if (result.seeded === 0) break;
        counts = await this.getCityPlaceCountsByCategory(paris.id);
        current = counts[catKey];
      }
    }
    const after = await this.getCityPlaceCountsByCategory(paris.id);
    return {
      cityName: paris.name,
      reclassified,
      before: { attraction: before.attraction, restaurant: before.restaurant, healing: before.healing, adventure: before.adventure, hotspot: before.hotspot },
      after: { attraction: after.attraction, restaurant: after.restaurant, healing: after.healing, adventure: after.adventure, hotspot: after.hotspot },
      seededByCategory,
    };
  }

  /**
   * 1일 1카테고리만 시딩, 최대 maxNewPlaces건 (일일 한도 준수)
   */
  async seedCityPlacesOneCategory(
    cityId: number,
    categoryIndex: number,
    maxNewPlaces: number
  ): Promise<{ seeded: number; skipped: number; errors: string[] }> {
    const { apiCallTracker } = await import("./google-places");
    const city = await db.select().from(cities).where(eq(cities.id, cityId)).then(r => r[0]);
    if (!city) return { seeded: 0, skipped: 0, errors: ["도시 없음"] };
    const searchCat = SEARCH_CATEGORIES[categoryIndex];
    if (!searchCat) return { seeded: 0, skipped: 0, errors: ["카테고리 인덱스 오류"] };

    this.currentCity = city.name;
    let seeded = 0;
    let skipped = 0;
    const errors: string[] = [];

    if (!apiCallTracker.canMakeRequest()) {
      console.log("[PlaceSeeder] 일일 API 한도 도달 — 시딩 건너뜀");
      return { seeded: 0, skipped: 0, errors: ["일일 한도 도달"] };
    }

    try {
      const googlePlaces = await googlePlacesFetcher.searchNearby(
        city.latitude,
        city.longitude,
        searchCat.placeType,
        CITY_SEARCH_RADIUS_METERS
      );

      for (const gPlace of googlePlaces) {
        if (seeded >= maxNewPlaces) break;
        if (!apiCallTracker.canMakeRequest()) break;

        const existing = await storage.getPlaceByGoogleId(gPlace.id);
        if (existing) {
          skipped++;
          continue;
        }

        try {
          const details = await googlePlacesFetcher.getPlaceDetails(gPlace.id);
          const dbType = searchCat.placeType === "restaurant" ? "restaurant" : "attraction";
          const placeId = await googlePlacesFetcher.fetchAndStorePlace(details, cityId, dbType, searchCat.category);
          for (const vibe of searchCat.vibeKeywords) await this.updateVibeKeywords(placeId, vibe);
          seeded++;
          console.log(`[PlaceSeeder]   + ${details.displayName?.text || gPlace.id} (${seeded}/${maxNewPlaces})`);
          await delay(200);
        } catch (e: any) {
          errors.push(`${gPlace.displayName?.text || gPlace.id}: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`${searchCat.category}: ${e.message}`);
    }

    return { seeded, skipped, errors };
  }

  /**
   * 1차 목표: 도시별 카테고리 30개 채우기 순서
   * MCP 자동화로 확정된 도시 목록 순서대로 수행. 각 도시당 5카테고리×30곳, 1일 1카테고리.
   * 카테고리 30개 채워질 때마다(또는 해당일) 크롤러 자동 실행.
   */
  async seedPriorityCityByCategory(): Promise<{ cityName: string; category: string; seeded: number; linked: number }> {
    if (this.isRunning) return { cityName: "", category: "", seeded: 0, linked: 0 };

    const targetCityNamesKo = getMcpFinalCityNamesKo();
    const categoryOrder = ["attraction", "restaurant", "healing", "adventure", "hotspot"] as const;
    const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % 5;
    const catKey = categoryOrder[dayIndex];
    const catIndex = categoryOrder.indexOf(catKey);

    const allCities = await db.select().from(cities);
    if (!Array.isArray(allCities)) {
      throw new Error(`db.select(cities) 비정상 반환: ${typeof allCities}`);
    }
    const cityOrder: typeof allCities = [];
    for (const n of targetCityNamesKo) {
      const c = allCities.find((x: { name?: string | null }) => (x?.name ?? "") === n);
      if (c) cityOrder.push(c);
    }

    let currentCity: (typeof allCities)[0] | null = null;
    for (const c of cityOrder) {
      const counts = await this.getCityPlaceCountsByCategory(c.id);
      if (!counts || typeof counts !== "object") {
        console.warn(`[PlaceSeeder] getCityPlaceCountsByCategory 무효 (city ${c.id}):`, counts);
        continue;
      }
      const allFull = categoryOrder.every(k => (counts[k] ?? 0) >= TARGET_PLACES_PER_CATEGORY);
      if (!allFull) {
        currentCity = c;
        break;
      }
    }

    if (!currentCity) {
      console.log("[PlaceSeeder] 1차 목표 전체 완료 (MCP 최종 도시 목록)");
      return { cityName: "완료", category: "", seeded: 0, linked: 0 };
    }

    // 파리 처리 시 seed_category null인 행 먼저 분류정돈
    if (currentCity.name === PARIS_FIRST_NAME) {
      const { updated } = await this.reclassifyParisPlaces();
      if (updated > 0) console.log(`[PlaceSeeder] 파리 분류정돈: ${updated}건 → 카테고리 재집계`);
    }

    const counts = await this.getCityPlaceCountsByCategory(currentCity.id);
    if (!counts || typeof counts !== "object") {
      throw new Error(`getCityPlaceCountsByCategory 무효 (city ${currentCity.id})`);
    }
    const current = counts[catKey] ?? 0;
    const need = Math.max(0, TARGET_PLACES_PER_CATEGORY - current);

    this.isRunning = true;
    try {
      let seeded = 0;
      let linked = 0;
      if (need === 0) {
        console.log(`[PlaceSeeder] ${currentCity.name} [${catKey}] 이미 ${current}건 — 시딩 스킵, 크롤러 실행`);
      } else {
        const toSeed = Math.min(need, DAILY_NEW_PLACES_CAP);
        console.log(`[PlaceSeeder] ${currentCity.name} [${catKey}] ${current}→${TARGET_PLACES_PER_CATEGORY} (오늘 +${toSeed}건)`);
        const result = await this.seedCityPlacesOneCategory(currentCity.id, catIndex, toSeed);
        seeded = result.seeded;
        if (result.seeded > 0) {
          const { linkDataForCity } = await import("./place-linker");
          const linkResult = await linkDataForCity(currentCity.id);
          linked = linkResult.linked;
        }
      }
      await this.runChainedCrawlers(currentCity.id, currentCity.name);

      const countsAfter = await this.getCityPlaceCountsByCategory(currentCity.id);
      const cityComplete = categoryOrder.every(k => (countsAfter[k] ?? 0) >= TARGET_PLACES_PER_CATEGORY);
      if (cityComplete) {
        await db.insert(dataSyncLog).values({
          entityType: "place_seed",
          entityId: currentCity.id,
          source: "google_wiki_otm",
          status: "success",
          itemsProcessed: 150,
          completedAt: new Date(),
        }).catch(() => {});
        console.log(`[PlaceSeeder] ✅ ${currentCity.name} 5카테고리 완성 — 다음 도시로`);
      }
      return { cityName: currentCity.name, category: catKey, seeded, linked };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 단일 도시 시딩: Google Places (인기순) + Wikimedia + OpenTripMap
   * 🔥 최적화: 4카테고리만 검색, rankPreference: POPULARITY로 리뷰 많은 순
   * 🔗 규약: googlePlaceId + displayNameKo + aliases 저장
   */
  async seedCityPlaces(cityId: number): Promise<{ success: boolean; seeded: number; skipped: number; errors: string[] }> {
    const city = await db.select().from(cities).where(eq(cities.id, cityId)).then(r => r[0]);
    if (!city) {
      return { success: false, seeded: 0, skipped: 0, errors: [`도시 ID ${cityId} 없음`] };
    }

    console.log(`\n[PlaceSeeder] ===== ${city.name} (${(city as any).nameEn || city.name}, ${city.country}) 시딩 시작 =====`);
    this.currentCity = city.name;
    
    let totalSeeded = 0;
    let totalSkipped = 0;
    const errors: string[] = [];
    const seenGoogleIds = new Set<string>();

    // 🔥 5개 카테고리 검색 (카테고리당 API 1회 = 5회 호출)
    for (const searchCat of SEARCH_CATEGORIES) {
      console.log(`[PlaceSeeder] ${city.name} - [${searchCat.category}] 인기순 검색 중...`);
      
      try {
        // Google Places Nearby Search (rankPreference: POPULARITY = 리뷰 많은 순)
        const googlePlaces = await googlePlacesFetcher.searchNearby(
          city.latitude,
          city.longitude,
          searchCat.placeType,
          CITY_SEARCH_RADIUS_METERS // 전 도시 공통 도시+근교 100km
        );
        
        console.log(`[PlaceSeeder]   ${searchCat.category}: ${googlePlaces.length}개 발견 (인기순 정렬)`);
        
        // 리뷰수 기준 상위만 처리 (이미 POPULARITY 정렬됨)
        for (const gPlace of googlePlaces) {
          // 중복 스킵 (googlePlaceId 기준)
          if (seenGoogleIds.has(gPlace.id)) {
            totalSkipped++;
            continue;
          }
          seenGoogleIds.add(gPlace.id);
          
          // DB에 이미 있는지 확인
          const existing = await storage.getPlaceByGoogleId(gPlace.id);
          if (existing) {
            // 이미 있으면 vibeKeywords만 업데이트 + 규약 필드 보강
            for (const vibe of searchCat.vibeKeywords) {
              await this.updateVibeKeywords(existing.id, vibe);
            }
            // 🔗 기존 데이터에 displayNameKo/aliases 없으면 보강
            await this.ensureProtocolFields(existing.id, gPlace);
            totalSkipped++;
            continue;
          }
          
          try {
            // Google Places 상세 정보 가져오기
            const details = await googlePlacesFetcher.getPlaceDetails(gPlace.id);
            
            // DB에 저장 (fetchAndStorePlace에서 displayNameKo, aliases 자동 생성)
            const dbType = searchCat.placeType === "restaurant" ? "restaurant" : "attraction";
            const placeId = await googlePlacesFetcher.fetchAndStorePlace(
              details,
              cityId,
              dbType,
              searchCat.category
            );
            
            // vibeKeywords 업데이트
            for (const vibe of searchCat.vibeKeywords) {
              await this.updateVibeKeywords(placeId, vibe);
            }
            
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
            
            // 리뷰수 로깅 (유명세 확인)
            const reviewCount = gPlace.userRatingCount || 0;
            console.log(`[PlaceSeeder]   + ${gPlace.displayName?.text} (${reviewCount.toLocaleString()}리뷰)`);
            
            // Rate limit 방지
            await delay(200);
            
          } catch (error: any) {
            errors.push(`${gPlace.displayName?.text || gPlace.id}: ${error.message}`);
            console.warn(`[PlaceSeeder]   실패: ${gPlace.displayName?.text}`, error.message);
          }
        }
        
        // 카테고리 간 딜레이
        await delay(500);
        
      } catch (error: any) {
        errors.push(`${searchCat.category}: ${error.message}`);
        console.warn(`[PlaceSeeder]   검색 실패: ${searchCat.category}`, error.message);
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

    console.log(`[PlaceSeeder] ===== ${city.name} 시딩 완료: ${totalSeeded}개 저장, ${totalSkipped}개 기존, ${errors.length}개 오류 =====`);
    console.log(`[PlaceSeeder]   API 호출: 4회 Nearby + ${totalSeeded}회 Details = ${4 + totalSeeded}회 (기존 대비 ~87% 절감)\n`);
    
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
  async seedAllPendingCities(maxCities?: number): Promise<{ totalSeeded: number; citiesProcessed: number }> {
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

      // ★ 1차 목표 우선순위: 파리 → 프랑스 30개 → 유럽 30개 → 나머지 (파리는 seedPriorityCityByCategory에서 처리)
      const FRANCE_30_ORDER = ["니스", "리옹", "마르세유", "보르도", "스트라스부르", "툴루즈", "몽펠리에", "낭트", "칸", "아비뇽", "엑상프로방스", "콜마르", "앙시", "디종", "루앙", "릴", "렌", "카르카손", "비아리츠", "생말로", "샤모니", "아를", "생트로페", "베르사유", "그르노블", "랭스", "안티브", "망통", "투르"];
      const pendingCities = pendingCitiesRaw.sort((a, b) => {
        const rank = (c: typeof a) => {
          if (c.name === "파리") return -1;
          if (c.countryCode === "FR") return 0;
          if (c.timezone?.startsWith("Europe/")) return 1;
          return 2;
        };
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (a.countryCode === "FR" && b.countryCode === "FR") {
          const ai = FRANCE_30_ORDER.indexOf(a.name);
          const bi = FRANCE_30_ORDER.indexOf(b.name);
          if (ai >= 0 && bi >= 0) return ai - bi;
          if (ai >= 0) return -1;
          if (bi >= 0) return 1;
          return (a.name || "").localeCompare(b.name || "");
        }
        return (a.name || "").localeCompare(b.name || "");
      });

      this.progress = { total: pendingCities.length, completed: 0, current: "" };
      const francePending = pendingCities.filter(c => c.countryCode === "FR").map(c => c.name);
      const euroPending = pendingCities.filter(c => c.timezone?.startsWith("Europe/") && c.countryCode !== "FR").map(c => c.name);
      console.log(`[PlaceSeeder] ★ 1차 목표 시딩 순서 (파리→프랑스30→유럽30):`);
      console.log(`  1순위 파리: seedPriorityCityByCategory에서 처리`);
      console.log(`  2순위 프랑스30: ${francePending.length > 0 ? francePending.join(", ") : "✅ 완료"}`);
      console.log(`  3순위 유럽30: ${euroPending.length > 0 ? euroPending.length + "개 대기" : "✅ 완료"}`);
      console.log(`  총 대기: ${pendingCities.length}개`);

      const citiesToProcess = maxCities ? pendingCities.slice(0, maxCities) : pendingCities;
      if (maxCities) {
        console.log(`[PlaceSeeder] 📌 일일 제한: ${maxCities}개 도시 (총 ${pendingCities.length}개 대기 중 ${citiesToProcess.length}개 처리)`);
      }

      for (const city of citiesToProcess) {
        this.progress.current = city.name;
        console.log(`\n[PlaceSeeder] === [${this.progress.completed + 1}/${this.progress.total}] ${city.name} 시작 ===`);
        
        try {
          // 1단계: 장소 시딩
          const seedResult = await this.seedCityPlaces(city.id);
          totalSeeded += seedResult.seeded;
          
          citiesProcessed++;
          this.progress.completed++;
          
          console.log(`[PlaceSeeder] === [${this.progress.completed}/${this.progress.total}] ${city.name} 시딩 완료 (${seedResult.seeded}개) ===`);
          
          // 2단계: 연쇄 크롤러 항상 실행 (로우데이터 보강)
          console.log(`[PlaceSeeder] 🔄 ${city.name} - 연쇄 크롤러 시작...`);
          try {
            await this.runChainedCrawlers(city.id, city.name);
            console.log(`[PlaceSeeder] ✅ ${city.name} - 시딩+크롤러 완전 완료!`);
          } catch (crawlError: any) {
            console.warn(`[PlaceSeeder] ${city.name} 크롤러 일부 실패:`, crawlError.message);
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
   * 시딩 완료된 도시에 대해 12개 크롤러 + place-linker + score 집계 연쇄 실행
   * 대상: 도시별·카테고리별 장소 (구글 시딩 기반)
   * 
   * 0그룹 (로우데이터 보강): Wikimedia, OpenTripMap — 무료, 사진·설명 보강
   * A그룹 (placeId 직접 확보): TripAdvisor, Michelin, 가격, 포토스팟, 한국플랫폼, 패키지투어
   * B그룹 (place-linker 필요): Instagram auto-collector, YouTube, Naver Blog, Tistory
   * 마무리: Place Linker → Score Aggregation
   */
  async runChainedCrawlers(cityId: number, cityName: string): Promise<void> {
    console.log(`\n[Crawlers] ============================`);
    console.log(`[Crawlers] ${cityName} (id:${cityId}) - 12개 크롤러 연쇄 실행 (도시별·카테고리별 장소)`);
    console.log(`[Crawlers] ============================`);
    
    const cityPlaces = await storage.getPlacesByCity(cityId);
    if (cityPlaces.length === 0) {
      console.log(`[Crawlers] ${cityName} - 장소 없음, 스킵`);
      return;
    }
    console.log(`[Crawlers] ${cityName} - ${cityPlaces.length}개 장소 대상\n`);

    const isPausedByPolicy = async (taskName: string): Promise<boolean> => {
      const { DataScheduler } = await import("./data-scheduler");
      return DataScheduler.isTaskDisabledByPolicy(taskName);
    };

    // ═══════════════════════════════════════
    // 0그룹: 로우데이터 보강 (무료 API)
    // ═══════════════════════════════════════

    // 0-1. Wikimedia (사진 보강)
    try {
      const { syncWikimediaForCity } = await import("./wikimedia-enrichment");
      const result = await syncWikimediaForCity(cityId);
      await db.insert(dataSyncLog).values({
        entityType: "wikimedia_연쇄",
        entityId: cityId,
        source: "chained_crawlers",
        status: result.errors.length === 0 ? "success" : "partial",
        itemsProcessed: result.placesProcessed,
        itemsFailed: result.errors?.length || 0,
        errorMessage: result.errors?.slice(0, 2).join("; ") || null,
        completedAt: new Date(),
      });
      console.log(`[Crawlers] ✅ 0-1 Wikimedia: ${cityName} ${result.placesProcessed}곳, ${result.photosAdded}장 사진`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 0-1 Wikimedia:`, e.message);
      await db.insert(dataSyncLog).values({
        entityType: "wikimedia_연쇄",
        entityId: cityId,
        source: "chained_crawlers",
        status: "failed",
        errorMessage: e.message,
        completedAt: new Date(),
      });
    }
    await delay(500);

    // 0-2. OpenTripMap (설명 보강)
    try {
      const { syncOpenTripMapForCity } = await import("./opentripmap-enrichment");
      const result = await syncOpenTripMapForCity(cityId);
      await db.insert(dataSyncLog).values({
        entityType: "opentripmap_연쇄",
        entityId: cityId,
        source: "chained_crawlers",
        status: result.errors.length === 0 ? "success" : "partial",
        itemsProcessed: result.placesProcessed,
        itemsFailed: result.errors?.length || 0,
        errorMessage: result.errors?.slice(0, 2).join("; ") || null,
        completedAt: new Date(),
      });
      console.log(`[Crawlers] ✅ 0-2 OpenTripMap: ${cityName} ${result.placesProcessed}곳, ${result.descriptionsAdded}개 설명`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 0-2 OpenTripMap:`, e.message);
      await db.insert(dataSyncLog).values({
        entityType: "opentripmap_연쇄",
        entityId: cityId,
        source: "chained_crawlers",
        status: "failed",
        errorMessage: e.message,
        completedAt: new Date(),
      });
    }
    await delay(500);

    // ═══════════════════════════════════════
    // A그룹: places.id 기반 직접 크롤링
    // ═══════════════════════════════════════

    // 1. TripAdvisor (평점/리뷰/순위)
    if (await isPausedByPolicy("tripadvisor_sync")) {
      console.log(`[Crawlers] ⏸️ 1/10 TripAdvisor: 정책 일시중단`);
    } else {
      try {
        const { crawlTripAdvisorForCity } = await import("./tripadvisor-crawler");
        const result = await crawlTripAdvisorForCity(cityId);
        console.log(`[Crawlers] ✅ 1/10 TripAdvisor: ${result?.collected || 0}개`);
      } catch (e: any) {
        console.warn(`[Crawlers] ❌ 1/10 TripAdvisor:`, e.message);
      }
    }
    await delay(1000);

    // 2. Michelin (레스토랑 등급)
    if (await isPausedByPolicy("michelin_sync")) {
      console.log(`[Crawlers] ⏸️ 2/10 Michelin: 정책 일시중단`);
    } else {
      try {
        const { crawlMichelinForCity } = await import("./michelin-crawler");
        const result = await crawlMichelinForCity(cityId);
        console.log(`[Crawlers] ✅ 2/10 Michelin: ${result?.collected || 0}개`);
      } catch (e: any) {
        console.warn(`[Crawlers] ❌ 2/10 Michelin:`, e.message);
      }
    }
    await delay(1000);

    // 3. 가격 (입장료/식사비)
    try {
      const { crawlPricesForCity } = await import("./price-crawler");
      const result = await crawlPricesForCity(cityId);
      console.log(`[Crawlers] ✅ 3/10 가격: ${result?.pricesCollected || 0}개`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 3/10 가격:`, e.message);
    }
    await delay(1000);

    // 4. 한국플랫폼 (마이리얼트립/클룩/트립닷컴)
    try {
      const { crawlKoreanPlatformsForCity } = await import("./korean-platform-crawler");
      const result = await crawlKoreanPlatformsForCity(cityId);
      console.log(`[Crawlers] ✅ 4/10 한국플랫폼: ${result?.collected || 0}개`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 4/10 한국플랫폼:`, e.message);
    }
    await delay(1000);

    // 5. 패키지투어 (하나/모두투어 포함 여부)
    try {
      const { validatePackageToursForCity } = await import("./package-tour-validator");
      const result = await validatePackageToursForCity(cityId);
      console.log(`[Crawlers] ✅ 5/10 패키지투어: ${result?.validated || 0}개`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 5/10 패키지투어:`, e.message);
    }
    await delay(1000);

    // 6. 포토스팟 (사진 점수)
    try {
      const { scorePhotospotsForCity } = await import("./photospot-scorer");
      const result = await scorePhotospotsForCity(cityId);
      console.log(`[Crawlers] ✅ 6/10 포토스팟: ${result?.scored || 0}개`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 6/10 포토스팟:`, e.message);
    }
    await delay(1000);

    // ═══════════════════════════════════════
    // B그룹: 한국인 선호 데이터 (placeId 자동연결)
    // ═══════════════════════════════════════

    // 7. Instagram (auto-collector: 장소별 해시태그 생성 + 수집 + placeId 연결)
    if (await isPausedByPolicy("instagram_sync")) {
      console.log(`[Crawlers] ⏸️ 7/10 Instagram: 정책 일시중단`);
    } else {
      try {
        const { instagramAutoCollector } = await import("./instagram-auto-collector");
        const result = await instagramAutoCollector.collectForCity(cityId);
        console.log(`[Crawlers] ✅ 7/10 Instagram: ${result.placesProcessed}개 장소, ${result.totalPostCount.toLocaleString()} 포스트`);
      } catch (e: any) {
        console.warn(`[Crawlers] ❌ 7/10 Instagram:`, e.message);
      }
    }
    await delay(1000);

    // 7b. 셀럽 인스타 흔적 (20인 × 장소 → 이미지 최상순위 노출)
    if (await isPausedByPolicy("instagram_sync")) {
      console.log(`[Crawlers] ⏸️ 7b/10 셀럽 인스타: 정책 일시중단`);
    } else {
      try {
        const { crawlCelebrityInstagramForCity } = await import("./instagram-celebrity-crawler");
        const result = await crawlCelebrityInstagramForCity(cityId);
        console.log(`[Crawlers] ✅ 7b/10 셀럽 인스타: ${result.evidenceFound}건 흔적 발견`);
      } catch (e: any) {
        console.warn(`[Crawlers] ❌ 7b/10 셀럽 인스타:`, e.message);
      }
    }
    await delay(1000);

    // 8. Naver Blog (도시 키워드 검색)
    if (await isPausedByPolicy("naver_blog_sync")) {
      console.log(`[Crawlers] ⏸️ 8/10 Naver Blog: 정책 일시중단`);
    } else {
      try {
        const { crawlBlogsForCity } = await import("./naver-blog-crawler");
        const result = await crawlBlogsForCity(cityId);
        console.log(`[Crawlers] ✅ 8/10 Naver Blog: ${result?.postsCollected || 0}개 포스트`);
      } catch (e: any) {
        console.warn(`[Crawlers] ❌ 8/10 Naver Blog:`, e.message);
      }
    }
    await delay(1000);

    // 9. Tistory (도시 키워드 검색)
    if (await isPausedByPolicy("tistory_sync")) {
      console.log(`[Crawlers] ⏸️ 9/10 Tistory: 정책 일시중단`);
    } else {
      try {
        const { crawlTistoryForCity } = await import("./tistory-crawler");
        const result = await crawlTistoryForCity(cityId);
        console.log(`[Crawlers] ✅ 9/10 Tistory: ${result?.totalPosts || 0}개 포스트`);
      } catch (e: any) {
        console.warn(`[Crawlers] ❌ 9/10 Tistory:`, e.message);
      }
    }
    await delay(1000);

    // 10. YouTube (등록된 채널에서 도시 관련 장소 추출 - 전체 sync 아님, 비용 절감)
    // YouTube는 채널 기반이라 도시별 실행이 아닌 전체 sync
    // → 여기서는 스킵, 스케줄러의 youtube_sync에 위임
    console.log(`[Crawlers] ⏩ 10/10 YouTube: 스케줄러 위임 (채널 기반)`);

    // ═══════════════════════════════════════
    // 마무리: Place Linker + Score Aggregation
    // ═══════════════════════════════════════

    // Place Linker: B그룹 데이터의 placeName → placeId 매칭
    try {
      const { linkDataForCity } = await import("./place-linker");
      const linkResult = await linkDataForCity(cityId);
      console.log(`[Crawlers] 🔗 Place Linker: ${linkResult.linked}개 연결, ${linkResult.unmatched}개 미매칭`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ Place Linker:`, e.message);
    }

    // Score Aggregation: buzzScore/finalScore 재계산
    try {
      const { aggregateAllScores } = await import("./score-aggregator");
      const result = await aggregateAllScores();
      console.log(`[Crawlers] 🎯 Score Aggregation: ${result.updated}개 장소 점수 업데이트`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ Score Aggregation:`, e.message);
    }

    console.log(`\n[Crawlers] ============================`);
    console.log(`[Crawlers] ${cityName} - 전체 크롤러 완료!`);
    console.log(`[Crawlers] ============================\n`);
  }

  /**
   * 🔗 규약 필드 보강: 기존 장소에 displayNameKo, aliases가 없으면 추가
   */
  private async ensureProtocolFields(placeId: number, gPlace: any): Promise<void> {
    try {
      const [place] = await db.select({ 
        displayNameKo: places.displayNameKo, 
        aliases: places.aliases,
        name: places.name 
      }).from(places).where(eq(places.id, placeId));
      
      if (!place) return;
      
      const updates: any = {};
      
      // displayNameKo가 비어있고 Google 이름에 한국어가 있으면 설정
      if (!place.displayNameKo) {
        const rawName = gPlace.displayName?.text || "";
        if (/[가-힣]/.test(rawName)) {
          updates.displayNameKo = rawName;
        }
      }
      
      // aliases가 비어있으면 초기화
      if (!place.aliases || (Array.isArray(place.aliases) && place.aliases.length === 0)) {
        updates.aliases = [];
      }
      
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db.update(places).set(updates).where(eq(places.id, placeId));
      }
    } catch (e) { /* 무시 */ }
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
    
    const FULL_ORDER = getMcpFinalCityNamesKo();
    const cityDetailsRaw = allCities.map(c => ({
      id: c.id,
      name: c.name,
      country: c.country,
      placeCount: placeCountMap.get(c.id) || 0,
      isSeeded: seededCityIds.has(c.id),
      _order: FULL_ORDER.indexOf(c.name),
    }));
    const cityDetails = cityDetailsRaw.sort((a, b) => {
      const ao = (a as any)._order;
      const bo = (b as any)._order;
      if (ao >= 0 && bo >= 0) return ao - bo;
      if (ao >= 0) return -1;
      if (bo >= 0) return 1;
      return (a.name || "").localeCompare(b.name || "");
    }).map(({ _order, ...rest }) => rest);

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
