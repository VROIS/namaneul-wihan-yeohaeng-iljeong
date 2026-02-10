/**
 * Pipeline V3: 2단계 일정 생성 파이프라인
 * 
 * 기존 4-Agent(AG1→AG2→AG3→AG4) 순차 구조 → 2단계 병렬 구조로 간소화
 * 
 * ┌─────────────────────────────────────────────────────────┐
 * │ Step 1: Gemini 완전 일정 생성 (3~5초)                   │
 * │   • 자연어 프롬프트 → 일차별/동선별 완전한 일정표        │
 * │   • 식사 배치, 동선 최적화, 시간 배분 모두 Gemini 처리   │
 * ├─────────────────────────────────────────────────────────┤
 * │ Step 2: 데이터 채우기 (2~4초, 전부 병렬)                │
 * │   • DB 매칭: places 테이블 → 사진, 점수, 좌표           │
 * │   • 가격: placePrices → 실제 입장료/식사비               │
 * │   • 한국 인기: naverBlogPosts → 한국인 선호도            │
 * │   • 실시간: 날씨, 환율, 위기경보, 이동시간               │
 * └─────────────────────────────────────────────────────────┘
 * 
 * 총 소요: 5~9초 (기존 12~18초 대비 50% 단축)
 */

import { GoogleGenAI } from "@google/genai";
import type { TripFormData, PlaceResult, DaySlotConfig, TravelPace, VibeWeight } from './types';
import {
  PACE_CONFIG, MEAL_BUDGET, DEFAULT_START_TIME, DEFAULT_END_TIME,
  calculateDayCount, calculateSlotsForDay, getCompanionCount,
} from './types';
import { preloadCityData, matchPlacesWithDB, saveNewPlacesToDB } from './ag3-data-matcher';
import { getKoreanSentimentForCity, type KoreanSentimentData } from '../korean-sentiment-service';
import { routeOptimizer } from '../route-optimizer';
import {
  calculateTransportPrice, shouldApplyGuidePrice, calculateUberBlackHourly,
  getGuidePerPersonPerDay, round2,
  type TransportPricingResult, type GuidePriceResult, type TransitPriceResult, type UberBlackComparison,
} from '../transport-pricing-service';
import { db } from '../../db';
import { exchangeRates, youtubePlaceMentions, youtubeVideos, youtubeChannels, naverBlogPosts, placePrices, places } from '@shared/schema';
import { eq, and, ilike, sql, desc } from 'drizzle-orm';
import { findCelebrityVisitsForPlaces, type CelebrityVisit } from '../celebrity-tracker';

// ===== TravelStyle 정규화 (소문자→표준형) =====
function normalizeTravelStyle(style?: string): TravelStyle {
  if (!style) return 'Reasonable';
  const map: Record<string, TravelStyle> = {
    luxury: 'Luxury', premium: 'Premium', reasonable: 'Reasonable', economic: 'Economic',
    Luxury: 'Luxury', Premium: 'Premium', Reasonable: 'Reasonable', Economic: 'Economic',
  };
  return map[style] || 'Reasonable';
}

// ===== Gemini 초기화 =====
let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

// ===== Gemini 응답 타입 =====
interface GeminiPlace {
  name: string;
  nameKo: string;
  type: 'activity' | 'lunch' | 'dinner' | 'cafe';
  startTime: string;
  endTime: string;
  reason: string;
  estimatedCostEur: number;
}

interface GeminiDay {
  day: number;
  theme: string;
  places: GeminiPlace[];
}

// =====================================================
// 메인 파이프라인
// =====================================================

export async function runPipelineV3(formData: TripFormData): Promise<any> {
  const _t0 = Date.now();
  const _timings: Record<string, number> = {};
  const _mark = (label: string) => { _timings[label] = Date.now() - _t0; };

  console.log(`\n[V3] ===== Pipeline V3 (2단계) 시작 =====`);

  // ===== 기본 계산 (AG1 역할 통합, <1ms) =====
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);
  let travelPace: TravelPace = (formData.travelPace as TravelPace) || 'Normal';
  if (travelPace === 'Moderate' as any) travelPace = 'Normal';
  const paceConfig = PACE_CONFIG[travelPace];
  const companionCount = getCompanionCount(formData.companionType || 'Solo');
  const vibes = formData.vibes || ['Foodie', 'Culture', 'Healing'];

  // Vibe 가중치 계산
  const PRIORITY_WEIGHTS: Record<number, number[]> = { 1: [100], 2: [60, 40], 3: [50, 30, 20] };
  const weights = PRIORITY_WEIGHTS[vibes.length] || [50, 30, 20];
  const vibeWeights: VibeWeight[] = vibes.map((vibe, i) => ({
    vibe: vibe as any,
    weight: weights[i] / 100,
    percentage: weights[i],
  }));

  // 일별 슬롯 계산
  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;
  const daySlotsConfig: DaySlotConfig[] = [];

  for (let d = 1; d <= dayCount; d++) {
    let dayStart = DEFAULT_START_TIME;
    let dayEnd = DEFAULT_END_TIME;
    if (dayCount === 1) { dayStart = userStartTime; dayEnd = userEndTime; }
    else if (d === 1) { dayStart = userStartTime; }
    else if (d === dayCount) { dayEnd = userEndTime; }

    const slots = calculateSlotsForDay(dayStart, dayEnd, travelPace);
    daySlotsConfig.push({ day: d, startTime: dayStart, endTime: dayEnd, slots });
  }

  const totalSlots = daySlotsConfig.reduce((sum, d) => sum + d.slots, 0);
  console.log(`[V3] ${dayCount}일, 총 ${totalSlots}슬롯, 밀도: ${travelPace} (${paceConfig.slotDurationMinutes}분/장소)`);
  daySlotsConfig.forEach(d => console.log(`[V3]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`));

  // ===== Step 1 (Gemini) + DB 사전 로드 + 한국 감성: 모두 병렬 =====
  console.log(`[V3] Step1(Gemini) + DB사전로드 + 한국감성 병렬 시작...`);

  const [geminiDays, preloaded, koreanSentiment] = await Promise.all([
    step1_geminiItinerary(formData, dayCount, daySlotsConfig, vibeWeights),
    preloadCityData(formData.destination),
    getKoreanSentimentForCity(formData.destination, vibes).catch(() => undefined),
  ]);

  _mark('step1_parallel');
  console.log(`[V3] Step1 완료 (${_timings['step1_parallel']}ms): Gemini ${geminiDays.length}일, DB ${preloaded.dbPlacesMap.size}키`);

  // ===== Step 2: 데이터 채우기 =====
  const result = await step2_enrichAndBuild(
    geminiDays, formData, preloaded, daySlotsConfig,
    dayCount, companionCount, travelPace, paceConfig, vibeWeights, koreanSentiment,
  );

  _mark('step2_enrich');

  // 타이밍 정보 추가
  result.metadata = {
    ...result.metadata,
    _timings,
    _totalMs: Date.now() - _t0,
    _pipelineVersion: 'v3-2step',
  };

  console.log(`[V3] ===== Pipeline V3 완료 (${Date.now() - _t0}ms) =====`);
  console.log(`[V3]   Step1(Gemini+DB): ${_timings['step1_parallel']}ms`);
  console.log(`[V3]   Step2(채우기): ${_timings['step2_enrich'] - _timings['step1_parallel']}ms`);

  return result;
}

// =====================================================
// Step 1: Gemini 완전 일정 생성
// =====================================================

async function step1_geminiItinerary(
  formData: TripFormData,
  dayCount: number,
  daySlotsConfig: DaySlotConfig[],
  vibeWeights: VibeWeight[],
): Promise<GeminiDay[]> {
  const _t0 = Date.now();
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];

  // ===== 사용자 입력 9가지를 자연어로 상세 평문화 =====

  // ① 생년월일 → 나이 계산
  let ageDesc = '';
  if (formData.birthDate) {
    const birth = new Date(formData.birthDate);
    const age = new Date().getFullYear() - birth.getFullYear();
    ageDesc = `${age}세`;
  }

  // ② 동행 유형
  const companionTypeKo: Record<string, string> = {
    Solo: '혼자', Single: '혼자',
    Couple: '연인/부부 둘이',
    Family: '가족과 함께',
    ExtendedFamily: '대가족(조부모 포함)',
    Group: '친구/단체',
  };
  const companionDesc = companionTypeKo[formData.companionType || 'Couple'] || formData.companionType;

  // ③ 동행 인원
  const headcount = formData.companionCount || 2;

  // ④ 동행 연령대
  let agesDesc = '';
  if (formData.companionAges) {
    agesDesc = `동행자 연령: ${formData.companionAges}`;
  }

  // ⑤ 큐레이션 초점
  const focusKo: Record<string, string> = {
    Kids: '아이들이 즐길 수 있는 곳 중심 (놀이·체험·아이스크림)',
    Parents: '부모님이 편안한 곳 중심 (걷기 쉬운·쉼터·전통)',
    Everyone: '모든 연령이 함께 즐기는 곳 (균형있게)',
    Self: '나 자신을 위한 힐링·취향 코스',
  };
  const focusDesc = focusKo[formData.curationFocus || 'Everyone'] || '모든 연령이 함께 즐기는 곳';

  // ⑥ 여행지 (destination) - 직접 사용

  // ⑦ 여행 기간
  const startDate = formData.startDate;
  const endDate = formData.endDate;

  // ⑧ 바이브 (Vibes) - 자연어 변환
  const vibeKo: Record<string, string> = {
    Healing: '힐링·휴식 (조용한 정원, 카페, 산책)',
    Adventure: '모험·액티비티 (체험, 야외활동)',
    Hotspot: '핫스팟·SNS (인스타 명소, 트렌디한 곳)',
    Foodie: '미식·맛집 (현지 음식, 로컬 레스토랑)',
    Romantic: '로맨틱·감성 (야경, 커플 명소)',
    Culture: '문화·역사 (미술관, 박물관, 유적지)',
  };
  const vibeNatural = vibeWeights
    .map(v => `${vibeKo[v.vibe] || v.vibe} ${v.percentage}%`)
    .join(', ');

  // ⑨ 여행 스타일 (예산)
  const styleKo: Record<string, string> = {
    Economic: '알뜰하게 (저예산, 길거리음식·무료명소 위주)',
    Reasonable: '적정하게 (가성비 맛집, 합리적 예산)',
    Premium: '프리미엄 (미쉐린·파인다이닝, 좋은 레스토랑)',
    Luxury: '럭셔리 (최고급, 가격 무관)',
  };
  const styleDesc = styleKo[formData.travelStyle || 'Reasonable'] || '적정하게';

  // 추가: 이동방식
  const mobilityKo: Record<string, string> = {
    WalkMore: '많이 걷기 (도보 + 대중교통, 골목골목 탐방)',
    Moderate: '적당히 (대중교통 위주, 먼 거리는 우버)',
    Minimal: '이동 최소화 (전용차량/택시, 편하게)',
  };
  const mobilityDesc = mobilityKo[formData.mobilityStyle || 'Moderate'] || '적당히';

  // 추가: 여행 밀도
  const paceKo = formData.travelPace === 'Packed' ? '빡빡하게 (장소당 90분, 알차게)'
    : formData.travelPace === 'Relaxed' ? '여유롭게 (장소당 150분, 느긋하게)'
    : '보통 속도 (장소당 120분)';

  // 일별 요구사항 (식사 시간 제약 자동 계산)
  const dayRequirements = daySlotsConfig.map(d => {
    const startH = parseInt(d.startTime.split(':')[0]);
    const endH = parseInt(d.endTime.split(':')[0]);
    // 점심: 가용시간에 12:00~13:30 포함되면
    const hasLunchWindow = startH <= 12 && endH >= 13;
    // 저녁: 가용시간에 18:30~20:00 포함되면
    const hasDinnerWindow = startH <= 18 && endH >= 20;
    const mealCount = (hasLunchWindow ? 1 : 0) + (hasDinnerWindow ? 1 : 0);
    const activityCount = Math.max(0, d.slots - mealCount);

    let mealNote = '';
    if (hasLunchWindow && hasDinnerWindow) {
      mealNote = '점심 12:00~13:30 사이 배치, 저녁 18:30~20:00 사이 배치';
    } else if (hasLunchWindow) {
      mealNote = '점심 12:00~13:30 사이 배치 (저녁 시간 없음)';
    } else if (hasDinnerWindow) {
      mealNote = '저녁 18:30~20:00 사이 배치 (점심 시간 없음)';
    } else {
      mealNote = '식사 시간 범위 밖 — 카페/간식만';
    }

    return `Day ${d.day}: ${d.startTime} 출발 ~ ${d.endTime} 마무리, 총 ${d.slots}곳 (관광 ${activityCount} + 식사 ${mealCount}) → ${mealNote}`;
  }).join('\n');

  // ===== 자연어 프롬프트 조합 =====
  const prompt = `당신은 한국인 관광객 전문 여행 플래너입니다.
아래 여행자의 요구사항을 바탕으로 ${formData.destination} ${dayCount}일 완전한 일정을 만들어주세요.

[여행자 프로필]
${ageDesc ? `• ${ageDesc} 여행자가` : '• 여행자가'} ${companionDesc} ${headcount}명이 ${formData.destination}에 갑니다.
${agesDesc ? `• ${agesDesc}` : ''}
• 큐레이션: ${focusDesc}
• 기간: ${startDate} ~ ${endDate} (${dayCount}일)
• 분위기: ${vibeNatural}
• 예산: ${styleDesc} — 점심 1인 ~€${mealBudget.lunch}, 저녁 1인 ~€${mealBudget.dinner}
• 이동: ${mobilityDesc}
• 속도: ${paceKo}

[일별 스케줄]
${dayRequirements}

[필수 규칙]
1. 장소명은 반드시 Google Maps에서 검색 가능한 영어 공식명 사용
2. 식사 배치: 점심(type:"lunch")은 반드시 12:00~13:30에, 저녁(type:"dinner")은 18:30~20:00에 시작해야 함. 해당 시간대가 가용시간에 없으면 그 식사는 생략. 점심→저녁 간격 최소 4시간
3. 동선 최적화: 가까운 장소끼리 묶고, 왔다갔다 하지 않게 순서 배치
4. 시간은 현실적으로 (겹치지 않게, 이동시간 고려)
5. estimatedCostEur = 1인당 입장료(EUR). 무료면 0, 식당은 1인 식사비
6. 현지인이 가는 진짜 맛집 추천 (관광객 덫 피하기)
7. 실제 존재하고 현재 영업 중인 곳만
8. nameKo = 한국어 장소명
9. reason = 왜 이 장소를 추천하는지 한국어로 (여행자 프로필 반영)

JSON만 응답하세요 (마크다운/설명 없이):
{"days":[{"day":1,"theme":"테마 한국어","places":[{"name":"Official English Name","nameKo":"한국어 이름","type":"activity","startTime":"09:00","endTime":"11:00","reason":"한국어 추천 이유","estimatedCostEur":0}]}]}`;

  try {
    console.log(`[V3-Step1] 🤖 Gemini에 ${dayCount}일 완전 일정 요청 (${prompt.length}자)...`);

    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    let text = response.text || "";
    const finishReason = (response as any).candidates?.[0]?.finishReason || 'unknown';
    console.log(`[V3-Step1] 🤖 응답 수신 (${text.length}자, finish=${finishReason}, ${Date.now() - _t0}ms)`);

    if (text.length < 100) {
      console.warn(`[V3-Step1] ⚠️ 짧은 응답: ${text}`);
    }

    // ── Markdown code fence 제거 ──
    // Gemini가 ```json ... ``` 으로 감싸서 응답하는 경우 처리
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[V3-Step1] ❌ JSON 블록 없음');
      console.error('[V3-Step1] 원문 앞 200자:', text.substring(0, 200));
      return [];
    }

    let result: any;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr: any) {
      console.warn(`[V3-Step1] ⚠️ JSON 파싱 오류 (${parseErr.message}), 복구 시도...`);
      // 디버그: 파싱 실패 위치 근처 출력
      const pos = parseInt(String(parseErr.message).match(/position (\d+)/)?.[1] || '0');
      if (pos > 0) {
        console.warn(`[V3-Step1] 오류 위치 주변: ...${jsonMatch[0].substring(Math.max(0, pos - 50), pos + 50)}...`);
      }
      result = repairTruncatedJSON(jsonMatch[0]);
      if (!result) {
        console.error('[V3-Step1] ❌ JSON 복구 실패');
        return [];
      }
      console.log(`[V3-Step1] ✅ JSON 복구 성공: ${result.days?.length || 0}일`);
    }

    const days: GeminiDay[] = result.days || [];

    if (days.length === 0) {
      console.warn('[V3-Step1] ⚠️ Gemini가 0일 반환');
      return [];
    }

    // 검증: 각 일의 장소 수/식사 체크
    for (const day of days) {
      const hasLunch = day.places?.some(p => p.type === 'lunch');
      const hasDinner = day.places?.some(p => p.type === 'dinner');
      const placeCount = day.places?.length || 0;
      if (!hasLunch) console.warn(`[V3-Step1] ⚠️ Day ${day.day} 점심 없음`);
      if (!hasDinner) console.warn(`[V3-Step1] ⚠️ Day ${day.day} 저녁 없음`);
      console.log(`[V3-Step1]   Day ${day.day} "${day.theme}": ${placeCount}곳 (🍽️${day.places?.filter(p => p.type === 'lunch' || p.type === 'dinner').length || 0}식사)`);
    }

    console.log(`[V3-Step1] ✅ Gemini ${days.length}일 완전 일정 생성 (${Date.now() - _t0}ms)`);
    return days;
  } catch (error: any) {
    if (error.message === 'GEMINI_API_KEY_MISSING') throw error;
    console.error(`[V3-Step1] ❌ Gemini 실패: ${error?.message}`);
    return [];
  }
}

// =====================================================
// Step 2: 데이터 채우기 + 최종 빌드
// =====================================================

async function step2_enrichAndBuild(
  geminiDays: GeminiDay[],
  formData: TripFormData,
  preloaded: Awaited<ReturnType<typeof preloadCityData>>,
  daySlotsConfig: DaySlotConfig[],
  dayCount: number,
  companionCount: number,
  travelPace: TravelPace,
  paceConfig: { slotDurationMinutes: number; maxSlotsPerDay: number },
  vibeWeights: VibeWeight[],
  koreanSentiment?: KoreanSentimentData,
): Promise<any> {
  const _t0 = Date.now();

  // ── 2a. Gemini 장소 → PlaceResult 변환 ──
  const allPlaces: PlaceResult[] = [];
  const scheduleMap: { day: number; gPlace: GeminiPlace; placeId: string }[] = [];

  for (const gDay of geminiDays) {
    if (!gDay.places) continue;
    for (const gPlace of gDay.places) {
      const isMeal = gPlace.type === 'lunch' || gPlace.type === 'dinner';
      const placeId = `v3-d${gDay.day}-${allPlaces.length}`;
      const place: PlaceResult = {
        id: placeId,
        name: gPlace.name || 'Unknown Place',
        description: gPlace.reason || '',
        lat: 0,
        lng: 0,
        vibeScore: 7,
        confidenceScore: 5,
        sourceType: 'Gemini V3',
        personaFitReason: gPlace.reason || 'AI 추천 장소',
        tags: isMeal ? ['restaurant', 'food'] : [],
        vibeTags: isMeal ? ['Foodie' as const] : [],
        image: '',
        priceEstimate: gPlace.estimatedCostEur > 0 ? `€${gPlace.estimatedCostEur}` : '무료',
        placeTypes: isMeal ? ['restaurant'] : ['tourist_attraction'],
        recommendedTime: gPlace.startTime < '12:00' ? 'morning' : gPlace.startTime < '17:00' ? 'afternoon' : 'evening',
        city: formData.destination,
        koreanPopularityScore: 0,
        googleMapsUrl: '',
        estimatedPriceEur: gPlace.estimatedCostEur || 0,
      };
      allPlaces.push(place);
      scheduleMap.push({ day: gDay.day, gPlace, placeId });
    }
  }

  console.log(`[V3-Step2] ${allPlaces.length}곳 PlaceResult 변환 완료`);

  // ── 2b. DB 매칭 (좌표, 사진, 점수 보강) ──
  const matchedPlaces = await matchPlacesWithDB(allPlaces, preloaded);
  const matchedMap = new Map<string, PlaceResult>();
  for (const mp of matchedPlaces) {
    matchedMap.set(mp.id, mp);
  }
  console.log(`[V3-Step2] DB 매칭 완료 (${Date.now() - _t0}ms)`);

  // ── 2c. Enrichment 3종 + 환율 + 날씨 + 교통비: 전부 병렬 ──
  const enrichFns = await getEnrichmentFunctions();

  // 💡 가용시간 자동 계산 (startTime~endTime, 기본 8시간)
  const startH = parseInt((formData.startTime || '09:00').split(':')[0]);
  const startM = parseInt((formData.startTime || '09:00').split(':')[1] || '0');
  const endH = parseInt((formData.endTime || '18:00').split(':')[0]);
  const endM = parseInt((formData.endTime || '18:00').split(':')[1] || '0');
  const availableHours = Math.max(4, round2((endH * 60 + endM - startH * 60 - startM) / 60));
  console.log(`[V3-Step2] 가용시간: ${availableHours}h (${formData.startTime || '09:00'}~${formData.endTime || '18:00'})`);

  // 카테고리 판별 (사용자의 첫 입력 기반)
  const isGuideCategory = shouldApplyGuidePrice(
    (formData.mobilityStyle || 'Moderate') as any,
    (formData.travelStyle || 'Reasonable') as any,
  );
  console.log(`[V3-Step2] 📍 교통 카테고리: ${isGuideCategory ? 'A (드라이빙 가이드)' : 'B (대중교통)'}`);

  const [enrichedKorean, enrichedTA, enrichedPhoto, eurToKrw, realityCheck, transportPrice] = await Promise.all([
    enrichFns.enrichPlacesWithKoreanPopularity(matchedPlaces, preloaded.cityName),
    enrichFns.enrichPlacesWithTripAdvisorAndPrices(matchedPlaces, preloaded.cityName),
    enrichFns.enrichPlacesWithPhotoAndTour(matchedPlaces, preloaded.cityName),
    getEurToKrwRate(),
    enrichFns.getRealityCheckForCity(formData.destination),
    // 💰 교통비 산정 (카테고리 자동 분류: 가이드 vs 대중교통)
    calculateTransportPrice({
      companionType: (formData.companionType || 'Couple') as any,
      companionCount,
      mobilityStyle: (formData.mobilityStyle || 'Moderate') as any,
      travelStyle: (formData.travelStyle || 'Reasonable') as any,
      availableHours,
      dayCount,
      isRegionalTravel: false, // TODO: 일별 판단 후 적용
    }).catch(err => {
      console.warn('[V3] 교통비 산정 실패, 기본값 사용:', err);
      return null;
    }),
  ]);

  console.log(`[V3-Step2] Enrichment 6종 병렬 완료 (${Date.now() - _t0}ms)`);
  if (transportPrice) {
    console.log(`[V3-Step2] 💰 교통비: 카테고리 ${transportPrice.category} | 1인/일 €${transportPrice.perPersonPerDay}`);
  }

  // ── 2d. Enrichment 결과 병합 + 셀럽 방문 검색 + nubiReason 생성 ──

  // 🌟 셀럽 TOP 10 방문 흔적 검색 (Gemini 웹검색, 병렬)
  const celebrityVisits = await findCelebrityVisitsForPlaces(
    matchedPlaces.map(p => ({ id: p.id, name: p.name })),
    preloaded.cityName,
  ).catch(err => {
    console.warn('[V3] 셀럽 검색 실패, 건너뜀:', err);
    return new Map<string, CelebrityVisit>();
  });

  // 각 장소별 nubiReason 데이터 수집 (DB 조회 포함, 병렬)
  const finalPlaces = await Promise.all(matchedPlaces.map(async (p, i) => {
    const kr = enrichedKorean[i];
    const ta = enrichedTA[i];
    const ph = enrichedPhoto[i];

    const merged = {
      ...p,
      // 한국인 인기도
      koreanPopularityScore: kr?.koreanPopularityScore ?? p.koreanPopularityScore,
      // TripAdvisor + 가격
      tripAdvisorRating: ta?.tripAdvisorRating ?? p.tripAdvisorRating,
      tripAdvisorReviewCount: ta?.tripAdvisorReviewCount ?? p.tripAdvisorReviewCount,
      tripAdvisorRanking: ta?.tripAdvisorRanking ?? p.tripAdvisorRanking,
      estimatedPriceEur: ta?.estimatedPriceEur ?? p.estimatedPriceEur,
      priceSource: ta?.priceSource ?? p.priceSource,
      priceEstimate: ta?.priceEstimate ?? p.priceEstimate,
      vibeScore: Math.max(p.vibeScore, ta?.vibeScore ?? 0),
      // 포토스팟/패키지 투어
      photoSpotScore: ph?.photoSpotScore ?? p.photoSpotScore,
      photoTip: ph?.photoTip ?? p.photoTip,
      bestPhotoTime: ph?.bestPhotoTime ?? p.bestPhotoTime,
      isPackageTourIncluded: ph?.isPackageTourIncluded ?? p.isPackageTourIncluded,
      packageMentionCount: ph?.packageMentionCount ?? p.packageMentionCount,
      packageMentionedBy: (ph as any)?.packageMentionedBy,
      // 한국 감성 보너스
      ...(koreanSentiment ? {
        vibeScore: Math.min(10, (Math.max(p.vibeScore, ta?.vibeScore ?? 0)) + (koreanSentiment.totalBonus || 0) * 0.3),
      } : {}),
    };

    // ⭐ nubiReason: 순차 검색 — 찾으면 멈추고 구체적 이름+날짜 표시
    merged.nubiReason = await generateNubiReasonV2(
      p.id, p.name, preloaded.cityName,
      celebrityVisits.get(p.id) || null,
      merged,
    );

    return merged;
  }));

  // 최종 장소 맵
  const finalPlaceMap = new Map<string, PlaceResult>();
  for (const fp of finalPlaces) {
    finalPlaceMap.set(fp.id, fp);
  }

  // ── 2e. 일별 스케줄 구성 + 이동시간 계산 ──
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];
  // 교통 카테고리에 따라 이동 모드 결정
  // A카테고리(가이드) → DRIVE, B카테고리(대중교통) → TRANSIT/WALK
  const travelMode = isGuideCategory ? 'DRIVE' as const
    : formData.mobilityStyle === 'WalkMore' ? 'WALK' as const
    : 'TRANSIT' as const;

  const days: any[] = [];
  let totalTripCostEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find(c => c.day === d)!;

    // 이 날의 스케줄
    const dayScheduleItems = scheduleMap.filter(s => s.day === d);
    const dayPlaces = dayScheduleItems.map(s => {
      const enrichedPlace = finalPlaceMap.get(s.placeId) || matchedMap.get(s.placeId)!;
      const isMeal = s.gPlace.type === 'lunch' || s.gPlace.type === 'dinner';
      // 프론트 전달 시 불필요한 0값 필드 제거 (React Native에서 {0}이 "0" 텍스트로 표시되는 문제 방지)
      const { finalScore, buzzScore, ...safePlace } = enrichedPlace as any;
      return {
        ...safePlace,
        // 0이 아닌 경우만 포함
        ...(finalScore ? { finalScore } : {}),
        ...(buzzScore ? { buzzScore } : {}),
        // Gemini가 정한 시간
        startTime: s.gPlace.startTime,
        endTime: s.gPlace.endTime,
        // 식사 정보
        isMealSlot: isMeal,
        mealType: s.gPlace.type === 'lunch' ? 'lunch' as const : s.gPlace.type === 'dinner' ? 'dinner' as const : undefined,
        mealPrice: isMeal ? (s.gPlace.type === 'lunch' ? mealBudget.lunch : mealBudget.dinner) : undefined,
        mealPriceLabel: isMeal ? (s.gPlace.type === 'lunch' ? mealBudget.lunchLabel : mealBudget.dinnerLabel) : undefined,
        // Gemini의 한국어 이름 + 추천이유
        nameKo: s.gPlace.nameKo,
        // ⭐ nubiReason: 우리 데이터 기반 차별화 선정이유 (크게/진하게 표시)
        nubiReason: enrichedPlace.nubiReason || null,
        // Gemini AI 요약 (보통 글씨로 표시)
        geminiReason: s.gPlace.reason || '',
        // 부가 정보
        selectionReasons: enrichedPlace.selectionReasons || [],
        confidenceLevel: enrichedPlace.confidenceLevel || 'medium',
        realityCheck,
      };
    });

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
    } else if (dayPlaces.length > 0 && dayPlaces[0].lat && dayPlaces[0].lng) {
      accommodationCoords = { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng };
      accommodationName = '도심 기준';
    }

    // ── 이동 구간 병렬 계산 (카테고리 무관하게 항상 계산 - 거리/시간 데이터 필요) ──
    const transitPromises: Promise<any>[] = [];

    // 숙소 → 첫 장소
    if (accommodationCoords && dayPlaces.length > 0) {
      transitPromises.push(
        calcTransit(accommodationCoords, `🏨 ${accommodationName}`, dayPlaces[0], travelMode, companionCount)
      );
    }

    // 장소 간 이동 (연속)
    for (let i = 0; i < dayPlaces.length - 1; i++) {
      transitPromises.push(
        calcTransit(dayPlaces[i], dayPlaces[i].name, dayPlaces[i + 1], travelMode, companionCount)
      );
    }

    // 마지막 장소 → 숙소
    if (accommodationCoords && dayPlaces.length > 0) {
      const last = dayPlaces[dayPlaces.length - 1];
      transitPromises.push(
        calcTransit(
          last, last.name,
          { lat: accommodationCoords.lat, lng: accommodationCoords.lng, name: `🏨 ${accommodationName}`, id: 'accommodation' } as any,
          travelMode, companionCount,
        )
      );
    }

    // 전부 병렬 실행
    const allTransitResults = await Promise.all(transitPromises);

    // Transit 분리
    let tIdx = 0;
    const departureTransit = accommodationCoords && dayPlaces.length > 0 ? allTransitResults[tIdx++] : undefined;
    const betweenTransits: any[] = [];
    for (let i = 0; i < dayPlaces.length - 1; i++) {
      betweenTransits.push(allTransitResults[tIdx++]);
    }
    const returnTransit = accommodationCoords && dayPlaces.length > 0 ? allTransitResults[tIdx++] : undefined;

    const allTransits = [
      ...(departureTransit ? [departureTransit] : []),
      ...betweenTransits,
      ...(returnTransit ? [returnTransit] : []),
    ];

    // ═══════════════════════════════════════════════════════════════════
    // 💰 카테고리별 교통비 + 이동 표시 분기 (마케팅 핵심)
    // ═══════════════════════════════════════════════════════════════════

    let displayTransits: any[];        // 프론트엔드에 보여줄 이동 정보
    let transportPerPersonPerDay = 0;  // 1인 1일 교통비
    let transportDisplay: any = null;  // 교통비 표시 데이터

    if (isGuideCategory) {
      // ── 카테고리 A: 드라이빙 가이드 ──
      // 구간별 이동: 전부 "전용차량이동"으로 덮어쓰기
      displayTransits = allTransits.map(t => ({
        from: t.from,
        to: t.to,
        mode: 'guide',
        modeLabel: '전용차량이동',
        duration: t.duration,
        durationText: `${t.duration}분`,
        distance: t.distance,
        cost: 0,       // 구간별 비용 안 보여줌
        costTotal: 0,  // 구간별 비용 안 보여줌
      }));

      // 1인 1일 가이드 가격
      const guidePP = transportPrice?.category === 'guide'
        ? (transportPrice as GuidePriceResult).perPersonPerDay
        : 0;
      transportPerPersonPerDay = guidePP;

      // 우버블랙 비교: 실제 경로 + 좌표 없는 구간 추정값 포함
      // ⚠️ 좌표 0,0인 구간도 도시 내 평균 이동거리(3km, 12분)로 추정
      //     → 가이드와 동일 조건 비교를 위해 모든 구간을 포함해야 함
      const CITY_AVG_SEGMENT_KM = 3.0;  // 도시 내 평균 구간 이동거리
      const CITY_AVG_SEGMENT_MIN = 12;  // 도시 내 평균 구간 이동시간

      const routeSegments = allTransits.map(t => {
        const hasRealData = t.distance > 0 && t.duration > 0;
        return {
          distanceKm: hasRealData ? round2((t.distance || 0) / 1000) : CITY_AVG_SEGMENT_KM,
          durationMin: hasRealData ? (t.duration || 0) : CITY_AVG_SEGMENT_MIN,
        };
      });

      // ⭐ 우버블랙 시간제 비교: 가이드와 동일 조건 (가용시간 풀, 대기 포함)
      const uberBlackComp = routeSegments.length > 0
        ? calculateUberBlackHourly(availableHours, routeSegments, companionCount)
        : null;

      transportDisplay = {
        category: 'guide' as const,
        perPersonPerDay: guidePP,
        perPersonPerDayKrw: Math.round(guidePP * eurToKrw),
        // 우버블랙 비교 (마케팅: 가이드가 더 저렴한 걸 보여줌)
        uberBlackComparison: uberBlackComp ? {
          perPersonPerDay: uberBlackComp.perPersonPerDay,
          perPersonPerDayKrw: Math.round(uberBlackComp.perPersonPerDay * eurToKrw),
          totalDistanceKm: uberBlackComp.totalDistanceKm,
          totalDurationMin: uberBlackComp.totalDurationMin,
        } : null,
        vehicleDescription: transportPrice?.category === 'guide'
          ? (transportPrice as GuidePriceResult).vehicleDescription : '전용 차량',
        notes: transportPrice?.notes || [],
      };

      console.log(`[V3-Day${d}] 🚗 가이드 1인/일 €${guidePP} | 우버블랙 1인/일 €${uberBlackComp?.perPersonPerDay || '?'}`);
    } else {
      // ── 카테고리 B: 대중교통 ──
      // 구간별 이동: 상세 그대로 (도보/메트로/버스 - 실시간 실제 가격)
      displayTransits = allTransits;

      // 1인 1일 대중교통 가격
      const transitPP = transportPrice?.category === 'transit'
        ? (transportPrice as TransitPriceResult).perPersonPerDay
        : 0;
      transportPerPersonPerDay = transitPP;

      // 업셀: 가이드 이용시 가격 (클릭 가능)
      const guideUpsell = transportPrice?.category === 'transit'
        ? (transportPrice as TransitPriceResult).guideUpsell
        : null;

      transportDisplay = {
        category: 'transit' as const,
        perPersonPerDay: transitPP,
        perPersonPerDayKrw: Math.round(transitPP * eurToKrw),
        method: transportPrice?.category === 'transit'
          ? (transportPrice as TransitPriceResult).method : '대중교통',
        details: transportPrice?.category === 'transit'
          ? (transportPrice as TransitPriceResult).details : '',
        // 업셀: 가이드 이용시 (클릭 가능)
        guideUpsell: guideUpsell ? {
          perPersonPerDay: guideUpsell.perPersonPerDay,
          perPersonPerDayKrw: Math.round(guideUpsell.perPersonPerDay * eurToKrw),
          vehicleDescription: guideUpsell.vehicleDescription,
          clickable: true,
        } : null,
        notes: transportPrice?.notes || [],
      };

      console.log(`[V3-Day${d}] 🚇 대중교통 1인/일 €${transitPP} | 가이드 업셀 1인/일 €${guideUpsell?.perPersonPerDay || '?'}`);
    }

    // ── 일일 비용 계산 (1인 기준) ──
    const mealCostEur = dayPlaces.reduce((sum: number, p: any) =>
      p.isMealSlot && p.mealPrice ? sum + p.mealPrice : sum, 0);
    const entranceFeesEur = dayPlaces.reduce((sum: number, p: any) => {
      // 식사 슬롯 제외, 비정상 가격(€500 초과) 필터
      if (!p.isMealSlot && p.estimatedPriceEur && p.estimatedPriceEur > 0 && p.estimatedPriceEur < 500) {
        return sum + p.estimatedPriceEur;
      }
      return sum;
    }, 0);

    // 1인 1일 비용 합산 (식사 + 입장료는 이미 1인 기준)
    const mealPerPerson = mealCostEur;  // Gemini가 1인 기준 추천
    const entrancePerPerson = entranceFeesEur;  // 입장료도 1인
    const dailyPerPersonEur = round2(mealPerPerson + entrancePerPerson + transportPerPersonPerDay);
    const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);

    totalTripCostEur += dailyPerPersonEur;

    // 좌표 검증
    const invalidCoords = dayPlaces.filter((p: any) => !isValidCoord(p.lat, p.lng)).length;
    if (invalidCoords > 0) {
      console.warn(`[V3] ⚠️ Day ${d}: ${invalidCoords}곳 좌표 무효`);
    }

    // Gemini 테마 가져오기
    const geminiDay = geminiDays.find(g => g.day === d);

    days.push({
      day: d,
      places: dayPlaces,
      city: formData.destination,
      summary: geminiDay?.theme || `${formData.destination} Day ${d}`,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      accommodation: accommodationCoords ? {
        day: d,
        name: accommodationName,
        address: accommodationAddress,
        coords: accommodationCoords,
      } : undefined,
      departureTransit: isGuideCategory
        ? (departureTransit ? { ...departureTransit, mode: 'guide', modeLabel: '전용차량이동', cost: 0, costTotal: 0 } : undefined)
        : departureTransit,
      returnTransit: isGuideCategory
        ? (returnTransit ? { ...returnTransit, mode: 'guide', modeLabel: '전용차량이동', cost: 0, costTotal: 0 } : undefined)
        : returnTransit,
      transit: {
        transits: displayTransits,
        totalDuration: allTransits.reduce((sum: number, t: any) => sum + t.duration, 0),
        totalDistanceKm: round2(allTransits.reduce((sum: number, t: any) => sum + ((t.distance || 0) / 1000), 0)),
      },
      // 💰 일일 비용 (1인 기준 - OTA 방식)
      dailyCost: {
        perPersonEur: dailyPerPersonEur,
        perPersonKrw: dailyPerPersonKrw,
        breakdown: {
          mealEur: mealPerPerson,
          entranceEur: entrancePerPerson,
          transportEur: transportPerPersonPerDay,
        },
      },
      // 💰 교통비 표시 (카테고리별 분기)
      transportDisplay,
    });
  }

  // ── 총 여행 비용 (1인 기준 - OTA 방식) ──
  // totalTripCostEur는 이미 1인 기준으로 합산됨
  const totalPerPersonEur = round2(totalTripCostEur);
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);
  const perPersonPerDay = dayCount > 0 ? round2(totalPerPersonEur / dayCount) : 0;

  console.log(`[V3-Step2] ✅ 완료 (${Date.now() - _t0}ms): ${days.length}일`);
  console.log(`[V3-Step2] 💰 1인 총 비용: €${totalPerPersonEur} / ₩${totalPerPersonKrw.toLocaleString()}`);
  console.log(`[V3-Step2] 💰 1인 1일 평균: €${perPersonPerDay}`);

  // 백그라운드: 미등록 장소 DB 저장
  saveNewPlacesToDB(finalPlaces, preloaded.cityId);

  // ── 최종 응답 빌드 (프론트엔드 호환 형식) ──
  const paceLabel = travelPace === 'Packed' ? '빡빡하게' : travelPace === 'Normal' ? '보통' : '여유롭게';

  // 교통비 요약 (카테고리별)
  const transportSummary = transportPrice ? (() => {
    if (transportPrice.category === 'guide') {
      const gp = transportPrice as GuidePriceResult;
      return {
        category: 'guide' as const,
        perPersonPerDay: gp.perPersonPerDay,
        perPersonPerDayKrw: Math.round(gp.perPersonPerDay * eurToKrw),
        perPersonTotal: round2(gp.perPersonPerDay * dayCount),
        perPersonTotalKrw: Math.round(gp.perPersonPerDay * dayCount * eurToKrw),
        vehicleDescription: gp.vehicleDescription,
        availableHours: gp.availableHours,
        includes200km: gp.includes200km,
        segmentLabel: gp.segmentLabel,
        notes: gp.notes,
      };
    } else {
      const tp = transportPrice as TransitPriceResult;
      return {
        category: 'transit' as const,
        perPersonPerDay: tp.perPersonPerDay,
        perPersonPerDayKrw: Math.round(tp.perPersonPerDay * eurToKrw),
        perPersonTotal: round2(tp.perPersonPerDay * dayCount),
        perPersonTotalKrw: Math.round(tp.perPersonPerDay * dayCount * eurToKrw),
        method: tp.method,
        details: tp.details,
        guideUpsell: {
          perPersonPerDay: tp.guideUpsell.perPersonPerDay,
          perPersonPerDayKrw: Math.round(tp.guideUpsell.perPersonPerDay * eurToKrw),
          vehicleDescription: tp.guideUpsell.vehicleDescription,
          clickable: true,
        },
        notes: tp.notes,
      };
    }
  })() : null;

  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || DEFAULT_START_TIME,
    endTime: formData.endTime || DEFAULT_END_TIME,
    days,
    vibeWeights,
    koreanSentimentBonus: koreanSentiment?.totalBonus || 0,
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    // 💰 비용 (모두 1인 기준 - OTA 방식)
    totalCost: {
      perPersonEur: totalPerPersonEur,
      perPersonKrw: totalPerPersonKrw,
      perPersonPerDay: perPersonPerDay,
      perPersonPerDayKrw: Math.round(perPersonPerDay * eurToKrw),
      eurToKrwRate: eurToKrw,
      currency: 'EUR',
    },
    budget: {
      travelStyle: formData.travelStyle || 'Reasonable',
      dailyBreakdowns: days.map((day: any) => ({
        day: day.day,
        perPersonEur: day.dailyCost?.perPersonEur || 0,
        perPersonKrw: day.dailyCost?.perPersonKrw || 0,
        breakdown: day.dailyCost?.breakdown || {},
      })),
      totals: {
        perPersonTotal: totalPerPersonEur,
        perPersonPerDay: perPersonPerDay,
        transport: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.breakdown?.transportEur || 0), 0),
        meals: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.breakdown?.mealEur || 0), 0),
        entranceFees: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.breakdown?.entranceEur || 0), 0),
      },
    },
    // 💰 교통비 요약 (마케팅 핵심)
    transportSummary,
    realityCheck,
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace,
      travelPaceLabel: paceLabel,
      slotDurationMinutes: paceConfig.slotDurationMinutes,
      totalPlaces: finalPlaces.length,
      mobilityStyle: formData.mobilityStyle,
      companionType: formData.companionType,
      companionCount,
      transportCategory: isGuideCategory ? 'guide' : 'transit',
      availableHours,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      koreanSentimentApplied: !!koreanSentiment,
      pipelineVersion: 'v3-2step',
    },
  };
}

// =====================================================
// 헬퍼 함수들
// =====================================================

/**
 * ⭐ nubiReason V2: 순차 검색 — 위에서부터 찾으면 멈추고 "구체적 이름+날짜" 표시
 * 
 * 우선순위 (키워드 검색처럼 위에서 순서대로):
 * 1순위: 셀럽 TOP 10 방문 → "제니(BLACKPINK) 24년 9월 게시"
 * 2순위: 유튜버 18인 언급 → "빠니보틀 24년 11월 소개"
 * 3순위: 네이버 블로그   → "네이버 블로그 890건"
 * 4순위: 패키지투어 4사  → "하나투어·모두투어 필수코스"
 * 5순위: 여행앱 TOP 3   → "마이리얼트립 4.8점 (320건)"
 * 6순위: 구글 리뷰       → "구글 리뷰 284,095개"
 * 
 * 이 문구 = 앱의 광고 카피 = 핵심 차별화
 */
async function generateNubiReasonV2(
  placeId: string,
  placeName: string,
  cityName: string,
  celebrityVisit: CelebrityVisit | null,
  mergedData: any,
): Promise<string> {
  try {
    // ── 1순위: 셀럽 방문 흔적 ──
    if (celebrityVisit && celebrityVisit.found) {
      const group = celebrityVisit.celebrityGroup ? `(${celebrityVisit.celebrityGroup})` : '';
      return `${celebrityVisit.celebrityName}${group} ${celebrityVisit.date} 게시`;
    }

    // ── 2순위: 유튜버 18인 언급 (DB에서 채널명 포함 조회) ──
    if (db) {
      try {
        const ytMention = await db.select({
          channelName: youtubeChannels.channelName,
          publishedAt: youtubeVideos.publishedAt,
          confidence: youtubePlaceMentions.confidence,
        })
          .from(youtubePlaceMentions)
          .innerJoin(youtubeVideos, eq(youtubePlaceMentions.videoId, youtubeVideos.id))
          .innerJoin(youtubeChannels, eq(youtubeVideos.channelId, youtubeChannels.id))
          .where(ilike(youtubePlaceMentions.placeName, `%${placeName}%`))
          .orderBy(desc(youtubeChannels.trustWeight))
          .limit(1);

        if (ytMention.length > 0 && ytMention[0].channelName) {
          const dateStr = ytMention[0].publishedAt
            ? formatKoreanDate(new Date(ytMention[0].publishedAt))
            : '';
          return `${ytMention[0].channelName} ${dateStr} 소개`.trim();
        }
      } catch (e) {
        // YouTube 조회 실패 → 다음 순위로
      }
    }

    // ── 3순위: 네이버 블로그 건수 + 키워드 ──
    if (db) {
      try {
        // places 테이블에서 placeId 매칭
        let dbPlaceId: number | null = null;
        const placeMatch = await db.select({ id: places.id })
          .from(places)
          .where(ilike(places.name, `%${placeName}%`))
          .limit(1);
        if (placeMatch.length > 0) dbPlaceId = placeMatch[0].id;

        if (dbPlaceId) {
          const blogCount = await db.select({
            count: sql<number>`count(*)`,
          })
            .from(naverBlogPosts)
            .where(eq(naverBlogPosts.placeId, dbPlaceId));

          const count = Number(blogCount[0]?.count || 0);
          if (count > 0) {
            return `네이버 블로그 ${count.toLocaleString()}건`;
          }
        }

        // placeId 매칭 실패 시 도시+장소명으로 검색
        const { findCityUnified } = await import('../city-resolver');
        const cityResult = await findCityUnified(cityName);
        if (cityResult) {
          const blogNameCount = await db.select({
            count: sql<number>`count(*)`,
          })
            .from(naverBlogPosts)
            .where(and(
              eq(naverBlogPosts.cityId, cityResult.cityId),
              sql`${naverBlogPosts.postTitle} ILIKE ${`%${placeName}%`}`,
            ));

          const count = Number(blogNameCount[0]?.count || 0);
          if (count > 0) {
            return `네이버 블로그 ${count.toLocaleString()}건`;
          }
        }
      } catch (e) {
        // 블로그 조회 실패 → 다음 순위로
      }
    }

    // ── 4순위: 패키지투어 (하나투어/모두투어 등) ──
    if (mergedData.isPackageTourIncluded) {
      const mentionedBy = mergedData.packageMentionedBy;
      if (Array.isArray(mentionedBy) && mentionedBy.length > 0) {
        return `${mentionedBy.slice(0, 2).join('·')} 필수코스`;
      }
      return '한국 패키지투어 필수코스';
    }

    // ── 5순위: 여행앱 (마이리얼트립/클룩/트립닷컴) ──
    if (db) {
      try {
        let dbPlaceId: number | null = null;
        const placeMatch = await db.select({ id: places.id })
          .from(places)
          .where(ilike(places.name, `%${placeName}%`))
          .limit(1);
        if (placeMatch.length > 0) dbPlaceId = placeMatch[0].id;

        if (dbPlaceId) {
          const appData = await db.select({
            source: placePrices.source,
            rawData: placePrices.rawData,
          })
            .from(placePrices)
            .where(and(
              eq(placePrices.placeId, dbPlaceId),
              sql`${placePrices.source} IN ('myrealtrip', 'klook', 'tripdotcom')`,
            ))
            .limit(1);

          if (appData.length > 0) {
            const APP_NAMES: Record<string, string> = {
              myrealtrip: '마이리얼트립',
              klook: '클룩',
              tripdotcom: '트립닷컴',
            };
            const raw = appData[0].rawData as any;
            const appName = APP_NAMES[appData[0].source] || appData[0].source;
            if (raw?.rating) {
              const reviewCount = raw.reviewCount ? ` (${Number(raw.reviewCount).toLocaleString()}건)` : '';
              return `${appName} ${raw.rating}점${reviewCount}`;
            }
            if (raw?.productName) {
              return `${appName} 인기 상품`;
            }
          }
        }
      } catch (e) {
        // 여행앱 조회 실패 → 다음 순위로
      }
    }

    // ── 6순위 (최종): 구글 리뷰 수 ──
    const reviewCount = mergedData.userRatingCount || 0;
    if (reviewCount >= 10000) {
      return `구글 리뷰 ${reviewCount.toLocaleString()}개`;
    } else if (reviewCount >= 1000) {
      return `구글 리뷰 ${reviewCount.toLocaleString()}개`;
    } else if (reviewCount >= 50) {
      return `구글 리뷰 ${reviewCount.toLocaleString()}개`;
    }

    // 모든 순위에서 못 찾은 경우
    return '데이터 수집 중';
  } catch (error) {
    console.warn(`[NubiReason] ${placeName} 생성 실패:`, error);
    return '데이터 수집 중';
  }
}

/** 날짜를 "24년 9월" 형태로 변환 */
function formatKoreanDate(date: Date): string {
  try {
    const y = date.getFullYear() % 100;
    const m = date.getMonth() + 1;
    return `${y}년 ${m}월`;
  } catch {
    return '';
  }
}

/** Enrichment 함수 동적 import (순환 참조 방지) */
async function getEnrichmentFunctions() {
  const mod = await import('../itinerary-generator');
  return mod.enrichmentFunctions;
}

/** EUR → KRW 환율 조회 (DB 캐시) */
async function getEurToKrwRate(): Promise<number> {
  try {
    if (!db) return 1500;
    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(and(eq(exchangeRates.baseCurrency, 'KRW'), eq(exchangeRates.targetCurrency, 'EUR')))
      .limit(1);
    if (rate && rate.rate > 0) {
      const eurToKrw = Math.round(1 / rate.rate);
      console.log(`[V3] 💱 €1 = ₩${eurToKrw.toLocaleString()}`);
      return eurToKrw;
    }
  } catch (error) {
    console.warn('[V3] 환율 조회 실패, 기본값 사용:', error);
  }
  return 1500;
}

/** 이동 정보 계산 (Google Routes API) */
async function calcTransit(
  from: any, fromName: string, to: any,
  travelMode: 'WALK' | 'TRANSIT' | 'DRIVE', companionCount: number,
): Promise<any> {
  const fromId = typeof from.id === 'number' ? from.id : Math.abs(hashCode(from.id || from.name || fromName));
  const toId = typeof to.id === 'number' ? to.id : Math.abs(hashCode(to.id || to.name || ''));

  // 좌표 유효성 검사 — 무효 좌표(0,0)면 추정값 반환
  if (!from.lat || !from.lng || !to.lat || !to.lng) {
    return {
      from: from.name || fromName, to: to.name || '',
      mode: travelMode === 'DRIVE' ? 'guide' : 'walk',
      modeLabel: travelMode === 'DRIVE' ? '차량이동' : '도보',
      duration: 15, durationText: '약 15분', distance: 2000, cost: 0, costTotal: 0,
    };
  }

  try {
    // WalkMore 모드: 직선 2km 이상이면 자동으로 TRANSIT 전환
    let actualMode = travelMode;
    if (travelMode === 'WALK' && from.lat && to.lat) {
      const R = 6371000;
      const dLat = (to.lat - from.lat) * Math.PI / 180;
      const dLng = (to.lng - from.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(from.lat*Math.PI/180)*Math.cos(to.lat*Math.PI/180)*Math.sin(dLng/2)**2;
      const straightDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      if (straightDist > 1500) {
        actualMode = 'TRANSIT';
      }
    }

    const route = await routeOptimizer.getRoute(
      { id: fromId, latitude: from.lat, longitude: from.lng, name: fromName } as any,
      { id: toId, latitude: to.lat, longitude: to.lng, name: to.name } as any,
      actualMode,
    );
    const durationMinutes = Math.round(route.durationSeconds / 60);
    const modeLabel = actualMode === 'WALK' ? '도보'
      : actualMode === 'TRANSIT' ? '지하철/버스'
      : '전용차량이동';
    return {
      from: from.name || fromName,
      to: to.name || '',
      mode: actualMode === 'DRIVE' ? 'guide' : actualMode.toLowerCase(),
      modeLabel,
      duration: durationMinutes,
      durationText: `${durationMinutes}분`,
      distance: route.distanceMeters,
      cost: Math.round(route.estimatedCost * 100) / 100,
      costTotal: Math.round(route.estimatedCost * companionCount * 100) / 100,
    };
  } catch {
    return {
      from: from.name || fromName,
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

/** 좌표 유효성 검증 */
function isValidCoord(lat: number, lng: number): boolean {
  return lat !== 0 && lng !== 0 && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** 문자열 해시코드 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/** Gemini JSON 잘림 복구 */
function repairTruncatedJSON(broken: string): { days: GeminiDay[] } | null {
  try {
    const arrStart = broken.indexOf('[');
    if (arrStart === -1) return null;

    let lastCompleteIdx = -1;
    let braceDepth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = arrStart + 1; i < broken.length; i++) {
      const ch = broken[i];
      if (escapeNext) { escapeNext = false; continue; }
      if (ch === '\\') { escapeNext = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braceDepth++;
      if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) lastCompleteIdx = i;
      }
    }

    if (lastCompleteIdx === -1) return null;

    const repaired = broken.substring(0, lastCompleteIdx + 1) + ']}';
    try {
      return JSON.parse(repaired);
    } catch {
      const cleaned = repaired.replace(/,\s*\]/, ']');
      return JSON.parse(cleaned);
    }
  } catch {
    return null;
  }
}
