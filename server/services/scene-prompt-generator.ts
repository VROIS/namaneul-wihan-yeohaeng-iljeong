/**
 * 🎬 Scene Prompt Generator
 * 
 * 일정표(itinerary) 데이터를 기반으로 Seedance용 영상 프롬프트를 자동 생성
 * 원소스 멀티유즈(One Source Multi-Use) 원칙 적용
 * 
 * 문서: docs/PHASE_E_VIDEO_MAPPING.md
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db";
import { apiKeys } from "../../shared/schema";
import { eq } from "drizzle-orm";

/**
 * DB에서 Gemini API 키 가져오기
 */
async function getGeminiApiKey(): Promise<string | null> {
  try {
    // 환경변수 먼저 확인
    const envKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (envKey) {
      return envKey;
    }
    
    // DB에서 가져오기
    if (db) {
      const result = await db.select().from(apiKeys).where(eq(apiKeys.serviceName, 'gemini')).limit(1);
      if (result.length > 0 && result[0].apiKey) {
        return result[0].apiKey;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[ScenePrompt] Error getting Gemini API key:', error);
    return null;
  }
}

// ============================================================================
// 타입 정의
// ============================================================================

/** 캐릭터 ID (M1-M7: 남성, F1-F7: 여성) */
type CharacterId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7';

/** 누구를 위한 (대사 주인공) */
type CurationFocus = 'Kids' | 'Parents' | 'Self' | 'Everyone';

/** 여행 밀도 (클립 수 결정) */
type TravelPace = 'Relaxed' | 'Normal' | 'Packed';

/** 예산 스타일 */
type TravelStyle = 'Luxury' | 'Premium' | 'Reasonable' | 'Economic';

/** 이동 스타일 */
type MobilityStyle = 'Minimal' | 'Moderate' | 'WalkMore';

/** 바이브 (분위기) */
type Vibe = 'Romantic' | 'Foodie' | 'Culture' | 'Adventure' | 'Relaxing' | 'Family';

/** 동행자 정보 */
interface Companion {
  characterId: CharacterId;
  role: string;  // 아빠, 엄마, 할머니 등
  age: number;
  gender: 'M' | 'F';
}

/** 장면 대사 */
interface SceneDialogue {
  protagonist: string;
  reactions: Array<{
    characterId: CharacterId;
    text: string;
  }>;
}

/** 개별 장면 프롬프트 */
interface ScenePrompt {
  order: number;
  placeName: string;
  placeType: 'landmark' | 'restaurant' | 'activity' | 'transport' | 'rest';
  duration: number;  // 초
  prompt: string;    // Seedance용 영어 프롬프트
  dialogue: SceneDialogue;
  mood: string;
  isTransport: boolean;
}

/** 일별 영상 데이터 */
interface DayVideo {
  day: number;
  clipCount: number;
  clipDuration: number;
  scenes: ScenePrompt[];
}

/** 전체 영상 프롬프트 JSON */
export interface VideoPromptData {
  itineraryId: number;
  dayCount: number;
  protagonist: {
    type: CurationFocus;
    characterId: CharacterId;
    age: number;
  };
  companions: Companion[];
  vibes: Vibe[];
  travelPace: TravelPace;
  transportType: string;
  fatigueLevel: 'none' | 'low' | 'medium' | 'high';
  days: DayVideo[];
}

/** 일정표 아이템 (기존 itinerary 형식) */
interface ItineraryItem {
  day: number;
  slotNumber: number;
  placeName: string;
  placeType: string;
  startTime: string;
  endTime: string;
  description?: string;
}

/** 일정표 데이터 (기존 itinerary 형식) */
interface ItineraryData {
  id: number;
  destination: string;
  startDate: string;
  endDate: string;
  curationFocus: CurationFocus;
  companionType: string;
  companionCount: number;
  companionAges?: string;  // "5,10,45,70" 형식
  vibes: string[];
  travelPace: TravelPace;
  travelStyle: TravelStyle;
  mobilityStyle: MobilityStyle;
  userBirthDate?: string;  // YYYY-MM-DD
  userGender?: 'M' | 'F';
  items: ItineraryItem[];
}

// ============================================================================
// 매핑 테이블 (docs/PHASE_E_VIDEO_MAPPING.md 기반)
// ============================================================================

/** 연령대 → 캐릭터 ID 매핑 */
function ageToCharacterId(age: number, gender: 'M' | 'F'): CharacterId {
  const prefix = gender;
  if (age < 10) return `${prefix}1` as CharacterId;
  if (age < 20) return `${prefix}2` as CharacterId;
  if (age < 30) return `${prefix}3` as CharacterId;
  if (age < 40) return `${prefix}4` as CharacterId;
  if (age < 50) return `${prefix}5` as CharacterId;
  if (age < 60) return `${prefix}6` as CharacterId;
  return `${prefix}7` as CharacterId;
}

/** travelPace → 클립 설정 */
const PACE_CONFIG: Record<TravelPace, { slotsPerDay: number; clipDuration: number }> = {
  Relaxed: { slotsPerDay: 4, clipDuration: 15 },
  Normal: { slotsPerDay: 6, clipDuration: 10 },
  Packed: { slotsPerDay: 8, clipDuration: 8 }
};

/** 이동 수단 결정 */
function getTransportType(travelStyle: TravelStyle, mobilityStyle: MobilityStyle): string {
  if (travelStyle === 'Luxury' || travelStyle === 'Premium' || mobilityStyle === 'Minimal') {
    return '전용차량';
  }
  if (travelStyle === 'Reasonable') {
    return mobilityStyle === 'Moderate' ? '우버+대중교통' : '대중교통+도보';
  }
  // Economic
  return mobilityStyle === 'WalkMore' ? '대중교통만' : '대중교통+도보';
}

/** 피로도 계산 */
function calculateFatigue(mobilityStyle: MobilityStyle, travelPace: TravelPace): 'none' | 'low' | 'medium' | 'high' {
  if (mobilityStyle === 'Minimal') return 'none';
  
  if (mobilityStyle === 'WalkMore') {
    if (travelPace === 'Packed') return 'high';
    if (travelPace === 'Normal') return 'medium';
    return 'low';
  }
  
  // Moderate
  if (travelPace === 'Packed') return 'medium';
  if (travelPace === 'Normal') return 'low';
  return 'none';
}

/** curationFocus → 대사 스타일 가이드 */
const DIALOGUE_STYLE: Record<CurationFocus, { tone: string; examples: string[] }> = {
  Kids: {
    tone: '호기심 가득, 감탄사 많음, 짧은 문장',
    examples: ['와! 진짜 커요!', '저기 봐요!', '배고파요~', '재밌다!']
  },
  Parents: {
    tone: '감사, 회상, 배려 표현',
    examples: ['여기 오고 싶었어요', '부모님이 좋아하시네', '천천히 가세요', '감사합니다']
  },
  Self: {
    tone: '독백, 성찰, SNS 느낌',
    examples: ['드디어 왔다', '꿈에 그리던 곳', '사진 찍어야지', '혼자라서 더 좋아']
  },
  Everyone: {
    tone: '화합, 소통, 균형 잡힌 대화',
    examples: ['다 같이 사진 찍자!', '모두 재밌지?', '다음엔 어디 갈까?', '다들 괜찮아?']
  }
};

/** vibes → 영상 분위기 키워드 */
const VIBE_KEYWORDS: Record<string, { mood: string; visual: string }> = {
  Romantic: { mood: 'warm, tender, loving', visual: 'soft lighting, warm colors, sunset glow' },
  Foodie: { mood: 'happy, satisfied, delighted', visual: 'delicious food, close-up, joyful eating' },
  Culture: { mood: 'amazed, curious, inspired', visual: 'grand architecture, admiring art, respectful' },
  Adventure: { mood: 'excited, energetic, thrilled', visual: 'action shots, dynamic poses, exploration' },
  Relaxing: { mood: 'peaceful, calm, serene', visual: 'gentle scenery, slow movements, breathing' },
  Family: { mood: 'loving, warm, togetherness', visual: 'group interactions, hugging, laughing together' },
  Healing: { mood: 'peaceful, calm, rejuvenating', visual: 'tranquil scenery, spa-like atmosphere, serene' },
  Nature: { mood: 'fresh, connected, natural', visual: 'outdoor scenery, trees, natural light' },
  Shopping: { mood: 'excited, satisfied, happy', visual: 'shopping bags, boutiques, window shopping' },
  Nightlife: { mood: 'lively, exciting, fun', visual: 'city lights, nightclub atmosphere, evening' },
  Art: { mood: 'inspired, contemplative, creative', visual: 'gallery, sculptures, artistic expression' },
  History: { mood: 'thoughtful, amazed, educated', visual: 'ancient ruins, historical sites, monuments' }
};

/** 기본 vibe 키워드 (fallback) */
const DEFAULT_VIBE_KEYWORDS = { mood: 'happy, joyful, content', visual: 'pleasant scenery, warm atmosphere' };

/** 안전하게 vibe 키워드 가져오기 */
function getVibeKeywords(vibe: string): { mood: string; visual: string } {
  return VIBE_KEYWORDS[vibe] || DEFAULT_VIBE_KEYWORDS;
}

/** 이동 장면 대사 템플릿 */
const TRANSPORT_DIALOGUE: Record<string, Record<CurationFocus, string[]>> = {
  '전용차량': {
    Kids: ['차에서 과자 먹어도 돼요?', '차 안이 좋아요!'],
    Parents: ['편하게 가니까 좋다', '이렇게 가니 덜 피곤하네'],
    Self: ['VIP 느낌이네', '편하게 가자'],
    Everyone: ['다들 편해?', '차에서 좀 쉬자']
  },
  '우버': {
    Kids: ['우버 아저씨 안녕하세요!', '차 색깔이 예뻐요!'],
    Parents: ['여기서 내리면 되겠네', '기사님 감사합니다'],
    Self: ['드디어 우버 잡았다', '다음 목적지로 출발!'],
    Everyone: ['다 탔지?', '안전벨트 매세요']
  },
  '지하철': {
    Kids: ['지하철 진짜 빠르다!', '문 열려요!'],
    Parents: ['다리 좀 쉬자...', '이쪽으로 갈아타면 돼'],
    Self: ['로컬처럼 타보자', '지하철 여행도 괜찮네'],
    Everyone: ['이쪽으로 갈아타야 해', '다들 손잡아']
  },
  '버스': {
    Kids: ['창밖에 에펠탑 보여요!', '버스 재밌다!'],
    Parents: ['버스가 왜 이리 안 오지', '앉을 자리 있다'],
    Self: ['버스 여행도 괜찮네', '풍경 구경하자'],
    Everyone: ['다음 정류장이야', '내릴 준비 해']
  },
  '도보': {
    Kids: ['다리 아파요~', '조금만 더요?'],
    Parents: ['조금만 더 걷자', '저기 벤치가 있네'],
    Self: ['걸으면서 구경하는 맛이지', '운동 삼아 걷자'],
    Everyone: ['천천히 가자', '다들 괜찮아?']
  }
};

/** 피로도 → 연출 키워드 */
const FATIGUE_VISUAL: Record<string, string> = {
  none: 'relaxed, comfortable, smiling',
  low: 'slightly tired but happy, occasional rest',
  medium: 'visibly tired, drinking water, sitting on bench',
  high: 'exhausted, sweating, needing rest, sitting down'
};

// ============================================================================
// 핵심 함수
// ============================================================================

/**
 * 일정표 데이터로부터 캐릭터 구성 추출
 */
function extractCharacters(itinerary: ItineraryData): { protagonist: Companion; companions: Companion[] } {
  const currentYear = new Date().getFullYear();
  
  // 사용자 본인 나이 계산
  let userAge = 35;  // 기본값
  let userGender: 'M' | 'F' = itinerary.userGender || 'M';
  
  if (itinerary.userBirthDate) {
    const birthYear = parseInt(itinerary.userBirthDate.split('-')[0]);
    userAge = currentYear - birthYear;
  }
  
  const userCharacter: Companion = {
    characterId: ageToCharacterId(userAge, userGender),
    role: '본인',
    age: userAge,
    gender: userGender
  };
  
  const companions: Companion[] = [];
  
  // companionAges 파싱 (예: "5,10,45,70")
  if (itinerary.companionAges) {
    const ages = itinerary.companionAges.split(',').map(a => parseInt(a.trim()));
    ages.forEach((age, index) => {
      // 간단한 성별 추정 (홀수 인덱스 = 여성)
      const gender: 'M' | 'F' = index % 2 === 0 ? 'M' : 'F';
      let role = '동행';
      
      // 나이로 역할 추정
      if (age < 13) role = '아이';
      else if (age < 20) role = '청소년';
      else if (age >= 60) role = age > userAge ? (gender === 'M' ? '할아버지' : '할머니') : '어르신';
      else if (Math.abs(age - userAge) < 5) role = gender === 'M' ? '남편' : '아내';
      else if (age < userAge - 20) role = gender === 'M' ? '아들' : '딸';
      else if (age > userAge) role = gender === 'M' ? '아버지' : '어머니';
      
      companions.push({
        characterId: ageToCharacterId(age, gender),
        role,
        age,
        gender
      });
    });
  } else {
    // companionType으로 추정 (docs/PHASE_E_VIDEO_MAPPING.md 가족 연령 추정 공식)
    switch (itinerary.companionType) {
      case 'Couple':
        companions.push({
          characterId: ageToCharacterId(userAge, userGender === 'M' ? 'F' : 'M'),
          role: userGender === 'M' ? '아내' : '남편',
          age: userAge,
          gender: userGender === 'M' ? 'F' : 'M'
        });
        break;
        
      case 'Family':
        // 배우자
        companions.push({
          characterId: ageToCharacterId(userAge, userGender === 'M' ? 'F' : 'M'),
          role: userGender === 'M' ? '아내' : '남편',
          age: userAge,
          gender: userGender === 'M' ? 'F' : 'M'
        });
        // 자녀 (사용자 나이 - 30)
        const childAge = Math.max(5, userAge - 30);
        companions.push({
          characterId: ageToCharacterId(childAge, 'M'),
          role: '아들',
          age: childAge,
          gender: 'M'
        });
        companions.push({
          characterId: ageToCharacterId(childAge - 3, 'F'),
          role: '딸',
          age: Math.max(3, childAge - 3),
          gender: 'F'
        });
        break;
        
      case 'ExtendedFamily':
        // 배우자
        companions.push({
          characterId: ageToCharacterId(userAge, userGender === 'M' ? 'F' : 'M'),
          role: userGender === 'M' ? '아내' : '남편',
          age: userAge,
          gender: userGender === 'M' ? 'F' : 'M'
        });
        // 자녀
        const kidAge = Math.max(5, userAge - 30);
        companions.push({
          characterId: ageToCharacterId(kidAge, 'M'),
          role: '아들',
          age: kidAge,
          gender: 'M'
        });
        // 조부모 (사용자 나이 + 25)
        const grandparentAge = userAge + 25;
        companions.push({
          characterId: ageToCharacterId(grandparentAge, 'M'),
          role: '할아버지',
          age: grandparentAge,
          gender: 'M'
        });
        companions.push({
          characterId: ageToCharacterId(grandparentAge - 2, 'F'),
          role: '할머니',
          age: grandparentAge - 2,
          gender: 'F'
        });
        break;
        
      case 'Friends':
        // 비슷한 연령대 친구들
        for (let i = 0; i < (itinerary.companionCount - 1); i++) {
          const friendAge = userAge + (Math.random() > 0.5 ? 2 : -2);
          const friendGender: 'M' | 'F' = i % 2 === 0 ? 'M' : 'F';
          companions.push({
            characterId: ageToCharacterId(friendAge, friendGender),
            role: '친구',
            age: friendAge,
            gender: friendGender
          });
        }
        break;
    }
  }
  
  // 주인공 결정 (curationFocus 기반)
  let protagonist = userCharacter;
  
  switch (itinerary.curationFocus) {
    case 'Kids':
      // 가장 어린 캐릭터가 주인공
      const youngest = [userCharacter, ...companions].sort((a, b) => a.age - b.age)[0];
      protagonist = youngest;
      break;
    case 'Parents':
      // 가장 나이 많은 캐릭터가 주인공
      const oldest = [userCharacter, ...companions].sort((a, b) => b.age - a.age)[0];
      protagonist = oldest;
      break;
    case 'Self':
    case 'Everyone':
    default:
      protagonist = userCharacter;
  }
  
  return { protagonist, companions };
}

/**
 * Gemini를 사용하여 장면별 대사 및 프롬프트 생성
 */
async function generateSceneWithGemini(
  scene: {
    placeName: string;
    placeType: string;
    isTransport: boolean;
  },
  context: {
    protagonist: Companion;
    companions: Companion[];
    curationFocus: CurationFocus;
    vibes: Vibe[];
    destination: string;
    fatigueLevel: string;
    transportType: string;
  }
): Promise<{ prompt: string; dialogue: SceneDialogue; mood: string }> {
  
  try {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not found');
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const dialogueStyle = DIALOGUE_STYLE[context.curationFocus];
    const primaryVibe = context.vibes[0] || 'Family';
    const vibeKeywords = getVibeKeywords(primaryVibe);
    
    const familySize = context.companions.length + 1;
    const familyDescription = context.companions.map(c => `${c.age}세 ${c.role}`).join(', ');
    
    const systemPrompt = `너는 한국인 가족 여행 영상의 대사 작가이자 영상 프롬프트 전문가야.
주인공의 시점에서 감정이 풍부한 한국어 대사와 Seedance 영상 프롬프트를 작성해.

## 가족 구성 (${familySize}인)
- 주인공: ${context.protagonist.age}세 ${context.protagonist.role}
- 동행자: ${familyDescription}

## 주인공 대사 스타일 (curationFocus: ${context.curationFocus})
- 톤: ${dialogueStyle.tone}
- 예시: ${dialogueStyle.examples.join(', ')}

## 여행 분위기 (vibes)
- 선택된 바이브: ${context.vibes.join(', ')}
- 영상 무드: ${vibeKeywords.mood}
- 영상 연출: ${vibeKeywords.visual}

## 이동 수단
- 교통수단: ${context.transportType}
${context.fatigueLevel !== 'none' ? `- 피로도: ${context.fatigueLevel} (영상에 반영)` : '- 피로도: 없음 (편안한 표정)'}

## 현재 장면
- 장소: ${scene.placeName} (${context.destination})
- 유형: ${scene.placeType}
${scene.isTransport ? '- 이동 중인 장면 (차량/교통수단 안에서)' : '- 방문지 장면'}

## 영상 스타일 (고정)
- 배경: 방문지 실사 사진 배경 (real photo background)
- 캐릭터: 지브리 스타일 애니메이션 (Studio Ghibli style animated characters)
- 품질: 고화질, 따뜻한 조명

## 출력 형식 (JSON만 출력)
{
  "protagonist_dialogue": "주인공의 한국어 대사 (1-2문장, 대사 스타일 반영)",
  "companion_reactions": [
    { "role": "역할", "text": "반응 대사" }
  ],
  "mood": "장면 분위기 (영어 1단어)",
  "visual_prompt": "영어 프롬프트: Korean family of ${familySize} (${context.protagonist.age}-year-old ${context.protagonist.role} as main character, ${familyDescription}) at ${scene.placeName}, real photo background of ${context.destination}, ${context.transportType} transportation, ${vibeKeywords.visual}, Studio Ghibli style animated characters, ${vibeKeywords.mood} mood, warm lighting, high quality"
}`;

    const result = await model.generateContent(systemPrompt);
    const text = result.response.text();
    
    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Gemini response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      prompt: parsed.visual_prompt || `Korean family at ${scene.placeName}, ${vibeKeywords.visual}, Studio Ghibli style`,
      dialogue: {
        protagonist: parsed.protagonist_dialogue || '와, 정말 멋지다!',
        reactions: (parsed.companion_reactions || []).map((r: any) => {
          const companion = context.companions.find(c => c.role === r.role);
          return {
            characterId: companion?.characterId || 'M5',
            text: r.text
          };
        })
      },
      mood: parsed.mood || 'happy'
    };
    
  } catch (error) {
    console.error('Gemini scene generation error:', error);
    
    // 폴백: 템플릿 기반 생성 (9개 사용자 입력 반영)
    const dialogueStyle = DIALOGUE_STYLE[context.curationFocus];
    const primaryVibe = context.vibes[0] || 'Family';
    const vibeKeywords = getVibeKeywords(primaryVibe);
    const familySize = context.companions.length + 1;
    const familyDescription = context.companions.map(c => `${c.age}-year-old ${c.role}`).join(', ');
    
    // 이동 수단 영어 변환
    const transportEnglish: Record<string, string> = {
      '전용차량': 'private car',
      '우버': 'Uber',
      '우버+대중교통': 'Uber and public transit',
      '대중교통+도보': 'public transit and walking',
      '대중교통만': 'public transit only',
      '도보': 'walking'
    };
    const transportEng = transportEnglish[context.transportType] || 'walking';
    
    if (scene.isTransport) {
      const transportDialogues = TRANSPORT_DIALOGUE[context.transportType] || TRANSPORT_DIALOGUE['도보'];
      const dialogues = transportDialogues[context.curationFocus];
      
      return {
        prompt: `Korean family of ${familySize} (${context.protagonist.age}-year-old ${context.protagonist.role}, ${familyDescription}) traveling by ${transportEng} in ${context.destination}, real photo background, ${vibeKeywords.visual}, Studio Ghibli style animated characters, ${context.fatigueLevel === 'high' ? 'tired expressions' : 'comfortable expressions'}, warm lighting`,
        dialogue: {
          protagonist: dialogues[Math.floor(Math.random() * dialogues.length)],
          reactions: context.companions.slice(0, 2).map(c => ({
            characterId: c.characterId,
            text: '그래, 조금만 더 가자'
          }))
        },
        mood: context.fatigueLevel === 'high' ? 'tired' : 'moving'
      };
    }
    
    return {
      prompt: `Korean family of ${familySize} (${context.protagonist.age}-year-old ${context.protagonist.role} as main character, ${familyDescription}) at ${scene.placeName}, real photo background of ${context.destination}, arrived by ${transportEng}, ${vibeKeywords.visual}, ${vibeKeywords.mood}, Studio Ghibli style animated characters, warm lighting, high quality`,
      dialogue: {
        protagonist: dialogueStyle.examples[Math.floor(Math.random() * dialogueStyle.examples.length)],
        reactions: context.companions.slice(0, 2).map(c => ({
          characterId: c.characterId,
          text: '정말 좋다!'
        }))
      },
      mood: vibeKeywords.mood.split(',')[0].trim()
    };
  }
}

/**
 * 일정표 → 영상 프롬프트 JSON 생성 (메인 함수)
 */
export async function generateVideoPrompts(itinerary: ItineraryData): Promise<VideoPromptData> {
  // 1. 캐릭터 구성 추출
  const { protagonist, companions } = extractCharacters(itinerary);
  
  // 2. 설정 계산
  const paceConfig = PACE_CONFIG[itinerary.travelPace];
  const transportType = getTransportType(itinerary.travelStyle, itinerary.mobilityStyle);
  const fatigueLevel = calculateFatigue(itinerary.mobilityStyle, itinerary.travelPace);
  
  // 3. 일별 아이템 그룹화
  const dayGroups: Map<number, ItineraryItem[]> = new Map();
  for (const item of itinerary.items) {
    if (!dayGroups.has(item.day)) {
      dayGroups.set(item.day, []);
    }
    dayGroups.get(item.day)!.push(item);
  }
  
  // 4. 일별 영상 데이터 생성
  const days: DayVideo[] = [];
  
  for (const [dayNum, items] of dayGroups) {
    // 슬롯 수에 맞게 조정
    const limitedItems = items.slice(0, paceConfig.slotsPerDay);
    const scenes: ScenePrompt[] = [];
    
    for (let i = 0; i < limitedItems.length; i++) {
      const item = limitedItems[i];
      
      // 장소 장면 생성
      const sceneData = await generateSceneWithGemini(
        {
          placeName: item.placeName,
          placeType: item.placeType,
          isTransport: false
        },
        {
          protagonist,
          companions,
          curationFocus: itinerary.curationFocus,
          vibes: itinerary.vibes as Vibe[],
          destination: itinerary.destination,
          fatigueLevel,
          transportType
        }
      );
      
      scenes.push({
        order: scenes.length + 1,
        placeName: item.placeName,
        placeType: item.placeType as any,
        duration: paceConfig.clipDuration,
        prompt: sceneData.prompt,
        dialogue: sceneData.dialogue,
        mood: sceneData.mood,
        isTransport: false
      });
      
      // 마지막 아이템이 아니고, 이동 장면 추가 조건 확인
      // (전용차량이 아닌 경우에만 이동 장면 추가)
      if (i < limitedItems.length - 1 && transportType !== '전용차량') {
        const nextItem = limitedItems[i + 1];
        
        // 이동 장면 (5초, 장소 장면보다 짧게)
        const transportScene = await generateSceneWithGemini(
          {
            placeName: `${item.placeName} → ${nextItem.placeName}`,
            placeType: 'transport',
            isTransport: true
          },
          {
            protagonist,
            companions,
            curationFocus: itinerary.curationFocus,
            vibes: itinerary.vibes as Vibe[],
            destination: itinerary.destination,
            fatigueLevel,
            transportType
          }
        );
        
        scenes.push({
          order: scenes.length + 1,
          placeName: `${item.placeName} → ${nextItem.placeName}`,
          placeType: 'transport',
          duration: 5,  // 이동 장면은 짧게
          prompt: transportScene.prompt,
          dialogue: transportScene.dialogue,
          mood: transportScene.mood,
          isTransport: true
        });
      }
    }
    
    days.push({
      day: dayNum,
      clipCount: scenes.length,
      clipDuration: paceConfig.clipDuration,
      scenes
    });
  }
  
  // 5. 최종 결과 반환
  return {
    itineraryId: itinerary.id,
    dayCount: days.length,
    protagonist: {
      type: itinerary.curationFocus,
      characterId: protagonist.characterId,
      age: protagonist.age
    },
    companions,
    vibes: itinerary.vibes as Vibe[],
    travelPace: itinerary.travelPace,
    transportType,
    fatigueLevel,
    days
  };
}

/**
 * 단일 장면 프롬프트 생성 (테스트용)
 */
export async function generateSingleScenePrompt(
  placeName: string,
  curationFocus: CurationFocus,
  vibes: Vibe[],
  destination: string
): Promise<ScenePrompt> {
  const mockProtagonist: Companion = {
    characterId: 'M1',
    role: '아이',
    age: 8,
    gender: 'M'
  };
  
  const mockCompanions: Companion[] = [
    { characterId: 'M5', role: '아빠', age: 45, gender: 'M' },
    { characterId: 'F5', role: '엄마', age: 43, gender: 'F' }
  ];
  
  const sceneData = await generateSceneWithGemini(
    { placeName, placeType: 'landmark', isTransport: false },
    {
      protagonist: mockProtagonist,
      companions: mockCompanions,
      curationFocus,
      vibes,
      destination,
      fatigueLevel: 'none',
      transportType: '도보'
    }
  );
  
  return {
    order: 1,
    placeName,
    placeType: 'landmark',
    duration: 10,
    prompt: sceneData.prompt,
    dialogue: sceneData.dialogue,
    mood: sceneData.mood,
    isTransport: false
  };
}

