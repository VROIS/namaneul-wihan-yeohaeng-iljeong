/**
 * Pipeline V3 (MIX): Step1 Gemini 일정 생성 → Step2 DB매칭·교통비·스케줄 빌드.
 * 이동시간 = 외부호출0 Haversine 추정.
 */

import { GoogleGenAI } from "@google/genai";
import type { TripFormData, PlaceResult, DaySlotConfig, TravelPace, VibeWeight, TravelStyle } from './types';
import {
  PACE_CONFIG, MEAL_BUDGET, DEFAULT_START_TIME, DEFAULT_END_TIME,
  calculateDayCount, calculateSlotsForDay, getCompanionCount, minutesToTime,
} from './types';
// ⚠️ 2026-07-06 사장님 SSOT = MIX 이동/거리/비용 = DB-only(route-local) 계산법 단일 SSOT 재사용(§16). 옛 자체 haversineTransit 재발명 완전삭제 §19.
import {
  haversineKm, calcTransitHaversine, pickTransitMode, estimateTransitCost,
} from './transit-haversine';
import { preloadCityData, matchPlacesWithDB, saveNewPlacesToDB, loadSeedRawMap } from './ag3-data-matcher';
// 🧠 2026-07-05 = computeCatSlots 정적 import(§0 가벼움) = 옛 함수내 동적 await import 폐기(§19). ag2→pipeline-v3 역참조 없음 = 순환참조 무관.
import { computeCatSlots } from './ag2-gemini-recommender';
// 🧠 2026-07-05 사장님 SSOT = MIX Gemini(#02) raw 저장 관문(§18). 옛 getAI 직접호출 = raw 미저장(비용증발) 폐기(§19). TS(ag3)는 이미 관문경유 저장됨 = Gemini만 누락이었음.
// 🧠 2026-07-06 사장님 SSOT = MIX Gemini raw = 도시id 폴더 + {meta,rawResponse,parsedPlaces}(사장님 예시형식) 저장 = saveCollectedRaw 단일 헬퍼(§18 2곳). 옛 saveRaw(runtime 봉투) 폐기 §19.
import { saveCollectedRaw } from '../shared/save-collected-raw';
import {
  calculateTransportPrice, shouldApplyGuidePrice, calculateUberBlackHourly,
  guideCostForDay, buildDayConfig, round2,
  type TransportPricingResult, type GuidePriceResult, type TransitPriceResult, type UberBlackComparison,
} from '../transport-pricing-service';
import { db } from '../../db';
import { placeSeedRaw } from '@shared/schema';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
// 🧠 2026-07-05 = 환율 EUR→KRW 단일 SSOT import(§16, 로컬 3벌 복붙 폐기)
import { getEurToKrwRate } from '../exchange-rate';
// 🗑️ 2026-07-05 삭제 = CelebrityVisit 타입 = celebrity 폐기잔재(호출0) §0/§19

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

/** ⚠️ 수정금지(승인필요) = price_eur 단일 SSOT = 최신최우선(Gemini > seed_raw > 매트릭스폴백) §14 */
function resolvePrice(
  geminiPrice: number,
  isMeal: boolean = false,
  seedPriceEur: number = 0,
  mealType?: 'lunch' | 'dinner',
  travelStyle: TravelStyle = 'Reasonable',
): number {
  const resolved = geminiPrice > 0 ? geminiPrice : seedPriceEur;
  if (resolved > 0) return resolved;
  // 모두 0 = 매트릭스 폴백 (= 식당만)
  if (isMeal && mealType) {
    return MEAL_BUDGET[travelStyle]?.[mealType] ?? 0;
  }
  return 0;
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
  name: string;         // Google Maps 영어 공식명
  nameKo: string;       // 사용자 선택 언어명
  nameLocal?: string;   // 현지 원어명 (예: "Tour Eiffel", "Colosseo")
  address?: string;     // ⚠️ 2026-05-14 v3 = AG3 통합 매칭 1 순위 (= 행정주소)
  type: 'activity' | 'lunch' | 'dinner' | 'cafe';
  // 🧠 2026-07-05 사장님 SSOT = Gemini 응답 전체 새덮어쓰기(§20 셀렉금지). 프롬프트가 이미 요구하는 값을 버리지 말고 살림(실호출 4/4 확인).
  //   = seed_category(6종 = 카테고리 보존), latitude/longitude(정확좌표 = TS 힌트 = 동명오매칭 방지), distance_km_from_center(도심거리 = 동선재료).
  seed_category?: string; // heritage/healing/hotspot/adventure/shopping/attraction/restaurant
  latitude?: number;
  longitude?: number;
  distance_km_from_center?: number;
  startTime: string;
  endTime: string;
  // 🗑️ 2026-07-05 삭제 = reason 필드 = 프롬프트 미요청(항상 undefined = 死데이터) §0/§19
  selection_reason_ko?: string;  // ⚠️ 2026-05-14 v3 신규 = 인스타/FOMO = → summary_ko
  shortform_ko?: string;          // ⚠️ 2026-05-14 v3 신규 = 코믹/위트 = → editorial_summary
  transitNote?: string; // 이전 장소에서 이 장소까지 이동 방법 (Gemini 생성)
  price_eur: number;
}

interface GeminiDay {
  day: number;
  theme: string;
  places: GeminiPlace[];
}

// =====================================================
// 메인 파이프라인
// =====================================================

// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = DB-only / MIX 완전 분기 entry
// = ready=true → DB-only 전용 파이프라인 (= pipeline-db-only.ts = Gemini/Routes/Sentiment/Verifier 0)
// = ready=false → MIX (= 옛 V3 step1_geminiItinerary 흐름 = 사용자 명시 "MIX 결과가 더 낳음" 보존)
export async function runPipelineV3(formData: TripFormData): Promise<any> {
  const { isCityReady } = await import('./ag2-gemini-recommender');
  // ⚠️ 2026-07-08 사장님 SSOT = destinationCoords(불변키) 전달 = ready 판정 좌표우선 = "본느"도 기존 도시 잡아 DB-only 재활용(재발굴 차단).
  const cityCheck = await isCityReady(formData.destination, formData.destinationCoords);
  if (cityCheck.ready) {
    const { runPipelineDbOnly } = await import('./pipeline-db-only');
    return runPipelineDbOnly(formData, cityCheck);
  }
  console.log(`\n[V3] city='${cityCheck.cityName}' ready=false (${cityCheck.count} rows) → MIX 경로`);
  return runPipelineMix(formData);
}

async function runPipelineMix(formData: TripFormData): Promise<any> {
  const _t0 = Date.now();
  const _timings: Record<string, number> = {};
  const _mark = (label: string) => { _timings[label] = Date.now() - _t0; };

  console.log(`[V3-MIX] ===== Pipeline MIX (= 옛 V3 step1 살리기) 시작 =====`);

  // ===== 기본 계산 (AG1 역할 통합, <1ms) =====
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);
  // 🗑️ 2026-07-05 삭제 = 'Moderate'→'Normal' 재매핑 = 옛 pace값(FE 미전송 = 죽은분기) §0/§19
  const travelPace: TravelPace = (formData.travelPace as TravelPace) || 'Normal';
  const paceConfig = PACE_CONFIG[travelPace];
  const companionCount = getCompanionCount(formData.companionType || 'Solo');
  // ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = vibes 빈값 폴백 = 정식 6 vibe 만 (옛 Foodie→Shopping 교체, §19 완전삭제). Foodie 는 버튼 폐기됨(즐길거리=Attraction / 쇼핑=Shopping). 헤더 "미식" 오염 차단.
  const vibes = formData.vibes || ['Shopping', 'Culture', 'Healing'];

  // 🗑️ 2026-07-05 삭제 = sourceMode 토글 = 라우팅은 cityCheck.ready 담당(안 도는 분기) §0/§19

  // Vibe 가중치 계산
  const PRIORITY_WEIGHTS: Record<number, number[]> = { 1: [100], 2: [60, 40], 3: [50, 30, 20] };
  const weights = PRIORITY_WEIGHTS[vibes.length] || [50, 30, 20];
  const vibeWeights: VibeWeight[] = vibes.map((vibe, i) => ({
    vibe: vibe as any,
    weight: weights[i] / 100,
    percentage: weights[i],
  }));

  // ⚠️ 2026-07-06 사장님 SSOT = 일별 가용시각 = buildDayConfig 단일 SSOT(DB-only ag1 버퍼 규칙: 첫날=사용자시작~기본종료 / 막날=기본시작~사용자종료 / 중간=기본~기본 / 1일=사용자그대로).
  //   = 옛 MIX ±60분 산술 완전삭제(§19) → 최초생성이 DB-only와 동일 dayConfig = 가이드 날짜별 요금·슬롯 정합(§16/§20).
  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;
  const daySlotsConfig: DaySlotConfig[] = [];

  for (let d = 1; d <= dayCount; d++) {
    const dc = buildDayConfig(d, dayCount, userStartTime, userEndTime, DEFAULT_START_TIME, DEFAULT_END_TIME);
    const slots = calculateSlotsForDay(dc.startTime, dc.endTime, travelPace);
    daySlotsConfig.push({ day: d, startTime: dc.startTime, endTime: dc.endTime, slots });
  }

  const totalSlots = daySlotsConfig.reduce((sum, d) => sum + d.slots, 0);
  console.log(`[V3] ${dayCount}일, 총 ${totalSlots}슬롯, 밀도: ${travelPace} (${paceConfig.slotDurationMinutes}분/장소)`);
  daySlotsConfig.forEach(d => console.log(`[V3]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`));

  // ===== Step 1 (Gemini) + DB 사전 로드: 병렬 =====
  // ⏸️ Korean sentiment: 비용 절감 위해 비활성화 (테스트 단계)
  console.log(`[V3] Step1(Gemini) + DB사전로드 병렬 시작...`);

  const [geminiDays, preloaded] = await Promise.all([
    step1_geminiItinerary(formData, dayCount, daySlotsConfig, vibeWeights),
    // ⚠️ 2026-07-08 사장님 SSOT = destinationCoords(도시중심좌표=불변키) 전달 = 좌표10m 매칭 = 중복도시·재발굴 차단.
    preloadCityData(formData.destination, formData.destinationCoords),
  ]);

  _mark('step1_parallel');
  // 🗑️ 2026-07-05 삭제 = dbPlacesMap.size 참조 → seedRawMap.size(실제 시드 후보 수) = 죽은맵 제거 정합 §0/§19
  console.log(`[V3-MIX] Step1 완료 (${_timings['step1_parallel']}ms): Gemini ${geminiDays.length}일, seed ${preloaded.seedRawMap?.size ?? 0}키`);

  // 🧠 2026-07-06 사장님 SSOT = MIX Gemini raw 저장(§18) = 도시id 폴더 + {meta,rawResponse,parsedPlaces}(사장님 예시형식).
  //   = cityId 는 preloadCityData(findCityUnified, 신규도시 자동INSERT)가 확정 = 이 시점(Promise.all 후) 사용가능. rawText 는 step1 이 days.__rawText 로 전달.
  //   ⚠️ 2026-07-06 근본수정 = 옛 fire-and-forget(void..catch) = 배포서버(Replit)서 응답 후 PUT 완료전 잘림 = raw 미저장(비용증발 §18) 근본.
  //     → step2 와 병렬 await 로 전환(§18 자산보장). raw 저장(수백ms) ⊂ step2(수십초) = FE 응답 지연 0(속도 유지) + 배포서버서 안 잘림.
  const geminiRawSave = (async () => {
    if (!preloaded.cityId) return;
    const rawText = (geminiDays as any).__rawText || '';
    const finishReason = (geminiDays as any).__finishReason || 'unknown';
    let parsedPlaces: any[] = []; let parseError: string | null = null;
    try {
      const m = rawText.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
      const pj = m ? JSON.parse(m[0]) : {};
      for (const dd of (pj.days || [])) for (const p of (dd.places || [])) parsedPlaces.push({ day: dd.day, theme: dd.theme, ...p });
    } catch (e) { parseError = (e as Error).message; }
    await saveCollectedRaw({
      cityId: preloaded.cityId, stepNum: 90, stepName: 'mix-gemini', content: 'step1', hashKey: 'rawResponse',
      body: {
        meta: { cityId: preloaded.cityId, destination: formData.destination, finishReason, parseError, parsedCount: parsedPlaces.length, timestamp: new Date().toISOString() },
        rawResponse: rawText,
        parsedPlaces,
      },
    });
  })().catch((e) => console.warn('[V3] Gemini raw 저장 실패:', (e as Error)?.message));

  // ===== Step 2: 데이터 채우기 (Gemini raw 저장과 병렬 = raw 보장 + 속도 영향 0) =====
  const [result] = await Promise.all([
    step2_enrichAndBuild(
      geminiDays, formData, preloaded, daySlotsConfig,
      dayCount, companionCount, travelPace, paceConfig, vibeWeights,
    ),
    geminiRawSave,
  ]);

  _mark('step2_enrich');

  // ⚠️ 수정금지(승인필요) 2026-05-14 = 사용자 SSOT = 추적 메타 강화 (= Replit 서버 콘솔 접근 X 우회)
  // = 클라이언트 DevTools 콘솔에서 response.metadata 직접 확인 = 백엔드 동작 추적
  // ⚠️ 2026-07-06 = 집계 = step2 metadata(_matched/_unmatched, finalPlaces 기준) 사용. 옛 result.places(항상 빈값→total:0 오집계) 폐기 §19.
  const totalPlaces = (result.metadata as any)?.totalPlaces || 0;
  const matchedCount = (result.metadata as any)?._matched || 0;
  const unmatchedCount = (result.metadata as any)?._unmatched || 0;

  result.metadata = {
    ...result.metadata,
    _timings,
    _totalMs: Date.now() - _t0,
    _pipelineVersion: 'v3-2step',
    // 🗑️ 2026-07-05 삭제 = sourceMode 메타 노출 = 죽은 토글 §0/§19

    // ⭐ 신규 추적 메타 (= 2026-05-14)
    _matching: {
      total: totalPlaces,
      matched: matchedCount,
      unmatched: unmatchedCount,
      matchRate: totalPlaces > 0 ? Math.round((matchedCount * 100) / totalPlaces) : 0,
    },
    _backgroundSave: {
      started: unmatchedCount > 0,
      targetCount: unmatchedCount,
      note: unmatchedCount > 0
        ? `${unmatchedCount} 곳 = TS+PM + Storage + DB INSERT 백그라운드 진행 중 (응답 후 완료)`
        : '미매칭 없음 = 백그라운드 작업 없음',
    },
    _geminiModel: 'gemini-3-flash-preview',
    // 🗑️ 2026-07-05 삭제 = _matchingAlgorithm 문자열 = 옛 3단계 인용(현 matcher 7단계와 불일치) §0/§19
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

  // 🗑️ 2026-07-09 사장님 SSOT = companionTypeKo·focusKo 하드코딩 번역맵 삭제 §19 = 옛 AI 과설계(Gemini 응답요소에 없는 설명글).
  //   = 동행유형·큐레이션초점도 원본값(companionType·curationFocus) 그대로 Gemini 전달 = 자유해석([[feedback_dynamic_function_not_hardcoded_map]]). agesDesc(죽은코드) 삭제.
  const companionDesc = formData.companionType || 'Couple';   // 원본값(Solo/Couple/Family/Group...) 그대로
  const headcount = formData.companionCount || 2;
  const focusDesc = formData.curationFocus || 'Everyone';     // 원본값(Kids/Parents/Everyone/Self) 그대로

  // ⑥ 여행지 (destination) - 직접 사용

  // ⑦ 여행 기간
  const startDate = formData.startDate;
  const endDate = formData.endDate;

  // 🗑️ 2026-07-09 사장님 SSOT = vibeKo·styleKo·mobilityKo·paceKo 하드코딩 번역맵 4개 완전삭제 §19 = 옛 AI 과설계.
  //   = Gemini 응답요소에 없는 것(사람 읽는 설명글) = 삭제. 원본값(vibes·travelStyle·travelPace)을 그대로 프롬프트에 실어 Gemini 해석([[feedback_dynamic_function_not_hardcoded_map]]).
  //   = 실제 로직(카테고리 배분 catSlots·페이스 90/120/150분·예산)은 이미 다른 곳서 동적 처리 = 이 설명맵은 장식(죽은코드·도달불가폴백)이었음.

  // 🧠 2026-07-05 사장님 SSOT = vibe → 6카테고리 슬롯 배분을 프롬프트에 전달(§20 = catSlots 단일 SSOT ag2 재사용).
  //   = 옛날엔 "관광 X + 식사 Y" 2종으로만 전달 → Gemini 가 카테고리 모름 → attraction/restaurant 로 뭉개짐(리모주 사고).
  //   = 이제 "heritage 2곳·shopping 1곳·healing 1곳..." 명시 → 각 place 가 seed_category(6종) 답함 → DB 저장 시 카테고리 보존.
  const totalSlots = daySlotsConfig.reduce((s, d) => s + d.slots, 0);
  const catSlots = computeCatSlots(vibeWeights, totalSlots, dayCount);
  const nonRestCats = Object.entries(catSlots).filter(([k]) => k !== 'restaurant');
  const categoryMatrix = nonRestCats.map(([cat, n]) => `${cat} ${n}곳`).join(', ')
    + (catSlots.restaurant ? ` / 식당(restaurant) ${catSlots.restaurant}곳` : '');

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

  // 출력 언어 (일정 텍스트: nameKo, reason, theme 등)
  const outputLang = (formData as any).language || 'ko';
  const langMap: Record<string, { name: string; prompt: string }> = {
    ko: { name: '한국어', prompt: 'nameKo=한국어 장소명, reason=한국어 추천이유 (이동수단+시간+핵심이유, 60자 이내), theme=한국어 테마' },
    en: { name: 'English', prompt: 'nameKo=English place name (or local name), reason=English recommendation reason (transport+time+key point, 60 chars), theme=English theme' },
    ja: { name: '日本語', prompt: 'nameKo=日本語の場所名, reason=日本語の推薦理由 (移動手段+時間+ポイント, 60字以内), theme=日本語テーマ' },
    fr: { name: 'Français', prompt: 'nameKo=Nom du lieu en français, reason=Raison de recommandation en français (transport+temps+point clé, 60 caractères), theme=Thème en français' },
    zh: { name: '中文', prompt: 'nameKo=中文场所名, reason=中文推荐理由 (交通+时间+要点, 60字以内), theme=中文主题' },
    es: { name: 'Español', prompt: 'nameKo=Nombre del lugar en español, reason=Razón de recomendación en español (transporte+tiempo+punto clave, 60 caracteres), theme=Tema en español' },
    de: { name: 'Deutsch', prompt: 'nameKo=Deutscher Ortsname, reason=Deutsche Empfehlungsbegründung (Verkehr+Zeit+Kernpunkt, 60 Zeichen), theme=Deutsches Thema' },
  };
  const langSpec = langMap[outputLang] || langMap.ko;

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

  // ⚠️ 수정금지(승인필요) 2026-05-24 = 메인앱 표준 prompt 사용자 SSOT
  // = SSOT 원본 = .claude/skills/raw-db-verify-and-complete/prompts/09-main-app-itinerary/STANDARD_PROMPT_2026-05-24.md
  // = 1 글자 변경 = Gemini 응답 변경 = 양쪽 파일 동기 강제
  // 🗑️ 2026-07-09 사장님 SSOT = vibe/페이스/스타일 = 하드코딩 번역맵 폐기 §19 → 원본값 그대로(Gemini 해석). vibes·travelPace·travelStyle 원본 = route-prompt 동적 패턴.
  const koreanTravelerStyle = `${companionDesc} ${headcount}명 / vibe=${(formData.vibes || []).join('+')} / 페이스=${formData.travelPace || 'Normal'} / 스타일=${formData.travelStyle || 'Reasonable'}${ageDesc ? ` / 나이=${ageDesc}` : ''}`;
  const prompt = `You are a travel data assistant for KOREAN TRAVELERS (${nowYear}년 기준 최신 정보).
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

⚠️ GROUNDING REQUIREMENT (= Gemini 3 + Google Search 강제):
- All facts (place names, addresses, coordinates, prices, opening hours) MUST be verified via Google Search grounding.
- No hallucinations. No made-up coordinates. No fabricated addresses.
- If you cannot verify a fact via Google Search, SKIP that place — do NOT guess.

TASK: Fill the provided slot matrix (categories + counts) and sort places within each day by minimum travel distance to generate the itinerary.

CITY: ${formData.destination}
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

[USER CONTEXT — AG1 보강]
${koreanTravelerStyle}
계절: ${seasonNote} / 큐레이션: ${focusDesc}

[SLOT MATRIX — AG1 결정]
${dayRequirements}

[CATEGORY MATRIX — 전체 여정 카테고리별 곳수 (= 사용자 vibe 반영, 반드시 이 비율로 선정)]
${categoryMatrix}
- 각 place 의 seed_category 는 위 카테고리 중 하나로 정확히 지정 (heritage=문화/유산, healing=힐링/자연, hotspot=핫플, adventure=모험/액티비티, shopping=쇼핑, attraction=즐길거리/체험, restaurant=식당).
- 식사(lunch/dinner) = seed_category="restaurant".

[동선 원칙]
- 매일 ${formData.destination} 도시 중심부에서 출발·귀환, 같은 날 = 같은 구역 묶기
- Array order within each day = visit order (= sorted by minimum travel distance from start)
- DAILY MEAL RULE (= AG1 has already assigned these slots — DO NOT modify count or position):
    * Each day MUST contain exactly 1 lunch (type="lunch") somewhere in the middle of the day.
    * The FINAL slot of each day MUST be dinner (type="dinner").
- 3 일+ 일정 시 = Day 2+ 한 날 = outskirt (= 도심에서 10-100km 외곽) day-trip 1-2 곳 포함 가능 (= 한국 여행객이 자주 찾는 외곽 명소/아울렛)

[가격 원칙]
- price_eur = ${nowYear}년 실제 입장료 (1인, EUR). 무료=0
- 점심 1인 ~€${mealBudget.lunch}, 저녁 1인 ~€${mealBudget.dinner}
- 활동(activity) = 1인 입장료 / 식당(lunch/dinner) = 1인당 평균. 확실하지 않으면 0

For each place include (= ALL fields verified via Google Search grounding):
- name (English official name on Google Maps)
- nameKo (한국어 = 한국 여행자가 부르는 이름)
- nameLocal (local language name = 예: 파리=Tour Eiffel) [= REQUIRED for ALL places INCLUDING restaurants (식당도 반드시). If the restaurant's official name is already in the local language (예: "Le Comptoir du Marché"), copy that same name into nameLocal — never leave nameLocal empty. = Text Search forwarding + matching key, final DB column]
- address (FULL street address with NUMBER + street + postal code + city) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search]
- type ("activity" | "lunch" | "dinner")
- seed_category (= 위 CATEGORY MATRIX 중 하나 = heritage|healing|hotspot|adventure|shopping|attraction|restaurant. 식사=restaurant) [= final DB column, 카테고리 보존 필수]
- latitude (= decimal 6 digits, e.g. 48.858370) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- longitude (= decimal 6 digits, e.g. 2.294481) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- price_eur (1 인 EUR)
- distance_km_from_center (= 도심 중심으로부터 직선거리 km = haversine = 소수 1 자리 = 동선 최적화 기본 필수)
- selection_reason_ko (한국어 한 줄 = 한국 여행객 트렌드 = 인스타 성지/한국 vlog 등 사회적 검증)
- shortform_ko (한국어 한 줄 = 장소에 대한 코믹/위트 = Claude 톤. 단순 정보 X = "프사각", "본전 뽑음" 같은 한국 슬랭)

OUTPUT (strict JSON, no markdown fences):
{"days":[{"day":1,"theme":"테마","places":[
  {"name":"Eiffel Tower","nameKo":"에펠탑","nameLocal":"Tour Eiffel","address":"Champ de Mars, 5 Av. Anatole France, 75007 Paris","type":"activity","seed_category":"attraction","latitude":48.858370,"longitude":2.294481,"price_eur":29.4,"distance_km_from_center":2.4,"selection_reason_ko":"파리 인스타 인증샷 1순위 성지","shortform_ko":"파리 왔으면 외쳐줘야 국룰 '나 파리다!'"},
  {"name":"Le Comptoir du Marché","nameKo":"르 콩투아 뒤 마르쉐","nameLocal":"Le Comptoir du Marché","address":"8 Rue de la Loge, 06300 Nice, France","type":"lunch","seed_category":"restaurant","latitude":43.697415,"longitude":7.276451,"price_eur":35,"distance_km_from_center":0.8,"selection_reason_ko":"구시가지 시장 근처 가성비 미쉐린 맛집","shortform_ko":"예약 안 하면 자리 없음 주의"}
]}]}`;

  try {
    // 🗑️ 2026-07-05 삭제 = STEP1_USE_GROUNDING 토글 + grounding else분기 = false고정 데드경로(JSON경로 1벌만) §0/§19
    // responseMimeType JSON = 파싱안정+속도 (신규장소 환각 안전망 = saveNewPlacesToDB TS searchText 재검증)
    const step1Config: any = {
      temperature: 0.3,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
    };
    console.log(
      `[V3-Step1] 🤖 gemini-3-flash-preview + JSON (${prompt.length}자)...`,
    );

    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: step1Config,
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

    // 🗑️ 2026-07-06 삭제 = 여기 saveRaw(contextId:null=runtime·봉투형식) 폐기 = cityId 미확정 시점이라 runtime 개판저장 §19.
    //   = raw 저장은 호출부(runPipelineMix)에서 Promise.all 후 preloaded.cityId 확정 시점에 saveCollectedRaw 로(도시폴더+parsedPlaces). rawText 는 아래 days 에 부착해 전달.

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

    // 🗑️ 2026-07-05 삭제 = DEBUG_PIPELINE_SNAPSHOT 로컬 dump = saveRaw(§18) 이중저장 관문우회 §0/§19

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
    // 🧠 2026-07-06 사장님 SSOT = rawText/finishReason 를 days 에 비열거 속성 부착 = 반환타입(GeminiDay[]) 불변 + 호출부가 Promise.all 후 cityId 확정 시점에 raw 저장(도시폴더).
    Object.defineProperty(days, '__rawText', { value: text, enumerable: false });
    Object.defineProperty(days, '__finishReason', { value: finishReason, enumerable: false });
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
      // description=shortform_ko(후킹카피)→DB editorial_summary / personaFitReason=selection_reason_ko(인스타/FOMO)→DB summary_ko
      // 🗑️ 2026-07-05 삭제 = gPlace.reason 폴백 = 프롬프트 미요청 필드(항상 undefined = 死데이터) §0/§19
      const desc = gPlace.shortform_ko || '';
      const persona = gPlace.selection_reason_ko || 'AI 추천 장소';
      const place: PlaceResult = {
        id: placeId,
        name: gPlace.name || 'Unknown Place',
        description: desc,
        // 🧠 2026-07-05 사장님 SSOT = Gemini 정확좌표 살림(옛 lat:0/lng:0 폐기 §19). = matchCandidate 매칭키 + saveNewPlacesToDB TS 앵커 힌트 = 동명오매칭 방지.
        lat: gPlace.latitude ?? 0,
        lng: gPlace.longitude ?? 0,
        vibeScore: 7,
        confidenceScore: 5,
        // ⚠️ 2026-05-14 = saveNewPlacesToDB 필터 호환 = 'Gemini AI (New)' 유지
        // = 'Gemini V3' 로 변경 시 = 필터 통과 X = toSave=0 = DB 자동 캐싱 X (= 운영 검증 시 발견)
        sourceType: 'Gemini AI (New)',
        personaFitReason: persona,
        // 🧠 2026-07-05 사장님 SSOT = Gemini seed_category(6종) 보존 = ag3 저장 시 restaurant/attraction 2종 뭉갬 대신 이 값 사용(지점4). 식사는 restaurant.
        tags: isMeal ? ['restaurant', 'food'] : [],
        vibeTags: isMeal ? ['Foodie' as const] : [],
        image: '',
        priceEstimate: sanitizePriceEur(gPlace.price_eur) > 0 ? `€${sanitizePriceEur(gPlace.price_eur)}` : '무료',
        placeTypes: isMeal ? ['restaurant'] : ['tourist_attraction'],
        recommendedTime: gPlace.startTime < '12:00' ? 'morning' : gPlace.startTime < '17:00' ? 'afternoon' : 'evening',
        city: formData.destination,
        koreanPopularityScore: 0,
        googleMapsUrl: '',
        estimatedPriceEur: sanitizePriceEur(gPlace.price_eur),
        // ⚠️ 2026-05-14 = AG3 매칭용 + DB INSERT 매핑
        // = geminiAddress = 행정주소 (= 1순위 매칭 키)
        // = nameKo/nameLocal = saveNewPlacesToDB INSERT 매핑 (= 한국어/원어명 누락 방지)
        geminiAddress: gPlace.address || '',
        nameKo: gPlace.nameKo || null,
        nameLocal: gPlace.nameLocal || null,
        // 🧠 2026-07-05 사장님 SSOT = Gemini 도심거리·카테고리 살림(§20) = saveNewPlacesToDB job 전필드 저장(지점4) = 결손컬럼 채움.
        distanceKmFromCenter: gPlace.distance_km_from_center ?? null,
        seedCategory: isMeal ? 'restaurant' : (gPlace.seed_category || null),
      } as any;
      allPlaces.push(place);
      scheduleMap.push({ day: gDay.day, gPlace, placeId });
    }
  }

  console.log(`[V3-Step2] ${allPlaces.length}곳 PlaceResult 변환 완료`);

  // ── 2b. DB 매칭 (좌표, 점수 보강) ──
  // ⚠️ 수정금지(승인필요) 2026-05-31 = 사용자 SSOT = skipImageEnrich = Wikipedia 이미지 보강(동기 ~9초) skip
  // = FE 우선 노출 (= DB-only 처럼) / 이미지 = saveNewPlacesToDB(background = TS+PM) 가 DB 저장 = 다음 trip = DB hit
  const matchedPlaces = await matchPlacesWithDB(allPlaces, preloaded, { skipImageEnrich: true });
  // 🗑️ 2026-07-05 삭제 = matchedMap = finalPlaceMap 폴백용 데드맵(finalPlaces 가 동일 id 전부 보유) §0/§19
  console.log(`[V3-Step2] DB 매칭 완료 (${Date.now() - _t0}ms)`);

  // 🗑️ 2026-07-05 삭제 = enrichFns 3종 폐기서술 = getRealityCheckForCity(날씨/위기)만 사용 §0/§19

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

  const enrichFns = await getEnrichmentFunctions();  // = getRealityCheckForCity 만 사용
  const [eurToKrw, realityCheck, transportPrice] = await Promise.all([
    getEurToKrwRate('[V3]'),
    enrichFns.getRealityCheckForCity(formData.destination),
    // 💰 교통비 산정 (카테고리 자동 분류: 가이드 vs 대중교통)
    calculateTransportPrice({
      companionType: (formData.companionType || 'Couple') as any,
      companionCount,
      mobilityStyle: (formData.mobilityStyle || 'Moderate') as any,
      travelStyle: (formData.travelStyle || 'Reasonable') as any,
      availableHours,
      dayCount,
      isRegionalTravel: false,
    }).catch(err => {
      console.warn('[V3] 교통비 산정 실패, 기본값 사용:', err);
      return null;
    }),
  ]);

  console.log(`[V3-Step2] 환율 + 날씨 + 교통비 병렬 완료 (${Date.now() - _t0}ms)`);
  if (transportPrice) {
    console.log(`[V3-Step2] 💰 교통비: 카테고리 ${transportPrice.category} | 1인/일 €${transportPrice.perPersonPerDay}`);
  }

  // ── 2d. 병합 + summaryKo 생성 ──
  // 🗑️ 2026-07-05 삭제 = celebrityVisits 빈맵 = celebrity 폐기잔재(읽는 곳 없음) §0/§19
  const finalPlaces = await Promise.all(matchedPlaces.map(async (p) => {
    // seedRawMap 조회 (가격 + 인앱 링크용)
    const seedNameEn = p.name ? p.name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : "";
    const seedData = preloaded.seedRawMap?.get(seedNameEn);

    // ⚠️ 수정금지(승인필요) 2026-05-20 = price_eur 단일 SSOT = place_seed_raw.priceEur 만 (= ta enrichment 폐기)
    const geminiPrice = p.estimatedPriceEur ?? 0;
    const isMealSlot = (p as any).type === 'lunch' || (p as any).type === 'dinner';
    const mealTypeForPrice: 'lunch' | 'dinner' | undefined =
      (p as any).type === 'lunch' ? 'lunch' :
      (p as any).type === 'dinner' ? 'dinner' :
      undefined;
    const styleForPrice = normalizeTravelStyle(formData.travelStyle);
    const resolvedPrice = resolvePrice(
      geminiPrice, isMealSlot,
      seedData?.priceEur ?? 0,
      mealTypeForPrice, styleForPrice,
    );

    const merged = {
      ...p,
      // 🗑️ 2026-07-05 삭제 = priceEstimate 옛 p.priceEstimate raw 폴백 = 이중소스 → resolvePrice 단일결과만 §0/§19
      estimatedPriceEur: resolvedPrice,
      priceEstimate: resolvedPrice > 0 ? `€${Math.round(resolvedPrice)}` : '무료',
    };

    // ⚠️ 수정금지(승인필요) 2026-06-11 = summary_ko = 후킹 숏폼 한줄요약(앱 차별점) 단일 소스 = seedData.summaryKo 우선 → 구글 리뷰수 폴백.
    // 🗑️ 2026-07-05 삭제 = generateNubiReasonV2 40줄 async껍데기 = 실질 1줄 로직 인라인화(호출부·정의 통삭) §0/§19
    const reviewCount = (merged as any).userRatingCount || 0;
    merged.summaryKo = seedData?.summaryKo
      || (reviewCount >= 50 ? `구글 리뷰 ${reviewCount.toLocaleString()}개` : '데이터 수집 중');

    return merged;
  }));

  // 🗑️ 2026-07-05 삭제 = AWAIT_NEW_PLACES_IMAGES 토글 + else background분기 = true고정 데드경로(await 1벌만) §0/§19
  // fetch(TS+PM+Storage) await → 첫 trip 구글 이미지 노출(FE 최우선) + DB INSERT background(백필)
  await saveNewPlacesToDB(finalPlaces, preloaded.cityId, { deferPersist: true }).catch(e =>
    console.error('[V3-Step2] ⚠️ saveNewPlacesToDB(await fetch) 실패:', e?.message || e)
  );

  // ⚠️ 2026-07-07 사장님 SSOT = 1차 저장 후 PSR 재조회 = 슬롯을 저장된 PSR 에서 구성(DB-only 동형, §16 loadSeedRawMap).
  //   = ①단계 Gemini 전체 upsert(순차 await 완료) 로 23곳이 이미 PSR 확정 → 재조회로 신규 포함 최신 맵 확보 → 슬롯이 editorialSummary·nameKo·RC·image 를 저장 PSR 에서 flat.
  //   = 옛 슬롯이 Gemini place(부분mutate)만 봐서 editorialSummary·nameKo 누락(에비앙 슬롯 제미니요소 안뜸) 근본해결.
  if (preloaded.cityId) {
    try {
      preloaded.seedRawMap = await loadSeedRawMap(preloaded.cityId);
      console.log(`[V3-Step2] 🔄 1차저장 후 PSR 재조회 = ${preloaded.seedRawMap.size}키 (슬롯 = 저장 PSR flat)`);
    } catch (e) {
      console.warn('[V3-Step2] PSR 재조회 실패(슬롯은 place 폴백):', (e as Error)?.message);
    }
  }

  // 🗑️ 2026-07-08 사장님 = 폐업 슬롯 splice 완전삭제 = 슬롯은 그 무엇도 줄일 권한 없음(무단 감소 로직) §19. 슬롯 = scheduleMap = Gemini 곳수 항상 보존.

  // 최종 장소 맵 (= saveNewPlacesToDB 후 = 보강 결과 반영)
  const finalPlaceMap = new Map<string, PlaceResult>();
  for (const fp of finalPlaces) {
    finalPlaceMap.set(fp.id, fp);
  }

  // ── 2e. 일별 스케줄 구성 + 이동시간 계산 ──
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];
  // 🗑️ 2026-07-06 = travelMode(mobilityStyle 힌트) 완전삭제 §19 = pickTransitMode 가 거리(1km)로 mode 결정(DB-only 동형) = mobilityStyle 편향(전부 도보) 결함 근본제거.

  const days: any[] = [];
  let totalTripCostEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find(c => c.day === d)!;

    // 이 날의 스케줄
    const dayScheduleItems = scheduleMap.filter(s => s.day === d);
    // ⚠️ 2026-07-06 사장님 SSOT = 슬롯 시각 = slot 순서 그리드 계산(startTime + i×슬롯간격) = DB-only(ag4:288 scene.time) 동형(§16).
    //   = 옛 s.gPlace.startTime(Gemini raw엔 startTime 없음 = 항상 undefined = 슬롯시간 미표시 결함) 완전삭제 §19.
    const dayStartMin = (() => { const [h, m] = (dayConfig.startTime || '09:00').split(':').map(Number); return h * 60 + m; })();
    const slotDur = paceConfig.slotDurationMinutes;
    const dayPlaces = dayScheduleItems.map((s, slotIdx) => {
      const enrichedPlace = finalPlaceMap.get(s.placeId)!;
      const isMeal = s.gPlace.type === 'lunch' || s.gPlace.type === 'dinner';
      // 프론트 전달 시 불필요한 0값 필드 제거 (React Native에서 {0}이 "0" 텍스트로 표시되는 문제 방지)
      const { finalScore, buzzScore, ...safePlace } = enrichedPlace as any;

      // ⚠️ 2026-07-07 사장님 SSOT = 슬롯 = 1차저장 PSR(placeSeed) 우선 flat 매핑(DB-only ag4:234-273 동형). 저장된 검증행에서 editorialSummary·nameKo·RC·image.
      //   = 재조회된 seedRawMap(신규 포함)에서 PID > 이름 순 조회. 없으면 enrichedPlace(place mutate)·s.gPlace 폴백.
      const placeNameEn = enrichedPlace.name ? enrichedPlace.name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : "";
      const placeNameKo = (enrichedPlace as any).nameKo ? (enrichedPlace as any).nameKo.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : "";
      const placeSeed = (enrichedPlace as any).googlePlaceId
        ? preloaded.seedRawMap?.get(`pid:${(enrichedPlace as any).googlePlaceId}`)
        : undefined;
      const seed = placeSeed || preloaded.seedRawMap?.get(placeNameEn) || preloaded.seedRawMap?.get(placeNameKo);

      return {
        ...safePlace,
        // 0이 아닌 경우만 포함
        ...(finalScore ? { finalScore } : {}),
        ...(buzzScore ? { buzzScore } : {}),
        // ⚠️ 2026-07-06 = 슬롯 시각 = 그리드 계산(DB-only 동형). startTime + slotIdx×슬롯간격.
        startTime: minutesToTime(dayStartMin + slotIdx * slotDur),
        endTime: minutesToTime(dayStartMin + (slotIdx + 1) * slotDur),
        // ⚠️ 2026-07-06 = FE 슬롯 필드 = DB-only 동형(type/nameEn flat). 옛 MIX 누락 보완 §16.
        type: isMeal ? 'restaurant' as const : 'activity' as const,
        nameEn: seed?.nameEn || (enrichedPlace as any).nameEn || enrichedPlace.name,
        // 식사 정보
        isMealSlot: isMeal,
        mealType: s.gPlace.type === 'lunch' ? 'lunch' as const : s.gPlace.type === 'dinner' ? 'dinner' as const : undefined,
        // 🗑️ 2026-07-05 삭제 = mealPrice 옛 s.gPlace.price_eur raw 재산정(resolvePrice 우회) → resolvePrice 단일결과(estimatedPriceEur) 재사용 §0/§19
        mealPrice: isMeal ? ((seed?.priceEur ?? enrichedPlace.estimatedPriceEur) ?? undefined) : undefined,
        mealPriceLabel: isMeal ? (s.gPlace.type === 'lunch' ? mealBudget.lunchLabel : mealBudget.dinnerLabel) : undefined,
        // ⚠️ 2026-07-07 = 저장 PSR 우선(DB-only 동형) → Gemini(s.gPlace) 폴백.
        // ⚠️ 2026-07-07 = Gemini 전용 요소(nameKo·nameLocal·summaryKo·editorialSummary) = 저장 PSR(seed) 우선 → Gemini 폴백. TS가 안 건드리는 값.
        nameKo: seed?.nameKo || s.gPlace.nameKo,
        nameLocal: seed?.nameLocal || s.gPlace.nameLocal || null,
        // ⚠️ 2026-07-07 = RC·image = TS 검증값(enrichedPlace = place mutate, Storage 이미지) 우선 → 저장 PSR 폴백.
        //   = 신규는 ③재UPDATE(TS→DB)가 deferPersist background = 재조회 시점 PSR 엔 아직 Gemini값(RC null·이미지 Gemini) = seed 먼저 쓰면 TS Storage 이미지 가려짐(review 지적). enrichedPlace(TS mutate, await 완료) 우선이 정답.
        userRatingCount: (enrichedPlace as any).userRatingCount ?? seed?.googleReviewCount,
        image: enrichedPlace.image || seed?.imageUrl || '',
        // summary_ko = 숏폼 재료 = 보전(FE 슬롯 노출 아님, 추후 숏폼). PSR 우선.
        summaryKo: seed?.summaryKo || enrichedPlace.summaryKo || null,
        // ⚠️ 수정금지(승인필요) 2026-06-24 사용자 SSOT = 슬롯 한줄요약 = editorial_summary 단일. 2026-07-07 = 저장 PSR(seed.editorialSummary) 우선 = DB-only(ag4:268 scene.shortform_ko) 동형. 옛 enrichedPlace만 봐서 누락되던 것 해결.
        editorialSummary: seed?.editorialSummary || enrichedPlace.editorialSummary || null,
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

    // ── 이동 구간 계산 = DB-only(route-local) 계산법 단일 SSOT(§16) ──
    // ⚠️ 2026-07-06 사장님 SSOT = 거리(haversineKm) → pickTransitMode(1km 도보/초과 metro, mobilityStyle 무관) → calcTransitHaversine.
    //   = 옛 haversineTransit(2km 도보임계·mobilityStyle 힌트·cost 0 하드코딩) 완전삭제 §19 = 파리(DB-only)와 동일 표시.
    //   = 구간 = 숙소→place[0], place[i]→[i+1], place[last]→숙소. transits 배열 = place 간(betweenTransits)만 = n-1(FE transits[index]=place[i] 나가는 이동).
    // ⚠️ 2026-07-06 = center = 거리계산 앵커. 숙소/도심좌표 있으면 그것(= departure/return 별도필드 표시), 없으면 place[0] 폴백(= 역주입·간격계산용, departure/return 필드는 억제 = 옛 동작 보존).
    const hasAccommodation = !!accommodationCoords;
    const center = accommodationCoords || (dayPlaces[0] ? { lat: dayPlaces[0].lat, lng: dayPlaces[0].lng } : undefined);
    // 한 구간 계산 = 거리 + mode + 시간 + 구간비용(대중교통 균일 예상가).
    const buildTransit = (from: { lat: number; lng: number }, fromName: string, to: { lat: number; lng: number }, toName: string) => {
      const km = round2(haversineKm(from.lat, from.lng, to.lat, to.lng));
      const { mode, calc } = pickTransitMode(km, isGuideCategory);
      const tr = calcTransitHaversine({ ...from, name: fromName }, { ...to, name: toName }, calc, companionCount, center);
      const cost = isGuideCategory ? 0 : estimateTransitCost(mode);  // 가이드 = 구간표시 숨김·일합계만 / 대중교통 = 구간 균일예상가
      return {
        from: fromName, to: toName,
        distance: Math.round(km * 1000),  // m (FE ÷1000 표준)
        duration: tr.duration,
        durationText: `${tr.duration}분`,  // ⚠️ 2026-07-06 = FE departure/return 이 폴백없이 읽음(TripPlannerScreen) = 필수.
        mode,
        modeLabel: mode === 'walk' ? '도보' : mode === 'private_guide' ? '전용차량이동' : '지하철/버스',
        cost, costTotal: cost,
        km,  // place 역주입용(내부)
      };
    };

    // 숙소/도심 → 첫 장소 (= 별도 필드 departureTransit, transits 배열엔 미포함). 숙소/도심좌표 있을 때만(place[0] 자기이동 방지 = 옛 동작).
    const departureTransit = hasAccommodation && center && dayPlaces.length > 0
      ? buildTransit(center, `🏨 ${accommodationName}`, dayPlaces[0], dayPlaces[0].name)
      : undefined;

    // 장소 간 이동 (연속) = transits 배열 = n-1
    const betweenTransits: any[] = [];
    for (let i = 0; i < dayPlaces.length - 1; i++) {
      betweenTransits.push(buildTransit(dayPlaces[i], dayPlaces[i].name, dayPlaces[i + 1], dayPlaces[i + 1].name));
    }

    // 마지막 장소 → 숙소/도심 (= 별도 필드 returnTransit). 숙소/도심좌표 있을 때만.
    const returnTransit = hasAccommodation && center && dayPlaces.length > 0
      ? buildTransit(dayPlaces[dayPlaces.length - 1], dayPlaces[dayPlaces.length - 1].name, center, `🏨 ${accommodationName}`)
      : undefined;

    // ⚠️ 2026-07-06 = place 에 이동 필드 flat 역주입 = DB-only(ag4:307) 동형. place[i] 로 들어오는 이동 = departure(i=0) / betweenTransits[i-1].
    dayPlaces.forEach((p: any, i: number) => {
      const inbound = i === 0 ? departureTransit : betweenTransits[i - 1];
      if (inbound) {
        p.distance_from_prev_km = inbound.km;
        p.transit_mode = inbound.mode;
        p.transit_min = inbound.duration;
      }
    });

    // 일 총합·우버비교용 = 전 구간(departure+between+return). transits 배열(FE)엔 between 만.
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
      // ⚠️ 2026-07-06 = transits 배열(FE) = place 간(betweenTransits)만 = n-1(DB-only 동형). departure/return = 별도 필드.
      //   구간별 이동: 전부 "전용차량이동"으로 덮어쓰기
      displayTransits = betweenTransits.map(t => ({
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

      // ⚠️ 2026-07-06 사장님 SSOT = 가이드 1인 1일 가격 = 그 날 dayConfig 가용시간 기준 재계산(DB-only ag4:328 동형, §16 guideCostForDay 공용).
      //   = 옛 전체 availableHours flat(첫날/막날 버퍼 미반영 = 1인 €30 과다) 완전삭제 §19. 반일요금 없어 구간합산 아닌 하루 1회.
      const guidePP = await guideCostForDay({
        dayConfig, companionType: (formData.companionType || 'Couple') as any, companionCount,
        mobilityStyle: (formData.mobilityStyle || 'Moderate') as any, travelStyle: (formData.travelStyle || 'Reasonable') as any, dayCount,
      });
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
      // ⚠️ 2026-07-06 = transits 배열(FE) = place 간(betweenTransits)만 = n-1(DB-only 동형). departure/return = 별도 필드.
      //   구간별 이동: 상세 그대로 (도보/메트로/버스 - 구간 균일 예상가).
      displayTransits = betweenTransits;

      // ⚠️ 2026-07-06 사장님 SSOT = 대중교통 1인 1일 교통비 = 구간별 estimateTransitCost 합산(DB-only ag4:345 동형, §16).
      //   = 옛 calculateTransportPrice(여정당 flat €8.6) 완전삭제 §19 = 파리(구간합산 가변)와 동일 기준.
      //   = 구간 = place 간(betweenTransits)만 합산(DB-only transits.reduce = scenes.slice(1) 동형 = departure/return 제외).
      const transitPP = betweenTransits.reduce((s: number, t: any) => s + (t.cost || 0), 0);
      transportPerPersonPerDay = transitPP;

      // 업셀: 가이드 이용시 가격 (클릭 가능) = 마케팅 업셀 유지(calculateTransportPrice 부가정보).
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
        // ⚠️ 2026-07-06 = 총합 = transits 배열(betweenTransits, n-1) 기준 = DB-only(ag4:365) 동형. departure/return 은 별도 필드.
        transits: displayTransits,
        totalDuration: betweenTransits.reduce((sum: number, t: any) => sum + t.duration, 0),
        totalCost: betweenTransits.reduce((sum: number, t: any) => sum + (t.costTotal || 0), 0),
        totalDistanceKm: round2(betweenTransits.reduce((sum: number, t: any) => sum + ((t.distance || 0) / 1000), 0)),
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

  // ⚠️ 2026-07-08 사장님 SSOT = 개수보존 3자대조(발각 전용, 보정·삭제 없음) = Gemini 원본 곳수 = scheduleMap = FE days 총합.
  //   슬롯은 그 무엇도 줄일 권한 없음(§19). 불일치는 조립 단계 어딘가의 무언 손실 = 즉시 발각.
  const geminiPlaceCount = geminiDays.reduce((s, gd) => s + (gd.places?.length || 0), 0);
  const feDayPlaceCount = days.reduce((s: number, d: any) => s + d.places.length, 0);
  let assemblyLoss: { gemini: number; schedule: number; fe: number } | null = null;
  if (geminiPlaceCount !== scheduleMap.length || scheduleMap.length !== feDayPlaceCount) {
    assemblyLoss = { gemini: geminiPlaceCount, schedule: scheduleMap.length, fe: feDayPlaceCount };
    console.error(`[V3-Step2] ⚠️ _assemblyLoss 감지: gemini=${geminiPlaceCount} schedule=${scheduleMap.length} fe=${feDayPlaceCount}`);
  }

  // ⚠️ 수정금지(승인필요) 2026-05-09 = saveNewPlacesToDB = 위로 이동 (= days 빌드 전) = 중복 호출 X

  // ── 최종 응답 빌드 (프론트엔드 호환 형식) ──
  const paceLabel = travelPace === 'Packed' ? '빡빡하게' : travelPace === 'Normal' ? '보통' : '여유롭게';

  // ⚠️ 2026-07-06 = 요약 총액 = 일별 합(Σ dailyCost.transportEur) = 가이드 날짜별 요금(첫날/막날 버퍼로 다름)과 days 정합. 옛 perPersonPerDay×dayCount(flat) 폐기 §19.
  const transportTotalEur = round2(days.reduce((s: number, d: any) => s + (d.dailyCost?.breakdown?.transportEur || 0), 0));
  const transportAvgPerDay = dayCount > 0 ? round2(transportTotalEur / dayCount) : 0;
  // 교통비 요약 (카테고리별)
  const transportSummary = transportPrice ? (() => {
    if (transportPrice.category === 'guide') {
      const gp = transportPrice as GuidePriceResult;
      return {
        category: 'guide' as const,
        perPersonPerDay: transportAvgPerDay,  // 날짜별 요금 평균(대표값)
        perPersonPerDayKrw: Math.round(transportAvgPerDay * eurToKrw),
        perPersonTotal: transportTotalEur,     // 일별 합(정확)
        perPersonTotalKrw: Math.round(transportTotalEur * eurToKrw),
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
        // ⚠️ 2026-07-06 = 대중교통도 일별 합(구간합산) 기준 = days 정합. perPersonPerDay=평균 대표값.
        perPersonPerDay: transportAvgPerDay,
        perPersonPerDayKrw: Math.round(transportAvgPerDay * eurToKrw),
        perPersonTotal: transportTotalEur,
        perPersonTotalKrw: Math.round(transportTotalEur * eurToKrw),
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
      pipelineVersion: 'v3-2step',
      // ⚠️ 2026-07-06 = 매칭 집계 = finalPlaces 기준(step2 내부 = 실제 여정 장소). 옛 외부 result.places(항상 빈값 → total:0 오집계) 폐기 §19.
      //   = googlePlaceId 있음 = DB 매칭 완료 / 없음 = 신규(TS+PM 대상 = 백그라운드 저장).
      _matched: finalPlaces.filter((p: any) => p.googlePlaceId).length,
      _unmatched: finalPlaces.filter((p: any) => !p.googlePlaceId).length,
      // ⚠️ 2026-07-08 사장님 SSOT = 개수보존 3자대조 결과. null = 정상(보존). 있으면 조립단계 무언손실 = 즉시발각(은폐0).
      _assemblyLoss: assemblyLoss,
    },
  };

  // ⚠️ 수정금지(승인필요) 2026-05-20 = Verifier 완전 폐기 (= 사용자 SSOT = Gemini 0 강제)
  return result;
}

// =====================================================
// 헬퍼 함수들
// =====================================================

// 🗑️ 2026-07-05 삭제 = generateNubiReasonV2 40줄 async껍데기(+옛 6순위 셀럽 JSDoc박제) = 실질 1줄(summaryKo??리뷰수) 호출부 인라인화 §0/§19
// 🗑️ 2026-07-05 삭제 = formatKoreanDate(날짜 "24년 9월" 변환) = 호출0 죽은함수(옛 nubiReason 셀럽날짜용, summary_ko 단일화로 폐기) §0/§19

/** Enrichment 함수 동적 import (순환 참조 방지) */
async function getEnrichmentFunctions() {
  const mod = await import('../itinerary-generator');
  return mod.enrichmentFunctions;
}

// 🗑️ 2026-07-05 = getEurToKrwRate 로컬정의 삭제 = shared/exchange-rate.ts 단일 SSOT 로 통합(§16 재발명금지, 3벌→1벌)

// 🗑️ 2026-07-06 = haversineMeters 로컬정의 삭제 §19 = 거리계산 = transit-haversine.haversineKm 단일 SSOT(§16) = 옛 haversineTransit 전용이라 동반삭제.

// 🗑️ 2026-07-06 = haversineTransit + calcTransit 완전삭제 §19 = MIX 이동계산 = transit-haversine(calcTransitHaversine·pickTransitMode·estimateTransitCost) 단일 SSOT(§16) = DB-only(route-local) 동형. 옛 2km 도보임계·mobilityStyle 편향·cost 0 하드코딩 = 결함③④ 근본 제거.

/** 좌표 유효성 검증 */
function isValidCoord(lat: number, lng: number): boolean {
  return lat !== 0 && lng !== 0 && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

