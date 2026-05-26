// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = Gemini 응답값만 사용 = TS+PM 우회 백필 (= background)
// = 헌법 §14 = upsertPlace() 단일 진입점 강제 (= 직접 INSERT 금지)
// = 사용자 SSOT 2026-05-26: 백필 = background fire-and-forget = FE 응답 후
// = 신규 식당 (= place_id="auto-*") = upsertPlace × N = 5 단계 매칭 자동
// = 좌표 NULL 보정 = Gemini 응답 좌표 = upsertPlace UPDATE
// = 시나리오 카피 (= subtitle_ko / narration_ko) 사용 제거 (= 동선 전용 = 본 필드 없음)

import { upsertPlace } from "../place-upsert";
import type { PlaceResult } from "../agents/types";
import type { RouteResponse, RouteBackfillResult } from "./route-types";

/**
 * Gemini 응답 → place_seed_raw 백필 (= background fire-and-forget)
 * = "auto-*" place_id = 신규 식당 = upsertPlace INSERT (= 매칭 0 시) / UPDATE (= 매칭 시)
 * = 활동 (= 입력 id) = Gemini 응답 좌표 = 옛 좌표 NULL 보정 (= upsertPlace UPDATE)
 */
export async function backfillFromRoute(
  response: RouteResponse,
  cityId: number,
  inputPlaces: PlaceResult[],
): Promise<RouteBackfillResult> {
  const summary: RouteBackfillResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  if (!response.days || response.days.length === 0) return summary;

  // 입력 활동 lookup (= 좌표 보정 시 name_en 필요 + .has() 로 식별)
  const inputById = new Map(inputPlaces.map((p) => [p.id, p]));

  // 일자 = 동일 = 1 회 계산 = 루프 hoist
  const phaseTagDate = `auto-route-${new Date().toISOString().slice(0, 10)}`;

  for (const day of response.days) {
    if (!day.scenes) continue;
    for (const scene of day.scenes) {
      const isAutoRestaurant = scene.place_id?.startsWith("auto-");
      const isInputActivity =
        !isAutoRestaurant && inputById.has(scene.place_id);

      // 좌표 유효성 (= 0,0 무효 차단)
      const validCoord =
        scene.lat &&
        scene.lng &&
        scene.lat !== 0 &&
        scene.lng !== 0 &&
        scene.lat >= -90 &&
        scene.lat <= 90 &&
        scene.lng >= -180 &&
        scene.lng <= 180;

      if (isAutoRestaurant) {
        // 신규 식당 = upsertPlace INSERT/UPDATE (= 5 단계 매칭)
        if (!scene.name_en || !scene.address || !validCoord) {
          summary.skipped++;
          summary.errors.push(
            `auto-restaurant missing required fields: ${scene.place_id}`,
          );
          continue;
        }
        summary.total++;
        try {
          const r = await upsertPlace({
            cityId,
            seedCategory: "restaurant",
            nameEn: scene.name_en,
            nameKo: scene.name_ko || null,
            nameLocal: scene.name_local || null,
            address: scene.address,
            latitude: scene.lat,
            longitude: scene.lng,
            priceEur: scene.price_per_person_eur ?? null,
            // ⚠️ 2026-05-26 = 사용자 SSOT = PSR 컬럼 채움 (= 09-main-app-itinerary 표준 매핑)
            // = scene.selection_reason_ko → DB summary_ko / scene.shortform_ko → DB editorial_summary
            selectionReasonKo: scene.selection_reason_ko || null,
            shortformKo: scene.shortform_ko || null,
            categoryTags: ["restaurant"],
            phaseTags: [phaseTagDate],
          });
          if (r.action === "inserted") summary.inserted++;
          else if (r.action === "updated") summary.updated++;
          else {
            summary.skipped++;
            if (r.reason) summary.errors.push(r.reason);
          }
        } catch (e: any) {
          summary.skipped++;
          summary.errors.push(
            `upsert error (${scene.name_en}): ${e?.message || e}`,
          );
        }
      } else if (isInputActivity && validCoord) {
        // 활동 = 옛 좌표 NULL/0 보정 (= Gemini grounding 좌표 = upsertPlace UPDATE)
        const inputPlace = inputById.get(scene.place_id);
        if (!inputPlace) continue;
        const oldInvalid =
          !inputPlace.lat ||
          !inputPlace.lng ||
          inputPlace.lat === 0 ||
          inputPlace.lng === 0;
        if (!oldInvalid) continue; // 옛 좌표 유효 = 보정 불필요

        summary.total++;
        try {
          const r = await upsertPlace({
            cityId,
            seedCategory: (inputPlace.seedCategory || "attraction") as string,
            nameEn: scene.name_en || inputPlace.name,
            latitude: scene.lat,
            longitude: scene.lng,
            address: scene.address || null,
          });
          if (r.action === "updated") summary.updated++;
          else if (r.action === "inserted") summary.inserted++;
          else summary.skipped++;
        } catch (e: any) {
          summary.skipped++;
          summary.errors.push(
            `coord-fix error (${scene.name_en}): ${e?.message || e}`,
          );
        }
      }
    }
  }

  console.log(
    `[Route-Backfill] ✅ ${summary.total}건 처리 = ${summary.inserted} INSERT / ${summary.updated} UPDATE / ${summary.skipped} skip`,
  );
  // ⚠️ 2026-05-26 = errors 항상 출력 (= 디버깅 = 옛 5 제한 폐기)
  if (summary.errors.length > 0) {
    summary.errors
      .slice(0, 5)
      .forEach((err) => console.warn(`[Route-Backfill] ⚠️ ${err}`));
    if (summary.errors.length > 5) {
      console.warn(
        `[Route-Backfill] ⚠️ +${summary.errors.length - 5} more errors`,
      );
    }
  }
  return summary;
}
