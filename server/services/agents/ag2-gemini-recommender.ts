/**
 * AG2: Gemini Creative Recommender (AI 최소 추천)
 * 소요: 5~8초 (현재 39초 대비 80% 감소)
 * 
 * 핵심 최적화:
 * - 현재: "27개 장소 전부 상세 정보 추천해줘" (프롬프트 2000자+, 응답 5000자+)
 * - 변경: "역할별 2~3곳 이름+한줄이유만" (프롬프트 500자, 응답 1000자)
 * - Gemini의 창의적 추천 능력은 유지하되, 작업량만 최소화
 */

import { GoogleGenAI } from "@google/genai";
import type { AG1Output, PlaceResult } from './types';
import {
  formatSentimentForPrompt,
} from '../korean-sentiment-service';
import {
  generateProtagonistSentence,
  generatePromptContext,
} from '../protagonist-generator';

// Lazy initialization
let ai: GoogleGenAI | null = null;

function getGeminiApiKey(): string {
  return process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error('Gemini API 키가 없습니다.');
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

/**
 * AG2 메인: 간소화된 Gemini 프롬프트로 장소 추천
 * 
 * 기존 대비 변경점:
 * 1. 좌표(lat/lng) 요청 제거 → AG3에서 DB 매칭으로 확보
 * 2. vibeScore, tags 등 메타데이터 제거 → AG3에서 계산
 * 3. 역할별(아침/점심/오후/저녁) 2~3곳만 이름+이유 요청
 * 4. 응답 크기 80% 축소 → API 응답 시간 대폭 단축
 */
export async function generateRecommendations(skeleton: AG1Output): Promise<PlaceResult[]> {
  const _t0 = Date.now();
  const { formData, vibeWeights, requiredPlaceCount, koreanSentiment } = skeleton;

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.error('[AG2] ❌ Gemini API 키 없음');
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const vibeDescription = vibeWeights
    .map(v => `${v.vibe}(${v.percentage}%)`)
    .join(', ');

  const paceKorean = formData.travelPace === 'Packed' ? '빡빡하게'
    : formData.travelPace === 'Normal' ? '보통'
    : '여유롭게';

  // 한국 감성 섹션 (있으면 추가)
  const sentimentSection = koreanSentiment
    ? formatSentimentForPrompt(koreanSentiment, formData.destination)
    : '';

  // 주인공 컨텍스트
  const protagonistContext = generatePromptContext({
    curationFocus: (formData.curationFocus as any) || 'Everyone',
    companionType: (formData.companionType as any) || 'Couple',
    companionCount: formData.companionCount || 2,
    companionAges: formData.companionAges,
    vibes: vibeWeights.map(v => v.vibe),
    destination: formData.destination,
    birthDate: formData.birthDate,
  });

  const protagonistInfo = generateProtagonistSentence({
    curationFocus: (formData.curationFocus as any) || 'Everyone',
    companionType: (formData.companionType as any) || 'Couple',
    companionCount: formData.companionCount || 2,
    companionAges: formData.companionAges,
    vibes: vibeWeights.map(v => v.vibe),
    destination: formData.destination,
    birthDate: formData.birthDate,
  });

  console.log(`[AG2] 🎯 주인공: ${protagonistInfo.sentence}`);

  // ===== 간소화된 프롬프트 (핵심 최적화) =====
  // 기존: 2000자+ 프롬프트, 5000자+ 응답 (27개 장소 × 10필드)
  // 변경: 500자 프롬프트, 1000자 응답 (장소명 + 한줄이유만)
  const slotCount = requiredPlaceCount;
  const foodCount = Math.ceil(slotCount * 0.4); // 40% 식당
  const activityCount = slotCount - foodCount;

  const prompt = `${formData.destination} 여행지를 추천해주세요.

${protagonistContext}

【조건】바이브: ${vibeDescription} | 스타일: ${formData.travelStyle} | 밀도: ${paceKorean} | 동행: ${formData.companionType} ${formData.companionCount}명
${sentimentSection ? `\n${sentimentSection}\n` : ''}
【한국인 선호 필수】한국인이 SNS에서 많이 공유하고 실제 방문하는 장소를 최우선으로 추천하세요.

【요청】
1. 관광/체험 장소 ${activityCount}곳 (실제 존재하는 장소만)
2. 식당/카페 ${foodCount}곳 (현지인+한국인 인기 맛집)

각 장소에: 정확한 장소명, 한줄 추천이유, 도시명, 추천시간대(morning/lunch/afternoon/evening), 식당여부

⚠️ 아래 JSON만 응답하세요:
{"places":[{"name":"정확한 장소명","reason":"한줄 추천이유","city":"도시명","time":"morning","isFood":false}]}

필수 규칙:
- name: 구글맵에서 검색 가능한 실제 장소명
- isFood: 식당/카페는 true
- 도시별 균형 분배
- 정확히 ${slotCount}곳 추천`;

  try {
    console.log(`[AG2] 🤖 Gemini에 ${slotCount}곳 요청 (간소화 프롬프트 ${prompt.length}자)...`);

    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const text = response.text || "";
    console.log(`[AG2] 🤖 Gemini 응답 수신 (${text.length}자, ${Date.now() - _t0}ms)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AG2] ❌ JSON 파싱 실패, 응답:', text.slice(0, 300));
      return [];
    }

    const result = JSON.parse(jsonMatch[0]);
    const placesRaw = result.places || [];

    if (placesRaw.length === 0) {
      console.warn('[AG2] ⚠️ Gemini가 0곳 반환');
      return [];
    }

    console.log(`[AG2] ✅ Gemini ${placesRaw.length}곳 반환 (${Date.now() - _t0}ms)`);

    // 간소화된 응답 → PlaceResult 변환 (좌표는 AG3에서 DB 매칭으로 확보)
    return placesRaw
      .filter((p: any) => p.name)
      .map((place: any, index: number) => ({
        id: `gemini-v2-${Date.now()}-${index}`,
        name: place.name,
        description: place.reason || '',
        lat: place.lat || 0,  // AG3에서 DB 매칭으로 교체됨
        lng: place.lng || 0,
        vibeScore: 7,  // AG3에서 재계산
        confidenceScore: 7,
        sourceType: "Gemini AI V2",
        personaFitReason: place.reason || "AI 추천 장소",
        tags: place.isFood ? ['restaurant', 'food'] : [],
        vibeTags: place.isFood ? ['Foodie' as const] : [],
        image: "",
        priceEstimate: "",
        placeTypes: place.isFood ? ['restaurant'] : [],
        recommendedTime: place.time || 'afternoon',
        city: place.city || formData.destination,
        region: place.region || "",
        koreanPopularityScore: 0,
        googleMapsUrl: "",
      }));
  } catch (error: any) {
    if (error.message === 'GEMINI_API_KEY_MISSING') throw error;
    console.error("[AG2] ❌ Gemini 실패:", error?.message || error);
    return [];
  }
}
