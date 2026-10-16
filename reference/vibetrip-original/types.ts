export type Vibe = 'Healing' | 'Adventure' | 'CityPop' | 'Foodie' | 'Romantic' | 'Culture';
export type TravelPriority = 'Photo/Trend' | 'Comfort/Efficiency' | 'Safety/Local' | 'Luxury/Shopping';

export type CompanionType = 'Single' | 'Couple' | 'Family' | 'Group';
export interface CompanionDetail {
  count: number;
  ages: number[];
}
export type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';

export interface Place {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  lat: number;
  lng: number;
  time: string;
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
