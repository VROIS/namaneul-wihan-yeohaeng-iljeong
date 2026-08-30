// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = Gemini 호출 + 응답 파싱 단일 진입점 (= 동선 전용)

import type { AG1Output, PlaceResult } from "../agents/types";
import { geminiJson } from "../shared/geminiClient";
import { generateRoutePrompt } from "./route-prompt";
import type { RouteHandlerResult, RouteResponse } from "./route-types";

/** ⚠️ 수정금지(승인필요) 2026-05-31 = 사용자 SSOT = route 모델 = gemini-3-flash-preview */
const ROUTE_MODEL_ID = "gemini-3-flash-preview";
const ROUTE_TEMPERATURE = 0.3;
const ROUTE_MAX_OUTPUT_TOKENS = 50000;

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
    console.log(
      `[Route] 🔍 RAW response:`,
      JSON.stringify(result.data, null, 2).slice(0, 12000),
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
