/**
 * BTS 미니앱 전용 Gemini AI 서비스
 * 동선 최적화 + 실시간 정보 보강
 */

import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!ai) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      console.warn("[BTS-Gemini] API 키 없음 - 기본 정렬 사용");
      return null;
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export type PlaceForOptimization = {
  id: number;
  name: string;
  category: string;
  priceEur: number | null;
};

export type OptimizedPlace = PlaceForOptimization & {
  suggestedOrder: number;
  startTime: string;
  endTime: string;
  estimatedDuration: string;
  travelTip: string;
};

/**
 * Gemini로 동선 최적화 + 여행 팁 생성
 * API 키가 없거나 실패하면 기본 시간순 배치로 폴백
 */
export async function optimizeBTSRoute(
  cityName: string,
  characterName: string,
  places: PlaceForOptimization[]
): Promise<OptimizedPlace[]> {
  const gemini = getAI();

  // Gemini 없으면 기본 배치
  if (!gemini) {
    return fallbackOptimization(places);
  }

  try {
    const placeList = places
      .map((p, i) => `${i + 1}. ${p.name} (${p.category}, €${p.priceEur ?? "?"})`)
      .join("\n");

    const prompt = `You are a travel route optimizer for ${cityName}.
A "${characterName}" style traveler selected these places:

${placeList}

Optimize the visit order for:
1. Minimal travel time between places
2. Appropriate meal timing (lunch around 12:00-13:00, dinner around 18:00-19:00)
3. Opening hours consideration (museums usually 10-18, restaurants 11-22)

Respond in JSON array format only, no explanation:
[{
  "id": <place id>,
  "suggestedOrder": <1-based order>,
  "startTime": "<HH:MM>",
  "endTime": "<HH:MM>",
  "estimatedDuration": "<e.g. 1.5h>",
  "travelTip": "<one short tip in Korean, max 30 chars>"
}]`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const optimized: Array<{
      id: number;
      suggestedOrder: number;
      startTime: string;
      endTime: string;
      estimatedDuration: string;
      travelTip: string;
    }> = JSON.parse(jsonMatch[0]);

    // 원본 데이터와 합치기
    return optimized
      .sort((a, b) => a.suggestedOrder - b.suggestedOrder)
      .map((opt) => {
        const orig = places.find((p) => p.id === opt.id) || places[0];
        return {
          ...orig,
          suggestedOrder: opt.suggestedOrder,
          startTime: opt.startTime,
          endTime: opt.endTime,
          estimatedDuration: opt.estimatedDuration,
          travelTip: opt.travelTip || "",
        };
      });
  } catch (err) {
    console.warn("[BTS-Gemini] 최적화 실패, 기본 배치 사용:", err);
    return fallbackOptimization(places);
  }
}

/** Gemini 없을 때 기본 시간 배치 */
function fallbackOptimization(places: PlaceForOptimization[]): OptimizedPlace[] {
  const STARTS = ["09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00"];
  const ENDS = ["11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00", "21:30"];

  return places.map((p, i) => ({
    ...p,
    suggestedOrder: i + 1,
    startTime: STARTS[i] || "09:30",
    endTime: ENDS[i] || "21:00",
    estimatedDuration: "1.5h",
    travelTip: "",
  }));
}
