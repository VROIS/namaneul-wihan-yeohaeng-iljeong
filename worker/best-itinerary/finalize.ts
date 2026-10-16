// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 여정 완성(워커 DB-only·베스트) = 식사 추정·글자·시간당 요금·식당 분포 = shared 1벌 (정본 §)

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
import { addMinutes, guideCostForDay } from "./pricing";
import { shouldApplyGuidePrice } from "../lib/services/transport/guide-pricing";
import type { Db } from "../db-types";

const { cities, placeSeedRaw } = schema;

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
    })
    .from(placeSeedRaw)
    .where(
      and(
        poolWhere,
        eq(placeSeedRaw.seedCategory, "restaurant"),
        servingGateSql(),
        sql`${placeSeedRaw.priceEur} IS NOT NULL`,
        sql`(${placeSeedRaw.imageUrl} IS NOT NULL AND ${placeSeedRaw.imageUrl} <> '')`,
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

    const dayPlaces = scenes.map((scene) => {
      const isAuto = scene.place_id?.startsWith("auto-");
      const inputPlace = !isAuto ? inputById.get(scene.place_id) : undefined;
      const isMeal = scene.type === "restaurant";
      const mealType = scene.meal_type;
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
        // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 베스트 여정도 모르는 가격은 0 이 아니라 비움(MIX 와 같은 규칙 = 화면은 가격 줄을 안 그린다) (정본 §)
        estimatedPriceEur: isMeal
          ? scene.price_eur
          : (inputPlace?.estimatedPriceEur ?? null),
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
        transit_min: routeResponse.days?.find((rd) => rd.day === lastDay.day)
          ?.final_move_min,
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
        backfill: "skipped (worker db-only = read only)",
      },
    },
    _elapsedMs: Date.now() - _t0,
  };
}
