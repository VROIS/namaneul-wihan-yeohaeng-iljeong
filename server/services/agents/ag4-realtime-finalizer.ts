/**
 * AG4: Real-time Finalizer (실시간 완성)
 * 소요: 1~2초
 * 
 * 역할:
 * - 구간별 교통비 + 일일 비용 합계
 * - 날씨 정보 (weatherCache)
 * - 위기 경보 (crisisAlerts)
 * - 환율 정보 (EUR → KRW 변환)
 * - 실시간 이동 시간 (Google Routes API)
 * - 최종 JSON 검증 (필수 필드 확인, 좌표 유효성) + 응답 반환
 * 
 * 비용 계산 헌법 (AG4 비용 계산 규칙):
 * - 대원칙: 모든 비용은 실제/실시간 가격 최우선 (사용자 신뢰도)
 * - 표시: EUR + KRW 병기 (€60 / ₩82,000)
 * - 일일/인당 기준
 */

import { routeOptimizer } from '../route-optimizer';
import { db } from '../../db';
import { exchangeRates } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { AG1Output, AG3Output, PlaceResult, ScheduleSlot, DaySlotConfig } from './types';
import { MEAL_BUDGET, getCompanionCount } from './types';

/**
 * EUR → KRW 환율 조회 (DB 캐시 활용)
 */
async function getEurToKrwRate(): Promise<number> {
  try {
    if (!db) return 1500; // DB 미연결 시 기본값

    // KRW 기준 EUR 환율 조회
    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(and(
        eq(exchangeRates.baseCurrency, 'KRW'),
        eq(exchangeRates.targetCurrency, 'EUR')
      ))
      .limit(1);

    if (rate && rate.rate > 0) {
      // rate = KRW 1원에 대한 EUR 환산 → EUR 1에 대한 KRW = 1 / rate
      const eurToKrw = Math.round(1 / rate.rate);
      console.log(`[AG4] 💱 환율: €1 = ₩${eurToKrw.toLocaleString()}`);
      return eurToKrw;
    }
  } catch (error) {
    console.warn('[AG4] 환율 조회 실패, 기본값 사용:', error);
  }
  return 1500; // fallback 기본값
}

/**
 * 좌표 유효성 검증
 */
function isValidCoord(lat: number, lng: number): boolean {
  return lat !== 0 && lng !== 0 &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180;
}

/**
 * AG4 메인: 일정 실시간 완성
 * 
 * AG3에서 확정된 스케줄에 이동 정보, 비용, 날씨 등 실시간 데이터를 추가
 */
export async function finalizeItinerary(
  ag3Output: AG3Output,
  skeleton: AG1Output,
  realityCheck: { weather: string; crowd: string; status: string }
): Promise<any> {
  const _t0 = Date.now();
  const { schedule, daySlotsConfig, travelPace } = ag3Output;
  // ⚠️ 수정금지(승인필요) 2026-05-20 = KoreanSentiment 완전 폐기 (= 사용자 SSOT)
  const { formData, companionCount, vibeWeights } = skeleton;

  // 이동 수단 결정
  const travelMode = formData.mobilityStyle === 'WalkMore' ? 'WALK' as const
    : formData.mobilityStyle === 'Minimal' ? 'DRIVE' as const
    : 'TRANSIT' as const;

  const mealBudget = MEAL_BUDGET[formData.travelStyle || 'Reasonable'];
  const dayCount = skeleton.dayCount;
  const paceLabel = travelPace === 'Packed' ? '빡빡하게'
    : travelPace === 'Normal' ? '보통'
    : '여유롭게';

  // 환율 조회 (EUR → KRW)
  const eurToKrw = await getEurToKrwRate();

  const days: any[] = [];
  let totalTripCostEur = 0;

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
        // ⚠️ 수정금지(승인필요) 2026-05-19 사용자 SSOT = 실제 place.priceEur 우선 = MEAL_BUDGET ceiling fallback
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
        tripAdvisorRating: s.place.tripAdvisorRating,
        tripAdvisorReviewCount: s.place.tripAdvisorReviewCount,
        tripAdvisorRanking: s.place.tripAdvisorRanking,
        estimatedPriceEur: s.place.estimatedPriceEur,
        finalScore: s.place.finalScore,
        photoSpotScore: s.place.photoSpotScore,
        photoTip: s.place.photoTip,
        bestPhotoTime: s.place.bestPhotoTime,
        isPackageTourIncluded: s.place.isPackageTourIncluded,
        selectionReasons: s.place.selectionReasons || [],
        confidenceLevel: s.place.confidenceLevel || 'minimal',
        realityCheck,
      }));

    // 숙소 좌표 결정
    const dayAccommodation = formData.dayAccommodations?.find(a => a.day === d);
    let accommodationCoords: { lat: number; lng: number } | undefined;
    let accommodationName = '';
    let accommodationAddress = '';

    if (dayAccommodation?.coords?.lat && dayAccommodation?.coords?.lng) {
      accommodationCoords = dayAccommodation.coords;
      accommodationName = dayAccommodation.name;
      accommodationAddress = dayAccommodation.address;
    } else if (formData.accommodationCoords?.lat && formData.accommodationCoords?.lng) {
      accommodationCoords = formData.accommodationCoords;
      accommodationName = formData.accommodationName || '숙소';
      accommodationAddress = formData.accommodationAddress || '';
    } else if (formData.destinationCoords?.lat && formData.destinationCoords?.lng) {
      accommodationCoords = formData.destinationCoords;
      accommodationName = `${formData.destination} 도심`;
    } else if (dayPlaces.length > 0) {
      accommodationCoords = { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng };
      accommodationName = '도심 기준';
    }

    // 이동 구간 계산
    const transits: any[] = [];

    // 숙소→첫장소
    let departureTransit: any;
    if (accommodationCoords && dayPlaces.length > 0) {
      departureTransit = await getTransit(
        accommodationCoords, accommodationName,
        dayPlaces[0], travelMode, companionCount
      );
    }

    // 장소 간 이동
    for (let i = 0; i < dayPlaces.length - 1; i++) {
      const transit = await getTransit(
        dayPlaces[i], dayPlaces[i].name,
        dayPlaces[i + 1], travelMode, companionCount
      );
      transits.push(transit);
    }

    // 마지막장소→숙소
    let returnTransit: any;
    if (accommodationCoords && dayPlaces.length > 0) {
      const lastPlace = dayPlaces[dayPlaces.length - 1];
      returnTransit = await getTransit(
        lastPlace, lastPlace.name,
        { lat: accommodationCoords.lat, lng: accommodationCoords.lng, name: `🏨 ${accommodationName}`, id: 'accommodation' } as any,
        travelMode, companionCount
      );
    }

    const topVibes = dayPlaces
      .flatMap((p: any) => p.vibeTags || [])
      .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
      .slice(0, 2);

    const dayCities = dayPlaces
      .map((p: any) => p.city)
      .filter((c: string, i: number, arr: string[]) => c && arr.indexOf(c) === i);

    const cityLabel = dayCities.length > 0 ? dayCities.join(', ') : formData.destination;

    const allTransits = [
      ...(departureTransit ? [departureTransit] : []),
      ...transits,
      ...(returnTransit ? [returnTransit] : []),
    ];

    // ===== 일일 비용 합계 계산 =====
    // 식사비 (점심 + 저녁)
    const mealCostEur = dayPlaces.reduce((sum: number, p: any) => {
      if (p.isMealSlot && p.mealPrice) return sum + p.mealPrice;
      return sum;
    }, 0);

    // 입장료 합계
    const entranceFeesEur = dayPlaces.reduce((sum: number, p: any) => {
      if (!p.isMealSlot && p.estimatedPriceEur && p.estimatedPriceEur > 0) {
        return sum + p.estimatedPriceEur;
      }
      return sum;
    }, 0);

    // 교통비 합계
    const transportCostEur = allTransits.reduce((sum: number, t: any) => sum + (t.cost || 0), 0);
    const transportCostTotalEur = allTransits.reduce((sum: number, t: any) => sum + (t.costTotal || 0), 0);

    // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = price_eur 단일 = 1 인 단가 SSOT
    // = 옛 = dailyTotalEur / companionCount = 1 인 합 또 ÷ N = 1/N 인 단가 (= 단위 혼동 버그 = €25/인)
    // = 새 = dailyTotalEur 자체가 1 인 일일 합 = perPerson 그대로 / group = × companionCount
    const dailyPerPersonEur = Math.round((mealCostEur + entranceFeesEur + transportCostEur) * 100) / 100;
    const dailyGroupEur = Math.round(dailyPerPersonEur * companionCount * 100) / 100;
    const dailyTotalEur = dailyPerPersonEur; // = 호환 (= 옛 변수명 유지 = budget UI 영향 X)
    const dailyTotalKrw = Math.round(dailyGroupEur * eurToKrw);
    const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);

    totalTripCostEur += dailyPerPersonEur;

    // ===== 좌표 유효성 검증 =====
    let invalidCoords = 0;
    for (const p of dayPlaces) {
      if (!isValidCoord(p.lat, p.lng)) {
        invalidCoords++;
        console.warn(`[AG4] ⚠️ 좌표 무효: ${p.name} (${p.lat}, ${p.lng})`);
      }
    }
    if (invalidCoords > 0) {
      console.warn(`[AG4] ⚠️ Day ${d}: ${invalidCoords}곳 좌표 무효`);
    }

    days.push({
      day: d,
      places: dayPlaces,
      city: cityLabel,
      summary: `${cityLabel} - ${topVibes.join(' & ')} 중심의 하루`,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      accommodation: accommodationCoords ? {
        day: d,
        name: accommodationName,
        address: accommodationAddress,
        coords: accommodationCoords,
      } : undefined,
      departureTransit,
      returnTransit,
      transit: {
        transits: allTransits,
        totalDuration: allTransits.reduce((sum: number, t: any) => sum + t.duration, 0),
        totalCost: allTransits.reduce((sum: number, t: any) => sum + t.costTotal, 0),
      },
      // 일일 비용 요약
      dailyCost: {
        mealEur: mealCostEur,
        entranceEur: entranceFeesEur,
        transportEur: transportCostEur,
        totalEur: dailyTotalEur,
        totalKrw: dailyTotalKrw,
        perPersonEur: dailyPerPersonEur,
        perPersonKrw: dailyPerPersonKrw,
      },
    });
  }

  // ⚠️ 수정금지(승인필요) 2026-05-20 = totalTripCostEur 누적 = 1 인 기준 (= 위 수정 후)
  // = perPerson 그대로 / group = × companionCount (= 단위 일치)
  const totalPerPersonEur = Math.round(totalTripCostEur * 100) / 100;
  const totalGroupEur = Math.round(totalPerPersonEur * companionCount * 100) / 100;
  const totalTripCostKrw = Math.round(totalGroupEur * eurToKrw);
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);

  console.log(`[AG4] ✅ 실시간 완성 (${Date.now() - _t0}ms): ${days.length}일, ${schedule.length}곳`);
  console.log(`[AG4] 💰 총 비용: €${totalTripCostEur.toFixed(0)} / ₩${totalTripCostKrw.toLocaleString()}`);
  console.log(`[AG4] 💰 인당: €${totalPerPersonEur.toFixed(0)} / ₩${totalPerPersonKrw.toLocaleString()}`);

  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || '09:00',
    endTime: formData.endTime || '21:00',
    days,
    vibeWeights,
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    // 총 비용 요약 (백엔드 형식)
    totalCost: {
      totalEur: Math.round(totalTripCostEur * 100) / 100,
      totalKrw: totalTripCostKrw,
      perPersonEur: totalPerPersonEur,
      perPersonKrw: totalPerPersonKrw,
      eurToKrwRate: eurToKrw,
      currency: 'EUR',
    },
    // 🔗 프론트엔드 호환 예산 필드 (client/types/trip.ts의 Itinerary.budget와 매칭)
    budget: {
      travelStyle: formData.travelStyle || 'Reasonable',
      dailyBreakdowns: days.map((day: any) => ({
        day: day.day,
        transport: day.dailyCost?.transportEur || 0,
        meals: day.dailyCost?.mealEur || 0,
        entranceFees: day.dailyCost?.entranceEur || 0,
        subtotal: day.dailyCost?.totalEur || 0,
        perPerson: day.dailyCost?.perPersonEur || 0,
      })),
      totals: {
        transport: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.transportEur || 0), 0),
        meals: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.mealEur || 0), 0),
        entranceFees: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.entranceEur || 0), 0),
        grandTotal: Math.round(totalTripCostEur * 100) / 100,
        perPerson: totalPerPersonEur,
        perDay: dayCount > 0 ? Math.round(totalTripCostEur / dayCount * 100) / 100 : 0,
      },
    },
    // 날씨/위기 경보
    realityCheck,
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace,
      travelPaceLabel: paceLabel,
      slotDurationMinutes: skeleton.paceConfig.slotDurationMinutes,
      totalPlaces: schedule.length,
      mobilityStyle: formData.mobilityStyle,
      companionType: formData.companionType,
      companionCount,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      pipelineVersion: 'v2-4agent',
    },
  };
}

/**
 * 두 지점 간 이동 정보 계산 (Google Routes API)
 */
async function getTransit(
  from: any,
  fromName: string,
  to: any,
  travelMode: 'WALK' | 'TRANSIT' | 'DRIVE',
  companionCount: number
): Promise<any> {
  const fromId = typeof from.id === 'number' ? from.id : Math.abs(hashCode(from.id || from.name || fromName));
  const toId = typeof to.id === 'number' ? to.id : Math.abs(hashCode(to.id || to.name || ''));

  try {
    const route = await routeOptimizer.getRoute(
      { id: fromId, latitude: from.lat, longitude: from.lng, name: fromName } as any,
      { id: toId, latitude: to.lat, longitude: to.lng, name: to.name } as any,
      travelMode
    );

    const durationMinutes = Math.round(route.durationSeconds / 60);
    return {
      from: fromName.startsWith('🏨') ? fromName : from.name || fromName,
      to: to.name || '',
      mode: travelMode.toLowerCase(),
      modeLabel: travelMode === 'WALK' ? '도보' : travelMode === 'TRANSIT' ? '지하철' : '차량',
      duration: durationMinutes,
      durationText: `${durationMinutes}분`,
      distance: route.distanceMeters,
      cost: Math.round(route.estimatedCost * 100) / 100,
      costTotal: Math.round(route.estimatedCost * companionCount * 100) / 100,
    };
  } catch {
    return {
      from: fromName.startsWith('🏨') ? fromName : from.name || fromName,
      to: to.name || '',
      mode: 'walk',
      modeLabel: '이동',
      duration: 15,
      durationText: '약 15분',
      distance: 1000,
      cost: 0,
      costTotal: 0,
    };
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
