// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Romantic 모든 흔적 삭제 + Shopping 1:1 (= PSR shopping 카테고리)
// ⚠️ 수정금지(승인필요) 2026-06-06 = 미식(Foodie) 버튼 제거 → 즐길거리(Attraction) 추가 (= 식사는 예산으로 반영 = 자동)
// = 'Foodie' 는 타입에 유지(내부 식당 vibeTag 전용, 버튼 X) / 'Attraction'(즐길거리) = 신규 버튼 + seed_category 'attraction'
export type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Shopping' | 'Culture' | 'Attraction';

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
  birthDate: string;           // 🎯 사용자 본인 생년월일 (로그인 필수 - 가족 연령 추정용)
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
  // 🎯 API 요청 시 사용자 정보 (백엔드에서 DB 조회용)
  userId?: string;
  // 🏨 숙소 정보 (선택적 — 입력화면에서 설정, 초행자는 결과화면에서 설정 가능)
  accommodationName?: string;         // 숙소 이름 (ex: "Hotel Le Marais")
  accommodationAddress?: string;      // 숙소 주소
  accommodationCoords?: { lat: number; lng: number };  // 숙소 GPS 좌표
  accommodationPlaceId?: string;      // Google Place ID (재검색용)
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
  // Phase 1: 한국인 인기도 점수
  koreanPopularityScore?: number;
  // Phase 4: 구글맵 직접 링크 (클릭 시 구글맵 열기)
  googleMapsUrl?: string;
  // 차별점 = 후킹 숏폼 한줄요약 / Gemini AI 요약 추천 설명 (보통 글씨)
  geminiReason?: string;
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

// 🏨 Day별 숙소 설정 (이동형 여행: 결과화면에서 Day별 개별 설정)
export interface DayAccommodation {
  day: number;
  name: string;
  address: string;
  coords: { lat: number; lng: number };
  placeId?: string;  // Google Place ID
}

export interface DayPlan {
  day: number;
  places: Place[];
  city?: string;
  summary: string;
  // 🏨 해당 Day의 숙소 정보 (출발/복귀 기준점)
  accommodation?: DayAccommodation;
  // 🚶 숙소→첫장소, 마지막장소→숙소 이동정보
  departureTransit?: TransitInfo;   // 숙소 → 첫 관광지
  returnTransit?: TransitInfo;      // 마지막 관광지 → 숙소
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

// 💰 일별 예산 상세
export interface DailyBudgetBreakdown {
  day: number;
  transport: number;
  meals: number;
  entranceFees: number;
  subtotal: number;
  perPerson: number;
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
  // 🏨 숙소 정보 (공통 숙소 or Day별 개별 숙소)
  accommodation?: {
    name: string;
    address: string;
    coords: { lat: number; lng: number };
  };
  dayAccommodations?: DayAccommodation[];  // Day별 개별 숙소 (이동형 여행)
}

export const VIBE_OPTIONS: { id: Vibe; label: string; labelKey: string; icon: string; baseWeight: number }[] = [
  { id: 'Healing', label: '힐링', labelKey: 'options.healing', icon: 'flower-2', baseWeight: 35 },
  { id: 'Adventure', label: '모험', labelKey: 'options.adventure', icon: 'mountain', baseWeight: 10 },
  { id: 'Hotspot', label: '핫스팟', labelKey: 'options.hotspot', icon: 'camera', baseWeight: 15 },
  { id: 'Attraction', label: '즐길거리', labelKey: 'options.attraction', icon: 'ferris-wheel', baseWeight: 15 },
  { id: 'Shopping', label: '쇼핑', labelKey: 'options.shopping', icon: 'shopping-bag', baseWeight: 5 },
  { id: 'Culture', label: '문화/예술', labelKey: 'options.culture', icon: 'landmark', baseWeight: 10 },
];

// 여행 스타일 = Premium/Luxury 선택시 가이드 가격 포함 (마케팅 접점)
// ⚠️ mobilityStyle=Minimal과 중복 적용 안 됨 (동일 가격 1회만 스며듦)
export const TRAVEL_STYLE_OPTIONS: { 
  id: TravelStyle; 
  label: string;
  labelKey: string;
  icon: string; 
  priceLevel: number; 
  transport: string; 
  dining: string; 
  guide: string; 
  placesPerDay: number;
  includesGuidePrice: boolean;
}[] = [
  { id: 'Luxury', label: '럭셔리', labelKey: 'options.luxury', icon: 'star', priceLevel: 4, transport: 'VIP 전용차량', dining: '미슐랭급', guide: '전담 가이드 동행', placesPerDay: 2, includesGuidePrice: true },
  { id: 'Premium', label: '프리미엄', labelKey: 'options.premium', icon: 'award', priceLevel: 3, transport: '고급 세단', dining: '트렌디 레스토랑', guide: '세단 가이드', placesPerDay: 3, includesGuidePrice: true },
  { id: 'Reasonable', label: '합리적', labelKey: 'options.reasonable', icon: 'thumbs-up', priceLevel: 2, transport: '우버+대중교통', dining: '현지인 맛집', guide: '워킹 가이드', placesPerDay: 4, includesGuidePrice: false },
  { id: 'Economic', label: '경제적', labelKey: 'options.economic', icon: 'dollar-sign', priceLevel: 1, transport: '대중교통', dining: '스트리트푸드', guide: '없음 (자유)', placesPerDay: 6, includesGuidePrice: false },
];

export const TRAVEL_PACE_OPTIONS: { id: TravelPace; label: string; labelKey: string; icon: string; placesPerDay: number; description: string }[] = [
  { id: 'Packed', label: '빡빡하게', labelKey: 'options.packed', icon: 'zap', placesPerDay: 6, description: '관광3 + 점심1 + 카페1 + 저녁1' },
  { id: 'Normal', label: '보통', labelKey: 'options.normal', icon: 'clock', placesPerDay: 4, description: '관광2 + 점심1 + 저녁1' },
  { id: 'Relaxed', label: '여유롭게', labelKey: 'options.relaxed', icon: 'sun', placesPerDay: 3, description: '관광1 + 점심1 + 저녁1' },
];

// 8️⃣ 이동 스타일 = 교통비 원칙 결정
// WalkMore/Moderate → Google Maps API 실시간 가격
// Minimal → 드라이빙 가이드 가격표 적용 (마케팅 접점)
export const MOBILITY_STYLE_OPTIONS: { 
  id: MobilityStyle; 
  label: string;
  labelKey: string;
  icon: string; 
  radiusKm: number; 
  transport: string;
  priceSource: 'google_api' | 'guide_price';
  description: string;
}[] = [
  { id: 'WalkMore', label: '많이 걷기', labelKey: 'options.walkMore', icon: 'map', radiusKm: 2, transport: '대중교통만', priceSource: 'google_api', description: '실시간 대중교통 요금' },
  { id: 'Moderate', label: '적당히', labelKey: 'options.moderate', icon: 'navigation', radiusKm: 3, transport: '대중교통+우버', priceSource: 'google_api', description: '실시간 우버/대중교통 요금' },
  { id: 'Minimal', label: '이동 최소화', labelKey: 'options.minimal', icon: 'home', radiusKm: 5, transport: '드라이빙 가이드', priceSource: 'guide_price', description: '전용 차량 가이드 서비스' },
];

// 누구랑 → 인원 수 + 교통편 자동 확정의 핵심
// 프리미엄/럭셔리 선택시: 
//   혼자~가족(1-4명) → 가이드 승용차
//   대가족(5-7명) → 밴 가이드
//   친구들(8명+) → 미니버스
export const COMPANION_OPTIONS: { 
  id: CompanionType; 
  label: string;
  labelKey: string;
  icon: string; 
  minCount: number; 
  maxCount: number; 
  defaultCount: number;
  transportType: 'sedan' | 'van' | 'minibus';
}[] = [
  { id: 'Single', label: '혼자', labelKey: 'options.single', icon: 'user', minCount: 1, maxCount: 1, defaultCount: 1, transportType: 'sedan' },
  { id: 'Couple', label: '커플', labelKey: 'options.couple', icon: 'heart', minCount: 2, maxCount: 2, defaultCount: 2, transportType: 'sedan' },
  { id: 'Family', label: '가족', labelKey: 'options.family', icon: 'users', minCount: 3, maxCount: 4, defaultCount: 4, transportType: 'sedan' },
  { id: 'ExtendedFamily', label: '대가족', labelKey: 'options.extendedFamily', icon: 'home', minCount: 5, maxCount: 7, defaultCount: 6, transportType: 'van' },
  { id: 'Group', label: '친구들', labelKey: 'options.group', icon: 'users', minCount: 8, maxCount: 20, defaultCount: 10, transportType: 'minibus' },
];

export const CURATION_FOCUS_OPTIONS: { id: CurationFocus; label: string; labelKey: string; icon: string }[] = [
  { id: 'Kids', label: '아이', labelKey: 'options.kids', icon: 'smile' },
  { id: 'Parents', label: '부모님', labelKey: 'options.parents', icon: 'heart' },
  { id: 'Everyone', label: '모두', labelKey: 'options.everyone', icon: 'users' },
  { id: 'Self', label: '나', labelKey: 'options.self', icon: 'user' },
];

export const MEAL_LEVEL_OPTIONS: { id: MealLevel; label: string; labelKey: string; icon: string; pricePerMeal: number; description: string }[] = [
  { id: 'Michelin', label: '미슐랭급', labelKey: 'options.michelin', icon: 'star', pricePerMeal: 100, description: '미슐랭 1~3스타' },
  { id: 'Trendy', label: '트렌디', labelKey: 'options.trendy', icon: 'trending-up', pricePerMeal: 50, description: '인스타 핫플' },
  { id: 'Local', label: '현지맛집', labelKey: 'options.local', icon: 'map-pin', pricePerMeal: 30, description: '로컬 추천' },
  { id: 'Budget', label: '간편식', labelKey: 'options.budget', icon: 'coffee', pricePerMeal: 10, description: '스트리트푸드' },
];

export const GUIDE_OPTION_OPTIONS: { id: GuideOption; label: string; labelKey: string; icon: string; pricePerDay: number; description: string; editable: boolean }[] = [
  { id: 'None', label: '없음 (자유)', labelKey: 'options.guideNone', icon: 'compass', pricePerDay: 0, description: '직접 이동', editable: false },
  { id: 'Walking', label: '워킹 가이드', labelKey: 'options.guideWalking', icon: 'map', pricePerDay: 420, description: '반일 도보 투어', editable: true },
  { id: 'Sedan', label: '세단 가이드', labelKey: 'options.guideSedan', icon: 'navigation', pricePerDay: 600, description: '전일 차량+가이드', editable: true },
  { id: 'VIP', label: 'VIP 전담', labelKey: 'options.guideVip', icon: 'award', pricePerDay: 1015, description: '최상위 VIP 서비스', editable: true },
];
