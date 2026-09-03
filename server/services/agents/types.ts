import { PACE_SLOT_MINUTES } from "../../../shared/pace-duration";

// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = KoreanSentiment 완전 폐기 (= 인프라/로우데이터 90% 오류)

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Romantic → Shopping (= PSR shopping 카테고리 1:1)
export type Vibe =
  | "Healing"
  | "Adventure"
  | "Hotspot"
  | "Foodie"
  | "Shopping"
  | "Culture"
  | "Attraction"; // = 즐길거리(seed_category 'attraction') 신규 / Foodie=내부 식당태그 유지
export type TravelStyle = "Luxury" | "Premium" | "Reasonable" | "Economic";

// ⚠️ 수정금지(승인필요) 2026-05-19 = place_seed_raw.seed_category 8 enum (= BTS 마커 + LUCIE 캐릭터 1:1)
export type SeedCategory =
  | "bts_venue"
  | "heritage"
  | "hotspot"
  | "attraction"
  | "adventure"
  | "healing"
  | "shopping"
  | "restaurant";
// ⚠️ 수정금지(승인필요) 2026-07-11 = SeedCategory 런타임 화이트리스트 1벌(§16) = Gemini 자유문자열(seed_category) 검증용.
export const SEED_CATEGORIES: ReadonlySet<string> = new Set([
  "bts_venue",
  "heritage",
  "hotspot",
  "attraction",
  "adventure",
  "healing",
  "shopping",
  "restaurant",
]);
export type TravelPace = "Packed" | "Normal" | "Relaxed";
export type MobilityStyle = "WalkMore" | "Moderate" | "Minimal";
export type CurationFocus = "Kids" | "Parents" | "Everyone" | "Self";

export interface PaceConfig {
  slotDurationMinutes: number; // 활동 1곳 체류+이동 시간(밀도별)
  // ⚠️ 2026-07-21 사장님 SSOT = 식사 슬롯 시간을 활동과 분리(밀도별) = 활동3 의무 + 저녁이 실제 저녁시각(영업시간)에 오게 함.
  mealDurationMinutes: number; // 식사 1회 시간(밀도별, 활동보다 짧음)
  maxSlotsPerDay: number; // (레거시 상한, 이제 가용시간이 슬롯수 결정 = 실질 미사용이나 안전 상한 유지)
}

export interface MealSlotConfig {
  type: "lunch" | "dinner";
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
  dayAccommodations?: {
    day: number;
    name: string;
    address: string;
    coords: { lat: number; lng: number };
  }[];
  language?: string;
  /** ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인(BTS D단계) = 반드시 포함할 장소 id(선택 순서 유지). */
  pinnedPlaceIds?: number[];
  /** ⚠️ 2026-07-31 사장님 지시(BTS 문제점4) = 마지막 슬롯에 고정 부착할 장소(= 공연장) + 그 시각(= 공연 시작). */
  finalPlaceId?: number;
  finalPlaceTime?: string;
}

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = 점수 시스템 + MIX path 완전 폐기
export interface PlaceResult {
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
  recommendedTime?: string;
  googleMapsUrl: string;
  estimatedPriceEur?: number; // = PSR.price_eur 직접 복사 (= 사용자 SSOT)
  seedCategory?: SeedCategory; // FE LUCIDE 아이콘 매핑
  // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 취향 슬롯 카테고리 = AG1 배정(computeCatSlots 매트릭스)→Gemini 이행값 보존(표시 전용).
  slotCategory?: SeedCategory;
  finalScore?: number; // = max(0, 21 - rank) = AG3 단순 부여
  userRatingCount?: number; // = PSR.googleReviewCount (= 식당 정렬 보조)
  selectionReasons?: string[];
  confidenceLevel?: "high" | "medium" | "low" | "minimal";
  // ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 베스트 언어코드 = 카테고리 안 우선순위 (정본 B4)
  bestRank?: number | null; // = PSR.best_rank(언어코드) = 베스트 우선 정렬용
  // ⚠️ 수정금지(승인필요) 2026-06-11 = nubiReason 폐기 (= 헛바퀴) → summary_ko 흡수통합. 타입 제거로 컴파일러가 잔존 사용처 강제 노출.
  dayZone?: "core" | "outskirt" | null; // PSR.day_zone (= 일자 zone 매칭)
  // ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT = 결함 5 해소 = ag4 활동 매핑 꼭 필요한 5 필드만
  nameKo?: string | null; // = PSR.name_ko (= ag4 displayNameKo 매핑)
  nameLocal?: string | null; // = PSR.name_local (= ag4 displayNameLocal 매핑)
  address?: string | null; // = PSR.address (= ag4 displayAddress 매핑)
  summaryKo?: string | null; // = PSR.summary_ko (= ag4 활동 selectionReasonKo 매핑)
  editorialSummary?: string | null; // = PSR.editorial_summary (= ag4 활동 shortformKo 매핑)
}

// ⚠️ 수정금지(승인필요) 2026-08-31 사장님 결정 = 활동간격 = 식사간격 동일(식사 보장). maxSlotsPerDay = 안전 상한 (정본 B4)
export const PACE_CONFIG: Record<TravelPace, PaceConfig> = {
  Packed: {
    slotDurationMinutes: PACE_SLOT_MINUTES.Packed,
    mealDurationMinutes: PACE_SLOT_MINUTES.Packed,
    maxSlotsPerDay: 12,
  },
  Normal: {
    slotDurationMinutes: PACE_SLOT_MINUTES.Normal,
    mealDurationMinutes: PACE_SLOT_MINUTES.Normal,
    maxSlotsPerDay: 10,
  },
  Relaxed: {
    slotDurationMinutes: PACE_SLOT_MINUTES.Relaxed,
    mealDurationMinutes: PACE_SLOT_MINUTES.Relaxed,
    maxSlotsPerDay: 8,
  },
};

export const MEAL_SLOTS: MealSlotConfig[] = [
  { type: "lunch", startHour: 12, endHour: 14 },
  { type: "dinner", startHour: 18, endHour: 20 },
];

export const MEAL_BUDGET: Record<
  TravelStyle,
  {
    dailyTotal: number;
    lunch: number;
    dinner: number;
    lunchLabel: string;
    dinnerLabel: string;
    label: string;
    min: number;
    max: number;
  }
> = {
  // ⚠️ 수정금지(승인필요) 사용자 SSOT 2026-05-19 = 4:6 split (= 점심 40% / 저녁 60%)
  Economic: {
    dailyTotal: 40,
    lunch: 16,
    dinner: 24,
    lunchLabel: "€16 이내",
    dinnerLabel: "€24 이내",
    label: "€40/일",
    min: 0,
    max: 24,
  },
  Reasonable: {
    dailyTotal: 100,
    lunch: 40,
    dinner: 60,
    lunchLabel: "€40 이내",
    dinnerLabel: "€60 이내",
    label: "€100/일",
    min: 25,
    max: 60,
  },
  Premium: {
    dailyTotal: 300,
    lunch: 120,
    dinner: 180,
    lunchLabel: "€120 이내",
    dinnerLabel: "€180 이내",
    label: "€300/일",
    min: 61,
    max: 180,
  },
  Luxury: {
    dailyTotal: 300,
    lunch: 120,
    dinner: 180,
    lunchLabel: "€120 이내",
    dinnerLabel: "€180 이내",
    label: "€300+/일",
    min: 181,
    max: 9999,
  },
};

export const DEFAULT_START_TIME = "09:00";
export const DEFAULT_END_TIME = "21:00";

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

export interface AG3PreOutput {
  cityId: number | null;
  cityName: string;
  cityCoords?: { lat: number; lng: number };
  seedRawMap?: Map<string, any>;
}

export interface ScheduleSlot {
  day: number;
  slot: string;
  place: PlaceResult;
  startTime: string;
  endTime: string;
  isMealSlot: boolean;
  mealType?: "lunch" | "dinner";
}

export interface AG3Output {
  schedule: ScheduleSlot[];
  scoredPlaces: PlaceResult[];
  daySlotsConfig: DaySlotConfig[];
  travelPace: TravelPace;
  vibes: Vibe[];
}

export function getCompanionCount(companionType: string): number {
  const mapping: Record<string, number> = {
    Single: 1,
    Solo: 1,
    Couple: 2,
    Family: 4,
    ExtendedFamily: 8,
    Group: 10,
  };
  return mapping[companionType] || 1;
}

// ===== 슬롯 수 계산 (2026-07-21 사장님 SSOT = 활동 우선 최대 + 식사2) =====
export function calculateSlotsForDay(
  startTime: string,
  endTime: string,
  pace: TravelPace,
): number {
  const config = PACE_CONFIG[pace];
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const availableMinutes = endH * 60 + endM - (startH * 60 + startM);
  if (availableMinutes <= 0) return 0;
  const forActivities = availableMinutes - config.mealDurationMinutes;
  const nActivities = Math.max(
    1,
    Math.floor(forActivities / config.slotDurationMinutes),
  );
  return Math.min(nActivities + 2, config.maxSlotsPerDay);
}

export function calculateDayCount(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(Math.min(23, hours)).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
