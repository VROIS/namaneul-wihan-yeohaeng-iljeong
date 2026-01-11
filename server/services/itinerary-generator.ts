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
  city?: string;
  region?: string;
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
  
  const PRIORITY_WEIGHTS: Record<number, number[]> = {
    1: [100],
    2: [60, 40],
    3: [50, 30, 20],
  };
  
  const weights = PRIORITY_WEIGHTS[selectedVibes.length] || [50, 30, 20];
  
  return selectedVibes.map((vibe, index) => ({
    vibe,
    weight: weights[index] / 100,
    percentage: weights[index],
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
  vibeWeights: { vibe: Vibe; weight: number; percentage: number }[],
  requiredPlaceCount: number = 12
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

중요한 동선 최적화 규칙:
1. 같은 도시/지역의 장소들을 연속 일자에 배치할 수 있도록 그룹핑해주세요
2. 도시 간 이동이 필요한 경우, 인접한 도시끼리 묶어주세요
3. 각 장소에 반드시 city(도시명)와 region(지역/구역) 정보를 포함해주세요

각 시간대별 장소를 추천해주세요 (아침/점심/오후/저녁).
실제 존재하는 장소만 추천하고, 각 장소에 대해 다음 정보를 JSON으로 제공해주세요:

{
  "places": [
    {
      "name": "장소명",
      "description": "간단한 설명",
      "city": "도시명 (예: 파리, 니스, 리옹)",
      "region": "지역/구역 (예: 마레지구, 몽마르뜨, 샹젤리제)",
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

${formData.destination}의 실제 유명한 장소들을 추천해주세요. 정확히 ${requiredPlaceCount}개 장소를 추천해주세요. 
도시별로 균형있게 분배하고, 각 도시 내에서는 지역별로 묶어주세요.`;

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
        city: place.city || formData.destination,
        region: place.region || "",
      }));
    }
  } catch (error) {
    console.error("Failed to generate places with Gemini:", error);
  }

  return [];
}

function calculateDayCount(startDate: string, endDate: string): number {
  console.log(`[Itinerary] Date inputs: startDate="${startDate}", endDate="${endDate}"`);
  const start = new Date(startDate);
  const end = new Date(endDate);
  console.log(`[Itinerary] Parsed dates: start=${start.toISOString()}, end=${end.toISOString()}`);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  console.log(`[Itinerary] Calculated dayCount: ${dayCount}`);
  return dayCount;
}

function groupPlacesByCity(places: PlaceResult[]): Map<string, PlaceResult[]> {
  const cityGroups = new Map<string, PlaceResult[]>();
  
  for (const place of places) {
    const city = place.city || 'Unknown';
    if (!cityGroups.has(city)) {
      cityGroups.set(city, []);
    }
    cityGroups.get(city)!.push(place);
  }
  
  return cityGroups;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function optimizeCityOrder(cityGroups: Map<string, PlaceResult[]>): string[] {
  const cities = Array.from(cityGroups.keys());
  if (cities.length <= 1) return cities;
  
  const cityCoords = new Map<string, { lat: number; lng: number }>();
  for (const [city, places] of cityGroups) {
    const avgLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
    const avgLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
    cityCoords.set(city, { lat: avgLat, lng: avgLng });
  }
  
  const ordered: string[] = [cities[0]];
  const remaining = new Set(cities.slice(1));
  
  while (remaining.size > 0) {
    const lastCity = ordered[ordered.length - 1];
    const lastCoords = cityCoords.get(lastCity)!;
    
    let nearestCity = '';
    let minDistance = Infinity;
    
    for (const city of remaining) {
      const coords = cityCoords.get(city)!;
      const dist = calculateDistance(lastCoords.lat, lastCoords.lng, coords.lat, coords.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestCity = city;
      }
    }
    
    ordered.push(nearestCity);
    remaining.delete(nearestCity);
  }
  
  return ordered;
}

function distributePlacesToSlots(
  places: PlaceResult[],
  vibeWeights: { vibe: Vibe; weight: number; percentage: number }[],
  dayCount: number,
  travelPace: TravelPace
): { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string }[] {
  const slotsPerDay = travelPace === 'Packed' ? 4 : 3;
  const schedule: { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string }[] = [];
  
  const cityGroups = groupPlacesByCity(places);
  const orderedCities = optimizeCityOrder(cityGroups);
  
  const totalPlaces = places.length;
  const placesPerDay = Math.ceil(totalPlaces / dayCount);
  
  const orderedPlaces: PlaceResult[] = [];
  for (const city of orderedCities) {
    const cityPlaces = cityGroups.get(city) || [];
    cityPlaces.sort((a, b) => b.vibeScore - a.vibeScore);
    orderedPlaces.push(...cityPlaces);
  }
  
  let placeIndex = 0;
  
  for (let day = 1; day <= dayCount; day++) {
    const daySlots = TIME_SLOTS.slice(0, slotsPerDay);
    
    for (const slot of daySlots) {
      if (placeIndex >= orderedPlaces.length) break;
      
      const currentCity = orderedPlaces[placeIndex]?.city;
      
      const matchingPlace = orderedPlaces.slice(placeIndex).find((p) => {
        const sameCity = p.city === currentCity;
        const hasRecommendedTime = (p as any).recommendedTime === slot.slot;
        const hasVibeAffinity = p.vibeTags.some(v => slot.vibeAffinity.includes(v));
        return sameCity && (hasRecommendedTime || hasVibeAffinity);
      });
      
      const place = matchingPlace || orderedPlaces[placeIndex];
      
      schedule.push({
        day,
        slot: slot.slot,
        place,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      
      const usedIndex = orderedPlaces.indexOf(place);
      if (usedIndex > -1) {
        orderedPlaces.splice(usedIndex, 1);
      }
    }
  }
  
  return schedule;
}

export async function generateItinerary(formData: TripFormData) {
  const vibes = formData.vibes || ['Foodie', 'Culture', 'Healing'];
  const curationFocus = formData.curationFocus || 'Everyone';
  const vibeWeights = calculateVibeWeights(vibes, curationFocus);
  
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);
  const slotsPerDay = (formData.travelPace || 'Relaxed') === 'Packed' ? 4 : 3;
  const requiredPlaceCount = dayCount * slotsPerDay + 4;
  
  let places = await searchGooglePlaces(
    formData.destination,
    formData.destinationCoords,
    vibes,
    formData.travelStyle || 'Reasonable'
  );
  
  console.log(`[Itinerary] Required places: ${requiredPlaceCount} for ${dayCount} days`);
  
  if (places.length < requiredPlaceCount) {
    const aiPlaces = await generatePlacesWithGemini(formData, vibeWeights, requiredPlaceCount);
    console.log(`[Itinerary] Google: ${places.length}, Gemini: ${aiPlaces.length}`);
    places = [...places, ...aiPlaces];
  }
  
  // If still not enough places, generate more in batches
  let attempts = 0;
  while (places.length < requiredPlaceCount && attempts < 2) {
    attempts++;
    console.log(`[Itinerary] Not enough places (${places.length}/${requiredPlaceCount}), generating more...`);
    const morePlaces = await generatePlacesWithGemini(formData, vibeWeights, requiredPlaceCount - places.length + 5);
    places = [...places, ...morePlaces];
  }
  
  console.log(`[Itinerary] Total places: ${places.length}`);
  
  places = places.sort((a, b) => b.vibeScore - a.vibeScore).slice(0, requiredPlaceCount + 5);
  const schedule = distributePlacesToSlots(places, vibeWeights, dayCount, formData.travelPace);
  
  console.log(`[Itinerary] Schedule entries: ${schedule.length}`);
  
  const days: { day: number; places: any[]; city: string; summary: string }[] = [];
  
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
    
    const dayCities = dayPlaces
      .map(p => p.city)
      .filter((c, i, arr) => c && arr.indexOf(c) === i);
    
    const cityLabel = dayCities.length > 0 ? dayCities.join(', ') : formData.destination;
    
    days.push({
      day: d,
      places: dayPlaces,
      city: cityLabel,
      summary: `${cityLabel} - ${topVibes.join(' & ')} 중심의 하루`,
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
