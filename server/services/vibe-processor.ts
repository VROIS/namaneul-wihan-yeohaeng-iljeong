import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";
import type { VibeAnalysis, Place } from "@shared/schema";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

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
      const response = await ai.models.generateContent({
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

    const reviewVolumeScore = Math.min(10, Math.log10(totalReviews + 1) * 2.5);
    const ratingScore = avgRating * 2;
    const sourceScore = Math.min(10, sourceCount * 2.5);

    const popularityScore = (reviewVolumeScore * 0.4 + ratingScore * 0.4 + sourceScore * 0.2);
    const trendingScore = 5;
    const localBuzzScore = 5;

    const overallBuzzScore = (popularityScore * 0.5 + trendingScore * 0.25 + localBuzzScore * 0.25);

    return {
      popularityScore,
      trendingScore,
      localBuzzScore,
      overallBuzzScore,
    };
  }

  async processPlaceVibe(placeId: number): Promise<{ vibeScore: number; buzzScore: number }> {
    const place = await storage.getPlace(placeId);
    if (!place) {
      throw new Error(`Place ${placeId} not found`);
    }

    let vibeScore = 5;
    const photoUrls = place.photoUrls as string[] || [];

    if (photoUrls.length > 0) {
      const vibeResults: VibeScoreResult[] = [];
      
      for (const photoUrl of photoUrls.slice(0, 3)) {
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
