// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = DB-only 전용 파이프라인 (= 단계 4)

import type { TripFormData } from "./types";
import { buildSkeleton } from "./ag1-skeleton-builder";
import {
  generateRecommendations,
  type isCityReady,
} from "./ag2-gemini-recommender";
import { finalizeDbOnlyItinerary } from "./ag4-db-finalize";

type CityReadyResult = Awaited<ReturnType<typeof isCityReady>>;

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

  const skeleton = await buildSkeleton(formData);
  _mark("AG1");

  const placesArr = await generateRecommendations(skeleton);
  _mark("AG2");
  console.log(
    `[DB-Only] AG2-DB 완료 (${_timings["AG2"] - _timings["AG1"]}ms): ${placesArr.length}곳 (= Gemini 0)`,
  );

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
