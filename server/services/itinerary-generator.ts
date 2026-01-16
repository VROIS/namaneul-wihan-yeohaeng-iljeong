import { GoogleGenAI } from "@google/genai";
import { 
  getKoreanSentimentForCity, 
  formatSentimentForPrompt,
  KoreanSentimentData 
} from "./korean-sentiment-service";
import { 
  generateProtagonistSentence, 
  generatePromptContext 
} from "./protagonist-generator";

// Lazy initialization - DB에서 API 키 로드 후 사용
let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    ai = new GoogleGenAI({
      apiKey,
      ...(baseUrl ? {
        httpOptions: {
          apiVersion: "",
          baseUrl,
        },
      } : {}),
    });
  }
  return ai;
}

type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';
type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';
// 여행 밀도: 빡빡하게(Packed) | 보통(Normal) | 여유롭게(Relaxed)
// ⚠️ 프론트엔드 기준 'Normal' 사용 (Moderate 아님)
type TravelPace = 'Packed' | 'Normal' | 'Relaxed';
type MobilityStyle = 'WalkMore' | 'Moderate' | 'Minimal';
type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';

// ===== 사용자 시간 기반 슬롯 생성 로직 =====
// 핵심 규칙:
// 1. 사용자 출발시간/종료시간 = 절대 우선
// 2. 여행 밀도에 따라 슬롯 수 자동 계산
// 3. 2일 이상: 첫날(출발시간~21:00), 중간(09:00~21:00 풀타임), 마지막(09:00~종료시간)
interface PaceConfig {
  slotDurationMinutes: number;  // 슬롯 당 소요시간 (이동시간 포함)
  maxSlotsPerDay: number;       // 하루 최대 슬롯 수 (풀타임 12시간 기준)
}

const PACE_CONFIG: Record<TravelPace, PaceConfig> = {
  Packed: {
    slotDurationMinutes: 90,    // 1시간 30분
    maxSlotsPerDay: 8,          // 12h ÷ 1.5h = 8곳
  },
  Normal: {
    slotDurationMinutes: 120,   // 2시간
    maxSlotsPerDay: 6,          // 12h ÷ 2h = 6곳
  },
  Relaxed: {
    slotDurationMinutes: 150,   // 2시간 30분
    maxSlotsPerDay: 4,          // 12h ÷ 2.5h ≈ 4곳
  },
};

// 기본 시작/종료 시간 (중간 날짜용)
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '21:00';

/**
 * 가용 시간으로 슬롯 수 계산
 * @param startTime 시작시간 (HH:MM)
 * @param endTime 종료시간 (HH:MM)
 * @param pace 여행 밀도
 * @returns 슬롯 수
 */
function calculateSlotsForDay(
  startTime: string,
  endTime: string,
  pace: TravelPace
): number {
  const config = PACE_CONFIG[pace];
  
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const availableMinutes = endMinutes - startMinutes;
  
  if (availableMinutes <= 0) return 0;
  
  const slots = Math.floor(availableMinutes / config.slotDurationMinutes);
  return Math.min(slots, config.maxSlotsPerDay);
}

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

// 시간대별 Vibe 친화도 (슬롯 타입 판단용)
const SLOT_VIBE_AFFINITY: Record<'morning' | 'lunch' | 'afternoon' | 'evening', Vibe[]> = {
  morning: ['Healing', 'Culture', 'Adventure'],
  lunch: ['Foodie'],
  afternoon: ['Hotspot', 'Culture', 'Adventure', 'Healing'],
  evening: ['Foodie', 'Romantic'],
};

/**
 * 분(minutes)을 HH:MM 형식으로 변환
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(Math.min(23, hours)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

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

/**
 * 장소의 Vibe 점수 계산
 * 
 * 🎯 가중치 적용 로직:
 * - 사용자가 선택한 vibes와 장소의 vibeTags 매칭도 반영
 * - 선택 순서에 따라 가중치: 1순위(50%) > 2순위(30%) > 3순위(20%)
 * - 2개 선택시: 60% : 40%
 */
function calculatePlaceVibeScore(
  place: any, 
  vibes: Vibe[],
  vibeWeights?: { vibe: Vibe; weight: number; percentage: number }[]
): number {
  const rating = place.rating || 3;
  const reviewCount = place.userRatingCount || 0;
  const reviewBonus = Math.min(2, Math.log10(reviewCount + 1) * 0.5);
  
  // 기본 점수 (평점 기반)
  let baseScore = Math.min(8, rating * 1.2 + reviewBonus);
  
  // 🎯 Vibe 매칭 보너스 (사용자 선택 가중치 적용)
  const placeVibes = mapPlaceTypesToVibes(place.types || []);
  let vibeMatchBonus = 0;
  
  if (vibeWeights && vibeWeights.length > 0) {
    // 가중치 기반 매칭
    for (const vw of vibeWeights) {
      if (placeVibes.includes(vw.vibe)) {
        // 매칭되면 가중치만큼 보너스 (최대 2점)
        vibeMatchBonus += (vw.weight * 2);
      }
    }
  } else if (vibes.length > 0) {
    // 가중치 없으면 단순 매칭 (fallback)
    const matchCount = vibes.filter(v => placeVibes.includes(v)).length;
    vibeMatchBonus = Math.min(2, matchCount * 0.7);
  }
  
  return Math.min(10, baseScore + vibeMatchBonus);
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
  requiredPlaceCount: number = 12,
  koreanSentiment?: KoreanSentimentData
): Promise<PlaceResult[]> {
  const vibeDescription = vibeWeights
    .map(v => `${v.vibe}(${v.percentage}%)`)
    .join(', ');

  // 여행 페이스 한글 변환
  const paceKorean = formData.travelPace === 'Packed' ? '빡빡하게' 
    : formData.travelPace === 'Moderate' ? '적당히' 
    : '여유롭게';
  
  // 페이스 설정
  const paceConfig = PACE_CONFIG[formData.travelPace || 'Moderate'];
  
  // 한국 감성 데이터 섹션 (있으면 추가)
  const sentimentSection = koreanSentiment
    ? formatSentimentForPrompt(koreanSentiment, formData.destination)
    : '';

  // ===== 🎯 주인공 컨텍스트 생성 (가중치 1순위) =====
  const protagonistContext = generatePromptContext({
    curationFocus: (formData.curationFocus as any) || 'Everyone',
    companionType: (formData.companionType as any) || 'Couple',
    companionCount: formData.companionCount || 2,
    companionAges: formData.companionAges,
    vibes: vibeWeights.map(v => v.vibe),
    destination: formData.destination,
  });
  
  // 주인공 문장 (로그 및 저장용)
  const protagonistInfo = generateProtagonistSentence({
    curationFocus: (formData.curationFocus as any) || 'Everyone',
    companionType: (formData.companionType as any) || 'Couple',
    companionCount: formData.companionCount || 2,
    companionAges: formData.companionAges,
    vibes: vibeWeights.map(v => v.vibe),
    destination: formData.destination,
  });
  
  console.log(`[Itinerary] 🎯 주인공: ${protagonistInfo.sentence}`);

  const prompt = `당신은 전문 여행 플래너입니다. 다음 조건에 맞는 ${formData.destination} 여행지를 추천해주세요.

${protagonistContext}

【사용자 여행 조건】
- 바이브 선호: ${vibeDescription}
- 여행 스타일: ${formData.travelStyle}
- 여행 밀도: ${paceKorean} (하루 ${paceConfig.maxSlotsPerDay}곳, ${paceConfig.slotDurationMinutes}분 간격)
- 이동 스타일: ${formData.mobilityStyle === 'WalkMore' ? '많이 걷기' : '이동 최소화'}
- 동행: ${formData.companionType}, ${formData.companionCount}명

${sentimentSection}

【중요한 추천 기준 - 5단계 가중치】
1. ⭐ 주인공 (위 "일정 생성의 주인공" 섹션 최우선 반영)
2. 누구랑 (동행 타입에 맞는 장소 우선)
3. 바이브 선호 (사용자가 선택한 취향 반영)
4. 예산 수준 (${formData.travelStyle})
5. 실제 정보 (영업 중인 곳, 리뷰 좋은 곳)

【동선 최적화 규칙】
1. 같은 도시/지역의 장소들을 연속 일자에 배치할 수 있도록 그룹핑
2. 도시 간 이동이 필요한 경우, 인접한 도시끼리 묶기
3. 각 장소에 반드시 city(도시명)와 region(지역/구역) 정보 포함
4. 오전-점심-오후-저녁 시간대에 맞는 장소 배치 (식당은 점심/저녁에)

【한국인 선호도 반영】
한국인 여행자들이 많이 가고, SNS에서 인기 있는 장소를 우선 추천해주세요.
${koreanSentiment?.instagram.trendingHashtags.length ? `인기 해시태그: ${koreanSentiment.instagram.trendingHashtags.slice(0, 3).join(', ')}` : ''}
${koreanSentiment?.naverBlog.keywords.length ? `자주 언급 키워드: ${koreanSentiment.naverBlog.keywords.slice(0, 3).join(', ')}` : ''}

JSON 응답 형식:
{
  "places": [
    {
      "name": "장소명",
      "description": "간단한 설명 (한국인에게 인기인 이유 포함)",
      "city": "도시명 (예: 파리, 니스, 리옹)",
      "region": "지역/구역 (예: 마레지구, 몽마르뜨, 샹젤리제)",
      "lat": 위도,
      "lng": 경도,
      "vibeScore": 1-10 점수,
      "koreanPopularity": 1-10 (한국인 인기도),
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
    const response = await getAI().models.generateContent({
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

export async function generateItinerary(formData: TripFormData) {
  const vibes = formData.vibes || ['Foodie', 'Culture', 'Healing'];
  const curationFocus = formData.curationFocus || 'Everyone';
  const vibeWeights = calculateVibeWeights(vibes, curationFocus);
  
  // 여행 밀도 기본값: Normal (보통) - 프론트엔드 기준
  // Moderate도 Normal로 처리 (하위 호환)
  let travelPace: TravelPace = (formData.travelPace as TravelPace) || 'Normal';
  if (travelPace === 'Moderate' as any) travelPace = 'Normal';
  
  const paceConfig = PACE_CONFIG[travelPace];
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);
  
  // ===== 사용자 시간 기반 슬롯 계산 =====
  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;
  
  // 일별 슬롯 수 계산
  const daySlotsConfig: { day: number; startTime: string; endTime: string; slots: number }[] = [];
  let totalRequiredPlaces = 0;
  
  for (let d = 1; d <= dayCount; d++) {
    let dayStart: string;
    let dayEnd: string;
    
    if (dayCount === 1) {
      // 당일치기: 사용자 출발~종료시간 그대로
      dayStart = userStartTime;
      dayEnd = userEndTime;
    } else if (d === 1) {
      // 첫날: 사용자 출발시간 ~ 21:00
      dayStart = userStartTime;
      dayEnd = DEFAULT_END_TIME;
    } else if (d === dayCount) {
      // 마지막날: 09:00 ~ 사용자 종료시간
      dayStart = DEFAULT_START_TIME;
      dayEnd = userEndTime;
    } else {
      // 중간날: 09:00 ~ 21:00 풀타임
      dayStart = DEFAULT_START_TIME;
      dayEnd = DEFAULT_END_TIME;
    }
    
    const slots = calculateSlotsForDay(dayStart, dayEnd, travelPace);
    daySlotsConfig.push({ day: d, startTime: dayStart, endTime: dayEnd, slots });
    totalRequiredPlaces += slots;
  }
  
  const requiredPlaceCount = totalRequiredPlaces + 4; // 여유분
  
  console.log(`[Itinerary] ===== 일정 생성 시작 =====`);
  console.log(`[Itinerary] 여행 밀도: ${travelPace} (슬롯 간격: ${paceConfig.slotDurationMinutes}분)`);
  console.log(`[Itinerary] 사용자 시간: ${userStartTime} ~ ${userEndTime}`);
  console.log(`[Itinerary] 총 ${dayCount}일, 필요 장소: ${totalRequiredPlaces}곳`);
  daySlotsConfig.forEach(d => {
    console.log(`[Itinerary]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`);
  });
  
  // ===== 한국 감성 데이터 로드 (캐시 우선) =====
  let koreanSentiment: KoreanSentimentData | undefined;
  try {
    koreanSentiment = await getKoreanSentimentForCity(formData.destination, vibes);
    console.log(`[Itinerary] 한국 감성 보너스: +${koreanSentiment.totalBonus.toFixed(2)}`);
  } catch (error) {
    console.warn('[Itinerary] 한국 감성 데이터 로드 실패:', error);
  }
  
  // Google Places API로 기본 장소 검색
  let places = await searchGooglePlaces(
    formData.destination,
    formData.destinationCoords,
    vibes,
    formData.travelStyle || 'Reasonable'
  );
  
  // Gemini AI로 추가 장소 추천 (한국 감성 데이터 포함)
  if (places.length < requiredPlaceCount) {
    const aiPlaces = await generatePlacesWithGemini(formData, vibeWeights, requiredPlaceCount, koreanSentiment);
    console.log(`[Itinerary] Google: ${places.length}곳, Gemini: ${aiPlaces.length}곳`);
    places = [...places, ...aiPlaces];
  }
  
  // 부족하면 추가 생성
  let attempts = 0;
  while (places.length < requiredPlaceCount && attempts < 2) {
    attempts++;
    console.log(`[Itinerary] 장소 부족 (${places.length}/${requiredPlaceCount}), 추가 생성 중...`);
    const morePlaces = await generatePlacesWithGemini(formData, vibeWeights, requiredPlaceCount - places.length + 5, koreanSentiment);
    places = [...places, ...morePlaces];
  }
  
  console.log(`[Itinerary] 총 수집 장소: ${places.length}곳`);
  
  // 한국 감성 보너스 적용하여 정렬
  if (koreanSentiment) {
    places = places.map(p => ({
      ...p,
      vibeScore: p.vibeScore + (koreanSentiment?.totalBonus || 0)
    }));
  }
  
  places = places.sort((a, b) => b.vibeScore - a.vibeScore).slice(0, requiredPlaceCount + 5);
  
  // ===== 사용자 시간 기반 동적 슬롯 분배 =====
  const schedule = distributePlacesWithUserTime(places, daySlotsConfig, travelPace);
  
  console.log(`[Itinerary] 최종 일정: ${schedule.length}개 슬롯`);
  
  // Days 배열 생성
  const days: { day: number; places: any[]; city: string; summary: string; startTime: string; endTime: string }[] = [];
  
  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find(c => c.day === d)!;
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
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
    });
  }
  
  // 여행 밀도 라벨
  const paceLabel = travelPace === 'Packed' ? '빡빡하게' 
    : travelPace === 'Normal' ? '보통' 
    : '여유롭게';
  
  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: userStartTime,
    endTime: userEndTime,
    days,
    vibeWeights,
    koreanSentimentBonus: koreanSentiment?.totalBonus || 0,
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace: travelPace,
      travelPaceLabel: paceLabel,
      slotDurationMinutes: paceConfig.slotDurationMinutes,
      totalPlaces: schedule.length,
      mobilityStyle: formData.mobilityStyle,
      companionType: formData.companionType,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      koreanSentimentApplied: !!koreanSentiment,
    },
  };
}

/**
 * 사용자 시간 기반으로 장소를 슬롯에 분배
 */
function distributePlacesWithUserTime(
  places: PlaceResult[],
  daySlotsConfig: { day: number; startTime: string; endTime: string; slots: number }[],
  travelPace: TravelPace
): { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string }[] {
  const schedule: { day: number; slot: string; place: PlaceResult; startTime: string; endTime: string }[] = [];
  const paceConfig = PACE_CONFIG[travelPace];
  
  // 도시별 그룹핑 및 순서 최적화
  const cityGroups = groupPlacesByCity(places);
  const orderedCities = optimizeCityOrder(cityGroups);
  
  const orderedPlaces: PlaceResult[] = [];
  for (const city of orderedCities) {
    const cityPlaces = cityGroups.get(city) || [];
    cityPlaces.sort((a, b) => b.vibeScore - a.vibeScore);
    orderedPlaces.push(...cityPlaces);
  }
  
  let placeIndex = 0;
  
  for (const dayConfig of daySlotsConfig) {
    const { day, startTime, slots } = dayConfig;
    
    // 해당 일자의 시간 슬롯 생성
    const [startH, startM] = startTime.split(':').map(Number);
    let currentMinutes = startH * 60 + startM;
    
    for (let slotIdx = 0; slotIdx < slots; slotIdx++) {
      if (placeIndex >= orderedPlaces.length) break;
      
      const slotStart = minutesToTime(currentMinutes);
      currentMinutes += paceConfig.slotDurationMinutes;
      const slotEnd = minutesToTime(currentMinutes);
      
      // 슬롯 타입 결정 (시간대 기반)
      const slotHour = parseInt(slotStart.split(':')[0]);
      let slotType: 'morning' | 'lunch' | 'afternoon' | 'evening';
      if (slotHour < 12) slotType = 'morning';
      else if (slotHour < 14) slotType = 'lunch';
      else if (slotHour < 18) slotType = 'afternoon';
      else slotType = 'evening';
      
      const place = orderedPlaces[placeIndex];
      
      schedule.push({
        day,
        slot: slotType,
        place,
        startTime: slotStart,
        endTime: slotEnd,
      });
      
      placeIndex++;
    }
  }
  
  return schedule;
}

export const itineraryGenerator = {
  generate: generateItinerary,
};
