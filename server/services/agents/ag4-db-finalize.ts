// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = DB-only 전용 AG4 = scene 직접 사용
// = 옛 itinerary-generator 슬롯 강제 분배 + calcTransitHaversine 자체 계산 = 완전 폐기 (= 단계 4)
// = 동선 = buildRouteLocal(로컬 NN+Haversine) 단일 SSOT = scene 직접 24 슬롯 + scene 의 distance / transit_mode / transit_min 직접 사용
// 🗑️ 2026-07-05 = 옛 Gemini/legacy fallback 서술 = "새||옛" 폴백 박제 = 삭제 §0/§19
// = backfill = fire-and-forget (= FE 우선 노출 + background)
// = dailyPerPersonEur = 1 인 단가 그대로 + group = × companionCount 별도

import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
// 🧠 2026-07-05 = 환율 EUR→KRW 단일 SSOT import(§16, 로컬 3벌 복붙 폐기)
import { getEurToKrwRate } from "../exchange-rate";
import type {
  PlaceResult,
  TripFormData,
  DaySlotConfig,
  TravelPace,
  AG1Output,
} from "./types";
import { MEAL_BUDGET } from "./types";
// ⚠️ 2026-07-06 사장님 SSOT = 대중교통 구간당 균일 예상가 = 단일 SSOT(§16) = transit-haversine 로 이동(옛 ag4 로컬정의 삭제) = MIX·DB-only 공통.
import { estimateTransitCost } from "./transit-haversine";
// ⚠️ 수정금지(승인필요) 2026-06-06 = DB-only 동선 = 로컬 NN+Haversine (= Stage C) 단일 SSOT
// 🗑️ 2026-07-05 = handleRouteRequest(Gemini) import·RouteResponse(미사용) import = 옛 폴백 잔재 = 삭제 §0/§19
import { buildRouteLocal } from "../route/route-local";
import { backfillFromRoute } from "../route/route-backfill";
// ⚠️ 2026-07-04 사장님 SSOT = 드라이빙 가이드 가격 = 재발명 금지(§16) = MIX 경로(pipeline-v3.ts)와 동일한 단일 SSOT 재사용.
// ⚠️ 2026-07-06 사장님 SSOT = 가이드 하루요금 = guideCostForDay 공용 SSOT(옛 로컬 guideCostPerPersonPerDay 승격, 3경로 공유 §16).
import { shouldApplyGuidePrice, guideCostForDay } from "../transport-pricing-service";
// ⚠️ 2026-07-17 사장님 확정 = 식당풀 = (city_id=요청도시) ∪ (중심 100km) 합집합 = shared/pool-radius 단일 SSOT(§16)
import { getPoolContext } from "../shared/pool-radius";

// 🗑️ 2026-07-05 = getEurToKrwRate 로컬정의 삭제 = shared/exchange-rate.ts 단일 SSOT 통합(§16 재발명금지, 3벌→1벌)

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// 🗑️ 2026-07-06 = estimateTransitCost 로컬정의 삭제 = transit-haversine.ts 단일 SSOT 이동(§16 재발명금지, MIX·DB-only 공통) §19

// 🗑️ 2026-07-06 = guideCostPerPersonPerDay 로컬정의 삭제 §19 = transport-pricing-service.guideCostForDay 단일 SSOT 승격(3경로 공유, MIX/숙소재계산이 못써서 flat 재발명하던 결함 근본해결).

export interface AG4DbInput {
  daySlotsConfig: DaySlotConfig[];
  travelPace: TravelPace;
  formData: TripFormData;
  companionCount: number;
  dayCount: number;
  cityId?: number | null;
  cityCoords?: { lat: number; lng: number };
  skeleton: AG1Output;
  inputPlaces: PlaceResult[];
}

/**
 * AG4-DB 메인 = buildRouteLocal 동선 → scene 직접 사용 (= 사용자 SSOT 2026-05-26 단계 4)
 * = 로컬 동선 24 씬 = 그대로 일자별 슬롯 = FE 노출
 * 🗑️ 2026-07-05 = 옛 "실패 = itinerary fallback(안전망)" 서술 = 삭제 §0/§19
 */
export async function finalizeDbOnlyItinerary(input: AG4DbInput): Promise<any> {
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

  const eurToKrw = await getEurToKrwRate('[AG4-DB]');

  // ===== 1. 동선 = 로컬 NN+Haversine 단일 SSOT (= DB-only 자체 해결, $0/~3ms) (= Stage C 2026-06-06) =====
  // 🗑️ 2026-07-05 = USE_LOCAL_ROUTE 롤백 토글 + Gemini 우선 삼항 = "새||옛" 폴백 = 삭제 §0/§19 (buildRouteLocal 단일 경로)

  // ⚠️ 수정금지(승인필요) 2026-06-13 사용자 SSOT = DB-only 식당풀 = 가격대 구간별 RC TOP 만 (= eco20/reason40/premium20, zone 구분 없이 도시 전체)
  //   = 옛 버그(2026-06-06): 가격보유 식당 전체(410곳)를 풀로 넘김 → route-local 이 인접픽 → RC 랭킹 밖(300위권~바닥)
  //     이미지/PID 없는 부실 식당이 동선에 노출됨(2026-06-13 시뮬 입증: Mokus 402위, Le Chateaubriand 316위 노출).
  //   = 수정: 가격대 구간(MEAL_BUDGET 경계 = eco≤24 / reason 25~60 / premium 61~180 / luxury 181+)별로
  //     RC DESC ROW_NUMBER ≤ 구간정원(20/40/20/20)만 풀에 포함. rank 는 rc-rerank 가 이미 RC 반영 → TOP = 완비 식당.
  //   → route-local 2차 = 이 TOP 풀에서 슬롯 앵커 거리순 인접픽 (= 부실 바닥식당 원천 제외).
  let restaurantPool: PlaceResult[] = [];
  if (cityId && db) {
    // ⚠️ 2026-07-17 사장님 확정 = 풀 = (city_id=요청도시) ∪ (좌표 유효 100km 이내) 합집합(§16 pool-radius)
    //   = 크로스도시 시내 식당 포함(실증: 본(134) 소속 디종 시내 Loiseau des Ducs 가 디종 풀에서 안 보이던 결함 해소)
    const { where: poolWhere } = await getPoolContext(cityId, cityCoords); // 2026-07-17 = 기점 = 동적 출발점(cityCoords = 숙소>도심, day-builder 우선순위 반영값)
    const rows = (await db!.execute(sql`
      WITH banded AS (
        SELECT id, name_en AS "nameEn", name_ko AS "nameKo", name_local AS "nameLocal", address,
               latitude, longitude, price_eur AS "priceEur", summary_ko AS "summaryKo",
               editorial_summary AS "editorialSummary", image_url AS "imageUrl",
               google_review_count AS "googleReviewCount",
               CASE WHEN price_eur <= 24 THEN 20 WHEN price_eur <= 60 THEN 40 WHEN price_eur <= 180 THEN 20 ELSE 20 END AS quota,
               ROW_NUMBER() OVER (
                 PARTITION BY CASE WHEN price_eur <= 24 THEN 'eco' WHEN price_eur <= 60 THEN 'reason' WHEN price_eur <= 180 THEN 'premium' ELSE 'luxury' END
                 ORDER BY google_review_count DESC NULLS LAST
               ) AS band_rn
        FROM place_seed_raw
        WHERE (${poolWhere}) AND seed_category = 'restaurant' AND price_eur IS NOT NULL
      )
      SELECT * FROM banded WHERE band_rn <= quota ORDER BY "googleReviewCount" DESC NULLS LAST
    `)) as unknown as { rows: Array<Record<string, any>> };
    restaurantPool = (rows.rows || [])
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
        image: r.imageUrl || "",
        seedCategory: "restaurant",
        userRatingCount: r.googleReviewCount || 0,
      })) as unknown as PlaceResult[];
    console.log(
      `[AG4-DB] 🍽️ 식당풀 DB 조회 = ${restaurantPool.length}곳 (= 가격대구간별 RC TOP eco20/reason40/premium20/luxury20, 부실 바닥식당 제외)`,
    );
  }

  // 🗑️ 2026-07-05 = 옛 Gemini 삼항·localInsufficient 재호출·legacy fallback = "새||옛" 폴백 = 삭제 §0/§19
  const routeResult = buildRouteLocal(skeleton, inputPlaces, cityCoords, restaurantPool);
  console.log(`[AG4-DB] ✅ 동선 = 로컬 NN+Haversine (${routeResult.elapsedMs}ms, Gemini 0)`);

  // buildRouteLocal 은 daySlotsConfig 를 순회해 days 를 채우므로 정상 뼈대면 항상 ok.
  // !ok = daySlotsConfig 자체가 비어있는 malformed 뼈대뿐 → 옛 파이프라인 부활 없이 명확한 에러(§0).
  if (!routeResult.ok || !routeResult.response) {
    throw new Error(
      `[AG4-DB] 로컬 동선 생성 실패 (days=0) = daySlotsConfig 비정상 = 뼈대 점검 필요 (elapsedMs=${routeResult.elapsedMs})`,
    );
  }

  const routeResponse = routeResult.response;

  // ===== 2. 백필 = background fire-and-forget (= FE 우선 노출) =====
  if (cityId) {
    backfillFromRoute(routeResponse, cityId, inputPlaces).catch((e: any) =>
      console.warn(`[Route-Backfill] ❌ background error:`, e?.message || e),
    );
  }

  // ===== 3. scene 직접 24 슬롯 사용 =====
  const inputById = new Map(inputPlaces.map((p) => [p.id, p]));
  const slotDuration = skeleton.paceConfig.slotDurationMinutes;
  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];

  // ⚠️ 2026-05-26 = 사용자 SSOT = scene 검증 (= 안전망)
  // = prompt 강제 + 코드 검증 양면 = 환각 차단
  const globalPlaceIdCounts = new Map<string, number>();
  for (const rd of routeResponse.days || []) {
    for (const sc of rd.scenes || []) {
      if (sc.place_id && !sc.place_id.startsWith("auto-")) {
        globalPlaceIdCounts.set(
          sc.place_id,
          (globalPlaceIdCounts.get(sc.place_id) || 0) + 1,
        );
      }
    }
  }
  const dupIds = [...globalPlaceIdCounts.entries()].filter(([, c]) => c > 1);
  if (dupIds.length > 0) {
    dupIds.forEach(([id, c]) =>
      console.warn(`[AG4-DB] ⚠️ place_id 중복 (${c}회 사용): ${id}`),
    );
  }

  const days: any[] = [];
  let totalPerPersonEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const dayConfig = daySlotsConfig.find((c) => c.day === d)!;
    const routeDay = routeResponse.days?.find((rd) => rd.day === d);
    const scenes = routeDay?.scenes || [];

    // ⚠️ 2026-05-26 = 일자별 검증 = 사용자 SSOT 위반 검출
    const lastScene = scenes[scenes.length - 1];
    if (lastScene && lastScene.type !== "restaurant") {
      console.warn(
        `[AG4-DB] ⚠️ Day ${d} 마지막 슬롯 = activity (= 저녁 식당 강제 위반): ${lastScene.name_local || lastScene.name_en || "(name null)"}`,
      );
    }
    // ⚠️ 2026-05-31 = 사용자 SSOT = prompt 가 name_en 미요청 (= name_local 단일) = 워닝 조건 시정
    // = 진짜 결함 = 표시 이름(name_local) + 매칭(inputPlace) 둘 다 없을 때만
    const nameless = scenes.filter(
      (s) => !s.name_local && !s.name_en && !inputById.get(s.place_id),
    );
    if (nameless.length > 0) {
      nameless.forEach((s) =>
        console.warn(
          `[AG4-DB] ⚠️ Day ${d} scene 표시 이름 없음: slot=${s.slot} type=${s.type} place_id=${s.place_id}`,
        ),
      );
    }

    // ⚠️ 2026-06-06 = mealType = 위치 기반 (= 일자 마지막 식당 scene = 저녁 / 그 외 = 점심)
    //   = 짧은 날(활동 적음) 저녁이 13:00 등에 떨어져 classifyMealType(시각<15시)이 "점심"으로 오분류되는 버그 수정
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

      // ⚠️ 2026-06-12 = 매트릭스 폴백 = 안전망(유지)이나 정상 경로(식당풀 isNotNull(priceEur))에선 0건이어야 함. 발생 시 = 데이터 결손 신호 = warn.
      if (isMeal && scene.price_eur == null) {
        console.warn(`[AG4-DB] ⚠️ meal price 매트릭스 폴백 발생 = ${scene.name_local || scene.name_en || scene.place_id} (= PSR price_eur NULL = 식당풀 게이트 누수 점검)`);
      }
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

      // ⚠️ 2026-05-26 = 사용자 SSOT = name_en = 보조 = name_local fallback (= FE 표시)
      const displayName = scene.name_en || scene.name_local;
      return {
        // 식별 (= FE 호환 = PlaceResult 양식)
        id: scene.place_id,
        name: displayName,
        nameEn: displayName,
        nameKo: scene.name_ko,
        nameLocal: scene.name_local,
        address: scene.address,
        lat: scene.lat,
        lng: scene.lng,
        // 분류
        type: scene.type,
        isMealSlot: isMeal,
        mealType,
        seedCategory:
          inputPlace?.seedCategory || (isMeal ? "restaurant" : "attraction"),
        // 시간
        startTime: scene.time,
        endTime: addMinutes(scene.time, slotDuration),
        // 가격
        estimatedPriceEur: isMeal
          ? scene.price_eur
          : (inputPlace?.estimatedPriceEur ?? 0),
        mealPrice,
        mealPriceLabel,
        // FE 표시 보강 (= inputPlace = PSR 데이터 = 이미지/리뷰수 등)
        // ⚠️ 2026-06-12 = 식당풀 픽(inputPlace 밖) = scene.image(route-local 이 PSR image_url 탑재) fallback = 식당 이미지 노출
        image: inputPlace?.image || (scene as any).image || null,
        userRatingCount: inputPlace?.userRatingCount,
        selectionReasons: inputPlace?.selectionReasons || [],
        confidenceLevel: inputPlace?.confidenceLevel || "minimal",
        // ⚠️ 수정금지(승인필요) 2026-06-24 사용자 SSOT = 슬롯 한줄요약 = editorial_summary 단일 (모든 경로 통일).
        //   route-local 이 scene.shortform_ko 에 PSR.editorial_summary 를 탑재 → FE 노출용 editorialSummary 단일 매핑.
        //   옛 selectionReasonKo/shortformKo 노출 필드 완전 삭제(§19). scene.selection_reason_ko(=summary_ko) = 숏폼 재료 = route-backfill 백필 경로로만 보전.
        editorialSummary: scene.shortform_ko || null,
        // 동선 = scene 직접
        distance_from_prev_km: scene.distance_from_prev_km,
        transit_mode: scene.transit_mode,
        transit_min: scene.transit_min,
      };
    });

    // ===== 비용 합산 =====
    const mealCostEur = dayPlaces.reduce(
      (sum, p) => sum + (p.isMealSlot && p.mealPrice ? p.mealPrice : 0),
      0,
    );
    const entranceFeesEur = dayPlaces.reduce(
      (sum, p) =>
        sum +
        (!p.isMealSlot && typeof p.estimatedPriceEur === "number"
          ? p.estimatedPriceEur
          : 0),
      0,
    );

    // ===== 교통 = 대중교통 구간별 추정 + 드라이빙 가이드 하루 1회 실가격 =====
    // ⚠️ 2026-07-04 사장님 SSOT = 드라이빙 가이드는 구간별 계산 금지(반일요금 개념 없어 비현실적으로 쌈, §0 옛것 완전삭제).
    //   MIX 경로와 동일한 shouldApplyGuidePrice + calculateTransportPrice 재사용(§16) = 하루 가용시간 기준 1회 계산.
    const isGuideDay = shouldApplyGuidePrice(formData.mobilityStyle, formData.travelStyle);
    const transits = scenes.slice(1).map((scene, i) => {
      const cost = isGuideDay ? 0 : estimateTransitCost(scene.transit_mode); // 가이드 = 구간 표시 FE 숨김, 일 총합에만 반영
      return {
        from: scenes[i].name_en,
        to: scene.name_en,
        distance: Math.round((scene.distance_from_prev_km || 0) * 1000), // ⚠️ 2026-06-06 = km→m (= FE ÷1000·MIX 미터 표준 정합 = "0.0km" 버그 수정)
        duration: scene.transit_min,
        mode: scene.transit_mode,
        cost,
        costTotal: cost,
      };
    });
    const transportCostEur = isGuideDay
      ? await guideCostForDay({ dayConfig, companionType: formData.companionType as any, companionCount, mobilityStyle: formData.mobilityStyle, travelStyle: formData.travelStyle, dayCount })
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
      transit: {
        transits,
        totalDuration: transits.reduce((s, t) => s + t.duration, 0),
        totalCost: transits.reduce((s, t) => s + t.costTotal, 0),
        totalDistanceKm: routeDay?.total_distance_km || 0,
      },
      dailyCost: {
        // ⚠️ 2026-06-06 = FE 는 dc.breakdown.{...} 중첩을 읽음 (= MIX pipeline-v3 구조 일치) = 카테고리별 비용(교통/식사/입장료) 표시
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

  const totalGroupEur =
    Math.round(totalPerPersonEur * companionCount * 100) / 100;
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);
  const totalGroupKrw = Math.round(totalGroupEur * eurToKrw);
  const totalPlaces = days.reduce((s, d) => s + d.places.length, 0);

  console.log(
    `[AG4-DB] ✅ 실시간 완성 (${Date.now() - _t0}ms): ${days.length}일, ${totalPlaces}곳 = scene 직접`,
  );
  console.log(
    `[AG4-DB] 💰 인당: €${totalPerPersonEur.toFixed(2)} / ₩${totalPerPersonKrw.toLocaleString()}`,
  );
  console.log(
    `[AG4-DB] 💰 그룹 ${companionCount}인: €${totalGroupEur.toFixed(2)} / ₩${totalGroupKrw.toLocaleString()}`,
  );
  console.log(
    `[AG4-DB] 🛣️ route Gemini (${routeResult.elapsedMs}ms): ${routeResponse.days?.length || 0}일 동선 = scene 직접 사용`,
  );
  console.log(`[AG4-DB] 🍽️ route 백필 (= background = FE 응답 후 비동기 진행)`);

  return {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || "09:00",
    endTime: formData.endTime || "21:00",
    days,
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
      // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 확정 교통수단 = MIX(pipeline-v3:1157)와 동형 방출(§20 전수).
      //   = 이 값이 없으면 AI의견이 DB-only 가이드 여정을 대중교통 전제로 오판(서버 재계산 폐기 2026-07-10과 세트).
      transportCategory: shouldApplyGuidePrice(formData.mobilityStyle, formData.travelStyle) ? "guide" : "transit",
      generatedAt: new Date().toISOString(),
      pipelineVersion: "db-only-v2-scene-direct",
      route: {
        elapsedMs: routeResult.elapsedMs,
        totalDistanceKm: routeResponse.total_distance_km,
        totalDurationSec: routeResponse.total_duration_sec,
        backfill: "background fire-and-forget",
      },
    },
  };
}

// 🗑️ 2026-07-05 = finalizeWithLegacyItinerary(201줄) 전체 삭제 = 옛 _enrichmentPipeline 슬롯강제분배 dynamic import 부활 = 헤더가 "완전폐기" 선언한 걸 fallback으로 되살림 = 똥덮기 §0/§19. 동선 실패 = buildRouteLocal 단일 SSOT 에서 명확한 에러(위 참조).
