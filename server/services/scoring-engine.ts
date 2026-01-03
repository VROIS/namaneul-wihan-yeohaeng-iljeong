import { storage } from "../storage";
import { vibeProcessor } from "./vibe-processor";
import { tasteVerifier } from "./taste-verifier";
import { weatherFetcher } from "./weather";
import type { Place } from "@shared/schema";

interface FinalScoreComponents {
  vibeScore: number;
  buzzScore: number;
  tasteVerifyScore: number | null;
  realityPenalty: number;
  finalScore: number;
  tier: number;
}

export class ScoringEngine {
  async calculateFinalScore(placeId: number): Promise<FinalScoreComponents> {
    const place = await storage.getPlace(placeId);
    if (!place) {
      throw new Error(`Place ${placeId} not found`);
    }

    let vibeScore = place.vibeScore || 5;
    let buzzScore = place.buzzScore || 5;
    let tasteVerifyScore = place.tasteVerifyScore;

    if (!place.vibeScore || !place.buzzScore) {
      const vibeResult = await vibeProcessor.processPlaceVibe(placeId);
      vibeScore = vibeResult.vibeScore;
      buzzScore = vibeResult.buzzScore;
    }

    if (place.type === "restaurant" && !place.tasteVerifyScore) {
      try {
        const tasteResult = await tasteVerifier.verifyRestaurant(placeId);
        tasteVerifyScore = tasteResult.finalTasteScore;
      } catch (error) {
        console.error(`Failed to verify taste for place ${placeId}:`, error);
      }
    }

    const city = await storage.getCity(place.cityId);
    let realityPenalty = 0;

    if (city) {
      const realityChecks = await storage.getActiveRealityChecks(city.id);
      for (const check of realityChecks) {
        if (check.affectedPlaceIds?.includes(placeId) || !check.affectedPlaceIds) {
          realityPenalty += check.penaltyScore || 0;
        }
      }

      const weather = await weatherFetcher.getWeatherForCity(city.id);
      if (weather) {
        realityPenalty += weather.penalty || 0;
      }
    }

    realityPenalty = Math.min(realityPenalty, 5);

    let finalScore: number;
    if (place.type === "restaurant" && tasteVerifyScore !== null) {
      finalScore = (vibeScore + buzzScore + tasteVerifyScore) - realityPenalty;
    } else {
      finalScore = (vibeScore + buzzScore) - realityPenalty;
    }

    finalScore = Math.max(0, finalScore);

    let tier: number;
    if (finalScore >= 24) {
      tier = 1;
    } else if (finalScore >= 15) {
      tier = 2;
    } else {
      tier = 3;
    }

    await storage.updatePlaceScores(placeId, {
      vibeScore,
      buzzScore,
      tasteVerifyScore,
      realityPenalty,
      finalScore,
      tier,
    });

    return {
      vibeScore,
      buzzScore,
      tasteVerifyScore,
      realityPenalty,
      finalScore,
      tier,
    };
  }

  async processCity(cityId: number): Promise<{ processed: number; failed: number }> {
    const places = await storage.getPlacesByCity(cityId);
    let processed = 0;
    let failed = 0;

    for (const place of places) {
      try {
        await this.calculateFinalScore(place.id);
        processed++;
      } catch (error) {
        console.error(`Failed to calculate score for place ${place.id}:`, error);
        failed++;
      }
    }

    await storage.logDataSync({
      entityType: "city_scoring",
      entityId: cityId,
      source: "scoring_engine",
      status: failed === 0 ? "success" : "partial",
      itemsProcessed: processed,
      itemsFailed: failed,
      completedAt: new Date(),
      errorMessage: null,
    });

    return { processed, failed };
  }

  async getTopRecommendations(
    cityId: number,
    type: "restaurant" | "attraction" | "cafe" | "hotel",
    limit: number = 10,
    persona: "luxury" | "comfort" = "comfort"
  ): Promise<Place[]> {
    const places = await storage.getTopPlaces(cityId, type, limit * 2);

    const scoredPlaces = places.map(place => {
      let personaBonus = 0;
      const vibeKeywords = (place.vibeKeywords as string[]) || [];

      if (persona === "luxury") {
        if (vibeKeywords.includes("luxurious") || vibeKeywords.includes("럭셔리한")) {
          personaBonus += 1;
        }
        if (vibeKeywords.includes("instagrammable") || vibeKeywords.includes("인스타그래머블")) {
          personaBonus += 0.5;
        }
        if (place.priceLevel && place.priceLevel >= 3) {
          personaBonus += 0.5;
        }
      } else {
        if (vibeKeywords.includes("peaceful") || vibeKeywords.includes("평화로운")) {
          personaBonus += 1;
        }
        if (vibeKeywords.includes("classic") || vibeKeywords.includes("클래식한")) {
          personaBonus += 0.5;
        }
        if (place.isVerified) {
          personaBonus += 1;
        }
      }

      return {
        ...place,
        adjustedScore: (place.finalScore || 0) + personaBonus,
      };
    });

    scoredPlaces.sort((a, b) => (b.adjustedScore || 0) - (a.adjustedScore || 0));

    return scoredPlaces.slice(0, limit);
  }

  getTierLabel(tier: number): string {
    switch (tier) {
      case 1:
        return "최우선 추천";
      case 2:
        return "추천";
      case 3:
        return "일반";
      default:
        return "미분류";
    }
  }

  getTierColor(tier: number): string {
    switch (tier) {
      case 1:
        return "#8B5CF6";
      case 2:
        return "#F59E0B";
      case 3:
        return "#9CA3AF";
      default:
        return "#E5E7EB";
    }
  }
}

export const scoringEngine = new ScoringEngine();
