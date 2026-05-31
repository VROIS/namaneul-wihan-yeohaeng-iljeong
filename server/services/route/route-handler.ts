// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = Gemini 호출 + 응답 파싱 단일 진입점 (= 동선 전용)
// = 헌법 §16 = geminiClient 단일 진입점 통과 (= 재발명 차단)
// = 표준 prompt (= route-prompt.ts) 호출 → RouteResponse 반환

import type { AG1Output, PlaceResult } from "../agents/types";
import { geminiJson } from "../shared/geminiClient";
import { generateRoutePrompt } from "./route-prompt";
import type { RouteHandlerResult, RouteResponse } from "./route-types";

/**
 * ⚠️ 수정금지(승인필요) 2026-05-31 = 사용자 SSOT = route 모델 = gemini-3-flash-preview
 * = 3 모델 실측 벤치 (= 2026-05-31) 결과:
 *   - gemini-2.5-flash-lite: 8.7초 / 파싱 OK / 카피 밋밋 (= 설명조)
 *   - gemini-2.5-flash: 185초 / 파싱 실패 = 탈락
 *   - gemini-3-flash-preview: 8.9초 / 파싱 OK / 카피 위트 (= 시드 톤 재현) ← 채택
 * = 속도 = lite 와 0.2초 차 (= 무의미) + 카피 위트 + tools+mime 동시 가능 (= 파싱 안정)
 * = 시드 발굴 (= _call-config.md) 과 동일 모델 = 카피 톤 통일 (= "프사각/본전 뽑음" 위트)
 * = temperature 0.3 / maxOutputTokens 50000 (= 표준 prompt _call-config 동일)
 */
const ROUTE_MODEL_ID = "gemini-3-flash-preview";
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
    // ⚠️ 2026-05-26 디버깅 = scenario raw 응답 출력 (= 사용자 검증)
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
