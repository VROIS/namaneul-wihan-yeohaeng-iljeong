/**
 * Phase E - 영상용 대사 자동 생성 서비스
 * 
 * Gemini 3.0을 사용하여:
 * 1. 장소별 주인공 대사 (한국어)
 * 2. 동반자 반응/대사
 * 3. Seedance용 영상 프롬프트 (영어)
 */

interface CharacterDialogue {
    characterId: string;  // M1, F1, M2, ...
    dialogue: string;     // 한국어 대사
    emotion?: string;     // 감정 (happy, excited, impressed 등)
}

interface VideoSceneDialogue {
    placeName: string;
    placeType: string;
    protagonistDialogue: string;
    protagonistEmotion: string;
    companionDialogues: CharacterDialogue[];
    videoPrompt: string;  // Seedance용 영어 프롬프트
    bgmMood: string;      // 배경음악 분위기
}

interface DialogueGenerationInput {
    placeName: string;
    placeType: string;
    cityName: string;
    protagonistCharacterId: string;  // 주인공 캐릭터 ID
    protagonistAge: string;          // 연령대 (예: "5-9", "30-39")
    companionCharacters: { id: string; age: string; relation: string }[];
    vibes: string[];                 // 여행 분위기
    curationFocus: string;           // Kids, Parents, Everyone, Self
}

/**
 * 연령대별 말투 스타일 정의
 */
const AGE_SPEECH_STYLES: Record<string, string> = {
    "5-9": "어린아이 말투 (반말, 짧은 문장, 감탄사)",
    "10-12": "초등학생 말투 (호기심, 질문 많음)",
    "13-17": "청소년 말투 (약간 건조, 신조어 가능)",
    "20-29": "20대 말투 (활발, 감탄사)",
    "30-39": "30대 말투 (세련됨, 따뜻함)",
    "40-49": "40대 말투 (안정적, 배려)",
    "50-59": "50대 말투 (경험 풍부, 회상)",
    "60+": "60대+ 말투 (여유, 인생 경험)",
};

/**
 * 관계별 호칭/톤 정의
 */
const RELATION_TONES: Record<string, { call: string; tone: string }> = {
    child: { call: "OO야", tone: "따뜻하고 보호적" },
    parent: { call: "아버지/어머니", tone: "공경하면서 친근" },
    grandparent: { call: "할아버지/할머니", tone: "공경, 애정" },
    spouse: { call: "여보/자기야", tone: "친밀" },
    friend: { call: "이름", tone: "편안한 반말" },
    sibling: { call: "언니/오빠/동생", tone: "친근한 반말" },
};

/**
 * Gemini를 사용하여 대사 생성
 */
export async function generateSceneDialogue(
    input: DialogueGenerationInput
): Promise<VideoSceneDialogue> {
    console.log(`[DialogueGenerator] Generating dialogue for ${input.placeName}...`);

    try {
        const { GoogleGenAI } = await import("@google/genai");
        const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

        if (!apiKey) {
            console.warn("[DialogueGenerator] Gemini API key not configured, using fallback");
            return generateFallbackDialogue(input);
        }

        const ai = new GoogleGenAI({ apiKey });

        // 주인공 말투 스타일
        const protagonistStyle = AGE_SPEECH_STYLES[input.protagonistAge] || AGE_SPEECH_STYLES["30-39"];

        // 동반자 정보 문자열
        const companionInfo = input.companionCharacters.map(c =>
            `- ${c.id}: ${c.age}세, ${c.relation}`
        ).join("\n");

        const systemPrompt = `당신은 여행 콘텐츠 시나리오 작가입니다.
아래 여행 정보를 바탕으로 감동적인 대사를 생성하세요.

## 장소 정보
- 장소명: ${input.placeName}
- 장소 유형: ${input.placeType}
- 도시: ${input.cityName}

## 주인공 정보
- 캐릭터 ID: ${input.protagonistCharacterId}
- 연령대: ${input.protagonistAge}
- 말투 스타일: ${protagonistStyle}
- 누구를 위한 여행: ${input.curationFocus}

## 동반자 정보
${companionInfo || "혼자 여행"}

## 여행 분위기
${input.vibes.join(", ")}

## 출력 형식 (JSON)
{
  "protagonistDialogue": "주인공의 한국어 대사 (1-2문장, 감정 담아)",
  "protagonistEmotion": "happy/excited/impressed/curious/peaceful 중 하나",
  "companionDialogues": [
    {
      "characterId": "동반자 캐릭터 ID",
      "dialogue": "동반자의 한국어 반응 대사 (1문장)",
      "emotion": "감정"
    }
  ],
  "videoPrompt": "Seedance용 영어 영상 프롬프트 (캐릭터 동작, 배경, 분위기 설명, Studio Ghibli style 포함)",
  "bgmMood": "calm/upbeat/emotional/adventurous 중 하나"
}

## 주의사항
1. 대사는 자연스럽고 진심 어린 느낌으로
2. ${input.curationFocus === "Kids" ? "아이가 주인공이므로 아이 시점의 감탄/발견 중심" : ""}
3. ${input.curationFocus === "Parents" ? "부모님이 주인공이므로 추억/회상 중심" : ""}
4. 영상 프롬프트는 반드시 영어로, 상세하게`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: systemPrompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                placeName: input.placeName,
                placeType: input.placeType,
                protagonistDialogue: parsed.protagonistDialogue || "",
                protagonistEmotion: parsed.protagonistEmotion || "happy",
                companionDialogues: parsed.companionDialogues || [],
                videoPrompt: parsed.videoPrompt || "",
                bgmMood: parsed.bgmMood || "calm",
            };
        }

        console.warn("[DialogueGenerator] Failed to parse Gemini response, using fallback");
        return generateFallbackDialogue(input);

    } catch (error) {
        console.error("[DialogueGenerator] Error:", error);
        return generateFallbackDialogue(input);
    }
}

/**
 * API 실패 시 기본 대사 생성
 */
function generateFallbackDialogue(input: DialogueGenerationInput): VideoSceneDialogue {
    // 장소 유형별 기본 대사
    const typeDialogues: Record<string, { dialogue: string; emotion: string }> = {
        restaurant: { dialogue: "와, 정말 맛있어 보여요!", emotion: "excited" },
        museum: { dialogue: "이런 작품을 직접 보다니 감동이에요", emotion: "impressed" },
        landmark: { dialogue: "드디어 여기 왔어요!", emotion: "happy" },
        park: { dialogue: "공기가 정말 좋아요", emotion: "peaceful" },
        default: { dialogue: "여기 정말 좋다!", emotion: "happy" },
    };

    const fallback = typeDialogues[input.placeType] || typeDialogues.default;

    return {
        placeName: input.placeName,
        placeType: input.placeType,
        protagonistDialogue: fallback.dialogue,
        protagonistEmotion: fallback.emotion,
        companionDialogues: input.companionCharacters.map(c => ({
            characterId: c.id,
            dialogue: "그래, 정말 멋지지?",
            emotion: "happy",
        })),
        videoPrompt: `A Korean ${input.protagonistAge} year old person looking at ${input.placeName}, ${input.vibes.join(" and ")} mood, soft natural lighting, Studio Ghibli style animation`,
        bgmMood: "calm",
    };
}

/**
 * 일정표 전체에 대한 대사 일괄 생성
 */
export async function generateItineraryDialogues(
    itineraryItems: Array<{
        placeName: string;
        placeType: string;
        cityName: string;
    }>,
    characters: {
        protagonist: { id: string; age: string };
        companions: Array<{ id: string; age: string; relation: string }>;
    },
    vibes: string[],
    curationFocus: string
): Promise<VideoSceneDialogue[]> {
    console.log(`[DialogueGenerator] Generating dialogues for ${itineraryItems.length} places...`);

    const dialogues: VideoSceneDialogue[] = [];

    // 병렬 처리 (최대 3개씩)
    const batchSize = 3;
    for (let i = 0; i < itineraryItems.length; i += batchSize) {
        const batch = itineraryItems.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(item =>
                generateSceneDialogue({
                    placeName: item.placeName,
                    placeType: item.placeType,
                    cityName: item.cityName,
                    protagonistCharacterId: characters.protagonist.id,
                    protagonistAge: characters.protagonist.age,
                    companionCharacters: characters.companions,
                    vibes,
                    curationFocus,
                })
            )
        );
        dialogues.push(...batchResults);
    }

    return dialogues;
}

/**
 * 캐릭터 ID를 연령대로 변환
 */
export function getAgeRangeFromCharacterId(characterId: string): string {
    const ageMap: Record<string, string> = {
        M1: "5-9", F1: "5-9",
        M2: "13-17", F2: "13-17",
        M3: "20-29", F3: "20-29",
        M4: "30-39", F4: "30-39",
        M5: "40-49", F5: "40-49",
        M6: "50-59", F6: "50-59",
        M7: "60+", F7: "60+",
    };
    return ageMap[characterId] || "30-39";
}
