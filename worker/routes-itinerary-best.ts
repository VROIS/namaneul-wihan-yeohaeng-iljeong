// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 인기 명소 고르기 = 베스트 목록 → 고른 장소로 예상 여정(모든 사용자 · 옛 관리자 전용 베스트 여정 계산 삭제) (정본 §)

import { and, eq, inArray, sql } from "drizzle-orm";
import type { TripFormData } from "./lib/services/agents/types";
import { buildSkeleton } from "./lib/services/agents/ag1-skeleton-builder";
import type { Db } from "./db-types";
import {
  poolWhereSql,
  recalcCrossCityZone,
  servingGateSql,
} from "./lib/services/shared/pool-radius";
import { finalizeDbOnlyItinerary } from "./best-itinerary/finalize";
import type { PickedFinalDay } from "./lib/services/route/route-picked";
import { AG2_SELECT_COLS, dbRowToPlace } from "./best-itinerary/places";
import { loadImagePidMap } from "./lib/services/shared/place-image";
import {
  cityCoordsOf,
  type CityReadyResult,
} from "./best-itinerary/city-resolver";
import { placeSeedRaw } from "../shared/schema";
import {
  bestRankLangCount,
  bestRankOrdinal,
} from "./lib/services/shared/best-rank";

// ⚠️ 수정금지(승인필요) 2026-10-14 사장님 결정 = 분류 이름을 포토스팟으로 바꿈 (정본 §2026-10-14)
const FILL_CATEGORIES = ["heritage", "photospot", "healing", "attraction"];

const agreeOf = (r: { bestRank?: number | null }) =>
  bestRankLangCount(r.bestRank);

const ordinalOf = (r: { bestRank?: number | null }) =>
  bestRankOrdinal(r.bestRank) ?? Number.MAX_SAFE_INTEGER;

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 베스트 순서 = 산출표 순위(앞자리) → 동의 수 → 리뷰수 · 목록·예상 여정도 이 순서를 쓴다 (정본 §)
async function selectBest(
  db: Db,
  cityId: number,
  cityCoords: { lat: number; lng: number } | null | undefined,
  isRestaurant: boolean,
) {
  const center = cityCoords ?? null;
  const poolWhere = poolWhereSql(cityId, center);
  const rows: any[] = await db
    .select(AG2_SELECT_COLS)
    .from(placeSeedRaw)
    .where(
      and(
        poolWhere,
        isRestaurant
          ? eq(placeSeedRaw.seedCategory, "restaurant")
          : sql`${placeSeedRaw.seedCategory} <> 'restaurant'`,
        servingGateSql(),
      ),
    );
  for (const r of rows) recalcCrossCityZone(r, cityId, center);
  rows.sort(
    (a, b) =>
      ordinalOf(a) - ordinalOf(b) ||
      agreeOf(b) - agreeOf(a) ||
      (b.googleReviewCount ?? -1) - (a.googleReviewCount ?? -1),
  );
  return rows;
}

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 베스트 목록 = 베스트(분류 무관) 순위 순 → 유적·포토스팟·힐링·즐길거리 리뷰 순 · 날마다 6곳 · 카드 = 이름 · 순위 · 구글 리뷰 (정본 §)
const BEST_LIST_PER_DAY = 6;

export async function listBest(
  db: Db,
  formData: TripFormData,
  cityCheck: CityReadyResult,
) {
  const cityId = cityCheck.cityId!;
  const cityCoords = cityCoordsOf(cityCheck);
  const skeleton = await buildSkeleton(formData);
  const rows = await selectBest(db, cityId, cityCoords, false);
  const best = rows.filter((r) => r.bestRank != null);
  const fill = rows
    .filter(
      (r) =>
        r.bestRank == null &&
        FILL_CATEGORIES.includes(String(r.seedCategory ?? "")),
    )
    .sort((a, b) => (b.googleReviewCount ?? -1) - (a.googleReviewCount ?? -1));
  const picked = [...best, ...fill].slice(
    0,
    skeleton.dayCount * BEST_LIST_PER_DAY,
  );
  const imagePidMap = await loadImagePidMap([
    cityId,
    ...picked.map((r) => r.cityId),
  ]);
  return {
    cityId,
    days: skeleton.daySlotsConfig.map((dc, d) => ({
      day: dc.day,
      places: picked
        .slice(d * BEST_LIST_PER_DAY, (d + 1) * BEST_LIST_PER_DAY)
        .map((r) => {
          const p: any = dbRowToPlace(r, imagePidMap, formData.destination);
          return {
            id: r.id,
            nameEn: p.name,
            nameLocal: p.nameLocal,
            image: p.image,
            userRatingCount: p.userRatingCount,
            rank: bestRankOrdinal(r.bestRank),
          };
        }),
    })),
  };
}

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 예상 여정 = 사용자가 목록에서 날마다 고른 장소를 그 순서 그대로 엔진이 계산 · 최종 완료(finalDays) = 사용자가 남긴 활동·식사 칸 배치와 날마다 시각 그대로 식당만 새로(식당·식사 규칙 = route-picked) (정본 §)
export async function runPipelinePicked(
  db: Db,
  formData: TripFormData & {
    pickedDays?: number[][];
    finalDays?: PickedFinalDay[];
  },
  cityCheck: CityReadyResult,
): Promise<any> {
  const cityId = cityCheck.cityId!;
  const cityCoords = cityCoordsOf(cityCheck);
  const skeleton = await buildSkeleton(formData);
  const finalDays = formData.finalDays;
  if (finalDays)
    skeleton.daySlotsConfig.forEach((dc, d) => {
      if (!finalDays[d]) return;
      dc.startTime = finalDays[d].startTime;
      dc.endTime = finalDays[d].endTime;
    });
  const pickedIds: string[][] = finalDays
    ? finalDays.map((d) => d.items.flatMap((x) => ("meal" in x ? [] : [x.id])))
    : (formData.pickedDays ?? []).map((d) => d.map((id) => `db-${id}`));
  const ids = pickedIds
    .flat()
    .map((id) => Number(id.replace(/^db-/, "")))
    .filter(Number.isFinite);
  const [rows, restRows] = await Promise.all([
    ids.length
      ? db
          .select(AG2_SELECT_COLS)
          .from(placeSeedRaw)
          .where(inArray(placeSeedRaw.id, ids))
      : Promise.resolve([] as any[]),
    selectBest(db, cityId, cityCoords, true),
  ]);
  const imagePidMap = await loadImagePidMap([
    cityId,
    ...rows.map((r: any) => r.cityId),
    ...restRows.map((r) => r.cityId),
  ]);
  const result = await finalizeDbOnlyItinerary(db, {
    daySlotsConfig: skeleton.daySlotsConfig,
    travelPace: skeleton.travelPace,
    formData,
    companionCount: skeleton.companionCount,
    dayCount: skeleton.dayCount,
    cityId,
    cityCoords,
    skeleton,
    inputPlaces: rows.map((r: any) =>
      dbRowToPlace(r, imagePidMap, formData.destination),
    ),
    restaurantPool: restRows.map((r) =>
      dbRowToPlace(r, imagePidMap, formData.destination),
    ),
    picked: {
      days: pickedIds,
      layout: finalDays?.map((d) => d.items),
      anchors: finalDays?.map((d) => d.anchor),
    },
  });
  result.metadata = {
    ...result.metadata,
    _pipelineVersion: "best-picked-2026-10-19",
    _sourceMode: "best",
  };
  return result;
}
