/**
 * ⚠️ 수정금지(승인필요) 2026-05-17 = Gemini 단일 진입점 (= 헌법 §16 + SEED_SSOT §18)
 * = 모델 = gemini-3-flash-preview (= 사용자 SSOT "모든 모델 통일" = §18 표준)
 * = temperature 0.2 + maxOutputTokens 50000 + JSON 강제 + thinkingBudget 0
 * = Google Search grounding (= tools) 옵션 = 사용자 SSOT "구글서치/그라운딩 기반"
 * = AI 재발명 차단 = 모든 Gemini 호출 = 이 함수만 통과
 */

import { GoogleGenAI } from "@google/genai";
import { saveRaw } from "./save-raw";

const MODEL_ID = "gemini-3-flash-preview";
const TEMPERATURE = 0.2;
const MAX_OUTPUT_TOKENS = 50000;

let ai: GoogleGenAI | null = null;

// ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = #01 = 키 받는 순수 배관(무판단).
//   = 카드(키) 판단은 호출자가 함: 사용자 메인앱(#02·#03·#04·#20) = 키 미전달 → process.env / 관리자 백그라운드(#07·#45) = issueApiKey 출입증 키를 인자로 전달.
//   = 인자 전달 시 매번 새 클라이언트(키 섞임 방지). 미전달 시 env singleton 캐시(기존 동작).
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
  /** = 사용자 SSOT (= 2026-05-17) = 구글 서치 그라운딩 활성 (= tools) */
  googleSearch?: boolean;
  /** ⚠️ raw 저장 맥락 (= shared/save-raw) = cityId(발굴) 또는 미지정→'runtime'(동선·메인앱). + 파일명 태그 */
  contextId?: string | number | null;
  rawTag?: string | null;
  /** ⚠️ 2026-06-20 사장님 SSOT = 출입증 발급 키(관리자 백그라운드 #07·#45). 미전달 시 process.env(사용자 메인앱). = #01 무판단 배관, 카드 판단은 호출자가. */
  apiKey?: string;
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
    // ⚠️ 수정금지(승인필요) 2026-05-26 = Gemini API 제약 우회
    // = "Tool use with a response mime type: 'application/json' is unsupported" (= INVALID_ARGUMENT)
    // = tools + responseMimeType 동시 호출 X = JSON mime 자동 제거
    delete config.responseMimeType;
  }

  const response = await getAI(opts?.apiKey).models.generateContent({
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

  // ⚠️ 외부호출 raw 저장 강제 (= 사용/DB 입력 전 선행) = 발굴·런타임(동선·메인앱) 둘 다 = Supabase Storage. best-effort.
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

  return { raw, data, finishReason, parseError };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT (§12 4단계) = Gemini Vision(이미지 해설) 확장.
// = geminiJson()(텍스트 전용) 은 불변 = 하위호환. Vision 은 이 형제 함수로 = §16 단일 진입점(새 클라이언트 금지) 정합.
// = getAI·saveRaw·키조달 = 기존 코드 재사용. 응답 = 일반 텍스트(해설이니 JSON 아님).
// = 용도: 가이드 미니앱 /api/analyze = 사진 base64 + 페르소나프롬프트 → 여행 해설.
// ═══════════════════════════════════════════════════════════════════════════════

export interface GeminiVisionOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** = 이미지 MIME (기본 image/jpeg). 카메라·갤러리 = jpeg. */
  mimeType?: string;
  /** = 시스템 페르소나 프롬프트(DB prompts 에서 조달). systemInstruction 으로 주입. */
  systemPrompt?: string;
  /** ⚠️ raw 저장 맥락 = 미지정→'runtime'(메인앱). */
  contextId?: string | number | null;
  rawTag?: string | null;
  apiKey?: string;
}

export interface GeminiVisionResult {
  text: string;
  finishReason: string;
}

/**
 * 이미지 + 텍스트 프롬프트 → 해설 텍스트.
 * = base64 이미지를 inlineData 로 파트 구성(geminiJson 의 텍스트 전용 parts 확장).
 * = raw 저장(§18) 강제 = 이미지는 용량 커서 raw 엔 프롬프트·응답만(이미지 제외).
 */
export async function geminiVision(
  imageBase64: string,
  prompt: string,
  opts?: GeminiVisionOptions,
): Promise<GeminiVisionResult> {
  const model = opts?.model || MODEL_ID;
  const config: any = {
    temperature: opts?.temperature ?? TEMPERATURE,
    maxOutputTokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (opts?.systemPrompt) {
    config.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const response = await getAI(opts?.apiKey).models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: opts?.mimeType || "image/jpeg",
              data: imageBase64,
            },
          },
        ],
      },
    ],
    config,
  });

  const text = (response as any).text || "";
  const finishReason =
    (response as any).candidates?.[0]?.finishReason || "unknown";

  // ⚠️ raw 저장(§18) = 이미지 제외(용량) = 프롬프트·페르소나·응답만.
  await saveRaw({
    source: "gemini",
    contextId: opts?.contextId,
    tag: opts?.rawTag || "vision-guide",
    request: {
      prompt,
      systemPrompt: opts?.systemPrompt || null,
      model,
      hasImage: true,
    },
    raw: { parsed: null, text, finishReason },
  });

  return { text, finishReason };
}
