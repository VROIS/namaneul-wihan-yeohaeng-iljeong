/**
 * ⚠️ 수정금지(승인필요) 2026-05-17 = Gemini 단일 진입점 (= 헌법 §16 + SEED_SSOT §18)
 * = 모델 = gemini-3-flash-preview (= 사용자 SSOT "모든 모델 통일" = §18 표준)
 * = temperature 0.2 + maxOutputTokens 50000 + JSON 강제 + thinkingBudget 0
 * = Google Search grounding (= tools) 옵션 = 사용자 SSOT "구글서치/그라운딩 기반"
 * = AI 재발명 차단 = 모든 Gemini 호출 = 이 함수만 통과
 */

import { GoogleGenAI } from "@google/genai";
import { recordExternalCall } from "./external-call-log";
import { saveRaw } from "./save-raw";
import { withQuotaRetry } from "./retry-429"; // 429 재시도 1벌(2026-08-06 사장님 승인 = 런던 121 사고 대응)

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
  /** 2026-08-07 사장님 승인(런던 4씬 복구 식별) = fileData 등 추가 파트(텍스트 앞 배치). 관문 1벌 유지용(§16 = 우회 fetch 금지) */
  extraParts?: any[];
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

  void recordExternalCall({
    provider: "gemini",
    sku: opts?.model ?? "default",
    tag: opts?.rawTag ?? null,
    responseTimeMs: Date.now() - startedAt,
    success: true,
  }); // 2026-08-23 사장님 승인 = 유료호출 카운터, 2026-08-25 = AI 성능 계측 추가
  return { raw, data, finishReason, parseError };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ 수정금지(승인필요) 2026-07-20 사장님 SSOT (§12) = Gemini Vision(이미지 해설) 스트리밍.
// = geminiJson()(텍스트 전용) 은 불변 = 하위호환. Vision 은 이 형제 함수로 = §16 단일 진입점(새 클라이언트 금지) 정합.
// = getAI·saveRaw·키조달 = 기존 코드 재사용. 응답 = 일반 텍스트 청크(해설이니 JSON 아님).
// = 용도: 가이드 미니앱 POST /api/gemini = 사진 base64 + 페르소나프롬프트 → 여행 해설 스트리밍.
//   (옛 geminiVision 비스트리밍 삭제 = 2026-07-20 §19)
// ═══════════════════════════════════════════════════════════════════════════════

export interface GeminiVisionStreamOptions {
  /** = 시스템 페르소나(DB prompts 조달) = 원본 systemInstruction 그대로 주입. */
  systemInstruction?: string;
  /** ⚠️ raw 저장 맥락 = 미지정→'runtime'(메인앱). */
  contextId?: string | number | null;
  rawTag?: string | null;
  apiKey?: string;
}

/**
 * ⚠️ 수정금지(승인필요) 2026-07-20 사장님 SSOT = 가이드 미니앱 해설 스트리밍.
 * = 검증된 레거시 원본(내손안에 가이드 server/routes.ts /api/gemini)의 파라미터 그대로:
 *   이미지 파트 먼저 → 텍스트 파트, thinkingBudget 0, temperature 0.5,
 *   maxOutputTokens 800, topP 0.8, topK 20 (= 현장 테스트로 확정된 값 = 변경 금지).
 * = 청크 텍스트를 그대로 yield = 호출자(guide-routes)가 res.write 로 흘려보냄.
 * = raw 저장(§18) = 스트림 종료 후 전체 조립 텍스트 저장(이미지는 용량 제외).
 */
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

  // ⚠️ 튜닝값 = 원본 그대로. 단 @google/genai v1.34 는 config 최상위(평면)만 읽음
  //   (중첩 generationConfig = SDK 가 통째로 폐기 = §22 검증 에이전트 node_modules 실측) = 평면 기재.
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
    // ⚠️ 2026-08-06 = 스트림 "생성" 호출만 재시도(첫 바이트 전 = 안전). 스트림 도중 오류는 재시도 불가(이미 흘려보냄).
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
