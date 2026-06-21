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

// ⚠️ 수정금지(승인필요) 2026-05-20 = Google Routes API 완전 폐기 = 모든 경로 (= 사용자 SSOT)
// = MIX 도 = Gemini 1차 응답 동선 + Haversine 추정 = 외부 호출 0 / 비용 0
// = routeOptimizer + USE_GOOGLE_ROUTES + try/Google 분기 = 모두 제거

import { GoogleGenAI } from "@google/genai";
import type { TripFormData, PlaceResult, DaySlotConfig, TravelPace, VibeWeight, TravelStyle } from './types';
import {
  PACE_CONFIG, MEAL_BUDGET, DEFAULT_START_TIME, DEFAULT_END_TIME,
  calculateDayCount, calculateSlotsForDay, getCompanionCount,
} from './types';
import { preloadCityData, matchPlacesWithDB, saveNewPlacesToDB } from './ag3-data-matcher';
import {
  calculateTransportPrice, shouldApplyGuidePrice, calculateUberBlackHourly,
  getGuidePerPersonPerDay, round2,
  type TransportPricingResult, type GuidePriceResult, type TransitPriceResult, type UberBlackComparison,
} from '../transport-pricing-service';
import { db } from '../../db';
// ⚠️ 2026-05-23 = simplify P1 = dead import 제거 (= youtubePlaceMentions/youtubeVideos/youtubeChannels/naverBlogPosts/places = 본문 사용 0 = Step 4 DROP 시 빌드 깨짐 차단)
import { exchangeRates, placeSeedRaw } from '@shared/schema';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
// ⚠️ 2026-05-23 = celebrity-tracker 완전 폐기 (= 사용자 SSOT = celeb 검색 = 데이터 0)
type CelebrityVisit = any;

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

/** ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = price_eur 단일 컬럼 (SSOT §14 + 제15조)
 *  순차: 1) Gemini price_eur(최신) > 2) seed_raw priceEur (= COALESCE 새 우선 = 최신최우선, 옛 GREATEST 비싼쪽 폐기 2026-06-10)
 *        > 3) 매트릭스 폴백 (= 식당 = MEAL_BUDGET / 비식당 = 0)
 *  = 옛 enrichedPrice 파라미터 폐기 (= ta enrichment 폐기) = geminiPrice 단일 입력 */
function resolvePrice(
  geminiPrice: number,
  isMeal: boolean = false,
  seedPriceEur: number = 0,
  mealType?: 'lunch' | 'dinner',
  travelStyle: TravelStyle = 'Reasonable',
): number {
  // ⚠️ 수정금지(승인필요) 2026-06-20 = 최신최우선(COALESCE 새 우선) = Gemini(최신 호출값) 있으면 Gemini, 없으면 seed_raw 보존 (= §14, 옛 GREATEST 비싼쪽 폐기 2026-06-10)
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
  startTime: string;
  endTime: string;
  reason?: string;      // = 옛 필드 (= optional, v3 에서 selection_reason_ko 로 대체)
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
  const cityCheck = await isCityReady(formData.destination);
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
  let travelPace: TravelPace = (formData.travelPace as TravelPace) || 'Normal';
  if (travelPace === 'Moderate' as any) travelPace = 'Normal';
  const paceConfig = PACE_CONFIG[travelPace];
  const companionCount = getCompanionCount(formData.companionType || 'Solo');
  const vibes = formData.vibes || ['Foodie', 'Culture', 'Healing'];

  // ⚠️ 수정금지(승인필요) 2026-05-09 = sourceMode 분기 인프라 (= 사용자 SSOT)
  // = 'mixed' (현재 = DB 매칭 + Gemini 호출 + auto-learn 보강) = OFF 상태
  // = 'db-only' (미래 = 9 발굴 도시 검증 충분 시 = 외부 호출 0) = 사용자 토글 ON 시 활성
  // = AG1 → AG2 → AG3 → AG4 = 모든 후속 인식 = result.metadata 에 포함
  const sourceMode: 'mixed' | 'db-only' = (formData as any).sourceMode === 'db-only' ? 'db-only' : 'mixed';

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

  _mark('step1_parallel');
  console.log(`[V3-MIX] Step1 완료 (${_timings['step1_parallel']}ms): Gemini ${geminiDays.length}일, DB ${preloaded.dbPlacesMap.size}키`);

  // ===== Step 2: 데이터 채우기 =====
  const result = await step2_enrichAndBuild(
    geminiDays, formData, preloaded, daySlotsConfig,
    dayCount, companionCount, travelPace, paceConfig, vibeWeights,
  );

  _mark('step2_enrich');

  // ⚠️ 수정금지(승인필요) 2026-05-14 = 사용자 SSOT = 추적 메타 강화 (= Replit 서버 콘솔 접근 X 우회)
  // = 클라이언트 DevTools 콘솔에서 response.metadata 직접 확인 = 백엔드 동작 추적
  const finalPlaces = result.places || [];
  const unmatchedCount = finalPlaces.filter((p: any) => !p.googlePlaceId).length;
  const matchedCount = finalPlaces.length - unmatchedCount;

  result.metadata = {
    ...result.metadata,
    _timings,
    _totalMs: Date.now() - _t0,
    _pipelineVersion: 'v3-2step',
    sourceMode,  // = AG1 분기 결정 (= 2026-05-09)

    // ⭐ 신규 추적 메타 (= 2026-05-14)
    _matching: {
      total: finalPlaces.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      matchRate: finalPlaces.length > 0 ? Math.round((matchedCount * 100) / finalPlaces.length) : 0,
    },
    _backgroundSave: {
      started: unmatchedCount > 0,
      targetCount: unmatchedCount,
      note: unmatchedCount > 0
        ? `${unmatchedCount} 곳 = TS+PM + Storage + DB INSERT 백그라운드 진행 중 (응답 후 완료)`
        : '미매칭 없음 = 백그라운드 작업 없음',
    },
    _geminiModel: 'gemini-3-flash-preview',
    _matchingAlgorithm: 'address > name > coords10m (= v3 2026-05-14)',
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
    Shopping: '쇼핑 (명품 거리, 백화점, 시장, 아울렛)',
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
  const koreanTravelerStyle = `${companionDesc} ${headcount}명 / vibe=${formData.vibes?.join('+') || vibeNatural} / 페이스=${paceKo} / 스타일=${styleDesc}${ageDesc ? ` / 나이=${ageDesc}` : ''}`;
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
- nameLocal (local language name = 예: 파리=Tour Eiffel) [= REQUIRED for Text Search forwarding + matching key, final DB column]
- address (FULL street address with NUMBER + street + postal code + city) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search]
- type ("activity" | "lunch" | "dinner")
- latitude (= decimal 6 digits, e.g. 48.858370) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- longitude (= decimal 6 digits, e.g. 2.294481) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- price_eur (1 인 EUR)
- distance_km_from_center (= 도심 중심으로부터 직선거리 km = haversine = 소수 1 자리 = 동선 최적화 기본 필수)
- selection_reason_ko (한국어 한 줄 = 한국 여행객 트렌드 = 인스타 성지/한국 vlog 등 사회적 검증)
- shortform_ko (한국어 한 줄 = 장소에 대한 코믹/위트 = Claude 톤. 단순 정보 X = "프사각", "본전 뽑음" 같은 한국 슬랭)

OUTPUT (strict JSON, no markdown fences):
{"days":[{"day":1,"theme":"테마","places":[
  {"name":"Eiffel Tower","nameKo":"에펠탑","nameLocal":"Tour Eiffel","address":"Champ de Mars, 5 Av. Anatole France, 75007 Paris","type":"activity","latitude":48.858370,"longitude":2.294481,"price_eur":29.4,"distance_km_from_center":2.4,"selection_reason_ko":"파리 인스타 인증샷 1순위 성지","shortform_ko":"파리 왔으면 외쳐줘야 국룰 '나 파리다!'"}
]}]}`;

  try {
    // ⚠️ 수정금지(승인필요) 2026-06-01 = 사용자 SSOT = grounding 토글 (= 실측: grounding +8초 / JSON ~13초 = 모델 동일)
    // = false = responseMimeType JSON (빠름. 신규장소 = saveNewPlacesToDB 의 TS searchText 가 Google 재검증 = 환각 안전망)
    // = true  = googleSearch grounding (정확, 무명도시 강함, 느림). 롤백 = 이 1줄 true
    const STEP1_USE_GROUNDING = false;
    const step1Config: any = {
      temperature: 0.3,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    };
    if (STEP1_USE_GROUNDING) {
      step1Config.tools = [{ googleSearch: {} }];
    } else {
      step1Config.responseMimeType = "application/json"; // = grounding off 시 = JSON 강제 (= 파싱 안정 + 속도)
    }
    console.log(
      `[V3-Step1] 🤖 gemini-3-flash-preview ${STEP1_USE_GROUNDING ? "+ grounding" : "+ JSON"} (${prompt.length}자)...`,
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

    // ⚠️ 수정금지(승인필요) 2026-05-09 = 사용자 SSOT = AG2 1차 응답 raw 보관 (= 검수용)
    // = ENV DEBUG_PIPELINE_SNAPSHOT=1 일 때만 저장
    if (process.env.DEBUG_PIPELINE_SNAPSHOT === '1') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const outDir = `docs/db-only-${new Date().toISOString().slice(0, 10)}-gemini`;
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, 'ag2-raw.json');
        fs.writeFileSync(outPath, JSON.stringify({
          timestamp: new Date().toISOString(),
          formData_summary: {
            destination: formData.destination,
            startDate: formData.startDate,
            endDate: formData.endDate,
            startTime: formData.startTime,
            endTime: formData.endTime,
            companionType: formData.companionType,
            companionCount: formData.companionCount,
            curationFocus: formData.curationFocus,
            travelPace: formData.travelPace,
            travelStyle: formData.travelStyle,
            mobilityStyle: formData.mobilityStyle,
            vibes: formData.vibes,
          },
          prompt,
          raw_response: result,
          days_summary: days.map(d => ({
            day: d.day,
            theme: d.theme,
            placeCount: d.places?.length || 0,
            places: d.places?.map(p => ({
              name: p.name,
              nameKo: (p as any).nameKo,
              nameLocal: (p as any).nameLocal,
              type: p.type,
              startTime: p.startTime,
              endTime: p.endTime,
              price_eur: (p as any).price_eur,
              reason: p.reason,
            })) || [],
          })),
        }, null, 2));
        console.log(`[V3-Step1] 📝 AG2 raw 보관: ${outPath}`);
      } catch (e) {
        console.warn(`[V3-Step1] AG2 raw 보관 실패:`, (e as Error).message);
      }
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
      // ⚠️ 수정금지(승인필요) 2026-05-14 = v3 신규 필드 우선 매핑
      // = description = shortform_ko (= 후킹 카피) → 옛 reason 폴백
      // = personaFitReason = selection_reason_ko (= 인스타/FOMO) → 옛 reason 폴백
      const desc = gPlace.shortform_ko || gPlace.reason || '';
      const persona = gPlace.selection_reason_ko || gPlace.reason || 'AI 추천 장소';
      const place: PlaceResult = {
        id: placeId,
        name: gPlace.name || 'Unknown Place',
        description: desc,
        lat: 0,
        lng: 0,
        vibeScore: 7,
        confidenceScore: 5,
        // ⚠️ 수정금지(승인필요) 2026-05-14 = saveNewPlacesToDB 필터 호환 = 'Gemini AI (New)' 유지
        // = 'Gemini V3' 로 변경 시 = 필터 통과 X = toSave=0 = DB 자동 캐싱 X (= 운영 검증 시 발견)
        sourceType: 'Gemini AI (New)',
        personaFitReason: persona,
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
        // ⚠️ 수정금지(승인필요) 2026-05-14 = AG3 매칭용 + DB INSERT 매핑
        // = geminiAddress = 행정주소 (= 1순위 매칭 키)
        // = nameKo/nameLocal = saveNewPlacesToDB INSERT 매핑 (= 한국어/원어명 누락 방지)
        geminiAddress: gPlace.address || '',
        nameKo: gPlace.nameKo || null,
        nameLocal: gPlace.nameLocal || null,
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
  const matchedMap = new Map<string, PlaceResult>();
  for (const mp of matchedPlaces) {
    matchedMap.set(mp.id, mp);
  }
  console.log(`[V3-Step2] DB 매칭 완료 (${Date.now() - _t0}ms)`);

  // ⚠️ 수정금지(승인필요) 2026-05-20 = enrichFns 3 종 (= KoreanPopularity / TripAdvisor / Photo+Tour) 완전 폐기
  // = 사용자 SSOT = place_seed_raw 단일 테이블 + 보조 테이블 (places/tripAdvisorData/geminiWebSearchCache 등) = 쓰레기 = 폐기
  // = matchedPlaces (= AG2-DB 의 PlaceResult) 그대로 사용 + getRealityCheckForCity (= 날씨/위기 = 별도 도메인) 유지

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

  // ── 2d. Enrichment 결과 병합 + 셀럽 방문 검색 + nubiReason 생성 ──

  // ⚠️ 2026-05-23 = celebrity-tracker 폐기 = 빈 Map 유지 (= nubiReason 호출부 호환)
  const celebrityVisits = new Map<string, CelebrityVisit>();

  // ⚠️ 수정금지(승인필요) 2026-05-20 = 각 장소 = place_seed_raw 데이터 그대로 사용 (= ta/kr/ph 폐기)
  const finalPlaces = await Promise.all(matchedPlaces.map(async (p, i) => {
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
      // ⚠️ 2026-05-20 = ta/kr/ph 폐기 = place_seed_raw 데이터 그대로 (= p.<field>)
      estimatedPriceEur: resolvedPrice,
      priceEstimate: resolvedPrice > 0 ? `€${Math.round(resolvedPrice)}` : (p.priceEstimate ?? '무료'),
    };

    // ⚠️ 수정금지(승인필요) 2026-06-11 = summary_ko 흡수통합 = 후킹 숏폼 한줄요약(차별점) 단일 소스.
    //   = 옛 nubiReason 이름 폐기 → summaryKo 통일. seedData.summaryKo 우선 → 구글 리뷰수 폴백.
    merged.summaryKo = await generateNubiReasonV2(
      p.id, p.name, preloaded.cityName,
      null,
      merged,
      seedData
    );

    return merged;
  }));

  // ⚠️ 수정금지(승인필요) 2026-06-01 = 사용자 SSOT = 이미지 FE 노출 토글 (= 실 trip 입증 후 롤백 1줄)
  // = true  = fetch(TS+PM+Storage) await → 첫 trip 구글 이미지 노출(FE 최우선) + DB INSERT background(백필)
  // = false = 옛 동작 = 전부 background (= 첫 trip 이미지 0, 다음 trip DB hit). 롤백 = 이 1줄 false
  const AWAIT_NEW_PLACES_IMAGES = true;
  if (AWAIT_NEW_PLACES_IMAGES) {
    await saveNewPlacesToDB(finalPlaces, preloaded.cityId, { deferPersist: true }).catch(e =>
      console.error('[V3-Step2] ⚠️ saveNewPlacesToDB(await fetch) 실패:', e?.message || e)
    );
  } else {
    saveNewPlacesToDB(finalPlaces, preloaded.cityId).catch(e =>
      console.error('[V3-Step2] ⚠️ 백그라운드 saveNewPlacesToDB 실패:', e?.message || e)
    );
  }

  // ⚠️ 수정금지(승인필요) 2026-06-02 = 사용자 SSOT = 영구 폐업(TS) = FE 여정에서도 제외
  // = saveNewPlacesToDB 가 __closedPermanently 마커 (= AWAIT_NEW_PLACES_IMAGES=true 일 때만 await 완료)
  // = scheduleMap 의 해당 scene 제거 = 폐업 식당 FE 표시 0 (= 일별 스케줄 빌드 전이라 안전)
  const closedIds = new Set(
    finalPlaces.filter((p: any) => p.__closedPermanently).map((p: any) => p.id),
  );
  if (closedIds.size > 0) {
    const before = scheduleMap.length;
    for (let i = scheduleMap.length - 1; i >= 0; i--) {
      if (closedIds.has(scheduleMap[i].placeId)) scheduleMap.splice(i, 1);
    }
    console.log(`[V3-Step2] 🚫 영구 폐업 ${closedIds.size}곳 = FE scene 제거 (${before}→${scheduleMap.length})`);
  }

  // 최종 장소 맵 (= saveNewPlacesToDB 후 = 보강 결과 반영)
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
          ? (s.gPlace.price_eur > 0
            ? s.gPlace.price_eur
            : (s.gPlace.type === 'lunch' ? mealBudget.lunch : mealBudget.dinner))
          : undefined,
        mealPriceLabel: isMeal ? (s.gPlace.type === 'lunch' ? mealBudget.lunchLabel : mealBudget.dinnerLabel) : undefined,
        // Gemini의 한국어 이름 + 현지 원어명 + 추천이유
        nameKo: s.gPlace.nameKo,
        nameLocal: s.gPlace.nameLocal || null,
        // ⚠️ 수정금지(승인필요) 2026-06-11 = summary_ko 흡수통합 = 후킹 숏폼 한줄요약(차별점, 진하게 표시).
        //   = 옛 nubiReason/nubiEvidenceUrl(evidence_url)/nubiReasonSource(source_type)/instagram·tiktokPostUrl = 헛바퀴 컬럼 폐기 동반 제거.
        summaryKo: enrichedPlace.summaryKo || null,
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

  // ⚠️ 수정금지(승인필요) 2026-05-09 = saveNewPlacesToDB = 위로 이동 (= days 빌드 전) = 중복 호출 X

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
    },
  };

  // ⚠️ 수정금지(승인필요) 2026-05-20 = Verifier 완전 폐기 (= 사용자 SSOT = Gemini 0 강제)
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
    // ⚠️ 수정금지(승인필요) 2026-06-11 사용자 SSOT = summary_ko 흡수통합 (= 후킹 숏폼 한줄요약 = 앱 차별점).
    //   = 옛 nubi_reason/celeb_mention/패키지 순위 = 전부 헛바퀴(데드) 폐기 → summary_ko(ag3 SELECT:203 프로젝션) 단일 소스.
    //   = summary_ko 없으면 구글 리뷰수 폴백.
    if (seedData && seedData.summaryKo) {
      return seedData.summaryKo;
    }

    // ── 폴백: 구글 리뷰 수 ──
    const reviewCount = mergedData.userRatingCount || 0;
    if (reviewCount >= 50) {
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
 * 이동 정보 계산 = Haversine 만 (= 사용자 SSOT = Google Routes 완전 폐기)
 */
async function calcTransit(
  from: any, fromName: string, to: any,
  travelMode: 'WALK' | 'TRANSIT' | 'DRIVE', companionCount: number,
  transitNote?: string,
): Promise<any> {
  return haversineTransit(from, fromName, to, travelMode, companionCount, transitNote);
}

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

