/**
 * Pipeline V3: 2단계 일정 생성 파이프라인
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ Step 1: Gemini 완전 일정 생성 (강화 프롬프트)            │
 * │   • 도시 중심 출발/종료, 지리 동선 최적화                │
 * │   • 교통편 명시, 2026 최신 입장료, 계절 반영             │
 * │   • 식사 배치, 이동시간 추정 모두 Gemini 처리            │
 * ├─────────────────────────────────────────────────────────┤
 * │ Step 2: NUBI 차별화 데이터 삽입 (병렬)                  │
 * │   • DB 매칭: places → 사진, 점수, 좌표                  │
 * │   • nubiReason, 셀럽사진, 한국 OTA 가격                 │
 * │   • 이동시간: Haversine 추정 (Google Routes 일시정지)    │
 * └─────────────────────────────────────────────────────────┘
 *
 * Google Routes API: USE_GOOGLE_ROUTES=false 로 일시정지
 *   → 미래 프리미엄 기능 ("실현가능성 검증") 용으로 보존
 *   → 소도시/비주류 지역 실측 필요 시 플래그 전환
 *
 * 총 소요: 10~12초 목표
 */

// ===== Google Routes API 플래그 (일시정지: false, 활성화: true) =====
// 미래 프리미엄 "실현가능성 검증" 기능 용으로 보존
const USE_GOOGLE_ROUTES = false;

import { GoogleGenAI } from "@google/genai";
import type { TripFormData, PlaceResult, DaySlotConfig, TravelPace, VibeWeight, TravelStyle } from './types';
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
import { exchangeRates, youtubePlaceMentions, youtubeVideos, youtubeChannels, naverBlogPosts, places, placeSeedRaw } from '@shared/schema';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { findCelebrityVisitsForPlaces, type CelebrityVisit } from '../celebrity-tracker';

/**
 * Gemini 반환 가격 정제
 * - "19,500" → 19.5 (천 단위 구분자 오파싱 방지)
 * - 500 EUR 초과 → 0 (명백한 오류값 제거, 유럽 일반 입장료 최대 €200)
 */
function sanitizePriceEur(raw: any): number {
  if (raw == null) return 0;
  const n = typeof raw === 'string' ? parseFloat(raw.replace(/,/g, '.')) : Number(raw);
  if (isNaN(n) || n < 0) return 0;
  if (n > 500) return 0; // 명백한 오류 (팡테옹 19500 등)
  return Math.round(n * 100) / 100;
}

// ===== 5대 가격원칙: priceLevel → 2026 실제 물가 (EUR) =====
function priceLevelToEur(level: number, meal?: 'lunch' | 'dinner'): number {
  const map: Record<number, { lunch: number; dinner: number; entrance: number }> = {
    0: { lunch: 0, dinner: 0, entrance: 0 },
    1: { lunch: 12, dinner: 18, entrance: 8 },
    2: { lunch: 22, dinner: 38, entrance: 15 },
    3: { lunch: 40, dinner: 70, entrance: 25 },
    4: { lunch: 65, dinner: 120, entrance: 50 },
  };
  if (meal) return map[level]?.[meal] ?? 0;
  return map[level]?.entrance ?? 0;
}

/** 원칙 1~4: Gemini 최우선, 0=무료 유지, DB 검증 시 비싼 쪽, 패키지 투어 가격 무시 */
function resolvePrice(
  enrichedPrice: number,
  geminiPrice: number,
  dbPlace: { priceLevel?: number; priceSource?: string } | null,
  isMeal: boolean = false
): number {
  // Gemini가 0이어도 DB 가격이 있으면 DB 우선 (식당은 식사비 예산 기준으로 별도 처리)
  // 패키지 투어 소스면 Gemini 사용
  const isPkgSource = dbPlace?.priceSource && ['viator', 'klook', 'tour', 'package'].some(k =>
    dbPlace!.priceSource!.toLowerCase().includes(k)
  );
  // enrichedPrice = DB에서 가져온 실제 가격
  const basePrice = isPkgSource ? geminiPrice : (enrichedPrice || geminiPrice);
  // Gemini가 0이고 DB 가격도 없는 경우에만 0 반환
  if (basePrice === 0 && !dbPlace?.priceLevel) return 0;
  if (!dbPlace?.priceLevel) return basePrice;
  const dbEstimate = priceLevelToEur(dbPlace.priceLevel);
  // 둘 다 있으면 더 높은 값 반환 (사용자 경험 보호: 실제보다 싸면 당혹감)
  return Math.max(basePrice, dbEstimate);
}

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
  transitNote?: string; // 이전 장소에서 이 장소까지 이동 방법 (Gemini 생성)
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

  // 일별 슬롯 계산 (출발 +60분 버퍼, 귀환 -60분 버퍼)
  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;
  const daySlotsConfig: DaySlotConfig[] = [];

  // HH:MM 문자열에 분 추가/차감
  const addMinutesToTime = (time: string, minutes: number): string => {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  };
  // 첫날: 출발시간+60분이 실제 관광 시작 (공항/기차역 → 숙소 체크인 시간 확보)
  // 마지막날: 귀환시간-60분이 실제 관광 종료 (공항 이동 여유)
  const day1Start = addMinutesToTime(userStartTime, 60);
  const lastDayEnd = addMinutesToTime(userEndTime, -60);

  for (let d = 1; d <= dayCount; d++) {
    let dayStart = DEFAULT_START_TIME;
    let dayEnd = DEFAULT_END_TIME;
    if (dayCount === 1) { dayStart = day1Start; dayEnd = lastDayEnd; }
    else if (d === 1) { dayStart = day1Start; }
    else if (d === dayCount) { dayEnd = lastDayEnd; }

    const slots = calculateSlotsForDay(dayStart, dayEnd, travelPace);
    daySlotsConfig.push({ day: d, startTime: dayStart, endTime: dayEnd, slots });
  }

  const totalSlots = daySlotsConfig.reduce((sum, d) => sum + d.slots, 0);
  console.log(`[V3] ${dayCount}일, 총 ${totalSlots}슬롯, 밀도: ${travelPace} (${paceConfig.slotDurationMinutes}분/장소)`);
  daySlotsConfig.forEach(d => console.log(`[V3]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`));

  // ===== Step 1 (Gemini) + DB 사전 로드: 병렬 =====
  // ⏸️ Korean sentiment: 비용 절감 위해 비활성화 (테스트 단계)
  console.log(`[V3] Step1(Gemini) + DB사전로드 병렬 시작...`);

  const [geminiDays, preloaded] = await Promise.all([
    step1_geminiItinerary(formData, dayCount, daySlotsConfig, vibeWeights),
    preloadCityData(formData.destination),
  ]);
  const koreanSentiment = undefined;

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

  // 날짜를 "3월 1일" 형태로 (한국어 자연어용)
  const formatDateShort = (d: string) => {
    if (!d || d.length < 10) return d;
    const [y, m, day] = d.split('-');
    const month = parseInt(m || '0', 10);
    const dayNum = parseInt(day || '0', 10);
    return `${month}월 ${dayNum}일`;
  };
  const dateRangeText = `${startDate ? formatDateShort(startDate) : ''}부터 ${endDate ? formatDateShort(endDate) : ''}까지`;

  // 현재 연도/월 (2026 최신 정보 반영 지시용)
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;
  const seasonNote = nowMonth >= 3 && nowMonth <= 5 ? '봄 시즌' :
    nowMonth >= 6 && nowMonth <= 8 ? '여름 시즌 (성수기, 인파 많음)' :
      nowMonth >= 9 && nowMonth <= 11 ? '가을 시즌' :
        '겨울 시즌 (비수기, 일부 시설 단축운영)';

  // ===== 강화 프롬프트 v3.3 (품질 우선: 타입·가격 명시) =====
  const prompt = `당신은 ${nowYear}년 현재 기준 최신 정보를 갖춘 한국인 관광객 전문 여행 플래너입니다.

[핵심 미션]
${companionDesc} ${headcount}명, ${dateRangeText}, ${formData.destination} 여행.
분위기: ${vibeNatural} / 예산: ${styleDesc} / 이동: ${mobilityDesc} / 속도: ${paceKo}
${ageDesc ? `여행자 나이: ${ageDesc}` : ''} ${agesDesc ? `/ ${agesDesc}` : ''}
큐레이션: ${focusDesc} / 현재 계절: ${seasonNote}

[일별 스케줄]
${dayRequirements}

[동선 원칙]
1. 매일 ${formData.destination} 도시 중심부(중앙역 또는 중심 광장)에서 출발·귀환
2. 같은 날 같은 구역·방향의 장소 묶기. 왕복/역방향 이동 금지
3. 이동수단 명시: 메트로 호선명, 도보 분, 버스 번호 (예: "메트로 1호선", "도보 10분")
4. startTime/endTime 겹침 절대 금지. 이동시간 반영
5. 근교 이동 시 당일 첫 일정으로 배치

[가격 원칙]
6. estimatedCostEur = ${nowYear}년 실제 입장료(1인, EUR). 무료=0. 식당=1인 식사비
7. 점심 1인 ~€${mealBudget.lunch}, 저녁 1인 ~€${mealBudget.dinner}
8. 루브르(€22), 에펠탑(€29.4) 등 ${nowYear}년 실제 인상 요금 반영 (절대 추정 금지)

[장소 선정]
9. Day 1: 구글맵 리뷰 많고 한국인에게 유명한 Must-Visit 장소 우선
10. 장소명: Google Maps 검색 가능한 영어 공식명
11. 점심(type="lunch"): 12:00~13:30 시작. 저녁(type="dinner"): 18:30~20:00 시작
12. 현지인 맛집. 실제 영업 중인 곳만. nameKo=한국어 장소명
13. reason=한국어 추천이유 (이동수단+시간+핵심이유, 60자 이내)

JSON만 응답 (마크다운 없이):
{"days":[{"day":1,"theme":"테마 한국어","places":[
  {"name":"Official English Name","nameKo":"한국어","type":"activity","startTime":"10:00","endTime":"12:00","reason":"도심에서 메트로 1호선 15분, 세계 최대 미술관","estimatedCostEur":22},
  {"name":"Restaurant Name","nameKo":"한국어 식당명","type":"lunch","startTime":"12:30","endTime":"14:00","reason":"도보 5분, 현지인 단골 비스트로","estimatedCostEur":${mealBudget.lunch}},
  {"name":"Place Name","nameKo":"한국어","type":"dinner","startTime":"19:00","endTime":"21:00","reason":"메트로 4호선 10분, 미슐랭 추천","estimatedCostEur":${mealBudget.dinner}}
]}]}`;

  try {
    console.log(`[V3-Step1] 🤖 Gemini에 ${dayCount}일 완전 일정 요청 (${prompt.length}자)...`);

    const response = await getAI().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        // ⚡ Thinking 비활성화 → 속도 최적화
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });

    // gemini-2.5-flash: thinking 모드 시 응답이 parts 배열로 올 수 있음
    const candidate = (response as any).candidates?.[0];
    const parts = candidate?.content?.parts || [];
    // parts 중 text 타입만 추출 (thought 타입 제외)
    let text = parts
      .filter((p: any) => p.text && !p.thought)
      .map((p: any) => p.text)
      .join('') || response.text || "";
    const finishReason = candidate?.finishReason || 'unknown';
    console.log(`[V3-Step1] 🤖 응답 수신 (${text.length}자, finish=${finishReason}, parts=${parts.length}, ${Date.now() - _t0}ms)`);

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
        priceEstimate: sanitizePriceEur(gPlace.estimatedCostEur) > 0 ? `€${sanitizePriceEur(gPlace.estimatedCostEur)}` : '무료',
        placeTypes: isMeal ? ['restaurant'] : ['tourist_attraction'],
        recommendedTime: gPlace.startTime < '12:00' ? 'morning' : gPlace.startTime < '17:00' ? 'afternoon' : 'evening',
        city: formData.destination,
        koreanPopularityScore: 0,
        googleMapsUrl: '',
        estimatedPriceEur: sanitizePriceEur(gPlace.estimatedCostEur),
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
    enrichFns.enrichPlacesWithTripAdvisorAndPrices(matchedPlaces, preloaded.cityName, preloaded.seedRawMap),
    enrichFns.enrichPlacesWithPhotoAndTour(matchedPlaces, preloaded.cityName, preloaded.seedRawMap),
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

  // 🌟 셀럽 TOP 10 방문 흔적 검색 (Gemini 웹검색, 병렬) - 성능 이슈로 완전 삭제
  const celebrityVisits = new Map<string, CelebrityVisit>();

  // 각 장소별 nubiReason 데이터 수집 (DB 조회 포함, 병렬)
  const finalPlaces = await Promise.all(matchedPlaces.map(async (p, i) => {
    const kr = enrichedKorean[i];
    const ta = enrichedTA[i];
    const ph = enrichedPhoto[i];

    // 5대 가격원칙: Gemini 우선, DB 검증(비싼 쪽), 패키지 투어 차단
    const enrichedPrice = ta?.estimatedPriceEur ?? p.estimatedPriceEur ?? 0;
    const geminiPrice = p.estimatedPriceEur ?? 0;
    const dbPlaceForPrice = { priceLevel: p.priceLevel, priceSource: ta?.priceSource ?? p.priceSource };
    const isMealSlot = p.type === 'lunch' || p.type === 'dinner';
    const resolvedPrice = resolvePrice(enrichedPrice, geminiPrice, dbPlaceForPrice, isMealSlot);

    const merged = {
      ...p,
      // 한국인 인기도
      koreanPopularityScore: kr?.koreanPopularityScore ?? p.koreanPopularityScore,
      // TripAdvisor + 가격 (resolvePrice 적용)
      tripAdvisorRating: ta?.tripAdvisorRating ?? p.tripAdvisorRating,
      tripAdvisorReviewCount: ta?.tripAdvisorReviewCount ?? p.tripAdvisorReviewCount,
      tripAdvisorRanking: ta?.tripAdvisorRanking ?? p.tripAdvisorRanking,
      estimatedPriceEur: resolvedPrice,
      priceSource: resolvedPrice === 0 ? 'free' : (ta?.priceSource ?? p.priceSource),
      priceEstimate: resolvedPrice > 0 ? `€${Math.round(resolvedPrice)}` : (ta?.priceEstimate ?? p.priceEstimate ?? '무료'),
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
    const seedNameEn = p.name ? p.name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : "";
    const seedNameKo = p.nameKo ? p.nameKo.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : "";
    const seedData = preloaded.seedRawMap?.get(seedNameEn) || preloaded.seedRawMap?.get(seedNameKo);

    merged.nubiReason = await generateNubiReasonV2(
      p.id, p.name, preloaded.cityName,
      celebrityVisits.get(p.id) || null,
      merged,
      seedData
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

      // seedRawMap에서 직접 조회 (DB 추가 쿼리 없음 — place_seed_raw 1회 로드로 모두 해결)
      const placeNameEn = enrichedPlace.name ? enrichedPlace.name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : "";
      const placeNameKo = (enrichedPlace as any).nameKo ? (enrichedPlace as any).nameKo.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : "";
      const placeSeed = preloaded.seedRawMap?.get(placeNameEn) || preloaded.seedRawMap?.get(placeNameKo);

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
        // 원칙 1+2: Gemini 가격 최우선, 0이면 mealBudget fallback
        mealPrice: isMeal
          ? (s.gPlace.estimatedCostEur > 0
            ? s.gPlace.estimatedCostEur
            : (s.gPlace.type === 'lunch' ? mealBudget.lunch : mealBudget.dinner))
          : undefined,
        mealPriceLabel: isMeal ? (s.gPlace.type === 'lunch' ? mealBudget.lunchLabel : mealBudget.dinnerLabel) : undefined,
        // Gemini의 한국어 이름 + 추천이유
        nameKo: s.gPlace.nameKo,
        // ⭐ nubiReason: 우리 데이터 기반 차별화 선정이유 (크게/진하게 표시)
        nubiReason: enrichedPlace.nubiReason || null,
        // ⭐ nubiReason 메타데이터 — place_seed_raw에서 직접 (DB 추가 쿼리 0회)
        nubiEvidenceUrl: placeSeed?.evidenceUrl || null,
        nubiReasonSource: placeSeed?.sourceType || null,
        // Gemini AI 요약 (보통 글씨로 표시)
        geminiReason: s.gPlace.reason || '',
        // Gemini가 생성한 교통편 안내 (강화 프롬프트 v3.1)
        transitNote: s.gPlace.transitNote || null,
        // 부가 정보
        selectionReasons: enrichedPlace.selectionReasons || [],
        confidenceLevel: enrichedPlace.confidenceLevel || 'medium',
        realityCheck,
      };
    });

    // 숙소/출발 좌표 결정
    // 우선순위: 사용자 입력 숙소 > 사용자 입력 도착지 좌표 > DB 도시 중심 좌표 > 첫 장소 좌표
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
    } else if (preloaded.cityCoords?.lat && preloaded.cityCoords?.lng) {
      // ⭐ DB cities 테이블의 도시 중심 좌표 자동 사용 (사용자가 숙소 미입력 시)
      accommodationCoords = preloaded.cityCoords;
      accommodationName = `${preloaded.cityName || formData.destination} 도심`;
    } else if (dayPlaces.length > 0 && dayPlaces[0].lat && dayPlaces[0].lng) {
      accommodationCoords = { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng };
      accommodationName = '도심 기준';
    }

    // ── 이동 구간 병렬 계산 ──
    // Haversine 추정(USE_GOOGLE_ROUTES=false) → 즉시 반환, 외부 API 호출 없음
    const transitPromises: Promise<any>[] = [];

    // 숙소/도심 → 첫 장소
    if (accommodationCoords && dayPlaces.length > 0) {
      transitPromises.push(
        calcTransit(accommodationCoords, `🏨 ${accommodationName}`, dayPlaces[0], travelMode, companionCount,
          dayPlaces[0].transitNote || undefined)
      );
    }

    // 장소 간 이동 (연속)
    for (let i = 0; i < dayPlaces.length - 1; i++) {
      transitPromises.push(
        calcTransit(dayPlaces[i], dayPlaces[i].name, dayPlaces[i + 1], travelMode, companionCount,
          dayPlaces[i + 1].transitNote || undefined)
      );
    }

    // 마지막 장소 → 숙소/도심
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

  // ── 최종 일정 검증 (90% 이상만 프론트 전송) ──
  const result = {
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

  const { verifyItinerary } = await import('./itinerary-verifier');
  const verifyResult = await verifyItinerary(result);
  if (!verifyResult.passed) {
    console.warn(`[V3] ❌ 일정 검증 미통과 (score=${verifyResult.score}) — 사용자 노출 차단`);
    throw new Error('일정 검증 미통과');
  }
  return result;
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
  seedData?: any
): Promise<string> {
  try {
    // ── 🌟 Priority 0: place_seed_raw DB (1초 즉시 반환) ──
    if (seedData && seedData.nubiReason) {
      console.log(`[NubiReason] ✅ SeedRaw hit: ${placeName} → ${seedData.nubiReason}`);
      return seedData.nubiReason;
    }

    // ── 1순위: 셀럽 방문 흔적 (기존 캐시) ──
    if (celebrityVisit && celebrityVisit.found) {
      const group = celebrityVisit.celebrityGroup ? `(${celebrityVisit.celebrityGroup})` : '';
      return `${celebrityVisit.celebrityName}${group} ${celebrityVisit.date} 게시`;
    }

    // ── 2순위: 유튜버/셀럽 언급 (seedRaw) ──
    if (seedData && seedData.celebMention) {
      return seedData.celebMention;
    }

    // ── 3순위: 네이버 블로그 건수 (seedRaw) ──
    if (seedData && seedData.naverBlogCount > 0) {
      return `네이버 블로그 ${seedData.naverBlogCount.toLocaleString()}건`;
    }

    // ── 4순위: 패키지투어 (하나투어/모두투어 등) ──
    if (mergedData.isPackageTourIncluded) {
      const mentionedBy = mergedData.packageMentionedBy;
      if (Array.isArray(mentionedBy) && mentionedBy.length > 0) {
        return `${mentionedBy.slice(0, 2).join('·')} 필수코스`;
      }
      return '한국 패키지투어 필수코스';
    }

    // ── 5순위: [V3 대통합] place_prices 직접 쿼리 제거 → place_seed_raw 단일 소스만 사용
    // (여행앱 데이터는 place_seed_raw.nubiReason 등에 통합되어 있음)

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

/**
 * Haversine 직선거리 계산 (미터)
 * Google Routes API 없이 좌표만으로 거리 추정
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Haversine 기반 이동시간 추정
 * 직선거리 × 1.35 (도로 우회 계수) ÷ 평균속도
 * 정확도: ±5분 (도시 내 이동 기준, 여행 앱 허용 오차 내)
 */
function haversineTransit(
  from: any, fromName: string, to: any,
  travelMode: 'WALK' | 'TRANSIT' | 'DRIVE', companionCount: number,
  transitNote?: string,
): any {
  const fromLabel = from.name || fromName;
  const toLabel = to.name || '';

  // 좌표 없으면 기본값
  if (!from.lat || !from.lng || !to.lat || !to.lng ||
      from.lat === 0 || from.lng === 0 || to.lat === 0 || to.lng === 0) {
    const defaultMode = travelMode === 'DRIVE' ? 'guide' : 'transit';
    const defaultLabel = travelMode === 'DRIVE' ? '전용차량이동' : '이동';
    return {
      from: fromLabel, to: toLabel,
      mode: defaultMode, modeLabel: defaultLabel,
      duration: 15, durationText: '약 15분',
      distance: 1500, cost: 0, costTotal: 0,
      transitNote: transitNote || null,
      isEstimated: true,
    };
  }

  const straightMeters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  // 도로 우회 계수 1.35 적용 (유럽 도시 실측 기준)
  const roadMeters = Math.round(straightMeters * 1.35);

  // 이동수단별 평균 속도 (km/h) → 분 계산
  let speedKmh: number;
  let actualMode: string;
  let modeLabel: string;
  let costPerPerson = 0;

  if (travelMode === 'DRIVE') {
    speedKmh = 28;
    actualMode = 'guide';
    modeLabel = '전용차량이동';
  } else if (straightMeters < 800) {
    // 800m 미만: 도보
    speedKmh = 5;
    actualMode = 'walk';
    modeLabel = '도보';
  } else if (straightMeters < 2000 && travelMode === 'WALK') {
    speedKmh = 5;
    actualMode = 'walk';
    modeLabel = '도보';
  } else {
    // 대중교통 (지하철/버스) — 환승·대기 포함 평균 20km/h
    speedKmh = 20;
    actualMode = 'transit';
    modeLabel = transitNote ? '대중교통' : '지하철/버스';
    costPerPerson = 2.0; // 유럽 평균 1회권 €2.0
  }

  const durationMinutes = Math.max(5, Math.round((roadMeters / 1000) / speedKmh * 60));

  return {
    from: fromLabel,
    to: toLabel,
    mode: actualMode,
    modeLabel,
    duration: durationMinutes,
    durationText: `약 ${durationMinutes}분`,
    distance: roadMeters,
    cost: costPerPerson,
    costTotal: costPerPerson * companionCount,
    transitNote: transitNote || null,
    isEstimated: true, // Haversine 추정값 표시 플래그
  };
}

/**
 * 이동 정보 계산
 * USE_GOOGLE_ROUTES=true: Google Routes API 실측 (프리미엄 검증용)
 * USE_GOOGLE_ROUTES=false: Haversine 추정 (기본, 빠름)
 */
async function calcTransit(
  from: any, fromName: string, to: any,
  travelMode: 'WALK' | 'TRANSIT' | 'DRIVE', companionCount: number,
  transitNote?: string,
): Promise<any> {
  // ── Haversine 모드 (기본) ──
  if (!USE_GOOGLE_ROUTES) {
    return haversineTransit(from, fromName, to, travelMode, companionCount, transitNote);
  }

  // ── Google Routes API 모드 (일시정지 — 미래 프리미엄 검증 기능) ──
  const fromId = typeof from.id === 'number' ? from.id : Math.abs(hashCode(from.id || from.name || fromName));
  const toId = typeof to.id === 'number' ? to.id : Math.abs(hashCode(to.id || to.name || ''));

  if (!from.lat || !from.lng || !to.lat || !to.lng) {
    return haversineTransit(from, fromName, to, travelMode, companionCount, transitNote);
  }

  try {
    let actualMode = travelMode;
    if (travelMode === 'WALK' && from.lat && to.lat) {
      const straightDist = haversineMeters(from.lat, from.lng, to.lat, to.lng);
      if (straightDist > 1500) actualMode = 'TRANSIT';
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
      transitNote: transitNote || null,
      isEstimated: false,
    };
  } catch {
    return haversineTransit(from, fromName, to, travelMode, companionCount, transitNote);
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

// =====================================================
// ⭐ nubiReason 메타데이터 헬퍼 (evidenceUrl, sourceType)
// =====================================================

// getNubiEvidenceUrl, getNubiSourceType 제거 (2026-02-21)
// place_seed_raw.evidenceUrl / sourceType을 seedRawMap에서 직접 조회 → DB 쿼리 0회

