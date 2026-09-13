// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = Gemini 응답값만 사용 = TS+PM 우회 백필 (= background)

import { upsertPlace } from "../place-upsert";
import type { PlaceResult } from "../agents/types";
import type { RouteResponse, RouteBackfillResult } from "./route-types";

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

  const inputById = new Map(inputPlaces.map((p) => [p.id, p]));

  const phaseTagDate = `auto-route-${new Date().toISOString().slice(0, 10)}`;

  for (const day of response.days) {
    if (!day.scenes) continue;
    for (const scene of day.scenes) {
      const isAutoRestaurant = scene.place_id?.startsWith("auto-");
      const isInputActivity =
        !isAutoRestaurant && inputById.has(scene.place_id);

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
        const sceneName = scene.name_en || scene.name_local;
        if (!sceneName || !scene.address || !validCoord) {
          summary.skipped++;
          summary.errors.push(
            `auto-restaurant missing core fields (name+address+coord): ${scene.place_id}`,
          );
          continue;
        }
        summary.total++;
        try {
          const r = await upsertPlace({
            cityId,
            seedCategory: "restaurant",
            nameEn: sceneName, // = Gemini 응답 = name_en || name_local fallback
            nameKo: scene.name_ko || null,
            nameLocal: scene.name_local || null,
            address: scene.address,
            latitude: scene.lat,
            longitude: scene.lng,
            priceEur: scene.price_eur ?? null,
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
