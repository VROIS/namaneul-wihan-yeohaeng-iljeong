import { db } from "../db";
import { geminiWebSearchCache, places, cities } from "../../shared/schema";
import { eq, and, gte, or } from "drizzle-orm";
import { getSearchTools } from "./gemini-search-limiter";

interface WebSearchResult {
  michelinStars?: number;
  michelinDescription?: string;
  tripAdvisorRating?: number;
  tripAdvisorReviewCount?: number;
  expertReviews?: { source: string; rating: number; summary: string }[];
  awards?: string[];
}

async function searchWithGemini(query: string, searchType: string): Promise<{
  rawResult: any;
  extractedData: WebSearchResult;
  confidenceScore: number;
}> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    
    let systemPrompt = "";
    switch (searchType) {
      case "michelin":
        systemPrompt = `You are a culinary expert. Search for Michelin star information about this restaurant.
Return JSON with:
{
  "michelinStars": number or null (0-3),
  "michelinDescription": "Description from Michelin Guide if available",
  "awards": ["list of culinary awards"],
  "confidenceScore": 0-1 (how confident you are in this information)
}`;
        break;
      case "tripadvisor":
        systemPrompt = `You are a travel expert. Find TripAdvisor information about this place.
Return JSON with:
{
  "tripAdvisorRating": number (1-5 scale),
  "tripAdvisorReviewCount": number,
  "expertReviews": [{"source": "TripAdvisor", "rating": number, "summary": "brief summary"}],
  "confidenceScore": 0-1 (how confident you are in this information)
}`;
        break;
      case "expert_review":
        systemPrompt = `You are a travel and food critic. Find expert reviews about this place.
Return JSON with:
{
  "expertReviews": [
    {"source": "source name", "rating": number (1-10 scale), "summary": "brief review summary"}
  ],
  "awards": ["list of notable awards or recognition"],
  "confidenceScore": 0-1 (how confident you are in this information)
}`;
        break;
      default:
        systemPrompt = `Search for comprehensive information about this place. Return as JSON.`;
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `${systemPrompt}\n\nSearch query: ${query}`,
      config: {
        tools: getSearchTools("gemini-web-search")
      }
    });
    
    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const confidenceScore = parsed.confidenceScore || 0.5;
      delete parsed.confidenceScore;
      
      return {
        rawResult: { query, response: text },
        extractedData: parsed,
        confidenceScore
      };
    }
    
    return {
      rawResult: { query, response: text },
      extractedData: {},
      confidenceScore: 0.2
    };
  } catch (error) {
    console.error("[GeminiWebSearch] Search error:", error);
    return {
      rawResult: { error: String(error) },
      extractedData: {},
      confidenceScore: 0
    };
  }
}

export async function searchMichelinInfo(placeName: string, cityName: string, placeId?: number): Promise<WebSearchResult> {
  console.log(`[GeminiWebSearch] Searching Michelin info for ${placeName} in ${cityName}...`);
  
  const cacheKey = `${placeName} ${cityName}`;
  const existingCache = await db.select()
    .from(geminiWebSearchCache)
    .where(and(
      eq(geminiWebSearchCache.searchQuery, cacheKey),
      eq(geminiWebSearchCache.searchType, "michelin"),
      gte(geminiWebSearchCache.fetchedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    ))
    .limit(1);
  
  if (existingCache.length > 0) {
    console.log(`[GeminiWebSearch] Using cached Michelin data for ${placeName}`);
    return existingCache[0].extractedData as WebSearchResult;
  }
  
  const query = `${placeName} ${cityName} Michelin Guide star rating restaurant review`;
  const result = await searchWithGemini(query, "michelin");
  
  await db.insert(geminiWebSearchCache).values({
    placeId: placeId || null,
    searchQuery: cacheKey,
    searchType: "michelin",
    rawResult: result.rawResult,
    extractedData: result.extractedData,
    confidenceScore: result.confidenceScore,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  
  return result.extractedData;
}

export async function searchTripAdvisorInfo(placeName: string, cityName: string, placeId?: number): Promise<WebSearchResult> {
  console.log(`[GeminiWebSearch] Searching TripAdvisor info for ${placeName} in ${cityName}...`);
  
  const cacheKey = `${placeName} ${cityName}`;
  const existingCache = await db.select()
    .from(geminiWebSearchCache)
    .where(and(
      eq(geminiWebSearchCache.searchQuery, cacheKey),
      eq(geminiWebSearchCache.searchType, "tripadvisor"),
      gte(geminiWebSearchCache.fetchedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    ))
    .limit(1);
  
  if (existingCache.length > 0) {
    console.log(`[GeminiWebSearch] Using cached TripAdvisor data for ${placeName}`);
    return existingCache[0].extractedData as WebSearchResult;
  }
  
  const query = `${placeName} ${cityName} TripAdvisor rating reviews`;
  const result = await searchWithGemini(query, "tripadvisor");
  
  await db.insert(geminiWebSearchCache).values({
    placeId: placeId || null,
    searchQuery: cacheKey,
    searchType: "tripadvisor",
    rawResult: result.rawResult,
    extractedData: result.extractedData,
    confidenceScore: result.confidenceScore,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  
  return result.extractedData;
}

export async function searchExpertReviews(placeName: string, cityName: string, placeId?: number): Promise<WebSearchResult> {
  console.log(`[GeminiWebSearch] Searching expert reviews for ${placeName} in ${cityName}...`);
  
  const cacheKey = `${placeName} ${cityName}`;
  const existingCache = await db.select()
    .from(geminiWebSearchCache)
    .where(and(
      eq(geminiWebSearchCache.searchQuery, cacheKey),
      eq(geminiWebSearchCache.searchType, "expert_review"),
      gte(geminiWebSearchCache.fetchedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    ))
    .limit(1);
  
  if (existingCache.length > 0) {
    console.log(`[GeminiWebSearch] Using cached expert review data for ${placeName}`);
    return existingCache[0].extractedData as WebSearchResult;
  }
  
  const query = `${placeName} ${cityName} expert review food critic travel blog`;
  const result = await searchWithGemini(query, "expert_review");
  
  await db.insert(geminiWebSearchCache).values({
    placeId: placeId || null,
    searchQuery: cacheKey,
    searchType: "expert_review",
    rawResult: result.rawResult,
    extractedData: result.extractedData,
    confidenceScore: result.confidenceScore,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  
  return result.extractedData;
}

export async function enrichPlaceWithWebData(placeId: number): Promise<{
  michelin: WebSearchResult;
  tripAdvisor: WebSearchResult;
  expertReviews: WebSearchResult;
}> {
  const [place] = await db.select()
    .from(places)
    .where(eq(places.id, placeId))
    .leftJoin(cities, eq(places.cityId, cities.id))
    .limit(1);
  
  if (!place || !place.places || !place.cities) {
    throw new Error("Place not found");
  }
  
  const placeName = place.places.name;
  const cityName = place.cities.name;
  
  const [michelin, tripAdvisor, expertReviews] = await Promise.all([
    searchMichelinInfo(placeName, cityName, placeId),
    searchTripAdvisorInfo(placeName, cityName, placeId),
    searchExpertReviews(placeName, cityName, placeId)
  ]);
  
  return { michelin, tripAdvisor, expertReviews };
}

export async function getWebSearchStats() {
  const [total] = await db.select({ count: db.$count(geminiWebSearchCache) }).from(geminiWebSearchCache);
  
  const byType = await db.select({
    searchType: geminiWebSearchCache.searchType,
  }).from(geminiWebSearchCache);
  
  const michelinCount = byType.filter(r => r.searchType === "michelin").length;
  const tripAdvisorCount = byType.filter(r => r.searchType === "tripadvisor").length;
  const expertCount = byType.filter(r => r.searchType === "expert_review").length;
  
  return {
    total: total.count,
    michelin: michelinCount,
    tripAdvisor: tripAdvisorCount,
    expert: expertCount
  };
}
