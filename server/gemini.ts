import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// 🎬 드림 스튜디오: 1인칭 페르소나 스크립트 생성
export interface PersonaScript {
  text: string;
  persona: string;
  mood: string;
  voiceName: string;
}

export async function generatePersonaScript(
  imageBase64: string,
  language: string = 'ko',
  persona?: string
): Promise<PersonaScript> {
  const languagePrompts: Record<string, { instruction: string; voiceName: string }> = {
    ko: {
      instruction: `당신은 이 이미지 속 주인공(음식, 건물, 예술품, 풍경 등)입니다.
1인칭 시점으로 자신을 소개하고 이야기를 들려주세요.
15-30초 분량(한국어 80-120자)으로 감정이 담긴 대사를 작성하세요.

예시:
- 와인: "안녕, 나는 1892년 보르도에서 태어났어. 130년 동안 이 지하 저장고에서..."
- 에펠탑: "파리의 밤하늘 아래, 나는 매일 수백만 개의 불빛으로 반짝이지..."
- 초밥: "나는 오늘 아침 츠키지 시장에서 갓 잡힌 참치야..."

JSON 형식으로 응답:
{
  "text": "1인칭 대사",
  "persona": "피사체 정체 (와인병, 에펠탑 등)",
  "mood": "분위기 (nostalgic, proud, mysterious, cheerful 등)"
}`,
      voiceName: 'Kore'
    },
    en: {
      instruction: `You are the subject in this image (food, building, artwork, landmark, etc).
Introduce yourself in first person and tell your story.
Write an emotional 15-30 second monologue (80-120 words).

Examples:
- Wine: "Hello, I was born in Bordeaux in 1892. For 130 years in this cellar..."
- Eiffel Tower: "Under the Paris night sky, I sparkle with millions of lights..."
- Sushi: "I'm the freshest tuna from Tsukiji market this morning..."

Respond in JSON:
{
  "text": "first person monologue",
  "persona": "identity (wine bottle, Eiffel Tower, etc)",
  "mood": "mood (nostalgic, proud, mysterious, cheerful, etc)"
}`,
      voiceName: 'Puck'
    },
    ja: {
      instruction: `あなたはこの画像の主人公です（食べ物、建物、芸術品、風景など）。
一人称で自己紹介し、物語を語ってください。
15-30秒分（80-120文字）の感情的なモノローグを書いてください。

JSON形式で回答:
{
  "text": "一人称のセリフ",
  "persona": "被写体の正体",
  "mood": "雰囲気"
}`,
      voiceName: 'Aoede'
    },
    zh: {
      instruction: `你是这张图片中的主角（食物、建筑、艺术品、风景等）。
用第一人称介绍自己并讲述你的故事。
写一段15-30秒的独白（80-120字）。

以JSON格式回复:
{
  "text": "第一人称独白",
  "persona": "主体身份",
  "mood": "氛围"
}`,
      voiceName: 'Charon'
    }
  };

  const langConfig = languagePrompts[language] || languagePrompts.ko;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            persona: { type: "string" },
            mood: { type: "string" }
          },
          required: ["text", "persona", "mood"]
        }
      },
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg"
          }
        },
        langConfig.instruction + (persona ? `\n지정된 페르소나: ${persona}` : '')
      ]
    });

    const result = JSON.parse(response.text || '{}');
    return {
      ...result,
      voiceName: langConfig.voiceName
    };
  } catch (error) {
    console.error("페르소나 스크립트 생성 오류:", error);
    return {
      text: language === 'ko' ? "안녕하세요, 저는 이 아름다운 장소에서 여러분을 만나게 되어 기쁩니다." : "Hello, I'm delighted to meet you at this beautiful place.",
      persona: "unknown",
      mood: "cheerful",
      voiceName: langConfig.voiceName
    };
  }
}

// 🎤 Gemini 2.5 Flash TTS: 페르소나 음성 생성
export async function generatePersonaVoice(
  text: string,
  voiceName: string = 'Kore',
  mood: string = 'cheerful'
): Promise<{ audioBase64: string; mimeType: string } | null> {
  try {
    // 감정/분위기를 프롬프트에 포함
    const moodInstructions: Record<string, string> = {
      nostalgic: 'Speak with a warm, nostalgic tone, as if reminiscing about cherished memories.',
      proud: 'Speak with pride and confidence, celebrating your history and significance.',
      mysterious: 'Speak with an enigmatic, intriguing tone that draws listeners in.',
      cheerful: 'Speak with a bright, welcoming tone full of enthusiasm.',
      peaceful: 'Speak with a calm, serene voice that brings tranquility.',
      dramatic: 'Speak with theatrical intensity and emotional depth.'
    };

    const moodPrompt = moodInstructions[mood] || moodInstructions.cheerful;
    const fullPrompt = `${moodPrompt}\n\nSay the following:\n"${text}"`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: fullPrompt,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName
            }
          }
        }
      }
    });

    // 오디오 데이터 추출
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts?.[0]?.inlineData) {
      const audioData = candidate.content.parts[0].inlineData;
      return {
        audioBase64: audioData.data || '',
        mimeType: audioData.mimeType || 'audio/wav'
      };
    }

    return null;
  } catch (error) {
    console.error("TTS 음성 생성 오류:", error);
    return null;
  }
}

// 🎬 드림샷 스튜디오 전용 프롬프트 엔진
export interface DreamShotPrompt {
  imagePrompt: string;
  audioScript: string;
  mood: 'cinematic' | 'commercial' | 'documentary' | 'artistic';
  lighting: 'golden-hour' | 'natural' | 'studio' | 'dramatic';
  angle: 'close-up' | 'medium-shot' | 'wide-shot' | 'aerial';
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  locationName?: string;
}

export interface GuideContent {
  title: string;
  description: string;
  tips: string[];
  culturalNotes?: string;
  bestTimeToVisit?: string;
  accessibility?: string;
}

export async function generateLocationBasedContent(
  imageBase64: string,
  locationInfo: LocationInfo,
  language: string = 'ko'
): Promise<GuideContent> {
  try {
    const languageMap: Record<string, string> = {
      ko: '한국어',
      en: 'English',
      ja: '日本語',
      zh: '中文'
    };

    const targetLanguage = languageMap[language] || languageMap.ko;
    
    const systemPrompt = `You are a professional travel guide content creator. 
Analyze the provided image and location information to create detailed, accurate guide content.
Location: ${locationInfo.locationName || `${locationInfo.latitude}, ${locationInfo.longitude}`}
Respond in ${targetLanguage} with JSON format:
{
  "title": "string - catchy, descriptive title",
  "description": "string - detailed description of the place",
  "tips": ["string array - practical tips for visitors"],
  "culturalNotes": "string - cultural significance or background",
  "bestTimeToVisit": "string - optimal visiting times",
  "accessibility": "string - accessibility information"
}`;

    const contents = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg",
        },
      },
      `Create a comprehensive travel guide for this location. 
Location coordinates: ${locationInfo.latitude}, ${locationInfo.longitude}
${locationInfo.locationName ? `Location name: ${locationInfo.locationName}` : ''}

Please provide accurate, helpful information that would be valuable for travelers visiting this place.`,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            tips: { 
              type: "array",
              items: { type: "string" }
            },
            culturalNotes: { type: "string" },
            bestTimeToVisit: { type: "string" },
            accessibility: { type: "string" }
          },
          required: ["title", "description", "tips"]
        }
      },
      contents: contents,
    });

    const rawJson = response.text;
    
    if (rawJson) {
      const data: GuideContent = JSON.parse(rawJson);
      return data;
    } else {
      throw new Error("Empty response from Gemini");
    }
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error(`Failed to generate content: ${error}`);
  }
}

export async function getLocationName(latitude: number, longitude: number): Promise<string> {
  try {
    // Use Google Geocoding API to get location name
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}&language=ko`
    );
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      return result.formatted_address || `${latitude}, ${longitude}`;
    }
    
    return `${latitude}, ${longitude}`;
  } catch (error) {
    console.error("Geocoding error:", error);
    return `${latitude}, ${longitude}`;
  }
}

export async function generateShareLinkDescription(
  guides: any[],
  linkName: string,
  language: string = 'ko'
): Promise<string> {
  try {
    const languageMap: Record<string, string> = {
      ko: '한국어',
      en: 'English', 
      ja: '日本語',
      zh: '中文'
    };

    const targetLanguage = languageMap[language] || languageMap.ko;
    
    const guideDescriptions = guides.map(guide => 
      `${guide.title}: ${guide.description} (위치: ${guide.locationName || `${guide.latitude}, ${guide.longitude}`})`
    ).join('\n');

    const prompt = `Create an engaging description for a shared travel guide collection in ${targetLanguage}.
Collection name: ${linkName}
Included locations:
${guideDescriptions}

Create a compelling description that would entice people to explore these locations.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "공유된 가이드 모음입니다.";
  } catch (error) {
    console.error("Share link description generation error:", error);
    return "공유된 가이드 모음입니다.";
  }
}

// 🎬 드림샷 스튜디오: 영화급 이미지 생성 프롬프트 
export async function generateCinematicPrompt(
  originalGuide: any,
  userPreferences: {
    mood?: 'adventure' | 'romantic' | 'peaceful' | 'dramatic';
    style?: 'movie' | 'commercial' | 'travel-blog' | 'instagram';
    timeOfDay?: 'sunrise' | 'noon' | 'sunset' | 'night';
  } = {}
): Promise<DreamShotPrompt> {
  const prompt = `
당신은 세계적인 여행 사진작가이자 영화감독입니다.

원본 여행 정보:
- 장소: ${originalGuide.locationName || originalGuide.title}
- 설명: ${originalGuide.description}
- 위도/경도: ${originalGuide.latitude}, ${originalGuide.longitude}

다음 조건으로 영화급 이미지를 위한 상세한 프롬프트를 생성해주세요:
- 분위기: ${userPreferences.mood || 'adventure'}
- 스타일: ${userPreferences.style || 'movie'}
- 시간대: ${userPreferences.timeOfDay || 'golden-hour'}

출력 형식 (JSON):
{
  "imagePrompt": "상세한 이미지 생성 프롬프트 (영문, 200자 이상)",
  "audioScript": "감정적이고 매력적인 한국어 내레이션 스크립트 (50-100자)",
  "mood": "cinematic/commercial/documentary/artistic 중 하나",
  "lighting": "golden-hour/natural/studio/dramatic 중 하나", 
  "angle": "close-up/medium-shot/wide-shot/aerial 중 하나"
}

핵심 요구사항:
1. 사용자가 주인공이 되어 그 장소에 있는 것처럼 자연스럽게
2. 영화나 광고 같은 프로페셔널한 구도와 조명
3. 해당 여행지의 특색과 문화가 드러나게
4. 감정적으로 몰입할 수 있는 스토리텔링
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            imagePrompt: { type: "string" },
            audioScript: { type: "string" },
            mood: { type: "string", enum: ["cinematic", "commercial", "documentary", "artistic"] },
            lighting: { type: "string", enum: ["golden-hour", "natural", "studio", "dramatic"] },
            angle: { type: "string", enum: ["close-up", "medium-shot", "wide-shot", "aerial"] }
          },
          required: ["imagePrompt", "audioScript", "mood", "lighting", "angle"]
        }
      },
      contents: prompt
    });

    try {
      const result = JSON.parse(response.text || '{}');
      // 필수 필드 검증
      if (!result.imagePrompt || !result.audioScript || !result.mood) {
        throw new Error('Invalid JSON response structure');
      }
      return result as DreamShotPrompt;
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError);
      throw parseError; // 기본 프롬프트로 fallback
    }
  } catch (error) {
    console.error('프롬프트 생성 실패:', error);
    // 기본 프롬프트 반환
    return {
      imagePrompt: `Cinematic travel photography of a person at ${originalGuide.locationName || originalGuide.title}, golden hour lighting, professional composition, travel magazine style, high quality, realistic`,
      audioScript: `${originalGuide.locationName || originalGuide.title}에서의 특별한 순간, 여행의 감동을 느껴보세요.`,
      mood: 'cinematic',
      lighting: 'golden-hour',
      angle: 'medium-shot'
    };
  }
}

// 🎤 음성 스크립트 최적화 (감정 표현 강화)
export async function optimizeAudioScript(
  originalScript: string,
  targetEmotion: 'excited' | 'peaceful' | 'inspiring' | 'nostalgic' = 'inspiring'
): Promise<string> {
  const prompt = `
당신은 전문 성우이자 여행 콘텐츠 전문가입니다.

원본 스크립트: "${originalScript}"
목표 감정: ${targetEmotion}

다음 조건으로 음성 녹음에 최적화된 스크립트로 개선해주세요:
1. 자연스러운 한국어 발음과 리듬감
2. ${targetEmotion} 감정이 잘 드러나는 톤
3. 15-30초 분량 (80-120자)
4. 여행의 감동과 스토리가 담긴 내용
5. 사용자가 직접 말하기 쉬운 문장 구조

개선된 스크립트만 출력해주세요:
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    
    return response.text?.trim() || originalScript;
  } catch (error) {
    console.error('스크립트 최적화 실패:', error);
    return originalScript;
  }
}

// 🎬 드림 스튜디오: 텍스트 분석 + 분류 + 20초 대사 생성 (이미지 분석 불필요)
export interface AnalyzedScript {
  category: 'artwork' | 'landmark' | 'food_drink'; // 작품, 유적지, 음식/술
  categoryKo: string;
  persona: string;
  protagonist: string; // 영상에서 말하는 주인공 (artwork: 피사체, landmark/food: 가이드)
  mood: string;
  script: string;
  keywords: string[];
  voiceName: string;
  videoPrompt: string; // 영상 제작용 프롬프트 (D-ID/Kling용)
  useOriginalImage: boolean; // artwork일 때 true - 원본 이미지 사용
}

export async function analyzeTextAndGenerateScript(
  description: string,
  language: string = 'ko',
  duration: number = 20
): Promise<AnalyzedScript> {
  const charCount = duration <= 8 ? '40-60' : duration <= 15 ? '80-100' : '100-120';
  
  const voiceMap: Record<string, string> = {
    ko: 'Kore',
    en: 'Puck',
    ja: 'Aoede',
    zh: 'Charon'
  };

  const prompt = `당신은 콘텐츠 분석 및 AI 영상 제작 전문가입니다.
다음 설명을 분석하고 1인칭 시점의 ${duration}초 분량(${charCount}자) 한국어 대사를 작성하세요.

[분석할 설명]
"${description.substring(0, 1000)}"

═══════════════════════════════════════
📌 카테고리 분류 기준 (반드시 준수):
═══════════════════════════════════════
- artwork: 그림, 회화, 조각상, 예술작품, 박물관 전시품, 미술관 작품, 동상, 석상, 스핑크스, 피라미드 벽화
  → 🎯 주인공: 작품 자체 또는 작품 속 인물/피사체 (원본 이미지 사용)
  → 예: 스핑크스 → "스핑크스 석상", 모나리자 → "모나리자", 다비드상 → "다비드 석상"
  
- landmark: 건물, 유적지, 자연명소, 도시풍경, 관광지, 거리
  → 🎯 주인공: 여행 가이드 (아바타가 배경 앞에서 설명)

- food_drink: 음식, 와인, 술, 카페, 레스토랑, 요리
  → 🎯 주인공: 여행 가이드 (아바타가 배경 앞에서 설명)

═══════════════════════════════════════
📌 작업 순서:
═══════════════════════════════════════
1. 위 기준으로 카테고리 분류
2. 핵심 키워드 3-5개 추출
3. 페르소나 정의 (예: 모나리자, 에펠탑, 100년 된 와인 등)
4. 🎯 주인공(protagonist) 명시: artwork면 피사체 명칭, 그 외면 "여행 가이드"
5. 분위기 선정 (nostalgic, proud, mysterious, cheerful, peaceful, dramatic)
6. 1인칭 한국어 대사 작성 - 주인공이 직접 말하는 형식
7. 영상 제작 프롬프트 작성 (영어로)

⚠️ 중요: 대사는 반드시 한국어로 작성하세요!
⚠️ 금지 단어 (AI 정책 위반): 혁명, 전쟁, 폭력, 무기, 총, 칼, 피, 죽음, 살인, 시위, 폭동, 테러

JSON 형식으로 응답:
{
  "category": "artwork 또는 landmark 또는 food_drink",
  "categoryKo": "작품/유적지/음식및술",
  "persona": "피사체 정체 (한국어)",
  "protagonist": "영상에서 말하는 주인공 - artwork면 피사체명(예: 스핑크스 석상), 그 외면 여행 가이드",
  "mood": "분위기",
  "script": "한국어 1인칭 대사 (${charCount}자)",
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "videoPrompt": "영어 영상 프롬프트: artwork면 'The [persona] speaks with gentle expression, subtle movements' / 그 외면 'Tour guide explains with friendly gestures in front of the background'",
  "useOriginalImage": true/false (artwork면 true, 그 외면 false)
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            category: { type: "string" },
            categoryKo: { type: "string" },
            persona: { type: "string" },
            protagonist: { type: "string" },
            mood: { type: "string" },
            script: { type: "string" },
            keywords: { type: "array", items: { type: "string" } },
            videoPrompt: { type: "string" },
            useOriginalImage: { type: "boolean" }
          },
          required: ["category", "categoryKo", "persona", "protagonist", "mood", "script", "keywords", "videoPrompt", "useOriginalImage"]
        }
      },
      contents: prompt
    });

    const result = JSON.parse(response.text || '{}');
    const isArtwork = result.category === 'artwork';
    return {
      ...result,
      protagonist: result.protagonist || (isArtwork ? result.persona : '여행 가이드'),
      voiceName: voiceMap[language] || voiceMap.ko,
      useOriginalImage: isArtwork, // artwork면 원본 이미지 사용
      videoPrompt: result.videoPrompt || (isArtwork 
        ? 'The subject speaks with gentle expression and subtle movements'
        : 'Tour guide explains with friendly gestures in front of the scenic background')
    };
  } catch (error) {
    console.error("텍스트 분석 및 대사 생성 오류:", error);
    return {
      category: 'landmark',
      categoryKo: '유적지',
      persona: 'unknown',
      protagonist: '여행 가이드',
      mood: 'cheerful',
      script: '안녕하세요, 저는 이 아름다운 장소에서 여러분을 만나게 되어 기쁩니다.',
      keywords: [],
      voiceName: voiceMap[language] || voiceMap.ko,
      videoPrompt: 'Tour guide explains with friendly gestures',
      useOriginalImage: false
    };
  }
}

// 🎬 드림 스튜디오: 이미지 분석 + 분류 + 20초 대사 생성
export async function analyzeImageAndGenerateScript(
  imageBase64: string,
  language: string = 'ko',
  duration: number = 20
): Promise<AnalyzedScript> {
  const charCount = duration <= 8 ? '40-60' : duration <= 15 ? '80-100' : '100-120';
  
  const voiceMap: Record<string, string> = {
    ko: 'Kore',
    en: 'Puck',
    ja: 'Aoede',
    zh: 'Charon'
  };

  const prompt = `당신은 이미지 분석 및 AI 영상 제작 전문가입니다.
이 이미지를 분석하고 1인칭 시점의 ${duration}초 분량(${charCount}자) 한국어 대사를 작성하세요.

═══════════════════════════════════════
📌 카테고리 분류 기준 (반드시 준수):
═══════════════════════════════════════
- artwork: 그림, 회화, 조각상, 예술작품, 박물관 전시품, 미술관 작품, 초상화, 동상, 석상, 스핑크스
  → 🎯 주인공: 작품 자체 또는 작품 속 인물/피사체 (원본 이미지 사용)
  → 예: 스핑크스 → "스핑크스 석상", 모나리자 → "모나리자", 다비드상 → "다비드 석상"
  
- landmark: 건물, 유적지, 자연명소, 도시풍경, 관광지, 거리, 다리
  → 🎯 주인공: 여행 가이드 (아바타가 배경 앞에서 설명)

- food_drink: 음식, 와인, 술, 카페, 레스토랑, 요리, 디저트
  → 🎯 주인공: 여행 가이드 (아바타가 배경 앞에서 설명)

═══════════════════════════════════════
📌 작업 순서:
═══════════════════════════════════════
1. 이미지를 보고 위 기준으로 카테고리 분류
2. 핵심 키워드 3-5개 추출
3. 페르소나 정의 (이미지 속 주인공)
4. 🎯 주인공(protagonist) 명시: artwork면 피사체 명칭, 그 외면 "여행 가이드"
5. 분위기 선정 (nostalgic, proud, mysterious, cheerful, peaceful, dramatic)
6. 1인칭 한국어 대사 작성 - 주인공이 직접 말하는 형식
7. 영상 제작 프롬프트 작성 (영어로)

⚠️ 중요: 대사는 반드시 한국어로 작성하세요!
⚠️ 금지 단어 (AI 정책 위반): 혁명, 전쟁, 폭력, 무기, 총, 칼, 피, 죽음, 살인, 시위, 폭동, 테러

JSON 형식으로 응답:
{
  "category": "artwork 또는 landmark 또는 food_drink",
  "categoryKo": "작품/유적지/음식및술",
  "persona": "피사체 정체 (한국어)",
  "protagonist": "영상에서 말하는 주인공 - artwork면 피사체명(예: 스핑크스 석상), 그 외면 여행 가이드",
  "mood": "분위기",
  "script": "한국어 1인칭 대사 (${charCount}자)",
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "videoPrompt": "영어 영상 프롬프트: artwork면 'The [persona] speaks with gentle expression, subtle movements' / 그 외면 'Tour guide explains with friendly gestures in front of the background'",
  "useOriginalImage": true/false (artwork면 true, 그 외면 false)
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            category: { type: "string" },
            categoryKo: { type: "string" },
            persona: { type: "string" },
            protagonist: { type: "string" },
            mood: { type: "string" },
            script: { type: "string" },
            keywords: { type: "array", items: { type: "string" } },
            videoPrompt: { type: "string" },
            useOriginalImage: { type: "boolean" }
          },
          required: ["category", "categoryKo", "persona", "protagonist", "mood", "script", "keywords", "videoPrompt", "useOriginalImage"]
        }
      },
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg"
          }
        },
        prompt
      ]
    });

    const result = JSON.parse(response.text || '{}');
    const isArtwork = result.category === 'artwork';
    return {
      ...result,
      protagonist: result.protagonist || (isArtwork ? result.persona : '여행 가이드'),
      voiceName: voiceMap[language] || voiceMap.ko,
      useOriginalImage: isArtwork,
      videoPrompt: result.videoPrompt || (isArtwork 
        ? 'The subject speaks with gentle expression and subtle movements'
        : 'Tour guide explains with friendly gestures in front of the scenic background')
    };
  } catch (error) {
    console.error("이미지 분석 및 대사 생성 오류:", error);
    return {
      category: 'landmark',
      categoryKo: '유적지',
      persona: 'unknown',
      protagonist: '여행 가이드',
      mood: 'cheerful',
      script: '안녕하세요, 저는 이 아름다운 장소에서 여러분을 만나게 되어 기쁩니다.',
      keywords: [],
      voiceName: voiceMap[language] || voiceMap.ko,
      videoPrompt: 'Tour guide explains with friendly gestures',
      useOriginalImage: false
    };
  }
}
