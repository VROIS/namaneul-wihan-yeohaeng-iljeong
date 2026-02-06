/**
 * 한국 여행 플랫폼 크롤러 (Phase 1-1)
 * 
 * 마이리얼트립 / 클룩(Klook) / 트립닷컴(Trip.com)에서
 * Gemini 웹검색으로 가격 + 한국어 리뷰 수 + 평점 수집
 * 
 * 저장: placePrices 테이블 (source: "myrealtrip" | "klook" | "tripdotcom")
 * 스케줄: 하루 1회 (data-scheduler.ts)
 */

import { db } from "../db";
import { placePrices, places, cities } from "../../shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

const GEMINI_MODEL = "gemini-3-flash-preview";
const CACHE_DURATION_HOURS = 24;

// ===== 플랫폼 정의 =====
interface PlatformConfig {
  id: string;           // DB source 값
  name: string;         // 표시 이름
  searchKeyword: string; // Gemini 검색 키워드
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "myrealtrip",
    name: "마이리얼트립",
    searchKeyword: "마이리얼트립 myrealtrip",
  },
  {
    id: "klook",
    name: "클룩 Klook",
    searchKeyword: "클룩 Klook",
  },
  {
    id: "tripdotcom",
    name: "트립닷컴 Trip.com",
    searchKeyword: "트립닷컴 Trip.com",
  },
];

// ===== 수집 결과 인터페이스 =====
interface KoreanPlatformResult {
  platform: string;
  price: number | null;
  currency: string;
  reviewCount: number;
  rating: number | null;
  productName: string | null;
  url: string | null;
  confidence: number;
}

// ===== Gemini 웹검색으로 플랫폼 데이터 수집 =====
async function searchPlatformWithGemini(
  placeName: string,
  cityName: string,
  platform: PlatformConfig
): Promise<KoreanPlatformResult | null> {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      console.error(`[KoreanPlatform] Gemini API 키 없음`);
      return null;
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${platform.searchKeyword}에서 "${placeName}" ${cityName} 관련 상품을 검색해주세요.

다음 정보를 찾아서 JSON으로 응답해주세요:
{
  "found": true 또는 false,
  "price": 가격 (숫자, 원화면 원화 그대로, 유로면 유로 그대로),
  "currency": "KRW" 또는 "EUR" 또는 "USD",
  "reviewCount": 한국어 리뷰 수 (숫자),
  "rating": 평점 (5점 만점, 숫자),
  "productName": "상품명 (입장권/투어/액티비티 등)",
  "url": "상품 페이지 URL",
  "confidence": 0.0~1.0 (정보 신뢰도)
}

요구사항:
- 해당 장소의 입장권, 투어, 액티비티 상품을 찾아주세요
- 가격은 성인 1인 기준 최저가
- 리뷰 수와 평점은 한국어 리뷰 기준
- 상품이 없으면 {"found": false} 반환
- 반드시 유효한 JSON만 반환`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (parsed.found && (parsed.price || parsed.reviewCount)) {
          return {
            platform: platform.id,
            price: parsed.price || null,
            currency: parsed.currency || "KRW",
            reviewCount: parsed.reviewCount || 0,
            rating: parsed.rating || null,
            productName: parsed.productName || null,
            url: parsed.url || null,
            confidence: parsed.confidence || 0.5,
          };
        }
      } catch (parseErr) {
        console.warn(`[KoreanPlatform] JSON 파싱 실패 (${platform.name}, ${placeName}):`, parseErr);
      }
    }

    console.log(`[KoreanPlatform] ${platform.name}에서 ${placeName} 정보 없음`);
    return null;
  } catch (error) {
    console.error(`[KoreanPlatform] ${platform.name} 검색 실패 (${placeName}):`, error);
    return null;
  }
}

// ===== 단일 장소의 모든 플랫폼 수집 =====
async function collectKoreanPlatformData(
  placeId: number,
  cityId: number,
  placeName: string,
  cityName: string
): Promise<{ collected: number; results: KoreanPlatformResult[] }> {
  const results: KoreanPlatformResult[] = [];
  let collected = 0;

  for (const platform of PLATFORMS) {
    // 캐시 확인 (24시간 이내 수집된 데이터가 있으면 건너뜀)
    const existing = await db.select()
      .from(placePrices)
      .where(and(
        eq(placePrices.placeId, placeId),
        eq(placePrices.source, platform.id),
        gte(placePrices.fetchedAt, new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000))
      ))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[KoreanPlatform] 캐시 히트: ${placeName} (${platform.name})`);
      continue;
    }

    // Gemini 웹검색으로 수집
    const result = await searchPlatformWithGemini(placeName, cityName, platform);

    if (result) {
      // placePrices 테이블에 저장
      await db.insert(placePrices).values({
        placeId,
        cityId,
        priceType: "entrance_fee",  // 입장권/투어 가격
        source: platform.id,
        priceLow: result.price,
        priceHigh: result.price,    // 단일 가격이면 동일
        priceAverage: result.price,
        currency: result.currency,
        priceLabel: result.productName || `${platform.name} 상품`,
        sourceUrl: result.url,
        confidenceScore: result.confidence,
        rawData: {
          reviewCount: result.reviewCount,
          rating: result.rating,
          productName: result.productName,
          platform: platform.name,
          collectedAt: new Date().toISOString(),
        },
        expiresAt: new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000),
      });

      console.log(
        `[KoreanPlatform] ${platform.name} | ${placeName}: ` +
        `${result.price ? result.price + ' ' + result.currency : '가격없음'}, ` +
        `리뷰 ${result.reviewCount}개, 평점 ${result.rating || '-'}`
      );

      results.push(result);
      collected++;
    }

    // API 레이트 리밋 방지 (1초 딜레이)
    await new Promise(r => setTimeout(r, 1000));
  }

  return { collected, results };
}

// ===== 도시별 수집 =====
export async function crawlKoreanPlatformsForCity(
  cityId: number
): Promise<{ success: boolean; collected: number; placesProcessed: number }> {
  console.log(`[KoreanPlatform] 도시 ID ${cityId} 한국 플랫폼 데이터 수집 시작`);

  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[KoreanPlatform] 도시를 찾을 수 없음: ${cityId}`);
    return { success: false, collected: 0, placesProcessed: 0 };
  }

  // 해당 도시의 관광 명소/액티비티만 대상 (식당은 제외)
  const cityPlaces = await db.select()
    .from(places)
    .where(eq(places.cityId, cityId));

  const targetPlaces = cityPlaces.filter(p =>
    ['attraction', 'landmark', 'museum', 'activity', 'tour', 'park', 'historic'].includes(p.type)
  );

  console.log(`[KoreanPlatform] ${city.name}: 총 ${cityPlaces.length}곳 중 ${targetPlaces.length}곳 대상`);

  let totalCollected = 0;

  for (const place of targetPlaces) {
    try {
      const { collected } = await collectKoreanPlatformData(
        place.id,
        cityId,
        place.name,
        city.name
      );
      totalCollected += collected;

      // 장소 간 딜레이 (2초)
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      console.error(`[KoreanPlatform] ${place.name} 수집 실패:`, error);
    }
  }

  console.log(`[KoreanPlatform] ${city.name} 수집 완료: ${totalCollected}건`);
  return { success: true, collected: totalCollected, placesProcessed: targetPlaces.length };
}

// ===== 전체 도시 수집 =====
export async function crawlAllKoreanPlatforms(): Promise<{
  success: boolean;
  totalCollected: number;
  citiesProcessed: number;
}> {
  console.log("[KoreanPlatform] 전체 한국 플랫폼 데이터 수집 시작...");

  const allCities = await db.select().from(cities);
  let totalCollected = 0;

  for (const city of allCities) {
    const result = await crawlKoreanPlatformsForCity(city.id);
    totalCollected += result.collected;

    // 도시 간 딜레이 (3초)
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`[KoreanPlatform] 전체 수집 완료: ${totalCollected}건 (${allCities.length}개 도시)`);
  return { success: true, totalCollected, citiesProcessed: allCities.length };
}

// ===== 통계 조회 =====
export async function getKoreanPlatformStats(): Promise<{
  total: number;
  byPlatform: Record<string, number>;
  topPlaces: Array<{
    placeName: string;
    platform: string;
    price: number | null;
    currency: string;
    reviewCount: number;
    rating: number | null;
  }>;
}> {
  // 한국 플랫폼 데이터만 조회
  const platformData = await db.select()
    .from(placePrices)
    .where(
      eq(placePrices.source, "myrealtrip")
    );

  const klookData = await db.select()
    .from(placePrices)
    .where(eq(placePrices.source, "klook"));

  const tripdotcomData = await db.select()
    .from(placePrices)
    .where(eq(placePrices.source, "tripdotcom"));

  const allData = [...platformData, ...klookData, ...tripdotcomData];

  const byPlatform: Record<string, number> = {
    myrealtrip: platformData.length,
    klook: klookData.length,
    tripdotcom: tripdotcomData.length,
  };

  // 장소 이름 가져오기
  const placeIds = [...new Set(allData.map(d => d.placeId).filter(Boolean))] as number[];
  const placesData = placeIds.length > 0
    ? await db.select({ id: places.id, name: places.name }).from(places)
    : [];
  const placeNameMap = new Map(placesData.map(p => [p.id, p.name]));

  // 리뷰 많은 순 상위 10개
  const topPlaces = allData
    .filter(d => d.rawData && (d.rawData as any).reviewCount)
    .sort((a, b) => ((b.rawData as any).reviewCount || 0) - ((a.rawData as any).reviewCount || 0))
    .slice(0, 10)
    .map(d => ({
      placeName: placeNameMap.get(d.placeId!) || "Unknown",
      platform: d.source,
      price: d.priceAverage,
      currency: d.currency,
      reviewCount: (d.rawData as any).reviewCount || 0,
      rating: (d.rawData as any).rating || null,
    }));

  return {
    total: allData.length,
    byPlatform,
    topPlaces,
  };
}

// ===== 특정 장소의 한국 플랫폼 가격 비교 =====
export async function getPlaceKoreanPlatformPrices(placeId: number): Promise<{
  prices: Array<{
    platform: string;
    price: number | null;
    currency: string;
    reviewCount: number;
    rating: number | null;
    productName: string | null;
    url: string | null;
    fetchedAt: Date;
  }>;
  bestPrice: {
    platform: string;
    price: number;
    currency: string;
  } | null;
}> {
  const koreanPlatformSources = ["myrealtrip", "klook", "tripdotcom"];

  const pricesData = await db.select()
    .from(placePrices)
    .where(eq(placePrices.placeId, placeId))
    .orderBy(desc(placePrices.fetchedAt));

  const koreanPrices = pricesData.filter(p => koreanPlatformSources.includes(p.source));

  const prices = koreanPrices.map(p => ({
    platform: p.source,
    price: p.priceAverage,
    currency: p.currency,
    reviewCount: (p.rawData as any)?.reviewCount || 0,
    rating: (p.rawData as any)?.rating || null,
    productName: p.priceLabel,
    url: p.sourceUrl,
    fetchedAt: p.fetchedAt,
  }));

  // 최저가 찾기 (동일 통화 기준)
  const validPrices = prices.filter(p => p.price !== null && p.price > 0);
  let bestPrice: { platform: string; price: number; currency: string } | null = null;

  if (validPrices.length > 0) {
    const cheapest = validPrices.reduce((min, p) =>
      (p.price! < min.price!) ? p : min
    );
    bestPrice = {
      platform: cheapest.platform,
      price: cheapest.price!,
      currency: cheapest.currency,
    };
  }

  return { prices, bestPrice };
}
