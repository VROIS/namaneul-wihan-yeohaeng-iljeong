/**
 * 포토스팟 점수 서비스 (Phase 1-3)
 * 
 * 3가지 데이터 결합으로 "사진이 잘 나오는 곳" 점수 계산:
 * 1. Instagram 게시물수+좋아요 (기존 수집 데이터, 40%)
 * 2. Google Places 사진 수 (기존 수집 데이터, 30%)
 * 3. Gemini "한국인 인생샷 명소" 검색 (신규, 30%)
 * 
 * 저장: geminiWebSearchCache (searchType: "photospot")
 * 스케줄: 하루 1회
 */

import { db } from "../db";
import { geminiWebSearchCache, places, cities, instagramHashtags } from "../../shared/schema";
import { eq, and, gte, desc, ilike } from "drizzle-orm";

const GEMINI_MODEL = "gemini-3-flash-preview";
const CACHE_DURATION_HOURS = 48;

// ===== 포토스팟 결과 인터페이스 =====
interface PhotospotGeminiResult {
  score: number;           // 0-10
  isPhotoSpot: boolean;
  photoTip: string | null; // "2층 전망대에서 센강 방향 촬영 추천"
  bestTime: string | null; // "일몰 시간대"
  confidence: number;
}

interface PhotospotScore {
  instaPart: number;       // 0-10
  googlePart: number;      // 0-10
  geminiPart: number;      // 0-10
  totalScore: number;      // 가중 합산
  photoTip: string | null;
  bestTime: string | null;
  isPhotoSpot: boolean;
}

// ===== 1. Instagram 데이터에서 포토스팟 점수 =====
async function calculateInstaScore(placeName: string, cityName: string): Promise<number> {
  try {
    // 장소명으로 해시태그 검색
    const hashtags = await db.select()
      .from(instagramHashtags)
      .where(ilike(instagramHashtags.hashtag, `%${placeName.replace(/\s+/g, '')}%`));

    if (hashtags.length === 0) {
      // 도시+장소명 조합으로 재시도
      const cityHashtags = await db.select()
        .from(instagramHashtags)
        .where(ilike(instagramHashtags.hashtag, `%${cityName}%`));

      if (cityHashtags.length === 0) return 0;

      // 도시 해시태그의 평균 게시물 수 기반 (약한 시그널)
      const totalPosts = cityHashtags.reduce((sum, h) => sum + (h.postCount || 0), 0);
      return Math.min(5, Math.log10(totalPosts + 1) * 1.5);
    }

    // 장소 해시태그의 게시물 수 + 좋아요 합산
    const totalPosts = hashtags.reduce((sum, h) => sum + (h.postCount || 0), 0);
    const totalLikes = hashtags.reduce((sum, h) => sum + (h.avgLikes || 0), 0);

    // 게시물 수와 좋아요를 합산한 점수
    const postScore = Math.min(10, Math.log10(totalPosts + 1) * 3.3);
    const likeBonus = Math.min(2, Math.log10(totalLikes + 1) * 0.5);

    return Math.min(10, postScore + likeBonus);
  } catch (error) {
    console.warn(`[PhotoSpot] Instagram 점수 계산 실패 (${placeName}):`, error);
    return 0;
  }
}

// ===== 2. Google Places 사진 수에서 점수 =====
async function calculateGooglePhotoScore(placeId: number | null, placeName: string): Promise<number> {
  if (!placeId) return 0;

  try {
    // places 테이블에서 photoUrls 조회
    const [place] = await db.select({
      photoUrls: places.photoUrls,
      userRatingCount: places.userRatingCount,
    })
      .from(places)
      .where(eq(places.id, placeId))
      .limit(1);

    if (!place) return 0;

    const photoCount = Array.isArray(place.photoUrls) ? place.photoUrls.length : 0;
    const ratingCount = place.userRatingCount || 0;

    // 사진 수 기반 점수 (최대 10)
    const photoScore = Math.min(10, photoCount * 0.5);
    // 리뷰 수가 많으면 사진도 많을 가능성 (보너스)
    const ratingBonus = Math.min(2, Math.log10(ratingCount + 1) * 0.3);

    return Math.min(10, photoScore + ratingBonus);
  } catch (error) {
    console.warn(`[PhotoSpot] Google 사진 점수 계산 실패 (${placeName}):`, error);
    return 0;
  }
}

// ===== 3. Gemini "한국인 인생샷 명소" 검색 =====
async function evaluatePhotospotWithGemini(
  placeName: string,
  cityName: string
): Promise<PhotospotGeminiResult | null> {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      console.error("[PhotoSpot] Gemini API 키 없음");
      return null;
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `"${placeName}" (${cityName})이 한국인 여행자에게 포토스팟/인생샷 명소인지 평가해주세요.

한국인 인스타그램, 블로그, 유튜브에서 이 장소의 사진 촬영 인기도를 검색하고 평가해주세요.

다음 JSON으로 응답:
{
  "score": 0~10 (한국인 포토스팟 점수, 10이 최고),
  "isPhotoSpot": true 또는 false,
  "photoTip": "인생샷 촬영 팁 (한국어, 1문장)",
  "bestTime": "추천 촬영 시간대 (예: 일몰, 오전, 야경)",
  "reasons": "왜 포토스팟인지 간단 설명",
  "confidence": 0.0~1.0
}

평가 기준:
- 한국인이 인스타/블로그에 사진을 많이 올리는 곳인가
- 한국인 사이에서 "인생샷 명소"로 알려진 곳인가
- 배경이 예쁘고 사진이 잘 나오는 곳인가
- 정보 없으면 score: 3, isPhotoSpot: false 로 반환
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
        return {
          score: Math.min(10, Math.max(0, parsed.score || 3)),
          isPhotoSpot: parsed.isPhotoSpot || false,
          photoTip: parsed.photoTip || null,
          bestTime: parsed.bestTime || null,
          confidence: parsed.confidence || 0.5,
        };
      } catch (parseErr) {
        console.warn(`[PhotoSpot] JSON 파싱 실패 (${placeName}):`, parseErr);
      }
    }

    return null;
  } catch (error) {
    console.error(`[PhotoSpot] Gemini 검색 실패 (${placeName}):`, error);
    return null;
  }
}

// ===== 통합 포토스팟 점수 계산 =====
async function calculatePhotoSpotScore(
  placeId: number | null,
  cityId: number,
  placeName: string,
  cityName: string
): Promise<PhotospotScore | null> {
  // 캐시 확인 (placeId가 있는 경우만)
  if (placeId) {
    const existing = await db.select()
      .from(geminiWebSearchCache)
      .where(and(
        eq(geminiWebSearchCache.placeId, placeId),
        eq(geminiWebSearchCache.searchType, "photospot"),
        gte(geminiWebSearchCache.fetchedAt, new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000))
      ))
      .limit(1);

    if (existing.length > 0 && existing[0].extractedData) {
      const data = existing[0].extractedData as any;
      console.log(`[PhotoSpot] 캐시 히트: ${placeName} (점수: ${data.totalScore})`);
      return {
        instaPart: data.instaPart || 0,
        googlePart: data.googlePart || 0,
        geminiPart: data.geminiPart || 0,
        totalScore: data.totalScore || 0,
        photoTip: data.photoTip || null,
        bestTime: data.bestTime || null,
        isPhotoSpot: data.isPhotoSpot || false,
      };
    }
  }

  // 3가지 점수 계산
  const instaPart = await calculateInstaScore(placeName, cityName);
  const googlePart = await calculateGooglePhotoScore(placeId, placeName);
  const geminiResult = await evaluatePhotospotWithGemini(placeName, cityName);

  const geminiPart = geminiResult?.score || 3; // 기본 3점

  // 가중 합산: Instagram(40%) + Google(30%) + Gemini(30%)
  const totalScore = (instaPart * 0.4) + (googlePart * 0.3) + (geminiPart * 0.3);

  const result: PhotospotScore = {
    instaPart: Math.round(instaPart * 100) / 100,
    googlePart: Math.round(googlePart * 100) / 100,
    geminiPart: Math.round(geminiPart * 100) / 100,
    totalScore: Math.round(totalScore * 100) / 100,
    photoTip: geminiResult?.photoTip || null,
    bestTime: geminiResult?.bestTime || null,
    isPhotoSpot: geminiResult?.isPhotoSpot || totalScore >= 6,
  };

  // DB 저장
  if (placeId) {
    await db.insert(geminiWebSearchCache).values({
      placeId,
      cityId,
      searchQuery: `한국인 포토스팟 인생샷 ${placeName} ${cityName}`,
      searchType: "photospot",
      rawResult: { geminiResponse: geminiResult },
      extractedData: result as any,
      confidenceScore: geminiResult?.confidence || 0.5,
      isVerified: result.isPhotoSpot,
      expiresAt: new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000),
    });
  }

  console.log(
    `[PhotoSpot] ${placeName}: 총점 ${result.totalScore}/10 ` +
    `(인스타:${result.instaPart} 구글:${result.googlePart} AI:${result.geminiPart}) ` +
    `${result.isPhotoSpot ? '📸 포토스팟!' : ''}`
  );

  return result;
}

// ===== 도시별 포토스팟 점수 계산 =====
export async function scorePhotospotsForCity(
  cityId: number
): Promise<{ success: boolean; scored: number; photoSpots: number; placesProcessed: number }> {
  console.log(`[PhotoSpot] 도시 ID ${cityId} 포토스팟 점수 계산 시작`);

  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[PhotoSpot] 도시를 찾을 수 없음: ${cityId}`);
    return { success: false, scored: 0, photoSpots: 0, placesProcessed: 0 };
  }

  // 모든 장소 대상 (식당 포함 - 음식 사진도 포토스팟)
  const cityPlaces = await db.select()
    .from(places)
    .where(eq(places.cityId, cityId));

  console.log(`[PhotoSpot] ${city.name}: ${cityPlaces.length}곳 대상`);

  let scored = 0;
  let photoSpots = 0;

  for (const place of cityPlaces) {
    try {
      const result = await calculatePhotoSpotScore(
        place.id,
        cityId,
        place.name,
        city.name
      );

      if (result) {
        scored++;
        if (result.isPhotoSpot) photoSpots++;
      }

      // API 레이트 리밋 방지 (1초)
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`[PhotoSpot] ${place.name} 점수 계산 실패:`, error);
    }
  }

  console.log(`[PhotoSpot] ${city.name} 완료: ${scored}곳 점수, ${photoSpots}곳 포토스팟`);
  return { success: true, scored, photoSpots, placesProcessed: cityPlaces.length };
}

// ===== 전체 도시 포토스팟 점수 =====
export async function scoreAllPhotospots(): Promise<{
  success: boolean;
  totalScored: number;
  totalPhotoSpots: number;
  citiesProcessed: number;
}> {
  console.log("[PhotoSpot] 전체 포토스팟 점수 계산 시작...");

  const allCities = await db.select().from(cities);
  let totalScored = 0;
  let totalPhotoSpots = 0;

  for (const city of allCities) {
    const result = await scorePhotospotsForCity(city.id);
    totalScored += result.scored;
    totalPhotoSpots += result.photoSpots;

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[PhotoSpot] 전체 완료: ${totalScored}곳 점수, ${totalPhotoSpots}곳 포토스팟 (${allCities.length}개 도시)`);
  return { success: true, totalScored, totalPhotoSpots, citiesProcessed: allCities.length };
}

// ===== 특정 장소의 포토스팟 점수 조회 =====
export async function getPlacePhotospotScore(placeId: number): Promise<PhotospotScore | null> {
  const [cached] = await db.select()
    .from(geminiWebSearchCache)
    .where(and(
      eq(geminiWebSearchCache.placeId, placeId),
      eq(geminiWebSearchCache.searchType, "photospot")
    ))
    .orderBy(desc(geminiWebSearchCache.fetchedAt))
    .limit(1);

  if (!cached?.extractedData) return null;

  const data = cached.extractedData as any;
  return {
    instaPart: data.instaPart || 0,
    googlePart: data.googlePart || 0,
    geminiPart: data.geminiPart || 0,
    totalScore: data.totalScore || 0,
    photoTip: data.photoTip || null,
    bestTime: data.bestTime || null,
    isPhotoSpot: data.isPhotoSpot || false,
  };
}

// ===== 일정 생성용: 장소 이름으로 포토스팟 점수 빠르게 조회 =====
export async function getPhotospotScoreForPlace(
  placeName: string,
  cityName: string,
  placeId?: number | null
): Promise<number> {
  // DB에 캐시 있으면 바로 반환
  if (placeId) {
    const cached = await getPlacePhotospotScore(placeId);
    if (cached) return cached.totalScore;
  }

  // 캐시 없으면 0 반환 (일정 생성 시 실시간 계산 안 함 - 미리 수집된 데이터만)
  return 0;
}

// ===== 통계 조회 =====
export async function getPhotospotStats(): Promise<{
  totalScored: number;
  totalPhotoSpots: number;
  avgScore: number;
  topPhotoSpots: Array<{
    placeName: string;
    totalScore: number;
    photoTip: string | null;
    isPhotoSpot: boolean;
  }>;
}> {
  const allData = await db.select()
    .from(geminiWebSearchCache)
    .where(eq(geminiWebSearchCache.searchType, "photospot"));

  const photoSpots = allData.filter(d =>
    d.extractedData && (d.extractedData as any).isPhotoSpot
  );

  // 장소 이름
  const placeIds = [...new Set(allData.map(d => d.placeId).filter(Boolean))] as number[];
  const placesData = placeIds.length > 0
    ? await db.select({ id: places.id, name: places.name }).from(places)
    : [];
  const placeNameMap = new Map(placesData.map(p => [p.id, p.name]));

  const scores = allData
    .filter(d => d.extractedData && (d.extractedData as any).totalScore)
    .map(d => (d.extractedData as any).totalScore as number);

  const avgScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  const topPhotoSpots = allData
    .filter(d => d.extractedData)
    .sort((a, b) =>
      ((b.extractedData as any).totalScore || 0) -
      ((a.extractedData as any).totalScore || 0)
    )
    .slice(0, 10)
    .map(d => ({
      placeName: placeNameMap.get(d.placeId!) || "Unknown",
      totalScore: (d.extractedData as any).totalScore || 0,
      photoTip: (d.extractedData as any).photoTip || null,
      isPhotoSpot: (d.extractedData as any).isPhotoSpot || false,
    }));

  return {
    totalScored: allData.length,
    totalPhotoSpots: photoSpots.length,
    avgScore: Math.round(avgScore * 100) / 100,
    topPhotoSpots,
  };
}
