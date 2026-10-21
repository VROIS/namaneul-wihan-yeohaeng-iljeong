// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 들어온 버튼으로 가른다 · 인기 명소 여정 = 하나의 목록(순위순 · 좌표 · 체류분 · 구글 리뷰수) + 날짜 창 + 이동 배수 → 앱이 체크한 순서대로 시간 기준 자동 배정(shared/day-fill) → 예상 여정(밀도 고정 빡빡하게 60 · 식당 없는 식사 칸 · 반영 바이브 = 누구랑·누구를 위한·예산·이동 스타일) → 수정 완료 = 그 배치 그대로 식당만 새로 · 내 취향 여정 수정 완료 = 사용자 밀도·식사 칸 자리·길이 그대로 식당만 새로 (정본 §)

import { and, eq, inArray, sql } from "drizzle-orm";
import type { TripFormData } from "./lib/services/agents/types";
import { buildSkeleton } from "./lib/services/agents/ag1-skeleton-builder";
import type { Db } from "./db-types";
import {
  poolWhereSql,
  recalcCrossCityZone,
  servingGateSql,
} from "./lib/services/shared/pool-radius";
import {
  cityHourlyRate,
  slotMinutesFor,
} from "./lib/services/shared/slot-duration";
import { shouldApplyGuidePrice } from "./lib/services/transport/guide-pricing";
import { moveMult } from "@shared/day-retime";
import { PACE_SLOT_MINUTES } from "@shared/pace-duration";
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

// 인기 명소 여정 = 사용자 밀도를 받지 않는다 = 항상 빡빡하게(활동·식사 60)
const pickedForm = (formData: TripFormData): TripFormData => ({
  ...formData,
  travelPace: "Packed",
});

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

const BEST_LIST_PER_DAY = 6;

export async function listBest(
  db: Db,
  formData: TripFormData,
  cityCheck: CityReadyResult,
) {
  const cityId = cityCheck.cityId!;
  const cityCoords = cityCoordsOf(cityCheck);
  const skeleton = await buildSkeleton(pickedForm(formData));
  const [rows, hourlyRate] = await Promise.all([
    selectBest(db, cityId, cityCoords, false),
    cityHourlyRate(db, cityId),
  ]);
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
    center: cityCoords ?? null,
    mult: moveMult(
      shouldApplyGuidePrice(formData.mobilityStyle, formData.travelStyle),
    ),
    days: skeleton.daySlotsConfig.map((dc) => ({
      day: dc.day,
      startTime: dc.startTime,
      endTime: dc.endTime,
    })),
    places: picked.map((r) => {
      const p: any = dbRowToPlace(r, imagePidMap, formData.destination);
      return {
        id: r.id,
        nameEn: p.name,
        nameLocal: p.nameLocal,
        image: p.image,
        userRatingCount: p.userRatingCount,
        rank: bestRankOrdinal(r.bestRank),
        lat: p.lat,
        lng: p.lng,
        seedCategory: p.seedCategory,
        stayMin: slotMinutesFor(
          p.estimatedPriceEur,
          PACE_SLOT_MINUTES.Packed,
          hourlyRate,
          p.seedCategory,
        ),
      };
    }),
  };
}

export async function runPipelinePicked(
  db: Db,
  input: TripFormData & {
    pickedDays?: number[][];
    finalDays?: PickedFinalDay[];
    sourceMode?: string;
  },
  cityCheck: CityReadyResult,
): Promise<any> {
  const cityId = cityCheck.cityId!;
  const cityCoords = cityCoordsOf(cityCheck);
  const finalDays = input.finalDays;
  const best = !finalDays || input.sourceMode === "best";
  const formData = best ? pickedForm(input) : input;
  const skeleton = await buildSkeleton(formData);
  if (finalDays)
    skeleton.daySlotsConfig.forEach((dc, d) => {
      if (!finalDays[d]) return;
      dc.startTime = finalDays[d].startTime;
      dc.endTime = finalDays[d].endTime;
    });
  const pickedIds: string[][] = finalDays
    ? finalDays.map((d) => d.items.flatMap((x) => ("meal" in x ? [] : [x.id])))
    : (input.pickedDays ?? []).map((d) => d.map((id) => `db-${id}`));
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
    finalDays ? selectBest(db, cityId, cityCoords, true) : Promise.resolve([]),
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
      estimate: !finalDays,
      mine: !best,
    },
  });
  result.metadata = {
    ...result.metadata,
    _pipelineVersion: "best-picked-2026-10-21",
    _sourceMode: best ? "best" : "db-only",
  };
  return result;
}
