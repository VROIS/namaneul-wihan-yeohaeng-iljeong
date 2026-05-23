// ⚠️ 수정금지(승인필요) 2026-05-20 = KoreanSentiment 완전 폐기 (= 사용자 SSOT)
import { GoogleGenAI } from "@google/genai";
import {
  generateProtagonistSentence,
  generatePromptContext
} from "./protagonist-generator";
// ⚠️ 수정금지(승인필요) 2026-05-20 = Google Routes API 완전 폐기 (= 사용자 SSOT)
import { calcTransitHaversine, haversineKm, type TravelMode } from "./agents/transit-haversine";
import { storage } from "../storage";
import { db } from "../db";
// ⚠️ 2026-05-23 = 폐기 테이블 import 모두 제거 (= 사용자 SSOT = PSR + cities 만)
import { cities, placeSeedRaw } from "@shared/schema";
import { eq, sql, ilike, and, desc, asc } from "drizzle-orm";
// ⚠️ 수정금지(승인필요) 2026-05-15 = Google Places SKU 가드 (= SSOT §16)
import { validateFieldMask } from "./shared/google-places-sku";
// ⚠️ 수정금지(승인필요) 2026-05-19 = MEAL_BUDGET 단일 SSOT (= types.ts) = 자체 정의 폐기
import { MEAL_BUDGET, type TravelStyle } from "./agents/types";

// Lazy initialization - DB에서 API 키 로드 후 사용
let ai: GoogleGenAI | null = null;

function getGeminiApiKey(): string {
  return process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.error('[Itinerary] ❌ Gemini API 키가 설정되지 않았습니다!');
      throw new Error('Gemini API 키가 없습니다. 관리자 대시보드에서 API 키를 설정해주세요.');
    }
    ai = new GoogleGenAI({ apiKey });
    console.log(`[Itinerary] ✅ Gemini AI 초기화 완료 (키 길이: ${apiKey.length}자)`);
  }
  return ai;
}

type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';
// ⚠️ 2026-05-19 = TravelStyle = types.ts SSOT 에서 import (= 위)
// 여행 밀도: 빡빡하게(Packed) | 보통(Normal) | 여유롭게(Relaxed)
// ⚠️ 프론트엔드 기준 'Normal' 사용 (Moderate 아님)
type TravelPace = 'Packed' | 'Normal' | 'Relaxed';
type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';
type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';

// ===== 사용자 시간 기반 슬롯 생성 로직 =====
// 핵심 규칙:
// 1. 사용자 출발시간/종료시간 = 절대 우선
// 2. 여행 밀도에 따라 슬롯 수 자동 계산
// 3. 2일 이상: 첫날(출발시간~21:00), 중간(09:00~21:00 풀타임), 마지막(09:00~종료시간)
interface PaceConfig {
  slotDurationMinutes: number;  // 슬롯 당 소요시간 (이동시간 포함)
  maxSlotsPerDay: number;       // 하루 최대 슬롯 수 (풀타임 12시간 기준)
}

// === 인원수 계산 (companionType 기반) ===
function getCompanionCount(companionType: string): number {
  const mapping: Record<string, number> = {
    Single: 1,
    Couple: 2,
    Family: 4,
    ExtendedFamily: 8,  // 대가족 8명 (밴)
    Group: 10,          // 친구 10명 (미니버스)
  };
  return mapping[companionType] || 1;
}

const PACE_CONFIG: Record<TravelPace, PaceConfig> = {
  Packed: {
    slotDurationMinutes: 90,    // 1시간 30분
    maxSlotsPerDay: 8,          // 12h ÷ 1.5h = 8곳
  },
  Normal: {
    slotDurationMinutes: 120,   // 2시간
    maxSlotsPerDay: 6,          // 12h ÷ 2h = 6곳
  },
  Relaxed: {
    slotDurationMinutes: 150,   // 2시간 30분
    maxSlotsPerDay: 4,          // 12h ÷ 2.5h ≈ 4곳
  },
};

// ===== 식사 슬롯 필수 포함 설정 =====
// 점심(12:00~14:00), 저녁(18:00~20:00)은 무조건 식당 배치
// 아침은 제외 (호텔 조식 등 가정)
interface MealSlotConfig {
  type: 'lunch' | 'dinner';
  startHour: number;
  endHour: number;
}

const MEAL_SLOTS: MealSlotConfig[] = [
  { type: 'lunch', startHour: 12, endHour: 14 },
  { type: 'dinner', startHour: 18, endHour: 20 },
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
  const foodTags = ['restaurant', 'cafe', 'bakery', 'food', 'bar', 'bistro', 'brasserie'];
  // ⚠️ vibeTags에 'Foodie'만 있는 것으로 식당 판단 금지! 
  // AG2가 vibes에 Foodie 포함 시 관광지에도 Foodie 태그 부여 가능 → 모든 장소가 식당으로 분류되는 버그
  // 대신 tags, placeTypes, 이름으로만 판단 (더 정확)
  const hasFoodTag = place.tags?.some(t => foodTags.includes(t.toLowerCase()));
  const hasFoodType = place.placeTypes?.some(t => foodTags.includes(t.toLowerCase()));
  const nameHasFood = /레스토랑|식당|카페|비스트로|브라세리|restaurant|cafe|bistro|boulangerie|pâtisserie/i.test(place.name);

  return hasFoodTag || hasFoodType || nameHasFood;
}

// ===== 식당 전용 점수 계산 (속도 최적화: DB 쿼리 최소화) =====
// AG3 matchPlacesWithDB에서 이미 DB 데이터를 보강했으므로 place 객체의 기존 데이터 활용
// DB 쿼리 0회 → 즉시 반환
async function calculateRestaurantScore(place: PlaceResult): Promise<number> {
  try {
    // AG3에서 이미 보강된 데이터 활용 (DB 쿼리 불필요)
    const confidenceScore = place.confidenceScore || 0;
    const vibeScore = place.vibeScore || 0;
    // koreanPopularity 제거 (45/30/25 폐기)
    const finalScore = place.finalScore || 0;

    // 간단 점수: 기존 보강 데이터 기반
    const score = (confidenceScore * 0.5) + (vibeScore * 0.3) + (finalScore * 0.2);
    return Math.min(10, Math.max(0, score));
  } catch (error) {
    console.warn(`[Restaurant] ${place.name} 점수 계산 실패:`, error);
    return place.vibeScore || 5;
  }
}

// ===== PlaceResult → Route Optimizer 호환 변환 =====
// route-optimizer.ts는 Place 타입 (latitude/longitude)을 기대하지만
// itinerary-generator에서는 PlaceResult (lat/lng)를 사용함
function toRoutablePlace(p: PlaceResult): { id: number; latitude: number; longitude: number; name: string } {
  return {
    id: typeof p.id === 'number' ? p.id : parseInt(p.id) || Math.abs(hashCode(p.id || p.name)),
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
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

/**
 * 일별 장소 순서 동선 최적화 (nearest-neighbor + 순환)
 * 출발지(첫 장소) → 가장 가까운 순서로 재배열
 * 식사 슬롯 시간대는 유지하면서 관광 슬롯만 재정렬
 */
function optimizeDayRoute(dayPlaces: PlaceResult[], departureCoords?: { lat: number; lng: number }): PlaceResult[] {
  if (dayPlaces.length <= 2) return dayPlaces;

  // 출발점 결정: 사용자 지정 좌표 또는 첫 번째 장소
  let startLat = dayPlaces[0].lat;
  let startLng = dayPlaces[0].lng;
  if (departureCoords && departureCoords.lat && departureCoords.lng) {
    startLat = departureCoords.lat;
    startLng = departureCoords.lng;
  }

  // nearest-neighbor 알고리즘
  const remaining = [...dayPlaces];
  const optimized: PlaceResult[] = [];

  // 출발점에서 가장 가까운 장소부터 시작
  let currentLat = startLat;
  let currentLng = startLng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = Math.sqrt(
        Math.pow(currentLat - remaining[i].lat, 2) +
        Math.pow(currentLng - remaining[i].lng, 2)
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    optimized.push(remaining[nearestIdx]);
    currentLat = remaining[nearestIdx].lat;
    currentLng = remaining[nearestIdx].lng;
    remaining.splice(nearestIdx, 1);
  }

  // 2-opt 개선: 교차 경로 제거 (간단한 버전)
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (let i = 0; i < optimized.length - 1; i++) {
      for (let j = i + 2; j < optimized.length; j++) {
        const d1 = Math.sqrt(
          Math.pow(optimized[i].lat - optimized[i + 1].lat, 2) +
          Math.pow(optimized[i].lng - optimized[i + 1].lng, 2)
        );
        const d2 = Math.sqrt(
          Math.pow(optimized[j].lat - (optimized[j + 1]?.lat || startLat), 2) +
          Math.pow(optimized[j].lng - (optimized[j + 1]?.lng || startLng), 2)
        );
        const newD1 = Math.sqrt(
          Math.pow(optimized[i].lat - optimized[j].lat, 2) +
          Math.pow(optimized[i].lng - optimized[j].lng, 2)
        );
        const newD2 = Math.sqrt(
          Math.pow(optimized[i + 1].lat - (optimized[j + 1]?.lat || startLat), 2) +
          Math.pow(optimized[i + 1].lng - (optimized[j + 1]?.lng || startLng), 2)
        );

        if (newD1 + newD2 < d1 + d2) {
          // i+1부터 j까지 구간 뒤집기
          const segment = optimized.slice(i + 1, j + 1).reverse();
          optimized.splice(i + 1, j - i, ...segment);
          improved = true;
        }
      }
    }
  }

  if (iterations > 1) {
    console.log(`[RouteOpt] 2-opt 개선 ${iterations}회 반복 완료`);
  }

  return optimized;
}

// 기본 시작/종료 시간 (중간 날짜용)
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '21:00';

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
  pace: TravelPace
): number {
  const config = PACE_CONFIG[pace];

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

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

interface PlaceResult {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  vibeScore: number;
  confidenceScore: number;
  sourceType: string;
  personaFitReason: string;
  tags: string[];
  vibeTags: Vibe[];
  image: string;
  priceEstimate: string;
  placeTypes: string[];
  city?: string;
  region?: string;
  // Phase 1: 한국인 인기도 점수 (인스타45% + 유튜브30% + 블로그25%)
  koreanPopularityScore: number;
  // Phase 4: 구글맵 직접 링크
  googleMapsUrl: string;
  // TripAdvisor 데이터 (DB에서 가져옴)
  tripAdvisorRating?: number;       // 1.0-5.0
  tripAdvisorReviewCount?: number;  // 총 리뷰 수
  tripAdvisorRanking?: string;      // "#5 of 1203"
  // 실제 가격 추정 (EUR) — 2026-05-15 = price_eur 단일 SSOT (priceSource 폐기)
  estimatedPriceEur?: number;       // 1인 입장료 + 1인 평균 식대 통합
  // Phase 1-3: 포토스팟 점수 (0-10)
  photoSpotScore?: number;
  photoTip?: string;
  bestPhotoTime?: string;
  // Phase 1-2: 패키지 투어 검증
  isPackageTourIncluded?: boolean;
  packageMentionCount?: number;
  // Phase 1-5: 최종 종합 점수
  finalScore?: number;
  // Phase 1-6: 선정 이유 + 신뢰도
  selectionReasons?: string[];        // 최소 2개 선정 이유
  confidenceLevel?: 'high' | 'medium' | 'low' | 'minimal'; // 데이터 신뢰도
  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E = dayZone (= place_seed_raw.day_zone) = 일자별 zone 매칭
  dayZone?: 'core' | 'outskirt' | null;
}

// 시간대별 Vibe 친화도 (향후 고급 슬롯 매칭에 사용 예정)
// interface TimeSlot { slot: 'morning' | 'lunch' | 'afternoon' | 'evening'; startTime: string; endTime: string; vibeAffinity: Vibe[]; }
// const SLOT_VIBE_AFFINITY = { morning: ['Healing', 'Culture', 'Adventure'], lunch: ['Foodie'], afternoon: ['Hotspot', 'Culture', 'Adventure', 'Healing'], evening: ['Foodie', 'Romantic'] };

/**
 * 분(minutes)을 HH:MM 형식으로 변환
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(Math.min(23, hours)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// 🎯 Vibe 기본 가중치 (향후 확장용, 현재 calculateVibeWeights에서 사용)
// const BASE_WEIGHTS: Record<Vibe, number> = { Healing: 35, Foodie: 25, Hotspot: 15, Culture: 10, Adventure: 10, Romantic: 5 };
// const PROTAGONIST_ADJUSTMENTS - 향후 고급 개인화에 사용 예정

function calculateVibeWeights(selectedVibes: Vibe[], protagonist: CurationFocus) {
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

async function searchGooglePlaces(
  destination: string,
  coords: { lat: number; lng: number } | undefined,
  vibes: Vibe[],
  travelStyle: TravelStyle
): Promise<PlaceResult[]> {
  const apiKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.log("Google Maps API key not available, using AI-generated places");
    return [];
  }

  const placeTypes = getPlaceTypesForVibes(vibes);
  const results: PlaceResult[] = [];

  for (const placeType of placeTypes.slice(0, 5)) {
    try {
      const searchUrl = new URL("https://places.googleapis.com/v1/places:searchNearby");

      const requestBody = {
        includedTypes: [placeType],
        maxResultCount: 10,
        // ⚠️ 수정금지(승인필요) 2026-05-15 = languageCode: 'ko' (= 한국어 displayName)
        languageCode: 'ko',
        locationRestriction: coords ? {
          circle: {
            center: { latitude: coords.lat, longitude: coords.lng },
            radius: 10000
          }
        } : undefined,
      };

      // ⚠️ FieldMask = Enterprise SKU = SSOT §16 허용. Atmosphere 금지.
      const NEARBY_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.userRatingCount,places.photos,places.googleMapsUri";
      validateFieldMask(NEARBY_FIELD_MASK);
      const response = await fetch(searchUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": NEARBY_FIELD_MASK,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.places) {
          for (const place of data.places) {
            results.push({
              id: place.id || `place-${Date.now()}-${Math.random()}`,
              name: place.displayName?.text || "Unknown Place",
              description: place.formattedAddress || "",
              lat: place.location?.latitude || 0,
              lng: place.location?.longitude || 0,
              vibeScore: calculatePlaceVibeScore(place, vibes),
              confidenceScore: Math.min(10, (place.userRatingCount || 0) / 100),
              sourceType: "Google Places",
              personaFitReason: getPersonaFitReason(place.types || [], vibes),
              tags: place.types?.slice(0, 3) || [],
              vibeTags: mapPlaceTypesToVibes(place.types || []),
              image: place.photos?.[0]?.name
                ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=400&key=${apiKey}`
                : "",
              priceEstimate: getPriceEstimate(undefined, travelStyle),
              placeTypes: place.types || [],
              koreanPopularityScore: 0, // 이후 enrichPlacesWithKoreanPopularity에서 계산
              googleMapsUrl: place.googleMapsUri || "", // Phase 4: 구글맵 직접 링크
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to search for ${placeType}:`, error);
    }
  }

  return results;
}


// ===== 무료 장소 판별 (광장·공원·핫스팟) =====
/** 패키지 투어 가격을 무료 장소에 적용하지 않기 위한 판별 */
function isFreePlace(place: { name?: string; nameKo?: string; placeTypes?: string[] }): boolean {
  const text = `${place.name || ''} ${place.nameKo || ''}`.toLowerCase();
  const freeKeywords = ['광장', '공원', '거리', 'square', 'park', 'plaza', 'place', 'viewpoint', '전망대', '산책로', 'gardens', 'garden'];
  return freeKeywords.some(k => text.includes(k));
}

/** 패키지 투어/투어 상품 가격 소스인지 판별 (무료 장소에 적용 금지) */
function isPackageTourPriceSource(source: string | undefined): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  return ['viator', 'klook', 'tour', 'tripdotcom', 'package'].some(k => s.includes(k));
}

// ⚠️ 수정금지(승인필요) 2026-05-20 = enrichPlacesWithTripAdvisorAndPrices + enrichPlacesWithPhotoAndTour 완전 폐기
// = 사용자 SSOT [[feedback_latest_is_truth_delete_old]] = 옛 264 줄 dead code 완전 삭제 (= tripAdvisorData/geminiWebSearchCache/places 보조 의존 = 쓰레기)
// = AG2-DB 가 place_seed_raw.priceEur + googleReviewCount + imageUrl + bestImageUrl 채움 = 충분

// ===== Phase 1-7: 바이브별 동적 가중치 매트릭스 =====
// 각 바이브가 선택되었을 때 6요소의 비중이 달라짐
// [koreanPop, photoSpot, verifiedFame, vibe, value, practical]
const VIBE_WEIGHT_MATRIX: Record<Vibe, [number, number, number, number, number, number]> = {
  Hotspot: [0.20, 0.35, 0.10, 0.15, 0.10, 0.10], // 포토스팟 최우선
  Romantic: [0.25, 0.30, 0.10, 0.20, 0.08, 0.07], // 포토+분위기 감성
  Culture: [0.15, 0.15, 0.30, 0.15, 0.15, 0.10], // 유명세(패키지/TA) 최우선
  Foodie: [0.20, 0.10, 0.15, 0.10, 0.20, 0.25], // 가성비+실용(리뷰수) 우선
  Healing: [0.10, 0.20, 0.10, 0.35, 0.10, 0.15], // 분위기(AI평가) 최우선
  Adventure: [0.15, 0.15, 0.15, 0.25, 0.15, 0.15], // 균등+분위기 약간 높음
};

// ===== 데이터 등급별 보정 매트릭스 =====
// 데이터 부족시 한국 데이터 의존도를 낮추고 AI/Google 의존도를 높임
// [koreanPop, photoSpot, verifiedFame, vibe, value, practical]
type DataGrade = 'A' | 'B' | 'C' | 'D';
const DATA_GRADE_ADJUSTMENT: Record<DataGrade, [number, number, number, number, number, number]> = {
  A: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0], // 데이터 풍부: 원래 가중치 그대로
  B: [0.7, 0.8, 1.0, 1.3, 0.9, 1.2], // 데이터 보통: 한국 데이터↓, AI↑
  C: [0.3, 0.4, 0.8, 2.0, 0.5, 1.8], // 데이터 부족: AI+Google 크게 의존
  D: [0.1, 0.1, 0.5, 2.5, 0.3, 2.2], // 데이터 없음: 거의 AI+Google만
};

/**
 * Phase 1-7: 데이터 등급 판단
 * 전체 장소 목록에서 한국 데이터가 얼마나 채워져 있는지 측정
 */
function detectDataGrade(placesArr: PlaceResult[]): DataGrade {
  if (placesArr.length === 0) return 'D';

  let hasKoreanPop = 0;
  let hasPhotoSpot = 0;
  let hasVerifiedFame = 0;
  let hasPrice = 0;

  for (const p of placesArr) {
    if (p.koreanPopularityScore && p.koreanPopularityScore > 0) hasKoreanPop++;
    if (p.photoSpotScore && p.photoSpotScore > 0) hasPhotoSpot++;
    if (p.isPackageTourIncluded || (p.tripAdvisorRating && p.tripAdvisorRating > 0)) hasVerifiedFame++;
    if (p.estimatedPriceEur && p.estimatedPriceEur > 0) hasPrice++;
  }

  const total = placesArr.length;
  const koreanRatio = hasKoreanPop / total;
  const photoRatio = hasPhotoSpot / total;
  const fameRatio = hasVerifiedFame / total;
  const priceRatio = hasPrice / total;
  const avgCoverage = (koreanRatio + photoRatio + fameRatio + priceRatio) / 4;

  if (avgCoverage >= 0.4) return 'A'; // 40%+ 데이터 커버리지
  if (avgCoverage >= 0.2) return 'B'; // 20%+
  if (avgCoverage >= 0.05) return 'C'; // 5%+
  return 'D'; // 거의 없음
}

/**
 * Phase 1-7: 바이브 기반 동적 가중치 계산
 * 사용자 선택 바이브 + 데이터 등급을 조합하여 최종 가중치 산출
 * 
 * @param vibes 사용자 선택 바이브 (1~3개, 순서 = 우선순위)
 * @param dataGrade 목적지의 데이터 밀도 등급
 * @returns 6요소 가중치 배열 (합계 = 1.0)
 */
function calculateDynamicWeights(
  vibes: Vibe[],
  dataGrade: DataGrade
): { koreanPop: number; photoSpot: number; verifiedFame: number; vibe: number; value: number; practical: number } {
  // 1. 바이브 가중치 블렌딩 (선택 순서에 따른 우선순위)
  const VIBE_PRIORITY: Record<number, number[]> = {
    1: [1.0],
    2: [0.60, 0.40],
    3: [0.50, 0.30, 0.20],
  };
  const priorities = VIBE_PRIORITY[vibes.length] || [0.50, 0.30, 0.20];

  // 블렌딩된 가중치 초기화
  let blended: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

  for (let i = 0; i < vibes.length && i < 3; i++) {
    const vibeMatrix = VIBE_WEIGHT_MATRIX[vibes[i]];
    const priority = priorities[i];
    for (let j = 0; j < 6; j++) {
      blended[j] += vibeMatrix[j] * priority;
    }
  }

  // 2. 데이터 등급 보정 적용
  const adjustment = DATA_GRADE_ADJUSTMENT[dataGrade];
  for (let j = 0; j < 6; j++) {
    blended[j] *= adjustment[j];
  }

  // 3. 정규화 (합계 = 1.0)
  const sum = blended.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (let j = 0; j < 6; j++) {
      blended[j] /= sum;
    }
  }

  return {
    koreanPop: blended[0],
    photoSpot: blended[1],
    verifiedFame: blended[2],
    vibe: blended[3],
    value: blended[4],
    practical: blended[5],
  };
}

/**
 * ⚠️ 2026-05-23 = weatherCache + crisisAlerts 의존 폐기 (= 사용자 SSOT)
 * = 기본값 반환 stub (= FE 영향 0 = 옛 응답 형식 유지)
 */
async function getRealityCheckForCity(_destination: string): Promise<{ weather: string; crowd: string; status: string }> {
  return { weather: 'Sunny', crowd: 'Medium', status: 'Open' };
}

/**
 * Phase 1-5+1-7: 최종 종합 점수 계산 (동적 6요소 공식)
 * 
 * 기존 고정 공식 → 바이브+데이터 등급에 따라 가중치가 자동 조정
 * 
 * 예시:
 *   Hotspot + A등급 → 포토35% > 한국인기20% > 분위기15% > ...
 *   Healing + C등급 → 분위기70% > 실용27% > ... (한국데이터 거의 무시)
 */
function calculateFinalScore(
  place: PlaceResult,
  weights: { koreanPop: number; photoSpot: number; verifiedFame: number; vibe: number; value: number; practical: number }
): number {
  // 1. 한국인 인기도 — 45/30/25 제거, nubiReason 우선노출순서 사용
  const koreanPop = 0;

  // 2. 포토스팟 점수 - enrichPlacesWithPhotoAndTour에서 세팅됨
  const photoSpot = Math.min(10, place.photoSpotScore || 0);

  // 3. 검증된 유명세 - 패키지 투어 + TripAdvisor
  let verifiedFame = 0;
  if (place.isPackageTourIncluded) {
    verifiedFame += Math.min(5, 3 + (place.packageMentionCount || 0));
  }
  if (place.tripAdvisorRating) {
    verifiedFame += place.tripAdvisorRating;
  }
  verifiedFame = Math.min(10, verifiedFame);

  // 4. 분위기 점수 - Gemini AI + Google 평점 기반
  const vibe = Math.min(10, place.vibeScore || 0);

  // 5. 가성비 점수
  let valueScore = 5;
  if (place.estimatedPriceEur !== undefined && place.estimatedPriceEur > 0) {
    valueScore = Math.max(2, 10 - Math.log10(place.estimatedPriceEur + 1) * 4);
    if (place.tripAdvisorRating && place.tripAdvisorRating >= 4.0 && place.estimatedPriceEur < 30) {
      valueScore = Math.min(10, valueScore + 2);
    }
  }

  // 6. 실용성 점수
  let practicalScore = 3;
  if (place.tripAdvisorReviewCount) {
    practicalScore = Math.min(10, Math.log10(place.tripAdvisorReviewCount + 1) * 3.3);
  }
  // koreanPop 제거 (45/30/25 점수 폐기)

  // ===== 동적 가중치 합산 =====
  const finalScore =
    (koreanPop * weights.koreanPop) +
    (photoSpot * weights.photoSpot) +
    (verifiedFame * weights.verifiedFame) +
    (vibe * weights.vibe) +
    (valueScore * weights.value) +
    (practicalScore * weights.practical);

  return Math.min(10, finalScore);
}

/**
 * Phase 1-6: 선정 이유 생성 (최소 2개) + 신뢰도 레벨 판단
 * 데이터 기반 이유 → AI 기반 이유 → 실용적 이유 순으로 채움
 */
function generateSelectionReasons(place: PlaceResult): { reasons: string[]; confidence: 'high' | 'medium' | 'low' | 'minimal' } {
  const reasons: string[] = [];
  let dataPoints = 0; // 보유 데이터 수 (신뢰도 판단용)

  // ===== 데이터 기반 선정 이유 (구체적 출처 포함) =====
  // 원칙: 첫 번째 이유 = 가장 강력한 데이터 근거 (예: "인스타 #에펠탑 1.2만 게시물")

  // 한국인 인기도 (45/30/25 제거) — nubiReason에 구체적 출처 표시

  // Google 리뷰 수 (식당의 경우 가장 중요한 지표)
  if (place.userRatingCount && place.userRatingCount > 100) {
    const count = place.userRatingCount;
    const countText = count >= 10000 ? `${(count / 1000).toFixed(0)}K`
      : count >= 1000 ? `${(count / 1000).toFixed(1)}K`
        : count.toLocaleString();
    reasons.push(`구글 리뷰 ${countText}개${place.rating ? ` (${place.rating.toFixed(1)}점)` : ''}`);
    dataPoints += 2;
  }

  // 포토스팟
  if (place.photoSpotScore && place.photoSpotScore > 5) {
    reasons.push(`인기 포토스팟 (점수 ${place.photoSpotScore.toFixed(1)}/10)`);
    dataPoints += 1;
  }
  if (place.photoTip) {
    reasons.push(`촬영 팁: ${place.photoTip}`);
  }

  // 패키지 투어 포함
  if (place.isPackageTourIncluded) {
    const mentionTxt = place.packageMentionCount && place.packageMentionCount > 1
      ? ` (${place.packageMentionCount}개 여행사 포함)` : '';
    reasons.push(`한국 패키지 투어 포함 장소${mentionTxt}`);
    dataPoints += 2;
  }

  // TripAdvisor
  if (place.tripAdvisorRating && place.tripAdvisorRating >= 4.0) {
    const reviewTxt = place.tripAdvisorReviewCount
      ? ` (리뷰 ${place.tripAdvisorReviewCount.toLocaleString()}개)` : '';
    reasons.push(`TripAdvisor ${place.tripAdvisorRating.toFixed(1)}점${reviewTxt}`);
    dataPoints += 1;
  }
  if (place.tripAdvisorRanking) {
    reasons.push(`TripAdvisor ${place.tripAdvisorRanking}`);
    dataPoints += 1;
  }

  // 가격 정보 (= 2026-05-15 = price_eur 단일 SSOT)
  if (place.estimatedPriceEur !== undefined && place.estimatedPriceEur > 0) {
    reasons.push(`약 EUR${Math.round(place.estimatedPriceEur)}`);
    dataPoints += 1;
  }

  // ===== AI/분위기 기반 이유 =====
  if (place.personaFitReason && reasons.length < 4) {
    reasons.push(place.personaFitReason);
  }

  // 바이브 태그 기반
  if (place.vibeTags && place.vibeTags.length > 0 && reasons.length < 4) {
    const vibeLabels: Record<string, string> = {
      Healing: '힐링', Adventure: '모험', Hotspot: '핫플',
      Foodie: '미식', Romantic: '로맨틱', Culture: '문화'
    };
    const tags = place.vibeTags.map(v => vibeLabels[v] || v).join(', ');
    reasons.push(`${tags} 분위기 매칭`);
  }

  // ===== 최소 2개 보장 (부족하면 실용적 이유 추가) =====
  if (reasons.length < 2) {
    if (place.vibeScore > 5) {
      reasons.push(`AI 분위기 분석 높은 평가 (${place.vibeScore.toFixed(1)}/10)`);
    }
    if (reasons.length < 2 && place.description) {
      reasons.push(place.description.length > 60 ? place.description.substring(0, 57) + '...' : place.description);
    }
    if (reasons.length < 2) {
      reasons.push('여행 동선 최적화 기반 선정');
    }
  }

  // ===== 신뢰도 레벨 =====
  // high: 3개 이상 데이터 소스 + 한국 인기도 있음
  // medium: 2개 데이터 소스 또는 TripAdvisor 데이터 있음
  // low: 1개 데이터 소스
  // minimal: 데이터 없음, AI 추천만
  let confidence: 'high' | 'medium' | 'low' | 'minimal';
  if (dataPoints >= 4) {
    confidence = 'high';
  } else if (dataPoints >= 2) {
    confidence = 'medium';
  } else if (dataPoints >= 1) {
    confidence = 'low';
  } else {
    confidence = 'minimal';
  }

  return { reasons: reasons.slice(0, 5), confidence }; // 최대 5개
}

function getPlaceTypesForVibes(vibes: Vibe[]): string[] {
  const vibeToPlaceTypes: Record<Vibe, string[]> = {
    Healing: ['spa', 'park', 'natural_feature', 'beach'],
    Adventure: ['tourist_attraction', 'hiking_area', 'amusement_park', 'zoo'],
    Hotspot: ['night_club', 'bar', 'shopping_mall', 'landmark'],
    Foodie: ['restaurant', 'cafe', 'bakery', 'food'],
    Romantic: ['restaurant', 'park', 'museum', 'art_gallery'],
    Culture: ['museum', 'art_gallery', 'library', 'historical_landmark'],
  };

  const types = new Set<string>();
  for (const vibe of vibes) {
    for (const type of vibeToPlaceTypes[vibe] || []) {
      types.add(type);
    }
  }
  return Array.from(types);
}

/**
 * 장소의 Vibe 점수 계산
 * 
 * 🎯 가중치 적용 로직:
 * - 사용자가 선택한 vibes와 장소의 vibeTags 매칭도 반영
 * - 선택 순서에 따라 가중치: 1순위(50%) > 2순위(30%) > 3순위(20%)
 * - 2개 선택시: 60% : 40%
 */
function calculatePlaceVibeScore(
  place: any,
  vibes: Vibe[],
  vibeWeights?: { vibe: Vibe; weight: number; percentage: number }[]
): number {
  const rating = place.rating || 3;
  const reviewCount = place.userRatingCount || 0;
  const reviewBonus = Math.min(2, Math.log10(reviewCount + 1) * 0.5);

  // 기본 점수 (평점 기반)
  let baseScore = Math.min(8, rating * 1.2 + reviewBonus);

  // 🎯 Vibe 매칭 보너스 (사용자 선택 가중치 적용)
  const placeVibes = mapPlaceTypesToVibes(place.types || []);
  let vibeMatchBonus = 0;

  if (vibeWeights && vibeWeights.length > 0) {
    // 가중치 기반 매칭
    for (const vw of vibeWeights) {
      if (placeVibes.includes(vw.vibe)) {
        // 매칭되면 가중치만큼 보너스 (최대 2점)
        vibeMatchBonus += (vw.weight * 2);
      }
    }
  } else if (vibes.length > 0) {
    // 가중치 없으면 단순 매칭 (fallback)
    const matchCount = vibes.filter(v => placeVibes.includes(v)).length;
    vibeMatchBonus = Math.min(2, matchCount * 0.7);
  }

  return Math.min(10, baseScore + vibeMatchBonus);
}

function getPersonaFitReason(placeTypes: string[], vibes: Vibe[]): string {
  if (vibes.includes('Foodie') && placeTypes.some(t => ['restaurant', 'cafe', 'bakery'].includes(t))) {
    return '미식 탐험에 완벽한 장소';
  }
  if (vibes.includes('Culture') && placeTypes.some(t => ['museum', 'art_gallery'].includes(t))) {
    return '문화적 경험을 위한 최적의 선택';
  }
  if (vibes.includes('Healing') && placeTypes.some(t => ['spa', 'park'].includes(t))) {
    return '힐링과 휴식을 위한 공간';
  }
  if (vibes.includes('Adventure') && placeTypes.some(t => ['tourist_attraction', 'amusement_park'].includes(t))) {
    return '모험과 새로운 경험의 장소';
  }
  return '여행의 특별한 순간을 만들어줄 곳';
}

function mapPlaceTypesToVibes(placeTypes: string[]): Vibe[] {
  const vibes: Vibe[] = [];
  if (placeTypes.some(t => ['spa', 'park', 'beach'].includes(t))) vibes.push('Healing');
  if (placeTypes.some(t => ['restaurant', 'cafe', 'bakery', 'food'].includes(t))) vibes.push('Foodie');
  if (placeTypes.some(t => ['museum', 'art_gallery', 'library'].includes(t))) vibes.push('Culture');
  if (placeTypes.some(t => ['tourist_attraction', 'amusement_park'].includes(t))) vibes.push('Adventure');
  if (placeTypes.some(t => ['night_club', 'bar', 'shopping_mall'].includes(t))) vibes.push('Hotspot');
  return vibes.length > 0 ? vibes : ['Healing'];
}

// ⚠️ 2026-05-15 = priceLevel 폐기 후 = travelStyle 만으로 추정
function getPriceEstimate(_priceLevel: number | undefined, travelStyle: TravelStyle): string {
  const labelByStyle: Record<TravelStyle, string> = {
    Luxury: '비쌈',
    Premium: '보통',
    Reasonable: '보통',
    Economic: '저렴함',
  };
  return labelByStyle[travelStyle] || '보통';
}



async function generatePlacesWithGemini(
  formData: TripFormData,
  vibeWeights: { vibe: Vibe; weight: number; percentage: number }[],
  requiredPlaceCount: number = 12,
): Promise<PlaceResult[]> {
  const vibeDescription = vibeWeights
    .map(v => `${v.vibe}(${v.percentage}%)`)
    .join(', ');

  // 여행 페이스 한글 변환 (프론트엔드 기준 Normal 사용)
  const paceKorean = formData.travelPace === 'Packed' ? '빡빡하게'
    : formData.travelPace === 'Normal' ? '보통'
      : '여유롭게';

  // 페이스 설정 (프론트엔드 기준 Normal)
  const paceConfig = PACE_CONFIG[formData.travelPace || 'Normal'];

  // ⚠️ 2026-05-23 = getKoreanPopularPlacesForPrompt 삭제 (= 인스타/유튜브/네이버 보조 테이블 폐기)
  const dbPopularitySection = '';

  // ===== 🎯 주인공 컨텍스트 생성 (가중치 1순위) =====
  // birthDate: 사용자 본인 생년월일 → 가족 연령 추정에 활용
  const protagonistContext = generatePromptContext({
    curationFocus: (formData.curationFocus as any) || 'Everyone',
    companionType: (formData.companionType as any) || 'Couple',
    companionCount: formData.companionCount || 2,
    companionAges: formData.companionAges,
    vibes: vibeWeights.map(v => v.vibe),
    destination: formData.destination,
    birthDate: formData.birthDate,  // 🎯 사용자 연령 → Gemini 프롬프트
  });

  // 주인공 문장 (로그 및 저장용)
  const protagonistInfo = generateProtagonistSentence({
    curationFocus: (formData.curationFocus as any) || 'Everyone',
    companionType: (formData.companionType as any) || 'Couple',
    companionCount: formData.companionCount || 2,
    companionAges: formData.companionAges,
    vibes: vibeWeights.map(v => v.vibe),
    destination: formData.destination,
    birthDate: formData.birthDate,  // 🎯 사용자 연령
  });

  console.log(`[Itinerary] 🎯 주인공: ${protagonistInfo.sentence}`);

  const prompt = `당신은 전문 여행 플래너입니다. 다음 조건에 맞는 ${formData.destination} 여행지를 추천해주세요.

${protagonistContext}

【사용자 여행 조건】
- 바이브 선호: ${vibeDescription}
- 여행 스타일: ${formData.travelStyle}
- 여행 밀도: ${paceKorean} (하루 ${paceConfig.maxSlotsPerDay}곳, ${paceConfig.slotDurationMinutes}분 간격)
- 이동 스타일: ${formData.mobilityStyle === 'WalkMore' ? '많이 걷기' : '이동 최소화'}
- 동행: ${formData.companionType}, ${formData.companionCount}명

【중요한 추천 기준 - 5단계 가중치】
1. ⭐ 주인공 (위 "일정 생성의 주인공" 섹션 최우선 반영)
2. 누구랑 (동행 타입에 맞는 장소 우선)
3. 바이브 선호 (사용자가 선택한 취향 반영)
4. 예산 수준 (${formData.travelStyle})
5. 실제 정보 (영업 중인 곳, 리뷰 좋은 곳)

【동선 최적화 규칙】
1. 같은 도시/지역의 장소들을 연속 일자에 배치할 수 있도록 그룹핑
2. 도시 간 이동이 필요한 경우, 인접한 도시끼리 묶기
3. 각 장소에 반드시 city(도시명)와 region(지역/구역) 정보 포함
4. 오전-점심-오후-저녁 시간대에 맞는 장소 배치 (식당은 점심/저녁에)

【한국인 선호도 반영 - 최우선 규칙】
한국인 여행자들이 실제로 많이 방문하고, SNS에서 인기 있는 장소를 최우선으로 추천해주세요.
${dbPopularitySection}

【⚠️ 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.】

JSON 응답 형식 (엄격히 준수):
{
  "places": [
    {
      "name": "실제 존재하는 장소의 정확한 이름 (구글맵 검색 가능해야 함)",
      "description": "한국인에게 인기인 구체적 이유 (예: 인스타 핫플, 유튜브 ○○채널 추천, 리뷰 1000+개)",
      "city": "도시명",
      "region": "지역/구역",
      "lat": 48.8584,
      "lng": 2.2945,
      "vibeScore": 8,
      "koreanPopularity": 9,
      "tags": ["restaurant", "landmark"],
      "vibeTags": ["Foodie", "Culture"],
      "recommendedTime": "morning",
      "priceEstimate": "€20-30"
    }
  ]
}

필수 규칙:
- name: 반드시 실제 존재하는 장소명 (가상 장소 금지)
- lat/lng: 반드시 실제 좌표 (0이면 안 됨)
- vibeScore: 1~10 정수
- vibeTags: 반드시 ["Healing","Adventure","Hotspot","Foodie","Romantic","Culture"] 중에서만 선택
- recommendedTime: 반드시 "morning"|"lunch"|"afternoon"|"evening" 중 하나
- 식당은 vibeTags에 반드시 "Foodie" 포함

【🍽️ 식사 장소 필수 포함】
- 전체 장소 중 최소 40%는 식당/카페/레스토랑으로 포함해주세요
- 점심/저녁용 식당은 반드시 "Foodie" vibeTags에 포함
- 현지인과 한국인 모두에게 인기 있는 맛집 우선

${formData.destination}의 실제 유명한 장소들을 추천해주세요. 정확히 ${requiredPlaceCount}개 장소를 추천해주세요. 
도시별로 균형있게 분배하고, 각 도시 내에서는 지역별로 묶어주세요.`;

  try {
    // API 키 존재 확인
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.error('[Itinerary] ❌ Gemini API 키 없음 - AI 장소 생성 불가');
      throw new Error('GEMINI_API_KEY_MISSING');
    }

    console.log(`[Itinerary] 🤖 Gemini에 ${requiredPlaceCount}개 장소 요청 중...`);

    const response = await getAI().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });

    const text = response.text || "";
    console.log(`[Itinerary] 🤖 Gemini 응답 수신 (${text.length}자)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const placesRaw = result.places || [];

      if (placesRaw.length === 0) {
        console.warn('[Itinerary] ⚠️ Gemini가 장소를 0개 반환함');
      } else {
        console.log(`[Itinerary] ✅ Gemini가 ${placesRaw.length}개 장소 반환`);
      }

      // JSON 스키마 검증 - 각 장소에 필수 필드가 있는지 확인
      return placesRaw
        .filter((place: any) => {
          if (!place.name) {
            console.warn('[Itinerary] ⚠️ 이름 없는 장소 제외:', place);
            return false;
          }
          if (!place.lat || !place.lng) {
            console.warn(`[Itinerary] ⚠️ 좌표 없는 장소: ${place.name} (lat=${place.lat}, lng=${place.lng})`);
            // 좌표 없어도 일단 포함 (0,0으로 대체)
          }
          return true;
        })
        .map((place: any, index: number) => ({
          id: `gemini-${Date.now()}-${index}`,
          name: place.name,
          description: place.description || '',
          lat: place.lat || 0,
          lng: place.lng || 0,
          vibeScore: Math.min(10, Math.max(1, place.vibeScore || 7)),
          confidenceScore: 7,
          sourceType: "Gemini AI",
          personaFitReason: place.personaFitReason || place.description || "AI가 추천한 장소",
          tags: Array.isArray(place.tags) ? place.tags : [],
          vibeTags: Array.isArray(place.vibeTags) ? place.vibeTags.filter((v: string) =>
            ['Healing', 'Adventure', 'Hotspot', 'Foodie', 'Romantic', 'Culture'].includes(v)
          ) : [],
          image: "",
          priceEstimate: place.priceEstimate || "보통",
          placeTypes: [],
          recommendedTime: place.recommendedTime,
          city: place.city || formData.destination,
          region: place.region || "",
          koreanPopularityScore: 0, // 이후 enrichPlacesWithKoreanPopularity에서 계산
          googleMapsUrl: "", // Gemini 장소는 Google Maps URI 없음
        }));
    } else {
      console.error('[Itinerary] ❌ Gemini 응답에서 JSON을 찾을 수 없음');
      console.error('[Itinerary] 응답 내용 (첫 500자):', text.slice(0, 500));
    }
  } catch (error: any) {
    if (error.message === 'GEMINI_API_KEY_MISSING') {
      throw error; // API 키 없는 에러는 상위로 전파
    }
    console.error("[Itinerary] ❌ Gemini 장소 생성 실패:", error?.message || error);
    console.error("[Itinerary] 에러 상세:", error?.status || 'N/A', error?.statusText || 'N/A');
  }

  return [];
}

function calculateDayCount(startDate: string, endDate: string): number {
  console.log(`[Itinerary] Date inputs: startDate="${startDate}", endDate="${endDate}"`);
  const start = new Date(startDate);
  const end = new Date(endDate);
  console.log(`[Itinerary] Parsed dates: start=${start.toISOString()}, end=${end.toISOString()}`);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  console.log(`[Itinerary] Calculated dayCount: ${dayCount}`);
  return dayCount;
}

function groupPlacesByCity(places: PlaceResult[]): Map<string, PlaceResult[]> {
  const cityGroups = new Map<string, PlaceResult[]>();

  for (const place of places) {
    const city = place.city || 'Unknown';
    if (!cityGroups.has(city)) {
      cityGroups.set(city, []);
    }
    cityGroups.get(city)!.push(place);
  }

  return cityGroups;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
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

    let nearestCity = '';
    let minDistance = Infinity;

    for (const city of remaining) {
      const coords = cityCoords.get(city)!;
      const dist = calculateDistance(lastCoords.lat, lastCoords.lng, coords.lat, coords.lng);
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
  const { runPipelineV3 } = await import('./agents/pipeline-v3');
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
      daySlotsConfig: { day: number; startTime: string; endTime: string; slots: number }[];
      travelPace: TravelPace;
      requiredPlaceCount: number;
    }
  ): Promise<{
    scoredPlaces: PlaceResult[];
    schedule: { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string; isMealSlot: boolean; mealType?: 'lunch' | 'dinner' }[];
    realityCheck: { weather: string; crowd: string; status: string };
  }> {
    const vibes = formData.vibes || ['Foodie', 'Culture', 'Healing'];
    const { daySlotsConfig, travelPace, requiredPlaceCount } = skeleton;

    // ===== Enrichment 스킵 (속도 최우선: AG3 matchPlacesWithDB에서 이미 DB 데이터 보강됨) =====
    console.log(`[AG3] Enrichment 스킵 (속도 우선, DB 보강 데이터 사용)`);

    // Phase 1-7: 데이터 등급 + 동적 가중치
    const dataGrade = detectDataGrade(placesArr);
    const dynamicWeights = calculateDynamicWeights(vibes as Vibe[], dataGrade);

    console.log(`[AG3] 데이터 등급: ${dataGrade} | 바이브: ${vibes.join(',')}`);

    // 최종 점수 계산 + 정렬
    placesArr = placesArr.map(p => {
      const { reasons, confidence } = generateSelectionReasons(p);
      return {
        ...p,
        finalScore: calculateFinalScore(p, dynamicWeights),
        selectionReasons: reasons,
        confidenceLevel: confidence,
      };
    }).sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
      .slice(0, requiredPlaceCount + 5);

    // 상위 5개 로그
    placesArr.slice(0, 5).forEach((p, i) => {
      console.log(`[AG3]   #${i + 1} ${p.name}: finalScore=${(p.finalScore || 0).toFixed(2)}`);
    });

    // 슬롯 분배
    console.log(`[AG3] 슬롯 분배 시작: ${placesArr.length}곳 → ${daySlotsConfig.length}일 (pace: ${travelPace})`);
    console.log(`[AG3] 식당: ${placesArr.filter(p => isFoodPlace(p)).length}곳, 일반: ${placesArr.filter(p => !isFoodPlace(p)).length}곳`);

    const schedule = await distributePlacesWithUserTime(
      placesArr, daySlotsConfig, travelPace, formData.travelStyle || 'Reasonable'
    );

    console.log(`[AG3] 슬롯 분배 완료: ${schedule.length}개`);
    if (schedule.length === 0) {
      console.error(`[AG3] ❌ 슬롯 분배 결과 0개! placesArr: ${placesArr.length}곳, daySlotsConfig: ${JSON.stringify(daySlotsConfig)}`);
      // 비상 조치: 식당 태그 관계없이 모든 장소를 균등 분배
      console.log(`[AG3] 🚨 비상 분배 실행...`);
      let emergencySlotIdx = 0;
      for (const dayConfig of daySlotsConfig) {
        for (let i = 0; i < dayConfig.slots && emergencySlotIdx < placesArr.length; i++) {
          const place = placesArr[emergencySlotIdx++];
          const startH = parseInt(dayConfig.startTime.split(':')[0]) + i * 2;
          schedule.push({
            day: dayConfig.day,
            slot: startH < 12 ? 'morning' : startH < 14 ? 'lunch' : startH < 18 ? 'afternoon' : 'evening',
            place,
            startTime: `${startH.toString().padStart(2, '0')}:00`,
            endTime: `${(startH + 2).toString().padStart(2, '0')}:00`,
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
      const daySlots = schedule.filter(s => s.day === d);
      const nonMealPlaces = daySlots.filter(s => !s.isMealSlot).map(s => s.place);

      if (nonMealPlaces.length > 2) {
        const dayAccom = formData.dayAccommodations?.find(a => a.day === d);
        const depCoords = dayAccom?.coords || formData.accommodationCoords || formData.destinationCoords;
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
  daySlotsConfig: { day: number; startTime: string; endTime: string; slots: number }[],
  travelPace: TravelPace,
  travelStyle: TravelStyle = 'Reasonable'
): Promise<{ day: number; slot: string; place: PlaceResult; startTime: string; endTime: string; isMealSlot: boolean; mealType?: 'lunch' | 'dinner' }[]> {
  const schedule: { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string; isMealSlot: boolean; mealType?: 'lunch' | 'dinner' }[] = [];
  const paceConfig = PACE_CONFIG[travelPace];

  // 🍽️ 식당/카페 장소 분리 (식당은 오직 점심/저녁 슬롯에만 사용)
  const foodPlaces = places.filter(p => isFoodPlace(p));
  const nonFoodPlaces = places.filter(p => !isFoodPlace(p));

  console.log(`[Itinerary] 🍽️ 식사 장소: ${foodPlaces.length}곳, 일반 장소: ${nonFoodPlaces.length}곳 (총 ${places.length}곳)`);
  if (foodPlaces.length > 0) {
    console.log(`[Itinerary]   식당 목록: ${foodPlaces.map(p => `${p.name}(tags:${p.tags?.join(',') || '없음'})`).join(', ')}`);
  }
  if (nonFoodPlaces.length === 0) {
    console.error(`[Itinerary] ❌ 일반 장소 0곳! 전체 장소 태그 점검:`);
    places.forEach(p => {
      console.log(`  - ${p.name}: tags=${JSON.stringify(p.tags)}, placeTypes=${JSON.stringify(p.placeTypes)}, vibeTags=${JSON.stringify(p.vibeTags)}`);
    });
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-2 = 일자별 zone 매핑 + 비식당 클러스터링 (= 사용자 SSOT)
  // = dayCount 기반 zone = Day 1 core / Day 2 outskirt / Day 3+ mixed = 자연 클러스터링

  const dayCount = daySlotsConfig.length;
  const dayZoneMap: Array<'core' | 'outskirt' | 'mixed'> = [];
  for (let d = 0; d < dayCount; d++) {
    if (dayCount === 1) dayZoneMap.push('core');
    else if (d === 0) dayZoneMap.push('core');
    else if (d === 1) dayZoneMap.push('outskirt');
    else dayZoneMap.push('mixed');
  }
  console.log(`[Itinerary] 🗺️ 일자별 zone 매핑: ${dayZoneMap.map((z, i) => `Day ${i + 1}=${z}`).join(' / ')}`);

  // 비식당 + 식당 zone 분리 (= PlaceResult.dayZone = 'core' / 'outskirt' / null)
  const coreNonFood = nonFoodPlaces.filter(p => p.dayZone !== 'outskirt');
  const outskirtNonFood = nonFoodPlaces.filter(p => p.dayZone === 'outskirt');
  const coreFood = foodPlaces.filter(p => p.dayZone !== 'outskirt');
  const outskirtFood = foodPlaces.filter(p => p.dayZone === 'outskirt');
  console.log(`[Itinerary] 🌿 비식당 zone: core ${coreNonFood.length} / outskirt ${outskirtNonFood.length} | 🍽️ 식당 zone: core ${coreFood.length} / outskirt ${outskirtFood.length}`);

  // 일자별 풀 = zone 정책 적용 (= mixed = core + outskirt 합쳐서 = nearest-neighbor)
  const dayPools: PlaceResult[][] = dayZoneMap.map((zone) => {
    if (zone === 'core') return [...coreNonFood];
    if (zone === 'outskirt') return [...outskirtNonFood];
    return [...coreNonFood, ...outskirtNonFood]; // mixed
  });

  // === 4순위: 식당 유명세 점수 계산 ===
  const foodWithScores: { place: PlaceResult; restaurantScore: number }[] = [];
  for (const fp of foodPlaces) {
    const score = await calculateRestaurantScore(fp);
    foodWithScores.push({ place: fp, restaurantScore: score });
  }

  console.log(`[Itinerary] 🍽️ 식당 점수 계산 완료 (${foodWithScores.length}곳, 상위: ${foodWithScores.sort((a, b) => b.restaurantScore - a.restaurantScore).slice(0, 3).map(f => `${f.place.name}=${f.restaurantScore.toFixed(1)}`).join(', ')})`);

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
    usedIds: Set<string>
  ): { place: PlaceResult; restaurantScore: number } | null {
    // 사용된 식당 제외
    const available = candidates.filter(c => !usedIds.has(c.place.id));
    if (available.length === 0) return null;

    // 1. 가격대 필터 (= mealBudgetMax 초과 = 30% 이내 허용 = 그 외 제외)
    const inBudget = available.filter(c => {
      const price = c.place.estimatedPriceEur;
      if (price === undefined || price <= 0) return true; // 가격 정보 X = 통과 (= 풀 자체 신뢰)
      return price <= mealBudgetMax * 1.3; // 30% 이내 초과 허용
    });
    const pool = inBudget.length > 0 ? inBudget : available; // 모두 초과 시 fallback

    // ⚠️ 수정금지(승인필요) 2026-05-21 = 이전 슬롯 좌표 = 가장 가까운 식당 (= Haversine = 위도/경도 정확 거리)
    // = 옛 Euclidean (= 평면 근사) = lng 거리 과대평가 (= 위도 48° → lng 1° = 74km ≠ lat 1° = 111km) = 시정
    if (!prevPlace || !prevPlace.lat || !prevPlace.lng) {
      const winner = pool[0];
      console.log(`[Restaurant선정] ${winner.place.name}: 이전슬롯 X = 1등 (€${winner.place.estimatedPriceEur ?? '?'})`);
      return winner;
    }

    const scored = pool.map(c => {
      const distKm = (c.place.lat && c.place.lng)
        ? haversineKm(prevPlace.lat, prevPlace.lng, c.place.lat, c.place.lng)
        : 999;
      return { ...c, distKm };
    });
    scored.sort((a, b) => a.distKm - b.distKm);
    const winner = scored[0];
    console.log(`[Restaurant선정] ${winner.place.name}: 거리=${winner.distKm.toFixed(2)}km (€${winner.place.estimatedPriceEur ?? '?'} ≤ €${mealBudgetMax})`);
    return winner;
  }

  // === 사용된 식당 ID 추적 (중복 배치 방지) ===
  const usedFoodIds = new Set<string>();

  // === 기본 식당 placeholder 생성 함수 ===
  // ⚠️ 좌표: refPlace가 없거나 좌표가 0,0이면 같은 Day의 다른 장소 좌표 사용 (10875분 버그 방지)
  function createDefaultRestaurant(type: 'lunch' | 'dinner', refPlace: PlaceResult | null): PlaceResult {
    const typeLabel = type === 'lunch' ? '점심' : '저녁';
    const budget = type === 'lunch' ? mealBudget.lunch : mealBudget.dinner;
    const budgetLabel = type === 'lunch' ? mealBudget.lunchLabel : mealBudget.dinnerLabel;
    // 좌표 결정: refPlace → 전체 장소 중 유효 좌표 → 기본값(파리 중심)
    let fallbackLat = 48.8566;
    let fallbackLng = 2.3522;
    if (refPlace && refPlace.lat !== 0 && refPlace.lng !== 0) {
      fallbackLat = refPlace.lat;
      fallbackLng = refPlace.lng;
    } else {
      // 모든 장소 중 유효 좌표 찾기
      const anyValid = places.find(p => p.lat !== 0 && p.lng !== 0);
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
      vibeScore: 7,
      confidenceScore: 6,
      sourceType: 'Default',
      personaFitReason: `${budgetLabel} 예산에 맞는 현지 맛집`,
      tags: ['restaurant', 'food'],
      vibeTags: ['Foodie'],
      image: '',
      priceEstimate: budgetLabel,
      placeTypes: ['restaurant'],
      city: refPlace?.city,
      region: refPlace?.region,
      koreanPopularityScore: 0,
      googleMapsUrl: '',
      estimatedPriceEur: budget, // 식사 예산을 입장료 대신 가격으로 설정
    };
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E-2 = 일자별 풀 인덱스 (= 옛 nonFoodIndex 단일 → 일자별 분리)
  const dayPoolIndex: number[] = dayPools.map(() => 0);

  for (let dIdx = 0; dIdx < daySlotsConfig.length; dIdx++) {
    const dayConfig = daySlotsConfig[dIdx];
    const { day, startTime, endTime, slots } = dayConfig;
    const dayZone = dayZoneMap[dIdx];               // 본 일자 zone (= 'core' / 'outskirt' / 'mixed')
    const dayPool = dayPools[dIdx];                  // 본 일자 비식당 풀

    // 본 일자 식당 풀 (= dayZone 매칭 + 부족 시 다른 zone fallback)
    const primaryFoodPool: PlaceResult[] = dayZone === 'outskirt' ? outskirtFood
      : dayZone === 'core' ? coreFood
      : [...coreFood, ...outskirtFood];
    const dayFoodWithScores = foodWithScores.filter(fs =>
      primaryFoodPool.some(fp => fp.id === fs.place.id)
    );

    console.log(`[Itinerary] === Day ${day} (zone=${dayZone}) = 비식당 풀 ${dayPool.length} + 식당 풀 ${dayFoodWithScores.length} ===`);

    // === 1순위: 하루 점심 1개 + 저녁 1개 강제 (절대 규칙) ===
    let lunchAssigned = false;
    let dinnerAssigned = false;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
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
      const slotMidMinutes = Math.round((slotStartMinutes + slotEndMinutes) / 2);
      const slotMidHour = slotMidMinutes / 60;
      const slotHour = parseInt(slotStart.split(':')[0]);

      let slotType: 'morning' | 'lunch' | 'afternoon' | 'evening';
      if (slotMidHour < 12) slotType = 'morning';
      else if (slotMidHour < 14.5) slotType = 'lunch';
      else if (slotMidHour < 18) slotType = 'afternoon';
      else slotType = 'evening';

      // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = 저녁 = 시간 고정 X = 일일 마지막 슬롯 = 무조건 dinner
      // = 마지막 슬롯 = dinner 우선 (= lunch 보다 = 짧은 일정 = 점심 양보 = dinner 강제)
      // = 점심 = 마지막 슬롯 외 + lunch window (= 11:30-14:00) 첫 매칭 슬롯
      let isMealSlot = false;
      let mealType: 'lunch' | 'dinner' | undefined;

      const lunchWindowStart = 11.5 * 60; // 11:30
      const lunchWindowEnd = 14 * 60;     // 14:00
      const isLastSlot = slotIdx === slots - 1;

      if (isLastSlot && !dinnerAssigned) {
        isMealSlot = true;
        mealType = 'dinner';
        dinnerAssigned = true;
      } else if (slotMidMinutes >= lunchWindowStart && slotMidMinutes <= lunchWindowEnd && !lunchAssigned) {
        isMealSlot = true;
        mealType = 'lunch';
        lunchAssigned = true;
      }

      let selectedPlace: PlaceResult;

      if (isMealSlot) {
        // ⚠️ 수정금지(승인필요) 2026-05-21 = 일자 zone 매칭 식당 풀 = 이전 슬롯 가까이 + 가격대 (= Phase E-3)
        const budgetMax = mealType === 'lunch' ? mealBudget.lunch : mealBudget.dinner;
        const bestFood = selectBestRestaurant(dayFoodWithScores, prevPlaceInDay, budgetMax, usedFoodIds)
          || selectBestRestaurant(foodWithScores, prevPlaceInDay, budgetMax, usedFoodIds); // zone 풀 소진 시 fallback

        if (bestFood) {
          selectedPlace = bestFood.place;
          usedFoodIds.add(bestFood.place.id);
          const budgetLabel = mealType === 'lunch' ? mealBudget.lunchLabel : mealBudget.dinnerLabel;
          console.log(`[Itinerary] Day ${day} ${mealType}: ${selectedPlace.name} (${budgetLabel})`);
        } else {
          selectedPlace = createDefaultRestaurant(mealType!, prevPlaceInDay);
          console.log(`[Itinerary] Day ${day} ${mealType}: placeholder 생성 (식당 후보 부족)`);
        }
      } else {
        // ⚠️ 수정금지(승인필요) 2026-05-21 = 일자 zone 풀에서 sequential (= 옛 단일 nonFoodIndex 폐기)
        if (dayPoolIndex[dIdx] < dayPool.length) {
          selectedPlace = dayPool[dayPoolIndex[dIdx]];
          dayPoolIndex[dIdx]++;
        } else {
          // 본 일자 풀 소진 = fallback = 다른 일자 미사용 비식당 (= 빈 슬롯 방지)
          const usedIds = new Set<string>(schedule.map(s => s.place.id));
          const remainingNonFood = nonFoodPlaces.filter(p => !usedIds.has(p.id));
          if (remainingNonFood.length > 0) {
            selectedPlace = remainingNonFood[0];
            console.log(`[Itinerary] Day ${day} slot ${slotIdx}: 일자 풀 소진 → 다른 일자 fallback: ${selectedPlace.name}`);
          } else {
            // 모든 비식당 소진 = 남은 식당 fallback
            const remainingFood = foodWithScores.filter(f => !usedFoodIds.has(f.place.id));
            if (remainingFood.length > 0) {
              const fallback = remainingFood[0];
              selectedPlace = fallback.place;
              usedFoodIds.add(fallback.place.id);
              console.log(`[Itinerary] Day ${day} slot ${slotIdx}: 모든 비식당 소진 → 식당 대체: ${selectedPlace.name}`);
            } else {
              console.log(`[Itinerary] Day ${day} slot ${slotIdx}: 모든 장소 소진, 남은 슬롯 스킵`);
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
  const mealSlots = schedule.filter(s => s.isMealSlot);
  const lunchCount = mealSlots.filter(s => s.mealType === 'lunch').length;
  const dinnerCount = mealSlots.filter(s => s.mealType === 'dinner').length;
  const totalDays = daySlotsConfig.length;
  console.log(`[Itinerary] 🍽️ 식사 배치 완료: ${totalDays}일 × (점심1+저녁1) = 점심${lunchCount}개 + 저녁${dinnerCount}개`);
  console.log(`[Itinerary] 🍽️ 예산: 점심 ${mealBudget.lunchLabel}/인, 저녁 ${mealBudget.dinnerLabel}/인 (일일 총 €${mealBudget.dailyTotal}/인)`);

  // 식당이 일반 슬롯에 들어갔는지 검증 (디버그)
  const nonMealFoodSlots = schedule.filter(s => !s.isMealSlot && isFoodPlace(s.place));
  if (nonMealFoodSlots.length > 0) {
    console.log(`[Itinerary] ℹ️ 식당 ${nonMealFoodSlots.length}곳이 일반 슬롯에 대체 배치됨 (일반 장소 부족 시 정상)`);
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
}): Promise<{ day: number; places: any[]; departureTransit?: any; returnTransit?: any; transit?: any }> {
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

  // 이동시간 재계산
  const travelMode = formData?.mobilityStyle === 'WalkMore' ? 'WALK' as const
    : formData?.mobilityStyle === 'Minimal' ? 'DRIVE' as const
      : 'TRANSIT' as const;
  const companionCount = formData ? getCompanionCount(formData.companionType || 'Solo') : 2;

  const transits: any[] = [];

  // ⚠️ 수정금지(승인필요) 2026-05-20 = Google Routes API 폐기 = Haversine 자체 계산 (= 사용자 SSOT)
  // 숙소 → 첫 장소
  let departureTransit: any;
  if (accommodationCoords && reordered.length > 0) {
    departureTransit = calcTransitHaversine(
      { lat: accommodationCoords.lat, lng: accommodationCoords.lng, name: '🏨 숙소' },
      { lat: reordered[0].lat, lng: reordered[0].lng, name: reordered[0].name },
      travelMode as TravelMode, companionCount,
    );
  }

  // 장소 간 이동
  for (let i = 0; i < reordered.length - 1; i++) {
    transits.push(calcTransitHaversine(
      { lat: reordered[i].lat, lng: reordered[i].lng, name: reordered[i].name },
      { lat: reordered[i + 1].lat, lng: reordered[i + 1].lng, name: reordered[i + 1].name },
      travelMode as TravelMode, companionCount,
    ));
  }

  // 마지막 장소 → 숙소
  let returnTransit: any;
  if (accommodationCoords && reordered.length > 0) {
    const last = reordered[reordered.length - 1];
    returnTransit = calcTransitHaversine(
      { lat: last.lat, lng: last.lng, name: last.name },
      { lat: accommodationCoords.lat, lng: accommodationCoords.lng, name: '🏨 숙소' },
      travelMode as TravelMode, companionCount,
    );
  }

  const allTransits = [
    ...(departureTransit ? [departureTransit] : []),
    ...transits,
    ...(returnTransit ? [returnTransit] : []),
  ];

  return {
    day,
    places: reordered,
    departureTransit,
    returnTransit,
    transit: {
      transits: allTransits,
      totalDuration: allTransits.reduce((sum: number, t: any) => sum + t.duration, 0),
      totalCost: allTransits.reduce((sum: number, t: any) => sum + t.costTotal, 0),
    },
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

