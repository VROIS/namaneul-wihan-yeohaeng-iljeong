// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = DB-only 전용 파이프라인 (= ready=true 도시)
// = Gemini 호출 = 0 (= Verifier 포함)
// = Google Routes API 호출 = 0 (= transit-haversine 사용)
// = KoreanSentiment 호출 = 0 (= AG1 인라인 = sentiment 0)
// = place_seed_raw 단일 테이블 SELECT (= 보조 테이블 차단)
// = MIX 경로 (= pipeline-v3.ts runPipelineMix) = 별도 보존

// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT [[feedback_latest_is_truth_delete_old]]
// = buildSkeletonDb 폐기 = buildSkeleton (= ag1-skeleton-builder.ts) 직접 호출
// = ag1 본체 = KoreanSentiment 폐기 완료 = 분리 명분 0
import type { TripFormData } from "./types";
import { buildSkeleton } from "./ag1-skeleton-builder";
import {
  generateRecommendations,
  type isCityReady,
} from "./ag2-gemini-recommender";
import { processDbOnly } from "./ag3-db-direct";
import { finalizeDbOnlyItinerary } from "./ag4-db-finalize";

type CityReadyResult = Awaited<ReturnType<typeof isCityReady>>;

/**
 * DB-only 파이프라인 메인 = ready=true 도시 전용
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

  // ===== AG1 = 기존 buildSkeleton 재사용 (= sentiment 0 = ag1 본체 폐기 완료) =====
  const skeleton = await buildSkeleton(formData);
  _mark("AG1");

  // ===== AG2-DB = place_seed_raw 직접 SELECT (= Gemini 0) =====
  // generateRecommendations 내부 = isCityReady → fetchFromPlaceSeedRaw (= ready=true 시) = OK
  const placesArr = await generateRecommendations(skeleton);
  _mark("AG2");
  console.log(
    `[DB-Only] AG2-DB 완료 (${_timings["AG2"] - _timings["AG1"]}ms): ${placesArr.length}곳 (= Gemini 0)`,
  );

  // ===== AG3-DB = 매칭 5 단계 + sourceType 보존 (= Google 0) =====
  const { enriched } = processDbOnly(placesArr);
  _mark("AG3-DB");

  // ===== 슬롯 분배 = 기존 _enrichmentPipeline.runFullEnrichment 재사용 (= 점수 + 분배) =====
  const { _enrichmentPipeline } = await import("../itinerary-generator");
  const enrichResult = await _enrichmentPipeline.runFullEnrichment(
    enriched,
    formData,
    {
      daySlotsConfig: skeleton.daySlotsConfig,
      travelPace: skeleton.travelPace,
      requiredPlaceCount: skeleton.requiredPlaceCount,
    },
  );
  _mark("SlotDistribute");
  console.log(`[DB-Only] 슬롯 분배 완료: ${enrichResult.schedule.length}슬롯`);

  // ===== AG4-DB = Routes 0 + 단위 일치 + scenario/ Gemini 통합 (= 사용자 SSOT 2026-05-25) =====
  // = DB-only 만 = MIX 와 다른 호출 (= 결함 4 종 cascade 해결)
  const result = await finalizeDbOnlyItinerary({
    schedule: enrichResult.schedule,
    daySlotsConfig: skeleton.daySlotsConfig,
    travelPace: skeleton.travelPace,
    formData,
    companionCount: skeleton.companionCount,
    dayCount: skeleton.dayCount,
    // ⚠️ 수정금지(승인필요) 2026-05-25 = scenario/ Gemini 호출 통합 = skeleton + inputPlaces + cityId 필수
    cityId: cityCheck.cityId,
    skeleton,
    inputPlaces: placesArr,
  });
  _mark("AG4-DB");

  // ===== Verifier SKIP (= Gemini 0 강제 = 사용자 SSOT) =====

  const totalMs = Date.now() - _t0;
  console.log(`[DB-Only] ===== 완료 (${totalMs}ms) =====`);
  console.log(
    `[DB-Only]   AG1: ${_timings["AG1"]}ms / AG2-DB: ${_timings["AG2"] - _timings["AG1"]}ms`,
  );
  console.log(
    `[DB-Only]   AG3-DB: ${_timings["AG3-DB"] - _timings["AG2"]}ms / 슬롯: ${_timings["SlotDistribute"] - _timings["AG3-DB"]}ms / AG4-DB: ${_timings["AG4-DB"] - _timings["SlotDistribute"]}ms`,
  );

  result.metadata = {
    ...result.metadata,
    _timings,
    _totalMs: totalMs,
    _pipelineVersion: "db-only-v1",
    _sourceMode: "db-only",
  };

  return result;
}
