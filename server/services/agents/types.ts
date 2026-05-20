/**
 * 4+1 에이전트 파이프라인 - 공통 타입 정의
 * 
 * AG1(뼈대) → AG2(Gemini)||AG3pre(DB) → AG3(매칭) → AG4(실시간)
 */

// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = KoreanSentiment 완전 폐기 (= 인프라/로우데이터 90% 오류)

// ===== 기본 타입 =====
export type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';
export type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';

// ⚠️ 수정금지(승인필요) 2026-05-19 = place_seed_raw.seed_category 8 enum (= BTS 마커 + LUCIE 캐릭터 1:1)
// = SSOT = client/components/bts/bts-marker-svg.ts 의 COLORS/LUCIDE 키와 정확히 일치
export type SeedCategory =
  | 'bts_venue'
  | 'heritage'
  | 'hotspot'
  | 'attraction'
  | 'adventure'
  | 'healing'
  | 'shopping'
  | 'restaurant';
export type TravelPace = 'Packed' | 'Normal' | 'Relaxed';
export type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';
export type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';

// ===== 설정 인터페이스 =====
export interface PaceConfig {
  slotDurationMinutes: number;
  maxSlotsPerDay: number;
}

export interface MealSlotConfig {
  type: 'lunch' | 'dinner';
  startHour: number;
  endHour: number;
}

export interface VibeWeight {
  vibe: Vibe;
  weight: number;
  percentage: number;
}

export interface DaySlotConfig {
  day: number;
  startTime: string;
  endTime: string;
  slots: number;
}

// ===== 사용자 입력 =====
export interface TripFormData {
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
  accommodationName?: string;
  accommodationAddress?: string;
  accommodationCoords?: { lat: number; lng: number };
  dayAccommodations?: Array<{
    day: number;
    name: string;
    address: string;
    coords: { lat: number; lng: number };
  }>;
  /** 일정 출력 언어 (ko, en, ja, fr 등). 기본 ko */
  language?: string;
}

// ===== 장소 결과 =====
export interface PlaceResult {
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
  recommendedTime?: string;
  koreanPopularityScore: number;
  googleMapsUrl: string;
  tripAdvisorRating?: number;
  tripAdvisorReviewCount?: number;
  tripAdvisorRanking?: string;
  estimatedPriceEur?: number;
  // ⚠️ 2026-05-19 = seedCategory = FE LUCIE 카테고리 아이콘 매핑용 (= 이미지 NULL placeholder)
  seedCategory?: SeedCategory;
  // ⚠️ 2026-05-15 = priceSource / priceLevel 영구 폐기 (= price_eur 단일 SSOT)
  photoSpotScore?: number;
  photoTip?: string;
  bestPhotoTime?: string;
  isPackageTourIncluded?: boolean;
  packageMentionCount?: number;
  finalScore?: number;
  buzzScore?: number;
  userRatingCount?: number;
  selectionReasons?: string[];
  confidenceLevel?: 'high' | 'medium' | 'low' | 'minimal';
  // ⭐ 차별화 선정이유 (우리 데이터 기반, 프론트엔드에서 크게/진하게 표시)
  nubiReason?: string | null;
  // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E = dayZone 필드 (= place_seed_raw.day_zone) = 일자별 zone 매칭
  dayZone?: 'core' | 'outskirt' | null;
}

// ===== 상수 =====
export const PACE_CONFIG: Record<TravelPace, PaceConfig> = {
  Packed: { slotDurationMinutes: 90, maxSlotsPerDay: 8 },
  Normal: { slotDurationMinutes: 120, maxSlotsPerDay: 6 },
  Relaxed: { slotDurationMinutes: 150, maxSlotsPerDay: 4 },
};

export const MEAL_SLOTS: MealSlotConfig[] = [
  { type: 'lunch', startHour: 12, endHour: 14 },
  { type: 'dinner', startHour: 18, endHour: 20 },
];

export const MEAL_BUDGET: Record<TravelStyle, {
  dailyTotal: number;
  lunch: number;
  dinner: number;
  lunchLabel: string;
  dinnerLabel: string;
  label: string;
  min: number;
  max: number;
}> = {
  // ⚠️ 수정금지(승인필요) 사용자 SSOT 2026-05-19 = 4:6 split (= 점심 40% / 저녁 60%)
  // 일한도: Economic €40 / Reasonable €100 / Premium €300 / Luxury €300+
  // min/max = 식당 1 회 식사 가격 범위 (= tier 별 격리 = dinner ceiling 까지 허용)
  Economic: { dailyTotal: 40, lunch: 16, dinner: 24, lunchLabel: '€16 이내', dinnerLabel: '€24 이내', label: '€40/일', min: 0, max: 24 },
  Reasonable: { dailyTotal: 100, lunch: 40, dinner: 60, lunchLabel: '€40 이내', dinnerLabel: '€60 이내', label: '€100/일', min: 25, max: 60 },
  Premium: { dailyTotal: 300, lunch: 120, dinner: 180, lunchLabel: '€120 이내', dinnerLabel: '€180 이내', label: '€300/일', min: 61, max: 180 },
  Luxury: { dailyTotal: 300, lunch: 120, dinner: 180, lunchLabel: '€120 이내', dinnerLabel: '€180 이내', label: '€300+/일', min: 181, max: 9999 },
};

export const DEFAULT_START_TIME = '09:00';
export const DEFAULT_END_TIME = '21:00';

// ===== AG1 출력 =====
export interface AG1Output {
  formData: TripFormData;
  vibeWeights: VibeWeight[];
  travelPace: TravelPace;
  paceConfig: PaceConfig;
  dayCount: number;
  daySlotsConfig: DaySlotConfig[];
  totalRequiredPlaces: number;
  requiredPlaceCount: number;
  companionCount: number;
}

// ===== AG3 사전 로드 출력 =====
export interface AG3PreOutput {
  cityId: number | null;
  dbPlacesMap: Map<string, any>;
  cityName: string;
  /** DB cities 테이블의 도시 중심 좌표 (숙소 미입력 시 출발 기점으로 사용) */
  cityCoords?: { lat: number; lng: number };
  /** placeId → place_images 통합 이미지 URL (인스타 우선) */
  placeImageMap?: Map<number, string>;
  /** placeId → 셀럽 인스타 이미지 URL (place_images 미포함 시 fallback) */
  celebrityImageMap?: Map<number, string>;

  /** nameEn/nameKo → place_seed_raw (가격, 인스타이미지 등 통합 메타데이터) */
  seedRawMap?: Map<string, any>;
}

// ===== 스케줄 슬롯 =====
export interface ScheduleSlot {
  day: number;
  slot: string;
  place: PlaceResult;
  startTime: string;
  endTime: string;
  isMealSlot: boolean;
  mealType?: 'lunch' | 'dinner';
}

// ===== AG3 출력 =====
export interface AG3Output {
  schedule: ScheduleSlot[];
  scoredPlaces: PlaceResult[];
  daySlotsConfig: DaySlotConfig[];
  travelPace: TravelPace;
  vibes: Vibe[];
}

// ===== 인원수 계산 =====
export function getCompanionCount(companionType: string): number {
  const mapping: Record<string, number> = {
    Single: 1, Solo: 1, Couple: 2, Family: 4, ExtendedFamily: 8, Group: 10,
  };
  return mapping[companionType] || 1;
}

// ===== 슬롯 수 계산 =====
export function calculateSlotsForDay(
  startTime: string, endTime: string, pace: TravelPace
): number {
  const config = PACE_CONFIG[pace];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const availableMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (availableMinutes <= 0) return 0;
  return Math.min(Math.floor(availableMinutes / config.slotDurationMinutes), config.maxSlotsPerDay);
}

// ===== 일수 계산 =====
export function calculateDayCount(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

// ===== 분 → HH:MM =====
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(Math.min(23, hours)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
