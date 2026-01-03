export type Vibe = 'Healing' | 'Adventure' | 'CityPop' | 'Foodie' | 'Romantic' | 'Culture';

export type TravelStyle = 'Luxury' | 'Reasonable' | 'Economic' | 'Comfortable';

export type CompanionType = 'Single' | 'Couple' | 'Family' | 'Group';

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
  summary: string;
}

export interface Itinerary {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: DayPlan[];
}

export const VIBE_OPTIONS: { id: Vibe; label: string; icon: string }[] = [
  { id: 'Healing', label: '힐링', icon: 'heart' },
  { id: 'Adventure', label: '모험', icon: 'compass' },
  { id: 'CityPop', label: '시티팝', icon: 'home' },
  { id: 'Foodie', label: '미식', icon: 'coffee' },
  { id: 'Romantic', label: '로맨틱', icon: 'heart' },
  { id: 'Culture', label: '문화/예술', icon: 'book-open' },
];

export const TRAVEL_STYLE_OPTIONS: { id: TravelStyle; label: string; description: string; icon: string }[] = [
  { id: 'Luxury', label: '럭셔리', description: '시간 절약, 포토제닉, 프리미엄', icon: 'star' },
  { id: 'Reasonable', label: '합리적', description: '가성비 좋은 선택', icon: 'thumbs-up' },
  { id: 'Economic', label: '경제적', description: '예산 중심 여행', icon: 'dollar-sign' },
  { id: 'Comfortable', label: '편안함', description: '안전 우선, 검증된 맛집', icon: 'shield' },
];

export const COMPANION_OPTIONS: { id: CompanionType; label: string; icon: string }[] = [
  { id: 'Single', label: '혼자', icon: 'user' },
  { id: 'Couple', label: '커플', icon: 'heart' },
  { id: 'Family', label: '가족', icon: 'users' },
  { id: 'Group', label: '친구들', icon: 'users' },
];

export const CURATION_FOCUS_OPTIONS: { id: CurationFocus; label: string; description: string }[] = [
  { id: 'Kids', label: '아이 중심', description: '아이가 주인공인 여행' },
  { id: 'Parents', label: '부모님 중심', description: '부모님을 위한 여행' },
  { id: 'Everyone', label: '모두 함께', description: '모든 구성원이 즐거운 여행' },
  { id: 'Self', label: '나 중심', description: '내가 주인공인 여행' },
];
