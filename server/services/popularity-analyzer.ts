/**
 * 혼잡도 분석기
 * Google Places API의 openNow + Gemini를 활용하여 장소별 혼잡도를 추정합니다.
 * 
 * 참고: Google Popular Times는 공식 API에서 직접 제공되지 않습니다.
 * 이 모듈은 리뷰 수, 평점, 현재 운영 상태, 시간대별 일반적인 패턴을 기반으로 혼잡도를 추정합니다.
 */
import { GoogleGenAI } from "@google/genai";
import { db } from "../db";
import { places, cities, geminiWebSearchCache } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { getSearchTools } from "./gemini-search-limiter";
import { safeParseJSON, safeDbOperation } from "./crawler-utils";

// Lazy initialization
let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    ai = new GoogleGenAI({ apiKey
    });
  }
  return ai;
}

type CrowdLevel = "low" | "moderate" | "high" | "very_high";

interface PopularityData {
  currentCrowdLevel: CrowdLevel;
  hourlyPattern: Record<number, CrowdLevel>; // 0-23시
  bestVisitTimes: string[];
  avoidTimes: string[];
  waitTimeEstimate?: string;
  confidenceScore: number;
  lastUpdated: Date;
}

interface DailyPattern {
  dayOfWeek: number; // 0-6 (일-토)
  peakHours: number[];
  quietHours: number[];
  averageCrowdLevel: CrowdLevel;
}

/**
 * 일반적인 장소 유형별 혼잡도 패턴
 */
const TYPICAL_PATTERNS: Record<string, DailyPattern> = {
  restaurant: {
    dayOfWeek: -1, // 모든 요일
    peakHours: [12, 13, 19, 20],
    quietHours: [14, 15, 16, 17],
    averageCrowdLevel: "moderate",
  },
  cafe: {
    dayOfWeek: -1,
    peakHours: [10, 11, 14, 15],
    quietHours: [8, 9, 17, 18],
    averageCrowdLevel: "moderate",
  },
  attraction: {
    dayOfWeek: -1,
    peakHours: [10, 11, 14, 15, 16],
    quietHours: [9, 17, 18],
    averageCrowdLevel: "high",
  },
  museum: {
    dayOfWeek: -1,
    peakHours: [11, 12, 14, 15],
    quietHours: [9, 10, 16, 17],
    averageCrowdLevel: "moderate",
  },
  landmark: {
    dayOfWeek: -1,
    peakHours: [10, 11, 12, 14, 15, 16],
    quietHours: [8, 9, 17, 18, 19],
    averageCrowdLevel: "high",
  },
};

/**
 * 장소 유형과 리뷰 수 기반으로 기본 혼잡도 추정
 */
function estimateBaseCrowdLevel(
  placeType: string,
  reviewCount: number,
  rating: number,
  currentHour: number
): CrowdLevel {
  const pattern = TYPICAL_PATTERNS[placeType] || TYPICAL_PATTERNS.attraction;
  
  // 인기도 기반 조정 (리뷰 수가 많을수록 혼잡)
  let popularityMultiplier = 1;
  if (reviewCount > 10000) popularityMultiplier = 1.5;
  else if (reviewCount > 5000) popularityMultiplier = 1.3;
  else if (reviewCount > 1000) popularityMultiplier = 1.1;
  else if (reviewCount < 100) popularityMultiplier = 0.7;

  // 평점 기반 조정 (평점 높을수록 혼잡)
  if (rating >= 4.5) popularityMultiplier *= 1.2;
  else if (rating >= 4.0) popularityMultiplier *= 1.1;

  // 시간대 기반 기본 레벨
  let baseLevel: number;
  if (pattern.peakHours.includes(currentHour)) {
    baseLevel = 3; // high
  } else if (pattern.quietHours.includes(currentHour)) {
    baseLevel = 1; // low
  } else {
    baseLevel = 2; // moderate
  }

  // 최종 레벨 계산
  const adjustedLevel = Math.min(4, Math.round(baseLevel * popularityMultiplier));
  const levels: CrowdLevel[] = ["low", "moderate", "high", "very_high"];
  return levels[Math.max(0, adjustedLevel - 1)] || "moderate";
}

/**
 * Gemini를 통해 더 정확한 혼잡도 정보 추정
 */
async function getPopularityFromGemini(
  placeName: string,
  cityName: string,
  placeType: string
): Promise<PopularityData | null> {
  try {
    // 💰 프롬프트 최적화: waitTimeEstimate, weekendDifference, seasonalNote 제거
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: `"${placeName}" (${cityName}, ${placeType}) 혼잡도.
JSON 반환:
{
  "hourlyPattern": {"9":"low","10":"moderate","12":"high","14":"moderate","17":"high"},
  "bestVisitTimes": ["오전 9시"],
  "avoidTimes": ["점심 12-13시"]
}
crowdLevel: "low","moderate","high","very_high". 모르면 생략.` }] }],
      config: {
        tools: getSearchTools("popularity"),
      },
    });

    const text = response.text || "";
    const parsed = safeParseJSON<any>(text, "PopularityAnalyzer");

    if (parsed) {
      const now = new Date();
      const currentHour = String(now.getHours());
      
      return {
        currentCrowdLevel: parsed.hourlyPattern?.[currentHour] || "moderate",
        hourlyPattern: parsed.hourlyPattern || {},
        bestVisitTimes: Array.isArray(parsed.bestVisitTimes) ? parsed.bestVisitTimes : [],
        avoidTimes: Array.isArray(parsed.avoidTimes) ? parsed.avoidTimes : [],
        waitTimeEstimate: null,
        confidenceScore: 0.7,
        lastUpdated: now,
      };
    }
  } catch (error) {
    console.error("[PopularityAnalyzer] Gemini error:", error);
  }

  return null;
}

/**
 * 장소의 현재 혼잡도 조회
 */
export async function getPlacePopularity(
  placeId: number
): Promise<PopularityData> {
  const [place] = await db
    .select()
    .from(places)
    .where(eq(places.id, placeId))
    .leftJoin(cities, eq(places.cityId, cities.id));

  if (!place || !place.places) {
    throw new Error("Place not found");
  }

  const placeData = place.places;
  const cityData = place.cities;
  const now = new Date();
  const currentHour = now.getHours();

  // 캐시 확인
  const cacheKey = `popularity_${placeId}`;
  const cached = await db
    .select()
    .from(geminiWebSearchCache)
    .where(
      and(
        eq(geminiWebSearchCache.searchQuery, cacheKey),
        eq(geminiWebSearchCache.searchType, "popularity"),
        gte(geminiWebSearchCache.fetchedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
      )
    )
    .limit(1);

  if (cached.length > 0 && cached[0].extractedData) {
    const cachedData = cached[0].extractedData as PopularityData;
    // 현재 시간 기준으로 crowdLevel 업데이트
    const hourlyPattern = cachedData.hourlyPattern || {};
    cachedData.currentCrowdLevel = hourlyPattern[currentHour] || cachedData.currentCrowdLevel || "moderate";
    cachedData.lastUpdated = new Date();
    return cachedData;
  }

  // 기본 추정
  const baseCrowdLevel = estimateBaseCrowdLevel(
    placeData.type,
    placeData.userRatingCount || 0,
    Math.min(5, (placeData.rating || placeData.vibeScore || 0) / (placeData.vibeScore ? 2 : 1)), // rating 우선, vibeScore는 0-10→0-5 변환
    currentHour
  );

  // Gemini로 상세 정보 조회 시도
  const geminiData = await getPopularityFromGemini(
    placeData.name,
    cityData?.name || "Unknown",
    placeData.type
  );

  const popularityData: PopularityData = geminiData || {
    currentCrowdLevel: baseCrowdLevel,
    hourlyPattern: generateDefaultHourlyPattern(placeData.type),
    bestVisitTimes: getBestVisitTimes(placeData.type),
    avoidTimes: getAvoidTimes(placeData.type),
    confidenceScore: 0.5,
    lastUpdated: now,
  };

  // 캐시 저장 (cityId 포함 + 에러 핸들링)
  await safeDbOperation(
    () => db.insert(geminiWebSearchCache).values({
      placeId,
      cityId: placeData.cityId, // 💰 누락 수정: cityId 추가
      searchQuery: cacheKey,
      searchType: "popularity",
      rawResult: { source: geminiData ? "gemini" : "estimated" },
      extractedData: popularityData as any,
      confidenceScore: popularityData.confidenceScore,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }),
    "PopularityAnalyzer",
    `cache save placeId=${placeId}`
  );

  return popularityData;
}

/**
 * 기본 시간대별 혼잡도 패턴 생성
 */
function generateDefaultHourlyPattern(placeType: string): Record<number, CrowdLevel> {
  const pattern = TYPICAL_PATTERNS[placeType] || TYPICAL_PATTERNS.attraction;
  const hourlyPattern: Record<number, CrowdLevel> = {};

  for (let hour = 0; hour < 24; hour++) {
    if (hour < 8 || hour > 21) {
      hourlyPattern[hour] = "low";
    } else if (pattern.peakHours.includes(hour)) {
      hourlyPattern[hour] = "high";
    } else if (pattern.quietHours.includes(hour)) {
      hourlyPattern[hour] = "low";
    } else {
      hourlyPattern[hour] = "moderate";
    }
  }

  return hourlyPattern;
}

function getBestVisitTimes(placeType: string): string[] {
  const tips: Record<string, string[]> = {
    restaurant: ["점심 전 11시", "저녁 이른 시간 18시"],
    cafe: ["오전 8-9시 (조용함)", "오후 4-5시"],
    attraction: ["개장 직후", "마감 2시간 전"],
    museum: ["오전 9-10시", "폐관 1시간 전"],
    landmark: ["일출/일몰 시간", "점심시간 (사람들이 식사 중)"],
  };
  return tips[placeType] || tips.attraction;
}

function getAvoidTimes(placeType: string): string[] {
  const tips: Record<string, string[]> = {
    restaurant: ["점심 12-13시", "저녁 19-20시"],
    cafe: ["주말 오후 2-4시", "브런치 시간대"],
    attraction: ["주말 오전 10-12시", "공휴일"],
    museum: ["주말 오후", "무료 입장일"],
    landmark: ["주말 오전-오후", "성수기 정오"],
  };
  return tips[placeType] || tips.attraction;
}

/**
 * 여러 장소의 혼잡도 일괄 조회
 */
export async function getBatchPopularity(
  placeIds: number[]
): Promise<Map<number, PopularityData>> {
  const results = new Map<number, PopularityData>();

  for (const placeId of placeIds) {
    try {
      const popularity = await getPlacePopularity(placeId);
      results.set(placeId, popularity);
    } catch (error) {
      console.error(`[PopularityAnalyzer] Error for place ${placeId}:`, error);
    }
    // Rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

/**
 * 일정 최적화를 위한 혼잡도 기반 추천
 */
export async function getOptimalVisitOrder(
  placeIds: number[],
  visitDate: Date
): Promise<{
  optimizedOrder: number[];
  visitSchedule: Array<{
    placeId: number;
    recommendedTime: string;
    expectedCrowdLevel: CrowdLevel;
  }>;
}> {
  const popularityMap = await getBatchPopularity(placeIds);
  const dayOfWeek = visitDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // 각 장소별 최적 방문 시간 계산
  const placeSchedules = placeIds.map((placeId) => {
    const popularity = popularityMap.get(placeId);
    if (!popularity) {
      return { placeId, bestHour: 10, crowdLevel: "moderate" as CrowdLevel };
    }

    // 가장 한산한 시간 찾기
    let bestHour = 10;
    let lowestCrowd: CrowdLevel = "very_high";
    const crowdOrder: CrowdLevel[] = ["low", "moderate", "high", "very_high"];

    for (const [hour, level] of Object.entries(popularity.hourlyPattern)) {
      const hourNum = parseInt(hour);
      if (hourNum >= 9 && hourNum <= 18) {
        if (crowdOrder.indexOf(level as CrowdLevel) < crowdOrder.indexOf(lowestCrowd)) {
          lowestCrowd = level as CrowdLevel;
          bestHour = hourNum;
        }
      }
    }

    // 주말은 혼잡도 한 단계 상승
    if (isWeekend && lowestCrowd !== "very_high") {
      const idx = crowdOrder.indexOf(lowestCrowd);
      lowestCrowd = crowdOrder[Math.min(idx + 1, 3)] as CrowdLevel;
    }

    return { placeId, bestHour, crowdLevel: lowestCrowd };
  });

  // 시간 순으로 정렬
  placeSchedules.sort((a, b) => a.bestHour - b.bestHour);

  return {
    optimizedOrder: placeSchedules.map((p) => p.placeId),
    visitSchedule: placeSchedules.map((p) => ({
      placeId: p.placeId,
      recommendedTime: `${p.bestHour.toString().padStart(2, "0")}:00`,
      expectedCrowdLevel: p.crowdLevel,
    })),
  };
}

export const popularityAnalyzer = {
  getPlacePopularity,
  getBatchPopularity,
  getOptimalVisitOrder,
};
