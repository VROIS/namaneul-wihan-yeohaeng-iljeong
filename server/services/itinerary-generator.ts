// ⚠️ 수정금지(승인필요) 2026-05-20 = KoreanSentiment 완전 폐기 (= 사용자 SSOT)
import { GoogleGenAI } from "@google/genai";
import {
  generateProtagonistSentence,
  generatePromptContext,
} from "./protagonist-generator";
// ⚠️ 수정금지(승인필요) 2026-05-20 = Google Routes API 완전 폐기 (= 사용자 SSOT)
// ⚠️ 2026-07-06 사장님 SSOT = 숙소 재계산 이동 = MIX·DB-only 와 동일 계산법(§16/§20) = pickTransitMode(구간 거리 1km)·estimateTransitCost(구간 €3) 단일 SSOT.
import {
  calcTransitHaversine,
  haversineKm,
  pickTransitMode,
  estimateTransitCost,
} from "./agents/transit-haversine";
import { storage } from "../storage";
import { db } from "../db";
// ⚠️ 2026-05-23 = 폐기 테이블 import 모두 제거 (= 사용자 SSOT = PSR + cities 만)
import { cities, placeSeedRaw } from "@shared/schema";
import { eq, sql, ilike, and, desc, asc } from "drizzle-orm";
// ⚠️ 수정금지(승인필요) 2026-05-15 = Google Places SKU 가드 (= SSOT §16)
import { validateFieldMask } from "./shared/google-places-sku";
// ⚠️ 수정금지(승인필요) 2026-05-19 = MEAL_BUDGET 단일 SSOT (= types.ts) = 자체 정의 폐기
import { MEAL_BUDGET, type TravelStyle } from "./agents/types";
// ⚠️ 2026-07-04 사장님 SSOT = 숙소 재계산(regenerate)의 교통 판별·가격·표시 = 최초생성(pipeline-v3/ag4)과 동일 SSOT 재사용(§16 재발명금지).
//   = shouldApplyGuidePrice(이동+예산) 단일 판별 / calculateTransportPrice(가이드·대중교통 1인1일 SSOT) / calculateUberBlackHourly(가이드 비교값).
import {
  shouldApplyGuidePrice,
  calculateTransportPrice,
  calculateUberBlackHourly,
  guideCostForDay,
  buildDayConfig,
  round2,
  type GuidePriceResult,
  type TransitPriceResult,
} from "./transport-pricing-service";

// Lazy initialization - DB에서 API 키 로드 후 사용
let ai: GoogleGenAI | null = null;

function getGeminiApiKey(): string {
  return (
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  );
}

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.error("[Itinerary] ❌ Gemini API 키가 설정되지 않았습니다!");
      throw new Error(
        "Gemini API 키가 없습니다. 관리자 대시보드에서 API 키를 설정해주세요.",
      );
    }
    ai = new GoogleGenAI({ apiKey });
    console.log(
      `[Itinerary] ✅ Gemini AI 초기화 완료 (키 길이: ${apiKey.length}자)`,
    );
  }
  return ai;
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Romantic → Shopping
type Vibe =
  | "Healing"
  | "Adventure"
  | "Hotspot"
  | "Foodie"
  | "Shopping"
  | "Culture"
  | "Attraction"; // = 즐길거리(seed_category 'attraction') = agents/types Vibe 와 동기 (2026-06-06)
// ⚠️ 2026-05-19 = TravelStyle = types.ts SSOT 에서 import (= 위)
// 여행 밀도: 빡빡하게(Packed) | 보통(Normal) | 여유롭게(Relaxed)
// ⚠️ 프론트엔드 기준 'Normal' 사용 (Moderate 아님)
type TravelPace = "Packed" | "Normal" | "Relaxed";
type MobilityStyle = "WalkMore" | "Moderate" | "Minimal";
type CurationFocus = "Kids" | "Parents" | "Everyone" | "Self";

// ===== 사용자 시간 기반 슬롯 생성 로직 =====
// 핵심 규칙:
// 1. 사용자 출발시간/종료시간 = 절대 우선
// 2. 여행 밀도에 따라 슬롯 수 자동 계산
// 3. 2일 이상: 첫날(출발시간~21:00), 중간(09:00~21:00 풀타임), 마지막(09:00~종료시간)
interface PaceConfig {
  slotDurationMinutes: number; // 슬롯 당 소요시간 (이동시간 포함)
  maxSlotsPerDay: number; // 하루 최대 슬롯 수 (풀타임 12시간 기준)
}

// === 인원수 계산 (companionType 기반) ===
function getCompanionCount(companionType: string): number {
  const mapping: Record<string, number> = {
    Single: 1,
    Couple: 2,
    Family: 4,
    ExtendedFamily: 8, // 대가족 8명 (밴)
    Group: 10, // 친구 10명 (미니버스)
  };
  return mapping[companionType] || 1;
}

const PACE_CONFIG: Record<TravelPace, PaceConfig> = {
  Packed: {
    slotDurationMinutes: 90, // 1시간 30분
    maxSlotsPerDay: 8, // 12h ÷ 1.5h = 8곳
  },
  Normal: {
    slotDurationMinutes: 120, // 2시간
    maxSlotsPerDay: 6, // 12h ÷ 2h = 6곳
  },
  Relaxed: {
    slotDurationMinutes: 150, // 2시간 30분
    maxSlotsPerDay: 4, // 12h ÷ 2.5h ≈ 4곳
  },
};

// ===== 식사 슬롯 필수 포함 설정 =====
// 점심(12:00~14:00), 저녁(18:00~20:00)은 무조건 식당 배치
// 아침은 제외 (호텔 조식 등 가정)
interface MealSlotConfig {
  type: "lunch" | "dinner";
  startHour: number;
  endHour: number;
}

const MEAL_SLOTS: MealSlotConfig[] = [
  { type: "lunch", startHour: 12, endHour: 14 },
  { type: "dinner", startHour: 18, endHour: 20 },
];

// ===== 식당 선정 4대 원칙 (1차 목표 확정) =====
// 1순위: 슬롯 강제 (하루 점심1 + 저녁1, 그 이상 식당 배치 불가)
// 2순위: 동선 고려 (전후 장소와 가까운 식당 우선)
// 3순위: 예산 범위 (점심35%/저녁65% 배분, 공개가격 최대값 기준)
// 4순위: 유명세 가중치 (리뷰수50% + 한국리뷰30% + SNS20%)

// ⚠️ 2026-05-19 = MEAL_BUDGET 자체 정의 폐기 = types.ts SSOT (= 4:6 split) 단일 import (= 위)

/**
 * 장소가 식당/카페인지 확인
 */
function isFoodPlace(place: PlaceResult): boolean {
  const foodTags = [
    "restaurant",
    "cafe",
    "bakery",
    "food",
    "bar",
    "bistro",
    "brasserie",
  ];
  // ⚠️ vibeTags에 'Foodie'만 있는 것으로 식당 판단 금지!
  // AG2가 vibes에 Foodie 포함 시 관광지에도 Foodie 태그 부여 가능 → 모든 장소가 식당으로 분류되는 버그
  // 대신 tags, placeTypes, 이름으로만 판단 (더 정확)
  const hasFoodTag = place.tags?.some((t) =>
    foodTags.includes(t.toLowerCase()),
  );
  const hasFoodType = place.placeTypes?.some((t) =>
    foodTags.includes(t.toLowerCase()),
  );
  const nameHasFood =
    /레스토랑|식당|카페|비스트로|브라세리|restaurant|cafe|bistro|boulangerie|pâtisserie/i.test(
      place.name,
    );

  return hasFoodTag || hasFoodType || nameHasFood;
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = PSR rank tier offset (= ag2-DB SELECT 와 동기 강제)
// = Economic = rank 1~ / Reasonable = rank 1001~ / High-end = rank 2001~
const PSR_TIER_OFFSET = { Reasonable: 1000, HighEnd: 2000 } as const;
const RANK_FALLBACK = 999;
const NON_FOOD_MAX_RANK = 20;

function getTierOffset(rank: number): number {
  if (rank >= PSR_TIER_OFFSET.HighEnd + 1) return PSR_TIER_OFFSET.HighEnd;
  if (rank >= PSR_TIER_OFFSET.Reasonable + 1) return PSR_TIER_OFFSET.Reasonable;
  return 0;
}

// 식당 점수 = tier 안 1 등 = 10 점 / 20 등 = 0 점
async function calculateRestaurantScore(place: PlaceResult): Promise<number> {
  const rank = place.rank ?? RANK_FALLBACK;
  const tierRank = rank - getTierOffset(rank);
  return Math.max(0, Math.min(10, 11 - tierRank));
}

// ===== PlaceResult → Route Optimizer 호환 변환 =====
// route-optimizer.ts는 Place 타입 (latitude/longitude)을 기대하지만
// itinerary-generator에서는 PlaceResult (lat/lng)를 사용함
function toRoutablePlace(p: PlaceResult): {
  id: number;
  latitude: number;
  longitude: number;
  name: string;
} {
  return {
    id:
      typeof p.id === "number"
        ? p.id
        : parseInt(p.id) || Math.abs(hashCode(p.id || p.name)),
    latitude: p.lat,
    longitude: p.lng,
    name: p.name,
  };
}

// 문자열 → 숫자 해시 (PlaceResult.id가 문자열일 때)
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 동선 = "출발지 + N waypoint + 도착지"
// = 3 fix: (A) Haversine 거리 (= 옛 Euclidean 폐기 = 위도 왜곡 33%)
//          (B) NULL 좌표 행 = 사전 제외 + 마지막 슬롯 배치 (= "999km" 폭탄 0)
//          (C) 출발지 + 도착지 anchor (= 호텔 출발/귀환 cycle = nearest-neighbor start + 2-opt 종점 anchor)
// = Google Routes / Mapbox / or-tools = 외부 호출 0 = 자체 구현

// 🗑️ 2026-07-06 = _haversineKm 로컬정의 삭제 §19 = 공용 haversineKm(transit-haversine.ts) 단일 SSOT(§16) = optimizeDayRoute 순서최적화도 표시계산과 동일 거리함수(route-local 동형). 객체→4arg 호출로 전환.

function _hasValidCoord(p: { lat: number; lng: number }): boolean {
  return p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng);
}

/**
 * 일별 동선 최적화 = "출발지 + N waypoint + 도착지" 1 회 cycle
 * - NULL 좌표 행 = 사전 제외 + 마지막에 그대로 배치 (= "999km" 폭탄 차단)
 * - nearest-neighbor (출발지 시작) + 2-opt (종점 = 도착지 anchor)
 * - Haversine 거리 = 위도 왜곡 0
 */
function optimizeDayRoute(
  dayPlaces: PlaceResult[],
  departureCoords?: { lat: number; lng: number },
  returnCoords?: { lat: number; lng: number }, // 미지정 시 = 출발지 = 호텔 cycle
): PlaceResult[] {
  if (dayPlaces.length <= 2) return dayPlaces;

  // === Fix B = NULL 좌표 행 사전 제외 ===
  const valid = dayPlaces.filter(_hasValidCoord);
  const invalid = dayPlaces.filter((p) => !_hasValidCoord(p));
  if (invalid.length > 0) {
    console.warn(
      `[RouteOpt] ⚠️ NULL 좌표 ${invalid.length}곳 = optimize 제외 + 마지막 배치: ${invalid.map((p) => p.name).join(", ")}`,
    );
  }
  if (valid.length <= 1) return [...valid, ...invalid];

  // === Fix C = 출발지/도착지 anchor ===
  const start =
    departureCoords && _hasValidCoord(departureCoords)
      ? departureCoords
      : { lat: valid[0].lat, lng: valid[0].lng };
  const end =
    returnCoords && _hasValidCoord(returnCoords) ? returnCoords : start;

  // nearest-neighbor 시작 = 출발지에서 가장 가까운 행
  const remaining = [...valid];
  const optimized: PlaceResult[] = [];
  let current = start;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    optimized.push(remaining[nearestIdx]);
    current = {
      lat: remaining[nearestIdx].lat,
      lng: remaining[nearestIdx].lng,
    };
    remaining.splice(nearestIdx, 1);
  }

  // === Fix A = 2-opt + Haversine (= 도착지 anchor) ===
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (let i = 0; i < optimized.length - 1; i++) {
      for (let j = i + 2; j < optimized.length; j++) {
        const jNext =
          j + 1 < optimized.length
            ? { lat: optimized[j + 1].lat, lng: optimized[j + 1].lng }
            : end; // 종점 = 도착지 anchor
        const d1 = haversineKm(optimized[i].lat, optimized[i].lng, optimized[i + 1].lat, optimized[i + 1].lng);
        const d2 = haversineKm(optimized[j].lat, optimized[j].lng, jNext.lat, jNext.lng);
        const newD1 = haversineKm(optimized[i].lat, optimized[i].lng, optimized[j].lat, optimized[j].lng);
        const newD2 = haversineKm(optimized[i + 1].lat, optimized[i + 1].lng, jNext.lat, jNext.lng);
        if (newD1 + newD2 < d1 + d2) {
          const segment = optimized.slice(i + 1, j + 1).reverse();
          optimized.splice(i + 1, j - i, ...segment);
          improved = true;
        }
      }
    }
  }

  if (iterations > 1) {
    console.log(
      `[RouteOpt] 2-opt 개선 ${iterations}회 반복 (= Haversine + ${start.lat.toFixed(3)},${start.lng.toFixed(3)} 출발 / ${end.lat.toFixed(3)},${end.lng.toFixed(3)} 귀환)`,
    );
  }

  // NULL 좌표 행 = 마지막 슬롯 배치 (= 일자 끝 = 호텔 인근)
  return [...optimized, ...invalid];
}

// 기본 시작/종료 시간 (중간 날짜용)
const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "21:00";

/**
 * 가용 시간으로 슬롯 수 계산
 * @param startTime 시작시간 (HH:MM)
 * @param endTime 종료시간 (HH:MM)
 * @param pace 여행 밀도
 * @returns 슬롯 수
 */
function calculateSlotsForDay(
  startTime: string,
  endTime: string,
  pace: TravelPace,
): number {
  const config = PACE_CONFIG[pace];

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const availableMinutes = endMinutes - startMinutes;

  if (availableMinutes <= 0) return 0;

  const slots = Math.floor(availableMinutes / config.slotDurationMinutes);
  return Math.min(slots, config.maxSlotsPerDay);
}

interface TripFormData {
  birthDate: string;
  companionType: string;
  companionCount: number;
  companionAges: string;
  curationFocus: CurationFocus;
  destination: string;
  destinationCoords?: { lat: number; lng: number };
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  vibes: Vibe[];
  travelStyle: TravelStyle;
  travelPace: TravelPace;
  mobilityStyle: MobilityStyle;
  // 🏨 숙소 정보 (선택적 — 동선 최적화의 출발/종료 기준점)
  accommodationName?: string;
  accommodationAddress?: string;
  accommodationCoords?: { lat: number; lng: number };
  // Day별 개별 숙소 (이동형 여행 — 결과화면에서 설정)
  dayAccommodations?: Array<{
    day: number;
    name: string;
    address: string;
    coords: { lat: number; lng: number };
  }>;
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 점수 시스템 + MIX path 완전 폐기
// = PSR.rank 단일 SSOT = ag2-DB SELECT 가 카테고리/tier 별 RC DESC 정렬 = 이미 SSOT
// = 옛 vibeScore / confidenceScore / koreanPopularityScore / tripAdvisorRating /
//   photoSpotScore / isPackageTourIncluded = 모두 삭제 (= MIX 보조 = 쓰레기 의존)
interface PlaceResult {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  rank?: number; // PSR.rank (= 단일 SSOT)
  sourceType: string;
  personaFitReason: string;
  tags: string[];
  vibeTags: Vibe[];
  image: string;
  priceEstimate: string;
  placeTypes: string[];
  city?: string;
  region?: string;
  googleMapsUrl: string;
  estimatedPriceEur?: number; // PSR.price_eur 직접 복사
  finalScore?: number; // max(0, 21 - rank) = AG3 단순 부여
  selectionReasons?: string[];
  confidenceLevel?: "high" | "medium" | "low" | "minimal";
  dayZone?: "core" | "outskirt" | null;
}

/**
 * 분(minutes)을 HH:MM 형식으로 변환
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(Math.min(23, hours)).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function calculateVibeWeights(
  selectedVibes: Vibe[],
  protagonist: CurationFocus,
) {
  if (selectedVibes.length === 0) return [];

  const PRIORITY_WEIGHTS: Record<number, number[]> = {
    1: [100],
    2: [60, 40],
    3: [50, 30, 20],
  };

  const weights = PRIORITY_WEIGHTS[selectedVibes.length] || [50, 30, 20];

  return selectedVibes.map((vibe, index) => ({
    vibe,
    weight: weights[index] / 100,
    percentage: weights[index],
  }));
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = MIX path + 옛 점수 코드 완전 삭제
// = 옛 searchGooglePlaces / isFreePlace / isPackageTourPriceSource / enrichPlacesWith* = 모두 폐기
// = ag2-DB 가 place_seed_raw 직접 SELECT = Google Places / TripAdvisor / Gemini 호출 0
// = DB-only path = pipeline-db-only.ts 단일 분기 (= MIX = ag2:throw MIX_MODE_DISABLED)

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 점수 시스템 완전 폐기
// = VIBE_WEIGHT_MATRIX + DATA_GRADE_ADJUSTMENT + detectDataGrade + calculateDynamicWeights + calculateFinalScore = 모두 삭제
// = PSR.rank 단일 SSOT = ag2-DB 가 카테고리/tier 별 RC DESC 정렬 = 이미 정렬됨
// = AG3 = `finalScore = Math.max(0, 21 - place.rank)` 단순 부여

async function getRealityCheckForCity(
  _destination: string,
): Promise<{ weather: string; crowd: string; status: string }> {
  return { weather: "Sunny", crowd: "Medium", status: "Open" };
}

/**
 * Phase 1-6: 선정 이유 생성 (최소 2개) + 신뢰도 레벨 판단
 * 데이터 기반 이유 → AI 기반 이유 → 실용적 이유 순으로 채움
 */
function generateSelectionReasons(place: PlaceResult): {
  reasons: string[];
  confidence: "high" | "medium" | "low" | "minimal";
} {
  const reasons: string[] = [];
  let dataPoints = 0;

  // ⚠️ 수정금지(승인필요) 2026-05-24 = PSR.googleReviewCount = as any (= PlaceResult userRatingCount 옛 폐기 cascade)
  const _p = place as any;
  if (_p.userRatingCount && _p.userRatingCount > 100) {
    const count = _p.userRatingCount;
    const countText =
      count >= 10000
        ? `${(count / 1000).toFixed(0)}K`
        : count >= 1000
          ? `${(count / 1000).toFixed(1)}K`
          : count.toLocaleString();
    reasons.push(`구글 리뷰 ${countText}개`);
    dataPoints += 2;
  }

  // 가격 정보 (= PSR.price_eur 단일 SSOT)
  if (place.estimatedPriceEur !== undefined && place.estimatedPriceEur > 0) {
    reasons.push(`약 EUR${Math.round(place.estimatedPriceEur)}`);
    dataPoints += 1;
  }

  // 페르소나 매칭 이유
  if (place.personaFitReason && reasons.length < 4) {
    reasons.push(place.personaFitReason);
  }

  // 바이브 태그 기반
  if (place.vibeTags && place.vibeTags.length > 0 && reasons.length < 4) {
    const vibeLabels: Record<string, string> = {
      Healing: "힐링",
      Adventure: "모험",
      Hotspot: "핫플",
      Foodie: "미식",
      Shopping: "쇼핑",
      Culture: "문화",
    };
    const tags = place.vibeTags.map((v) => vibeLabels[v] || v).join(", ");
    reasons.push(`${tags} 분위기 매칭`);
  }

  // 최소 2개 보장
  if (reasons.length < 2 && place.description) {
    reasons.push(
      place.description.length > 60
        ? place.description.substring(0, 57) + "..."
        : place.description,
    );
  }
  if (reasons.length < 2) {
    reasons.push("여행 동선 최적화 기반 선정");
  }

  // ===== 신뢰도 레벨 =====
  // high: 3개 이상 데이터 소스 + 한국 인기도 있음
  // medium: 2개 데이터 소스 또는 TripAdvisor 데이터 있음
  // low: 1개 데이터 소스
  // minimal: 데이터 없음, AI 추천만
  let confidence: "high" | "medium" | "low" | "minimal";
  if (dataPoints >= 4) {
    confidence = "high";
  } else if (dataPoints >= 2) {
    confidence = "medium";
  } else if (dataPoints >= 1) {
    confidence = "low";
  } else {
    confidence = "minimal";
  }

  return { reasons: reasons.slice(0, 5), confidence }; // 최대 5개
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = MIX path helper 모두 폐기
// = 옛 getPlaceTypesForVibes / calculatePlaceVibeScore / getPersonaFitReason /
//   mapPlaceTypesToVibes / getPriceEstimate = 모두 삭제

function calculateDayCount(startDate: string, endDate: string): number {
  console.log(
    `[Itinerary] Date inputs: startDate="${startDate}", endDate="${endDate}"`,
  );
  const start = new Date(startDate);
  const end = new Date(endDate);
  console.log(
    `[Itinerary] Parsed dates: start=${start.toISOString()}, end=${end.toISOString()}`,
  );
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  console.log(`[Itinerary] Calculated dayCount: ${dayCount}`);
  return dayCount;
}

function groupPlacesByCity(places: PlaceResult[]): Map<string, PlaceResult[]> {
  const cityGroups = new Map<string, PlaceResult[]>();

  for (const place of places) {
    const city = place.city || "Unknown";
    if (!cityGroups.has(city)) {
      cityGroups.set(city, []);
    }
    cityGroups.get(city)!.push(place);
  }

  return cityGroups;
}

function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function optimizeCityOrder(cityGroups: Map<string, PlaceResult[]>): string[] {
  const cities = Array.from(cityGroups.keys());
  if (cities.length <= 1) return cities;

  const cityCoords = new Map<string, { lat: number; lng: number }>();
  for (const [city, places] of cityGroups) {
    const avgLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
    const avgLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
    cityCoords.set(city, { lat: avgLat, lng: avgLng });
  }

  const ordered: string[] = [cities[0]];
  const remaining = new Set(cities.slice(1));

  while (remaining.size > 0) {
    const lastCity = ordered[ordered.length - 1];
    const lastCoords = cityCoords.get(lastCity)!;

    let nearestCity = "";
    let minDistance = Infinity;

    for (const city of remaining) {
      const coords = cityCoords.get(city)!;
      const dist = calculateDistance(
        lastCoords.lat,
        lastCoords.lng,
        coords.lat,
        coords.lng,
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestCity = city;
      }
    }

    ordered.push(nearestCity);
    remaining.delete(nearestCity);
  }

  return ordered;
}

/**
 * ===== Pipeline V3: 2단계 파이프라인 진입점 =====
 *
 * Step 1: Gemini 완전 일정 생성 (일차별/동선별, 3~5초)
 * Step 2: 데이터 채우기 (DB매칭+enrichment+실시간, 2~4초 병렬)
 *
 * 기존 4-Agent 순차 12~18초 → 2단계 병렬 5~9초
 */
// ⚠️ 수정금지(승인필요) 2026-05-20 = Verifier 완전 폐기 = 1 회 재시도 제거 (= 사용자 SSOT)
export async function generateItinerary(formData: TripFormData) {
  const { runPipelineV3 } = await import("./agents/pipeline-v3");
  return await runPipelineV3(formData as any);
}

/**
 * ===== AG3용 enrichment 파이프라인 내보내기 =====
 * 오케스트레이터에서 기존 enrichment 함수들을 호출하기 위한 래퍼
 */
export const _enrichmentPipeline = {
  async runFullEnrichment(
    placesArr: PlaceResult[],
    formData: TripFormData,
    skeleton: {
      daySlotsConfig: {
        day: number;
        startTime: string;
        endTime: string;
        slots: number;
      }[];
      travelPace: TravelPace;
      requiredPlaceCount: number;
    },
  ): Promise<{
    scoredPlaces: PlaceResult[];
    schedule: {
      day: number;
      slot: string;
      place: PlaceResult;
      startTime: string;
      endTime: string;
      isMealSlot: boolean;
      mealType?: "lunch" | "dinner";
    }[];
    realityCheck: { weather: string; crowd: string; status: string };
  }> {
    // ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = vibes 빈값 폴백 = 옛 Foodie→Shopping 교체(§19, 버튼 폐기).
    const vibes = formData.vibes || ["Shopping", "Culture", "Healing"];
    const { daySlotsConfig, travelPace, requiredPlaceCount } = skeleton;

    // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 점수 시스템 완전 폐기
    // = PSR.rank 단일 (= ag2-DB 가 카테고리/tier 별 RC 정렬 = 이미 SSOT)
    // = 옛 calculateFinalScore + calculateDynamicWeights + VIBE_WEIGHT_MATRIX + detectDataGrade = 모두 폐기
    console.log(
      `[AG3] PSR.rank 단일 SSOT (= 옛 점수 시스템 폐기) | 바이브: ${vibes.join(",")}`,
    );

    placesArr = placesArr
      .map((p) => {
        const { reasons, confidence } = generateSelectionReasons(p);
        const rank = p.rank ?? RANK_FALLBACK;
        return {
          ...p,
          finalScore: Math.max(0, NON_FOOD_MAX_RANK + 1 - rank),
          selectionReasons: reasons,
          confidenceLevel: confidence,
        };
      })
      .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
      .slice(0, requiredPlaceCount + 5);

    placesArr.slice(0, 5).forEach((p, i) => {
      console.log(
        `[AG3]   #${i + 1} ${p.name}: rank=${p.rank ?? "?"} finalScore=${(p.finalScore || 0).toFixed(2)}`,
      );
    });

    // 슬롯 분배
    console.log(
      `[AG3] 슬롯 분배 시작: ${placesArr.length}곳 → ${daySlotsConfig.length}일 (pace: ${travelPace})`,
    );
    console.log(
      `[AG3] 식당: ${placesArr.filter((p) => isFoodPlace(p)).length}곳, 일반: ${placesArr.filter((p) => !isFoodPlace(p)).length}곳`,
    );

    const schedule = await distributePlacesWithUserTime(
      placesArr,
      daySlotsConfig,
      travelPace,
      formData.travelStyle || "Reasonable",
    );

    console.log(`[AG3] 슬롯 분배 완료: ${schedule.length}개`);
    if (schedule.length === 0) {
      console.error(
        `[AG3] ❌ 슬롯 분배 결과 0개! placesArr: ${placesArr.length}곳, daySlotsConfig: ${JSON.stringify(daySlotsConfig)}`,
      );
      // 비상 조치: 식당 태그 관계없이 모든 장소를 균등 분배
      console.log(`[AG3] 🚨 비상 분배 실행...`);
      let emergencySlotIdx = 0;
      for (const dayConfig of daySlotsConfig) {
        for (
          let i = 0;
          i < dayConfig.slots && emergencySlotIdx < placesArr.length;
          i++
        ) {
          const place = placesArr[emergencySlotIdx++];
          const startH = parseInt(dayConfig.startTime.split(":")[0]) + i * 2;
          schedule.push({
            day: dayConfig.day,
            slot:
              startH < 12
                ? "morning"
                : startH < 14
                  ? "lunch"
                  : startH < 18
                    ? "afternoon"
                    : "evening",
            place,
            startTime: `${startH.toString().padStart(2, "0")}:00`,
            endTime: `${(startH + 2).toString().padStart(2, "0")}:00`,
            isMealSlot: false,
            mealType: undefined,
          });
        }
      }
      console.log(`[AG3] 🚨 비상 분배 결과: ${schedule.length}개`);
    }

    // 동선 최적화
    const dayCount = daySlotsConfig.length;
    for (let d = 1; d <= dayCount; d++) {
      const daySlots = schedule.filter((s) => s.day === d);
      const nonMealPlaces = daySlots
        .filter((s) => !s.isMealSlot)
        .map((s) => s.place);

      if (nonMealPlaces.length > 2) {
        const dayAccom = formData.dayAccommodations?.find((a) => a.day === d);
        const depCoords =
          dayAccom?.coords ||
          formData.accommodationCoords ||
          formData.destinationCoords;
        const optimized = optimizeDayRoute(nonMealPlaces, depCoords);

        let optIdx = 0;
        for (const slot of daySlots) {
          if (!slot.isMealSlot && optIdx < optimized.length) {
            slot.place = optimized[optIdx];
            optIdx++;
          }
        }
      }
    }

    // 날씨/위기 데이터
    const realityCheck = await getRealityCheckForCity(formData.destination);

    return { scoredPlaces: placesArr, schedule, realityCheck };
  },
};

/**
 * 사용자 시간 기반으로 장소를 슬롯에 분배
 *
 * ===== 식당 선정 4대 원칙 (1차 목표 확정) =====
 * 1순위: 슬롯 강제 — 하루 점심 1개 + 저녁 1개, 그 외 슬롯에 식당 배치 불가
 * 2순위: 동선 고려 — 전후 장소와 가까운 식당 우선 선택
 * 3순위: 예산 범위 — 점심 35% / 저녁 65% 배분, 공개가격 최대값 기준
 * 4순위: 유명세 가중치 — 리뷰수(50%) + 한국리뷰(30%) + SNS(20%)
 */
async function distributePlacesWithUserTime(
  places: PlaceResult[],
  daySlotsConfig: {
    day: number;
    startTime: string;
    endTime: string;
    slots: number;
  }[],
  travelPace: TravelPace,
  travelStyle: TravelStyle = "Reasonable",
): Promise<
  {
    day: number;
    slot: string;
    place: PlaceResult;
    startTime: string;
    endTime: string;
    isMealSlot: boolean;
    mealType?: "lunch" | "dinner";
  }[]
> {
  const schedule: {
    day: number;
    slot: string;
    place: PlaceResult;
    startTime: string;
    endTime: string;
    isMealSlot: boolean;
    mealType?: "lunch" | "dinner";
  }[] = [];
  const paceConfig = PACE_CONFIG[travelPace];

  // 🍽️ 식당/카페 장소 분리 (식당은 오직 점심/저녁 슬롯에만 사용)
  const foodPlaces = places.filter((p) => isFoodPlace(p));
  const nonFoodPlaces = places.filter((p) => !isFoodPlace(p));

  console.log(
    `[Itinerary] 🍽️ 식사 장소: ${foodPlaces.length}곳, 일반 장소: ${nonFoodPlaces.length}곳 (총 ${places.length}곳)`,
  );
  if (foodPlaces.length > 0) {
    console.log(
      `[Itinerary]   식당 목록: ${foodPlaces.map((p) => `${p.name}(tags:${p.tags?.join(",") || "없음"})`).join(", ")}`,
    );
  }
  if (nonFoodPlaces.length === 0) {
    console.error(`[Itinerary] ❌ 일반 장소 0곳! 전체 장소 태그 점검:`);
    places.forEach((p) => {
      console.log(
        `  - ${p.name}: tags=${JSON.stringify(p.tags)}, placeTypes=${JSON.stringify(p.placeTypes)}, vibeTags=${JSON.stringify(p.vibeTags)}`,
      );
    });
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-2 = 일자별 zone 매핑 + 비식당 클러스터링 (= 사용자 SSOT)
  // = dayCount 기반 zone = Day 1 core / Day 2 outskirt / Day 3+ mixed = 자연 클러스터링

  const dayCount = daySlotsConfig.length;
  const dayZoneMap: Array<"core" | "outskirt" | "mixed"> = [];
  for (let d = 0; d < dayCount; d++) {
    if (dayCount === 1) dayZoneMap.push("core");
    else if (d === 0) dayZoneMap.push("core");
    else if (d === 1) dayZoneMap.push("outskirt");
    else dayZoneMap.push("mixed");
  }
  console.log(
    `[Itinerary] 🗺️ 일자별 zone 매핑: ${dayZoneMap.map((z, i) => `Day ${i + 1}=${z}`).join(" / ")}`,
  );

  // 비식당 + 식당 zone 분리 (= PlaceResult.dayZone = 'core' / 'outskirt' / null)
  const coreNonFood = nonFoodPlaces.filter((p) => p.dayZone !== "outskirt");
  const outskirtNonFood = nonFoodPlaces.filter((p) => p.dayZone === "outskirt");
  const coreFood = foodPlaces.filter((p) => p.dayZone !== "outskirt");
  const outskirtFood = foodPlaces.filter((p) => p.dayZone === "outskirt");
  console.log(
    `[Itinerary] 🌿 비식당 zone: core ${coreNonFood.length} / outskirt ${outskirtNonFood.length} | 🍽️ 식당 zone: core ${coreFood.length} / outskirt ${outskirtFood.length}`,
  );

  // 일자별 풀 = zone 정책 적용 (= mixed = core + outskirt 합쳐서 = nearest-neighbor)
  const dayPools: PlaceResult[][] = dayZoneMap.map((zone) => {
    if (zone === "core") return [...coreNonFood];
    if (zone === "outskirt") return [...outskirtNonFood];
    return [...coreNonFood, ...outskirtNonFood]; // mixed
  });

  // === 4순위: 식당 유명세 점수 계산 ===
  const foodWithScores: { place: PlaceResult; restaurantScore: number }[] = [];
  for (const fp of foodPlaces) {
    const score = await calculateRestaurantScore(fp);
    foodWithScores.push({ place: fp, restaurantScore: score });
  }

  console.log(
    `[Itinerary] 🍽️ 식당 점수 계산 완료 (${foodWithScores.length}곳, 상위: ${foodWithScores
      .sort((a, b) => b.restaurantScore - a.restaurantScore)
      .slice(0, 3)
      .map((f) => `${f.place.name}=${f.restaurantScore.toFixed(1)}`)
      .join(", ")})`,
  );

  // === 식사 예산 정보 (35:65 비율) ===
  const mealBudget = MEAL_BUDGET[travelStyle];

  /**
   * ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-3 = 식당 선정 단순화 (= 사용자 SSOT)
   * = 옛 가중치 (= 동선 40% + 예산 30% + 유명세 30%) 폐기 (= AG2-DB 풀이 이미 유명세 반영)
   * = 새 = 이전 슬롯에서 가장 가까운 식당 (= Haversine 거리) + 가격대 필터 (= 초과 제외)
   */
  function selectBestRestaurant(
    candidates: { place: PlaceResult; restaurantScore: number }[],
    prevPlace: PlaceResult | null,
    mealBudgetMax: number,
    usedIds: Set<string>,
  ): { place: PlaceResult; restaurantScore: number } | null {
    // 사용된 식당 제외
    const available = candidates.filter((c) => !usedIds.has(c.place.id));
    if (available.length === 0) return null;

    // 1. 가격대 필터 (= mealBudgetMax 초과 = 30% 이내 허용 = 그 외 제외)
    const inBudget = available.filter((c) => {
      const price = c.place.estimatedPriceEur;
      if (price === undefined || price <= 0) return true; // 가격 정보 X = 통과 (= 풀 자체 신뢰)
      return price <= mealBudgetMax * 1.3; // 30% 이내 초과 허용
    });
    const pool = inBudget.length > 0 ? inBudget : available; // 모두 초과 시 fallback

    // ⚠️ 수정금지(승인필요) 2026-05-21 = 이전 슬롯 좌표 = 가장 가까운 식당 (= Haversine = 위도/경도 정확 거리)
    // = 옛 Euclidean (= 평면 근사) = lng 거리 과대평가 (= 위도 48° → lng 1° = 74km ≠ lat 1° = 111km) = 시정
    if (!prevPlace || !prevPlace.lat || !prevPlace.lng) {
      const winner = pool[0];
      console.log(
        `[Restaurant선정] ${winner.place.name}: 이전슬롯 X = 1등 (€${winner.place.estimatedPriceEur ?? "?"})`,
      );
      return winner;
    }

    const scored = pool.map((c) => {
      const distKm =
        c.place.lat && c.place.lng
          ? haversineKm(prevPlace.lat, prevPlace.lng, c.place.lat, c.place.lng)
          : 999;
      return { ...c, distKm };
    });
    scored.sort((a, b) => a.distKm - b.distKm);
    const winner = scored[0];
    console.log(
      `[Restaurant선정] ${winner.place.name}: 거리=${winner.distKm.toFixed(2)}km (€${winner.place.estimatedPriceEur ?? "?"} ≤ €${mealBudgetMax})`,
    );
    return winner;
  }

  // === 사용된 식당 ID 추적 (중복 배치 방지) ===
  const usedFoodIds = new Set<string>();
  // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 전역 비식당 중복 차단 (= 일자 간 = Day 1 Eiffel + Day 3 Eiffel 사고 차단)
  const usedNonFoodIds = new Set<string>();

  // === 기본 식당 placeholder 생성 함수 ===
  // ⚠️ 좌표: refPlace가 없거나 좌표가 0,0이면 같은 Day의 다른 장소 좌표 사용 (10875분 버그 방지)
  function createDefaultRestaurant(
    type: "lunch" | "dinner",
    refPlace: PlaceResult | null,
  ): PlaceResult {
    const typeLabel = type === "lunch" ? "점심" : "저녁";
    const budget = type === "lunch" ? mealBudget.lunch : mealBudget.dinner;
    const budgetLabel =
      type === "lunch" ? mealBudget.lunchLabel : mealBudget.dinnerLabel;
    // 좌표 결정: refPlace → 전체 장소 중 유효 좌표 → 기본값(파리 중심)
    let fallbackLat = 48.8566;
    let fallbackLng = 2.3522;
    if (refPlace && refPlace.lat !== 0 && refPlace.lng !== 0) {
      fallbackLat = refPlace.lat;
      fallbackLng = refPlace.lng;
    } else {
      // 모든 장소 중 유효 좌표 찾기
      const anyValid = places.find((p) => p.lat !== 0 && p.lng !== 0);
      if (anyValid) {
        fallbackLat = anyValid.lat;
        fallbackLng = anyValid.lng;
      }
    }
    return {
      id: `default-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `현지 인기 ${typeLabel} 식당`,
      description: `${budgetLabel} 예산 내 현지 맛집 추천 (동선 고려)`,
      lat: fallbackLat,
      lng: fallbackLng,
      sourceType: "Default",
      personaFitReason: `${budgetLabel} 예산에 맞는 현지 맛집`,
      tags: ["restaurant", "food"],
      vibeTags: ["Foodie"],
      image: "",
      priceEstimate: budgetLabel,
      placeTypes: ["restaurant"],
      city: refPlace?.city,
      region: refPlace?.region,
      googleMapsUrl: "",
      estimatedPriceEur: budget,
    };
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-2 = 일자별 풀 인덱스 (= 옛 nonFoodIndex 단일 → 일자별 분리)
  const dayPoolIndex: number[] = dayPools.map(() => 0);

  for (let dIdx = 0; dIdx < daySlotsConfig.length; dIdx++) {
    const dayConfig = daySlotsConfig[dIdx];
    const { day, startTime, endTime, slots } = dayConfig;
    const dayZone = dayZoneMap[dIdx]; // 본 일자 zone (= 'core' / 'outskirt' / 'mixed')
    const dayPool = dayPools[dIdx]; // 본 일자 비식당 풀

    // 본 일자 식당 풀 (= dayZone 매칭 + 부족 시 다른 zone fallback)
    const primaryFoodPool: PlaceResult[] =
      dayZone === "outskirt"
        ? outskirtFood
        : dayZone === "core"
          ? coreFood
          : [...coreFood, ...outskirtFood];
    const dayFoodWithScores = foodWithScores.filter((fs) =>
      primaryFoodPool.some((fp) => fp.id === fs.place.id),
    );

    console.log(
      `[Itinerary] === Day ${day} (zone=${dayZone}) = 비식당 풀 ${dayPool.length} + 식당 풀 ${dayFoodWithScores.length} ===`,
    );

    // === 1순위: 하루 점심 1개 + 저녁 1개 강제 (절대 규칙) ===
    let lunchAssigned = false;
    let dinnerAssigned = false;

    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const dayStartMinutes = startH * 60 + startM;
    const dayEndMinutes = endH * 60 + endM;

    let currentMinutes = dayStartMinutes;
    let prevPlaceInDay: PlaceResult | null = null; // 동선 계산용

    for (let slotIdx = 0; slotIdx < slots; slotIdx++) {
      const slotStart = minutesToTime(currentMinutes);
      currentMinutes += paceConfig.slotDurationMinutes;
      const slotEnd = minutesToTime(Math.min(currentMinutes, dayEndMinutes));

      const slotStartMinutes = currentMinutes - paceConfig.slotDurationMinutes;
      const slotEndMinutes = currentMinutes;
      const slotMidMinutes = Math.round(
        (slotStartMinutes + slotEndMinutes) / 2,
      );
      const slotMidHour = slotMidMinutes / 60;
      const slotHour = parseInt(slotStart.split(":")[0]);

      let slotType: "morning" | "lunch" | "afternoon" | "evening";
      if (slotMidHour < 12) slotType = "morning";
      else if (slotMidHour < 14.5) slotType = "lunch";
      else if (slotMidHour < 18) slotType = "afternoon";
      else slotType = "evening";

      // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = 저녁 = 시간 고정 X = 일일 마지막 슬롯 = 무조건 dinner
      // = 마지막 슬롯 = dinner 우선 (= lunch 보다 = 짧은 일정 = 점심 양보 = dinner 강제)
      // = 점심 = 마지막 슬롯 외 + lunch window (= 11:30-14:00) 첫 매칭 슬롯
      let isMealSlot = false;
      let mealType: "lunch" | "dinner" | undefined;

      const lunchWindowStart = 11.5 * 60; // 11:30
      const lunchWindowEnd = 14 * 60; // 14:00
      const isLastSlot = slotIdx === slots - 1;

      if (isLastSlot && !dinnerAssigned) {
        isMealSlot = true;
        mealType = "dinner";
        dinnerAssigned = true;
      } else if (
        slotMidMinutes >= lunchWindowStart &&
        slotMidMinutes <= lunchWindowEnd &&
        !lunchAssigned
      ) {
        isMealSlot = true;
        mealType = "lunch";
        lunchAssigned = true;
      }

      let selectedPlace: PlaceResult;

      if (isMealSlot) {
        // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = zone pool 만 = fallback 제거
        // = 외곽 day 의 dinner = outskirt 식당만 (= core 식당 침투 차단 = 22km dinner 모순 시정)
        // = zone pool 소진 시 = placeholder (= 외곽 식당 부족 가시화)
        const budgetMax =
          mealType === "lunch" ? mealBudget.lunch : mealBudget.dinner;
        const bestFood = selectBestRestaurant(
          dayFoodWithScores,
          prevPlaceInDay,
          budgetMax,
          usedFoodIds,
        );

        if (bestFood) {
          selectedPlace = bestFood.place;
          usedFoodIds.add(bestFood.place.id);
          const budgetLabel =
            mealType === "lunch"
              ? mealBudget.lunchLabel
              : mealBudget.dinnerLabel;
          console.log(
            `[Itinerary] Day ${day} ${mealType}: ${selectedPlace.name} (${budgetLabel})`,
          );
        } else {
          selectedPlace = createDefaultRestaurant(mealType!, prevPlaceInDay);
          console.log(
            `[Itinerary] Day ${day} ${mealType}: placeholder 생성 (= zone='${dayZone}' 식당 부족)`,
          );
        }
      } else {
        // ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 전역 usedNonFoodIds = 일자 간 중복 차단
        // = dayPool 의 이미 used 행 = skip (= 다른 일자 동일 zone 풀 = 같은 장소 중복 방지)
        while (
          dayPoolIndex[dIdx] < dayPool.length &&
          usedNonFoodIds.has(dayPool[dayPoolIndex[dIdx]].id)
        ) {
          dayPoolIndex[dIdx]++;
        }
        if (dayPoolIndex[dIdx] < dayPool.length) {
          selectedPlace = dayPool[dayPoolIndex[dIdx]];
          usedNonFoodIds.add(selectedPlace.id);
          dayPoolIndex[dIdx]++;
        } else {
          // 본 일자 풀 소진 = fallback = 전역 미사용 비식당 (= 전역 Set 기반)
          const remainingNonFood = nonFoodPlaces.filter(
            (p) => !usedNonFoodIds.has(p.id),
          );
          if (remainingNonFood.length > 0) {
            selectedPlace = remainingNonFood[0];
            usedNonFoodIds.add(selectedPlace.id);
            console.log(
              `[Itinerary] Day ${day} slot ${slotIdx}: 일자 풀 소진 → 다른 일자 fallback: ${selectedPlace.name}`,
            );
          } else {
            // 모든 비식당 소진 = 남은 식당 fallback
            const remainingFood = foodWithScores.filter(
              (f) => !usedFoodIds.has(f.place.id),
            );
            if (remainingFood.length > 0) {
              const fallback = remainingFood[0];
              selectedPlace = fallback.place;
              usedFoodIds.add(fallback.place.id);
              console.log(
                `[Itinerary] Day ${day} slot ${slotIdx}: 모든 비식당 소진 → 식당 대체: ${selectedPlace.name}`,
              );
            } else {
              console.log(
                `[Itinerary] Day ${day} slot ${slotIdx}: 모든 장소 소진, 남은 슬롯 스킵`,
              );
              continue;
            }
          }
        }
      }

      prevPlaceInDay = selectedPlace; // 동선 계산용 이전 장소 업데이트

      schedule.push({
        day,
        slot: slotType,
        place: selectedPlace,
        startTime: slotStart,
        endTime: slotEnd,
        isMealSlot,
        mealType,
      });
    }
  }

  // 식사 슬롯 검증 로그
  const mealSlots = schedule.filter((s) => s.isMealSlot);
  const lunchCount = mealSlots.filter((s) => s.mealType === "lunch").length;
  const dinnerCount = mealSlots.filter((s) => s.mealType === "dinner").length;
  const totalDays = daySlotsConfig.length;
  console.log(
    `[Itinerary] 🍽️ 식사 배치 완료: ${totalDays}일 × (점심1+저녁1) = 점심${lunchCount}개 + 저녁${dinnerCount}개`,
  );
  console.log(
    `[Itinerary] 🍽️ 예산: 점심 ${mealBudget.lunchLabel}/인, 저녁 ${mealBudget.dinnerLabel}/인 (일일 총 €${mealBudget.dailyTotal}/인)`,
  );

  // 식당이 일반 슬롯에 들어갔는지 검증 (디버그)
  const nonMealFoodSlots = schedule.filter(
    (s) => !s.isMealSlot && isFoodPlace(s.place),
  );
  if (nonMealFoodSlots.length > 0) {
    console.log(
      `[Itinerary] ℹ️ 식당 ${nonMealFoodSlots.length}곳이 일반 슬롯에 대체 배치됨 (일반 장소 부족 시 정상)`,
    );
  }

  return schedule;
}

/**
 * Day별 동선 재최적화 (숙소 변경 시 호출)
 * - 기존 장소들을 유지하면서 숙소 기준으로 순서만 재배열
 * - 이동시간 재계산
 */
async function regenerateDay(params: {
  day: number;
  accommodationCoords?: { lat: number; lng: number };
  places: any[];
  formData?: any;
}): Promise<{
  day: number;
  places: any[];
  departureTransit?: any;
  returnTransit?: any;
  transit?: any;
  // ⚠️ 2026-07-04 사장님 SSOT = 화면이 실제 읽는 가격·교통표시 = 반드시 반환(없으면 숙소 재계산해도 칩·가격 stale = 버그 미해결).
  dailyCost?: any;
  transportDisplay?: any;
}> {
  const { day, accommodationCoords, places, formData } = params;

  if (!places || places.length === 0) {
    return { day, places: [] };
  }

  // 동선 최적화 (숙소 기준 nearest-neighbor + 2-opt)
  const nonMealPlaces = places.filter((p: any) => !p.isMealSlot);
  const mealPlaces = places.filter((p: any) => p.isMealSlot);

  let optimized = nonMealPlaces;
  if (nonMealPlaces.length > 2 && accommodationCoords) {
    optimized = optimizeDayRoute(nonMealPlaces, accommodationCoords);
  }

  // 식사 슬롯을 원래 위치에 다시 삽입
  const reordered: any[] = [];
  let optIdx = 0;
  for (const p of places) {
    if (p.isMealSlot) {
      reordered.push(p);
    } else if (optIdx < optimized.length) {
      reordered.push(optimized[optIdx]);
      optIdx++;
    }
  }

  // ⚠️ 2026-07-04 사장님 SSOT = 가이드 판별 = shouldApplyGuidePrice(이동+예산) 단일 SSOT(옛 mobilityStyle 3분기 폐기).
  const isGuideDay = shouldApplyGuidePrice(formData?.mobilityStyle, formData?.travelStyle);
  // 🗑️ 2026-07-06 = travelMode/feMode(하루 전체 고정 mode) 완전삭제 §19 = MIX·DB-only 처럼 구간별 pickTransitMode(거리 1km)로 mode 결정(§16/§20) = mobilityStyle 편향(전부 도보) 근본제거.
  const companionCount = formData
    ? getCompanionCount(formData.companionType || "Solo")
    : 2;

  // ⚠️ 수정금지(승인필요) 2026-05-20 = Google Routes API 폐기 = Haversine 자체 계산 (= 사용자 SSOT)
  // ⚠️ 2026-07-06 사장님 SSOT = 한 구간 계산 = MIX·DB-only 단일 SSOT(§16) = 거리(haversineKm)→pickTransitMode(1km 도보/초과 metro)→calcTransitHaversine(시간)→estimateTransitCost(구간 €3).
  //   center(숙소좌표) 전달 = DRIVE 도심/외곽 30·70km/h 분기. 가이드는 구간 cost 0(일 총합만), 대중교통은 구간 균일예상가.
  const center = accommodationCoords;
  const buildTransit = (from: { lat: number; lng: number }, fromName: string, to: { lat: number; lng: number }, toName: string) => {
    const km = round2(haversineKm(from.lat, from.lng, to.lat, to.lng));
    const { mode, calc } = pickTransitMode(km, isGuideDay);
    const tr = calcTransitHaversine({ ...from, name: fromName }, { ...to, name: toName }, calc, companionCount, center);
    const cost = isGuideDay ? 0 : estimateTransitCost(mode);
    return {
      from: fromName, to: toName,
      distance: Math.round(km * 1000),
      duration: tr.duration,
      durationText: `${tr.duration}분`,  // FE departure/return 폴백없이 읽음 = 필수
      mode,
      modeLabel: mode === 'walk' ? '도보' : mode === 'private_guide' ? '전용차량이동' : '지하철/버스',
      cost, costTotal: cost,
    };
  };

  // 숙소 → 첫 장소 (= 별도 필드, transits 배열엔 미포함). 숙소좌표 있을 때만.
  const departureTransit = accommodationCoords && reordered.length > 0
    ? buildTransit(accommodationCoords, "🏨 숙소", reordered[0], reordered[0].name)
    : undefined;

  // 장소 간 이동 = transits 배열 = n-1
  const transits: any[] = [];
  for (let i = 0; i < reordered.length - 1; i++) {
    transits.push(buildTransit(reordered[i], reordered[i].name, reordered[i + 1], reordered[i + 1].name));
  }

  // 마지막 장소 → 숙소 (= 별도 필드)
  const returnTransit = accommodationCoords && reordered.length > 0
    ? buildTransit(reordered[reordered.length - 1], reordered[reordered.length - 1].name, accommodationCoords, "🏨 숙소")
    : undefined;

  // 일 총합·우버비교용 = 전 구간(departure+between+return).
  const allTransits = [
    ...(departureTransit ? [departureTransit] : []),
    ...transits,
    ...(returnTransit ? [returnTransit] : []),
  ];

  // ⚠️ 2026-07-04 사장님 SSOT = 교통비·표시 = 최초생성(pipeline-v3:955~1066)과 동일 조립 = calculateTransportPrice 단일 SSOT(§16).
  //   옛 "구간 km × 정액" 합산 완전삭제(§0·§19). 가이드 하루요금·대중교통 하루요금 모두 이 함수가 1인1일로 계산.
  // ⚠️ 2026-07-04 사장님 SSOT = dayCount = 최초생성과 동일 계산(calculateDayCount) = startDate~endDate에서 도출.
  const dayCount = formData?.startDate && formData?.endDate
    ? calculateDayCount(formData.startDate, formData.endDate)
    : 1;
  // ⚠️ 2026-07-06 사장님 SSOT = 그 날 가용시각 = buildDayConfig 단일 SSOT(DB-only ag1 버퍼) = 최초생성과 동일 dayConfig(§16/§20).
  //   옛 formData 전체(버퍼 미반영) availableHours 폐기 §19 = 첫날/막날 가이드 요금 최초생성과 어긋나던 결함 근본해결.
  const dc = buildDayConfig(day, dayCount, formData?.startTime || DEFAULT_START_TIME, formData?.endTime || DEFAULT_END_TIME, DEFAULT_START_TIME, DEFAULT_END_TIME);
  const [sh, sm] = dc.startTime.split(":").map(Number);
  const [eh, em] = dc.endTime.split(":").map(Number);
  const availableHours = Math.max(4, round2((eh * 60 + em - (sh * 60 + sm)) / 60));

  // ⚠️ calculateTransportPrice = 대중교통 표시 부가정보(method/details/업셀·우버비교)의 SSOT. 교통비 '값'은 아래 가이드=날짜별/대중교통=구간합산으로 대체.
  const priceResult = await calculateTransportPrice({
    companionType: (formData?.companionType || "Couple") as any,
    companionCount,
    mobilityStyle: (formData?.mobilityStyle || "Moderate") as any,
    travelStyle: (formData?.travelStyle || "Reasonable") as any,
    availableHours,
    dayCount,
  });
  // ⚠️ 2026-07-06 사장님 SSOT = 1인 1일 교통비 = 가이드는 그 날 dayConfig 기준 재계산(guideCostForDay 공용, DB-only 동형), 대중교통은 구간별 합산(between).
  //   옛 가이드 flat(priceResult.perPersonPerDay = 전체 availableHours) 폐기 §19 = 첫날/막날 버퍼 미반영 결함 해소.
  const transportPerPersonPerDay = isGuideDay
    ? await guideCostForDay({ dayConfig: dc, companionType: (formData?.companionType || "Couple") as any, companionCount, mobilityStyle: (formData?.mobilityStyle || "Moderate") as any, travelStyle: (formData?.travelStyle || "Reasonable") as any, dayCount })
    : transits.reduce((s: number, t: any) => s + (t.cost || 0), 0);

  let transportDisplay: any;
  if (isGuideDay) {
    // 가이드: 구간별 비용 화면 숨김(일 총합만), 우버블랙 비교 조립(pipeline-v3:957~1013 정합)
    allTransits.forEach((t: any) => { t.cost = 0; t.costTotal = 0; });
    const routeSegments = allTransits.map((t: any) => {
      const hasRealData = t.distance > 0 && t.duration > 0;
      return {
        distanceKm: hasRealData ? round2((t.distance || 0) / 1000) : 3.0,
        durationMin: hasRealData ? (t.duration || 0) : 12,
      };
    });
    const uberBlackComp = routeSegments.length > 0
      ? calculateUberBlackHourly(availableHours, routeSegments, companionCount)
      : null;
    // KRW 필드는 제외 = 화면이 € 단독 표시(KRW 미참조 grep 0건) = 죽은 값 미복제(§0·§19). 환율 상수 재발명도 소멸(§16).
    transportDisplay = {
      category: "guide" as const,
      perPersonPerDay: transportPerPersonPerDay,
      uberBlackComparison: uberBlackComp ? {
        perPersonPerDay: uberBlackComp.perPersonPerDay,
        totalDistanceKm: uberBlackComp.totalDistanceKm,
        totalDurationMin: uberBlackComp.totalDurationMin,
      } : null,
      vehicleDescription: priceResult.category === "guide"
        ? (priceResult as GuidePriceResult).vehicleDescription : "전용 차량",
      notes: priceResult.notes || [],
    };
  } else {
    // 대중교통: 구간 상세 유지 + 가이드 업셀(클릭 가능) 조립(pipeline-v3:1014~1046 정합)
    const guideUpsell = priceResult.category === "transit"
      ? (priceResult as TransitPriceResult).guideUpsell : null;
    transportDisplay = {
      category: "transit" as const,
      perPersonPerDay: transportPerPersonPerDay,
      method: priceResult.category === "transit"
        ? (priceResult as TransitPriceResult).method : "대중교통",
      details: priceResult.category === "transit"
        ? (priceResult as TransitPriceResult).details : "",
      guideUpsell: guideUpsell ? {
        perPersonPerDay: guideUpsell.perPersonPerDay,
        vehicleDescription: guideUpsell.vehicleDescription,
        clickable: true,
      } : null,
      notes: priceResult.notes || [],
    };
  }

  // 식사·입장료 = 장소 집합 불변(순서만 바뀜) → 재계산 안전. 화면(dc.breakdown) 구조 그대로(pipeline-v3:1052~1065 정합).
  const mealEur = reordered.reduce((s: number, p: any) => s + (p.isMealSlot && p.mealPrice ? p.mealPrice : 0), 0);
  const entranceEur = reordered.reduce(
    (s: number, p: any) => s + (!p.isMealSlot && typeof p.estimatedPriceEur === "number" && p.estimatedPriceEur > 0 && p.estimatedPriceEur < 500 ? p.estimatedPriceEur : 0),
    0,
  );
  const perPersonEur = round2(mealEur + entranceEur + transportPerPersonPerDay);

  return {
    day,
    places: reordered,
    departureTransit,
    returnTransit,
    // ⚠️ 2026-07-06 = transits 배열(FE) = place 간(between)만 = n-1(MIX·DB-only 동형). departure/return = 별도 필드(위). 옛 allTransits(departure/return 포함 n+1) 폐기 §19.
    transit: {
      transits,
      totalDuration: transits.reduce((sum: number, t: any) => sum + t.duration, 0),
      totalCost: transits.reduce((sum: number, t: any) => sum + t.costTotal, 0),
      totalDistanceKm: round2(transits.reduce((sum: number, t: any) => sum + ((t.distance || 0) / 1000), 0)),
    },
    // ⚠️ 화면(요약헤더·일별카드)이 실제 읽는 두 필드 = 반드시 반환(없으면 숙소 재계산해도 가격·가이드칩 stale = 버그 미해결). KRW 미참조라 EUR만.
    dailyCost: {
      perPersonEur,
      breakdown: { mealEur, entranceEur, transportEur: transportPerPersonPerDay },
    },
    transportDisplay,
  };
}

export const itineraryGenerator = {
  generate: generateItinerary,
  regenerateDay,
};

// ⚠️ 수정금지(승인필요) 2026-05-20 = enrichmentFunctions = 3 enrichPlacesWith* 폐기 (= 사용자 SSOT = place_seed_raw 만)
// = getRealityCheckForCity 만 유지 (= 날씨/위기 = 별도 도메인)
export const enrichmentFunctions = {
  getRealityCheckForCity,
};
