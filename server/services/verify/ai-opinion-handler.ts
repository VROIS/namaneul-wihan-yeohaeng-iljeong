// ⚠️ 2026-07-03 사장님 SSOT = "AI 의견" 기능 = Gemini 호출 단일 진입점(route-handler.ts 구조 복제, 원본 미수정).
// = 헌법 §16 = geminiClient 단일 진입점 통과 (재발명 차단)

import { geminiJson } from "../shared/geminiClient";
import { generateAiOpinionPrompt, type AiOpinionInput } from "./ai-opinion-prompt";

const AI_OPINION_MODEL_ID = "gemini-3-flash-preview";
const AI_OPINION_TEMPERATURE = 0.2;
const AI_OPINION_MAX_OUTPUT_TOKENS = 50000;

// ⚠️ 2026-07-03 사장님 SSOT = 가격 검증 = 일자별 1인당 대중교통비+식비+입장료 합산(가장 민감한 항목)
export interface AiOpinionDailyPrice {
  day: number;
  transport_eur: number;
  meals_eur: number;
  entrance_eur: number;
  total_eur: number;
}

// ⚠️ 2026-07-03 사장님 SSOT = 동적 콘텐츠 다국어 대응 = 필드명은 언어중립(_ko 제거), 값 안 텍스트만 요청 언어로.
export interface AiOpinionResponse {
  feasibility: { verdict: "ok" | "caution" | "risky"; reason: string };
  route_review: { issues: string[]; optimization: string[] };
  price_check: { daily: AiOpinionDailyPrice[]; total_est_eur: number };
  cautions: string[];
}

export interface AiOpinionHandlerResult {
  ok: boolean;
  response: AiOpinionResponse | null;
  finishReason: string;
  elapsedMs: number;
  parseError?: string;
}

/**
 * 메인 = AI 의견 프롬프트 조립 + geminiJson 호출 + 파싱
 */
export async function handleAiOpinionRequest(
  input: AiOpinionInput,
): Promise<AiOpinionHandlerResult> {
  const t0 = Date.now();
  const prompt = generateAiOpinionPrompt(input);

  try {
    const result = await geminiJson<AiOpinionResponse>(prompt, {
      model: AI_OPINION_MODEL_ID,
      temperature: AI_OPINION_TEMPERATURE,
      maxOutputTokens: AI_OPINION_MAX_OUTPUT_TOKENS,
      googleSearch: true,
      rawTag: "ai-opinion",
      contextId: "runtime",
    });
    const elapsedMs = Date.now() - t0;

    if (!result.data) {
      console.warn(`[AiOpinion] ⚠️ Gemini 응답 파싱 실패 (${elapsedMs}ms): ${result.parseError}`);
      return {
        ok: false,
        response: null,
        finishReason: result.finishReason,
        elapsedMs,
        parseError: result.parseError,
      };
    }

    console.log(`[AiOpinion] ✅ Gemini 응답 (${elapsedMs}ms): verdict=${result.data.feasibility?.verdict}`);

    return {
      ok: true,
      response: result.data,
      finishReason: result.finishReason,
      elapsedMs,
    };
  } catch (e: any) {
    const elapsedMs = Date.now() - t0;
    console.error(`[AiOpinion] ❌ Gemini 호출 실패 (${elapsedMs}ms):`, e?.message || e);
    return {
      ok: false,
      response: null,
      finishReason: "error",
      elapsedMs,
      parseError: e?.message || String(e),
    };
  }
}
