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

  // ===== 🔗 Agent Protocol v1.0: 영어 공식명 강제 프롬프트 =====
  // AG2 → AG3 통신: 구글맵 검색 가능한 영어 공식 명칭으로 전달
  const slotCount = requiredPlaceCount;
  const foodCount = Math.ceil(slotCount * 0.4); // 40% 식당
  const activityCount = slotCount - foodCount;

  // 🔗 사용자 입력 도시 반경 100km 내외: Place Seed·AG3 매칭 범위와 동일하게 제한
  const prompt = `Recommend exactly ${slotCount} real places in ${formData.destination} for Korean tourists.
Important: Only recommend places within about 100km radius of the destination city (city center + suburbs). This matches our data coverage.
Need: ${activityCount} attractions + ${foodCount} restaurants/cafes. Vibes: ${vibeDescription}. Group: ${formData.companionType} ${formData.companionCount}pax.

Respond ONLY with this JSON (no markdown):
{"places":[{"name":"Official English name on Google Maps","reason":"Korean 1-line reason","isFood":false}]}

Example (Paris): {"places":[{"name":"Eiffel Tower","reason":"파리 필수 랜드마크, 야경 명소","isFood":false},{"name":"Le Bouillon Chartier","reason":"100년 전통 파리 맛집, 가성비 최고","isFood":true}]}`;

  try {
    console.log(`[AG2] 🤖 Gemini에 ${slotCount}곳 요청 (간소화 프롬프트 ${prompt.length}자)...`);

    const response = await getAI().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    // 디버그: 응답 상세 정보 로깅
    const finishReason = (response as any).candidates?.[0]?.finishReason || 'unknown';
    const text = response.text || "";
    console.log(`[AG2] 🤖 Gemini 응답 수신 (${text.length}자, finishReason=${finishReason}, ${Date.now() - _t0}ms)`);
    if (text.length < 200) {
      console.log(`[AG2] 🔍 짧은 응답 전문: ${text}`);
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AG2] ❌ JSON 파싱 실패, 응답:', text.slice(0, 300));
      return [];
    }

    // 🔗 JSON 잘림 복구 로직 (Gemini 응답이 잘릴 때 대비)
    let result: any;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.warn('[AG2] ⚠️ JSON 파싱 오류, 복구 시도...');
      result = repairTruncatedJSON(jsonMatch[0]);
      if (!result) {
        console.error('[AG2] ❌ JSON 복구 실패:', (parseError as Error).message);
        return [];
      }
      console.log(`[AG2] ✅ JSON 복구 성공: ${result.places?.length || 0}곳`);
    }

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

/**
 * 잘린 JSON 복구 함수
 * Gemini가 maxOutputTokens에 의해 잘린 JSON을 최대한 복구
 * 
 * 예: {"places":[{"name":"A","reason":"B"},{"name":"C","rea
 * → {"places":[{"name":"A","reason":"B"}]}  (완성된 항목만 추출)
 */
function repairTruncatedJSON(broken: string): { places: any[] } | null {
  try {
    // places 배열 시작 위치 찾기
    const arrStart = broken.indexOf('[');
    if (arrStart === -1) return null;

    // 마지막 완전한 객체 끝 위치 찾기 (마지막 "}," 또는 "}")
    let lastCompleteIdx = -1;
    let braceDepth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = arrStart + 1; i < broken.length; i++) {
      const ch = broken[i];

      if (escapeNext) { escapeNext = false; continue; }
      if (ch === '\\') { escapeNext = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '{') braceDepth++;
      if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          lastCompleteIdx = i;
        }
      }
    }

    if (lastCompleteIdx === -1) return null;

    // 완전한 부분만 추출하여 재조립
    const repaired = broken.substring(0, lastCompleteIdx + 1) + ']}';

    try {
      return JSON.parse(repaired);
    } catch {
      // 한 번 더 시도: 마지막 쉼표 제거
      const cleaned = repaired.replace(/,\s*\]/, ']');
      return JSON.parse(cleaned);
    }
  } catch {
    return null;
  }
}

