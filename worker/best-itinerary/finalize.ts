// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 여정 완성 = 원본 agents/ag4-db-finalize.ts:59
//   1,777줄 한 덩어리에서 그대로 잘라낸 것(§0) = 계산·규칙 한 글자도 안 바꿈.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";

import {
  FREE_THRESHOLD_EUR,
  HOURS_PER_AVERAGE_PLACE,
  MEAL_TIERS_MIN_SAMPLE,
  PRICED_STAY_CATEGORIES,
  poolWhereSql,
  servingGateSql,
  type CityMealTiers,
} from "../routes-itinerary-generate-db";

import {
  MEAL_BUDGET,
  type AG1Output,
  type DaySlotConfig,
  type PlaceResult,
  type TravelPace,
  type TripFormData,
} from "../../server/services/agents/types";
import {
  normalizeTravelStyle,
  sanitizePriceEur,
} from "../../server/services/agents/pipeline-v3-types";
import {
  haversineKm,
  pickTransitMode,
  estimateTransitCost,
} from "../../server/services/agents/transit-haversine";
import { bestRankOrderSql } from "../../server/services/shared/best-rank";
import { type CompanionType } from "../../server/services/transport/constants";
import { buildRouteLocal } from "../../server/services/route/route-local";

const { cities, placeSeedRaw } = schema;

type Db = PostgresJsDatabase<typeof schema>;

import { pickPlaceImage } from "./places";
import { addMinutes, guideCostForDay, shouldApplyGuidePrice } from "./pricing";

// ── AG4 = 완성 (원본 server/services/agents/ag4-db-finalize.ts:59) ───────────

/** 원본 server/services/exchange-rate.ts:190 getEurToKrwRate — DB 읽기만(외부호출 없음). */
export async function getEurToKrwRate(db: Db): Promise<number> {
  try {
    const [rate] = await db
      .select()
      .from(schema.exchangeRates)
      .where(
        and(
          eq(schema.exchangeRates.baseCurrency, "KRW"),
          eq(schema.exchangeRates.targetCurrency, "EUR"),
        ),
      )
      .limit(1);
    if (rate && rate.rate > 0) return Math.round(1 / rate.rate);
  } catch (e) {
    console.warn(
      "[AG4-DB] 환율 조회 실패, 기본값 사용:",
      (e as Error)?.message,
    );
  }
  return 1500; // 원본 :192 기본값
}

/** 그 도시 유료 입장지 평균 ÷ 2 = 시간당요금(EUR). 표본 0 이면 null. */
export async function cityHourlyRate(
  db: Db,
  cityId: number,
): Promise<number | null> {
  const cats = [...PRICED_STAY_CATEGORIES];
  const rows = await db
    .select({
      avgPrice: sql<number | null>`avg(${placeSeedRaw.priceEur})::float`,
    })
    .from(placeSeedRaw)
    .where(
      and(
        eq(placeSeedRaw.cityId, cityId),
        eq(placeSeedRaw.status, "active"),
        sql`${placeSeedRaw.priceEur} > ${FREE_THRESHOLD_EUR}`,
        inArray(placeSeedRaw.seedCategory, cats),
        sql`NOT (COALESCE(${placeSeedRaw.categoryTags}, '{}') && ARRAY['restaurant','hotel']::text[])`,
      ),
    );
  const avg = Number(rows[0]?.avgPrice);
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return avg / HOURS_PER_AVERAGE_PLACE;
}

/** 원본 server/services/shared/meal-budget-tiers.ts:13 cityMealTiers (같은 이유로 질의빌더). */
export async function cityMealTiers(
  db: Db,
  cityId: number,
): Promise<CityMealTiers | null> {
  const rows = await db
    .select({ p: sql<number>`${placeSeedRaw.priceEur}::float` })
    .from(placeSeedRaw)
    .where(
      and(
        eq(placeSeedRaw.cityId, cityId),
        eq(placeSeedRaw.seedCategory, "restaurant"),
        eq(placeSeedRaw.status, "active"),
        sql`${placeSeedRaw.googleReviewCount} > 0`,
        isNotNull(placeSeedRaw.googlePlaceId),
        isNotNull(placeSeedRaw.priceEur),
        sql`${placeSeedRaw.priceEur} > 0`,
        isNotNull(placeSeedRaw.imageUrl),
        sql`${placeSeedRaw.imageUrl} <> ''`,
      ),
    )
    .orderBy(placeSeedRaw.priceEur);
  const ps = rows.map((x) => Number(x.p));
  if (ps.length < MEAL_TIERS_MIN_SAMPLE) return null;
  const at = (f: number) =>
    ps[Math.min(ps.length - 1, Math.floor(ps.length * f))];
  return { lo: at(0.3), hi: at(0.8) };
}

export interface AG4DbInput {
  daySlotsConfig: DaySlotConfig[];
  travelPace: TravelPace;
  formData: TripFormData;
  companionCount: number;
  dayCount: number;
  cityId: number;
  cityCoords?: { lat: number; lng: number };
  skeleton: AG1Output;
  inputPlaces: PlaceResult[];
  // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 베스트 분기가 식당을 직접 넘길 때만 채워진다. 안 넘기면(기존 여정) 아래에서 지금까지처럼 스스로 뽑는다.
  restaurantPool?: PlaceResult[];
  bestMode?: boolean;
}

/** 원본 server/services/agents/ag4-db-finalize.ts:59 finalizeDbOnlyItinerary. */
export async function finalizeDbOnlyItinerary(
  db: Db,
  input: AG4DbInput,
): Promise<any> {
  const _t0 = Date.now();
  const {
    daySlotsConfig,
    travelPace,
    formData,
    companionCount,
    dayCount,
    cityId,
    cityCoords,
    skeleton,
    inputPlaces,
  } = input;

  const eurToKrw = await getEurToKrwRate(db);

  // 원본 :78 식당풀 = 손님상 가능한 전체(가격대 쿼터 없음, 정본 B4).
  //   원본은 생 SQL 이지만 .rows 를 읽으므로(헤더 ④) 같은 조건을 질의빌더로 세운다.
  const pinIdsForMeals = (formData.pinnedPlaceIds ?? []).filter((n: number) =>
    Number.isFinite(n),
  );
  // 원본 ag4-db-finalize.ts:85 = `sql.raw("id IN (...)")` + 숫자만 통과한 값(주석 "숫자만 통과한 값 = 안전").
  //   같은 식을 그대로 쓴다. Number.isFinite 를 통과한 값만 들어가므로 문자열이 낄 수 없다.
  //   (drizzle 의 sql`... IN ${배열}` 은 배열을 매개변수 1개로 묶어 넣어 SQL 이 깨진다 = 쓰지 않는다.)
  const pinCond = pinIdsForMeals.length
    ? sql.raw(`place_seed_raw.id IN (${pinIdsForMeals.map(Number).join(",")})`)
    : sql.raw("FALSE");
  let center: { lat: number; lng: number } | null = cityCoords ?? null;
  if (!center) {
    const cr = await db
      .select({ lat: cities.latitude, lng: cities.longitude })
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);
    const c = cr[0];
    center =
      c && c.lat != null && c.lng != null
        ? { lat: Number(c.lat), lng: Number(c.lng) }
        : null;
  }
  const poolWhere = poolWhereSql(cityId, center);

  const poolRows: any[] = await db
    .select({
      id: placeSeedRaw.id,
      cityId: placeSeedRaw.cityId,
      nameEn: placeSeedRaw.nameEn,
      nameKo: placeSeedRaw.nameKo,
      nameLocal: placeSeedRaw.nameLocal,
      address: placeSeedRaw.address,
      latitude: placeSeedRaw.latitude,
      longitude: placeSeedRaw.longitude,
      priceEur: placeSeedRaw.priceEur,
      summaryKo: placeSeedRaw.summaryKo,
      editorialSummary: placeSeedRaw.editorialSummary,
      imageUrl: placeSeedRaw.imageUrl,
      googlePlaceId: placeSeedRaw.googlePlaceId,
      googleReviewCount: placeSeedRaw.googleReviewCount,
      bestRank: placeSeedRaw.bestRank,
      pinned: sql<boolean>`(${pinCond})`,
    })
    .from(placeSeedRaw)
    .where(
      and(
        poolWhere,
        eq(placeSeedRaw.seedCategory, "restaurant"),
        servingGateSql(),
        sql`(${placeSeedRaw.priceEur} IS NOT NULL OR (${pinCond}))`,
        sql`((${placeSeedRaw.imageUrl} IS NOT NULL AND ${placeSeedRaw.imageUrl} <> '') OR (${pinCond}))`,
      ),
    )
    .orderBy(
      sql.raw(bestRankOrderSql()),
      sql`${placeSeedRaw.googleReviewCount} DESC NULLS LAST`,
    );

  // 원본 :110 = 좌표 0/NULL 제외 후 슬롯 모양으로.
  const restaurantPool =
    input.restaurantPool ??
    (poolRows
      .filter((r) => r.latitude != null && Number(r.latitude) !== 0)
      .map((r) => ({
        id: `db-${r.id}`,
        name: r.nameEn || "",
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        nameKo: r.nameKo,
        nameLocal: r.nameLocal,
        address: r.address,
        estimatedPriceEur: r.priceEur != null ? Number(r.priceEur) : undefined,
        summaryKo: r.summaryKo,
        editorialSummary: r.editorialSummary,
        image: pickPlaceImage(r),
        seedCategory: "restaurant",
        userRatingCount: r.googleReviewCount || 0,
        bestRank: r.bestRank ?? null,
      })) as unknown as PlaceResult[]);

  // 원본 :133 = 도시 시간당요금·예산 경계선 런타임 산출(정본 B4).
  const hourlyRate = await cityHourlyRate(db, cityId);
  const mealTiers = await cityMealTiers(db, cityId);

  const routeResult = buildRouteLocal(
    skeleton,
    inputPlaces,
    cityCoords,
    restaurantPool,
    hourlyRate,
    mealTiers,
    input.bestMode,
  );
  if (!routeResult.ok || !routeResult.response) {
    throw new Error(
      `[AG4-DB] 로컬 동선 생성 실패 (days=0) = daySlotsConfig 비정상 = 뼈대 점검 필요 (elapsedMs=${routeResult.elapsedMs})`,
    );
  }
  const routeResponse = routeResult.response;

  // 창고 되채움(backfill)은 여기서 안 한다 = 읽기 전용 관문. 그 일은 Replit 이 맡는다.

  const inputById = new Map(
    [...inputPlaces, ...(restaurantPool ?? [])].map((p) => [p.id, p]),
  );
  const slotDuration = skeleton.paceConfig.slotDurationMinutes;
  const mealDuration = skeleton.paceConfig.mealDurationMinutes;
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];

  const days: any[] = [];
  let totalPerPersonEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find((c) => c.day === d)!;
    const routeDay = routeResponse.days?.find((rd) => rd.day === d);
    const scenes = routeDay?.scenes || [];

    const lastMealIdx = scenes.reduce(
      (acc, s, i) => (s.type === "restaurant" ? i : acc),
      -1,
    );
    const dayPlaces = scenes.map((scene, sceneIdx) => {
      const isAuto = scene.place_id?.startsWith("auto-");
      const inputPlace = !isAuto ? inputById.get(scene.place_id) : undefined;
      const isMeal = scene.type === "restaurant";
      const mealType: "lunch" | "dinner" | undefined = isMeal
        ? sceneIdx === lastMealIdx
          ? "dinner"
          : "lunch"
        : undefined;
      const mealPrice = isMeal
        ? (scene.price_eur ??
          (mealType === "lunch" ? mealBudget.lunch : mealBudget.dinner))
        : undefined;
      const mealPriceLabel = isMeal
        ? scene.price_eur
          ? `€${scene.price_eur}`
          : mealType === "lunch"
            ? mealBudget.lunchLabel
            : mealBudget.dinnerLabel
        : undefined;
      const displayName = scene.name_en || scene.name_local;
      return {
        id: scene.place_id,
        name: displayName,
        nameEn: displayName,
        nameKo: scene.name_ko,
        nameLocal: scene.name_local,
        address: scene.address,
        lat: scene.lat,
        lng: scene.lng,
        type: scene.type,
        isMealSlot: isMeal,
        mealType,
        seedCategory:
          inputPlace?.seedCategory || (isMeal ? "restaurant" : "attraction"),
        startTime: scene.time,
        endTime: addMinutes(
          scene.time,
          scene.slot_min ?? (isMeal ? mealDuration : slotDuration),
        ),
        estimatedPriceEur: isMeal
          ? scene.price_eur
          : (inputPlace?.estimatedPriceEur ?? 0),
        mealPrice,
        mealPriceLabel,
        image: inputPlace?.image || (scene as any).image || null,
        userRatingCount: inputPlace?.userRatingCount,
        bestRank: (inputPlace as any)?.bestRank ?? null,
        selectionReasons: inputPlace?.selectionReasons || [],
        confidenceLevel: inputPlace?.confidenceLevel || "minimal",
        editorialSummary: scene.shortform_ko || null,
        summaryKo:
          (scene as any).selection_reason_ko || inputPlace?.summaryKo || null,
        distance_from_prev_km: scene.distance_from_prev_km,
        transit_mode: scene.transit_mode,
        transit_min: scene.transit_min,
      };
    });

    const mealCostEur = dayPlaces.reduce(
      (sum, p) => sum + (p.isMealSlot ? sanitizePriceEur(p.mealPrice) : 0),
      0,
    );
    const entranceFeesEur = dayPlaces.reduce(
      (sum, p) =>
        sum + (!p.isMealSlot ? sanitizePriceEur(p.estimatedPriceEur) : 0),
      0,
    );

    const isGuideDay = shouldApplyGuidePrice(
      formData.mobilityStyle,
      formData.travelStyle,
    );
    const transits = scenes.slice(1).map((scene, i) => {
      const cost = isGuideDay ? 0 : estimateTransitCost(scene.transit_mode);
      return {
        from: scenes[i].name_en,
        to: scene.name_en,
        distance: Math.round((scene.distance_from_prev_km || 0) * 1000),
        duration: scene.transit_min,
        mode: scene.transit_mode,
        cost,
        costTotal: cost,
      };
    });
    const transportCostEur = isGuideDay
      ? await guideCostForDay(db, {
          dayConfig,
          companionType: formData.companionType as CompanionType,
          companionCount,
        })
      : transits.reduce((s, t) => s + (t.cost || 0), 0);

    const dailyPerPersonEur =
      Math.round((mealCostEur + entranceFeesEur + transportCostEur) * 100) /
      100;
    const dailyGroupEur =
      Math.round(dailyPerPersonEur * companionCount * 100) / 100;
    const dailyPerPersonKrw = Math.round(dailyPerPersonEur * eurToKrw);
    const dailyGroupKrw = Math.round(dailyGroupEur * eurToKrw);
    totalPerPersonEur += dailyPerPersonEur;

    days.push({
      day: d,
      places: dayPlaces,
      city: formData.destination,
      summary: `${formData.destination} 하루`,
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
      accommodation: cityCoords ? { day: d, coords: cityCoords } : undefined,
      transit: {
        transits,
        totalDuration: transits.reduce((s, t) => s + t.duration, 0),
        totalCost: transits.reduce((s, t) => s + t.costTotal, 0),
        totalDistanceKm: routeDay?.total_distance_km || 0,
      },
      dailyCost: {
        breakdown: {
          mealEur: mealCostEur,
          entranceEur: entranceFeesEur,
          transportEur: transportCostEur,
        },
        mealEur: mealCostEur,
        entranceEur: entranceFeesEur,
        transportEur: transportCostEur,
        totalEur: dailyPerPersonEur,
        totalKrw: dailyGroupKrw,
        perPersonEur: dailyPerPersonEur,
        perPersonKrw: dailyPerPersonKrw,
        groupEur: dailyGroupEur,
        groupKrw: dailyGroupKrw,
      },
    });
  }

  // 원본 :370 = 마지막 슬롯 = 공연장 카드(BTS). 같은 이유로 질의빌더.
  if (formData.finalPlaceId && days.length) {
    const [f] = await db
      .select({
        id: placeSeedRaw.id,
        nameEn: placeSeedRaw.nameEn,
        nameKo: placeSeedRaw.nameKo,
        nameLocal: placeSeedRaw.nameLocal,
        address: placeSeedRaw.address,
        latitude: placeSeedRaw.latitude,
        longitude: placeSeedRaw.longitude,
        seedCategory: placeSeedRaw.seedCategory,
        imageUrl: placeSeedRaw.imageUrl,
        googlePlaceId: placeSeedRaw.googlePlaceId,
        googleReviewCount: placeSeedRaw.googleReviewCount,
        summaryKo: placeSeedRaw.summaryKo,
        editorialSummary: placeSeedRaw.editorialSummary,
      })
      .from(placeSeedRaw)
      .where(eq(placeSeedRaw.id, formData.finalPlaceId));
    if (f && f.latitude != null && Number(f.latitude) !== 0) {
      const lastDay = days[days.length - 1];
      const prev = lastDay.places[lastDay.places.length - 1];
      const lat = Number(f.latitude);
      const lng = Number(f.longitude);
      const km = prev ? haversineKm(prev.lat, prev.lng, lat, lng) : 0;
      const picked = pickTransitMode(km, false);
      const finalTime = formData.finalPlaceTime || "19:00";
      const displayName = f.nameEn || f.nameLocal;
      lastDay.places.push({
        id: `db-${f.id}`,
        name: displayName,
        nameEn: displayName,
        nameKo: f.nameKo,
        nameLocal: f.nameLocal,
        address: f.address,
        lat,
        lng,
        type: "activity",
        isMealSlot: false,
        mealType: undefined,
        seedCategory: f.seedCategory,
        startTime: finalTime,
        endTime: addMinutes(finalTime, 180),
        estimatedPriceEur: null,
        mealPrice: undefined,
        mealPriceLabel: undefined,
        image: pickPlaceImage(f) || null,
        userRatingCount: f.googleReviewCount || 0,
        summaryKo: f.summaryKo,
        editorialSummary: f.editorialSummary,
        distance_from_prev_km: Math.round(km * 10) / 10,
        transit_mode: picked.mode,
        transit_min: prev
          ? Math.max(
              1,
              Math.round((km / (picked.calc === "WALK" ? 4 : 25)) * 60),
            )
          : 0,
      });
    }
  }

  const totalGroupEur =
    Math.round(totalPerPersonEur * companionCount * 100) / 100;
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);
  const totalGroupKrw = Math.round(totalGroupEur * eurToKrw);
  const totalPlaces = days.reduce((s, d) => s + d.places.length, 0);

  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || "09:00",
    endTime: formData.endTime || "21:00",
    days,
    vibeWeights: skeleton.vibeWeights,
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    totalCost: {
      perPersonEur: totalPerPersonEur,
      perPersonKrw: totalPerPersonKrw,
      groupEur: totalGroupEur,
      groupKrw: totalGroupKrw,
      eurToKrwRate: eurToKrw,
      currency: "EUR",
    },
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace,
      totalPlaces,
      companionType: formData.companionType,
      companionCount,
      curationFocus: formData.curationFocus,
      transportCategory: shouldApplyGuidePrice(
        formData.mobilityStyle,
        formData.travelStyle,
      )
        ? "guide"
        : "transit",
      generatedAt: new Date().toISOString(),
      pipelineVersion: "db-only-v2-scene-direct",
      route: {
        elapsedMs: routeResult.elapsedMs,
        totalDistanceKm: routeResponse.total_distance_km,
        totalDurationSec: routeResponse.total_duration_sec,
        // ⚠️ 원본과의 의도된 차이 = Worker 는 백필을 띄우지 않는다(위 :? 주석).
        backfill: "skipped (worker db-only = read only)",
      },
    },
    _elapsedMs: Date.now() - _t0,
  };
}
