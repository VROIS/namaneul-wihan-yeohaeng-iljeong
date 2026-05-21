// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = DB-only 전용 AG4
// = Google Routes API 호출 = 0 (= transit-haversine.ts 사용)
// = Verifier (= Gemini) 호출 = 0
// = dailyPerPersonEur = ÷ companionCount X = 1 인 단가 그대로 + group = × companionCount 별도

import { db } from '../../db';
import { exchangeRates } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { PlaceResult, TripFormData, DaySlotConfig, TravelPace, ScheduleSlot } from './types';
import { MEAL_BUDGET } from './types';
import { calcTransitHaversine, type TravelMode } from './transit-haversine';

/** EUR → KRW 환율 = exchangeRates DB 캐시 */
async function getEurToKrwRate(): Promise<number> {
  try {
    if (!db) return 1500;
    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(and(
        eq(exchangeRates.baseCurrency, 'KRW'),
        eq(exchangeRates.targetCurrency, 'EUR'),
      ))
      .limit(1);
    if (rate && rate.rate > 0) {
      const eurToKrw = Math.round(1 / rate.rate);
      console.log(`[AG4-DB] 💱 €1 = ₩${eurToKrw.toLocaleString()}`);
      return eurToKrw;
    }
  } catch (error) {
    console.warn('[AG4-DB] 환율 조회 실패, 기본값 사용:', error);
  }
  return 1500;
}

function isValidCoord(lat: number, lng: number): boolean {
  return lat !== 0 && lng !== 0
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export interface AG4DbInput {
  schedule: ScheduleSlot[];
  daySlotsConfig: DaySlotConfig[];
  travelPace: TravelPace;
  formData: TripFormData;
  companionCount: number;
  dayCount: number;
}

/**
 * AG4-DB 메인 = DB-only 일정 완성
 * = Routes 0 + Verifier 0 + 단위 일치 (= 1 인 perPerson + group 별도)
 */
export async function finalizeDbOnlyItinerary(input: AG4DbInput): Promise<any> {
  const _t0 = Date.now();
  const { schedule, daySlotsConfig, travelPace, formData, companionCount, dayCount } = input;

  const travelMode: TravelMode = formData.mobilityStyle === 'WalkMore' ? 'WALK'
    : formData.mobilityStyle === 'Minimal' ? 'DRIVE'
    : 'TRANSIT';

  const mealBudget = MEAL_BUDGET[formData.travelStyle || 'Reasonable'];
  const eurToKrw = await getEurToKrwRate();

  const days: any[] = [];
  let totalPerPersonEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find(c => c.day === d)!;
    const dayPlaces = schedule
      .filter(s => s.day === d)
      .map(s => ({
        ...s.place,
        startTime: s.startTime,
        endTime: s.endTime,
        isMealSlot: s.isMealSlot,
        mealType: s.mealType,
        // ⚠️ 수정금지(승인필요) 2026-05-20 = price_eur 실제값 우선 = MEAL_BUDGET fallback (= NULL 시만)
        mealPrice: s.isMealSlot
          ? (s.place.estimatedPriceEur && s.place.estimatedPriceEur > 0
              ? s.place.estimatedPriceEur
              : (s.mealType === 'lunch' ? mealBudget.lunch : mealBudget.dinner))
          : undefined,
        mealPriceLabel: s.isMealSlot
          ? (s.place.estimatedPriceEur && s.place.estimatedPriceEur > 0
              ? `€${s.place.estimatedPriceEur}`
              : (s.mealType === 'lunch' ? mealBudget.lunchLabel : mealBudget.dinnerLabel))
          : undefined,
        estimatedPriceEur: s.place.estimatedPriceEur,
        selectionReasons: s.place.selectionReasons || [],
        confidenceLevel: s.place.confidenceLevel || 'minimal',
      }));

    // 숙소 좌표 = 첫 장소 좌표 (= AG4-DB = 단순화)
    const accommodationCoords = dayPlaces.length > 0
      ? { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng }
      : undefined;
    const accommodationName = '도심 기준';

    // 이동 구간 = Haversine 자체 계산 (= Routes API 0)
    const transits: any[] = [];
    let departureTransit: any;
    let returnTransit: any;

    if (accommodationCoords && dayPlaces.length > 0) {
      departureTransit = calcTransitHaversine(
        { ...accommodationCoords, name: accommodationName },
        dayPlaces[0],
        travelMode, companionCount,
      );
    }

    for (let i = 0; i < dayPlaces.length - 1; i++) {
      transits.push(calcTransitHaversine(
        dayPlaces[i], dayPlaces[i + 1],
        travelMode, companionCount,
      ));
    }

    if (accommodationCoords && dayPlaces.length > 0) {
      const last = dayPlaces[dayPlaces.length - 1];
      returnTransit = calcTransitHaversine(
        last,
        { ...accommodationCoords, name: `🏨 ${accommodationName}` },
        travelMode, companionCount,
      );
    }

    const allTransits = [
      ...(departureTransit ? [departureTransit] : []),
      ...transits,
      ...(returnTransit ? [returnTransit] : []),
    ];

    // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = priceEur 모든 값 합산 (= 0 = 무료 포함 / null = 제외)
    // = 옛 `> 0` 조건 = healing/hotspot priceEur=0 다수 누락 = 시정 = typeof === 'number'
    const mealCostEur = dayPlaces.reduce((sum: number, p: any) =>
      sum + (p.isMealSlot && p.mealPrice ? p.mealPrice : 0), 0);
    const entranceFeesEur = dayPlaces.reduce((sum: number, p: any) =>
      sum + (!p.isMealSlot && typeof p.estimatedPriceEur === 'number' ? p.estimatedPriceEur : 0), 0);
    const transportCostEur = allTransits.reduce((sum: number, t: any) => sum + (t.cost || 0), 0);

    // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = price_eur 단일 = 1 인 단가 (= ÷ companionCount X)
    const dailyPerPersonEur = Math.round((mealCostEur + entranceFeesEur + transportCostEur) * 100) / 100;
    const dailyGroupEur = Math.round(dailyPerPersonEur * companionCount * 100) / 100;
    const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);
    const dailyGroupKrw = Math.round(dailyGroupEur * eurToKrw);

    totalPerPersonEur += dailyPerPersonEur;

    // 좌표 유효성 검증
    for (const p of dayPlaces) {
      if (!isValidCoord(p.lat, p.lng)) {
        console.warn(`[AG4-DB] ⚠️ 좌표 무효: ${p.name} (${p.lat}, ${p.lng})`);
      }
    }

    days.push({
      day: d,
      places: dayPlaces,
      city: formData.destination,
      summary: `${formData.destination} 하루`,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      accommodation: accommodationCoords ? {
        day: d,
        name: accommodationName,
        coords: accommodationCoords,
      } : undefined,
      departureTransit,
      returnTransit,
      transit: {
        transits: allTransits,
        totalDuration: allTransits.reduce((s: number, t: any) => s + t.duration, 0),
        totalCost: allTransits.reduce((s: number, t: any) => s + t.costTotal, 0),
      },
      // ⚠️ 수정금지(승인필요) 2026-05-21 = MIX AG4 와 동일 형식 정합 (= 사용자 SSOT) = totalEur + totalKrw 추가 = FE 호환
      dailyCost: {
        mealEur: mealCostEur,
        entranceEur: entranceFeesEur,
        transportEur: transportCostEur,
        totalEur: dailyPerPersonEur,  // = MIX 호환 = perPersonEur 동일 (= 1 인 기준 합)
        totalKrw: dailyGroupKrw,       // = 그룹 KRW (= 사용자가 본 일일 합산)
        perPersonEur: dailyPerPersonEur,
        perPersonKrw: dailyPerPersonKrw,
        groupEur: dailyGroupEur,
        groupKrw: dailyGroupKrw,
      },
    });
  }

  const totalGroupEur = Math.round(totalPerPersonEur * companionCount * 100) / 100;
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);
  const totalGroupKrw = Math.round(totalGroupEur * eurToKrw);

  console.log(`[AG4-DB] ✅ 실시간 완성 (${Date.now() - _t0}ms): ${days.length}일, ${schedule.length}곳`);
  console.log(`[AG4-DB] 💰 인당: €${totalPerPersonEur.toFixed(2)} / ₩${totalPerPersonKrw.toLocaleString()}`);
  console.log(`[AG4-DB] 💰 그룹 ${companionCount}인: €${totalGroupEur.toFixed(2)} / ₩${totalGroupKrw.toLocaleString()}`);

  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || '09:00',
    endTime: formData.endTime || '21:00',
    days,
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    totalCost: {
      perPersonEur: totalPerPersonEur,
      perPersonKrw: totalPerPersonKrw,
      groupEur: totalGroupEur,
      groupKrw: totalGroupKrw,
      eurToKrwRate: eurToKrw,
      currency: 'EUR',
    },
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace,
      totalPlaces: schedule.length,
      companionType: formData.companionType,
      companionCount,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      pipelineVersion: 'db-only-v1',
    },
  };
}
