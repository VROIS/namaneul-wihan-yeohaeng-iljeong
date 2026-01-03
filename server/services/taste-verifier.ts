import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";
import type { Place, Review } from "@shared/schema";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

interface LanguageAnalysisResult {
  language: string;
  languageCode: string;
  isOriginatorLanguage: boolean;
  sentimentScore: number;
  authenticityKeywords: string[];
}

interface TasteVerifyResult {
  originatorScore: number;
  expertScore: number;
  globalScore: number;
  finalTasteScore: number;
  originatorReviewCount: number;
  totalReviewCount: number;
  authenticityBadge: boolean;
}

const CUISINE_LANGUAGE_MAP: Record<string, string[]> = {
  korean: ["ko", "korean"],
  japanese: ["ja", "japanese"],
  chinese: ["zh", "zh-CN", "zh-TW", "chinese"],
  french: ["fr", "french"],
  italian: ["it", "italian"],
  spanish: ["es", "spanish"],
  thai: ["th", "thai"],
  vietnamese: ["vi", "vietnamese"],
  indian: ["hi", "ta", "te", "mr", "hindi", "tamil", "telugu", "marathi"],
  mexican: ["es", "spanish"],
  greek: ["el", "greek"],
  turkish: ["tr", "turkish"],
  american: ["en", "english"],
  british: ["en", "english"],
};

export class OriginalTasteVerifier {
  async analyzeReviewLanguage(reviewText: string): Promise<LanguageAnalysisResult> {
    const prompt = `Analyze this restaurant review and provide:
1. The language it's written in (language name and ISO code)
2. Sentiment score from 1-10 (1=very negative, 10=very positive)
3. Extract keywords related to authenticity/taste quality (e.g., "authentic", "original taste", "homemade", "traditional")

Review: "${reviewText}"

Respond in JSON format only:
{
  "language": "language name",
  "languageCode": "ISO code like ko, en, fr, ja",
  "sentimentScore": number,
  "authenticityKeywords": ["keyword1", "keyword2"]
}`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse Gemini response");
      }

      const result = JSON.parse(jsonMatch[0]);
      return {
        language: result.language,
        languageCode: result.languageCode,
        isOriginatorLanguage: false,
        sentimentScore: result.sentimentScore,
        authenticityKeywords: result.authenticityKeywords || [],
      };
    } catch (error) {
      console.error("Failed to analyze review language:", error);
      return {
        language: "unknown",
        languageCode: "unknown",
        isOriginatorLanguage: false,
        sentimentScore: 5,
        authenticityKeywords: [],
      };
    }
  }

  isOriginatorLanguage(languageCode: string, cuisineType: string | null): boolean {
    if (!cuisineType) return false;
    
    const cuisineKey = cuisineType.toLowerCase().replace(/\s+/g, "");
    const validLanguages = CUISINE_LANGUAGE_MAP[cuisineKey] || [];
    
    return validLanguages.some(lang => 
      languageCode.toLowerCase().startsWith(lang) || 
      lang.toLowerCase().startsWith(languageCode.toLowerCase())
    );
  }

  async processPlaceReviews(placeId: number): Promise<void> {
    const place = await storage.getPlace(placeId);
    if (!place) return;

    const reviews = await storage.getReviewsByPlace(placeId);
    
    for (const review of reviews) {
      if (!review.text || review.language) continue;

      try {
        const analysis = await this.analyzeReviewLanguage(review.text);
        const isOriginator = this.isOriginatorLanguage(analysis.languageCode, place.cuisineType);
        
        await storage.createReview({
          ...review,
          language: analysis.languageCode,
          isOriginatorLanguage: isOriginator,
          sentimentScore: analysis.sentimentScore,
          authenticityKeywords: analysis.authenticityKeywords,
        });
      } catch (error) {
        console.error(`Failed to analyze review ${review.id}:`, error);
      }
    }
  }

  async calculateTasteVerifyScore(placeId: number): Promise<TasteVerifyResult> {
    const place = await storage.getPlace(placeId);
    if (!place) {
      throw new Error(`Place ${placeId} not found`);
    }

    const reviews = await storage.getReviewsByPlace(placeId);
    const dataSources = await storage.getPlaceDataSources(placeId);

    const originatorReviews = reviews.filter(r => r.isOriginatorLanguage);
    const nonOriginatorReviews = reviews.filter(r => !r.isOriginatorLanguage);

    let originatorAvgRating = 0;
    let nonOriginatorAvgRating = 0;

    if (originatorReviews.length > 0) {
      originatorAvgRating = originatorReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / originatorReviews.length;
    }

    if (nonOriginatorReviews.length > 0) {
      nonOriginatorAvgRating = nonOriginatorReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / nonOriginatorReviews.length;
    }

    const originatorScore = originatorReviews.length >= 5 
      ? originatorAvgRating * 2 
      : (originatorAvgRating * 2) * 0.5;

    let expertScore = 0;
    for (const source of dataSources) {
      if (source.source === "michelin" && source.isMichelinStar) {
        expertScore = 10;
        break;
      }
      if (source.source === "michelin" && source.michelinType === "bib_gourmand") {
        expertScore = Math.max(expertScore, 8);
      }
      if (source.source === "tripadvisor" && source.rankingInCategory && source.rankingInCategory <= 10) {
        expertScore = Math.max(expertScore, 7);
      }
    }

    let globalAvgRating = 0;
    let globalSourceCount = 0;
    for (const source of dataSources) {
      if (source.rating) {
        globalAvgRating += source.rating;
        globalSourceCount++;
      }
    }
    globalAvgRating = globalSourceCount > 0 ? globalAvgRating / globalSourceCount : 0;
    const globalScore = globalAvgRating * 2;

    const W1 = 0.5;
    const W2 = 0.3;
    const W3 = 0.2;

    const finalTasteScore = (W1 * originatorScore) + (W2 * expertScore) + (W3 * globalScore);
    
    const authenticityBadge = 
      originatorReviews.length >= 10 && 
      originatorAvgRating >= 4.0 && 
      (expertScore >= 7 || globalAvgRating >= 4.2);

    return {
      originatorScore,
      expertScore,
      globalScore,
      finalTasteScore,
      originatorReviewCount: originatorReviews.length,
      totalReviewCount: reviews.length,
      authenticityBadge,
    };
  }

  async verifyRestaurant(placeId: number): Promise<TasteVerifyResult> {
    await this.processPlaceReviews(placeId);
    const result = await this.calculateTasteVerifyScore(placeId);
    
    await storage.updatePlaceScores(placeId, {
      tasteVerifyScore: result.finalTasteScore,
      isVerified: result.authenticityBadge,
    });

    return result;
  }

  async verifyCityRestaurants(cityId: number): Promise<{ verified: number; failed: number }> {
    const places = await storage.getPlacesByCity(cityId, "restaurant");
    let verified = 0;
    let failed = 0;

    for (const place of places) {
      try {
        await this.verifyRestaurant(place.id);
        verified++;
      } catch (error) {
        console.error(`Failed to verify restaurant ${place.id}:`, error);
        failed++;
      }
    }

    return { verified, failed };
  }
}

export const tasteVerifier = new OriginalTasteVerifier();
