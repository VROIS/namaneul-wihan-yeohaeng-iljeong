// ⚠️ 수정금지(승인필요) 2026-05-25 = 사용자 SSOT = Gemini 호출 + 응답 파싱 단일 진입점
// = 헌법 §16 = geminiClient 단일 진입점 통과 (= 재발명 차단)
// = 표준 prompt (= scenario-prompt.ts) 호출 → ScenarioResponse 반환

import type { AG1Output, PlaceResult } from "../agents/types";
import { geminiJson } from "../shared/geminiClient";
import { generateScenarioPrompt } from "./scenario-prompt";
import type { ScenarioHandlerResult, ScenarioResponse } from "./scenario-types";

/**
 * Gemini 호출 옵션 = 표준 prompt _call-config 와 동일
 * = model gemini-3-flash-preview / temperature 0.3 / maxOutputTokens 50000
 * = googleSearch grounding 활성 (= 한국 인기 식당 + Google Maps 좌표)
 */
const SCENARIO_TEMPERATURE = 0.3;
const SCENARIO_MAX_OUTPUT_TOKENS = 50000;

/**
 * 메인 = 표준 prompt 호출 + 응답 파싱 (= 양 path 공용 = DB-only 통합)
 */
export async function handleScenarioRequest(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: { lat: number; lng: number } | undefined,
): Promise<ScenarioHandlerResult> {
  const t0 = Date.now();
  const { prompt } = generateScenarioPrompt(skeleton, places, cityCoords);

  try {
    const result = await geminiJson<ScenarioResponse>(prompt, {
      temperature: SCENARIO_TEMPERATURE,
      maxOutputTokens: SCENARIO_MAX_OUTPUT_TOKENS,
      googleSearch: true,
    });
    const elapsedMs = Date.now() - t0;

    if (!result.data) {
      console.warn(
        `[Scenario] ⚠️ Gemini 응답 파싱 실패 (${elapsedMs}ms): ${result.parseError}`,
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
      `[Scenario] ✅ Gemini 응답 (${elapsedMs}ms): ${daysCount}일 × ${scenesCount}씬`,
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
      `[Scenario] ❌ Gemini 호출 실패 (${elapsedMs}ms):`,
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
