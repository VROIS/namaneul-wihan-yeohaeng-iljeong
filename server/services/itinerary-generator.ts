import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';
type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';
type TravelPace = 'Packed' | 'Relaxed';
type MobilityStyle = 'WalkMore' | 'Minimal';
type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';

interface TripFormData {
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
}

interface PlaceResult {
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
}

interface TimeSlot {
  slot: 'morning' | 'lunch' | 'afternoon' | 'evening';
  startTime: string;
  endTime: string;
  vibeAffinity: Vibe[];
}

const TIME_SLOTS: TimeSlot[] = [
  { slot: 'morning', startTime: '09:00', endTime: '12:00', vibeAffinity: ['Healing', 'Culture', 'Adventure'] },
  { slot: 'lunch', startTime: '12:00', endTime: '14:00', vibeAffinity: ['Foodie'] },
  { slot: 'afternoon', startTime: '14:00', endTime: '18:00', vibeAffinity: ['Hotspot', 'Culture', 'Adventure', 'Healing'] },
  { slot: 'evening', startTime: '18:00', endTime: '21:00', vibeAffinity: ['Foodie', 'Romantic'] },
];

const BASE_WEIGHTS: Record<Vibe, number> = {
  Healing: 35,
  Foodie: 25,
  Hotspot: 15,
  Culture: 10,
  Adventure: 10,
  Romantic: 5,
};

const PROTAGONIST_ADJUSTMENTS: Record<CurationFocus, Partial<Record<Vibe, number>>> = {
  Kids: { Adventure: 10, Healing: -5, Culture: -5 },
  Parents: { Culture: 10, Healing: 5, Adventure: -10 },
  Everyone: {},
  Self: {},
};

function calculateVibeWeights(selectedVibes: Vibe[], protagonist: CurationFocus) {
  if (selectedVibes.length === 0) return [];
  
  const adjustments = PROTAGONIST_ADJUSTMENTS[protagonist];
  
  const adjustedWeights = selectedVibes.map(vibe => {
    let weight = BASE_WEIGHTS[vibe];
    if (adjustments[vibe]) {
      weight += adjustments[vibe]!;
    }
    return { vibe, weight: Math.max(0, weight) };
  });

  const totalWeight = adjustedWeights.reduce((sum, v) => sum + v.weight, 0);

  return adjustedWeights.map(({ vibe, weight }) => ({
    vibe,
    weight: weight / totalWeight,
    percentage: Math.round((weight / totalWeight) * 100),
  }));
}

async function searchGooglePlaces(
  destination: string,
  coords: { lat: number; lng: number } | undefined,
  vibes: Vibe[],
  travelStyle: TravelStyle
): Promise<PlaceResult[]> {
  const apiKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.log("Google Maps API key not available, using AI-generated places");
    return [];
  }

  const placeTypes = getPlaceTypesForVibes(vibes);
  const results: PlaceResult[] = [];
  
  for (const placeType of placeTypes.slice(0, 5)) {
    try {
      const searchUrl = new URL("https://places.googleapis.com/v1/places:searchNearby");
      
      const requestBody = {
        includedTypes: [placeType],
        maxResultCount: 10,
        locationRestriction: coords ? {
          circle: {
            center: { latitude: coords.lat, longitude: coords.lng },
            radius: 10000
          }
        } : undefined,
      };

      const response = await fetch(searchUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.priceLevel,places.photos",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.places) {
          for (const place of data.places) {
            results.push({
              id: place.id || `place-${Date.now()}-${Math.random()}`,
              name: place.displayName?.text || "Unknown Place",
              description: place.formattedAddress || "",
              lat: place.location?.latitude || 0,
              lng: place.location?.longitude || 0,
              vibeScore: calculatePlaceVibeScore(place, vibes),
              confidenceScore: Math.min(10, (place.userRatingCount || 0) / 100 + (place.rating || 0)),
              sourceType: "Google Places",
              personaFitReason: getPersonaFitReason(place.types || [], vibes),
              tags: place.types?.slice(0, 3) || [],
              vibeTags: mapPlaceTypesToVibes(place.types || []),
              image: place.photos?.[0]?.name 
                ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=400&key=${apiKey}`
                : "",
              priceEstimate: getPriceEstimate(place.priceLevel, travelStyle),
              placeTypes: place.types || [],
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to search for ${placeType}:`, error);
    }
  }

  return results;
}

function getPlaceTypesForVibes(vibes: Vibe[]): string[] {
  const vibeToPlaceTypes: Record<Vibe, string[]> = {
    Healing: ['spa', 'park', 'natural_feature', 'beach'],
    Adventure: ['tourist_attraction', 'hiking_area', 'amusement_park', 'zoo'],
    Hotspot: ['night_club', 'bar', 'shopping_mall', 'landmark'],
    Foodie: ['restaurant', 'cafe', 'bakery', 'food'],
    Romantic: ['restaurant', 'park', 'museum', 'art_gallery'],
    Culture: ['museum', 'art_gallery', 'library', 'historical_landmark'],
  };

  const types = new Set<string>();
  for (const vibe of vibes) {
    for (const type of vibeToPlaceTypes[vibe] || []) {
      types.add(type);
    }
  }
  return Array.from(types);
}

function calculatePlaceVibeScore(place: any, vibes: Vibe[]): number {
  const rating = place.rating || 3;
  const reviewCount = place.userRatingCount || 0;
  const reviewBonus = Math.min(2, Math.log10(reviewCount + 1) * 0.5);
  return Math.min(10, rating * 1.5 + reviewBonus);
}

function getPersonaFitReason(placeTypes: string[], vibes: Vibe[]): string {
  if (vibes.includes('Foodie') && placeTypes.some(t => ['restaurant', 'cafe', 'bakery'].includes(t))) {
    return '미식 탐험에 완벽한 장소';
  }
  if (vibes.includes('Culture') && placeTypes.some(t => ['museum', 'art_gallery'].includes(t))) {
    return '문화적 경험을 위한 최적의 선택';
  }
  if (vibes.includes('Healing') && placeTypes.some(t => ['spa', 'park'].includes(t))) {
    return '힐링과 휴식을 위한 공간';
  }
  if (vibes.includes('Adventure') && placeTypes.some(t => ['tourist_attraction', 'amusement_park'].includes(t))) {
    return '모험과 새로운 경험의 장소';
  }
  return '여행의 특별한 순간을 만들어줄 곳';
}

function mapPlaceTypesToVibes(placeTypes: string[]): Vibe[] {
  const vibes: Vibe[] = [];
  if (placeTypes.some(t => ['spa', 'park', 'beach'].includes(t))) vibes.push('Healing');
  if (placeTypes.some(t => ['restaurant', 'cafe', 'bakery', 'food'].includes(t))) vibes.push('Foodie');
  if (placeTypes.some(t => ['museum', 'art_gallery', 'library'].includes(t))) vibes.push('Culture');
  if (placeTypes.some(t => ['tourist_attraction', 'amusement_park'].includes(t))) vibes.push('Adventure');
  if (placeTypes.some(t => ['night_club', 'bar', 'shopping_mall'].includes(t))) vibes.push('Hotspot');
  return vibes.length > 0 ? vibes : ['Healing'];
}

function getPriceEstimate(priceLevel: number | undefined, travelStyle: TravelStyle): string {
  const basePrice = priceLevel || 2;
  const multipliers: Record<TravelStyle, number> = {
    Luxury: 3,
    Premium: 2,
    Reasonable: 1,
    Economic: 0.7,
  };
  const estimatedLevel = Math.round(basePrice * multipliers[travelStyle]);
  const priceLabels = ['무료', '저렴함', '보통', '비쌈', '매우 비쌈'];
  return priceLabels[Math.min(4, Math.max(0, estimatedLevel))] || '보통';
}

async function generatePlacesWithGemini(
  formData: TripFormData,
  vibeWeights: { vibe: Vibe; weight: number; percentage: number }[]
): Promise<PlaceResult[]> {
  const vibeDescription = vibeWeights
    .map(v => `${v.vibe}(${v.percentage}%)`)
    .join(', ');

  const prompt = `당신은 전문 여행 플래너입니다. 다음 조건에 맞는 ${formData.destination} 여행지를 추천해주세요.

조건:
- 바이브: ${vibeDescription}
- 여행 스타일: ${formData.travelStyle}
- 여행 페이스: ${formData.travelPace === 'Packed' ? '빡빡하게' : '여유롭게'}
- 이동 스타일: ${formData.mobilityStyle === 'WalkMore' ? '많이 걷기' : '이동 최소화'}
- 동행: ${formData.companionType}, ${formData.companionCount}명
- 큐레이션 포커스: ${formData.curationFocus}

각 시간대별 장소를 추천해주세요 (아침/점심/오후/저녁).
실제 존재하는 장소만 추천하고, 각 장소에 대해 다음 정보를 JSON 배열로 제공해주세요:

{
  "places": [
    {
      "name": "장소명",
      "description": "간단한 설명",
      "lat": 위도,
      "lng": 경도,
      "vibeScore": 1-10 점수,
      "tags": ["태그1", "태그2"],
      "vibeTags": ["Healing", "Foodie" 등 해당되는 Vibe],
      "recommendedTime": "morning|lunch|afternoon|evening",
      "priceEstimate": "가격대 설명"
    }
  ]
}

${formData.destination}의 실제 유명한 장소들을 추천해주세요. 최소 8개 장소를 추천해주세요.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return (result.places || []).map((place: any, index: number) => ({
        id: `gemini-${Date.now()}-${index}`,
        name: place.name,
        description: place.description,
        lat: place.lat || 0,
        lng: place.lng || 0,
        vibeScore: place.vibeScore || 7,
        confidenceScore: 7,
        sourceType: "Gemini AI",
        personaFitReason: place.personaFitReason || "AI가 추천한 장소",
        tags: place.tags || [],
        vibeTags: place.vibeTags || [],
        image: "",
        priceEstimate: place.priceEstimate || "보통",
        placeTypes: [],
        recommendedTime: place.recommendedTime,
      }));
    }
  } catch (error) {
    console.error("Failed to generate places with Gemini:", error);
  }

  return [];
}

function calculateDayCount(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

function distributePlacesToSlots(
  places: PlaceResult[],
  vibeWeights: { vibe: Vibe; weight: number; percentage: number }[],
  dayCount: number,
  travelPace: TravelPace
): { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string }[] {
  const slotsPerDay = travelPace === 'Packed' ? 4 : 3;
  const schedule: { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string }[] = [];
  
  const sortedPlaces = [...places].sort((a, b) => b.vibeScore - a.vibeScore);
  
  let placeIndex = 0;
  
  for (let day = 1; day <= dayCount && placeIndex < sortedPlaces.length; day++) {
    const daySlots = TIME_SLOTS.slice(0, slotsPerDay);
    
    for (const slot of daySlots) {
      if (placeIndex >= sortedPlaces.length) break;
      
      const matchingPlace = sortedPlaces.find((p, idx) => {
        if (idx < placeIndex) return false;
        const hasRecommendedTime = (p as any).recommendedTime === slot.slot;
        const hasVibeAffinity = p.vibeTags.some(v => slot.vibeAffinity.includes(v));
        return hasRecommendedTime || hasVibeAffinity;
      });
      
      const place = matchingPlace || sortedPlaces[placeIndex];
      
      schedule.push({
        day,
        slot: slot.slot,
        place,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      
      const usedIndex = sortedPlaces.indexOf(place);
      if (usedIndex > -1) {
        sortedPlaces.splice(usedIndex, 1);
      }
    }
  }
  
  return schedule;
}

export async function generateItinerary(formData: TripFormData) {
  const vibeWeights = calculateVibeWeights(formData.vibes, formData.curationFocus);
  
  let places = await searchGooglePlaces(
    formData.destination,
    formData.destinationCoords,
    formData.vibes,
    formData.travelStyle
  );
  
  if (places.length < 8) {
    const aiPlaces = await generatePlacesWithGemini(formData, vibeWeights);
    places = [...places, ...aiPlaces];
  }
  
  places = places.sort((a, b) => b.vibeScore - a.vibeScore).slice(0, 20);
  
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);
  const schedule = distributePlacesToSlots(places, vibeWeights, dayCount, formData.travelPace);
  
  const days: { day: number; places: any[]; summary: string }[] = [];
  
  for (let d = 1; d <= dayCount; d++) {
    const dayPlaces = schedule
      .filter(s => s.day === d)
      .map(s => ({
        ...s.place,
        startTime: s.startTime,
        endTime: s.endTime,
        realityCheck: {
          weather: 'Sunny' as const,
          crowd: 'Medium' as const,
          status: 'Open' as const,
        },
      }));
    
    const topVibes = dayPlaces
      .flatMap(p => p.vibeTags)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 2);
    
    days.push({
      day: d,
      places: dayPlaces,
      summary: `${topVibes.join(' & ')} 중심의 하루`,
    });
  }
  
  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    days,
    vibeWeights,
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace: formData.travelPace,
      mobilityStyle: formData.mobilityStyle,
      companionType: formData.companionType,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
    },
  };
}

export const itineraryGenerator = {
  generate: generateItinerary,
};
