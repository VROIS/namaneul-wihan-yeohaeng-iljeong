/** ⚠️ 수정금지(승인필요) 2026-05-17 = Gemini 단일 진입점 (= 헌법 §16 + SEED_SSOT §18) */
/** = 모델 = gemini-3-flash-preview (= 사용자 SSOT "모든 모델 통일" = §18 표준) */

import { GoogleGenAI } from "@google/genai";
import { recordExternalCall } from "./external-call-log";
import { saveRaw } from "./save-raw";
import { withQuotaRetry } from "./retry-429"; // 429 재시도 1벌(2026-08-06 사장님 승인 = 런던 121 사고 대응)

const MODEL_ID = "gemini-3-flash-preview";
const TEMPERATURE = 0.2;
const MAX_OUTPUT_TOKENS = 50000;

let ai: GoogleGenAI | null = null;

// ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = #01 = 키 받는 순수 배관(무판단).
function getAI(apiKey?: string): GoogleGenAI {
  if (apiKey) return new GoogleGenAI({ apiKey });
  if (!ai) {
    const envKey =
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      "";
    if (!envKey)
      throw new Error(
        "Gemini API key missing (AI_INTEGRATIONS_GEMINI_API_KEY or GEMINI_API_KEY)",
      );
    ai = new GoogleGenAI({ apiKey: envKey });
  }
  return ai;
}

export interface GeminiJsonOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  googleSearch?: boolean;
  contextId?: string | number | null;
  rawTag?: string | null;
  /** ⚠️ 2026-06-20 사장님 SSOT = 출입증 발급 키(관리자 백그라운드 #07·#45). 미전달 시 process.env(사용자 메인앱). = #01 무판단 배관, 카드 판단은 호출자가. */
  apiKey?: string;
  /** 2026-08-07 사장님 승인(런던 4씬 복구 식별) = fileData 등 추가 파트(텍스트 앞 배치). 관문 1벌 유지용(§16 = 우회 fetch 금지) */
  extraParts?: any[];
}

export interface GeminiJsonResult<T = any> {
  raw: string;
  data: T | null;
  finishReason: string;
  parseError?: string;
}

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
  if (opts?.googleSearch) {
    config.tools = [{ googleSearch: {} }];
    // ⚠️ 수정금지(승인필요) 2026-05-26 = Gemini API 제약 우회
    delete config.responseMimeType;
  }

  // ⚠️ 2026-08-25 사장님 승인 = AI 성능(관제탑) 계측 = 시작시각 찍고, 실패해도 기록 후 그대로 throw(기존 에러 처리 불변).
  const startedAt = Date.now();
  let response: any;
  try {
    // ⚠️ 2026-08-06 = 429 재시도(1→2→4→8초) = 여정생성 직후 스토리보드 연속 호출 같은 스파이크 흡수(사장님 승인).
    response = await withQuotaRetry(
      () =>
        getAI(opts?.apiKey).models.generateContent({
          model: opts?.model || MODEL_ID,
          contents: [
            {
              role: "user",
              parts: [...(opts?.extraParts || []), { text: prompt }],
            },
          ],
          config,
        }),
      { label: `gemini-json:${opts?.rawTag || "call"}` },
    );
  } catch (err: any) {
    void recordExternalCall({
      provider: "gemini",
      sku: opts?.model ?? "default",
      tag: opts?.rawTag ?? null,
      responseTimeMs: Date.now() - startedAt,
      success: false,
      errorMessage: err?.message || String(err),
    });
    throw err;
  }

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

  await saveRaw({
    source: "gemini",
    contextId: opts?.contextId,
    tag: opts?.rawTag || (opts?.googleSearch ? "grounded" : "json"),
    request: {
      prompt,
      model: opts?.model || MODEL_ID,
      googleSearch: !!opts?.googleSearch,
    },
    // ⚠️ 2026-06-16 사장님 SSOT = parsed(객체)도 저장 = pretty 들여쓰기 먹어 사장님이 원본 눈으로 검수 가능(= text 통짜문자열 한 줄 = 읽기 불가 해소).
    raw: { parsed: data ?? null, text: raw, finishReason },
  });

  void recordExternalCall({
    provider: "gemini",
    sku: opts?.model ?? "default",
    tag: opts?.rawTag ?? null,
    responseTimeMs: Date.now() - startedAt,
    success: true,
  }); // 2026-08-23 사장님 승인 = 유료호출 카운터, 2026-08-25 = AI 성능 계측 추가
  return { raw, data, finishReason, parseError };
}

// ⚠️ 수정금지(승인필요) 2026-07-20 사장님 SSOT (§12) = Gemini Vision(이미지 해설) 스트리밍.

export interface GeminiVisionStreamOptions {
  systemInstruction?: string;
  contextId?: string | number | null;
  rawTag?: string | null;
  apiKey?: string;
}

/** ⚠️ 수정금지(승인필요) 2026-07-20 사장님 SSOT = 가이드 미니앱 해설 스트리밍. */
/** = raw 저장(§18) = 스트림 종료 후 전체 조립 텍스트 저장(이미지는 용량 제외). */
export async function* geminiVisionStream(
  base64Image: string | null,
  prompt: string,
  opts?: GeminiVisionStreamOptions,
): AsyncGenerator<string> {
  const parts: any[] = [];
  if (base64Image) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
  }
  if (prompt && prompt.trim() !== "") {
    parts.push({ text: prompt });
  }

  const config: any = {
    systemInstruction: opts?.systemInstruction,
    thinkingConfig: { thinkingBudget: 0 },
    temperature: 0.5,
    maxOutputTokens: 800,
    topP: 0.8,
    topK: 20,
  };

  // ⚠️ 2026-08-25 사장님 승인 = AI 성능(관제탑) 계측 = 시작시각 찍고, 스트림 시작/도중 실패해도 기록 후 그대로 throw(기존 에러 처리 불변).
  const startedAt = Date.now();
  let fullText = "";
  let finishReason = "stream-end";
  try {
    const responseStream = await withQuotaRetry(
      () =>
        getAI(opts?.apiKey).models.generateContentStream({
          model: MODEL_ID,
          contents: { parts },
          config,
        }),
      { label: `gemini-vision:${opts?.rawTag || "guide"}` },
    );

    for await (const chunk of responseStream) {
      const fr = (chunk as any).candidates?.[0]?.finishReason;
      if (fr) finishReason = fr;
      const text = (chunk as any).text;
      if (text) {
        fullText += text;
        yield text;
      }
    }
  } catch (err: any) {
    void recordExternalCall({
      provider: "gemini",
      sku: MODEL_ID,
      tag: opts?.rawTag ?? "guide-gemini",
      responseTimeMs: Date.now() - startedAt,
      success: false,
      errorMessage: err?.message || String(err),
    });
    throw err;
  }

  void recordExternalCall({
    provider: "gemini",
    sku: MODEL_ID,
    tag: opts?.rawTag ?? "guide-gemini",
    responseTimeMs: Date.now() - startedAt,
    success: true,
  });

  await saveRaw({
    source: "gemini",
    contextId: opts?.contextId,
    tag: opts?.rawTag || "guide-gemini",
    request: {
      prompt,
      systemInstruction: opts?.systemInstruction || null,
      model: MODEL_ID,
      hasImage: !!base64Image,
    },
    raw: { parsed: null, text: fullText, finishReason },
  });
}
