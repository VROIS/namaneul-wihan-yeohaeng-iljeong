// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = DB-only 전용 파이프라인 (= 단계 4)
// = AG1 → AG2-DB → AG4-DB (= scenario.scenes 직접 사용)
// = 옛 AG3 processDbOnly + _enrichmentPipeline.runFullEnrichment (= 슬롯 강제 분배) = 폐기
// = scenario 실패 시만 = AG4 안 fallback 에서 옛 코드 호출 (= 안전망)
// = MIX 경로 (= pipeline-v3.ts runPipelineMix) = 별도 보존 = 옛 코드 사용

import type { TripFormData } from "./types";
import { buildSkeleton } from "./ag1-skeleton-builder";
import {
  generateRecommendations,
  type isCityReady,
} from "./ag2-gemini-recommender";
import { finalizeDbOnlyItinerary } from "./ag4-db-finalize";

type CityReadyResult = Awaited<ReturnType<typeof isCityReady>>;

/**
 * DB-only 파이프라인 메인 = ready=true 도시 전용
 * = scenario.scenes 직접 사용 (= 사용자 SSOT 단계 4)
 */
export async function runPipelineDbOnly(
  formData: TripFormData,
  cityCheck: CityReadyResult,
): Promise<any> {
  const _t0 = Date.now();
  const _timings: Record<string, number> = {};
  const _mark = (label: string) => {
    _timings[label] = Date.now() - _t0;
  };

  console.log(
    `\n[DB-Only] ===== city=${cityCheck.cityName} ready=true (${cityCheck.count} rows) =====`,
  );

  // ===== AG1 = 매트릭스 변환 (= sentiment 0 = ag1 본체 폐기 완료) =====
  const skeleton = await buildSkeleton(formData);
  _mark("AG1");

  // ===== AG2-DB = place_seed_raw 직접 SELECT (= Gemini 0) =====
  const placesArr = await generateRecommendations(skeleton);
  _mark("AG2");
  console.log(
    `[DB-Only] AG2-DB 완료 (${_timings["AG2"] - _timings["AG1"]}ms): ${placesArr.length}곳 (= Gemini 0)`,
  );

  // ===== AG4-DB = scenario.scenes 직접 사용 (= 사용자 SSOT 단계 4) =====
  // = ag4 안 scenario 호출 = 자유 동선
  // = 백필 = background fire-and-forget = FE 우선 노출
  // ⚠️ 수정금지(승인필요) 2026-08-13 = isCityReady() 가 이미 조회한 도시중심좌표 그대로 전달(새 조회 0).
  const cityCoords =
    cityCheck.latitude != null && cityCheck.longitude != null
      ? { lat: cityCheck.latitude, lng: cityCheck.longitude }
      : undefined;

  const result = await finalizeDbOnlyItinerary({
    daySlotsConfig: skeleton.daySlotsConfig,
    travelPace: skeleton.travelPace,
    formData,
    companionCount: skeleton.companionCount,
    dayCount: skeleton.dayCount,
    cityId: cityCheck.cityId,
    cityCoords,
    skeleton,
    inputPlaces: placesArr,
  });
  _mark("AG4-DB");

  const totalMs = Date.now() - _t0;
  console.log(`[DB-Only] ===== 완료 (${totalMs}ms) =====`);
  console.log(
    `[DB-Only]   AG1: ${_timings["AG1"]}ms / AG2-DB: ${_timings["AG2"] - _timings["AG1"]}ms / AG4-DB: ${_timings["AG4-DB"] - _timings["AG2"]}ms`,
  );

  result.metadata = {
    ...result.metadata,
    _timings,
    _totalMs: totalMs,
    _pipelineVersion: "db-only-v2-scene-direct",
    _sourceMode: "db-only",
  };

  return result;
}
