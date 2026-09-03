import { type TravelStyle } from "../agents/types";

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Romantic → Shopping
export type Vibe =
  | "Healing"
  | "Adventure"
  | "Hotspot"
  | "Foodie"
  | "Shopping"
  | "Culture"
  | "Attraction"; // = 즐길거리(seed_category 'attraction') = agents/types Vibe 와 동기 (2026-06-06)
export type TravelPace = "Packed" | "Normal" | "Relaxed";
export type MobilityStyle = "WalkMore" | "Moderate" | "Minimal";
export type CurationFocus = "Kids" | "Parents" | "Everyone" | "Self";

export interface MealSlotConfig {
  type: "lunch" | "dinner";
  startHour: number;
  endHour: number;
}

export const MEAL_SLOTS: MealSlotConfig[] = [
  { type: "lunch", startHour: 12, endHour: 14 },
  { type: "dinner", startHour: 18, endHour: 20 },
];

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = PSR rank tier offset (= ag2-DB SELECT 와 동기 강제)
export const PSR_TIER_OFFSET = { Reasonable: 1000, HighEnd: 2000 } as const;
export const RANK_FALLBACK = 999;
export const NON_FOOD_MAX_RANK = 20;

export const DEFAULT_START_TIME = "09:00";
export const DEFAULT_END_TIME = "21:00";

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
  googleMapsUrl: string;
  estimatedPriceEur?: number; // PSR.price_eur 직접 복사
  finalScore?: number; // max(0, 21 - rank) = AG3 단순 부여
  selectionReasons?: string[];
  confidenceLevel?: "high" | "medium" | "low" | "minimal";
  dayZone?: "core" | "outskirt" | null;
}
