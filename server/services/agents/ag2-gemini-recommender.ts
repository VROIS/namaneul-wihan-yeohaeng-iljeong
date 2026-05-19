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
import type { AG1Output, PlaceResult, SeedCategory } from './types';
import { MEAL_BUDGET } from './types';
import {
  formatSentimentForPrompt,
} from '../korean-sentiment-service';
import {
  generateProtagonistSentence,
  generatePromptContext,
} from '../protagonist-generator';
// ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 의도 = AG2 데이터 출처 = place_seed_raw 우선
import { db } from '../../db';
import { placeSeedRaw } from '@shared/schema';
import { eq, and, between, desc, sql } from 'drizzle-orm';
import { findCityUnified } from '../city-resolver';

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
 * ⚠️ 수정금지(승인필요) 2026-05-07 = 사용자 명시 = 도시 입력 시점 분기 (백엔드만)
 * 도시 ready 판정 = 발굴 도시인지 미발굴 도시인지
 * = 발굴 (= place_seed_raw phase='gemini3-2026-05' rank 1-20 ≥ 70 행) → DB-only 경로
 * = 미발굴 → Gemini + Google fallback + auto-learn 저장 (= Geneva 패턴)
 *
 * 임계값 70 = 7 카테고리 × 10 = 사용자 합의 = 충분 기준
 * 프론트 UI 노출 X (= 사용자 명시 = 별도 안내 페이지 존재)
 */
const READY_THRESHOLD = 70;

export async function isCityReady(destination: string): Promise<{
  ready: boolean;
  cityId: number | null;
  cityName: string;
  count: number;
}> {
  if (!db) return { ready: false, cityId: null, cityName: destination, count: 0 };

  const cityResult = await findCityUnified(destination);
  const cityId = cityResult?.cityId;
  if (!cityId) {
    return { ready: false, cityId: null, cityName: destination, count: 0 };
  }

  const countRows = await db.select({
    count: sql<number>`COUNT(*)::int`,
  }).from(placeSeedRaw).where(and(
    eq(placeSeedRaw.cityId, cityId),
    eq(placeSeedRaw.collectionPhase, 'gemini3-2026-05'),
    between(placeSeedRaw.rank, 1, 20),
  ));
  const count = Number(countRows[0]?.count || 0);
  return {
    ready: count >= READY_THRESHOLD,
    cityId,
    cityName: cityResult.name,
    count,
  };
}

/**
 * ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 결정
 * AG2-DB: place_seed_raw 직접 SELECT (= 외부 API 호출 0)
 * = 발굴 도시 (= top 20 phase=gemini3-2026-05) 만 = 0.1초 + 0 비용
 * = 미발굴 도시 = null 반환 = Gemini fallback
 */
const VIBE_PRIMARY_CATEGORY: Record<string, string> = {
  Foodie: 'restaurant',
  Healing: 'healing',
  Hotspot: 'hotspot',
  Adventure: 'adventure',
  Romantic: 'hotspot',
  Culture: 'heritage',
};

async function fetchFromPlaceSeedRaw(skeleton: AG1Output): Promise<PlaceResult[] | null> {
  const _t0 = Date.now();
  const { formData, vibeWeights, requiredPlaceCount } = skeleton;
  if (!db) return null;

  // 도시 매칭
  const cityResult = await findCityUnified(formData.destination);
  const cityId = cityResult?.cityId;
  if (!cityId) {
    console.log(`[AG2-DB] 도시 "${formData.destination}" 미발견 = Gemini fallback`);
    return null;
  }

  // vibe → 카테고리 슬롯 분배
  const totalSlots = requiredPlaceCount;
  const catSlots: Record<string, number> = {};
  for (const vw of vibeWeights) {
    const primary = VIBE_PRIMARY_CATEGORY[vw.vibe] || 'attraction';
    catSlots[primary] = (catSlots[primary] || 0) + vw.weight * totalSlots;
  }
  // ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 SSOT = 식당 = 2/일자 cap (= 점심 1 + 저녁 1)
  // = AG4 MEAL_SLOTS = lunch (12~14) + dinner (18~20) 만 식당 slot 인식
  // = 초과 식당 = 일반 slot 으로 강제 변환 = 저녁 2번 사고 발생 → 식당 자체 cap 필요
  const dayCount = skeleton.dayCount || skeleton.daySlotsConfig?.length || 3;
  const restaurantCap = dayCount * 2; // = 점심 + 저녁
  if (!catSlots.restaurant || catSlots.restaurant < dayCount) {
    catSlots.restaurant = Math.min(restaurantCap, Math.ceil(totalSlots * 0.4));
  }
  // 식당 cap 적용 (= 초과 분 = 비식당 으로 재분배)
  if (catSlots.restaurant > restaurantCap) {
    const overflow = catSlots.restaurant - restaurantCap;
    catSlots.restaurant = restaurantCap;
    // 다른 카테고리 비율로 재분배
    const nonRest = Object.keys(catSlots).filter(k => k !== 'restaurant');
    const nonRestTotal = nonRest.reduce((s, k) => s + (catSlots[k] || 0), 0) || 1;
    for (const k of nonRest) {
      catSlots[k] = (catSlots[k] || 0) + overflow * (catSlots[k] / nonRestTotal);
    }
  }
  // 비식당 비율 재조정 (= 식당 정해진 후, 나머지 = 사용자 vibe 비율 따름)
  const nonRest = Object.keys(catSlots).filter(k => k !== 'restaurant');
  const nonRestSum = nonRest.reduce((s, k) => s + (catSlots[k] || 0), 0);
  const targetNonRest = totalSlots - catSlots.restaurant;
  if (nonRestSum > 0) {
    for (const k of nonRest) {
      catSlots[k] = Math.round(((catSlots[k] || 0) / nonRestSum) * targetNonRest);
    }
  }
  // 정수화 + 합계 보정
  for (const k of Object.keys(catSlots)) catSlots[k] = Math.max(1, Math.round(catSlots[k]));
  const sum = Object.values(catSlots).reduce((s, n) => s + n, 0);
  if (sum !== totalSlots) {
    const top = Object.entries(catSlots).sort((a, b) => b[1] - a[1])[0][0];
    catSlots[top] += (totalSlots - sum);
  }

  console.log(`[AG2-DB] 도시 "${cityResult.name}" (id=${cityId}) 카테고리 슬롯:`, catSlots);

  // ⚠️ 수정금지(승인필요) 2026-05-19 = budget 매트릭스 (= 4:6 split)
  // 식당 = travelStyle MEAL_BUDGET tier 별 price_eur 범위로 필터 = rank 제한 X
  // 비식당 = rank 1-20 유지 (= FE 우선 노출 순위)
  const budgetTier = MEAL_BUDGET[formData.travelStyle];
  console.log(`[AG2-DB] travelStyle=${formData.travelStyle} = price €${budgetTier.min}-${budgetTier.max} (lunch ≤€${budgetTier.lunch} / dinner ≤€${budgetTier.dinner})`);

  // place_seed_raw 카테고리별 SELECT
  const allRows: any[] = [];
  try {
    for (const [cat, slots] of Object.entries(catSlots)) {
    if (slots <= 0) continue;
    const isRestaurant = cat === 'restaurant';
    const baseWhere = [
      eq(placeSeedRaw.cityId, cityId),
      eq(placeSeedRaw.collectionPhase, 'gemini3-2026-05'),
      eq(placeSeedRaw.seedCategory, cat),
    ];
    // 식당 = budget tier 필터 / 비식당 = rank 1-20
    if (isRestaurant) {
      baseWhere.push(between(placeSeedRaw.priceEur, budgetTier.min, budgetTier.max));
    } else {
      baseWhere.push(between(placeSeedRaw.rank, 1, 20));
    }
    const rows = await db.select({
      id: placeSeedRaw.id,
      nameEn: placeSeedRaw.nameEn,
      nameKo: placeSeedRaw.nameKo,
      googlePlaceId: placeSeedRaw.googlePlaceId,
      address: placeSeedRaw.address,
      latitude: placeSeedRaw.latitude,
      longitude: placeSeedRaw.longitude,
      imageUrl: placeSeedRaw.imageUrl,
      summaryKo: placeSeedRaw.summaryKo,
      editorialSummary: placeSeedRaw.editorialSummary,
      seedCategory: placeSeedRaw.seedCategory,
      rank: placeSeedRaw.rank,
      googleReviewCount: placeSeedRaw.googleReviewCount,
      priceEur: placeSeedRaw.priceEur,
      dayZone: placeSeedRaw.dayZone,
      distanceKmFromCenter: placeSeedRaw.distanceKmFromCenter,
    // ⚠️ 수정금지(승인필요) 2026-05-19 = 식당 = userRatingCount DESC (= 사용자 SSOT feedback_place_api_verified_pattern) / 비식당 = rank
    }).from(placeSeedRaw).where(and(...baseWhere))
      .orderBy(isRestaurant ? desc(placeSeedRaw.googleReviewCount) : placeSeedRaw.rank)
      .limit(slots);
    console.log(`[AG2-DB] ${cat}: ${rows.length}/${slots} 행${isRestaurant ? ` (budget €${budgetTier.min}-${budgetTier.max})` : ''}`);
    allRows.push(...rows);
  }
  } catch (e: any) {
    console.error(`[AG2-DB] ❌ SELECT 실패:`, e.message);
    return null;
  }

  // 충분 검증 = 80% 이상 채워야 사용 (= 부족 시 Gemini fallback)
  if (allRows.length < totalSlots * 0.8) {
    console.log(`[AG2-DB] 부족 (${allRows.length}/${totalSlots}) = Gemini fallback`);
    return null;
  }

  // PlaceResult 형식 변환 (= AG3 호환)
  const places: PlaceResult[] = allRows.map((r: any, i: number) => {
    const isFood = r.seedCategory === 'restaurant';
    return {
      id: `db-${r.id}`,
      name: r.nameEn || '',
      geminiPlaceId: r.googlePlaceId || '',
      geminiAddress: r.address || '',
      description: r.summaryKo || r.editorialSummary || '',
      lat: parseFloat(String(r.latitude)) || 0,
      lng: parseFloat(String(r.longitude)) || 0,
      vibeScore: 8,
      confidenceScore: 9,
      sourceType: "DB Direct (Place Seed Raw)",
      personaFitReason: r.summaryKo || '',
      tags: isFood ? ['restaurant', 'food'] : [],
      vibeTags: isFood ? ['Foodie' as const] : [],
      image: r.imageUrl || '',
      priceEstimate: r.priceEur ? `€${r.priceEur}` : '',
      estimatedPriceEur: r.priceEur ?? undefined,
      seedCategory: r.seedCategory as SeedCategory,
      placeTypes: isFood ? ['restaurant'] : [],
      recommendedTime: 'afternoon',
      city: formData.destination,
      region: '',
      koreanPopularityScore: 0,
      googleMapsUrl: r.googlePlaceId ? `https://maps.google.com/?cid=${r.googlePlaceId}` : '',
      // AG4 동선 최적화에 필요한 추가 정보
      userRatingCount: r.googleReviewCount || 0,
    } as any;
  });
  console.log(`[AG2-DB] ✅ DB 직접 = ${places.length}곳 (${Date.now() - _t0}ms, Gemini X, Google X)`);
  return places;
}

/**
 * AG2 메인: 간소화된 Gemini 프롬프트로 장소 추천
 *
 * 기존 대비 변경점:
 * 1. 좌표(lat/lng) 요청 제거 → AG3에서 DB 매칭으로 확보
 * 2. vibeScore, tags 등 메타데이터 제거 → AG3에서 계산
 * 3. 역할별(아침/점심/오후/저녁) 2~3곳만 이름+이유 요청
 * 4. 응답 크기 80% 축소 → API 응답 시간 대폭 단축
 *
 * ⚠️ 수정금지(승인필요) 2026-05-06: place_seed_raw 우선 = 발굴 도시 = 0 비용
 */
export async function generateRecommendations(skeleton: AG1Output): Promise<PlaceResult[]> {
  // ⚠️ 수정금지(승인필요) 2026-05-07 = 사용자 명시 = 도시 입력 시점 명시 분기
  // = 진입 즉시 ready 판정 → 분기 결정 (= 데이터 검증 후 결정 X = 의도 명확화)
  const cityCheck = await isCityReady(skeleton.formData.destination);
  if (cityCheck.ready) {
    console.log(`[AG2] ✅ city='${cityCheck.cityName}' (id=${cityCheck.cityId}) ready=true (${cityCheck.count} rows ≥ ${READY_THRESHOLD}) → DB-only 경로`);
    // 1. DB 우선 시도 (= 발굴 도시 = 외부 API 호출 0)
    const dbResults = await fetchFromPlaceSeedRaw(skeleton);
    if (dbResults && dbResults.length >= skeleton.requiredPlaceCount * 0.8) {
      return dbResults;
    }
    console.log('[AG2] ⚠ ready=true 였으나 카테고리별 데이터 부족 → Gemini fallback (예외)');
  } else {
    console.log(`[AG2] ⚠ city='${cityCheck.cityName}' ready=false (${cityCheck.count} rows < ${READY_THRESHOLD}) → Gemini fallback (Geneva 패턴, auto-learn 저장 예정)`);
  }

  // 2. Fallback = Gemini (= 미발굴 도시 또는 DB 부족)
  console.log('[AG2] DB 충분 X → Gemini fallback 시작');
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

  // ⚠️ 수정금지(승인필요) 사용자 의도 = name + place_id + address 추가 매칭 정확도 향상
  // 🔗 사용자 입력 도시 반경 100km 내외: Place Seed·AG3 매칭 범위와 동일하게 제한
  const prompt = `Recommend exactly ${slotCount} real places in ${formData.destination} for Korean tourists.
Important: Only recommend places within about 100km radius of the destination city (city center + suburbs). This matches our data coverage.
Need: ${activityCount} attractions + ${foodCount} restaurants/cafes. Vibes: ${vibeDescription}. Group: ${formData.companionType} ${formData.companionCount}pax.

Respond ONLY with this JSON (no markdown):
{"places":[{"name":"Official English name on Google Maps","place_id":"Google Maps Place ID if you know it (else null)","address":"FULL street address with NUMBER + street + postal code + city (e.g. '15 Rue Robert de Flers, 75015 Paris'). NEVER use postal-code-only or vague addresses.","reason":"Korean 1-line reason","isFood":false}]}

Example (Paris): {"places":[{"name":"Eiffel Tower","place_id":"ChIJLU7jZClu5kcR4PcOOO6p3I0","address":"Champ de Mars, 5 Av. Anatole France, 75007 Paris","reason":"파리 필수 랜드마크, 야경 명소","isFood":false},{"name":"Le Bouillon Chartier","place_id":"ChIJq0iVeyhu5kcR3Kn31xC9ZSo","address":"7 Rue du Faubourg Montmartre, 75009 Paris","reason":"100년 전통 파리 맛집, 가성비 최고","isFood":true}]}`;

  try {
    console.log(`[AG2] 🤖 Gemini에 ${slotCount}곳 요청 (간소화 프롬프트 ${prompt.length}자)...`);

    const response = await getAI().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 8192, // ⚠️ 수정금지(승인필요) 4096 → 8192 = place_id+address 추가로 잘림 방지
        responseMimeType: "application/json",
        // ⚠️ 수정금지(승인필요) 2026-05-06 thinking 비활성 = output 토큰 보호
        // = Gemini 2.5 Flash thinking 이 출력 토큰 잠식 = MAX_TOKENS 잘림 사고 방지
        thinkingConfig: { thinkingBudget: 0 } as any,
      } as any,
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

    // ⚠️ 수정금지(승인필요) place_id + address 추가 매핑 (AG3 매칭에 사용)
    // 간소화된 응답 → PlaceResult 변환 (좌표는 AG3에서 DB 매칭으로 확보)
    return placesRaw
      .filter((p: any) => p.name)
      .map((place: any, index: number) => ({
        id: `gemini-v2-${Date.now()}-${index}`,
        name: place.name,
        // 🔗 사용자 의도: AG3 가 4-단계 매칭에 사용 (place_id 우선, 그다음 address)
        geminiPlaceId: place.place_id && place.place_id !== 'null' ? place.place_id : '',
        geminiAddress: place.address || '',
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

