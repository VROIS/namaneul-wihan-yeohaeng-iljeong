import { db } from "../db";
import { places, placeDataSources, cities } from "../../shared/schema";
import { eq, and, gte, desc, isNull, or } from "drizzle-orm";

const GEMINI_MODEL = "gemini-3-flash-preview";
const CACHE_DURATION_HOURS = 168; // 7일 (미슐랭 데이터는 자주 변하지 않음)

interface MichelinResult {
  found: boolean;
  michelinRating?: string; // "3스타", "2스타", "1스타", "빕구르망", "추천"
  michelinType?: string; // "star", "bib_gourmand", "recommended"
  cuisineType?: string;
  priceRange?: string;
  description?: string;
  url?: string;
  confidence: number;
}

/**
 * Gemini Web Search를 사용하여 미슐랭 가이드 정보를 수집합니다.
 */
async function searchMichelinWithGemini(
  placeName: string,
  placeType: string,
  cityName: string,
  countryName: string = ""
): Promise<MichelinResult | null> {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) { console.error("[Michelin] Gemini API 키 없음"); return null; }
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Search Michelin Guide for "${placeName}" in ${cityName} ${countryName}.

Find and extract Michelin Guide information for this ${placeType}:
1. Michelin rating (3-star, 2-star, 1-star, Bib Gourmand, Michelin Recommended)
2. Cuisine type
3. Price range (€, €€, €€€, €€€€)
4. Brief description from Michelin
5. Official Michelin Guide URL if available

Return JSON:
{
  "found": true/false,
  "michelinRating": "1스타" | "2스타" | "3스타" | "빕구르망" | "추천" | null,
  "michelinType": "star" | "bib_gourmand" | "recommended" | null,
  "cuisineType": "French Contemporary",
  "priceRange": "€€€",
  "description": "미슐랭 가이드의 설명 요약 (한국어로)",
  "url": "https://guide.michelin.com/...",
  "confidence": 0.0-1.0
}

Return found: false if not found in Michelin Guide.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.found && (parsed.michelinRating || parsed.michelinType)) {
        return {
          found: true,
          michelinRating: parsed.michelinRating,
          michelinType: parsed.michelinType,
          cuisineType: parsed.cuisineType,
          priceRange: parsed.priceRange,
          description: parsed.description,
          url: parsed.url,
          confidence: parsed.confidence || 0.7,
        };
      }
    }
  } catch (error) {
    console.error("[MichelinCrawler] Gemini search error:", error);
  }
  
  return null;
}

/**
 * 특정 장소의 미슐랭 데이터를 수집합니다.
 */
export async function collectMichelinData(
  placeId: number,
  placeName: string,
  placeType: string,
  cityName: string,
  countryName: string = ""
): Promise<boolean> {
  // 캐시 확인 (7일 이내 데이터가 있으면 스킵)
  const existingData = await db.select()
    .from(placeDataSources)
    .where(and(
      eq(placeDataSources.placeId, placeId),
      eq(placeDataSources.source, "michelin"),
      gte(placeDataSources.fetchedAt, new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000))
    ))
    .limit(1);

  if (existingData.length > 0) {
    console.log(`[MichelinCrawler] Cache hit for ${placeName}`);
    return true;
  }

  // 미슐랭 검색 (레스토랑 타입만)
  if (placeType !== "restaurant" && placeType !== "cafe") {
    console.log(`[MichelinCrawler] Skipping non-restaurant: ${placeName} (${placeType})`);
    return false;
  }

  const result = await searchMichelinWithGemini(placeName, placeType, cityName, countryName);
  
  if (result && result.found) {
    // 기존 데이터 삭제 후 새로 삽입
    await db.delete(placeDataSources)
      .where(and(
        eq(placeDataSources.placeId, placeId),
        eq(placeDataSources.source, "michelin")
      ));

    await db.insert(placeDataSources).values({
      placeId,
      source: "michelin",
      sourceId: null,
      sourceUrl: result.url || null,
      rating: getMichelinRatingScore(result.michelinRating),
      reviewCount: null,
      priceLevel: getMichelinPriceLevel(result.priceRange),
      rankingInCategory: null,
      isMichelinStar: result.michelinType === "star",
      michelinType: result.michelinRating,
      rawData: {
        cuisineType: result.cuisineType,
        description: result.description,
        confidence: result.confidence,
        extractedAt: new Date().toISOString(),
      },
    });
    
    // places 테이블의 cuisineType도 업데이트
    if (result.cuisineType) {
      await db.update(places)
        .set({ cuisineType: result.cuisineType })
        .where(eq(places.id, placeId));
    }
    
    console.log(`[MichelinCrawler] Collected ${placeName}: ${result.michelinRating}`);
    return true;
  }
  
  return false;
}

/**
 * 미슐랭 등급을 숫자 점수로 변환합니다.
 */
function getMichelinRatingScore(rating?: string): number | null {
  if (!rating) return null;
  
  const ratingMap: Record<string, number> = {
    "3스타": 10.0,
    "2스타": 9.5,
    "1스타": 9.0,
    "빕구르망": 8.5,
    "추천": 8.0,
  };
  
  return ratingMap[rating] || null;
}

/**
 * 미슐랭 가격대를 숫자로 변환합니다.
 */
function getMichelinPriceLevel(priceRange?: string): number | null {
  if (!priceRange) return null;
  
  const euroCount = (priceRange.match(/€/g) || []).length;
  return euroCount > 0 ? euroCount : null;
}

/**
 * 특정 도시의 모든 레스토랑에 대해 미슐랭 데이터를 수집합니다.
 */
export async function crawlMichelinForCity(cityId: number): Promise<{ 
  success: boolean; 
  collected: number;
  total: number;
}> {
  console.log(`[MichelinCrawler] Starting crawl for city ID: ${cityId}`);
  
  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[MichelinCrawler] City not found: ${cityId}`);
    return { success: false, collected: 0, total: 0 };
  }

  // 레스토랑과 카페만 대상
  const cityPlaces = await db.select().from(places)
    .where(and(
      eq(places.cityId, cityId),
      or(eq(places.type, "restaurant"), eq(places.type, "cafe"))
    ));
  
  let collected = 0;

  for (const place of cityPlaces) {
    try {
      const success = await collectMichelinData(
        place.id, 
        place.name, 
        place.type,
        city.name, 
        city.country || ""
      );
      
      if (success) collected++;
      
      // API 호출 간격 (1.5초)
      await new Promise(r => setTimeout(r, 1500));
    } catch (error) {
      console.error(`[MichelinCrawler] Error for ${place.name}:`, error);
    }
  }

  console.log(`[MichelinCrawler] Collected ${collected}/${cityPlaces.length} for ${city.name}`);
  return { success: true, collected, total: cityPlaces.length };
}

/**
 * 모든 도시의 레스토랑에 대해 미슐랭 데이터를 수집합니다.
 */
export async function crawlAllMichelin(): Promise<{ 
  success: boolean; 
  totalCollected: number;
  totalPlaces: number;
}> {
  console.log("[MichelinCrawler] Starting full crawl...");
  
  const allCities = await db.select().from(cities);
  let totalCollected = 0;
  let totalPlaces = 0;

  for (const city of allCities) {
    const result = await crawlMichelinForCity(city.id);
    totalCollected += result.collected;
    totalPlaces += result.total;
    
    // 도시 간 대기 (2초)
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[MichelinCrawler] Full crawl complete. ${totalCollected}/${totalPlaces} collected`);
  return { success: true, totalCollected, totalPlaces };
}

/**
 * 미슐랭 수집 통계를 반환합니다.
 */
export async function getMichelinStats(): Promise<{
  totalWithMichelin: number;
  stars3: number;
  stars2: number;
  stars1: number;
  bibGourmand: number;
  recommended: number;
  lastUpdated: Date | null;
}> {
  const michelinData = await db.select({
    michelinType: placeDataSources.michelinType,
    fetchedAt: placeDataSources.fetchedAt,
  })
  .from(placeDataSources)
  .where(eq(placeDataSources.source, "michelin"));

  const stats = {
    totalWithMichelin: michelinData.length,
    stars3: 0,
    stars2: 0,
    stars1: 0,
    bibGourmand: 0,
    recommended: 0,
    lastUpdated: null as Date | null,
  };

  for (const data of michelinData) {
    switch (data.michelinType) {
      case "3스타": stats.stars3++; break;
      case "2스타": stats.stars2++; break;
      case "1스타": stats.stars1++; break;
      case "빕구르망": stats.bibGourmand++; break;
      case "추천": stats.recommended++; break;
    }
    
    if (data.fetchedAt && (!stats.lastUpdated || data.fetchedAt > stats.lastUpdated)) {
      stats.lastUpdated = data.fetchedAt;
    }
  }

  return stats;
}

/**
 * 특정 장소의 미슐랭 정보를 조회합니다.
 */
export async function getPlaceMichelinData(placeId: number): Promise<{
  hasMichelin: boolean;
  rating: string | null;
  type: string | null;
  cuisineType: string | null;
  description: string | null;
  url: string | null;
  fetchedAt: Date | null;
} | null> {
  const [data] = await db.select()
    .from(placeDataSources)
    .where(and(
      eq(placeDataSources.placeId, placeId),
      eq(placeDataSources.source, "michelin")
    ))
    .orderBy(desc(placeDataSources.fetchedAt))
    .limit(1);

  if (!data) return null;

  const rawData = data.rawData as { cuisineType?: string; description?: string } | null;

  return {
    hasMichelin: true,
    rating: data.michelinType,
    type: data.isMichelinStar ? "star" : (data.michelinType ? "other" : null),
    cuisineType: rawData?.cuisineType || null,
    description: rawData?.description || null,
    url: data.sourceUrl,
    fetchedAt: data.fetchedAt,
  };
}
