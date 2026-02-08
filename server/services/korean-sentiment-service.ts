/**
 * 한국 감성 데이터 서비스
 * Instagram/네이버 블로그/YouTube 데이터를 Gemini Web Search로 수집하고 캐시에 저장
 * 
 * 동기화 전략:
 * 1. 일정 생성 시 캐시 먼저 조회 (7일 이내면 사용)
 * 2. 캐시 없거나 오래됨 → Gemini Web Search로 실시간 조회
 * 3. 결과를 geminiWebSearchCache에 저장
 */

import { db } from "../db";
import { geminiWebSearchCache, cities, naverBlogPosts, youtubePlaceMentions, instagramHashtags } from "@shared/schema";
// places import 제거 - 현재 미사용
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

// Gemini AI 인스턴스
let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

// 캐시 유효기간 (7일)
const CACHE_VALIDITY_DAYS = 7;

// 한국 감성 데이터 타입
export interface KoreanSentimentData {
  instagram: {
    postCount: number;
    trendingHashtags: string[];
    score: number; // 0-2점
  };
  naverBlog: {
    postCount: number;
    sentiment: 'very_positive' | 'positive' | 'neutral' | 'negative';
    keywords: string[];
    score: number; // 0-2점
  };
  youtube: {
    mentionCount: number;
    channels: string[];
    score: number; // 0-2점
  };
  totalBonus: number; // Korean_Sentiment_Bonus 합계
  lastUpdated: Date;
}

// 장소별 감성 데이터 타입
export interface PlaceSentimentData {
  placeId: number;
  placeName: string;
  cityName: string;
  sentiment: KoreanSentimentData;
}

/**
 * 캐시에서 한국 감성 데이터 조회
 */
async function getCachedSentiment(
  cityName: string,
  searchType: string = 'korean_sentiment'
): Promise<KoreanSentimentData | null> {
  try {
    const validDate = new Date();
    validDate.setDate(validDate.getDate() - CACHE_VALIDITY_DAYS);

    const cached = await db.select()
      .from(geminiWebSearchCache)
      .where(and(
        eq(geminiWebSearchCache.searchType, searchType),
        sql`${geminiWebSearchCache.searchQuery} LIKE ${`%${cityName}%`}`,
        gte(geminiWebSearchCache.fetchedAt, validDate)
      ))
      .orderBy(desc(geminiWebSearchCache.fetchedAt))
      .limit(1);

    if (cached.length > 0 && cached[0].extractedData) {
      const data = cached[0].extractedData as any;
      return {
        instagram: data.instagram || { postCount: 0, trendingHashtags: [], score: 0 },
        naverBlog: data.naverBlog || { postCount: 0, sentiment: 'neutral', keywords: [], score: 0 },
        youtube: data.youtube || { mentionCount: 0, channels: [], score: 0 },
        totalBonus: data.totalBonus || 0,
        lastUpdated: new Date(cached[0].fetchedAt)
      };
    }
    return null;
  } catch (error) {
    console.error('[KoreanSentiment] Cache lookup error:', error);
    return null;
  }
}

/**
 * Gemini Web Search로 한국 감성 데이터 수집
 */
async function fetchSentimentWithGemini(
  cityName: string,
  vibes: string[]
): Promise<KoreanSentimentData> {
  const vibeKorean = vibes.map(v => {
    const map: Record<string, string> = {
      'Healing': '힐링',
      'Foodie': '미식/맛집',
      'Hotspot': '핫플/인스타',
      'Adventure': '모험/액티비티',
      'Culture': '문화/예술',
      'Romantic': '로맨틱/데이트'
    };
    return map[v] || v;
  }).join(', ');

  const prompt = `당신은 한국인 여행 트렌드 분석 전문가입니다. 
${cityName} 여행에 대한 한국인 감성 데이터를 분석해주세요.
사용자 관심 바이브: ${vibeKorean}

다음 정보를 JSON 형식으로 제공해주세요:

1. Instagram 인기도 (한국인 기준)
   - ${cityName} 관련 인기 해시태그 (예: #파리여행, #에펠탑 등)
   - 대략적인 게시물 수 추정
   - 한국인들이 많이 찍는 포토스팟

2. 네이버 블로그 감성
   - ${cityName} 여행 후기의 전반적인 감성 (매우긍정/긍정/중립/부정)
   - 자주 언급되는 키워드
   - 한국인들이 추천하는 장소

3. YouTube 언급
   - ${cityName}을 다룬 한국 여행 유튜버들
   - 대략적인 영상 수
   - 유튜버들이 추천한 장소

JSON 형식:
{
  "instagram": {
    "estimatedPostCount": 숫자,
    "trendingHashtags": ["해시태그1", "해시태그2", ...],
    "photoSpots": ["장소1", "장소2", ...]
  },
  "naverBlog": {
    "sentiment": "very_positive" | "positive" | "neutral" | "negative",
    "keywords": ["키워드1", "키워드2", ...],
    "recommendedPlaces": ["장소1", "장소2", ...]
  },
  "youtube": {
    "estimatedVideoCount": 숫자,
    "channels": ["채널1", "채널2", ...],
    "recommendedPlaces": ["장소1", "장소2", ...]
  }
}`;

  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      
      // 점수 계산
      const instaScore = calculateInstagramScore(result.instagram?.estimatedPostCount || 0);
      const naverScore = calculateNaverScore(result.naverBlog?.sentiment || 'neutral');
      const youtubeScore = calculateYouTubeScore(result.youtube?.estimatedVideoCount || 0);
      
      const sentimentData: KoreanSentimentData = {
        instagram: {
          postCount: result.instagram?.estimatedPostCount || 0,
          trendingHashtags: result.instagram?.trendingHashtags || [],
          score: instaScore
        },
        naverBlog: {
          postCount: result.naverBlog?.keywords?.length || 0,
          sentiment: result.naverBlog?.sentiment || 'neutral',
          keywords: result.naverBlog?.keywords || [],
          score: naverScore
        },
        youtube: {
          mentionCount: result.youtube?.estimatedVideoCount || 0,
          channels: result.youtube?.channels || [],
          score: youtubeScore
        },
        totalBonus: (instaScore * 0.4) + (naverScore * 0.35) + (youtubeScore * 0.25),
        lastUpdated: new Date()
      };

      return sentimentData;
    }
  } catch (error) {
    console.error('[KoreanSentiment] Gemini fetch error:', error);
  }

  // 기본값 반환
  return getDefaultSentimentData();
}

/**
 * Instagram 점수 계산 (0-2점)
 */
function calculateInstagramScore(postCount: number): number {
  if (postCount >= 100000) return 2.0;
  if (postCount >= 50000) return 1.5;
  if (postCount >= 10000) return 1.0;
  if (postCount >= 1000) return 0.5;
  return 0;
}

/**
 * 네이버 블로그 감성 점수 계산 (0-2점)
 */
function calculateNaverScore(sentiment: string): number {
  switch (sentiment) {
    case 'very_positive': return 2.0;
    case 'positive': return 1.5;
    case 'neutral': return 0.5;
    case 'negative': return 0;
    default: return 0.5;
  }
}

/**
 * YouTube 점수 계산 (0-2점)
 */
function calculateYouTubeScore(videoCount: number): number {
  if (videoCount >= 50) return 2.0;
  if (videoCount >= 20) return 1.5;
  if (videoCount >= 5) return 1.0;
  if (videoCount >= 1) return 0.5;
  return 0;
}

/**
 * 기본 감성 데이터
 */
function getDefaultSentimentData(): KoreanSentimentData {
  return {
    instagram: { postCount: 0, trendingHashtags: [], score: 0 },
    naverBlog: { postCount: 0, sentiment: 'neutral', keywords: [], score: 0.5 },
    youtube: { mentionCount: 0, channels: [], score: 0 },
    totalBonus: 0.175, // 기본값 (0 * 0.4 + 0.5 * 0.35 + 0 * 0.25)
    lastUpdated: new Date()
  };
}

/**
 * 캐시에 감성 데이터 저장
 */
async function saveSentimentToCache(
  cityName: string,
  cityId: number | null,
  sentimentData: KoreanSentimentData
): Promise<void> {
  try {
    await db.insert(geminiWebSearchCache).values({
      cityId: cityId,
      searchQuery: `korean_sentiment_${cityName}`,
      searchType: 'korean_sentiment',
      rawResult: sentimentData as any,
      extractedData: sentimentData as any,
      confidenceScore: 0.8,
      fetchedAt: new Date()
    });
    console.log(`[KoreanSentiment] Cached sentiment for ${cityName}`);
  } catch (error) {
    console.error('[KoreanSentiment] Cache save error:', error);
  }
}

/**
 * 메인 함수: 도시별 한국 감성 데이터 조회 (캐시 우선)
 */
export async function getKoreanSentimentForCity(
  cityName: string,
  vibes: string[] = []
): Promise<KoreanSentimentData> {
  console.log(`[KoreanSentiment] Fetching sentiment for ${cityName}...`);

  // 1. 캐시 확인
  const cached = await getCachedSentiment(cityName);
  if (cached) {
    console.log(`[KoreanSentiment] Using cached data for ${cityName} (${Math.floor((Date.now() - cached.lastUpdated.getTime()) / (1000 * 60 * 60))}h old)`);
    return cached;
  }

  // 2. 캐시 없으면 Gemini로 실시간 조회
  console.log(`[KoreanSentiment] No cache found, fetching from Gemini...`);
  const sentimentData = await fetchSentimentWithGemini(cityName, vibes);

  // 3. cityId 조회 (🔗 Agent Protocol: findCityUnified 사용)
  let cityId: number | null = null;
  try {
    const { findCityUnified } = await import('./city-resolver');
    const cityResult = await findCityUnified(cityName);
    cityId = cityResult?.cityId || null;
  } catch (e) {
    // cityId 조회 실패해도 계속 진행
  }

  // 4. 캐시에 저장
  await saveSentimentToCache(cityName, cityId, sentimentData);

  return sentimentData;
}

/**
 * DB에서 기존 데이터 통계 조회 (보조 함수)
 */
export async function getExistingDataStats(cityId: number): Promise<{
  instagramHashtagCount: number;
  naverBlogPostCount: number;
  youtubeMentionCount: number;
}> {
  try {
    const [instaCount] = await db.select({ count: sql<number>`count(*)` })
      .from(instagramHashtags)
      .where(eq(instagramHashtags.linkedCityId, cityId));

    const [naverCount] = await db.select({ count: sql<number>`count(*)` })
      .from(naverBlogPosts)
      .where(eq(naverBlogPosts.cityId, cityId));

    const [youtubeCount] = await db.select({ count: sql<number>`count(*)` })
      .from(youtubePlaceMentions);

    return {
      instagramHashtagCount: Number(instaCount?.count || 0),
      naverBlogPostCount: Number(naverCount?.count || 0),
      youtubeMentionCount: Number(youtubeCount?.count || 0)
    };
  } catch (error) {
    return { instagramHashtagCount: 0, naverBlogPostCount: 0, youtubeMentionCount: 0 };
  }
}

/**
 * Gemini 프롬프트용 한국 감성 데이터 텍스트 생성
 */
export function formatSentimentForPrompt(sentiment: KoreanSentimentData, cityName: string): string {
  return `
【🇰🇷 한국인 감성 데이터 - ${cityName}】

📸 Instagram 인기도 (가중치 40%):
- 추정 게시물 수: ${sentiment.instagram.postCount > 0 ? sentiment.instagram.postCount.toLocaleString() + '개' : '데이터 없음'}
- 인기 해시태그: ${sentiment.instagram.trendingHashtags.length > 0 ? sentiment.instagram.trendingHashtags.slice(0, 5).join(', ') : '없음'}
- 감성 점수: ${sentiment.instagram.score.toFixed(1)}점

📝 네이버 블로그 감성 (가중치 35%):
- 전반적 평가: ${sentiment.naverBlog.sentiment === 'very_positive' ? '매우 긍정적' : sentiment.naverBlog.sentiment === 'positive' ? '긍정적' : sentiment.naverBlog.sentiment === 'neutral' ? '중립' : '부정적'}
- 자주 언급 키워드: ${sentiment.naverBlog.keywords.length > 0 ? sentiment.naverBlog.keywords.slice(0, 5).join(', ') : '없음'}
- 감성 점수: ${sentiment.naverBlog.score.toFixed(1)}점

🎬 YouTube 언급 (가중치 25%):
- 관련 영상 수: ${sentiment.youtube.mentionCount > 0 ? sentiment.youtube.mentionCount + '개' : '데이터 없음'}
- 추천 채널: ${sentiment.youtube.channels.length > 0 ? sentiment.youtube.channels.slice(0, 3).join(', ') : '없음'}
- 감성 점수: ${sentiment.youtube.score.toFixed(1)}점

⭐ 한국 감성 보너스 합계: +${sentiment.totalBonus.toFixed(2)}점
(Instagram ${sentiment.instagram.score.toFixed(1)}×0.4 + 네이버 ${sentiment.naverBlog.score.toFixed(1)}×0.35 + YouTube ${sentiment.youtube.score.toFixed(1)}×0.25)
`;
}

// Export for use in other modules
export const koreanSentimentService = {
  getKoreanSentimentForCity,
  getExistingDataStats,
  formatSentimentForPrompt,
  calculateInstagramScore,
  calculateNaverScore,
  calculateYouTubeScore
};
