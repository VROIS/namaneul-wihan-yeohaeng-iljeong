export type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';

export type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';

export type TravelPace = 'Packed' | 'Relaxed';

export type MobilityStyle = 'WalkMore' | 'Minimal';

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
  travelPace: TravelPace;
  mobilityStyle: MobilityStyle;
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

export const TRAVEL_STYLE_OPTIONS: { id: TravelStyle; label: string; icon: string }[] = [
  { id: 'Luxury', label: '럭셔리', icon: 'star' },
  { id: 'Premium', label: '프리미엄', icon: 'award' },
  { id: 'Reasonable', label: '합리적', icon: 'thumbs-up' },
  { id: 'Economic', label: '경제적', icon: 'dollar-sign' },
];

export const TRAVEL_PACE_OPTIONS: { id: TravelPace; label: string; icon: string }[] = [
  { id: 'Packed', label: '빡빡하게', icon: 'zap' },
  { id: 'Relaxed', label: '여유롭게', icon: 'sun' },
];

export const MOBILITY_STYLE_OPTIONS: { id: MobilityStyle; label: string; icon: string }[] = [
  { id: 'WalkMore', label: '많이 걷기', icon: 'map' },
  { id: 'Minimal', label: '이동 최소화', icon: 'home' },
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
