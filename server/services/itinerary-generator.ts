import { GoogleGenAI } from "@google/genai";
import { 
  getKoreanSentimentForCity, 
  formatSentimentForPrompt,
  KoreanSentimentData 
} from "./korean-sentiment-service";
import { 
  generateProtagonistSentence, 
  generatePromptContext 
} from "./protagonist-generator";
import { routeOptimizer } from "./route-optimizer";
import { storage } from "../storage";
import { db } from "../db";
import { places, instagramHashtags, youtubePlaceMentions, naverBlogPosts, cities, tripAdvisorData, placePrices, reviews, geminiWebSearchCache, weatherCache, crisisAlerts } from "@shared/schema";
import { eq, sql, ilike, and, desc } from "drizzle-orm";

// Lazy initialization - DB에서 API 키 로드 후 사용
let ai: GoogleGenAI | null = null;

function getGeminiApiKey(): string {
  return process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.error('[Itinerary] ❌ Gemini API 키가 설정되지 않았습니다!');
      throw new Error('Gemini API 키가 없습니다. 관리자 대시보드에서 API 키를 설정해주세요.');
    }
    ai = new GoogleGenAI({ apiKey });
    console.log(`[Itinerary] ✅ Gemini AI 초기화 완료 (키 길이: ${apiKey.length}자)`);
  }
  return ai;
}

type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';
type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';
// 여행 밀도: 빡빡하게(Packed) | 보통(Normal) | 여유롭게(Relaxed)
// ⚠️ 프론트엔드 기준 'Normal' 사용 (Moderate 아님)
type TravelPace = 'Packed' | 'Normal' | 'Relaxed';
type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';
type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';

// ===== 사용자 시간 기반 슬롯 생성 로직 =====
// 핵심 규칙:
// 1. 사용자 출발시간/종료시간 = 절대 우선
// 2. 여행 밀도에 따라 슬롯 수 자동 계산
// 3. 2일 이상: 첫날(출발시간~21:00), 중간(09:00~21:00 풀타임), 마지막(09:00~종료시간)
interface PaceConfig {
  slotDurationMinutes: number;  // 슬롯 당 소요시간 (이동시간 포함)
  maxSlotsPerDay: number;       // 하루 최대 슬롯 수 (풀타임 12시간 기준)
}

// === 인원수 계산 (companionType 기반) ===
function getCompanionCount(companionType: string): number {
  const mapping: Record<string, number> = {
    Single: 1,
    Couple: 2,
    Family: 4,
    ExtendedFamily: 8,  // 대가족 8명 (밴)
    Group: 10,          // 친구 10명 (미니버스)
  };
  return mapping[companionType] || 1;
}

const PACE_CONFIG: Record<TravelPace, PaceConfig> = {
  Packed: {
    slotDurationMinutes: 90,    // 1시간 30분
    maxSlotsPerDay: 8,          // 12h ÷ 1.5h = 8곳
  },
  Normal: {
    slotDurationMinutes: 120,   // 2시간
    maxSlotsPerDay: 6,          // 12h ÷ 2h = 6곳
  },
  Relaxed: {
    slotDurationMinutes: 150,   // 2시간 30분
    maxSlotsPerDay: 4,          // 12h ÷ 2.5h ≈ 4곳
  },
};

// ===== 식사 슬롯 필수 포함 설정 =====
// 점심(12:00~14:00), 저녁(18:00~20:00)은 무조건 식당 배치
// 아침은 제외 (호텔 조식 등 가정)
interface MealSlotConfig {
  type: 'lunch' | 'dinner';
  startHour: number;
  endHour: number;
}

const MEAL_SLOTS: MealSlotConfig[] = [
  { type: 'lunch', startHour: 12, endHour: 14 },
  { type: 'dinner', startHour: 18, endHour: 20 },
];

// TravelStyle별 식사 예산 (1인 기준, EUR)
const MEAL_BUDGET: Record<TravelStyle, { min: number; max: number; label: string }> = {
  Economic: { min: 8, max: 15, label: '€10 내외' },
  Reasonable: { min: 20, max: 40, label: '€30 내외' },
  Premium: { min: 40, max: 70, label: '€50 내외' },
  Luxury: { min: 60, max: 100, label: '€70 내외' },
};

/**
 * 장소가 식당/카페인지 확인
 */
function isFoodPlace(place: PlaceResult): boolean {
  const foodTags = ['restaurant', 'cafe', 'bakery', 'food', 'bar', 'bistro', 'brasserie'];
  const hasFoodieVibe = place.vibeTags?.includes('Foodie');
  const hasFoodTag = place.tags?.some(t => foodTags.includes(t.toLowerCase()));
  const hasFoodType = place.placeTypes?.some(t => foodTags.includes(t.toLowerCase()));
  const nameHasFood = /레스토랑|식당|카페|비스트로|브라세리|restaurant|cafe|bistro/i.test(place.name);
  
  return hasFoodieVibe || hasFoodTag || hasFoodType || nameHasFood;
}

// ===== 식당 전용 점수 계산 (Phase 1-4) =====
// 우선순위: 리뷰수(40%) > 한국인리뷰(25%) > 인스타(15%) > 유튜브(10%) > 블로그(10%)
async function calculateRestaurantScore(place: PlaceResult): Promise<number> {
  try {
    if (!db) return place.vibeScore; // DB 미연결시 기존 점수 사용

    // 1. 리뷰 수 점수 (40%) - Google Places 리뷰 수
    let reviewCountScore = 0;
    const placeMatch = await db.select({
      userRatingCount: places.userRatingCount,
      googlePlaceId: places.googlePlaceId,
      id: places.id,
    })
      .from(places)
      .where(ilike(places.name, `%${place.name}%`))
      .limit(1);

    let dbPlaceId: number | null = null;
    if (placeMatch.length > 0) {
      dbPlaceId = placeMatch[0].id;
      const ratingCount = placeMatch[0].userRatingCount || 0;
      // log 스케일: 100리뷰=6.6, 1000리뷰=10, 10000리뷰=10
      reviewCountScore = Math.min(10, Math.log10(ratingCount + 1) * 3.3);
    }

    // 2. 한국인 리뷰 점수 (25%) - reviews 테이블에서 한국어 리뷰 확인
    let koreanReviewScore = 0;
    if (dbPlaceId) {
      const koreanReviews = await db.select({
        count: sql<number>`count(*)`,
        avgRating: sql<number>`avg(${reviews.rating})`,
      })
        .from(reviews)
        .where(and(
          eq(reviews.placeId, dbPlaceId),
          eq(reviews.language, 'ko')
        ));

      if (koreanReviews.length > 0 && Number(koreanReviews[0].count) > 0) {
        const count = Number(koreanReviews[0].count);
        const avgRating = Number(koreanReviews[0].avgRating) || 3.5;
        // 한국어 리뷰 1개=5점, 3개=8점, 5개이상=10점 + 평점 보너스
        koreanReviewScore = Math.min(10, count * 2.5 + (avgRating - 3) * 1.5);
      }
    }

    // 3. 인스타그램 점수 (15%) - 기존 koreanPopularityScore에서 추출
    const instaScore = Math.min(10, (place.koreanPopularityScore || 0) * 1.5);

    // 4. 유튜브 점수 (10%) - 유튜브 언급 확인
    let youtubeScore = 0;
    if (dbPlaceId) {
      const ytData = await db.select({
        count: sql<number>`count(*)`,
      })
        .from(youtubePlaceMentions)
        .where(eq(youtubePlaceMentions.placeId, dbPlaceId));

      if (ytData.length > 0 && Number(ytData[0].count) > 0) {
        youtubeScore = Math.min(10, Number(ytData[0].count) * 3);
      }
    }

    // 5. 블로그 점수 (10%) - 네이버 블로그 언급
    let blogScore = 0;
    if (dbPlaceId) {
      const blogData = await db.select({
        count: sql<number>`count(*)`,
      })
        .from(naverBlogPosts)
        .where(eq(naverBlogPosts.placeId, dbPlaceId));

      if (blogData.length > 0 && Number(blogData[0].count) > 0) {
        blogScore = Math.min(10, Number(blogData[0].count) * 2);
      }
    }

    // 가중 합산
    const finalScore = (reviewCountScore * 0.40) +
                       (koreanReviewScore * 0.25) +
                       (instaScore * 0.15) +
                       (youtubeScore * 0.10) +
                       (blogScore * 0.10);

    if (finalScore > 0) {
      console.log(
        `[Restaurant] ${place.name}: 리뷰수=${reviewCountScore.toFixed(1)}(40%) ` +
        `한국리뷰=${koreanReviewScore.toFixed(1)}(25%) 인스타=${instaScore.toFixed(1)}(15%) ` +
        `유튜브=${youtubeScore.toFixed(1)}(10%) 블로그=${blogScore.toFixed(1)}(10%) → ${finalScore.toFixed(2)}`
      );
    }

    return Math.max(finalScore, place.vibeScore * 0.5); // 최소한 vibeScore의 50%는 보장
  } catch (error) {
    console.warn(`[Restaurant] ${place.name} 점수 계산 실패:`, error);
    return place.vibeScore; // 에러시 기존 점수
  }
}

// 기본 시작/종료 시간 (중간 날짜용)
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '21:00';

/**
 * 가용 시간으로 슬롯 수 계산
 * @param startTime 시작시간 (HH:MM)
 * @param endTime 종료시간 (HH:MM)
 * @param pace 여행 밀도
 * @returns 슬롯 수
 */
function calculateSlotsForDay(
  startTime: string,
  endTime: string,
  pace: TravelPace
): number {
  const config = PACE_CONFIG[pace];
  
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const availableMinutes = endMinutes - startMinutes;
  
  if (availableMinutes <= 0) return 0;
  
  const slots = Math.floor(availableMinutes / config.slotDurationMinutes);
  return Math.min(slots, config.maxSlotsPerDay);
}

interface TripFormData {
  birthDate: string;
  companionType: string;
  companionCount: number;
  companionAges: string;
  curationFocus: CurationFocus;
  destination: string;
  destinationCoords?: { lat: number; lng: number };
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  vibes: Vibe[];
  travelStyle: TravelStyle;
  travelPace: TravelPace;
  mobilityStyle: MobilityStyle;
}

interface PlaceResult {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  vibeScore: number;
  confidenceScore: number;
  sourceType: string;
  personaFitReason: string;
  tags: string[];
  vibeTags: Vibe[];
  image: string;
  priceEstimate: string;
  placeTypes: string[];
  city?: string;
  region?: string;
  // Phase 1: 한국인 인기도 점수 (인스타45% + 유튜브30% + 블로그25%)
  koreanPopularityScore: number;
  // Phase 4: 구글맵 직접 링크
  googleMapsUrl: string;
  // TripAdvisor 데이터 (DB에서 가져옴)
  tripAdvisorRating?: number;       // 1.0-5.0
  tripAdvisorReviewCount?: number;  // 총 리뷰 수
  tripAdvisorRanking?: string;      // "#5 of 1203"
  // 실제 가격 추정 (EUR)
  estimatedPriceEur?: number;       // 입장료 또는 식사 평균 가격
  priceSource?: string;             // 가격 출처
  // Phase 1-3: 포토스팟 점수 (0-10)
  photoSpotScore?: number;
  photoTip?: string;
  bestPhotoTime?: string;
  // Phase 1-2: 패키지 투어 검증
  isPackageTourIncluded?: boolean;
  packageMentionCount?: number;
  // Phase 1-5: 최종 종합 점수
  finalScore?: number;
  // Phase 1-6: 선정 이유 + 신뢰도
  selectionReasons?: string[];        // 최소 2개 선정 이유
  confidenceLevel?: 'high' | 'medium' | 'low' | 'minimal'; // 데이터 신뢰도
}

// 시간대별 Vibe 친화도 (향후 고급 슬롯 매칭에 사용 예정)
// interface TimeSlot { slot: 'morning' | 'lunch' | 'afternoon' | 'evening'; startTime: string; endTime: string; vibeAffinity: Vibe[]; }
// const SLOT_VIBE_AFFINITY = { morning: ['Healing', 'Culture', 'Adventure'], lunch: ['Foodie'], afternoon: ['Hotspot', 'Culture', 'Adventure', 'Healing'], evening: ['Foodie', 'Romantic'] };

/**
 * 분(minutes)을 HH:MM 형식으로 변환
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(Math.min(23, hours)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// 🎯 Vibe 기본 가중치 (향후 확장용, 현재 calculateVibeWeights에서 사용)
// const BASE_WEIGHTS: Record<Vibe, number> = { Healing: 35, Foodie: 25, Hotspot: 15, Culture: 10, Adventure: 10, Romantic: 5 };
// const PROTAGONIST_ADJUSTMENTS - 향후 고급 개인화에 사용 예정

function calculateVibeWeights(selectedVibes: Vibe[], protagonist: CurationFocus) {
  if (selectedVibes.length === 0) return [];
  
  const PRIORITY_WEIGHTS: Record<number, number[]> = {
    1: [100],
    2: [60, 40],
    3: [50, 30, 20],
  };
  
  const weights = PRIORITY_WEIGHTS[selectedVibes.length] || [50, 30, 20];
  
  return selectedVibes.map((vibe, index) => ({
    vibe,
    weight: weights[index] / 100,
    percentage: weights[index],
  }));
}

async function searchGooglePlaces(
  destination: string,
  coords: { lat: number; lng: number } | undefined,
  vibes: Vibe[],
  travelStyle: TravelStyle
): Promise<PlaceResult[]> {
  const apiKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.log("Google Maps API key not available, using AI-generated places");
    return [];
  }

  const placeTypes = getPlaceTypesForVibes(vibes);
  const results: PlaceResult[] = [];
  
  for (const placeType of placeTypes.slice(0, 5)) {
    try {
      const searchUrl = new URL("https://places.googleapis.com/v1/places:searchNearby");
      
      const requestBody = {
        includedTypes: [placeType],
        maxResultCount: 10,
        locationRestriction: coords ? {
          circle: {
            center: { latitude: coords.lat, longitude: coords.lng },
            radius: 10000
          }
        } : undefined,
      };

      const response = await fetch(searchUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.priceLevel,places.photos,places.googleMapsUri",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.places) {
          for (const place of data.places) {
            results.push({
              id: place.id || `place-${Date.now()}-${Math.random()}`,
              name: place.displayName?.text || "Unknown Place",
              description: place.formattedAddress || "",
              lat: place.location?.latitude || 0,
              lng: place.location?.longitude || 0,
              vibeScore: calculatePlaceVibeScore(place, vibes),
              confidenceScore: Math.min(10, (place.userRatingCount || 0) / 100 + (place.rating || 0)),
              sourceType: "Google Places",
              personaFitReason: getPersonaFitReason(place.types || [], vibes),
              tags: place.types?.slice(0, 3) || [],
              vibeTags: mapPlaceTypesToVibes(place.types || []),
              image: place.photos?.[0]?.name 
                ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=400&key=${apiKey}`
                : "",
              priceEstimate: getPriceEstimate(place.priceLevel, travelStyle),
              placeTypes: place.types || [],
              koreanPopularityScore: 0, // 이후 enrichPlacesWithKoreanPopularity에서 계산
              googleMapsUrl: place.googleMapsUri || "", // Phase 4: 구글맵 직접 링크
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to search for ${placeType}:`, error);
    }
  }

  return results;
}

// ===== Phase 1: 한국인 인기도 점수 계산 (DB 수집 데이터 직접 활용) =====
// 우선순위: 인스타그램(45%) > 유튜브 언급(30%) > 네이버 블로그(25%)

/**
 * 장소별 한국인 인기도 점수를 DB 수집 데이터로 계산
 * Google Places 검색 결과의 장소명/ID를 DB places 테이블과 매칭 후
 * instagram_hashtags, youtube_place_mentions, naver_blog_posts 데이터 조회
 * 
 * @returns 0~10 범위의 한국인 인기도 점수
 */
async function calculateKoreanPopularity(
  placeName: string,
  googlePlaceId: string,
  cityName: string
): Promise<number> {
  if (!db) {
    console.log('[KoreanPopularity] DB 미연결 - 점수 0 반환');
    return 0;
  }

  try {
    // 1. DB places 테이블에서 매칭 시도 (googlePlaceId 우선, 이름 fallback)
    let matchedPlaceId: number | null = null;
    let matchedCityId: number | null = null;

    // googlePlaceId로 정확한 매칭 시도
    if (googlePlaceId) {
      const exactMatch = await db.select({ id: places.id, cityId: places.cityId })
        .from(places)
        .where(eq(places.googlePlaceId, googlePlaceId))
        .limit(1);
      
      if (exactMatch.length > 0) {
        matchedPlaceId = exactMatch[0].id;
        matchedCityId = exactMatch[0].cityId;
      }
    }

    // googlePlaceId 매칭 실패 시 이름으로 fuzzy 매칭
    if (!matchedPlaceId) {
      const nameMatch = await db.select({ id: places.id, cityId: places.cityId })
        .from(places)
        .where(ilike(places.name, `%${placeName}%`))
        .limit(1);
      
      if (nameMatch.length > 0) {
        matchedPlaceId = nameMatch[0].id;
        matchedCityId = nameMatch[0].cityId;
      }
    }

    // 도시 ID 조회 (cityName으로)
    if (!matchedCityId) {
      const cityMatch = await db.select({ id: cities.id })
        .from(cities)
        .where(ilike(cities.name, `%${cityName}%`))
        .limit(1);
      
      if (cityMatch.length > 0) {
        matchedCityId = cityMatch[0].id;
      }
    }

    // ===== 1순위: 인스타그램 점수 (45%) =====
    let instaScore = 0;
    if (matchedPlaceId) {
      const instaData = await db.select({
        postCount: instagramHashtags.postCount,
        avgLikes: instagramHashtags.avgLikes,
      })
        .from(instagramHashtags)
        .where(eq(instagramHashtags.linkedPlaceId, matchedPlaceId))
        .limit(5);

      if (instaData.length > 0) {
        const totalPosts = instaData.reduce((sum, d) => sum + (d.postCount || 0), 0);
        const avgLikes = instaData.reduce((sum, d) => sum + (d.avgLikes || 0), 0) / instaData.length;
        // 게시물 수 log 스케일 (1000개 이상이면 만점에 가까움)
        const postScore = Math.min(10, Math.log10(totalPosts + 1) * 3.3);
        // 좋아요 보너스 (평균 100개 이상이면 보너스)
        const likeBonus = Math.min(2, Math.log10(avgLikes + 1) * 0.5);
        instaScore = Math.min(10, postScore + likeBonus);
      }
    }
    // 도시 레벨 인스타 데이터도 fallback
    if (instaScore === 0 && matchedCityId) {
      const cityInsta = await db.select({
        postCount: instagramHashtags.postCount,
      })
        .from(instagramHashtags)
        .where(eq(instagramHashtags.linkedCityId, matchedCityId))
        .limit(10);

      if (cityInsta.length > 0) {
        const totalPosts = cityInsta.reduce((sum, d) => sum + (d.postCount || 0), 0);
        // 도시 레벨이므로 약한 가중치 (해당 장소 직접 데이터 아님)
        instaScore = Math.min(5, Math.log10(totalPosts + 1) * 1.5);
      }
    }

    // ===== 2순위: 유튜브 언급 점수 (30%) =====
    let youtubeScore = 0;
    if (matchedPlaceId) {
      const ytData = await db.select({
        count: sql<number>`count(*)`,
        avgConfidence: sql<number>`avg(${youtubePlaceMentions.confidence})`,
      })
        .from(youtubePlaceMentions)
        .where(eq(youtubePlaceMentions.placeId, matchedPlaceId));

      if (ytData.length > 0 && ytData[0].count > 0) {
        const mentionCount = Number(ytData[0].count);
        const avgConf = Number(ytData[0].avgConfidence) || 0.5;
        // 언급 횟수 기반 (3회 이상이면 높은 점수)
        youtubeScore = Math.min(10, mentionCount * 2 * avgConf);
      }
    }
    // placeName으로 직접 매칭 시도 (DB에 장소 미등록이어도 언급은 있을 수 있음)
    if (youtubeScore === 0) {
      const ytNameMatch = await db.select({
        count: sql<number>`count(*)`,
      })
        .from(youtubePlaceMentions)
        .where(ilike(youtubePlaceMentions.placeName, `%${placeName}%`));

      if (ytNameMatch.length > 0 && Number(ytNameMatch[0].count) > 0) {
        youtubeScore = Math.min(7, Number(ytNameMatch[0].count) * 1.5);
      }
    }

    // ===== 3순위: 네이버 블로그 점수 (25%) =====
    let blogScore = 0;
    if (matchedPlaceId) {
      const blogData = await db.select({
        count: sql<number>`count(*)`,
        avgSentiment: sql<number>`avg(${naverBlogPosts.sentimentScore})`,
      })
        .from(naverBlogPosts)
        .where(eq(naverBlogPosts.placeId, matchedPlaceId));

      if (blogData.length > 0 && Number(blogData[0].count) > 0) {
        const postCount = Number(blogData[0].count);
        const avgSentiment = Number(blogData[0].avgSentiment) || 0.5;
        // 글 수 기반 (5개 이상이면 높은 점수)
        const countScore = Math.min(7, postCount * 1.5);
        // 감성 보너스 (긍정적이면 추가 점수)
        const sentimentBonus = avgSentiment > 0.7 ? 3 : avgSentiment > 0.5 ? 1.5 : 0;
        blogScore = Math.min(10, countScore + sentimentBonus);
      }
    }
    // 도시+장소명으로 extractedPlaces에서 검색 (블로그에 장소명 언급 여부)
    if (blogScore === 0 && matchedCityId) {
      const blogNameMatch = await db.select({
        count: sql<number>`count(*)`,
      })
        .from(naverBlogPosts)
        .where(and(
          eq(naverBlogPosts.cityId, matchedCityId),
          sql`${naverBlogPosts.postTitle} ILIKE ${`%${placeName}%`}`
        ));

      if (blogNameMatch.length > 0 && Number(blogNameMatch[0].count) > 0) {
        blogScore = Math.min(5, Number(blogNameMatch[0].count) * 1.0);
      }
    }

    // ===== 최종 가중치 합산 (0-10) =====
    const finalScore = (instaScore * 0.45) + (youtubeScore * 0.30) + (blogScore * 0.25);
    
    if (finalScore > 0) {
      console.log(`[KoreanPopularity] ${placeName}: 인스타=${instaScore.toFixed(1)}(45%) 유튜브=${youtubeScore.toFixed(1)}(30%) 블로그=${blogScore.toFixed(1)}(25%) → 최종=${finalScore.toFixed(2)}`);
    }

    return Math.min(10, finalScore);
  } catch (error) {
    console.error(`[KoreanPopularity] ${placeName} 점수 계산 실패:`, error);
    return 0;
  }
}

/**
 * 여러 장소에 대해 한국인 인기도 점수를 일괄 계산
 */
async function enrichPlacesWithKoreanPopularity(
  placesArr: PlaceResult[],
  cityName: string
): Promise<PlaceResult[]> {
  console.log(`[KoreanPopularity] ${placesArr.length}개 장소 한국인 인기도 계산 시작...`);
  
  const enriched = await Promise.all(
    placesArr.map(async (place) => {
      const koreanScore = await calculateKoreanPopularity(place.name, place.id, cityName);
      return {
        ...place,
        koreanPopularityScore: koreanScore,
      };
    })
  );

  const withScore = enriched.filter(p => p.koreanPopularityScore > 0);
  console.log(`[KoreanPopularity] 완료: ${withScore.length}/${placesArr.length}곳에 한국인 인기도 데이터 있음`);
  
  return enriched;
}

// ===== TripAdvisor 데이터 + 실제 가격 정보 통합 =====

/**
 * DB에서 장소 이름 매칭으로 TripAdvisor 데이터와 가격 정보를 가져옴
 * → 일정표에 실제 평점, 리뷰 수, 예상 가격을 표시
 */
async function enrichPlacesWithTripAdvisorAndPrices(
  placesArr: PlaceResult[],
  cityName: string
): Promise<PlaceResult[]> {
  if (!db) {
    console.log('[TripAdvisor/Price] DB 미연결 - 보강 생략');
    return placesArr;
  }

  try {
    // 도시 ID 찾기
    const cityMatch = await db.select({ id: cities.id })
      .from(cities)
      .where(ilike(cities.name, `%${cityName}%`))
      .limit(1);

    if (cityMatch.length === 0) {
      console.log(`[TripAdvisor/Price] 도시 "${cityName}" 미발견`);
      return placesArr;
    }
    const cityId = cityMatch[0].id;

    // TripAdvisor 데이터 일괄 조회
    const taData = await db.select({
      placeId: tripAdvisorData.placeId,
      rating: tripAdvisorData.tripAdvisorRating,
      reviewCount: tripAdvisorData.tripAdvisorReviewCount,
      ranking: tripAdvisorData.tripAdvisorRanking,
      rankingTotal: tripAdvisorData.tripAdvisorRankingTotal,
    })
    .from(tripAdvisorData)
    .where(eq(tripAdvisorData.cityId, cityId));

    // 가격 데이터 일괄 조회
    const priceData = await db.select({
      placeId: placePrices.placeId,
      priceType: placePrices.priceType,
      priceAverage: placePrices.priceAverage,
      priceLow: placePrices.priceLow,
      priceHigh: placePrices.priceHigh,
      currency: placePrices.currency,
      source: placePrices.source,
    })
    .from(placePrices)
    .where(eq(placePrices.cityId, cityId));

    // DB 장소 목록 (이름으로 매칭)
    const dbPlaces = await db.select({ id: places.id, name: places.name, googlePlaceId: places.googlePlaceId })
      .from(places)
      .where(eq(places.cityId, cityId));

    // 이름 기반 매칭 맵 생성
    const placeIdByName = new Map<string, number>();
    for (const p of dbPlaces) {
      placeIdByName.set(p.name.toLowerCase(), p.id);
      if (p.googlePlaceId) {
        placeIdByName.set(p.googlePlaceId, p.id);
      }
    }

    // TripAdvisor 맵 (placeId → data)
    const taMap = new Map<number, { rating: number; reviewCount: number; rankingStr: string }>();
    for (const ta of taData) {
      if (ta.placeId && ta.rating) {
        taMap.set(ta.placeId, {
          rating: ta.rating,
          reviewCount: ta.reviewCount || 0,
          rankingStr: ta.ranking && ta.rankingTotal ? `#${ta.ranking} of ${ta.rankingTotal}` : '',
        });
      }
    }

    // 가격 맵 (placeId → price)
    const priceMap = new Map<number, { avgPrice: number; source: string; currency: string }>();
    for (const pr of priceData) {
      if (pr.placeId && pr.priceAverage) {
        priceMap.set(pr.placeId, {
          avgPrice: pr.priceAverage,
          source: pr.source,
          currency: pr.currency,
        });
      }
    }

    let taMatched = 0;
    let priceMatched = 0;

    const enriched = placesArr.map(place => {
      // 이름으로 DB placeId 찾기
      const dbPlaceId = placeIdByName.get(place.name.toLowerCase()) || placeIdByName.get(place.id);

      if (!dbPlaceId) return place;

      const ta = taMap.get(dbPlaceId);
      const price = priceMap.get(dbPlaceId);

      const updates: Partial<PlaceResult> = {};

      if (ta) {
        updates.tripAdvisorRating = ta.rating;
        updates.tripAdvisorReviewCount = ta.reviewCount;
        updates.tripAdvisorRanking = ta.rankingStr;
        // TripAdvisor 리뷰 수가 많으면 vibeScore 보너스 (신뢰도 높은 장소)
        const reviewBonus = Math.min(1.5, Math.log10(ta.reviewCount + 1) * 0.3);
        updates.vibeScore = Math.min(10, place.vibeScore + reviewBonus);
        taMatched++;
      }

      if (price) {
        updates.estimatedPriceEur = price.avgPrice;
        updates.priceSource = price.source;
        // 실제 가격이 있으면 priceEstimate 업데이트
        const priceLabel = price.currency === 'EUR' 
          ? `€${Math.round(price.avgPrice)}` 
          : `${Math.round(price.avgPrice)} ${price.currency}`;
        updates.priceEstimate = priceLabel;
        priceMatched++;
      }

      return { ...place, ...updates };
    });

    console.log(`[TripAdvisor/Price] 보강 완료: TripAdvisor ${taMatched}곳, 가격 ${priceMatched}곳 매칭`);
    return enriched;
  } catch (error) {
    console.error('[TripAdvisor/Price] 보강 실패:', error);
    return placesArr;
  }
}

/**
 * Phase 1-5: 포토스팟 + 패키지 투어 데이터로 장소 보강
 * DB의 geminiWebSearchCache 테이블에서 searchType = "photospot" / "package_tour" 조회
 */
async function enrichPlacesWithPhotoAndTour(
  placesArr: PlaceResult[],
  cityName: string
): Promise<PlaceResult[]> {
  if (!db) {
    console.log('[Photo/Tour] DB 미연결 - 보강 생략');
    return placesArr;
  }

  try {
    const cityMatch = await db.select({ id: cities.id })
      .from(cities)
      .where(ilike(cities.name, `%${cityName}%`))
      .limit(1);

    if (cityMatch.length === 0) return placesArr;
    const cityId = cityMatch[0].id;

    // DB 장소 목록 (이름 매칭용)
    const dbPlaces = await db.select({ id: places.id, name: places.name, googlePlaceId: places.googlePlaceId })
      .from(places)
      .where(eq(places.cityId, cityId));

    const placeIdByName = new Map<string, number>();
    for (const p of dbPlaces) {
      placeIdByName.set(p.name.toLowerCase(), p.id);
      if (p.googlePlaceId) placeIdByName.set(p.googlePlaceId, p.id);
    }

    // 포토스팟 데이터 일괄 조회 (searchType = "photospot")
    const photospotData = await db.select({
      placeId: geminiWebSearchCache.placeId,
      extractedData: geminiWebSearchCache.extractedData,
      confidenceScore: geminiWebSearchCache.confidenceScore,
    })
      .from(geminiWebSearchCache)
      .where(and(
        eq(geminiWebSearchCache.cityId, cityId),
        eq(geminiWebSearchCache.searchType, 'photospot')
      ));

    // 패키지 투어 데이터 일괄 조회 (searchType = "package_tour")
    const packageTourData = await db.select({
      placeId: geminiWebSearchCache.placeId,
      extractedData: geminiWebSearchCache.extractedData,
      confidenceScore: geminiWebSearchCache.confidenceScore,
    })
      .from(geminiWebSearchCache)
      .where(and(
        eq(geminiWebSearchCache.cityId, cityId),
        eq(geminiWebSearchCache.searchType, 'package_tour')
      ));

    // 맵 생성
    const photospotMap = new Map<number, { score: number; photoTip?: string; bestTime?: string }>();
    for (const ps of photospotData) {
      if (ps.placeId) {
        const data = ps.extractedData as any;
        photospotMap.set(ps.placeId, {
          score: data?.combinedScore || data?.photoSpotScore || (ps.confidenceScore || 0) * 10,
          photoTip: data?.photoTip,
          bestTime: data?.bestTime,
        });
      }
    }

    const packageTourMap = new Map<number, { included: boolean; mentionCount: number }>();
    for (const pt of packageTourData) {
      if (pt.placeId) {
        const data = pt.extractedData as any;
        packageTourMap.set(pt.placeId, {
          included: data?.isPackageTourIncluded || false,
          mentionCount: data?.packageMentionCount || 0,
        });
      }
    }

    let photoMatched = 0;
    let tourMatched = 0;

    const enriched = placesArr.map(place => {
      const dbPlaceId = placeIdByName.get(place.name.toLowerCase()) || placeIdByName.get(place.id);
      if (!dbPlaceId) return place;

      const updates: Partial<PlaceResult> = {};

      const photo = photospotMap.get(dbPlaceId);
      if (photo) {
        updates.photoSpotScore = Math.min(10, photo.score);
        updates.photoTip = photo.photoTip;
        updates.bestPhotoTime = photo.bestTime;
        photoMatched++;
      }

      const tour = packageTourMap.get(dbPlaceId);
      if (tour) {
        updates.isPackageTourIncluded = tour.included;
        updates.packageMentionCount = tour.mentionCount;
        tourMatched++;
      }

      return { ...place, ...updates };
    });

    console.log(`[Photo/Tour] 보강 완료: 포토스팟 ${photoMatched}곳, 패키지투어 ${tourMatched}곳 매칭`);
    return enriched;
  } catch (error) {
    console.error('[Photo/Tour] 보강 실패:', error);
    return placesArr;
  }
}

// ===== Phase 1-7: 바이브별 동적 가중치 매트릭스 =====
// 각 바이브가 선택되었을 때 6요소의 비중이 달라짐
// [koreanPop, photoSpot, verifiedFame, vibe, value, practical]
const VIBE_WEIGHT_MATRIX: Record<Vibe, [number, number, number, number, number, number]> = {
  Hotspot:   [0.20, 0.35, 0.10, 0.15, 0.10, 0.10], // 포토스팟 최우선
  Romantic:  [0.25, 0.30, 0.10, 0.20, 0.08, 0.07], // 포토+분위기 감성
  Culture:   [0.15, 0.15, 0.30, 0.15, 0.15, 0.10], // 유명세(패키지/TA) 최우선
  Foodie:    [0.20, 0.10, 0.15, 0.10, 0.20, 0.25], // 가성비+실용(리뷰수) 우선
  Healing:   [0.10, 0.20, 0.10, 0.35, 0.10, 0.15], // 분위기(AI평가) 최우선
  Adventure: [0.15, 0.15, 0.15, 0.25, 0.15, 0.15], // 균등+분위기 약간 높음
};

// ===== 데이터 등급별 보정 매트릭스 =====
// 데이터 부족시 한국 데이터 의존도를 낮추고 AI/Google 의존도를 높임
// [koreanPop, photoSpot, verifiedFame, vibe, value, practical]
type DataGrade = 'A' | 'B' | 'C' | 'D';
const DATA_GRADE_ADJUSTMENT: Record<DataGrade, [number, number, number, number, number, number]> = {
  A: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0], // 데이터 풍부: 원래 가중치 그대로
  B: [0.7, 0.8, 1.0, 1.3, 0.9, 1.2], // 데이터 보통: 한국 데이터↓, AI↑
  C: [0.3, 0.4, 0.8, 2.0, 0.5, 1.8], // 데이터 부족: AI+Google 크게 의존
  D: [0.1, 0.1, 0.5, 2.5, 0.3, 2.2], // 데이터 없음: 거의 AI+Google만
};

/**
 * Phase 1-7: 데이터 등급 판단
 * 전체 장소 목록에서 한국 데이터가 얼마나 채워져 있는지 측정
 */
function detectDataGrade(placesArr: PlaceResult[]): DataGrade {
  if (placesArr.length === 0) return 'D';

  let hasKoreanPop = 0;
  let hasPhotoSpot = 0;
  let hasVerifiedFame = 0;
  let hasPrice = 0;

  for (const p of placesArr) {
    if (p.koreanPopularityScore && p.koreanPopularityScore > 0) hasKoreanPop++;
    if (p.photoSpotScore && p.photoSpotScore > 0) hasPhotoSpot++;
    if (p.isPackageTourIncluded || (p.tripAdvisorRating && p.tripAdvisorRating > 0)) hasVerifiedFame++;
    if (p.estimatedPriceEur && p.estimatedPriceEur > 0) hasPrice++;
  }

  const total = placesArr.length;
  const koreanRatio = hasKoreanPop / total;
  const photoRatio = hasPhotoSpot / total;
  const fameRatio = hasVerifiedFame / total;
  const priceRatio = hasPrice / total;
  const avgCoverage = (koreanRatio + photoRatio + fameRatio + priceRatio) / 4;

  if (avgCoverage >= 0.4) return 'A'; // 40%+ 데이터 커버리지
  if (avgCoverage >= 0.2) return 'B'; // 20%+
  if (avgCoverage >= 0.05) return 'C'; // 5%+
  return 'D'; // 거의 없음
}

/**
 * Phase 1-7: 바이브 기반 동적 가중치 계산
 * 사용자 선택 바이브 + 데이터 등급을 조합하여 최종 가중치 산출
 * 
 * @param vibes 사용자 선택 바이브 (1~3개, 순서 = 우선순위)
 * @param dataGrade 목적지의 데이터 밀도 등급
 * @returns 6요소 가중치 배열 (합계 = 1.0)
 */
function calculateDynamicWeights(
  vibes: Vibe[],
  dataGrade: DataGrade
): { koreanPop: number; photoSpot: number; verifiedFame: number; vibe: number; value: number; practical: number } {
  // 1. 바이브 가중치 블렌딩 (선택 순서에 따른 우선순위)
  const VIBE_PRIORITY: Record<number, number[]> = {
    1: [1.0],
    2: [0.60, 0.40],
    3: [0.50, 0.30, 0.20],
  };
  const priorities = VIBE_PRIORITY[vibes.length] || [0.50, 0.30, 0.20];

  // 블렌딩된 가중치 초기화
  let blended: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

  for (let i = 0; i < vibes.length && i < 3; i++) {
    const vibeMatrix = VIBE_WEIGHT_MATRIX[vibes[i]];
    const priority = priorities[i];
    for (let j = 0; j < 6; j++) {
      blended[j] += vibeMatrix[j] * priority;
    }
  }

  // 2. 데이터 등급 보정 적용
  const adjustment = DATA_GRADE_ADJUSTMENT[dataGrade];
  for (let j = 0; j < 6; j++) {
    blended[j] *= adjustment[j];
  }

  // 3. 정규화 (합계 = 1.0)
  const sum = blended.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (let j = 0; j < 6; j++) {
      blended[j] /= sum;
    }
  }

  return {
    koreanPop: blended[0],
    photoSpot: blended[1],
    verifiedFame: blended[2],
    vibe: blended[3],
    value: blended[4],
    practical: blended[5],
  };
}

/**
 * Reality Check: 실제 수집된 날씨/위기 데이터 조회
 * 하드코딩 제거 → Supabase DB의 weatherCache + crisisAlerts 활용
 */
async function getRealityCheckForCity(destination: string): Promise<{ weather: string; crowd: string; status: string }> {
  try {
    // 도시 찾기
    const cityRows = await db.select().from(cities)
      .where(eq(cities.name, destination))
      .limit(1);
    
    if (cityRows.length === 0) {
      return { weather: 'Unknown', crowd: 'Medium', status: 'Open' };
    }
    const cityId = cityRows[0].id;

    // 1. 최신 날씨 데이터 조회
    let weatherStatus = 'Sunny';
    const latestWeather = await db.select().from(weatherCache)
      .where(eq(weatherCache.cityId, cityId))
      .orderBy(desc(weatherCache.fetchedAt))
      .limit(1);
    
    if (latestWeather.length > 0) {
      const w = latestWeather[0];
      const condition = (w.weatherCondition || '').toLowerCase();
      if (condition.includes('rain') || condition.includes('drizzle')) weatherStatus = 'Rainy';
      else if (condition.includes('snow')) weatherStatus = 'Snowy';
      else if (condition.includes('cloud')) weatherStatus = 'Cloudy';
      else if (condition.includes('thunder') || condition.includes('storm')) weatherStatus = 'Stormy';
      else if (w.temperature && w.temperature > 35) weatherStatus = 'Hot';
      else if (w.temperature && w.temperature < 0) weatherStatus = 'Cold';
      else weatherStatus = 'Sunny';
    }

    // 2. 활성 위기 정보 조회
    let crisisStatus = 'Open';
    const activeCrisis = await db.select().from(crisisAlerts)
      .where(and(
        eq(crisisAlerts.cityId, cityId),
        eq(crisisAlerts.isActive, true)
      ))
      .orderBy(desc(crisisAlerts.severity))
      .limit(1);
    
    if (activeCrisis.length > 0 && activeCrisis[0].severity >= 7) {
      crisisStatus = 'Warning';
    } else if (activeCrisis.length > 0) {
      crisisStatus = 'Caution';
    }

    return { weather: weatherStatus, crowd: 'Medium', status: crisisStatus };
  } catch (error) {
    console.warn('[RealityCheck] DB 조회 실패, 기본값 반환:', error);
    return { weather: 'Unknown', crowd: 'Medium', status: 'Open' };
  }
}

/**
 * Phase 1-5+1-7: 최종 종합 점수 계산 (동적 6요소 공식)
 * 
 * 기존 고정 공식 → 바이브+데이터 등급에 따라 가중치가 자동 조정
 * 
 * 예시:
 *   Hotspot + A등급 → 포토35% > 한국인기20% > 분위기15% > ...
 *   Healing + C등급 → 분위기70% > 실용27% > ... (한국데이터 거의 무시)
 */
function calculateFinalScore(
  place: PlaceResult,
  weights: { koreanPop: number; photoSpot: number; verifiedFame: number; vibe: number; value: number; practical: number }
): number {
  // 1. 한국인 인기도 - enrichPlacesWithKoreanPopularity에서 계산됨
  const koreanPop = Math.min(10, place.koreanPopularityScore || 0);

  // 2. 포토스팟 점수 - enrichPlacesWithPhotoAndTour에서 세팅됨
  const photoSpot = Math.min(10, place.photoSpotScore || 0);

  // 3. 검증된 유명세 - 패키지 투어 + TripAdvisor
  let verifiedFame = 0;
  if (place.isPackageTourIncluded) {
    verifiedFame += Math.min(5, 3 + (place.packageMentionCount || 0));
  }
  if (place.tripAdvisorRating) {
    verifiedFame += place.tripAdvisorRating;
  }
  verifiedFame = Math.min(10, verifiedFame);

  // 4. 분위기 점수 - Gemini AI + Google 평점 기반
  const vibe = Math.min(10, place.vibeScore || 0);

  // 5. 가성비 점수
  let valueScore = 5;
  if (place.estimatedPriceEur !== undefined && place.estimatedPriceEur > 0) {
    valueScore = Math.max(2, 10 - Math.log10(place.estimatedPriceEur + 1) * 4);
    if (place.tripAdvisorRating && place.tripAdvisorRating >= 4.0 && place.estimatedPriceEur < 30) {
      valueScore = Math.min(10, valueScore + 2);
    }
  }

  // 6. 실용성 점수
  let practicalScore = 3;
  if (place.tripAdvisorReviewCount) {
    practicalScore = Math.min(10, Math.log10(place.tripAdvisorReviewCount + 1) * 3.3);
  }
  if (koreanPop > 3) {
    practicalScore = Math.min(10, practicalScore + 1.5);
  }

  // ===== 동적 가중치 합산 =====
  const finalScore = 
    (koreanPop * weights.koreanPop) +
    (photoSpot * weights.photoSpot) +
    (verifiedFame * weights.verifiedFame) +
    (vibe * weights.vibe) +
    (valueScore * weights.value) +
    (practicalScore * weights.practical);

  return Math.min(10, finalScore);
}

/**
 * Phase 1-6: 선정 이유 생성 (최소 2개) + 신뢰도 레벨 판단
 * 데이터 기반 이유 → AI 기반 이유 → 실용적 이유 순으로 채움
 */
function generateSelectionReasons(place: PlaceResult): { reasons: string[]; confidence: 'high' | 'medium' | 'low' | 'minimal' } {
  const reasons: string[] = [];
  let dataPoints = 0; // 보유 데이터 수 (신뢰도 판단용)

  // ===== 데이터 기반 이유 (가장 강력) =====

  // 한국인 인기도
  if (place.koreanPopularityScore && place.koreanPopularityScore > 3) {
    reasons.push(`한국인 인기도 상위 (점수 ${place.koreanPopularityScore.toFixed(1)}/10)`);
    dataPoints += 2;
  } else if (place.koreanPopularityScore && place.koreanPopularityScore > 0) {
    reasons.push(`한국 여행자 언급 확인됨`);
    dataPoints += 1;
  }

  // 포토스팟
  if (place.photoSpotScore && place.photoSpotScore > 5) {
    reasons.push(`인기 포토스팟 (점수 ${place.photoSpotScore.toFixed(1)}/10)`);
    dataPoints += 1;
  }
  if (place.photoTip) {
    reasons.push(`촬영 팁: ${place.photoTip}`);
  }

  // 패키지 투어 포함
  if (place.isPackageTourIncluded) {
    const mentionTxt = place.packageMentionCount && place.packageMentionCount > 1 
      ? ` (${place.packageMentionCount}개 여행사 포함)` : '';
    reasons.push(`한국 패키지 투어 포함 장소${mentionTxt}`);
    dataPoints += 2;
  }

  // TripAdvisor
  if (place.tripAdvisorRating && place.tripAdvisorRating >= 4.0) {
    const reviewTxt = place.tripAdvisorReviewCount 
      ? ` (리뷰 ${place.tripAdvisorReviewCount.toLocaleString()}개)` : '';
    reasons.push(`TripAdvisor ${place.tripAdvisorRating.toFixed(1)}점${reviewTxt}`);
    dataPoints += 1;
  }
  if (place.tripAdvisorRanking) {
    reasons.push(`TripAdvisor ${place.tripAdvisorRanking}`);
    dataPoints += 1;
  }

  // 가격 정보
  if (place.estimatedPriceEur !== undefined && place.priceSource) {
    const sourceLabel = place.priceSource === 'myrealtrip' ? '마이리얼트립'
      : place.priceSource === 'klook' ? '클룩'
      : place.priceSource === 'tripdotcom' ? '트립닷컴'
      : place.priceSource;
    reasons.push(`${sourceLabel} 기준 약 €${Math.round(place.estimatedPriceEur)}`);
    dataPoints += 1;
  }

  // ===== AI/분위기 기반 이유 =====
  if (place.personaFitReason && reasons.length < 4) {
    reasons.push(place.personaFitReason);
  }

  // 바이브 태그 기반
  if (place.vibeTags && place.vibeTags.length > 0 && reasons.length < 4) {
    const vibeLabels: Record<string, string> = {
      Healing: '힐링', Adventure: '모험', Hotspot: '핫플',
      Foodie: '미식', Romantic: '로맨틱', Culture: '문화'
    };
    const tags = place.vibeTags.map(v => vibeLabels[v] || v).join(', ');
    reasons.push(`${tags} 분위기 매칭`);
  }

  // ===== 최소 2개 보장 (부족하면 실용적 이유 추가) =====
  if (reasons.length < 2) {
    if (place.vibeScore > 5) {
      reasons.push(`AI 분위기 분석 높은 평가 (${place.vibeScore.toFixed(1)}/10)`);
    }
    if (reasons.length < 2 && place.description) {
      reasons.push(place.description.length > 60 ? place.description.substring(0, 57) + '...' : place.description);
    }
    if (reasons.length < 2) {
      reasons.push('여행 동선 최적화 기반 선정');
    }
  }

  // ===== 신뢰도 레벨 =====
  // high: 3개 이상 데이터 소스 + 한국 인기도 있음
  // medium: 2개 데이터 소스 또는 TripAdvisor 데이터 있음
  // low: 1개 데이터 소스
  // minimal: 데이터 없음, AI 추천만
  let confidence: 'high' | 'medium' | 'low' | 'minimal';
  if (dataPoints >= 4 && place.koreanPopularityScore && place.koreanPopularityScore > 2) {
    confidence = 'high';
  } else if (dataPoints >= 2) {
    confidence = 'medium';
  } else if (dataPoints >= 1) {
    confidence = 'low';
  } else {
    confidence = 'minimal';
  }

  return { reasons: reasons.slice(0, 5), confidence }; // 최대 5개
}

function getPlaceTypesForVibes(vibes: Vibe[]): string[] {
  const vibeToPlaceTypes: Record<Vibe, string[]> = {
    Healing: ['spa', 'park', 'natural_feature', 'beach'],
    Adventure: ['tourist_attraction', 'hiking_area', 'amusement_park', 'zoo'],
    Hotspot: ['night_club', 'bar', 'shopping_mall', 'landmark'],
    Foodie: ['restaurant', 'cafe', 'bakery', 'food'],
    Romantic: ['restaurant', 'park', 'museum', 'art_gallery'],
    Culture: ['museum', 'art_gallery', 'library', 'historical_landmark'],
  };

  const types = new Set<string>();
  for (const vibe of vibes) {
    for (const type of vibeToPlaceTypes[vibe] || []) {
      types.add(type);
    }
  }
  return Array.from(types);
}

/**
 * 장소의 Vibe 점수 계산
 * 
 * 🎯 가중치 적용 로직:
 * - 사용자가 선택한 vibes와 장소의 vibeTags 매칭도 반영
 * - 선택 순서에 따라 가중치: 1순위(50%) > 2순위(30%) > 3순위(20%)
 * - 2개 선택시: 60% : 40%
 */
function calculatePlaceVibeScore(
  place: any, 
  vibes: Vibe[],
  vibeWeights?: { vibe: Vibe; weight: number; percentage: number }[]
): number {
  const rating = place.rating || 3;
  const reviewCount = place.userRatingCount || 0;
  const reviewBonus = Math.min(2, Math.log10(reviewCount + 1) * 0.5);
  
  // 기본 점수 (평점 기반)
  let baseScore = Math.min(8, rating * 1.2 + reviewBonus);
  
  // 🎯 Vibe 매칭 보너스 (사용자 선택 가중치 적용)
  const placeVibes = mapPlaceTypesToVibes(place.types || []);
  let vibeMatchBonus = 0;
  
  if (vibeWeights && vibeWeights.length > 0) {
    // 가중치 기반 매칭
    for (const vw of vibeWeights) {
      if (placeVibes.includes(vw.vibe)) {
        // 매칭되면 가중치만큼 보너스 (최대 2점)
        vibeMatchBonus += (vw.weight * 2);
      }
    }
  } else if (vibes.length > 0) {
    // 가중치 없으면 단순 매칭 (fallback)
    const matchCount = vibes.filter(v => placeVibes.includes(v)).length;
    vibeMatchBonus = Math.min(2, matchCount * 0.7);
  }
  
  return Math.min(10, baseScore + vibeMatchBonus);
}

function getPersonaFitReason(placeTypes: string[], vibes: Vibe[]): string {
  if (vibes.includes('Foodie') && placeTypes.some(t => ['restaurant', 'cafe', 'bakery'].includes(t))) {
    return '미식 탐험에 완벽한 장소';
  }
  if (vibes.includes('Culture') && placeTypes.some(t => ['museum', 'art_gallery'].includes(t))) {
    return '문화적 경험을 위한 최적의 선택';
  }
  if (vibes.includes('Healing') && placeTypes.some(t => ['spa', 'park'].includes(t))) {
    return '힐링과 휴식을 위한 공간';
  }
  if (vibes.includes('Adventure') && placeTypes.some(t => ['tourist_attraction', 'amusement_park'].includes(t))) {
    return '모험과 새로운 경험의 장소';
  }
  return '여행의 특별한 순간을 만들어줄 곳';
}

function mapPlaceTypesToVibes(placeTypes: string[]): Vibe[] {
  const vibes: Vibe[] = [];
  if (placeTypes.some(t => ['spa', 'park', 'beach'].includes(t))) vibes.push('Healing');
  if (placeTypes.some(t => ['restaurant', 'cafe', 'bakery', 'food'].includes(t))) vibes.push('Foodie');
  if (placeTypes.some(t => ['museum', 'art_gallery', 'library'].includes(t))) vibes.push('Culture');
  if (placeTypes.some(t => ['tourist_attraction', 'amusement_park'].includes(t))) vibes.push('Adventure');
  if (placeTypes.some(t => ['night_club', 'bar', 'shopping_mall'].includes(t))) vibes.push('Hotspot');
  return vibes.length > 0 ? vibes : ['Healing'];
}

function getPriceEstimate(priceLevel: number | undefined, travelStyle: TravelStyle): string {
  const basePrice = priceLevel || 2;
  const multipliers: Record<TravelStyle, number> = {
    Luxury: 3,
    Premium: 2,
    Reasonable: 1,
    Economic: 0.7,
  };
  const estimatedLevel = Math.round(basePrice * multipliers[travelStyle]);
  const priceLabels = ['무료', '저렴함', '보통', '비쌈', '매우 비쌈'];
  return priceLabels[Math.min(4, Math.max(0, estimatedLevel))] || '보통';
}

/**
 * DB 수집 데이터에서 한국인 인기 장소 목록을 가져와 프롬프트에 주입
 * → AI가 "추측"이 아닌 "실제 데이터 기반"으로 장소를 추천하게 함
 */
async function getKoreanPopularPlacesForPrompt(cityName: string): Promise<string> {
  if (!db) return '';
  
  try {
    // 도시 ID 조회
    const cityMatch = await db.select({ id: cities.id })
      .from(cities)
      .where(ilike(cities.name, `%${cityName}%`))
      .limit(1);
    
    if (cityMatch.length === 0) return '';
    const cityId = cityMatch[0].id;
    
    // 1. 인스타그램 인기 해시태그 (게시물 수 순)
    const popularHashtags = await db.select({
      hashtag: instagramHashtags.hashtag,
      postCount: instagramHashtags.postCount,
    })
      .from(instagramHashtags)
      .where(eq(instagramHashtags.linkedCityId, cityId))
      .orderBy(sql`${instagramHashtags.postCount} DESC NULLS LAST`)
      .limit(10);
    
    // 2. 유튜브에서 언급된 장소 (언급 횟수 순)
    const popularYtPlaces = await db.select({
      placeName: youtubePlaceMentions.placeName,
      count: sql<number>`count(*)`,
    })
      .from(youtubePlaceMentions)
      .where(ilike(youtubePlaceMentions.cityName, `%${cityName}%`))
      .groupBy(youtubePlaceMentions.placeName)
      .orderBy(sql`count(*) DESC`)
      .limit(10);
    
    // 3. 네이버 블로그에서 언급된 장소 (글 수 순)
    const popularBlogPlaces = await db.select({
      postTitle: naverBlogPosts.postTitle,
      sentimentScore: naverBlogPosts.sentimentScore,
    })
      .from(naverBlogPosts)
      .where(eq(naverBlogPosts.cityId, cityId))
      .orderBy(sql`${naverBlogPosts.sentimentScore} DESC NULLS LAST`)
      .limit(10);
    
    // 4. DB에 등록된 고평점 장소 (finalScore 순)
    const topDbPlaces = await db.select({
      name: places.name,
      type: places.type,
      finalScore: places.finalScore,
      userRatingCount: places.userRatingCount,
      googleMapsUri: places.googleMapsUri,
    })
      .from(places)
      .where(eq(places.cityId, cityId))
      .orderBy(sql`${places.finalScore} DESC NULLS LAST`)
      .limit(15);
    
    // 프롬프트 섹션 생성
    const sections: string[] = [];
    
    if (popularHashtags.length > 0) {
      sections.push(`📸 인스타그램 인기 (게시물 수 기준):\n${popularHashtags.map(h => `  - ${h.hashtag} (${h.postCount?.toLocaleString() || '?'}개)`).join('\n')}`);
    }
    
    if (popularYtPlaces.length > 0) {
      sections.push(`🎬 유튜브 한국인 언급 장소:\n${popularYtPlaces.map(p => `  - ${p.placeName} (${p.count}회 언급)`).join('\n')}`);
    }
    
    if (popularBlogPlaces.length > 0) {
      const blogKeywords = popularBlogPlaces.map(b => b.postTitle).slice(0, 5);
      sections.push(`📝 네이버 블로그 인기 키워드:\n${blogKeywords.map(t => `  - "${t}"`).join('\n')}`);
    }
    
    if (topDbPlaces.length > 0) {
      sections.push(`⭐ DB 등록 한국인 인기 장소 (점수순):\n${topDbPlaces.map(p => `  - ${p.name} (${p.type}, 리뷰 ${p.userRatingCount || 0}개, 점수 ${p.finalScore?.toFixed(1) || '?'})`).join('\n')}`);
    }
    
    if (sections.length === 0) return '';
    
    console.log(`[Itinerary] 📊 DB 수집 데이터 ${sections.length}개 섹션을 프롬프트에 주입`);
    
    return `\n【📊 실제 수집 데이터 기반 한국인 인기 장소 (반드시 우선 반영)】
아래는 인스타그램, 유튜브, 네이버 블로그에서 실제 수집된 한국인 인기 데이터입니다.
이 데이터에 나온 장소를 최우선으로 포함하고, 추가 장소는 이 패턴에 맞게 추천하세요.

${sections.join('\n\n')}
`;
  } catch (error) {
    console.error('[Itinerary] DB 인기 장소 조회 실패:', error);
    return '';
  }
}

async function generatePlacesWithGemini(
  formData: TripFormData,
  vibeWeights: { vibe: Vibe; weight: number; percentage: number }[],
  requiredPlaceCount: number = 12,
  koreanSentiment?: KoreanSentimentData
): Promise<PlaceResult[]> {
  const vibeDescription = vibeWeights
    .map(v => `${v.vibe}(${v.percentage}%)`)
    .join(', ');

  // 여행 페이스 한글 변환 (프론트엔드 기준 Normal 사용)
  const paceKorean = formData.travelPace === 'Packed' ? '빡빡하게' 
    : formData.travelPace === 'Normal' ? '보통' 
    : '여유롭게';
  
  // 페이스 설정 (프론트엔드 기준 Normal)
  const paceConfig = PACE_CONFIG[formData.travelPace || 'Normal'];
  
  // 한국 감성 데이터 섹션 (있으면 추가)
  const sentimentSection = koreanSentiment
    ? formatSentimentForPrompt(koreanSentiment, formData.destination)
    : '';
  
  // ===== 📊 DB 수집 데이터 기반 인기 장소를 프롬프트에 주입 =====
  const dbPopularitySection = await getKoreanPopularPlacesForPrompt(formData.destination);

  // ===== 🎯 주인공 컨텍스트 생성 (가중치 1순위) =====
  // birthDate: 사용자 본인 생년월일 → 가족 연령 추정에 활용
  const protagonistContext = generatePromptContext({
    curationFocus: (formData.curationFocus as any) || 'Everyone',
    companionType: (formData.companionType as any) || 'Couple',
    companionCount: formData.companionCount || 2,
    companionAges: formData.companionAges,
    vibes: vibeWeights.map(v => v.vibe),
    destination: formData.destination,
    birthDate: formData.birthDate,  // 🎯 사용자 연령 → Gemini 프롬프트
  });
  
  // 주인공 문장 (로그 및 저장용)
  const protagonistInfo = generateProtagonistSentence({
    curationFocus: (formData.curationFocus as any) || 'Everyone',
    companionType: (formData.companionType as any) || 'Couple',
    companionCount: formData.companionCount || 2,
    companionAges: formData.companionAges,
    vibes: vibeWeights.map(v => v.vibe),
    destination: formData.destination,
    birthDate: formData.birthDate,  // 🎯 사용자 연령
  });
  
  console.log(`[Itinerary] 🎯 주인공: ${protagonistInfo.sentence}`);

  const prompt = `당신은 전문 여행 플래너입니다. 다음 조건에 맞는 ${formData.destination} 여행지를 추천해주세요.

${protagonistContext}

【사용자 여행 조건】
- 바이브 선호: ${vibeDescription}
- 여행 스타일: ${formData.travelStyle}
- 여행 밀도: ${paceKorean} (하루 ${paceConfig.maxSlotsPerDay}곳, ${paceConfig.slotDurationMinutes}분 간격)
- 이동 스타일: ${formData.mobilityStyle === 'WalkMore' ? '많이 걷기' : '이동 최소화'}
- 동행: ${formData.companionType}, ${formData.companionCount}명

${sentimentSection}

【중요한 추천 기준 - 5단계 가중치】
1. ⭐ 주인공 (위 "일정 생성의 주인공" 섹션 최우선 반영)
2. 누구랑 (동행 타입에 맞는 장소 우선)
3. 바이브 선호 (사용자가 선택한 취향 반영)
4. 예산 수준 (${formData.travelStyle})
5. 실제 정보 (영업 중인 곳, 리뷰 좋은 곳)

【동선 최적화 규칙】
1. 같은 도시/지역의 장소들을 연속 일자에 배치할 수 있도록 그룹핑
2. 도시 간 이동이 필요한 경우, 인접한 도시끼리 묶기
3. 각 장소에 반드시 city(도시명)와 region(지역/구역) 정보 포함
4. 오전-점심-오후-저녁 시간대에 맞는 장소 배치 (식당은 점심/저녁에)

【한국인 선호도 반영 - 최우선 규칙】
한국인 여행자들이 실제로 많이 방문하고, SNS에서 인기 있는 장소를 최우선으로 추천해주세요.
${koreanSentiment?.instagram.trendingHashtags.length ? `인기 해시태그: ${koreanSentiment.instagram.trendingHashtags.slice(0, 3).join(', ')}` : ''}
${koreanSentiment?.naverBlog.keywords.length ? `자주 언급 키워드: ${koreanSentiment.naverBlog.keywords.slice(0, 3).join(', ')}` : ''}
${dbPopularitySection}

【⚠️ 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.】

JSON 응답 형식 (엄격히 준수):
{
  "places": [
    {
      "name": "실제 존재하는 장소의 정확한 이름 (구글맵 검색 가능해야 함)",
      "description": "한국인에게 인기인 구체적 이유 (예: 인스타 핫플, 유튜브 ○○채널 추천, 리뷰 1000+개)",
      "city": "도시명",
      "region": "지역/구역",
      "lat": 48.8584,
      "lng": 2.2945,
      "vibeScore": 8,
      "koreanPopularity": 9,
      "tags": ["restaurant", "landmark"],
      "vibeTags": ["Foodie", "Culture"],
      "recommendedTime": "morning",
      "priceEstimate": "€20-30"
    }
  ]
}

필수 규칙:
- name: 반드시 실제 존재하는 장소명 (가상 장소 금지)
- lat/lng: 반드시 실제 좌표 (0이면 안 됨)
- vibeScore: 1~10 정수
- vibeTags: 반드시 ["Healing","Adventure","Hotspot","Foodie","Romantic","Culture"] 중에서만 선택
- recommendedTime: 반드시 "morning"|"lunch"|"afternoon"|"evening" 중 하나
- 식당은 vibeTags에 반드시 "Foodie" 포함

【🍽️ 식사 장소 필수 포함】
- 전체 장소 중 최소 40%는 식당/카페/레스토랑으로 포함해주세요
- 점심/저녁용 식당은 반드시 "Foodie" vibeTags에 포함
- 현지인과 한국인 모두에게 인기 있는 맛집 우선

${formData.destination}의 실제 유명한 장소들을 추천해주세요. 정확히 ${requiredPlaceCount}개 장소를 추천해주세요. 
도시별로 균형있게 분배하고, 각 도시 내에서는 지역별로 묶어주세요.`;

  try {
    // API 키 존재 확인
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.error('[Itinerary] ❌ Gemini API 키 없음 - AI 장소 생성 불가');
      throw new Error('GEMINI_API_KEY_MISSING');
    }

    console.log(`[Itinerary] 🤖 Gemini에 ${requiredPlaceCount}개 장소 요청 중...`);
    
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = response.text || "";
    console.log(`[Itinerary] 🤖 Gemini 응답 수신 (${text.length}자)`);
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const placesRaw = result.places || [];
      
      if (placesRaw.length === 0) {
        console.warn('[Itinerary] ⚠️ Gemini가 장소를 0개 반환함');
      } else {
        console.log(`[Itinerary] ✅ Gemini가 ${placesRaw.length}개 장소 반환`);
      }
      
      // JSON 스키마 검증 - 각 장소에 필수 필드가 있는지 확인
      return placesRaw
        .filter((place: any) => {
          if (!place.name) {
            console.warn('[Itinerary] ⚠️ 이름 없는 장소 제외:', place);
            return false;
          }
          if (!place.lat || !place.lng) {
            console.warn(`[Itinerary] ⚠️ 좌표 없는 장소: ${place.name} (lat=${place.lat}, lng=${place.lng})`);
            // 좌표 없어도 일단 포함 (0,0으로 대체)
          }
          return true;
        })
        .map((place: any, index: number) => ({
          id: `gemini-${Date.now()}-${index}`,
          name: place.name,
          description: place.description || '',
          lat: place.lat || 0,
          lng: place.lng || 0,
          vibeScore: Math.min(10, Math.max(1, place.vibeScore || 7)),
          confidenceScore: 7,
          sourceType: "Gemini AI",
          personaFitReason: place.personaFitReason || place.description || "AI가 추천한 장소",
          tags: Array.isArray(place.tags) ? place.tags : [],
          vibeTags: Array.isArray(place.vibeTags) ? place.vibeTags.filter((v: string) => 
            ['Healing', 'Adventure', 'Hotspot', 'Foodie', 'Romantic', 'Culture'].includes(v)
          ) : [],
          image: "",
          priceEstimate: place.priceEstimate || "보통",
          placeTypes: [],
          recommendedTime: place.recommendedTime,
          city: place.city || formData.destination,
          region: place.region || "",
          koreanPopularityScore: 0, // 이후 enrichPlacesWithKoreanPopularity에서 계산
          googleMapsUrl: "", // Gemini 장소는 Google Maps URI 없음
        }));
    } else {
      console.error('[Itinerary] ❌ Gemini 응답에서 JSON을 찾을 수 없음');
      console.error('[Itinerary] 응답 내용 (첫 500자):', text.slice(0, 500));
    }
  } catch (error: any) {
    if (error.message === 'GEMINI_API_KEY_MISSING') {
      throw error; // API 키 없는 에러는 상위로 전파
    }
    console.error("[Itinerary] ❌ Gemini 장소 생성 실패:", error?.message || error);
    console.error("[Itinerary] 에러 상세:", error?.status || 'N/A', error?.statusText || 'N/A');
  }

  return [];
}

function calculateDayCount(startDate: string, endDate: string): number {
  console.log(`[Itinerary] Date inputs: startDate="${startDate}", endDate="${endDate}"`);
  const start = new Date(startDate);
  const end = new Date(endDate);
  console.log(`[Itinerary] Parsed dates: start=${start.toISOString()}, end=${end.toISOString()}`);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  console.log(`[Itinerary] Calculated dayCount: ${dayCount}`);
  return dayCount;
}

function groupPlacesByCity(places: PlaceResult[]): Map<string, PlaceResult[]> {
  const cityGroups = new Map<string, PlaceResult[]>();
  
  for (const place of places) {
    const city = place.city || 'Unknown';
    if (!cityGroups.has(city)) {
      cityGroups.set(city, []);
    }
    cityGroups.get(city)!.push(place);
  }
  
  return cityGroups;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function optimizeCityOrder(cityGroups: Map<string, PlaceResult[]>): string[] {
  const cities = Array.from(cityGroups.keys());
  if (cities.length <= 1) return cities;
  
  const cityCoords = new Map<string, { lat: number; lng: number }>();
  for (const [city, places] of cityGroups) {
    const avgLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
    const avgLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
    cityCoords.set(city, { lat: avgLat, lng: avgLng });
  }
  
  const ordered: string[] = [cities[0]];
  const remaining = new Set(cities.slice(1));
  
  while (remaining.size > 0) {
    const lastCity = ordered[ordered.length - 1];
    const lastCoords = cityCoords.get(lastCity)!;
    
    let nearestCity = '';
    let minDistance = Infinity;
    
    for (const city of remaining) {
      const coords = cityCoords.get(city)!;
      const dist = calculateDistance(lastCoords.lat, lastCoords.lng, coords.lat, coords.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestCity = city;
      }
    }
    
    ordered.push(nearestCity);
    remaining.delete(nearestCity);
  }
  
  return ordered;
}

export async function generateItinerary(formData: TripFormData) {
  const vibes = formData.vibes || ['Foodie', 'Culture', 'Healing'];
  const curationFocus = formData.curationFocus || 'Everyone';
  const vibeWeights = calculateVibeWeights(vibes, curationFocus);
  
  // 여행 밀도 기본값: Normal (보통) - 프론트엔드 기준
  // Moderate도 Normal로 처리 (하위 호환)
  let travelPace: TravelPace = (formData.travelPace as TravelPace) || 'Normal';
  if (travelPace === 'Moderate' as any) travelPace = 'Normal';
  
  const paceConfig = PACE_CONFIG[travelPace];
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);
  
  // ===== 사용자 시간 기반 슬롯 계산 =====
  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;
  
  // 일별 슬롯 수 계산
  const daySlotsConfig: { day: number; startTime: string; endTime: string; slots: number }[] = [];
  let totalRequiredPlaces = 0;
  
  for (let d = 1; d <= dayCount; d++) {
    let dayStart: string;
    let dayEnd: string;
    
    if (dayCount === 1) {
      // 당일치기: 사용자 출발~종료시간 그대로
      dayStart = userStartTime;
      dayEnd = userEndTime;
    } else if (d === 1) {
      // 첫날: 사용자 출발시간 ~ 21:00
      dayStart = userStartTime;
      dayEnd = DEFAULT_END_TIME;
    } else if (d === dayCount) {
      // 마지막날: 09:00 ~ 사용자 종료시간
      dayStart = DEFAULT_START_TIME;
      dayEnd = userEndTime;
    } else {
      // 중간날: 09:00 ~ 21:00 풀타임
      dayStart = DEFAULT_START_TIME;
      dayEnd = DEFAULT_END_TIME;
    }
    
    const slots = calculateSlotsForDay(dayStart, dayEnd, travelPace);
    daySlotsConfig.push({ day: d, startTime: dayStart, endTime: dayEnd, slots });
    totalRequiredPlaces += slots;
  }
  
  const requiredPlaceCount = totalRequiredPlaces + 4; // 여유분
  
  console.log(`[Itinerary] ===== 일정 생성 시작 =====`);
  console.log(`[Itinerary] 여행 밀도: ${travelPace} (슬롯 간격: ${paceConfig.slotDurationMinutes}분)`);
  console.log(`[Itinerary] 사용자 시간: ${userStartTime} ~ ${userEndTime}`);
  console.log(`[Itinerary] 총 ${dayCount}일, 필요 장소: ${totalRequiredPlaces}곳`);
  daySlotsConfig.forEach(d => {
    console.log(`[Itinerary]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`);
  });
  
  // ===== 한국 감성 데이터 로드 (캐시 우선) =====
  let koreanSentiment: KoreanSentimentData | undefined;
  try {
    koreanSentiment = await getKoreanSentimentForCity(formData.destination, vibes);
    console.log(`[Itinerary] 한국 감성 보너스: +${koreanSentiment.totalBonus.toFixed(2)}`);
  } catch (error) {
    console.warn('[Itinerary] 한국 감성 데이터 로드 실패:', error);
  }
  
  // ===== DB 우선 조회: 시딩된 장소 데이터 먼저 활용 (API 비용 절감) =====
  let placesArr: PlaceResult[] = [];
  let dbPlacesUsed = 0;
  
  try {
    // 1. 도시 ID 찾기
    const cityRows = await db.select().from(cities)
      .where(eq(cities.name, formData.destination))
      .limit(1);
    
    if (cityRows.length > 0) {
      const cityId = cityRows[0].id;
      // 2. DB에서 시딩된 장소 조회 (finalScore 또는 buzzScore가 있는 것 우선)
      const dbPlaces = await db.select().from(places)
        .where(eq(places.cityId, cityId))
        .orderBy(sql`COALESCE(final_score, buzz_score, 0) DESC`)
        .limit(requiredPlaceCount * 3); // 충분히 많이 가져와서 필터링
      
      if (dbPlaces.length > 0) {
        // DB 장소를 PlaceResult 형태로 변환
        placesArr = dbPlaces.map(p => ({
          id: p.googlePlaceId || `db-${p.id}`,
          name: p.name,
          address: p.address || '',
          latitude: p.latitude,
          longitude: p.longitude,
          rating: p.buzzScore ? p.buzzScore / 2 : undefined, // buzzScore(0-10) → rating(0-5)
          userRatingCount: p.userRatingCount || 0,
          priceLevel: p.priceLevel || 2,
          types: p.vibeKeywords || [],
          photoUrls: p.photoUrls || [],
          editorialSummary: p.editorialSummary || '',
          vibeScore: p.vibeScore || 0,
          buzzScore: p.buzzScore || 0,
          tasteVerifyScore: p.tasteVerifyScore || 0,
          finalScore: p.finalScore || 0,
          vibeKeywords: p.vibeKeywords || [],
          sourceType: 'DB (Pre-seeded)',
          // 속성 정보
          goodForChildren: p.goodForChildren || false,
          goodForGroups: p.goodForGroups || false,
          outdoorSeating: p.outdoorSeating || false,
          reservable: p.reservable || false,
          dineIn: p.dineIn || false,
          openingHours: p.openingHours as Record<string, string> || {},
        }));
        dbPlacesUsed = placesArr.length;
        console.log(`[Itinerary] ✅ DB 우선 조회: ${dbPlacesUsed}곳 로드 (API 호출 절감!)`);
      }
    }
  } catch (dbError) {
    console.warn('[Itinerary] DB 우선 조회 실패, Google API로 대체:', dbError);
  }
  
  // DB 장소가 부족할 때만 외부 API 호출 (비용 절감 핵심)
  if (placesArr.length < requiredPlaceCount) {
    console.log(`[Itinerary] DB ${placesArr.length}곳 < 필요 ${requiredPlaceCount}곳 → Google API 보충`);
    const googlePlaces = await searchGooglePlaces(
      formData.destination,
      formData.destinationCoords,
      vibes,
      formData.travelStyle || 'Reasonable'
    );
    // 중복 제거 후 합치기
    const existingNames = new Set(placesArr.map(p => p.name.toLowerCase()));
    const newGooglePlaces = googlePlaces.filter(p => !existingNames.has(p.name.toLowerCase()));
    placesArr = [...placesArr, ...newGooglePlaces];
    console.log(`[Itinerary] DB: ${dbPlacesUsed}곳 + Google: ${newGooglePlaces.length}곳 = 총 ${placesArr.length}곳`);
  } else {
    console.log(`[Itinerary] ✅ DB 데이터만으로 충분! (${placesArr.length}곳) - Google API 호출 생략`);
  }
  
  // Gemini AI로 추가 장소 추천 (DB+Google이 부족할 때만)
  if (placesArr.length < requiredPlaceCount) {
    const aiPlaces = await generatePlacesWithGemini(formData, vibeWeights, requiredPlaceCount, koreanSentiment);
    console.log(`[Itinerary] DB+Google: ${placesArr.length}곳, Gemini 보충: ${aiPlaces.length}곳`);
    placesArr = [...placesArr, ...aiPlaces];
  }
  
  // 부족하면 추가 생성
  let attempts = 0;
  while (placesArr.length < requiredPlaceCount && attempts < 2) {
    attempts++;
    console.log(`[Itinerary] 장소 부족 (${placesArr.length}/${requiredPlaceCount}), 추가 생성 중...`);
    const morePlaces = await generatePlacesWithGemini(formData, vibeWeights, requiredPlaceCount - placesArr.length + 5, koreanSentiment);
    placesArr = [...placesArr, ...morePlaces];
  }
  
  console.log(`[Itinerary] 총 수집 장소: ${placesArr.length}곳`);
  
  // ===== Phase 1: 한국인 인기도 점수 계산 (DB 수집 데이터 직접 활용) =====
  // 기존: Gemini 추측 기반 일괄 보너스 → 변경: 장소별 인스타/유튜브/블로그 DB 데이터 기반
  placesArr = await enrichPlacesWithKoreanPopularity(placesArr, formData.destination);
  
  // ===== Phase 1.5: TripAdvisor + 가격 데이터 통합 =====
  // DB에 수집된 TripAdvisor 평점/리뷰 수 + 실제 가격 정보를 장소에 추가
  placesArr = await enrichPlacesWithTripAdvisorAndPrices(placesArr, formData.destination);
  
  // ===== Phase 1-5: 포토스팟 + 패키지 투어 데이터 보강 =====
  placesArr = await enrichPlacesWithPhotoAndTour(placesArr, formData.destination);
  
  // 기존 한국 감성 보너스도 vibeScore에 반영 (Gemini 데이터 보조 활용)
  if (koreanSentiment) {
    placesArr = placesArr.map(p => ({
      ...p,
      vibeScore: p.vibeScore + (koreanSentiment?.totalBonus || 0) * 0.3, // 보조 역할로 축소
    }));
  }
  
  // ===== Phase 1-7: 데이터 등급 판단 + 바이브 기반 동적 가중치 =====
  const dataGrade = detectDataGrade(placesArr);
  const dynamicWeights = calculateDynamicWeights(vibes, dataGrade);
  
  console.log(`[Itinerary] 데이터 등급: ${dataGrade} | 바이브: ${vibes.join(',')}`);
  console.log(`[Itinerary] 동적 가중치: 한국인기=${(dynamicWeights.koreanPop * 100).toFixed(0)}% 포토=${(dynamicWeights.photoSpot * 100).toFixed(0)}% 유명세=${(dynamicWeights.verifiedFame * 100).toFixed(0)}% 분위기=${(dynamicWeights.vibe * 100).toFixed(0)}% 가성비=${(dynamicWeights.value * 100).toFixed(0)}% 실용=${(dynamicWeights.practical * 100).toFixed(0)}%`);
  
  // ===== Phase 1-5+1-7: 최종 정렬 - 동적 6요소 공식 =====
  // Phase 1-6: 선정 이유 + 신뢰도도 함께 계산
  placesArr = placesArr.map(p => {
    const { reasons, confidence } = generateSelectionReasons(p);
    return {
      ...p,
      finalScore: calculateFinalScore(p, dynamicWeights),
      selectionReasons: reasons,
      confidenceLevel: confidence,
    };
  }).sort((a, b) => {
    return (b.finalScore || 0) - (a.finalScore || 0);
  }).slice(0, requiredPlaceCount + 5);
  
  // 상위 5개 장소 점수 로그
  const top5 = placesArr.slice(0, 5);
  console.log(`[Itinerary] 최종 정렬 완료 (동적 6요소: 바이브=${vibes.join('+')} × 데이터등급=${dataGrade})`);
  top5.forEach((p, i) => {
    console.log(`[Itinerary]   #${i + 1} ${p.name}: finalScore=${(p.finalScore || 0).toFixed(2)} (인기=${(p.koreanPopularityScore || 0).toFixed(1)}, 포토=${(p.photoSpotScore || 0).toFixed(1)}, vibe=${p.vibeScore.toFixed(1)})`);
  });
  
  // ===== 사용자 시간 기반 동적 슬롯 분배 (식사 슬롯 강제 포함) =====
  const schedule = await distributePlacesWithUserTime(placesArr, daySlotsConfig, travelPace, formData.travelStyle || 'Reasonable');
  
  console.log(`[Itinerary] 최종 일정: ${schedule.length}개 슬롯`);
  
  // Days 배열 생성
  const days: { day: number; places: any[]; city: string; summary: string; startTime: string; endTime: string }[] = [];
  
  // 인원수 계산 (companionType 기반)
  const companionCount = getCompanionCount(formData.companionType || 'Solo');
  
  // 이동 수단 결정 (mobilityStyle 기반)
  const travelMode = formData.mobilityStyle === 'WalkMore' ? 'WALK' as const
    : formData.mobilityStyle === 'Minimal' ? 'DRIVE' as const
    : 'TRANSIT' as const;
  
  // 식사 예산 정보
  const mealBudget = MEAL_BUDGET[formData.travelStyle || 'Reasonable'];
  
  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find(c => c.day === d)!;
    const dayPlaces = schedule
      .filter(s => s.day === d)
      .map(s => ({
        ...s.place,
        startTime: s.startTime,
        endTime: s.endTime,
        // 🍽️ 식사 슬롯 정보 추가
        isMealSlot: s.isMealSlot,
        mealType: s.mealType,
        mealPrice: s.isMealSlot ? Math.round((mealBudget.min + mealBudget.max) / 2) : undefined,
        mealPriceLabel: s.isMealSlot ? mealBudget.label : undefined,
        // TripAdvisor 데이터 (프론트엔드 표시용)
        tripAdvisorRating: s.place.tripAdvisorRating,
        tripAdvisorReviewCount: s.place.tripAdvisorReviewCount,
        tripAdvisorRanking: s.place.tripAdvisorRanking,
        // 실제 가격 정보
        estimatedPriceEur: s.place.estimatedPriceEur,
        priceSource: s.place.priceSource,
        // Phase 1-5: 종합 점수
        finalScore: s.place.finalScore,
        // Phase 1-3: 포토스팟 정보
        photoSpotScore: s.place.photoSpotScore,
        photoTip: s.place.photoTip,
        bestPhotoTime: s.place.bestPhotoTime,
        // Phase 1-2: 패키지 투어 포함 여부
        isPackageTourIncluded: s.place.isPackageTourIncluded,
        // Phase 1-6: 선정 이유 + 신뢰도
        selectionReasons: s.place.selectionReasons || [],
        confidenceLevel: s.place.confidenceLevel || 'minimal',
        realityCheck: await getRealityCheckForCity(formData.destination),
      }));
    
    // 🚇 이동 구간 정보 계산
    const transits: {
      from: string;
      to: string;
      mode: string;
      modeLabel: string;
      duration: number;
      durationText: string;
      distance: number;
      cost: number;
      costTotal: number;
    }[] = [];
    
    for (let i = 0; i < dayPlaces.length - 1; i++) {
      const fromPlace = dayPlaces[i];
      const toPlace = dayPlaces[i + 1];
      
      try {
        // routeOptimizer로 실제 경로 계산
        const route = await routeOptimizer.getRoute(
          { id: fromPlace.id, lat: fromPlace.lat, lng: fromPlace.lng, name: fromPlace.name },
          { id: toPlace.id, lat: toPlace.lat, lng: toPlace.lng, name: toPlace.name },
          travelMode
        );
        
        const durationMinutes = Math.round(route.durationSeconds / 60);
        const costPerPerson = route.estimatedCost;
        
        transits.push({
          from: fromPlace.name,
          to: toPlace.name,
          mode: travelMode.toLowerCase(),
          modeLabel: travelMode === 'WALK' ? '도보' 
            : travelMode === 'TRANSIT' ? '지하철' 
            : '차량',
          duration: durationMinutes,
          durationText: `${durationMinutes}분`,
          distance: route.distanceMeters,
          cost: Math.round(costPerPerson * 100) / 100,
          costTotal: Math.round(costPerPerson * companionCount * 100) / 100,
        });
      } catch (error) {
        // 경로 계산 실패 시 기본값
        transits.push({
          from: fromPlace.name,
          to: toPlace.name,
          mode: 'walk',
          modeLabel: '이동',
          duration: 15,
          durationText: '약 15분',
          distance: 1000,
          cost: 0,
          costTotal: 0,
        });
      }
    }
    
    const topVibes = dayPlaces
      .flatMap(p => p.vibeTags)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 2);
    
    const dayCities = dayPlaces
      .map(p => p.city)
      .filter((c, i, arr) => c && arr.indexOf(c) === i);
    
    const cityLabel = dayCities.length > 0 ? dayCities.join(', ') : formData.destination;
    
    days.push({
      day: d,
      places: dayPlaces,
      city: cityLabel,
      summary: `${cityLabel} - ${topVibes.join(' & ')} 중심의 하루`,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      transit: {
        transits,
        totalDuration: transits.reduce((sum, t) => sum + t.duration, 0),
        totalCost: transits.reduce((sum, t) => sum + t.costTotal, 0),
      },
    });
  }
  
  // 여행 밀도 라벨
  const paceLabel = travelPace === 'Packed' ? '빡빡하게' 
    : travelPace === 'Normal' ? '보통' 
    : '여유롭게';
  
  // ===== 자동 저장: Google Places 결과를 DB에 백그라운드 저장 =====
  // 일정 생성시 가져온 장소 중 DB에 없는 것을 자동으로 places 테이블에 저장
  // 응답 속도에 영향 없도록 setTimeout으로 비동기 처리
  const placesToSave = placesArr.filter(p => p.sourceType === "Google Places" && p.id);
  if (placesToSave.length > 0) {
    const destCity = formData.destination;
    setTimeout(async () => {
      try {
        const cityRecord = await db.select().from(cities)
          .where(ilike(cities.name, `%${destCity}%`))
          .then(r => r[0]);
        
        if (!cityRecord) return;
        
        let saved = 0;
        for (const place of placesToSave) {
          try {
            const existing = await storage.getPlaceByGoogleId(place.id);
            if (!existing) {
              await storage.createPlace({
                cityId: cityRecord.id,
                googlePlaceId: place.id,
                name: place.name,
                type: place.placeTypes?.includes("restaurant") ? "restaurant" : 
                      place.placeTypes?.includes("cafe") ? "cafe" : "attraction",
                address: place.description,
                latitude: place.lat,
                longitude: place.lng,
                photoUrls: place.image ? [place.image] : [],
                vibeKeywords: place.vibeTags || [],
                lastDataSync: new Date(),
              });
              saved++;
            }
          } catch (e) { /* 중복 등 무시 */ }
        }
        if (saved > 0) {
          console.log(`[Itinerary AutoSave] ${destCity}: ${saved}/${placesToSave.length}개 장소 DB 저장`);
        }
      } catch (e) {
        console.warn("[Itinerary AutoSave] 자동 저장 실패:", e);
      }
    }, 100);
  }

  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: userStartTime,
    endTime: userEndTime,
    days,
    vibeWeights,
    koreanSentimentBonus: koreanSentiment?.totalBonus || 0,
    // 📋 여행 설정 (프론트엔드에서 사용)
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace: travelPace,
      travelPaceLabel: paceLabel,
      slotDurationMinutes: paceConfig.slotDurationMinutes,
      totalPlaces: schedule.length,
      mobilityStyle: formData.mobilityStyle,
      companionType: formData.companionType,
      companionCount,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      koreanSentimentApplied: !!koreanSentiment,
    },
  };
}

/**
 * 사용자 시간 기반으로 장소를 슬롯에 분배
 * 🍽️ 점심/저녁 슬롯은 반드시 식당 배치 (핵심 로직)
 */
async function distributePlacesWithUserTime(
  places: PlaceResult[],
  daySlotsConfig: { day: number; startTime: string; endTime: string; slots: number }[],
  travelPace: TravelPace,
  travelStyle: TravelStyle = 'Reasonable'
): Promise<{ day: number; slot: string; place: PlaceResult; startTime: string; endTime: string; isMealSlot: boolean; mealType?: 'lunch' | 'dinner' }[]> {
  const schedule: { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string; isMealSlot: boolean; mealType?: 'lunch' | 'dinner' }[] = [];
  const paceConfig = PACE_CONFIG[travelPace];
  
  // 🍽️ 식당/카페 장소 분리
  const foodPlaces = places.filter(p => isFoodPlace(p));
  const nonFoodPlaces = places.filter(p => !isFoodPlace(p));
  
  console.log(`[Itinerary] 🍽️ 식사 장소: ${foodPlaces.length}곳, 일반 장소: ${nonFoodPlaces.length}곳`);
  
  // 도시별 그룹핑 및 순서 최적화 (일반 장소)
  const cityGroups = groupPlacesByCity(nonFoodPlaces);
  const orderedCities = optimizeCityOrder(cityGroups);
  
  const orderedNonFoodPlaces: PlaceResult[] = [];
  for (const city of orderedCities) {
    const cityPlaces = cityGroups.get(city) || [];
    cityPlaces.sort((a, b) => b.vibeScore - a.vibeScore);
    orderedNonFoodPlaces.push(...cityPlaces);
  }
  
  // 🍽️ Phase 1-4: 식당 전용 점수 계산 + 정렬
  // 기존 vibeScore 대신 restaurantScore 사용
  // 우선순위: 리뷰수(40%) > 한국인리뷰(25%) > 인스타(15%) > 유튜브(10%) > 블로그(10%)
  const foodWithScores: { place: PlaceResult; restaurantScore: number }[] = [];
  for (const fp of foodPlaces) {
    const score = await calculateRestaurantScore(fp);
    foodWithScores.push({ place: fp, restaurantScore: score });
  }
  // restaurantScore 내림차순 정렬
  foodWithScores.sort((a, b) => b.restaurantScore - a.restaurantScore);
  
  console.log(`[Itinerary] 🍽️ 식당 점수 계산 완료 (상위: ${foodWithScores.slice(0, 3).map(f => `${f.place.name}=${f.restaurantScore.toFixed(1)}`).join(', ')})`);

  // 도시별 그룹핑 (이미 점수순 정렬됨)
  const foodCityGroups = groupPlacesByCity(foodWithScores.map(f => f.place));
  const orderedFoodPlaces: PlaceResult[] = [];
  
  // 점수순 정렬된 식당을 도시별로 분배하되 점수순 유지
  const foodScoreMap = new Map(foodWithScores.map(f => [f.place.id, f.restaurantScore]));
  
  for (const city of orderedCities) {
    const cityFoodPlaces = foodCityGroups.get(city) || [];
    cityFoodPlaces.sort((a, b) => (foodScoreMap.get(b.id) || 0) - (foodScoreMap.get(a.id) || 0));
    orderedFoodPlaces.push(...cityFoodPlaces);
  }
  // 나머지 도시 식당 추가
  for (const [city, cityFoodPlaces] of foodCityGroups) {
    if (!orderedCities.includes(city)) {
      cityFoodPlaces.sort((a, b) => (foodScoreMap.get(b.id) || 0) - (foodScoreMap.get(a.id) || 0));
      orderedFoodPlaces.push(...cityFoodPlaces);
    }
  }
  
  let nonFoodIndex = 0;
  let foodIndex = 0;
  
  // 식사 예산 정보
  const mealBudget = MEAL_BUDGET[travelStyle];
  
  // 🍽️ 필요한 식사 슬롯 수 계산 (점심 + 저녁 × 일수)
  const requiredMealSlots = daySlotsConfig.length * 2; // 매일 점심 + 저녁
  
  // 식당 부족 시 기본 식당 생성
  if (orderedFoodPlaces.length < requiredMealSlots) {
    const shortage = requiredMealSlots - orderedFoodPlaces.length;
    console.log(`[Itinerary] ⚠️ 식당 부족 (${orderedFoodPlaces.length}/${requiredMealSlots}), ${shortage}개 기본 식당 생성`);
    
    for (let i = 0; i < shortage; i++) {
      const mealType = i % 2 === 0 ? '점심' : '저녁';
      const defaultRestaurant: PlaceResult = {
        id: `default-meal-${Date.now()}-${i}`,
        name: `${mealType} 식사 추천`,
        description: `현지 인기 ${mealType === '점심' ? '레스토랑' : '저녁 식당'} - ${mealBudget.label} 예산`,
        lat: orderedNonFoodPlaces[0]?.lat || 0,
        lng: orderedNonFoodPlaces[0]?.lng || 0,
        vibeScore: 7,
        confidenceScore: 6,
        sourceType: 'Default',
        personaFitReason: `${mealBudget.label} 예산에 맞는 현지 맛집`,
        tags: ['restaurant', 'food'],
        vibeTags: ['Foodie'],
        image: '',
        priceEstimate: mealBudget.label,
        placeTypes: ['restaurant'],
        city: orderedNonFoodPlaces[0]?.city,
        region: orderedNonFoodPlaces[0]?.region,
        koreanPopularityScore: 0,
        googleMapsUrl: '',
      };
      orderedFoodPlaces.push(defaultRestaurant);
    }
  }
  
  for (const dayConfig of daySlotsConfig) {
    const { day, startTime, endTime, slots } = dayConfig;
    
    // 🍽️ 하루에 점심/저녁 각 1개씩만 (이미 배치되면 false)
    let lunchAssigned = false;
    let dinnerAssigned = false;
    
    // 해당 일자의 시간 슬롯 생성
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const dayStartMinutes = startH * 60 + startM;
    const dayEndMinutes = endH * 60 + endM;
    
    let currentMinutes = dayStartMinutes;
    
    for (let slotIdx = 0; slotIdx < slots; slotIdx++) {
      const slotStart = minutesToTime(currentMinutes);
      currentMinutes += paceConfig.slotDurationMinutes;
      const slotEnd = minutesToTime(Math.min(currentMinutes, dayEndMinutes));
      
      // 슬롯 타입 결정 (시간대 기반)
      const slotHour = parseInt(slotStart.split(':')[0]);
      let slotType: 'morning' | 'lunch' | 'afternoon' | 'evening';
      if (slotHour < 12) slotType = 'morning';
      else if (slotHour < 14) slotType = 'lunch';
      else if (slotHour < 18) slotType = 'afternoon';
      else slotType = 'evening';
      
      // 🍽️ 점심/저녁 슬롯인지 확인 (하루에 각 1개씩만!)
      let isMealSlot = false;
      let mealType: 'lunch' | 'dinner' | undefined;
      
      // 점심: 12:00~14:00 범위에서 첫 번째 슬롯만
      if (slotHour >= 12 && slotHour < 14 && !lunchAssigned) {
        isMealSlot = true;
        mealType = 'lunch';
        lunchAssigned = true;
      }
      // 저녁: 18:00~20:00 범위에서 첫 번째 슬롯만
      else if (slotHour >= 18 && slotHour < 20 && !dinnerAssigned) {
        isMealSlot = true;
        mealType = 'dinner';
        dinnerAssigned = true;
      }
      
      let selectedPlace: PlaceResult;
      
      if (isMealSlot && foodIndex < orderedFoodPlaces.length) {
        // 🍽️ 식사 슬롯: 식당 배치
        selectedPlace = orderedFoodPlaces[foodIndex];
        foodIndex++;
        console.log(`[Itinerary] Day ${day} ${mealType}: ${selectedPlace.name} (${mealBudget.label})`);
      } else if (nonFoodIndex < orderedNonFoodPlaces.length) {
        // 일반 슬롯: 일반 장소 배치
        selectedPlace = orderedNonFoodPlaces[nonFoodIndex];
        nonFoodIndex++;
      } else if (foodIndex < orderedFoodPlaces.length) {
        // 일반 장소 소진 시 식당도 사용
        selectedPlace = orderedFoodPlaces[foodIndex];
        foodIndex++;
      } else {
        // 모든 장소 소진
        break;
      }
      
      schedule.push({
        day,
        slot: slotType,
        place: selectedPlace,
        startTime: slotStart,
        endTime: slotEnd,
        isMealSlot,
        mealType,
      });
    }
  }
  
  // 식사 슬롯 통계
  const mealSlots = schedule.filter(s => s.isMealSlot);
  console.log(`[Itinerary] 🍽️ 총 식사 슬롯: ${mealSlots.length}개 (점심: ${mealSlots.filter(s => s.mealType === 'lunch').length}, 저녁: ${mealSlots.filter(s => s.mealType === 'dinner').length})`);
  
  return schedule;
}

export const itineraryGenerator = {
  generate: generateItinerary,
};
