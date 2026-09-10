// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 사진·뼈대·창고에서 고르기 = 원본 place-image.ts · ag1-skeleton-builder.ts · ag2-gemini-recommender.ts
//   1,777줄 한 덩어리에서 그대로 잘라낸 것(§0) = 계산·규칙 한 글자도 안 바꿈.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, between, eq, inArray } from "drizzle-orm";
import * as schema from "../../shared/schema";

import {
  distanceKmFromCoords,
  poolWhereSql,
  recalcCrossCityZone,
  servingGateSql,
} from "../routes-itinerary-generate-db";

import {
  MEAL_BUDGET,
  type AG1Output,
  type PlaceResult,
  type SeedCategory,
} from "../../server/services/agents/types";
import { normalizeTravelStyle } from "../../server/services/agents/pipeline-v3-types";
import {
  VIBE_PRIMARY_CATEGORY,
  SIGHT_CATEGORIES,
} from "../../shared/vibe-category";

const { cities, placeSeedRaw } = schema;

type Db = PostgresJsDatabase<typeof schema>;

// ── 사진 ────────────────────────────────────────────────────────────────────

/** 행에 사진 주소가 있으면 그것, 없으면 빈 값. */
export function pickPlaceImage(seed: { imageUrl?: string | null }): string {
  return seed.imageUrl || "";
}

// ── AG1 뼈대 (원본 server/services/agents/ag1-skeleton-builder.ts) ───────────

// ── AG2 = 창고에서 고르기 (원본 ag2-gemini-recommender.ts:125 fetchFromPlaceSeedRaw) ──

/** 원본 server/services/agents/ag2-gemini-recommender.ts:84 computeCatSlots — 순수. */
export function computeCatSlots(
  vibeWeights: readonly { vibe: string; weight: number }[],
  totalSlots: number,
  dayCount: number,
): Record<string, number> {
  const catSlots: Record<string, number> = {};
  for (const vw of vibeWeights) {
    const primary = VIBE_PRIMARY_CATEGORY[vw.vibe] || "attraction";
    catSlots[primary] = (catSlots[primary] || 0) + vw.weight * totalSlots;
  }
  const restaurantCap = dayCount * 2;
  if (!catSlots.restaurant || catSlots.restaurant < dayCount) {
    catSlots.restaurant = Math.min(restaurantCap, Math.ceil(totalSlots * 0.4));
  }
  if (catSlots.restaurant > restaurantCap) {
    const overflow = catSlots.restaurant - restaurantCap;
    catSlots.restaurant = restaurantCap;
    const nr = Object.keys(catSlots).filter((k) => k !== "restaurant");
    const nrTotal = nr.reduce((s, k) => s + (catSlots[k] || 0), 0) || 1;
    for (const k of nr)
      catSlots[k] = (catSlots[k] || 0) + overflow * (catSlots[k] / nrTotal);
  }
  const nonRest = Object.keys(catSlots).filter((k) => k !== "restaurant");
  const nonRestSum = nonRest.reduce((s, k) => s + (catSlots[k] || 0), 0);
  const targetNonRest = totalSlots - catSlots.restaurant;
  if (nonRestSum > 0) {
    for (const k of nonRest)
      catSlots[k] = Math.round(
        ((catSlots[k] || 0) / nonRestSum) * targetNonRest,
      );
  }
  for (const k of Object.keys(catSlots))
    catSlots[k] = Math.max(1, Math.round(catSlots[k]));
  const sum = Object.values(catSlots).reduce((s, n) => s + n, 0);
  if (sum !== totalSlots) {
    const top = Object.entries(catSlots).sort((a, b) => b[1] - a[1])[0][0];
    catSlots[top] += totalSlots - sum;
  }
  return catSlots;
}

/** 원본 ag2-gemini-recommender.ts:174 SELECT_COLS — 칸 목록 그대로. */
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

/** 원본 server/services/agents/ag2-gemini-recommender.ts:125 fetchFromPlaceSeedRaw. */
export async function fetchFromPlaceSeedRaw(
  db: Db,
  skeleton: AG1Output,
  preResolvedCity: { cityId: number; name: string },
): Promise<PlaceResult[]> {
  const { formData, vibeWeights, requiredPlaceCount } = skeleton;
  const cid = preResolvedCity.cityId;

  // 원본 :153 = 풀 컨텍스트(중심좌표 + 합집합 WHERE) 1회 확보.
  // 원본 pool-radius.ts:73 getPoolContext = 기점 = 숙소좌표 ?? 도시중심.
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
  const budgetTier = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];

  // 원본 :199 selectByDayZone — 정렬·컷 규칙 그대로.
  const selectByDayZone = async (cat: string, slots: number) => {
    const isRestaurant = cat === "restaurant";
    const baseWhere = [
      poolWhere,
      eq(placeSeedRaw.seedCategory, cat),
      servingGateSql(),
    ];
    if (isRestaurant)
      baseWhere.push(
        between(placeSeedRaw.priceEur, budgetTier.min, budgetTier.max),
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

  // 원본 :261 = 핀 주입(rank -1 = 활동 컷 무조건 통과).
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

  // 원본 :288 = 공급부족 보충(25km 안 다른 카테고리 rank 순).
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

  return allRows.map((r: any) => dbRowToPlace(r, formData.destination));
}

/** 창고 행 → 슬롯 객체 1벌(원본 ag2-gemini-recommender.ts:339). DB-only·베스트 분기가 같은 것을 쓴다(§16). */
export function dbRowToPlace(r: any, destination: string): PlaceResult {
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
    image: pickPlaceImage(r),
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
