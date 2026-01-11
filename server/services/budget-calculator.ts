import { storage } from "../storage";
import transportPrices from "../data/france-transport-prices-2026.json";

type MealLevel = 'Michelin' | 'Trendy' | 'Local' | 'Budget';
type GuideOption = 'None' | 'Walking' | 'Sedan' | 'VIP';
type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';

interface BudgetInput {
  days: number;
  companionCount: number;
  mealLevel: MealLevel;
  guideOption: GuideOption;
  mobilityStyle: MobilityStyle;
  mealsPerDay: number;
  placeIds?: number[];
}

interface DailyCostBreakdown {
  day: number;
  transport: number;
  meals: number;
  entranceFees: number;
  guide: number;
  subtotal: number;
  perPerson: number;
}

interface BudgetResult {
  dailyBreakdowns: DailyCostBreakdown[];
  totals: {
    transport: number;
    meals: number;
    entranceFees: number;
    guide: number;
    grandTotal: number;
    perPerson: number;
  };
  currency: string;
  notes: string[];
}

const MEAL_PRICES: Record<MealLevel, number> = {
  Michelin: 100,
  Trendy: 50,
  Local: 30,
  Budget: 10,
};

const GUIDE_PRICES_DEFAULT: Record<GuideOption, number> = {
  None: 0,
  Walking: 420,
  Sedan: 600,
  VIP: 1015,
};

const TRANSPORT_DAILY: Record<MobilityStyle, { base: number; description: string }> = {
  WalkMore: { base: 16.10, description: '대중교통 (Navigo 1일권)' },
  Moderate: { base: 40, description: '대중교통 + 우버 2회' },
  Minimal: { base: 0, description: '가이드 차량 포함' },
};

export class BudgetCalculator {
  
  async getGuidePrices(): Promise<Record<GuideOption, number>> {
    try {
      const dbPrices = await storage.getGuidePrices();
      if (dbPrices && dbPrices.length > 0) {
        const prices: Record<GuideOption, number> = { ...GUIDE_PRICES_DEFAULT };
        for (const p of dbPrices) {
          if (p.serviceType === 'walking' && p.pricePerDay) prices.Walking = p.pricePerDay;
          if (p.serviceType === 'sedan' && p.pricePerDay) prices.Sedan = p.pricePerDay;
          if (p.serviceType === 'vip' && p.pricePerDay) prices.VIP = p.pricePerDay;
        }
        return prices;
      }
    } catch (error) {
      console.error('[BudgetCalculator] DB 가이드 가격 조회 실패, 기본값 사용:', error);
    }
    return GUIDE_PRICES_DEFAULT;
  }

  async getEntranceFees(placeIds: number[]): Promise<Map<number, number>> {
    const fees = new Map<number, number>();
    if (!placeIds || placeIds.length === 0) return fees;
    
    try {
      for (const placeId of placeIds) {
        const priceData = await storage.getPlacePrice(placeId, 'entrance_fee');
        if (priceData && priceData.priceAverage) {
          fees.set(placeId, priceData.priceAverage);
        }
      }
    } catch (error) {
      console.error('[BudgetCalculator] 입장료 조회 실패:', error);
    }
    
    return fees;
  }

  async calculateBudget(input: BudgetInput): Promise<BudgetResult> {
    const { days, companionCount, mealLevel, guideOption, mobilityStyle, mealsPerDay, placeIds } = input;
    
    const guidePrices = await this.getGuidePrices();
    const entranceFees = placeIds ? await this.getEntranceFees(placeIds) : new Map();
    
    const dailyBreakdowns: DailyCostBreakdown[] = [];
    const notes: string[] = [];
    
    let totalTransport = 0;
    let totalMeals = 0;
    let totalEntranceFees = 0;
    let totalGuide = 0;
    
    const mealPricePerMeal = MEAL_PRICES[mealLevel];
    const guidePrice = guidePrices[guideOption];
    const transportInfo = TRANSPORT_DAILY[mobilityStyle];
    
    const isGuideIncludesTransport = guideOption === 'Sedan' || guideOption === 'VIP';
    
    for (let day = 1; day <= days; day++) {
      let dailyTransport = isGuideIncludesTransport ? 0 : transportInfo.base;
      let dailyMeals = mealPricePerMeal * mealsPerDay * companionCount;
      let dailyEntranceFees = 0;
      let dailyGuide = guidePrice;
      
      const dailyPlaceIds = placeIds?.slice((day - 1) * 4, day * 4) || [];
      for (const placeId of dailyPlaceIds) {
        const fee = entranceFees.get(placeId);
        if (fee) {
          dailyEntranceFees += fee * companionCount;
        }
      }
      
      const subtotal = dailyTransport + dailyMeals + dailyEntranceFees + dailyGuide;
      const perPerson = Number((subtotal / companionCount).toFixed(2));
      
      dailyBreakdowns.push({
        day,
        transport: dailyTransport,
        meals: dailyMeals,
        entranceFees: dailyEntranceFees,
        guide: dailyGuide,
        subtotal,
        perPerson,
      });
      
      totalTransport += dailyTransport;
      totalMeals += dailyMeals;
      totalEntranceFees += dailyEntranceFees;
      totalGuide += dailyGuide;
    }
    
    const grandTotal = totalTransport + totalMeals + totalEntranceFees + totalGuide;
    const perPerson = Number((grandTotal / companionCount).toFixed(2));
    
    if (isGuideIncludesTransport) {
      notes.push('가이드 차량 이용으로 교통비 별도 없음');
    } else {
      notes.push(`교통비: ${transportInfo.description}`);
    }
    
    notes.push(`식사: ${mealLevel} 등급 (€${mealPricePerMeal}/끼/인)`);
    notes.push(`가이드: ${guideOption === 'None' ? '없음' : `€${guidePrice}/일`}`);
    notes.push('출처: 파리 35년차 한국인 가이드 현장 데이터 (2026년)');
    
    return {
      dailyBreakdowns,
      totals: {
        transport: totalTransport,
        meals: totalMeals,
        entranceFees: totalEntranceFees,
        guide: totalGuide,
        grandTotal,
        perPerson,
      },
      currency: 'EUR',
      notes,
    };
  }

  async estimateQuickBudget(
    days: number,
    companionCount: number,
    mealLevel: MealLevel,
    guideOption: GuideOption
  ): Promise<{ total: number; perPerson: number; perDay: number }> {
    const mealsPerDay = 2;
    const mobilityStyle: MobilityStyle = guideOption === 'None' ? 'Moderate' : 'Minimal';
    
    const result = await this.calculateBudget({
      days,
      companionCount,
      mealLevel,
      guideOption,
      mobilityStyle,
      mealsPerDay,
    });
    
    return {
      total: result.totals.grandTotal,
      perPerson: result.totals.perPerson,
      perDay: Number((result.totals.grandTotal / days).toFixed(2)),
    };
  }

  getTransportPriceData() {
    return transportPrices;
  }

  getGuideServiceOptions() {
    const guideServices = transportPrices.guideServices.guideServices;
    return guideServices.filter(s => 
      ['private_guide_half', 'private_guide_full', 'vehicle_guide_package'].includes(s.id)
    );
  }
}

export const budgetCalculator = new BudgetCalculator();
