// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 사진·뼈대·창고에서 고르기 1벌(워커 DB-only·베스트) = 사진 place-image.ts · 볼거리 슬롯 나누기 ag2 computeCatSlots · 식당 가격 = 그 도시 분포(shared/meal-budget-tiers)

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, between, eq, gte, inArray } from "drizzle-orm";
import * as schema from "../../shared/schema";

import {
  distanceKmFromCoords,
  poolWhereSql,
  recalcCrossCityZone,
  servingGateSql,
} from "../lib/services/shared/pool-radius";
import {
  cityMealTiers,
  tierRange,
} from "../lib/services/shared/meal-budget-tiers";

import {
  type AG1Output,
  type PlaceResult,
  type SeedCategory,
} from "../lib/services/agents/types";
import { normalizeTravelStyle } from "../lib/services/agents/pipeline-v3-types";
import {
  loadImagePidMap,
  pickPlaceImage,
} from "../lib/services/shared/place-image";
import { computeCatSlots } from "../lib/services/agents/ag2-gemini-recommender";
import { SIGHT_CATEGORIES } from "../../shared/vibe-category";

const { cities, placeSeedRaw } = schema;

type Db = PostgresJsDatabase<typeof schema>;

// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 사진 = 원본 place-image.ts 1벌(PID공유 폴백 포함) = ../lib/services/shared/place-image.ts

// ── AG1 뼈대 ───────────

// ── AG2 = 창고에서 고르기 ──

/** ag2-gemini-recommender.ts SELECT_COLS — 칸 목록 그대로. */
export const AG2_SELECT_COLS = {
  id: placeSeedRaw.id,
  cityId: placeSeedRaw.cityId,
  nameEn: placeSeedRaw.nameEn,
  nameKo: placeSeedRaw.nameKo,
  nameLocal: placeSeedRaw.nameLocal,
  googlePlaceId: placeSeedRaw.googlePlaceId,
  googleMapsUri: placeSeedRaw.googleMapsUri,
  address: placeSeedRaw.address,
  latitude: placeSeedRaw.latitude,
  longitude: placeSeedRaw.longitude,
  imageUrl: placeSeedRaw.imageUrl,
  summaryKo: placeSeedRaw.summaryKo,
  editorialSummary: placeSeedRaw.editorialSummary,
  seedCategory: placeSeedRaw.seedCategory,
  rank: placeSeedRaw.rank,
  bestRank: placeSeedRaw.bestRank,
  googleReviewCount: placeSeedRaw.googleReviewCount,
  priceEur: placeSeedRaw.priceEur,
  dayZone: placeSeedRaw.dayZone,
};

export async function fetchFromPlaceSeedRaw(
  db: Db,
  skeleton: AG1Output,
  preResolvedCity: { cityId: number; name: string },
): Promise<PlaceResult[]> {
  const { formData, vibeWeights, requiredPlaceCount } = skeleton;
  const cid = preResolvedCity.cityId;

  // 풀 컨텍스트(중심좌표 + 합집합 WHERE) 1회 확보.
  // pool-radius.ts getPoolContext = 기점 = 숙소좌표 ?? 도시중심.
  const startCoords = (formData as any).accommodationCoords ?? null;
  let center: { lat: number; lng: number } | null = startCoords;
  if (!center) {
    const rows = await db
      .select({ lat: cities.latitude, lng: cities.longitude })
      .from(cities)
      .where(eq(cities.id, cid))
      .limit(1);
    const c = rows[0];
    center =
      c && c.lat != null && c.lng != null
        ? { lat: Number(c.lat), lng: Number(c.lng) }
        : null;
  }
  const poolWhere = poolWhereSql(cid, center);

  const totalSlots = requiredPlaceCount;
  const dayCount = skeleton.dayCount || skeleton.daySlotsConfig?.length || 3;
  const catSlots = computeCatSlots(vibeWeights, totalSlots, dayCount);
  // ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 식당 후보 가격 = 그 도시 분포 구간 1벌(고정 유로 폐기 §19), 분포가 없으면 가격으로 자르지 않는다 (정본 B4)
  const tiers = await cityMealTiers(db, cid);
  const band = tiers
    ? tierRange(normalizeTravelStyle(formData.travelStyle), tiers)
    : null;

  // selectByDayZone — 정렬·컷 규칙 그대로.
  const selectByDayZone = async (cat: string, slots: number) => {
    const isRestaurant = cat === "restaurant";
    const baseWhere = [
      poolWhere,
      eq(placeSeedRaw.seedCategory, cat),
      servingGateSql(),
    ];
    if (isRestaurant && band)
      baseWhere.push(
        Number.isFinite(band.cap)
          ? between(placeSeedRaw.priceEur, band.min, band.cap)
          : gte(placeSeedRaw.priceEur, band.min),
      );
    const rows: any[] = await db
      .select(AG2_SELECT_COLS)
      .from(placeSeedRaw)
      .where(and(...baseWhere));
    for (const r of rows) recalcCrossCityZone(r, cid, center);
    const rc = (r: any) => r.googleReviewCount ?? -1;
    rows.sort(
      (a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) -
          (b.rank ?? Number.MAX_SAFE_INTEGER) || rc(b) - rc(a),
    );
    return rows.slice(0, slots);
  };

  const pinIds = (formData.pinnedPlaceIds ?? []).filter((n) =>
    Number.isFinite(n),
  );
  const allRows: any[] = [];
  if (!pinIds.length) {
    const queries = Object.entries(catSlots)
      .filter(([, slots]) => slots > 0)
      .map(([cat, slots]) => selectByDayZone(cat, slots));
    const results = await Promise.all(queries);
    for (const rows of results) allRows.push(...rows);
  }

  // 핀 주입(rank -1 = 활동 컷 무조건 통과).
  if (pinIds.length) {
    const pinRows: any[] = await db
      .select(AG2_SELECT_COLS)
      .from(placeSeedRaw)
      .where(inArray(placeSeedRaw.id, pinIds));
    for (const r of pinRows) recalcCrossCityZone(r, cid, center);
    const byId = new Map(pinRows.map((r) => [r.id, r]));
    const ordered = pinIds.map((id) => byId.get(id)).filter(Boolean) as any[];
    for (const r of ordered) {
      r.rank = -1;
      allRows.push(r);
    }
  }

  // 공급부족 보충(25km 안 다른 카테고리 rank 순).
  const NEAR_KM = 25;
  const kmOf = (r: any) =>
    center && Number(r.latitude) && Number(r.longitude)
      ? distanceKmFromCoords(
          center.lat,
          center.lng,
          Number(r.latitude),
          Number(r.longitude),
        )
      : Infinity;
  const nearNonRest = allRows.filter(
    (r: any) => r.seedCategory !== "restaurant" && kmOf(r) <= NEAR_KM,
  ).length;
  const nonRestSlots = totalSlots - (catSlots.restaurant ?? 0);
  if (!pinIds.length && nearNonRest < nonRestSlots) {
    const deficit = nonRestSlots - nearNonRest;
    const pickedIds = new Set(allRows.map((r: any) => r.id));
    const extra: any[] = await db
      .select(AG2_SELECT_COLS)
      .from(placeSeedRaw)
      .where(
        and(
          poolWhere,
          inArray(placeSeedRaw.seedCategory, [...SIGHT_CATEGORIES]),
          servingGateSql(),
        ),
      );
    for (const r of extra) recalcCrossCityZone(r, cid, center);
    const rcOf = (r: any) => r.googleReviewCount ?? -1;
    const topUp = extra
      .filter((r) => !pickedIds.has(r.id) && kmOf(r) <= NEAR_KM)
      .sort(
        (a, b) =>
          (a.rank ?? Number.MAX_SAFE_INTEGER) -
            (b.rank ?? Number.MAX_SAFE_INTEGER) || rcOf(b) - rcOf(a),
      )
      .slice(0, deficit);
    allRows.push(...topUp);
  }

  // PID공유 폴백용 R2 실존목록 = 행 확정 **후** 등장한 도시 전부 로드
  const imagePidMap = await loadImagePidMap([
    cid,
    ...allRows.map((r: any) => r.cityId),
  ]);
  return allRows.map((r: any) =>
    dbRowToPlace(r, imagePidMap, formData.destination),
  );
}

export function dbRowToPlace(
  r: any,
  imagePidMap: Map<string, string>,
  destination: string,
): PlaceResult {
  const isFood = r.seedCategory === "restaurant";
  return {
    id: `db-${r.id}`,
    name: r.nameEn || "",
    geminiPlaceId: r.googlePlaceId || "",
    geminiAddress: r.address || "",
    description: r.summaryKo || r.editorialSummary || "",
    lat: parseFloat(String(r.latitude)) || 0,
    lng: parseFloat(String(r.longitude)) || 0,
    rank: r.rank,
    sourceType: "DB Direct (Place Seed Raw)",
    personaFitReason: r.summaryKo || "",
    tags: isFood ? ["restaurant", "food"] : [],
    vibeTags: isFood ? ["Foodie" as const] : [],
    image: pickPlaceImage(r, imagePidMap),
    priceEstimate: r.priceEur ? `€${r.priceEur}` : "",
    estimatedPriceEur: r.priceEur ?? undefined,
    bestRank: r.bestRank ?? null,
    seedCategory: r.seedCategory as SeedCategory,
    placeTypes: isFood ? ["restaurant"] : [],
    recommendedTime: "afternoon",
    city: destination,
    region: "",
    googleMapsUrl: r.googleMapsUri || "",
    googleMapsUri: r.googleMapsUri || "",
    userRatingCount: r.googleReviewCount || 0,
    dayZone: r.dayZone ?? null,
    nameKo: r.nameKo ?? null,
    nameLocal: r.nameLocal ?? null,
    address: r.address ?? null,
    summaryKo: r.summaryKo ?? null,
    editorialSummary: r.editorialSummary ?? null,
  } as any;
}
