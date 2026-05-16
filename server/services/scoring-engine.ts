import { storage } from "../storage";
import { vibeProcessor } from "./vibe-processor";
import { tasteVerifier } from "./taste-verifier";
import { weatherFetcher } from "./weather";
import { getActiveCrisisAlerts } from "./crisis-crawler";
import type { Place } from "@shared/schema";

interface FinalScoreComponents {
  vibeScore: number;
  buzzScore: number;
  tasteVerifyScore: number | null;
  realityPenalty: number;
  finalScore: number;
  tier: number;
}

type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';
type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';
type CompanionType = 'Single' | 'Couple' | 'Family' | 'Group';
type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';

interface UserPreferences {
  vibes: Vibe[];
  travelStyle: TravelStyle;
  companionType: CompanionType;
  companionCount: number;
  curationFocus: CurationFocus;
}

interface PersonalizedScoreResult {
  baseScore: number;
  curationFocusMatch: number;
  vibeMatch: number;
  styleBonus: number;
  realityPenalty: number;
  personalizedScore: number;
  breakdown: {
    step: string;
    value: number | string;
    description: string;
  }[];
}

const CURATION_FOCUS_CRITERIA: Record<CurationFocus, {
  positive: string[];
  negative: string[];
  placeAttributes: string[];
  description: string;
}> = {
  Kids: {
    positive: ['아이', 'kids', 'children', 'family', '가족', '놀이', 'play', '체험', 'interactive', '교육', 'educational'],
    negative: ['바', 'bar', '술', 'alcohol', 'wine', '나이트', 'night', 'club', '위험', 'dangerous', '성인', 'adult'],
    placeAttributes: ['goodForChildren'],
    description: '아이 친화적 (안전, 재미, 체험)',
  },
  Parents: {
    positive: ['편안', 'comfortable', '접근성', 'accessible', '휴식', 'rest', '좌석', 'seating', '넓은', 'spacious', '조용', 'quiet', '화장실', 'restroom'],
    negative: ['계단', 'stairs', '도보', 'walking', '줄서기', 'queue', '대기', 'wait', '혼잡', 'crowded', '좁은', 'narrow'],
    placeAttributes: ['wheelchairAccessible', 'restroom'],
    description: '부모님 친화적 (접근성, 편안함)',
  },
  Everyone: {
    positive: ['가족', 'family', '모두', 'everyone', '다양', 'variety', '넓은', 'spacious'],
    negative: [],
    placeAttributes: ['goodForGroups'],
    description: '모든 연령대 적합',
  },
  Self: {
    positive: ['혼자', 'solo', '1인', 'single', '자유', 'free', '개인', 'personal'],
    negative: [],
    placeAttributes: [],
    description: '나 혼자 여행',
  },
};

const VIBE_BASE_WEIGHTS: Record<Vibe, number> = {
  Healing: 35,
  Foodie: 25,
  Hotspot: 15,
  Adventure: 10,
  Culture: 10,
  Romantic: 5,
};

const VIBE_KEYWORD_MAP: Record<Vibe, string[]> = {
  Healing: ['힐링', '평화로운', 'peaceful', 'relaxing', 'healing', '조용한', 'quiet', '자연', 'nature'],
  Foodie: ['맛집', '미식', 'foodie', 'gourmet', 'restaurant', '음식', 'food', '현지음식', 'local food'],
  Hotspot: ['핫스팟', 'hotspot', 'trending', '인스타', 'instagram', '인기', 'popular', 'hot'],
  Adventure: ['모험', 'adventure', '액티비티', 'activity', '스릴', 'thrill', '익스트림', 'extreme'],
  Culture: ['문화', 'culture', '예술', 'art', '역사', 'history', '박물관', 'museum', '갤러리', 'gallery'],
  Romantic: ['로맨틱', 'romantic', '야경', 'night view', '분위기', 'atmosphere', '데이트', 'date'],
};

const COMPANION_KEYWORDS: Record<CompanionType, string[]> = {
  Single: ['혼밥', 'solo', '1인석', 'bar', '바', '카페', 'cafe'],
  Couple: ['로맨틱', 'romantic', '야경', 'night view', '분위기', 'atmosphere', '데이트', 'date'],
  Family: ['가족', 'family', '아이', 'kids', 'children', '넓은', 'spacious', 'goodForChildren'],
  Group: ['단체', 'group', '예약', 'reservation', '프라이빗', 'private', '파티', 'party'],
};

const STYLE_PRICE_LEVEL: Record<TravelStyle, number> = {
  Luxury: 4,
  Premium: 3,
  Reasonable: 2,
  Economic: 1,
};

export class ScoringEngine {
  
  /**
   * 사용자 취향 기반 개인화 점수 계산
   * 새 공식: Final = Base × CurationFocusMatch × VibeMatch + StyleBonus - RealityPenalty
   * CurationFocus(누구를 위한)가 1순위, Vibe(무엇을)가 2순위
   */
  calculatePersonalizedScore(
    place: Place,
    userPreferences: UserPreferences,
    realityPenalty: number = 0
  ): PersonalizedScoreResult {
    const breakdown: PersonalizedScoreResult['breakdown'] = [];
    
    // 1. Base Score 계산 (0~10점)
    const vibeScore = place.vibeScore || 5;
    const buzzScore = place.buzzScore || 5;
    const tasteScore = place.tasteVerifyScore || 5;
    const baseScore = Number(((vibeScore + buzzScore + tasteScore) / 3).toFixed(2));
    
    breakdown.push({
      step: '기본 점수',
      value: baseScore,
      description: `(Vibe ${vibeScore} + Buzz ${buzzScore} + Taste ${tasteScore}) / 3`,
    });
    
    // 2. Curation Focus Match 계산 (0.3~1.5 배수) - 1순위!
    const curationFocus = userPreferences.curationFocus || 'Everyone';
    const curationFocusMatch = this.calculateCurationFocusMatch(place, curationFocus);
    const focusLabel = CURATION_FOCUS_CRITERIA[curationFocus]?.description || curationFocus;
    breakdown.push({
      step: '🥇 누구를 위한',
      value: `×${curationFocusMatch.toFixed(2)}`,
      description: focusLabel,
    });
    
    // 3. Vibe Match 계산 (0.5~1.5 배수) - 2순위
    const vibeMatch = this.calculateVibeMatch(place, userPreferences.vibes);
    breakdown.push({
      step: '🥈 Vibe 매칭',
      value: `×${vibeMatch.toFixed(2)}`,
      description: userPreferences.vibes.join(', ') + ' 선호',
    });
    
    // 4. Style Bonus 계산 (0~1점)
    const styleBonus = this.calculateStyleBonus(place, userPreferences.travelStyle);
    breakdown.push({
      step: '스타일 보너스',
      value: `+${styleBonus.toFixed(1)}`,
      description: `${userPreferences.travelStyle} 스타일`,
    });
    
    // 5. Reality Penalty 적용 (0~5점 차감)
    breakdown.push({
      step: '현실 패널티',
      value: `-${realityPenalty.toFixed(1)}`,
      description: '날씨/혼잡도/운영상태',
    });
    
    // 최종 점수 계산: Base × CurationFocus × Vibe + Style - Penalty
    let personalizedScore = (baseScore * curationFocusMatch * vibeMatch) + styleBonus - realityPenalty;
    personalizedScore = Math.min(10, Math.max(0, Number(personalizedScore.toFixed(2))));
    
    breakdown.push({
      step: '최종 점수',
      value: personalizedScore,
      description: `${baseScore} × ${curationFocusMatch.toFixed(2)} × ${vibeMatch.toFixed(2)} + ${styleBonus.toFixed(1)} - ${realityPenalty.toFixed(1)}`,
    });
    
    return {
      baseScore,
      curationFocusMatch,
      vibeMatch,
      styleBonus,
      realityPenalty,
      personalizedScore,
      breakdown,
    };
  }
  
  /**
   * Curation Focus Match 계산: "누구를 위한" 장소 적합성
   * 부정적 키워드 매칭 시 강력한 패널티 (0.3)
   * 긍정적 키워드 매칭 시 보너스 (최대 1.5)
   * 반환값: 0.3 ~ 1.5 (배수)
   */
  private calculateCurationFocusMatch(place: Place, focus: CurationFocus): number {
    if (focus === 'Self' || focus === 'Everyone') return 1.0;
    
    const criteria = CURATION_FOCUS_CRITERIA[focus];
    const placeKeywords = (place.vibeKeywords as string[]) || [];
    const placeData = place as any;
    
    // 부정적 키워드 체크 - 하나라도 매칭되면 강력 패널티
    for (const keyword of placeKeywords) {
      const hasNegative = criteria.negative.some(neg => 
        keyword.toLowerCase().includes(neg.toLowerCase())
      );
      if (hasNegative) {
        return 0.3; // 강력 패널티: 70% 감점
      }
    }
    
    // 장소 속성 체크 (goodForChildren, wheelchairAccessible 등)
    let attributeBonus = 0;
    for (const attr of criteria.placeAttributes) {
      if (placeData[attr] === true) {
        attributeBonus += 0.2;
      }
    }
    
    // 긍정적 키워드 매칭
    let positiveMatches = 0;
    for (const keyword of placeKeywords) {
      const hasPositive = criteria.positive.some(pos => 
        keyword.toLowerCase().includes(pos.toLowerCase())
      );
      if (hasPositive) positiveMatches++;
    }
    
    const positiveBonus = Math.min(0.3, positiveMatches * 0.1);
    
    // 최종: 기본 1.0 + 속성 보너스 + 긍정 보너스 (최대 1.5)
    return Math.min(1.5, 1.0 + attributeBonus + positiveBonus);
  }
  
  /**
   * Vibe Match 계산: 사용자 선택 순서 기반 가중치로 장소 매칭률 계산
   * 선택 순서: 1개(100%), 2개(60/40), 3개(50/30/20)
   * 반환값: 0.5 ~ 1.5 (배수)
   */
  private calculateVibeMatch(place: Place, userVibes: Vibe[]): number {
    if (userVibes.length === 0) return 1.0;
    
    const placeKeywords = (place.vibeKeywords as string[]) || [];
    if (placeKeywords.length === 0) return 1.0;
    
    const PRIORITY_WEIGHTS: Record<number, number[]> = {
      1: [1.0],
      2: [0.6, 0.4],
      3: [0.5, 0.3, 0.2],
    };
    
    const weights = PRIORITY_WEIGHTS[userVibes.length] || [0.5, 0.3, 0.2];
    
    let matchScore = 0;
    
    for (let i = 0; i < userVibes.length; i++) {
      const vibe = userVibes[i];
      const vibeWeight = weights[i];
      const vibeKeywords = VIBE_KEYWORD_MAP[vibe];
      
      const matches = placeKeywords.filter(keyword => 
        vibeKeywords.some(vk => keyword.toLowerCase().includes(vk.toLowerCase()))
      );
      
      const matchRate = matches.length > 0 ? Math.min(1, matches.length / 2) : 0;
      matchScore += vibeWeight * matchRate;
    }
    
    const vibeMatch = 1.0 + (matchScore - 0.5);
    return Math.min(1.5, Math.max(0.5, vibeMatch));
  }
  
  /**
   * Companion Bonus 계산: 동반자 타입에 맞는 장소 속성 매칭
   * 반환값: 0 ~ 2점
   */
  private calculateCompanionBonus(place: Place, companionType: CompanionType): number {
    const placeKeywords = (place.vibeKeywords as string[]) || [];
    const targetKeywords = COMPANION_KEYWORDS[companionType];
    
    // 장소 속성 확인
    const goodForChildren = (place as any).goodForChildren || false;
    const goodForGroups = (place as any).goodForGroups || false;
    const reservable = (place as any).reservable || false;
    
    let bonus = 0;
    
    // 키워드 매칭 보너스
    const matches = placeKeywords.filter(keyword =>
      targetKeywords.some(tk => keyword.toLowerCase().includes(tk.toLowerCase()))
    );
    
    if (matches.length > 0) {
      bonus += Math.min(1.0, matches.length * 0.5);
    }
    
    // 동반자 타입별 추가 보너스
    switch (companionType) {
      case 'Single':
        if (!reservable) bonus += 0.5; // 예약 불필요 = 혼밥 친화
        break;
      case 'Couple':
        if (matches.length >= 2) bonus += 1.0; // 로맨틱 키워드 다수
        break;
      case 'Family':
        if (goodForChildren) bonus += 1.5;
        break;
      case 'Group':
        if (goodForGroups) bonus += 0.5;
        if (reservable) bonus += 0.5;
        break;
    }
    
    return Math.min(2.0, bonus);
  }
  
  /**
   * Style Bonus 계산 — 2026-05-15 = priceLevel 폐기 후 단순화
   * (= price_eur 단일 SSOT, 스타일 매칭은 슬롯 수/일 + 매트릭스 폴백으로 충분)
   */
  private calculateStyleBonus(_place: Place, _travelStyle: TravelStyle): number {
    return 0.5; // 중립 보너스
  }
  
  /**
   * 여러 장소를 개인화 점수로 정렬
   */
  rankPlacesByPreference(
    places: Place[],
    userPreferences: UserPreferences,
    realityPenalty: number = 0
  ): Array<Place & { personalizedScore: number; scoreBreakdown: PersonalizedScoreResult['breakdown'] }> {
    return places
      .map(place => {
        const result = this.calculatePersonalizedScore(place, userPreferences, realityPenalty);
        return {
          ...place,
          personalizedScore: result.personalizedScore,
          scoreBreakdown: result.breakdown,
        };
      })
      .sort((a, b) => b.personalizedScore - a.personalizedScore);
  }

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
      // [DROPPED 0013] reality_checks 테이블 삭제됨 — 0건이었으므로 로직 제거

      const weather = await weatherFetcher.getWeatherForCity(city.id);
      if (weather) {
        realityPenalty += weather.penalty || 0;
      }
      
      try {
        const crisisAlerts = await getActiveCrisisAlerts(city.id);
        for (const alert of crisisAlerts) {
          const severityPenalty = (alert.severity / 5) * 2;
          realityPenalty += severityPenalty;
        }
      } catch (error) {
        console.error(`Failed to get crisis alerts for city ${city.id}:`, error);
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
      tasteVerifyScore: tasteVerifyScore ?? undefined,
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
        // ⚠️ 2026-05-15 = priceLevel 폐기 (= price_eur 단일 SSOT)
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
