import { db } from "../db";
import { naverBlogPosts, cities, places } from "../../shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

const CACHE_DURATION_HOURS = 24;

interface NaverBlogSearchResult {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;
}

interface ExtractedPlace {
  placeName: string;
  sentiment: "positive" | "neutral" | "negative";
  keywords: string[];
  rating?: number;
}

async function searchNaverBlog(query: string): Promise<NaverBlogSearchResult[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log("[NaverBlog] No API keys, using Gemini web search fallback");
    return searchBlogWithGemini(query);
  }

  try {
    const url = new URL("https://openapi.naver.com/v1/search/blog.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "20");
    url.searchParams.set("sort", "date");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      throw new Error(`Naver API error: ${response.status}`);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("[NaverBlog] API error, falling back to Gemini:", error);
    return searchBlogWithGemini(query);
  }
}

async function searchBlogWithGemini(query: string): Promise<NaverBlogSearchResult[]> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

    const response = await ai.models.generateContent({
      model: "gemini-3.0-flash-preview",
      contents: `Search for Korean travel blog posts about: ${query}

Find recent blog posts from Korean travelers. Return JSON array:
[{
  "title": "블로그 제목",
  "link": "URL",
  "description": "요약 (200자)",
  "bloggername": "블로거명",
  "bloggerlink": "블로그 홈 URL",
  "postdate": "20260108"
}]

Return up to 10 results. If no results, return empty array [].`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("[NaverBlog] Gemini search error:", error);
  }

  return [];
}

async function extractPlacesFromBlog(
  title: string,
  description: string,
  cityName: string
): Promise<{ places: ExtractedPlace[]; sentimentScore: number }> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

    const response = await ai.models.generateContent({
      model: "gemini-3.0-flash-preview",
      contents: `Analyze this Korean travel blog post about ${cityName}:

Title: ${title}
Description: ${description}

Extract mentioned places and analyze sentiment. Return JSON:
{
  "places": [{
    "placeName": "장소명 (원어)",
    "sentiment": "positive" | "neutral" | "negative",
    "keywords": ["분위기", "맛", "서비스"],
    "rating": 8.5
  }],
  "overallSentiment": 0.0 to 1.0
}

Focus on restaurants, attractions, cafes. If no specific places, return empty places array.`,
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        places: parsed.places || [],
        sentimentScore: parsed.overallSentiment || 0.5,
      };
    }
  } catch (error) {
    console.error("[NaverBlog] Place extraction error:", error);
  }

  return { places: [], sentimentScore: 0.5 };
}

export async function crawlBlogsForCity(cityId: number): Promise<{
  success: boolean;
  postsCollected: number;
  placesExtracted: number;
}> {
  console.log(`[NaverBlog] Starting blog crawl for city ID: ${cityId}`);

  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[NaverBlog] City not found: ${cityId}`);
    return { success: false, postsCollected: 0, placesExtracted: 0 };
  }

  const searchQueries = [
    `${city.name} 여행 맛집 추천`,
    `${city.name} 관광지 후기`,
    `${city.name} 여행 코스`,
  ];

  let postsCollected = 0;
  let placesExtracted = 0;

  for (const query of searchQueries) {
    const blogPosts = await searchNaverBlog(query);

    for (const post of blogPosts) {
      try {
        const existingPost = await db
          .select()
          .from(naverBlogPosts)
          .where(eq(naverBlogPosts.postUrl, post.link))
          .limit(1);

        if (existingPost.length > 0) {
          continue;
        }

        const { places: extractedPlaces, sentimentScore } = await extractPlacesFromBlog(
          post.title,
          post.description,
          city.name
        );

        const postDate = post.postdate
          ? new Date(
              parseInt(post.postdate.slice(0, 4)),
              parseInt(post.postdate.slice(4, 6)) - 1,
              parseInt(post.postdate.slice(6, 8))
            )
          : null;

        await db.insert(naverBlogPosts).values({
          cityId,
          bloggerName: post.bloggername,
          bloggerUrl: post.bloggerlink,
          postTitle: post.title.replace(/<[^>]*>/g, ""),
          postUrl: post.link,
          postDate,
          description: post.description.replace(/<[^>]*>/g, ""),
          extractedPlaces: extractedPlaces,
          sentimentScore,
          isProcessed: extractedPlaces.length > 0,
        });

        postsCollected++;
        placesExtracted += extractedPlaces.length;

        await new Promise((r) => setTimeout(r, 500));
      } catch (error) {
        console.error(`[NaverBlog] Error processing post:`, error);
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(
    `[NaverBlog] Crawl complete for ${city.name}: ${postsCollected} posts, ${placesExtracted} places`
  );
  return { success: true, postsCollected, placesExtracted };
}

export async function crawlAllBlogs(): Promise<{
  success: boolean;
  totalPosts: number;
  totalPlaces: number;
}> {
  console.log("[NaverBlog] Starting full blog crawl...");

  const allCities = await db.select().from(cities);
  let totalPosts = 0;
  let totalPlaces = 0;

  for (const city of allCities) {
    const result = await crawlBlogsForCity(city.id);
    totalPosts += result.postsCollected;
    totalPlaces += result.placesExtracted;
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`[NaverBlog] Full crawl complete: ${totalPosts} posts, ${totalPlaces} places`);
  return { success: true, totalPosts, totalPlaces };
}

export async function getBlogStats(): Promise<{
  total: number;
  processed: number;
  byCity: Record<string, number>;
  recentPosts: Array<{
    id: number;
    postTitle: string;
    cityId: number | null;
    sentimentScore: number | null;
    fetchedAt: Date;
  }>;
}> {
  const allPosts = await db.select().from(naverBlogPosts);
  const processedPosts = allPosts.filter((p) => p.isProcessed);

  const byCity: Record<string, number> = {};
  for (const post of allPosts) {
    const key = post.cityId?.toString() || "unknown";
    byCity[key] = (byCity[key] || 0) + 1;
  }

  const recentPosts = await db
    .select({
      id: naverBlogPosts.id,
      postTitle: naverBlogPosts.postTitle,
      cityId: naverBlogPosts.cityId,
      sentimentScore: naverBlogPosts.sentimentScore,
      fetchedAt: naverBlogPosts.fetchedAt,
    })
    .from(naverBlogPosts)
    .orderBy(desc(naverBlogPosts.fetchedAt))
    .limit(10);

  return {
    total: allPosts.length,
    processed: processedPosts.length,
    byCity,
    recentPosts,
  };
}

export async function getCityBlogInsights(cityId: number): Promise<{
  totalPosts: number;
  averageSentiment: number;
  topPlaces: Array<{ name: string; mentionCount: number; avgSentiment: string }>;
  trendingKeywords: string[];
}> {
  const posts = await db
    .select()
    .from(naverBlogPosts)
    .where(eq(naverBlogPosts.cityId, cityId));

  const placeStats: Record<string, { count: number; sentiments: string[] }> = {};
  const allKeywords: string[] = [];

  for (const post of posts) {
    if (post.extractedPlaces && Array.isArray(post.extractedPlaces)) {
      for (const place of post.extractedPlaces as ExtractedPlace[]) {
        if (!placeStats[place.placeName]) {
          placeStats[place.placeName] = { count: 0, sentiments: [] };
        }
        placeStats[place.placeName].count++;
        placeStats[place.placeName].sentiments.push(place.sentiment);
        allKeywords.push(...place.keywords);
      }
    }
  }

  const topPlaces = Object.entries(placeStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([name, stats]) => {
      const posCount = stats.sentiments.filter((s) => s === "positive").length;
      const avgSentiment =
        posCount > stats.count / 2
          ? "positive"
          : posCount < stats.count / 3
          ? "negative"
          : "neutral";
      return { name, mentionCount: stats.count, avgSentiment };
    });

  const keywordCount: Record<string, number> = {};
  for (const kw of allKeywords) {
    keywordCount[kw] = (keywordCount[kw] || 0) + 1;
  }
  const trendingKeywords = Object.entries(keywordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([kw]) => kw);

  const avgSentiment =
    posts.length > 0
      ? posts.reduce((sum, p) => sum + (p.sentimentScore || 0.5), 0) / posts.length
      : 0.5;

  return {
    totalPosts: posts.length,
    averageSentiment: Math.round(avgSentiment * 100) / 100,
    topPlaces,
    trendingKeywords,
  };
}
