import { db } from "../db";
import { tripAdvisorData, places, cities } from "../../shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

const GEMINI_MODEL = "gemini-3-flash-preview";
const CACHE_DURATION_HOURS = 48;

interface TripAdvisorResult {
  rating: number;
  reviewCount: number;
  ranking?: number;
  rankingTotal?: number;
  category?: string;
  url?: string;
  excellentReviews?: number;
  veryGoodReviews?: number;
  averageReviews?: number;
  poorReviews?: number;
  terribleReviews?: number;
  recentReviewSummary?: string;
  travelersChoiceAward?: boolean;
  confidence: number;
}

async function searchTripAdvisorWithGemini(
  placeName: string,
  placeType: string,
  cityName: string,
  countryName: string = ""
): Promise<TripAdvisorResult | null> {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) { console.error("[TripAdvisor] Gemini API 키 없음"); return null; }
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Search TripAdvisor for "${placeName}" in ${cityName} ${countryName}.

Find and extract:
1. TripAdvisor rating (1.0-5.0)
2. Total review count
3. Ranking in the city (e.g., "#5 of 1,203 things to do in Seoul")
4. Review breakdown (Excellent, Very Good, Average, Poor, Terrible)
5. Recent review summary
6. Travelers' Choice Award status

Return JSON:
{
  "found": true/false,
  "rating": 4.5,
  "reviewCount": 12345,
  "ranking": 5,
  "rankingTotal": 1203,
  "category": "서울의 관광명소",
  "url": "tripadvisor.com/...",
  "reviewBreakdown": {
    "excellent": 8000,
    "veryGood": 3000,
    "average": 1000,
    "poor": 200,
    "terrible": 145
  },
  "recentReviewSummary": "방문객들은 경복궁의 아름다운 건축과 역사적 가치를 높이 평가합니다...",
  "travelersChoiceAward": true,
  "confidence": 0.0-1.0
}

Return found: false if place not found on TripAdvisor.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.found && parsed.rating) {
        return {
          rating: parsed.rating,
          reviewCount: parsed.reviewCount || 0,
          ranking: parsed.ranking,
          rankingTotal: parsed.rankingTotal,
          category: parsed.category,
          url: parsed.url,
          excellentReviews: parsed.reviewBreakdown?.excellent,
          veryGoodReviews: parsed.reviewBreakdown?.veryGood,
          averageReviews: parsed.reviewBreakdown?.average,
          poorReviews: parsed.reviewBreakdown?.poor,
          terribleReviews: parsed.reviewBreakdown?.terrible,
          recentReviewSummary: parsed.recentReviewSummary,
          travelersChoiceAward: parsed.travelersChoiceAward || false,
          confidence: parsed.confidence || 0.7,
        };
      }
    }
  } catch (error) {
    console.error("[TripAdvisorCrawler] Gemini search error:", error);
  }
  
  return null;
}

async function collectTripAdvisorData(
  placeId: number,
  cityId: number,
  placeName: string,
  placeType: string,
  cityName: string,
  countryName: string = ""
): Promise<boolean> {
  const existingData = await db.select()
    .from(tripAdvisorData)
    .where(and(
      eq(tripAdvisorData.placeId, placeId),
      gte(tripAdvisorData.fetchedAt, new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000))
    ))
    .limit(1);

  if (existingData.length > 0) {
    console.log(`[TripAdvisorCrawler] Cache hit for ${placeName}`);
    return true;
  }

  const result = await searchTripAdvisorWithGemini(placeName, placeType, cityName, countryName);
  
  if (result) {
    await db.insert(tripAdvisorData).values({
      placeId,
      cityId,
      tripAdvisorRating: result.rating,
      tripAdvisorReviewCount: result.reviewCount,
      tripAdvisorRanking: result.ranking,
      tripAdvisorRankingTotal: result.rankingTotal,
      tripAdvisorCategory: result.category,
      tripAdvisorUrl: result.url,
      excellentReviews: result.excellentReviews,
      veryGoodReviews: result.veryGoodReviews,
      averageReviews: result.averageReviews,
      poorReviews: result.poorReviews,
      terribleReviews: result.terribleReviews,
      recentReviewSummary: result.recentReviewSummary,
      travelersChoiceAward: result.travelersChoiceAward,
      confidenceScore: result.confidence,
      rawData: { extractedAt: new Date().toISOString() },
      expiresAt: new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000),
    });
    
    console.log(`[TripAdvisorCrawler] Collected ${placeName}: ${result.rating}/5 (${result.reviewCount} reviews)`);
    return true;
  }
  
  return false;
}

export async function crawlTripAdvisorForCity(cityId: number): Promise<{ success: boolean; collected: number }> {
  console.log(`[TripAdvisorCrawler] Starting crawl for city ID: ${cityId}`);
  
  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[TripAdvisorCrawler] City not found: ${cityId}`);
    return { success: false, collected: 0 };
  }

  const cityPlaces = await db.select().from(places).where(eq(places.cityId, cityId));
  let collected = 0;

  for (const place of cityPlaces) {
    try {
      const success = await collectTripAdvisorData(
        place.id, 
        cityId, 
        place.name, 
        place.type,
        city.name, 
        city.country || ""
      );
      
      if (success) collected++;
      
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`[TripAdvisorCrawler] Error for ${place.name}:`, error);
    }
  }

  console.log(`[TripAdvisorCrawler] Collected ${collected} entries for ${city.name}`);
  return { success: true, collected };
}

export async function crawlAllTripAdvisor(): Promise<{ success: boolean; total: number }> {
  console.log("[TripAdvisorCrawler] Starting full crawl...");
  
  const allCities = await db.select().from(cities);
  let total = 0;

  for (const city of allCities) {
    const result = await crawlTripAdvisorForCity(city.id);
    total += result.collected;
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[TripAdvisorCrawler] Full crawl complete. Total: ${total}`);
  return { success: true, total };
}

export async function getTripAdvisorStats(): Promise<{
  total: number;
  avgRating: number;
  withAwards: number;
  topRanked: Array<{ placeName: string; rating: number; reviewCount: number; ranking?: number }>;
}> {
  const allData = await db.select({
    tripAdvisorRating: tripAdvisorData.tripAdvisorRating,
    tripAdvisorReviewCount: tripAdvisorData.tripAdvisorReviewCount,
    tripAdvisorRanking: tripAdvisorData.tripAdvisorRanking,
    travelersChoiceAward: tripAdvisorData.travelersChoiceAward,
    placeId: tripAdvisorData.placeId,
  }).from(tripAdvisorData);

  const placeIds = allData.map(d => d.placeId).filter(Boolean) as number[];
  const placesData = placeIds.length > 0 
    ? await db.select({ id: places.id, name: places.name }).from(places)
    : [];
  
  const placeNameMap = new Map(placesData.map(p => [p.id, p.name]));
  
  const validRatings = allData.filter(d => d.tripAdvisorRating !== null);
  const avgRating = validRatings.length > 0
    ? validRatings.reduce((sum, d) => sum + (d.tripAdvisorRating || 0), 0) / validRatings.length
    : 0;

  const withAwards = allData.filter(d => d.travelersChoiceAward).length;

  const topRanked = allData
    .filter(d => d.tripAdvisorRating && d.tripAdvisorReviewCount)
    .sort((a, b) => (b.tripAdvisorReviewCount || 0) - (a.tripAdvisorReviewCount || 0))
    .slice(0, 10)
    .map(d => ({
      placeName: placeNameMap.get(d.placeId!) || "Unknown",
      rating: d.tripAdvisorRating || 0,
      reviewCount: d.tripAdvisorReviewCount || 0,
      ranking: d.tripAdvisorRanking || undefined,
    }));

  return {
    total: allData.length,
    avgRating: Math.round(avgRating * 100) / 100,
    withAwards,
    topRanked,
  };
}

export async function getPlaceTripAdvisorData(placeId: number): Promise<{
  rating: number | null;
  reviewCount: number | null;
  ranking: string | null;
  travelersChoiceAward: boolean;
  recentReviewSummary: string | null;
  fetchedAt: Date | null;
} | null> {
  const [data] = await db.select()
    .from(tripAdvisorData)
    .where(eq(tripAdvisorData.placeId, placeId))
    .orderBy(desc(tripAdvisorData.fetchedAt))
    .limit(1);

  if (!data) return null;

  return {
    rating: data.tripAdvisorRating,
    reviewCount: data.tripAdvisorReviewCount,
    ranking: data.tripAdvisorRanking && data.tripAdvisorRankingTotal
      ? `#${data.tripAdvisorRanking} of ${data.tripAdvisorRankingTotal}`
      : null,
    travelersChoiceAward: data.travelersChoiceAward || false,
    recentReviewSummary: data.recentReviewSummary,
    fetchedAt: data.fetchedAt,
  };
}
