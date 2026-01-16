/**
 * 티스토리 블로그 크롤러
 * Gemini Web Search를 활용하여 한국어 티스토리 블로그에서 여행 정보를 수집합니다.
 */
import { GoogleGenAI } from "@google/genai";
import { db } from "../db";
import { cities, places, geminiWebSearchCache } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

// Lazy initialization
let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    ai = new GoogleGenAI({
      apiKey,
      ...(baseUrl ? {
        httpOptions: {
          apiVersion: "",
          baseUrl,
        },
      } : {}),
    });
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
    
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: `당신은 한국 여행 블로그 분석 전문가입니다.

다음 검색어로 티스토리 블로그를 검색하고, 여행 정보를 추출해주세요:
"${searchQuery}"

응답을 다음 JSON 형식으로 제공해주세요:
{
  "posts": [
    {
      "title": "블로그 포스트 제목",
      "url": "https://xxx.tistory.com/xxx",
      "description": "포스트 요약 (200자 이내)",
      "blogName": "블로그 이름",
      "postDate": "2025-01-01"
    }
  ],
  "extractedPlaces": [
    {
      "placeName": "장소명 (원어 포함)",
      "placeType": "restaurant|cafe|attraction|hotel|other",
      "address": "주소 (가능한 경우)",
      "sentiment": "positive|neutral|negative",
      "rating": 8.5,
      "priceInfo": "가격 정보 (예: 1인 30유로)",
      "tips": ["팁1", "팁2"],
      "keywords": ["분위기", "맛", "서비스"]
    }
  ],
  "confidenceScore": 0.8
}

중요:
- 실제 존재하는 티스토리 블로그 포스트만 포함해주세요
- 최근 2년 이내 포스트 우선
- 최대 10개 포스트, 최대 20개 장소
- 정보가 없으면 빈 배열 반환` }] }],
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        posts: parsed.posts || [],
        extractedPlaces: parsed.extractedPlaces || [],
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
        tools: [{ googleSearch: {} }],
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
