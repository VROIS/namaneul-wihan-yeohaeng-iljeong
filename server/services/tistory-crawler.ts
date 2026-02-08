/**
 * 티스토리 블로그 크롤러
 * Gemini Web Search를 활용하여 한국어 티스토리 블로그에서 여행 정보를 수집합니다.
 */
import { GoogleGenAI } from "@google/genai";
import { db } from "../db";
import { cities, places, geminiWebSearchCache } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { getSearchTools } from "./gemini-search-limiter";
import { safeParseJSON, safeDbOperation } from "./crawler-utils";

// Lazy initialization
let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

interface TistoryBlogPost {
  title: string;
  url: string;
  description: string;
  blogName: string;
  postDate?: string;
  thumbnailUrl?: string;
}

interface ExtractedTravelInfo {
  placeName: string;
  placeType: "restaurant" | "cafe" | "attraction" | "hotel" | "other";
  address?: string;
  sentiment: "positive" | "neutral" | "negative";
  rating?: number;
  priceInfo?: string;
  tips?: string[];
  keywords: string[];
}

interface TistorySearchResult {
  posts: TistoryBlogPost[];
  extractedPlaces: ExtractedTravelInfo[];
  confidenceScore: number;
}

/**
 * Gemini Web Search를 통해 티스토리 블로그 검색
 */
async function searchTistoryBlogs(query: string, city: string): Promise<TistorySearchResult> {
  console.log(`[TistoryCrawler] Searching Tistory blogs for: ${query}`);

  try {
    const searchQuery = `site:tistory.com ${city} ${query} 여행 후기`;
    
    // 💰 프롬프트 최적화: extractedPlaces 제거(DB 중복), posts 5개로 축소, 필드 최소화
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: `티스토리 블로그 검색: "${searchQuery}"
JSON 반환:
{
  "posts": [{"title":"제목","url":"URL","description":"요약 100자"}],
  "confidenceScore": 0.8
}
최대 5개. 없으면 빈 배열.` }] }],
      config: {
        tools: getSearchTools("tistory"),
      },
    });

    const text = response.text || "";
    const parsed = safeParseJSON<any>(text, "TistoryCrawler-search");
    
    if (parsed) {
      return {
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        extractedPlaces: [], // DB에 이미 있는 데이터와 중복 방지
        confidenceScore: parsed.confidenceScore || 0.5,
      };
    }
  } catch (error) {
    console.error("[TistoryCrawler] Search error:", error);
  }

  return { posts: [], extractedPlaces: [], confidenceScore: 0 };
}

/**
 * 특정 장소에 대한 티스토리 블로그 리뷰 검색
 */
export async function searchPlaceReviews(
  placeName: string,
  cityName: string,
  placeId?: number
): Promise<{
  reviews: Array<{
    source: string;
    rating?: number;
    summary: string;
    url?: string;
  }>;
  averageSentiment: number;
  keywords: string[];
}> {
  console.log(`[TistoryCrawler] Searching reviews for ${placeName} in ${cityName}`);

  // 캐시 확인
  const cacheKey = `tistory_${placeName}_${cityName}`;
  const cached = await db
    .select()
    .from(geminiWebSearchCache)
    .where(
      and(
        eq(geminiWebSearchCache.searchQuery, cacheKey),
        eq(geminiWebSearchCache.searchType, "tistory_review"),
        gte(geminiWebSearchCache.fetchedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      )
    )
    .limit(1);

  if (cached.length > 0) {
    console.log(`[TistoryCrawler] Using cached data for ${placeName}`);
    return cached[0].extractedData as any;
  }

  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: `티스토리 블로그에서 "${placeName}" (${cityName}) 에 대한 리뷰를 검색해주세요.

JSON 형식으로 응답해주세요:
{
  "reviews": [
    {
      "source": "블로그 이름",
      "rating": 8.5,
      "summary": "리뷰 요약 (한 문장)",
      "url": "https://xxx.tistory.com/xxx"
    }
  ],
  "averageSentiment": 0.8,
  "keywords": ["분위기", "맛", "친절"]
}

최대 5개 리뷰, 실제 블로그 포스트만 포함해주세요.` }] }],
      config: {
        tools: getSearchTools("tistory"),
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      // 캐시 저장
      await db.insert(geminiWebSearchCache).values({
        placeId: placeId || null,
        searchQuery: cacheKey,
        searchType: "tistory_review",
        rawResult: { query: `${placeName} ${cityName}`, response: text },
        extractedData: result,
        confidenceScore: 0.7,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      return result;
    }
  } catch (error) {
    console.error("[TistoryCrawler] Place review search error:", error);
  }

  return { reviews: [], averageSentiment: 0.5, keywords: [] };
}

/**
 * 도시별 티스토리 블로그 크롤링
 */
export async function crawlTistoryForCity(cityId: number): Promise<{
  success: boolean;
  postsCollected: number;
  placesExtracted: number;
}> {
  console.log(`[TistoryCrawler] Starting crawl for city ID: ${cityId}`);

  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[TistoryCrawler] City not found: ${cityId}`);
    return { success: false, postsCollected: 0, placesExtracted: 0 };
  }

  const searchQueries = [
    `${city.name} 맛집 추천`,
    `${city.name} 관광지 후기`,
    `${city.name} 여행 코스`,
    `${city.name} 카페 추천`,
  ];

  let totalPosts = 0;
  let totalPlaces = 0;

  for (const query of searchQueries) {
    const result = await searchTistoryBlogs(query, city.name);
    totalPosts += result.posts.length;
    totalPlaces += result.extractedPlaces.length;

    // 결과 캐싱
    if (result.posts.length > 0 || result.extractedPlaces.length > 0) {
      const cacheKey = `tistory_city_${cityId}_${query}`;
      await db.insert(geminiWebSearchCache).values({
        cityId: cityId,
        searchQuery: cacheKey,
        searchType: "tistory_city",
        rawResult: result,
        extractedData: {
          posts: result.posts,
          places: result.extractedPlaces,
        },
        confidenceScore: result.confidenceScore,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(
    `[TistoryCrawler] City crawl complete for ${city.name}: ${totalPosts} posts, ${totalPlaces} places`
  );
  return { success: true, postsCollected: totalPosts, placesExtracted: totalPlaces };
}

/**
 * 전체 도시 티스토리 크롤링
 */
export async function crawlAllTistory(): Promise<{
  success: boolean;
  totalPosts: number;
  totalPlaces: number;
  citiesCrawled: number;
}> {
  console.log("[TistoryCrawler] Starting full Tistory crawl...");

  const allCities = await db.select().from(cities);
  let totalPosts = 0;
  let totalPlaces = 0;

  for (const city of allCities) {
    const result = await crawlTistoryForCity(city.id);
    totalPosts += result.postsCollected;
    totalPlaces += result.placesExtracted;

    // Rate limiting between cities
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(
    `[TistoryCrawler] Full crawl complete: ${totalPosts} posts, ${totalPlaces} places from ${allCities.length} cities`
  );
  return {
    success: true,
    totalPosts,
    totalPlaces,
    citiesCrawled: allCities.length,
  };
}

/**
 * 티스토리 크롤러 통계
 */
export async function getTistoryStats(): Promise<{
  totalCached: number;
  byCity: Record<string, number>;
  recentSearches: Array<{
    query: string;
    searchType: string;
    fetchedAt: Date;
    confidenceScore: number | null;
  }>;
}> {
  const allCached = await db
    .select()
    .from(geminiWebSearchCache)
    .where(
      eq(geminiWebSearchCache.searchType, "tistory_review")
    );

  const tistoryCityCached = await db
    .select()
    .from(geminiWebSearchCache)
    .where(eq(geminiWebSearchCache.searchType, "tistory_city"));

  const byCity: Record<string, number> = {};
  for (const cache of tistoryCityCached) {
    const key = cache.cityId?.toString() || "unknown";
    byCity[key] = (byCity[key] || 0) + 1;
  }

  const recentSearches = await db
    .select({
      query: geminiWebSearchCache.searchQuery,
      searchType: geminiWebSearchCache.searchType,
      fetchedAt: geminiWebSearchCache.fetchedAt,
      confidenceScore: geminiWebSearchCache.confidenceScore,
    })
    .from(geminiWebSearchCache)
    .where(
      eq(geminiWebSearchCache.searchType, "tistory_review")
    )
    .orderBy(desc(geminiWebSearchCache.fetchedAt))
    .limit(10);

  return {
    totalCached: allCached.length + tistoryCityCached.length,
    byCity,
    recentSearches,
  };
}

export const tistoryCrawler = {
  searchPlaceReviews,
  crawlTistoryForCity,
  crawlAllTistory,
  getTistoryStats,
};
