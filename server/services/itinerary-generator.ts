// ⚠️ 수정금지(승인필요) 2026-05-20 = KoreanSentiment 완전 폐기 (= 사용자 SSOT)
// 🗑️ 2026-07-15 = §0 슬림화(1,404줄→분리) = 내부 타입·헬퍼·함수 전부 server/services/itinerary/ 로 순수 이동.
//   이 파일 = 진입점(export 동일 유지)만 남김. 로직 변경 0(§19 = 옛 코드 주석 보존 금지 = 완전 이동 후 삭제).
import { regenerateDay } from "./itinerary/regenerate-day";
import { _enrichmentPipeline } from "./itinerary/enrichment-pipeline";
import { getRealityCheckForCity } from "./itinerary/helpers";
import type { TripFormData } from "./itinerary/types";

/**
 * ===== Pipeline V3: 2단계 파이프라인 진입점 =====
 *
 * Step 1: Gemini 완전 일정 생성 (일차별/동선별, 3~5초)
 * Step 2: 데이터 채우기 (DB매칭+enrichment+실시간, 2~4초 병렬)
 *
 * 기존 4-Agent 순차 12~18초 → 2단계 병렬 5~9초
 */
// ⚠️ 수정금지(승인필요) 2026-05-20 = Verifier 완전 폐기 = 1 회 재시도 제거 (= 사용자 SSOT)
export async function generateItinerary(formData: TripFormData) {
  const { runPipelineV3 } = await import("./agents/pipeline-v3");
  return await runPipelineV3(formData as any);
}

/**
 * ===== AG3용 enrichment 파이프라인 내보내기 =====
 * 오케스트레이터에서 기존 enrichment 함수들을 호출하기 위한 래퍼
 */
export { _enrichmentPipeline };

export const itineraryGenerator = {
  generate: generateItinerary,
  regenerateDay,
};

// ⚠️ 수정금지(승인필요) 2026-05-20 = enrichmentFunctions = 3 enrichPlacesWith* 폐기 (= 사용자 SSOT = place_seed_raw 만)
// = getRealityCheckForCity 만 유지 (= 날씨/위기 = 별도 도메인)
export const enrichmentFunctions = {
  getRealityCheckForCity,
};
