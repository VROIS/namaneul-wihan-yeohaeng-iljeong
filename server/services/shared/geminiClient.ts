/**
 * ⚠️ 수정금지(승인필요) 2026-05-17 = Gemini 단일 진입점 (= 헌법 §16 + SEED_SSOT §18)
 * = 모델 = gemini-3-flash-preview (= 사용자 SSOT "모든 모델 통일" = §18 표준)
 * = temperature 0.2 + maxOutputTokens 50000 + JSON 강제 + thinkingBudget 0
 * = Google Search grounding (= tools) 옵션 = 사용자 SSOT "구글서치/그라운딩 기반"
 * = AI 재발명 차단 = 모든 Gemini 호출 = 이 함수만 통과
 */

import { GoogleGenAI } from "@google/genai";

const MODEL_ID = "gemini-3-flash-preview";
const TEMPERATURE = 0.2;
const MAX_OUTPUT_TOKENS = 50000;

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey =
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      "";
    if (!apiKey)
      throw new Error(
        "Gemini API key missing (AI_INTEGRATIONS_GEMINI_API_KEY or GEMINI_API_KEY)",
      );
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export interface GeminiJsonOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** = 사용자 SSOT (= 2026-05-17) = 구글 서치 그라운딩 활성 (= tools) */
  googleSearch?: boolean;
}

export interface GeminiJsonResult<T = any> {
  raw: string;
  data: T | null;
  finishReason: string;
  parseError?: string;
}

/**
 * JSON 응답 강제 호출.
 * = responseMimeType: application/json + thinkingBudget 0 (= 출력 토큰 잠식 방지)
 * = raw 응답 반환 = 호출자가 검증/파싱 가능
 */
export async function geminiJson<T = any>(
  prompt: string,
  opts?: GeminiJsonOptions,
): Promise<GeminiJsonResult<T>> {
  const config: any = {
    temperature: opts?.temperature ?? TEMPERATURE,
    maxOutputTokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
    responseMimeType: "application/json",
    thinkingConfig: { thinkingBudget: 0 },
  };
  // Google Search grounding (= 사용자 SSOT "구글서치/그라운딩 기반")
  if (opts?.googleSearch) {
    config.tools = [{ googleSearch: {} }];
    // ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = Gemini API 제약 우회
    // = "Tool use with a response mime type: 'application/json' is unsupported" (= INVALID_ARGUMENT)
    // = tools + responseMimeType 동시 호출 X = JSON mime 자동 제거 (= prompt 안 "JSON 만" 강제 + raw 응답 JSON 추출 로직 보유)
    // = 실측 = gemini-2.5-flash-lite + tools + JSON mime = 400 에러 (= 2026-05-26 route 호출 실패)
    delete config.responseMimeType;
  }

  const response = await getAI().models.generateContent({
    model: opts?.model || MODEL_ID,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config,
  });

  const raw = (response as any).text || "";
  const finishReason =
    (response as any).candidates?.[0]?.finishReason || "unknown";

  let data: T | null = null;
  let parseError: string | undefined;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) data = JSON.parse(m[0]) as T;
    else parseError = "no JSON object found in response";
  } catch (e: any) {
    parseError = e.message || String(e);
  }

  return { raw, data, finishReason, parseError };
}
