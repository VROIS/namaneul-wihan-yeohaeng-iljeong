export type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';

export type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';

export type TravelPace = 'Packed' | 'Normal' | 'Relaxed';

export type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';

export type CompanionType = 'Single' | 'Couple' | 'Family' | 'Group';

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
  mealLevel: MealLevel;
  guideOption: GuideOption;
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

export interface Itinerary {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: DayPlan[];
  vibeWeights?: VibeWeight[];
}

export const VIBE_OPTIONS: { id: Vibe; label: string; icon: string; baseWeight: number }[] = [
  { id: 'Healing', label: '힐링', icon: 'heart', baseWeight: 35 },
  { id: 'Adventure', label: '모험', icon: 'compass', baseWeight: 10 },
  { id: 'Hotspot', label: '핫스팟', icon: 'trending-up', baseWeight: 15 },
  { id: 'Foodie', label: '미식', icon: 'coffee', baseWeight: 25 },
  { id: 'Romantic', label: '로맨틱', icon: 'heart', baseWeight: 5 },
  { id: 'Culture', label: '문화/예술', icon: 'book-open', baseWeight: 10 },
];

export const TRAVEL_STYLE_OPTIONS: { id: TravelStyle; label: string; icon: string; priceLevel: number; transport: string; dining: string; guide: string; placesPerDay: number }[] = [
  { id: 'Luxury', label: '럭셔리', icon: 'star', priceLevel: 4, transport: 'VIP 전용차량', dining: '미슐랭급', guide: '전담 가이드 동행', placesPerDay: 2 },
  { id: 'Premium', label: '프리미엄', icon: 'award', priceLevel: 3, transport: '고급 세단', dining: '트렌디 레스토랑', guide: '세단 가이드', placesPerDay: 3 },
  { id: 'Reasonable', label: '합리적', icon: 'thumbs-up', priceLevel: 2, transport: '우버+대중교통', dining: '현지인 맛집', guide: '워킹 가이드', placesPerDay: 4 },
  { id: 'Economic', label: '경제적', icon: 'dollar-sign', priceLevel: 1, transport: '대중교통', dining: '스트리트푸드', guide: '없음 (자유)', placesPerDay: 6 },
];

export const TRAVEL_PACE_OPTIONS: { id: TravelPace; label: string; icon: string; placesPerDay: number; description: string }[] = [
  { id: 'Packed', label: '빡빡하게', icon: 'zap', placesPerDay: 6, description: '관광3 + 점심1 + 카페1 + 저녁1' },
  { id: 'Normal', label: '보통', icon: 'clock', placesPerDay: 4, description: '관광2 + 점심1 + 저녁1' },
  { id: 'Relaxed', label: '여유롭게', icon: 'sun', placesPerDay: 3, description: '관광1 + 점심1 + 저녁1' },
];

export const MOBILITY_STYLE_OPTIONS: { id: MobilityStyle; label: string; icon: string; radiusKm: number; transport: string }[] = [
  { id: 'WalkMore', label: '많이 걷기', icon: 'map', radiusKm: 2, transport: '대중교통' },
  { id: 'Moderate', label: '적당히', icon: 'navigation', radiusKm: 3, transport: '택시/대중교통' },
  { id: 'Minimal', label: '이동 최소화', icon: 'home', radiusKm: 5, transport: 'VIP 전용차량' },
];

export const COMPANION_OPTIONS: { id: CompanionType; label: string; icon: string }[] = [
  { id: 'Single', label: '혼자', icon: 'user' },
  { id: 'Couple', label: '커플', icon: 'heart' },
  { id: 'Family', label: '가족', icon: 'users' },
  { id: 'Group', label: '친구들', icon: 'users' },
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
