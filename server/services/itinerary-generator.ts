// ⚠️ 수정금지(승인필요) 2026-05-20 = KoreanSentiment 완전 폐기 (= 사용자 SSOT)
import { regenerateDay } from "./itinerary/regenerate-day";
import { _enrichmentPipeline } from "./itinerary/enrichment-pipeline";
import { getRealityCheckForCity } from "./itinerary/helpers";
import type { TripFormData } from "./itinerary/types";

// ⚠️ 수정금지(승인필요) 2026-05-20 = Verifier 완전 폐기 = 1 회 재시도 제거 (= 사용자 SSOT)
export async function generateItinerary(formData: TripFormData) {
  const { runPipelineV3 } = await import("./agents/pipeline-v3");
  return await runPipelineV3(formData as any);
}

export { _enrichmentPipeline };

export const itineraryGenerator = {
  generate: generateItinerary,
  regenerateDay,
};

// ⚠️ 수정금지(승인필요) 2026-05-20 = enrichmentFunctions = 3 enrichPlacesWith* 폐기 (= 사용자 SSOT = place_seed_raw 만)
export const enrichmentFunctions = {
  getRealityCheckForCity,
};
