/**
 * 예산 계산기 (Budget Calculator) - 소숫점 정밀 계산
 * 
 * 🎯 TravelStyle 기반 통합 비용 산정
 * 
 * 비용 구성:
 * 1. 교통비 - transport-pricing-service.ts 연동 (소숫점 정밀)
 *    - 많이 걷기: 대중교통 실제 요금
 *    - 적당히: 대중교통 + 우버 실제 요금
 *    - 이동 최소화: 가이드 시간당 요금 (반일 4h 기본)
 * 
 * 2. 식사비 - TravelStyle별 고정 (Luxury €70, Premium €50, Reasonable €30, Economic €10)
 * 
 * 3. 입장료 - Gemini 실시간 검색 (사용자 신뢰의 원천)
 * 
 * 💰 마케팅 전략:
 * - Luxury/Premium: 드라이빙 가이드 가격 포함
 * - Reasonable/Economic: 드라이빙 가이드 가격 별도 표시 (신규 고객 창출)
 * 
 * ⚠️ 가격 정보는 가장 민감 → 소숫점까지 정확하게!
 */

import { db } from '../db';
import { guidePrices, geminiWebSearchCache } from '../../shared/schema';
import { eq } from 'drizzle-orm';
// 'and' import 제거 - 현재 미사용
import { transportPricingService, round2 } from './transport-pricing-service';

// === 타입 정의 ===
type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';
type CompanionType = 'Single' | 'Couple' | 'Family' | 'ExtendedFamily' | 'Group';
type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';

// === 식사비 (확정) ===
// 1끼/1인 기준 (EUR)
const MEAL_PRICES: Record<TravelStyle, { price: number; description: string }> = {
  Luxury: { price: 70, description: '미슐랭 1~3스타급' },
  Premium: { price: 50, description: '트렌디 레스토랑' },
  Reasonable: { price: 30, description: '현지인 맛집' },
  Economic: { price: 10, description: '스트리트푸드/간편식' },
};

// === 입장료 기본값 (Gemini 검색 실패시 fallback) ===
const DEFAULT_ENTRANCE_FEES: Record<string, number> = {
  'museum': 15,
  'art_gallery': 12,
  'tourist_attraction': 10,
  'amusement_park': 45,
  'zoo': 25,
  'aquarium': 22,
  'spa': 35,
  'landmark': 0,  // 대부분 무료
  'church': 0,
  'park': 0,
};

// === 인터페이스 ===
interface BudgetInput {
  travelStyle: TravelStyle;
  companionType: CompanionType;
  companionCount: number;
  mobilityStyle: MobilityStyle;
  dayCount: number;
  hoursPerDay: number;
  mealsPerDay: number;  // 보통 2끼 (점심+저녁)
  places: PlaceForBudget[];
}

interface PlaceForBudget {
  id: string;
  name: string;
  type?: string;
  placeTypes?: string[];
}

interface DailyBudgetBreakdown {
  day: number;
  transport: number;
  meals: number;
  entranceFees: number;
  subtotal: number;
  perPerson: number;
  places: { name: string; entranceFee: number }[];
}

interface BudgetResult {
  travelStyle: TravelStyle;
  dailyBreakdowns: DailyBudgetBreakdown[];
  totals: {
    transport: number;
    meals: number;
    entranceFees: number;
    grandTotal: number;
    perPerson: number;
    perDay: number;
  };
  transportDetails: {
    type: string;
    description: string;
    includesGuide: boolean;
    dailyRate: number;
  };
  // 💰 마케팅: 합리적/경제적 선택시 가이드 가격 별도 표시
  guideServiceComparison?: {
    sedanPrice: number;
    vanPrice: number;
    savings: number;
    marketingNote: string;
  };
  currency: string;
  notes: string[];
  dataSource: string;
}

/**
 * Gemini로 장소 입장료 실시간 검색
 */
async function searchEntranceFeeWithGemini(placeName: string, destination: string): Promise<number | null> {
  try {
    // 캐시 확인 (7일 유효)
    const cacheKey = `entrance_fee_${placeName}_${destination}`;
    const cached = await db.select().from(geminiWebSearchCache)
      .where(eq(geminiWebSearchCache.query, cacheKey))
      .limit(1);
    
    if (cached.length > 0) {
      const cacheAge = Date.now() - new Date(cached[0].createdAt).getTime();
      if (cacheAge < 7 * 24 * 60 * 60 * 1000) {
        const data = cached[0].result as { entranceFee?: number };
        return data.entranceFee || null;
      }
    }
    
    // Gemini API 호출
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) return null;
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `${destination}에 있는 "${placeName}"의 2026년 현재 입장료(성인 기준, EUR)를 알려주세요.
무료인 경우 0, 모르면 null로 답해주세요.
JSON 형식으로만 답해주세요: {"entranceFee": 숫자 또는 null, "source": "출처"}`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const fee = parsed.entranceFee;
      
      // 캐시 저장
      await db.insert(geminiWebSearchCache).values({
        query: cacheKey,
        searchType: 'entrance_fee',
        result: { entranceFee: fee, source: parsed.source },
      }).onConflictDoNothing();
      
      return typeof fee === 'number' ? fee : null;
    }
  } catch (error) {
    console.warn(`[Budget] 입장료 검색 실패: ${placeName}`, error);
  }
  return null;
}

/**
 * 장소 타입에서 기본 입장료 추정
 */
function getDefaultEntranceFee(placeTypes: string[]): number {
  for (const type of placeTypes) {
    if (DEFAULT_ENTRANCE_FEES[type] !== undefined) {
      return DEFAULT_ENTRANCE_FEES[type];
    }
  }
  return 0;  // 기본값: 무료
}

/**
 * 입장료 조회 (Gemini 우선, fallback: 타입 기반 추정)
 */
async function getEntranceFee(
  place: PlaceForBudget, 
  destination: string,
  useRealtime: boolean = true
): Promise<{ fee: number; source: 'gemini' | 'estimated' }> {
  // 실시간 검색 시도
  if (useRealtime) {
    const geminiResult = await searchEntranceFeeWithGemini(place.name, destination);
    if (geminiResult !== null) {
      return { fee: geminiResult, source: 'gemini' };
    }
  }
  
  // Fallback: 타입 기반 추정
  const types = place.placeTypes || (place.type ? [place.type] : []);
  return { 
    fee: getDefaultEntranceFee(types), 
    source: 'estimated' 
  };
}

/**
 * 드라이빙 가이드 비교 가격 조회 (마케팅용)
 */
async function getGuideComparisonPrices(hoursPerDay: number): Promise<{
  sedanPrice: number;
  vanPrice: number;
  uberBlackEstimate?: { low: number; high: number };
}> {
  try {
    const [sedanData] = await db.select().from(guidePrices)
      .where(eq(guidePrices.serviceType, 'sedan'))
      .limit(1);
    
    const [vanData] = await db.select().from(guidePrices)
      .where(eq(guidePrices.serviceType, 'van'))
      .limit(1);
    
    const sedanBase = sedanData?.basePrice4h || 240;
    const sedanHourly = sedanData?.pricePerHour || 60;
    const vanBase = vanData?.basePrice4h || 320;
    const vanHourly = vanData?.pricePerHour || 80;
    
    const extraHours = Math.max(0, hoursPerDay - 4);
    
    return {
      sedanPrice: sedanBase + (extraHours * sedanHourly),
      vanPrice: vanBase + (extraHours * vanHourly),
      uberBlackEstimate: sedanData?.uberBlackEstimate as { low: number; high: number } | undefined,
    };
  } catch (error) {
    console.warn('[Budget] 가이드 가격 조회 실패:', error);
    return { sedanPrice: 480, vanPrice: 640 };  // 8시간 기본값
  }
}

/**
 * 🎯 메인: TravelStyle 기반 예산 계산
 */
export async function calculateTravelBudget(input: BudgetInput): Promise<BudgetResult> {
  const {
    travelStyle,
    companionType,
    companionCount,
    mobilityStyle,
    dayCount,
    hoursPerDay,
    mealsPerDay,
    places,
  } = input;
  
  const notes: string[] = [];
  const dailyBreakdowns: DailyBudgetBreakdown[] = [];
  
  // === 1. 교통비 계산 ===
  const transportResult = await transportPricingService.calculateTransportPrice({
    companionType,
    companionCount,
    mobilityStyle,
    travelStyle,
    hours: hoursPerDay,
    dayCount,
  });
  
  // === 2. 식사비 계산 (소숫점 정밀) ===
  const mealConfig = MEAL_PRICES[travelStyle];
  const dailyMeals = round2(mealConfig.price * mealsPerDay * companionCount);
  const totalMeals = round2(dailyMeals * dayCount);
  
  // === 3. 입장료 계산 (Gemini 실시간) ===
  let totalEntranceFees = 0;
  let geminiSourceCount = 0;
  const destination = places.length > 0 ? '파리' : '';  // TODO: destination 전달받기
  
  const placesPerDay = Math.ceil(places.length / dayCount);
  
  for (let day = 1; day <= dayCount; day++) {
    const dayPlaces = places.slice((day - 1) * placesPerDay, day * placesPerDay);
    let dayEntranceFees = 0;
    const dayPlaceFees: { name: string; entranceFee: number }[] = [];
    
    for (const place of dayPlaces) {
      const { fee, source } = await getEntranceFee(place, destination, true);
      const totalFee = fee * companionCount;
      dayEntranceFees += totalFee;
      dayPlaceFees.push({ name: place.name, entranceFee: fee });
      if (source === 'gemini') geminiSourceCount++;
    }
    
    totalEntranceFees = round2(totalEntranceFees + dayEntranceFees);
    
    // 일일 합계 (소숫점 정밀)
    const dailyTransport = transportResult.dailyPrice;
    const dailySubtotal = round2(dailyTransport + dailyMeals + dayEntranceFees);
    
    dailyBreakdowns.push({
      day,
      transport: dailyTransport,
      meals: dailyMeals,
      entranceFees: dayEntranceFees,
      subtotal: dailySubtotal,
      perPerson: round2(dailySubtotal / companionCount),
      places: dayPlaceFees,
    });
  }
  
  // === 4. 총합 계산 (소숫점 정밀) ===
  const grandTotal = round2(transportResult.totalPrice + totalMeals + totalEntranceFees);
  const perPerson = round2(grandTotal / companionCount);
  const perDay = round2(grandTotal / dayCount);
  
  // === 5. 마케팅: 가이드 가격 비교 (합리적/경제적 선택시) ===
  let guideServiceComparison: BudgetResult['guideServiceComparison'] = undefined;
  
  if (travelStyle === 'Reasonable' || travelStyle === 'Economic') {
    const guidePrices = await getGuideComparisonPrices(hoursPerDay);
    const currentTransportDaily = transportResult.dailyPrice;
    const savings = guidePrices.sedanPrice - currentTransportDaily;
    
    guideServiceComparison = {
      sedanPrice: guidePrices.sedanPrice,
      vanPrice: guidePrices.vanPrice,
      savings: Math.abs(savings),
      marketingNote: savings > 0 
        ? `💡 드라이빙 가이드 서비스 추가 시 하루 €${guidePrices.sedanPrice} (우버 호출 스트레스 없이 프리미엄 여행!)`
        : `🎯 가이드 서비스가 우버보다 저렴! 하루 €${guidePrices.sedanPrice}로 VIP 여행`,
    };
    
    notes.push(`💡 프리미엄 가이드 서비스: 세단 €${guidePrices.sedanPrice}/일, 밴 €${guidePrices.vanPrice}/일`);
  }
  
  // === 6. 노트 생성 ===
  notes.push(`식사: ${mealConfig.description} (€${mealConfig.price}/끼/인 × ${mealsPerDay}끼)`);
  notes.push(`교통: ${transportResult.vehicleDescription}`);
  
  if (geminiSourceCount > 0) {
    notes.push(`입장료: ${geminiSourceCount}개 장소 실시간 검색 적용`);
  }
  
  // 교통비 상세 노트 추가
  if (transportResult.breakdown.transitDetails) {
    notes.push(`대중교통: €${transportResult.breakdown.transitDetails.totalTransit} (${transportResult.breakdown.transitDetails.tripCount}회/일)`);
  }
  if (transportResult.breakdown.uberDetails) {
    notes.push(`우버: €${transportResult.breakdown.uberDetails.totalUber} (€${transportResult.breakdown.uberDetails.farePerTrip}/회)`);
  }
  
  notes.push('출처: 파리 35년차 가이드 현장 데이터 + 실시간 요금 (소숫점 정밀, 2026년)');
  
  return {
    travelStyle,
    dailyBreakdowns,
    totals: {
      transport: transportResult.totalPrice,
      meals: totalMeals,
      entranceFees: totalEntranceFees,
      grandTotal,
      perPerson,
      perDay,
    },
    transportDetails: {
      type: transportResult.transportType,
      description: transportResult.vehicleDescription,
      includesGuide: transportResult.includesGuide,
      dailyRate: transportResult.dailyPrice,
    },
    guideServiceComparison,
    currency: 'EUR',
    notes,
    dataSource: geminiSourceCount > 0 ? 'realtime_gemini' : 'estimated',
  };
}

/**
 * 빠른 예산 미리보기 (프론트엔드 버튼용)
 */
export async function getQuickBudgetPreview(
  travelStyle: TravelStyle,
  companionCount: number,
  dayCount: number,
  hoursPerDay: number = 8
): Promise<{
  estimated: { perDay: number; total: number; perPerson: number };
  breakdown: { transport: string; meals: string; entranceFees: string };
  guideOption?: { price: number; note: string };
}> {
  const mealConfig = MEAL_PRICES[travelStyle];
  const mealsPerDay = 2;
  
  // 간단한 교통비 추정
  let dailyTransport = 0;
  let transportDesc = '';
  
  if (travelStyle === 'Luxury' || travelStyle === 'Premium') {
    // 가이드 포함
    const guidePrices = await getGuideComparisonPrices(hoursPerDay);
    dailyTransport = travelStyle === 'Luxury' ? guidePrices.vanPrice : guidePrices.sedanPrice;
    transportDesc = `€${dailyTransport}/일 (가이드 포함)`;
  } else if (travelStyle === 'Reasonable') {
    dailyTransport = 40;  // 우버+대중교통
    transportDesc = '€40/일 (우버+대중교통)';
  } else {
    dailyTransport = 16;  // 대중교통만
    transportDesc = '€16/일 (대중교통)';
  }
  
  const dailyMeals = mealConfig.price * mealsPerDay * companionCount;
  const dailyEntranceFees = 15 * companionCount;  // 평균 추정
  
  const perDay = dailyTransport + dailyMeals + dailyEntranceFees;
  const total = perDay * dayCount;
  const perPerson = Math.round(total / companionCount);
  
  const result: any = {
    estimated: { perDay, total, perPerson },
    breakdown: {
      transport: transportDesc,
      meals: `€${mealConfig.price}/끼 × ${mealsPerDay}끼 × ${companionCount}명 = €${dailyMeals}`,
      entranceFees: `평균 €15/인 × ${companionCount}명 = €${dailyEntranceFees}`,
    },
  };
  
  // 합리적/경제적 선택시 가이드 옵션 표시
  if (travelStyle === 'Reasonable' || travelStyle === 'Economic') {
    const guidePrices = await getGuideComparisonPrices(hoursPerDay);
    result.guideOption = {
      price: guidePrices.sedanPrice,
      note: `💡 프리미엄 가이드 추가: +€${guidePrices.sedanPrice - dailyTransport}/일`,
    };
  }
  
  return result;
}

// 기존 호환성을 위한 클래스 래퍼
export class BudgetCalculator {
  async calculateBudget(input: any) {
    return calculateTravelBudget({
      travelStyle: input.travelStyle || 'Reasonable',
      companionType: input.companionType || 'Couple',
      companionCount: input.companionCount || 2,
      mobilityStyle: input.mobilityStyle || 'Moderate',
      dayCount: input.days || 1,
      hoursPerDay: input.hoursPerDay || 8,
      mealsPerDay: input.mealsPerDay || 2,
      places: input.places || [],
    });
  }
  
  async getQuickPreview(travelStyle: TravelStyle, companionCount: number, dayCount: number) {
    return getQuickBudgetPreview(travelStyle, companionCount, dayCount);
  }
}

export const budgetCalculator = new BudgetCalculator();

