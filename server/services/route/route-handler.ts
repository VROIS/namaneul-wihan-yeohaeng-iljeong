// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = Gemini 호출 + 응답 파싱 단일 진입점 (= 동선 전용)
// = 헌법 §16 = geminiClient 단일 진입점 통과 (= 재발명 차단)
// = 표준 prompt (= route-prompt.ts) 호출 → RouteResponse 반환

import type { AG1Output, PlaceResult } from "../agents/types";
import { geminiJson } from "../shared/geminiClient";
import { generateRoutePrompt } from "./route-prompt";
import type { RouteHandlerResult, RouteResponse } from "./route-types";

/**
 * Gemini 호출 옵션 = route 전용 model (= 사용자 SSOT 2026-05-26)
 * = model gemini-2.5-flash-lite (= 가격 입력 $0.10 / 출력 $0.40 / 1M tokens = 가장 저렴)
 * = grounding 무료 한도 일 1,500 RPD (= 월 약 45,000 = 풍부)
 * = Google Search + Google Maps grounding GA 지원 (= gemini-3-flash-preview 한도 5,000/월 공유 대비 9 배)
 * = temperature 0.3 / maxOutputTokens 50000 (= 표준 prompt _call-config 동일)
 */
const ROUTE_MODEL_ID = "gemini-2.5-flash-lite";
const ROUTE_TEMPERATURE = 0.3;
const ROUTE_MAX_OUTPUT_TOKENS = 50000;

/**
 * 메인 = 표준 prompt 호출 + 응답 파싱 (= DB-only path AG4 안 호출)
 */
export async function handleRouteRequest(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: { lat: number; lng: number } | undefined,
): Promise<RouteHandlerResult> {
  const t0 = Date.now();
  const { prompt } = generateRoutePrompt(skeleton, places, cityCoords);

  try {
    const result = await geminiJson<RouteResponse>(prompt, {
      model: ROUTE_MODEL_ID,
      temperature: ROUTE_TEMPERATURE,
      maxOutputTokens: ROUTE_MAX_OUTPUT_TOKENS,
      googleSearch: true,
    });
    const elapsedMs = Date.now() - t0;

    if (!result.data) {
      console.warn(
        `[Route] ⚠️ Gemini 응답 파싱 실패 (${elapsedMs}ms): ${result.parseError}`,
      );
      return {
        ok: false,
        response: null,
        raw: result.raw,
        finishReason: result.finishReason,
        elapsedMs,
        parseError: result.parseError,
      };
    }

    const daysCount = result.data.days?.length || 0;
    const scenesCount = (result.data.days || []).reduce(
      (s, d) => s + (d.scenes?.length || 0),
      0,
    );
    console.log(
      `[Route] ✅ Gemini 응답 (${elapsedMs}ms): ${daysCount}일 × ${scenesCount}씬`,
    );

    return {
      ok: true,
      response: result.data,
      raw: result.raw,
      finishReason: result.finishReason,
      elapsedMs,
    };
  } catch (e: any) {
    const elapsedMs = Date.now() - t0;
    console.error(
      `[Route] ❌ Gemini 호출 실패 (${elapsedMs}ms):`,
      e?.message || e,
    );
    return {
      ok: false,
      response: null,
      raw: "",
      finishReason: "error",
      elapsedMs,
      parseError: e?.message || String(e),
    };
  }
}
