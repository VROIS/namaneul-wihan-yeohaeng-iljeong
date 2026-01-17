export type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';

export type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';

export type TravelPace = 'Packed' | 'Normal' | 'Relaxed';

export type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';

// 누구랑 = 비용 계산의 핵심 로우데이터
// 혼자(1명), 커플(2명), 가족(3-4명), 대가족(5-7명), 친구들(8명+)
export type CompanionType = 'Single' | 'Couple' | 'Family' | 'ExtendedFamily' | 'Group';

export type MealLevel = 'Michelin' | 'Trendy' | 'Local' | 'Budget';

export type GuideOption = 'None' | 'Walking' | 'Sedan' | 'VIP';

export type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';

export interface CompanionDetail {
  count: number;
  ages: number[];
}

export interface TripFormData {
  birthDate: string;
  companionType: CompanionType;
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
  mealLevel?: MealLevel;
  guideOption?: GuideOption;
  // 교통편 자동 확정 (CompanionType에 따라 자동 설정)
  transportType?: 'sedan' | 'van' | 'minibus';
}

export interface Place {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  lat: number;
  lng: number;
  vibeScore: number;
  confidenceScore: number;
  sourceType: string;
  personaFitReason: string;
  tags: string[];
  vibeTags?: Vibe[];
  city?: string;
  region?: string;
  realityCheck: {
    weather: 'Sunny' | 'Cloudy' | 'Rainy';
    crowd: 'Low' | 'Medium' | 'High';
    status: 'Open' | 'Closed' | 'Alert';
    penaltyNote?: string;
  };
  image: string;
  priceEstimate: string;
  // 💰 실시간 가격 정보 (백엔드에서 계산)
  entranceFee?: number;        // 1인당 입장료 (EUR)
  entranceFeeTotal?: number;   // 인원수 × 입장료
  isMeal?: boolean;            // 식사 장소 여부
  mealPrice?: number;          // 식사 예상 가격
  // 🍽️ 식사 슬롯 정보 (점심/저녁 강제 배치)
  isMealSlot?: boolean;        // 점심/저녁 슬롯 여부
  mealType?: 'lunch' | 'dinner'; // 식사 종류
  mealPriceLabel?: string;     // "€30 내외" 등
}

// 🚇 이동 구간 정보
export interface TransitInfo {
  from: string;
  to: string;
  mode: 'walk' | 'metro' | 'bus' | 'uber' | 'taxi' | 'guide';
  modeLabel: string;           // "지하철", "도보", "우버" 등
  duration: number;            // 분 단위
  durationText: string;        // "15분"
  cost: number;                // 1인당 비용
  costTotal: number;           // 인원수 × 비용
}

export interface DayPlan {
  day: number;
  places: Place[];
  city?: string;
  summary: string;
}

export interface VibeWeight {
  vibe: Vibe;
  weight: number;
  percentage: number;
}

// 🚨 위기 정보 타입
export interface CrisisAlert {
  id: number;
  type: 'strike' | 'protest' | 'traffic' | 'weather' | 'security';
  title: string;
  titleKo: string;
  description: string;
  date: string;
  endDate?: string;
  city: string;
  affected: string[];
  severity: number; // 1-10
  recommendation: string;
  recommendationKo: string;
}

// 💰 전체 예산 정보
export interface BudgetTotals {
  transport: number;
  meals: number;
  entranceFees: number;
  grandTotal: number;
  perPerson: number;
  perDay: number;
}

export interface Itinerary {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: DayPlan[];
  vibeWeights?: VibeWeight[];
  // 🚨 위기 정보 (여행 기간 중 해당 도시의 알림)
  crisisAlerts?: CrisisAlert[];
  // 💰 예산 정보
  budget?: {
    travelStyle: TravelStyle;
    dailyBreakdowns: DailyBudgetBreakdown[];
    totals: BudgetTotals;
  };
  // 📋 여행 설정 요약
  companionType?: string;
  companionCount?: number;
  travelStyle?: TravelStyle;
  mobilityStyle?: MobilityStyle;
}

export const VIBE_OPTIONS: { id: Vibe; label: string; icon: string; baseWeight: number }[] = [
  { id: 'Healing', label: '힐링', icon: 'heart', baseWeight: 35 },
  { id: 'Adventure', label: '모험', icon: 'compass', baseWeight: 10 },
  { id: 'Hotspot', label: '핫스팟', icon: 'trending-up', baseWeight: 15 },
  { id: 'Foodie', label: '미식', icon: 'coffee', baseWeight: 25 },
  { id: 'Romantic', label: '로맨틱', icon: 'heart', baseWeight: 5 },
  { id: 'Culture', label: '문화/예술', icon: 'book-open', baseWeight: 10 },
];

// 여행 스타일 = Premium/Luxury 선택시 가이드 가격 포함 (마케팅 접점)
// ⚠️ mobilityStyle=Minimal과 중복 적용 안 됨 (동일 가격 1회만 스며듦)
export const TRAVEL_STYLE_OPTIONS: { 
  id: TravelStyle; 
  label: string; 
  icon: string; 
  priceLevel: number; 
  transport: string; 
  dining: string; 
  guide: string; 
  placesPerDay: number;
  includesGuidePrice: boolean;  // 가이드 가격 포함 여부
}[] = [
  { id: 'Luxury', label: '럭셔리', icon: 'star', priceLevel: 4, transport: 'VIP 전용차량', dining: '미슐랭급', guide: '전담 가이드 동행', placesPerDay: 2, includesGuidePrice: true },
  { id: 'Premium', label: '프리미엄', icon: 'award', priceLevel: 3, transport: '고급 세단', dining: '트렌디 레스토랑', guide: '세단 가이드', placesPerDay: 3, includesGuidePrice: true },
  { id: 'Reasonable', label: '합리적', icon: 'thumbs-up', priceLevel: 2, transport: '우버+대중교통', dining: '현지인 맛집', guide: '워킹 가이드', placesPerDay: 4, includesGuidePrice: false },
  { id: 'Economic', label: '경제적', icon: 'dollar-sign', priceLevel: 1, transport: '대중교통', dining: '스트리트푸드', guide: '없음 (자유)', placesPerDay: 6, includesGuidePrice: false },
];

export const TRAVEL_PACE_OPTIONS: { id: TravelPace; label: string; icon: string; placesPerDay: number; description: string }[] = [
  { id: 'Packed', label: '빡빡하게', icon: 'zap', placesPerDay: 6, description: '관광3 + 점심1 + 카페1 + 저녁1' },
  { id: 'Normal', label: '보통', icon: 'clock', placesPerDay: 4, description: '관광2 + 점심1 + 저녁1' },
  { id: 'Relaxed', label: '여유롭게', icon: 'sun', placesPerDay: 3, description: '관광1 + 점심1 + 저녁1' },
];

// 8️⃣ 이동 스타일 = 교통비 원칙 결정
// WalkMore/Moderate → Google Maps API 실시간 가격
// Minimal → 드라이빙 가이드 가격표 적용 (마케팅 접점)
export const MOBILITY_STYLE_OPTIONS: { 
  id: MobilityStyle; 
  label: string; 
  icon: string; 
  radiusKm: number; 
  transport: string;
  priceSource: 'google_api' | 'guide_price';
  description: string;
}[] = [
  { id: 'WalkMore', label: '많이 걷기', icon: 'map', radiusKm: 2, transport: '대중교통만', priceSource: 'google_api', description: '실시간 대중교통 요금' },
  { id: 'Moderate', label: '적당히', icon: 'navigation', radiusKm: 3, transport: '대중교통+우버', priceSource: 'google_api', description: '실시간 우버/대중교통 요금' },
  { id: 'Minimal', label: '이동 최소화', icon: 'home', radiusKm: 5, transport: '드라이빙 가이드', priceSource: 'guide_price', description: '전용 차량 가이드 서비스' },
];

// 누구랑 → 인원 수 + 교통편 자동 확정의 핵심
// 프리미엄/럭셔리 선택시: 
//   혼자~가족(1-4명) → 가이드 승용차
//   대가족(5-7명) → 밴 가이드
//   친구들(8명+) → 미니버스
export const COMPANION_OPTIONS: { 
  id: CompanionType; 
  label: string; 
  icon: string; 
  minCount: number; 
  maxCount: number; 
  defaultCount: number;
  transportType: 'sedan' | 'van' | 'minibus';
}[] = [
  { id: 'Single', label: '혼자', icon: 'user', minCount: 1, maxCount: 1, defaultCount: 1, transportType: 'sedan' },
  { id: 'Couple', label: '커플', icon: 'heart', minCount: 2, maxCount: 2, defaultCount: 2, transportType: 'sedan' },
  { id: 'Family', label: '가족', icon: 'users', minCount: 3, maxCount: 4, defaultCount: 4, transportType: 'sedan' },
  { id: 'ExtendedFamily', label: '대가족', icon: 'home', minCount: 5, maxCount: 7, defaultCount: 6, transportType: 'van' },
  { id: 'Group', label: '친구들', icon: 'users', minCount: 8, maxCount: 20, defaultCount: 10, transportType: 'minibus' },
];

export const CURATION_FOCUS_OPTIONS: { id: CurationFocus; label: string; icon: string }[] = [
  { id: 'Kids', label: '아이', icon: 'smile' },
  { id: 'Parents', label: '부모님', icon: 'heart' },
  { id: 'Everyone', label: '모두', icon: 'users' },
  { id: 'Self', label: '나', icon: 'user' },
];

export const MEAL_LEVEL_OPTIONS: { id: MealLevel; label: string; icon: string; pricePerMeal: number; description: string }[] = [
  { id: 'Michelin', label: '미슐랭급', icon: 'star', pricePerMeal: 100, description: '미슐랭 1~3스타' },
  { id: 'Trendy', label: '트렌디', icon: 'trending-up', pricePerMeal: 50, description: '인스타 핫플' },
  { id: 'Local', label: '현지맛집', icon: 'map-pin', pricePerMeal: 30, description: '로컬 추천' },
  { id: 'Budget', label: '간편식', icon: 'coffee', pricePerMeal: 10, description: '스트리트푸드' },
];

export const GUIDE_OPTION_OPTIONS: { id: GuideOption; label: string; icon: string; pricePerDay: number; description: string; editable: boolean }[] = [
  { id: 'None', label: '없음 (자유)', icon: 'compass', pricePerDay: 0, description: '직접 이동', editable: false },
  { id: 'Walking', label: '워킹 가이드', icon: 'map', pricePerDay: 420, description: '반일 도보 투어', editable: true },
  { id: 'Sedan', label: '세단 가이드', icon: 'navigation', pricePerDay: 600, description: '전일 차량+가이드', editable: true },
  { id: 'VIP', label: 'VIP 전담', icon: 'award', pricePerDay: 1015, description: '최상위 VIP 서비스', editable: true },
];
