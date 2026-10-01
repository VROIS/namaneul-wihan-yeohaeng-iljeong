// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 여정 완성(워커 DB-only·베스트) = 식사 추정·글자·시간당 요금·식당 분포 = shared 1벌 (정본 §)

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";

import {
  poolWhereSql,
  servingGateSql,
} from "../lib/services/shared/pool-radius";
import { cityHourlyRate } from "../lib/services/shared/slot-duration";
import {
  cityMealTiers,
  tierEstimate,
  tierLabel,
} from "../lib/services/shared/meal-budget-tiers";

import {
  type AG1Output,
  type DaySlotConfig,
  type PlaceResult,
  type TravelPace,
  type TripFormData,
} from "../lib/services/agents/types";
import {
  normalizeTravelStyle,
  sanitizePriceEur,
} from "../lib/services/agents/pipeline-v3-types";
import {
  haversineKm,
  pickTransitMode,
  estimateTransitCost,
} from "../lib/services/agents/transit-haversine";
import { bestRankOrderSql } from "../lib/services/shared/best-rank";
import { type CompanionType } from "../lib/services/transport/constants";
import { buildRouteLocal } from "../lib/services/route/route-local";

import {
  loadImagePidMap,
  pickPlaceImage,
} from "../lib/services/shared/place-image";
import { addMinutes, guideCostForDay, shouldApplyGuidePrice } from "./pricing";

const { cities, placeSeedRaw } = schema;

type Db = PostgresJsDatabase<typeof schema>;

// ── AG4 = 완성 ───────────

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

  // 식당풀 = 손님상 가능한 전체(가격대 쿼터 없음, 정본 B4).
  //   원본은 생 SQL 이지만 .rows 를 읽으므로(헤더 ④) 같은 조건을 질의빌더로 세운다.
  const pinIdsForMeals = (formData.pinnedPlaceIds ?? []).filter((n: number) =>
    Number.isFinite(n),
  );
  // `sql.raw("id IN (...)")` + 숫자만 통과한 값 = 안전.
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

  // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 식당풀을 스스로 뽑을 때만 PID공유 폴백 목록을 읽는다
  const imagePidMap: Map<string, string> = input.restaurantPool
    ? new Map()
    : await loadImagePidMap([cityId, ...poolRows.map((r) => r.cityId)]);

  // 좌표 0/NULL 제외 후 슬롯 모양으로.
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
        image: pickPlaceImage(r, imagePidMap),
        seedCategory: "restaurant",
        userRatingCount: r.googleReviewCount || 0,
        bestRank: r.bestRank ?? null,
      })) as unknown as PlaceResult[]);

  // 도시 시간당요금·예산 경계선 런타임 산출(정본 B4).
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

  // 창고 되채움(backfill)은 여기서 안 한다 = 읽기 전용 관문.

  const inputById = new Map(
    [...inputPlaces, ...(restaurantPool ?? [])].map((p) => [p.id, p]),
  );
  const slotDuration = skeleton.paceConfig.slotDurationMinutes;
  const mealDuration = skeleton.paceConfig.mealDurationMinutes;
  const style = normalizeTravelStyle(formData.travelStyle);

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
      // ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 가격 모르는 식사 = 그 도시 분포 구간의 추정값·글자(고정 유로 폐기 §19), 분포가 없으면 비움 (정본 B4)
      const mealPrice = isMeal
        ? (scene.price_eur ??
          (mealTiers ? tierEstimate(style, mealTiers) : undefined))
        : undefined;
      const mealPriceLabel = isMeal
        ? scene.price_eur
          ? `€${scene.price_eur}`
          : mealTiers
            ? tierLabel(style, mealTiers)
            : undefined
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
        perPersonEur: dailyPerPersonEur,
        groupEur: dailyGroupEur,
      },
    });
  }

  // 마지막 슬롯 = 공연장 카드(BTS). 같은 이유로 질의빌더.
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
        image: pickPlaceImage(f, imagePidMap) || null,
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
      groupEur: totalGroupEur,
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
