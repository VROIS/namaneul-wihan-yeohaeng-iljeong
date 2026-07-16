// 타입·상수 정의 = itinerary-generator 분리(2026-07-15 §0 슬림화, 순수 이동)
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
// ⚠️ 2026-05-19 = TravelStyle = types.ts SSOT 에서 import (= 위)
// 여행 밀도: 빡빡하게(Packed) | 보통(Normal) | 여유롭게(Relaxed)
// ⚠️ 프론트엔드 기준 'Normal' 사용 (Moderate 아님)
export type TravelPace = "Packed" | "Normal" | "Relaxed";
export type MobilityStyle = "WalkMore" | "Moderate" | "Minimal";
export type CurationFocus = "Kids" | "Parents" | "Everyone" | "Self";

// ===== 사용자 시간 기반 슬롯 생성 로직 =====
// 핵심 규칙:
// 1. 사용자 출발시간/종료시간 = 절대 우선
// 2. 여행 밀도에 따라 슬롯 수 자동 계산
// 3. 2일 이상: 첫날(출발시간~21:00), 중간(09:00~21:00 풀타임), 마지막(09:00~종료시간)
export interface PaceConfig {
  slotDurationMinutes: number; // 슬롯 당 소요시간 (이동시간 포함)
  maxSlotsPerDay: number; // 하루 최대 슬롯 수 (풀타임 12시간 기준)
}

export const PACE_CONFIG: Record<TravelPace, PaceConfig> = {
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
export interface MealSlotConfig {
  type: "lunch" | "dinner";
  startHour: number;
  endHour: number;
}

export const MEAL_SLOTS: MealSlotConfig[] = [
  { type: "lunch", startHour: 12, endHour: 14 },
  { type: "dinner", startHour: 18, endHour: 20 },
];

// ===== 식당 선정 4대 원칙 (1차 목표 확정) =====
// 1순위: 슬롯 강제 (하루 점심1 + 저녁1, 그 이상 식당 배치 불가)
// 2순위: 동선 고려 (전후 장소와 가까운 식당 우선)
// 3순위: 예산 범위 (점심35%/저녁65% 배분, 공개가격 최대값 기준)
// 4순위: 유명세 가중치 (리뷰수50% + 한국리뷰30% + SNS20%)

// ⚠️ 2026-05-19 = MEAL_BUDGET 자체 정의 폐기 = types.ts SSOT (= 4:6 split) 단일 import (= 위)

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = PSR rank tier offset (= ag2-DB SELECT 와 동기 강제)
// = Economic = rank 1~ / Reasonable = rank 1001~ / High-end = rank 2001~
export const PSR_TIER_OFFSET = { Reasonable: 1000, HighEnd: 2000 } as const;
export const RANK_FALLBACK = 999;
export const NON_FOOD_MAX_RANK = 20;

// 기본 시작/종료 시간 (중간 날짜용)
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
