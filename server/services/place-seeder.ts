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
// 🔥 최적화된 검색 카테고리 (중복 제거, 인기순 상위)
// 기존: 6카테고리 x 5타입 = 30회 API 호출
// 개선: 4카테고리 x 고유타입 = 4회 API 호출 → 비용 87% 절감
// Google Places rankPreference: "POPULARITY" → 리뷰 많은 순 정렬
// ============================================
const SEARCH_CATEGORIES: { 
  category: string; 
  placeType: "restaurant" | "attraction" | "cafe" | "hotel" | "landmark";
  vibeKeywords: string[];
}[] = [
  // 관광지/랜드마크/문화 (인기순 상위 20개 → 에펠탑, 루브르 같은 곳이 자동으로 먼저 옴)
  { category: "attraction", placeType: "attraction", vibeKeywords: ["Hotspot", "Culture", "Adventure"] },
  // 레스토랑/맛집 (리뷰 많은 순 상위 20개 → 현지인/관광객 검증 맛집)
  { category: "restaurant", placeType: "restaurant", vibeKeywords: ["Foodie"] },
  // 카페/베이커리 (리뷰 많은 순 상위 20개)
  { category: "cafe", placeType: "cafe", vibeKeywords: ["Foodie", "Healing"] },
  // 호텔/숙소 (리뷰 많은 순 상위 20개 → 숙소 위치 파악용)
  { category: "hotel", placeType: "hotel", vibeKeywords: ["Healing", "Romantic"] },
];

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

    // 🔥 4개 카테고리 검색 (기존 30회 → 4회 API 호출)
    for (const searchCat of SEARCH_CATEGORIES) {
      console.log(`[PlaceSeeder] ${city.name} - [${searchCat.category}] 인기순 검색 중...`);
      
      try {
        // Google Places Nearby Search (rankPreference: POPULARITY = 리뷰 많은 순)
        const googlePlaces = await googlePlacesFetcher.searchNearby(
          city.latitude,
          city.longitude,
          searchCat.placeType === "landmark" ? "attraction" : searchCat.placeType,
          10000 // 10km 반경 (대도시 커버)
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
            const placeId = await googlePlacesFetcher.fetchAndStorePlace(
              details,
              cityId,
              searchCat.placeType
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
            const rating = gPlace.rating || 0;
            console.log(`[PlaceSeeder]   + ${gPlace.displayName?.text} (★${rating} / ${reviewCount.toLocaleString()}리뷰)`);
            
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
   * 시딩 완료된 도시에 대해 10개 크롤러 + place-linker + score 집계 연쇄 실행
   * 
   * A그룹 (placeId 직접 확보): TripAdvisor, Michelin, 가격, 포토스팟, 한국플랫폼, 패키지투어
   * B그룹 (place-linker 필요): Instagram auto-collector, YouTube, Naver Blog, Tistory
   * 마무리: Place Linker → Score Aggregation
   */
  async runChainedCrawlers(cityId: number, cityName: string): Promise<void> {
    console.log(`\n[Crawlers] ============================`);
    console.log(`[Crawlers] ${cityName} (id:${cityId}) - 10개 크롤러 연쇄 실행`);
    console.log(`[Crawlers] ============================`);
    
    const cityPlaces = await storage.getPlacesByCity(cityId);
    if (cityPlaces.length === 0) {
      console.log(`[Crawlers] ${cityName} - 장소 없음, 스킵`);
      return;
    }
    console.log(`[Crawlers] ${cityName} - ${cityPlaces.length}개 장소 대상\n`);

    // ═══════════════════════════════════════
    // A그룹: places.id 기반 직접 크롤링
    // ═══════════════════════════════════════

    // 1. TripAdvisor (평점/리뷰/순위)
    try {
      const { crawlTripAdvisorForCity } = await import("./tripadvisor-crawler");
      const result = await crawlTripAdvisorForCity(cityId);
      console.log(`[Crawlers] ✅ 1/10 TripAdvisor: ${result?.collected || 0}개`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 1/10 TripAdvisor:`, e.message);
    }
    await delay(1000);

    // 2. Michelin (레스토랑 등급)
    try {
      const { crawlMichelinForCity } = await import("./michelin-crawler");
      const result = await crawlMichelinForCity(cityId);
      console.log(`[Crawlers] ✅ 2/10 Michelin: ${result?.collected || 0}개`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 2/10 Michelin:`, e.message);
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
    try {
      const { instagramAutoCollector } = await import("./instagram-auto-collector");
      const result = await instagramAutoCollector.collectForCity(cityId);
      console.log(`[Crawlers] ✅ 7/10 Instagram: ${result.placesProcessed}개 장소, ${result.totalPostCount.toLocaleString()} 포스트`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 7/10 Instagram:`, e.message);
    }
    await delay(1000);

    // 8. Naver Blog (도시 키워드 검색)
    try {
      const { crawlBlogsForCity } = await import("./naver-blog-crawler");
      const result = await crawlBlogsForCity(cityId);
      console.log(`[Crawlers] ✅ 8/10 Naver Blog: ${result?.postsCollected || 0}개 포스트`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 8/10 Naver Blog:`, e.message);
    }
    await delay(1000);

    // 9. Tistory (도시 키워드 검색)
    try {
      const { crawlTistoryForCity } = await import("./tistory-crawler");
      const result = await crawlTistoryForCity(cityId);
      console.log(`[Crawlers] ✅ 9/10 Tistory: ${result?.totalPosts || 0}개 포스트`);
    } catch (e: any) {
      console.warn(`[Crawlers] ❌ 9/10 Tistory:`, e.message);
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
