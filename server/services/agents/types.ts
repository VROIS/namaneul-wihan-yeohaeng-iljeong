/**
 * 4+1 에이전트 파이프라인 - 공통 타입 정의
 * 
 * AG1(뼈대) → AG2(Gemini)||AG3pre(DB) → AG3(매칭) → AG4(실시간)
 */

import type { KoreanSentimentData } from '../korean-sentiment-service';

// ===== 기본 타입 =====
export type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';
export type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';
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
  priceSource?: string;
  photoSpotScore?: number;
  photoTip?: string;
  bestPhotoTime?: string;
  isPackageTourIncluded?: boolean;
  packageMentionCount?: number;
  finalScore?: number;
  selectionReasons?: string[];
  confidenceLevel?: 'high' | 'medium' | 'low' | 'minimal';
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
  Economic:   { dailyTotal: 23, lunch: 8, dinner: 15, lunchLabel: '€8 이내', dinnerLabel: '€15 이내', label: '€23/일', min: 8, max: 15 },
  Reasonable: { dailyTotal: 60, lunch: 21, dinner: 39, lunchLabel: '€21 이내', dinnerLabel: '€39 이내', label: '€60/일', min: 20, max: 40 },
  Premium:    { dailyTotal: 110, lunch: 39, dinner: 72, lunchLabel: '€39 이내', dinnerLabel: '€72 이내', label: '€110/일', min: 40, max: 70 },
  Luxury:     { dailyTotal: 160, lunch: 56, dinner: 104, lunchLabel: '€56 이내', dinnerLabel: '€104 이내', label: '€160/일', min: 60, max: 100 },
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
  koreanSentiment?: KoreanSentimentData;
}

// ===== AG3 사전 로드 출력 =====
export interface AG3PreOutput {
  cityId: number | null;
  dbPlacesMap: Map<string, any>;
  cityName: string;
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
