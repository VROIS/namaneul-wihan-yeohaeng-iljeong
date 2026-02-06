import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";
import { db } from "../db";
import { instagramHashtags, instagramLocations, instagramPhotos } from "@shared/schema";
import { eq, like, ilike, or, sql } from "drizzle-orm";
import type { VibeAnalysis, Place } from "@shared/schema";

// Gemini AI를 동적으로 초기화 (DB에서 키 로드 후 사용 가능하도록)
function getAI(): GoogleGenAI {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('[VibeProcessor] Gemini API 키가 없습니다.');
  return new GoogleGenAI({ apiKey });
}

interface VibeScoreResult {
  visualScore: number;
  compositionScore: number;
  lightingScore: number;
  colorScore: number;
  vibeCategories: string[];
  overallVibeScore: number;
}

interface BuzzScoreResult {
  popularityScore: number;
  trendingScore: number;
  localBuzzScore: number;
  overallBuzzScore: number;
}

export class VibeProcessor {
  async analyzeImageVibe(photoUrl: string): Promise<VibeScoreResult> {
    const prompt = `당신은 여행 장소 사진을 분석하는 전문가입니다. 이 사진을 분석하여 다음 점수를 1-10 스케일로 매겨주세요:

1. visualScore: 전체적인 시각적 매력도
2. compositionScore: 구도와 프레이밍
3. lightingScore: 조명과 분위기
4. colorScore: 색감과 조화

또한 이 장소에 어울리는 Vibe 카테고리를 선택해주세요 (해당하는 것 모두):
- 몽환적인 (dreamy)
- 힙한 (hip/trendy)
- 클래식한 (classic)
- 로맨틱한 (romantic)
- 모험적인 (adventurous)
- 평화로운 (peaceful)
- 럭셔리한 (luxurious)
- 인스타그래머블 (instagrammable)

JSON 형식으로만 응답해주세요:
{
  "visualScore": number,
  "compositionScore": number,
  "lightingScore": number,
  "colorScore": number,
  "vibeCategories": ["category1", "category2"],
  "reasoning": "brief explanation"
}`;

    try {
      const response = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: await this.fetchImageAsBase64(photoUrl) } }
            ]
          }
        ],
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse Gemini response as JSON");
      }

      const result = JSON.parse(jsonMatch[0]);
      const overallVibeScore = (result.visualScore + result.compositionScore + result.lightingScore + result.colorScore) / 4;

      return {
        visualScore: result.visualScore,
        compositionScore: result.compositionScore,
        lightingScore: result.lightingScore,
        colorScore: result.colorScore,
        vibeCategories: result.vibeCategories || [],
        overallVibeScore,
      };
    } catch (error) {
      console.error("Failed to analyze image vibe:", error);
      return {
        visualScore: 5,
        compositionScore: 5,
        lightingScore: 5,
        colorScore: 5,
        vibeCategories: [],
        overallVibeScore: 5,
      };
    }
  }

  private async fetchImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  async calculateBuzzScore(place: Place): Promise<BuzzScoreResult> {
    const dataSources = await storage.getPlaceDataSources(place.id);
    
    let totalReviews = 0;
    let avgRating = 0;
    let sourceCount = 0;

    for (const source of dataSources) {
      if (source.reviewCount) {
        totalReviews += source.reviewCount;
      }
      if (source.rating) {
        avgRating += source.rating;
        sourceCount++;
      }
    }

    avgRating = sourceCount > 0 ? avgRating / sourceCount : 0;

    // Instagram 해시태그 인기도 가져오기
    const instagramBuzz = await this.getInstagramBuzzForPlace(place);
    
    const reviewVolumeScore = Math.min(10, Math.log10(totalReviews + 1) * 2.5);
    const ratingScore = avgRating * 2;
    const sourceScore = Math.min(10, sourceCount * 2.5);

    // Instagram 인기도 점수 (해시태그 게시물 수 기반)
    const instagramScore = instagramBuzz.score;

    // 기존: popularityScore = reviewVolume(40%) + rating(40%) + sourceCount(20%)
    // 변경: popularityScore = reviewVolume(30%) + rating(30%) + sourceCount(15%) + instagram(25%)
    const popularityScore = (
      reviewVolumeScore * 0.3 + 
      ratingScore * 0.3 + 
      sourceScore * 0.15 +
      instagramScore * 0.25
    );
    
    // trendingScore: Instagram 최근 게시물 트렌드 반영
    const trendingScore = instagramBuzz.hasTrending ? 7 : 5;
    
    // localBuzzScore: 한국어 해시태그 존재 여부로 한국인 인기 측정
    const localBuzzScore = instagramBuzz.hasKoreanHashtag ? 7 : 5;

    const overallBuzzScore = (popularityScore * 0.5 + trendingScore * 0.25 + localBuzzScore * 0.25);

    return {
      popularityScore,
      trendingScore,
      localBuzzScore,
      overallBuzzScore,
    };
  }

  private async getInstagramBuzzForPlace(place: Place): Promise<{
    score: number;
    hasTrending: boolean;
    hasKoreanHashtag: boolean;
    totalPosts: number;
  }> {
    try {
      // 장소명으로 관련 해시태그 검색
      const placeName = place.name.toLowerCase();
      const placeNameKo = ((place as any).nameKorean?.toLowerCase() || '') as string;
      
      // 해시태그에서 장소명이 포함된 것들 찾기
      const relatedHashtags = await db.select()
        .from(instagramHashtags)
        .where(
          or(
            ilike(instagramHashtags.hashtag, `%${placeName}%`),
            placeNameKo ? ilike(instagramHashtags.hashtag, `%${placeNameKo}%`) : sql`false`
          )
        );

      if (relatedHashtags.length === 0) {
        return { score: 5, hasTrending: false, hasKoreanHashtag: false, totalPosts: 0 };
      }

      // 총 게시물 수 합산
      let totalPosts = 0;
      let hasKoreanHashtag = false;
      let hasTrending = false;

      for (const tag of relatedHashtags) {
        totalPosts += tag.postCount || 0;
        
        // 한국어 해시태그 체크 (한글 포함 여부)
        if (/[가-힣]/.test(tag.hashtag)) {
          hasKoreanHashtag = true;
        }
        
        // 트렌딩: 최근 7일 내 동기화된 해시태그 중 게시물 10만 이상
        if (tag.lastSyncAt) {
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          if (new Date(tag.lastSyncAt) > weekAgo && (tag.postCount || 0) > 100000) {
            hasTrending = true;
          }
        }
      }

      // 게시물 수 → 점수 변환 (로그 스케일)
      // 1,000 게시물 → 3점, 10,000 → 5점, 100,000 → 7점, 1,000,000 → 9점
      let score = 5;
      if (totalPosts > 0) {
        score = Math.min(10, Math.max(1, Math.log10(totalPosts) * 2));
      }

      return { score, hasTrending, hasKoreanHashtag, totalPosts };
    } catch (error) {
      console.error('Failed to get Instagram buzz:', error);
      return { score: 5, hasTrending: false, hasKoreanHashtag: false, totalPosts: 0 };
    }
  }

  async processPlaceVibe(placeId: number): Promise<{ vibeScore: number; buzzScore: number }> {
    const place = await storage.getPlace(placeId);
    if (!place) {
      throw new Error(`Place ${placeId} not found`);
    }

    let vibeScore = 5;
    const photoUrls = place.photoUrls as string[] || [];
    
    // Instagram 사진 가져오기
    const instagramPhotoUrls = await this.getInstagramPhotosForPlace(place);
    
    // Google Photos (최대 2장) + Instagram Photos (최대 1장) 조합
    const allPhotos = [
      ...photoUrls.slice(0, 2),
      ...instagramPhotoUrls.slice(0, 1)
    ];

    if (allPhotos.length > 0) {
      const vibeResults: VibeScoreResult[] = [];
      
      for (const photoUrl of allPhotos.slice(0, 3)) {
        try {
          const result = await this.analyzeImageVibe(photoUrl);
          vibeResults.push(result);
          
          await storage.createVibeAnalysis({
            placeId,
            photoUrl,
            visualScore: result.visualScore,
            compositionScore: result.compositionScore,
            lightingScore: result.lightingScore,
            colorScore: result.colorScore,
            vibeCategories: result.vibeCategories,
            geminiResponse: result as any,
          });
        } catch (error) {
          console.error(`Failed to analyze photo for place ${placeId}:`, error);
        }
      }

      if (vibeResults.length > 0) {
        vibeScore = vibeResults.reduce((sum, r) => sum + r.overallVibeScore, 0) / vibeResults.length;
      }
    }

    const buzzResult = await this.calculateBuzzScore(place);

    await storage.updatePlaceScores(placeId, {
      vibeScore,
      buzzScore: buzzResult.overallBuzzScore,
    });

    return { vibeScore, buzzScore: buzzResult.overallBuzzScore };
  }

  private async getInstagramPhotosForPlace(place: Place): Promise<string[]> {
    try {
      const placeName = place.name.toLowerCase();
      const placeNameKo = ((place as any).nameKorean?.toLowerCase() || '') as string;
      
      // 장소와 관련된 해시태그 찾기
      const relatedHashtags = await db.select()
        .from(instagramHashtags)
        .where(
          or(
            ilike(instagramHashtags.hashtag, `%${placeName}%`),
            placeNameKo ? ilike(instagramHashtags.hashtag, `%${placeNameKo}%`) : sql`false`
          )
        );

      if (relatedHashtags.length === 0) {
        return [];
      }

      // 관련 해시태그의 사진 가져오기
      const hashtagIds = relatedHashtags.map(h => h.id);
      
      const photos = await db.select()
        .from(instagramPhotos)
        .where(
          sql`${instagramPhotos.hashtagId} = ANY(${hashtagIds})`
        )
        .limit(3);

      return photos.map(p => p.imageUrl).filter((url): url is string => !!url);
    } catch (error) {
      console.error('Failed to get Instagram photos for place:', error);
      return [];
    }
  }

  async processCityPlaces(cityId: number): Promise<{ processed: number; failed: number }> {
    const places = await storage.getPlacesByCity(cityId);
    let processed = 0;
    let failed = 0;

    for (const place of places) {
      try {
        await this.processPlaceVibe(place.id);
        processed++;
      } catch (error) {
        console.error(`Failed to process vibe for place ${place.id}:`, error);
        failed++;
      }
    }

    return { processed, failed };
  }
}

export const vibeProcessor = new VibeProcessor();
