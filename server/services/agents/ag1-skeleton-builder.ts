/**
 * AG1: Skeleton Builder (뼈대 설계자)
 * 소요: 0.2~0.5초 (AI 호출 없음, 순수 계산)
 * 
 * 역할:
 * - 사용자 입력 파싱
 * - 일별 슬롯 수 계산 + 역할 배정
 * - AG2에 전달할 최적 프롬프트 구성
 * - 출력: AG1Output (일정표 뼈대)
 */

import {
  type AG1Output,
  type TripFormData,
  type TravelPace,
  type DaySlotConfig,
  PACE_CONFIG,
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
  getCompanionCount,
  calculateSlotsForDay,
  calculateDayCount,
} from './types';
import {
  getKoreanSentimentForCity,
  type KoreanSentimentData,
} from '../korean-sentiment-service';

/**
 * Vibe 가중치 계산 (사용자 선택 순서 = 우선순위)
 */
function calculateVibeWeights(selectedVibes: string[], _protagonist: string) {
  if (selectedVibes.length === 0) return [];
  const PRIORITY_WEIGHTS: Record<number, number[]> = {
    1: [100],
    2: [60, 40],
    3: [50, 30, 20],
  };
  const weights = PRIORITY_WEIGHTS[selectedVibes.length] || [50, 30, 20];
  return selectedVibes.map((vibe, index) => ({
    vibe: vibe as any,
    weight: weights[index] / 100,
    percentage: weights[index],
  }));
}

/**
 * AG1 메인: 사용자 입력으로 일정표 뼈대 생성
 */
export async function buildSkeleton(formData: TripFormData): Promise<AG1Output> {
  const _t0 = Date.now();

  const vibes = formData.vibes || ['Foodie', 'Culture', 'Healing'];
  const curationFocus = formData.curationFocus || 'Everyone';
  const vibeWeights = calculateVibeWeights(vibes, curationFocus);

  // 여행 밀도 (프론트엔드 기준 Normal, Moderate도 Normal로)
  let travelPace: TravelPace = (formData.travelPace as TravelPace) || 'Normal';
  if (travelPace === 'Moderate' as any) travelPace = 'Normal';

  const paceConfig = PACE_CONFIG[travelPace];
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);

  // 사용자 시간 기반 슬롯 계산
  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;

  const daySlotsConfig: DaySlotConfig[] = [];
  let totalRequiredPlaces = 0;

  for (let d = 1; d <= dayCount; d++) {
    let dayStart: string;
    let dayEnd: string;

    if (dayCount === 1) {
      dayStart = userStartTime;
      dayEnd = userEndTime;
    } else if (d === 1) {
      dayStart = userStartTime;
      dayEnd = DEFAULT_END_TIME;
    } else if (d === dayCount) {
      dayStart = DEFAULT_START_TIME;
      dayEnd = userEndTime;
    } else {
      dayStart = DEFAULT_START_TIME;
      dayEnd = DEFAULT_END_TIME;
    }

    const slots = calculateSlotsForDay(dayStart, dayEnd, travelPace);
    daySlotsConfig.push({ day: d, startTime: dayStart, endTime: dayEnd, slots });
    totalRequiredPlaces += slots;
  }

  const requiredPlaceCount = totalRequiredPlaces + 4; // 여유분
  const companionCount = getCompanionCount(formData.companionType || 'Solo');

  // 한국 감성 데이터 로드
  let koreanSentiment: KoreanSentimentData | undefined;
  try {
    koreanSentiment = await getKoreanSentimentForCity(formData.destination, vibes);
    console.log(`[AG1] 한국 감성 보너스: +${koreanSentiment.totalBonus.toFixed(2)}`);
  } catch (error) {
    console.warn('[AG1] 한국 감성 데이터 로드 실패:', error);
  }

  console.log(`[AG1] ===== 뼈대 생성 완료 (${Date.now() - _t0}ms) =====`);
  console.log(`[AG1] ${dayCount}일, ${totalRequiredPlaces}슬롯, 밀도: ${travelPace} (${paceConfig.slotDurationMinutes}분)`);
  daySlotsConfig.forEach(d => {
    console.log(`[AG1]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`);
  });

  return {
    formData,
    vibeWeights,
    travelPace,
    paceConfig,
    dayCount,
    daySlotsConfig,
    totalRequiredPlaces,
    requiredPlaceCount,
    companionCount,
    koreanSentiment,
  };
}
