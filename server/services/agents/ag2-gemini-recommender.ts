/** ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = AG2 = DB-only 단일 진입점 */

import type { AG1Output, PlaceResult, SeedCategory } from "./types";
import { MEAL_BUDGET } from "./types";
// ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인(실측 버그수정) = MIX(pipeline-v3) 3개 파일과 동일하게 정규화 필수.
import { normalizeTravelStyle } from "./pipeline-v3-types";
// ⚠️ 수정금지(승인필요) 2026-05-20 = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage, loadImagePidMap } from "../shared/place-image";
// ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 의도 = AG2 데이터 출처 = place_seed_raw 우선
import { db } from "../../db";
import { placeSeedRaw } from "@shared/schema";
import { eq, and, between, sql, inArray, isNotNull } from "drizzle-orm";
import { findCityUnified } from "../city-resolver";
// ⚠️ 2026-07-17 사장님 확정 = 슬롯 풀 = (city_id=요청도시) ∪ (중심 100km) 합집합 = shared/pool-radius 단일 SSOT(§16)
import {
  getPoolContext,
  recalcCrossCityZone,
  servingGateSql,
} from "../shared/pool-radius";
import { VIBE_PRIMARY_CATEGORY } from "@shared/vibe-category";

// ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 도시 입력 시점 분기(백엔드만), 임계값 200(발굴 도시 행수≥200 → DB-only, 미만 → Gemini+Google fallback), 상세 경위는 정본문서
export const READY_THRESHOLD = 200;

export async function isCityReady(
  destination: string,
  // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 도시중심좌표(불변키) = ready 판정(DB-only vs MIX 라우팅)도 좌표 우선.
  destinationCoords?: { lat: number; lng: number } | null,
): Promise<{
  ready: boolean;
  cityId: number | null;
  cityName: string;
  count: number;
  latitude: number | null;
  longitude: number | null;
}> {
  if (!db)
    return {
      ready: false,
      cityId: null,
      cityName: destination,
      count: 0,
      latitude: null,
      longitude: null,
    };

  const cityResult = await findCityUnified(destination, destinationCoords);
  const cityId = cityResult?.cityId;
  if (!cityId) {
    return {
      ready: false,
      cityId: null,
      cityName: destination,
      count: 0,
      latitude: null,
      longitude: null,
    };
  }

  // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = collection_phase 완전 폐기 (= 같은 장소 = 다른 phase = 같은 데이터)
  // 🧠 2026-07-05 사장님 SSOT = 전체 행수 COUNT (= 후보군 포함). 옛 rank 1-20 제한(2026-05-07) 폐기(§19) = 도시특성이 전체 발굴량에 반영됨.
  const countRows = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, cityId));
  const count = Number(countRows[0]?.count || 0);
  // ⚠️ 수정금지(승인필요) 2026-08-13 = 좌표는 findCityUnified 가 이미 조회한 값(새 조회 0).
  return {
    ready: count >= READY_THRESHOLD,
    cityId,
    cityName: cityResult.name,
    count,
    latitude: cityResult.latitude ?? null,
    longitude: cityResult.longitude ?? null,
  };
}

// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인 = AG2-DB는 place_seed_raw 직접 SELECT(외부 API 호출 0, 미발굴 도시는 Gemini fallback), VIBE_PRIMARY_CATEGORY는 vibe-category.ts 1벌 재수출(§16)
export { VIBE_PRIMARY_CATEGORY } from "@shared/vibe-category";

// 🧠 2026-07-05 사장님 SSOT = vibe → 6카테고리 슬롯 분배 = 단일 SSOT(§16 재발명금지). DB-only(fetchFromPlaceSeedRaw)와 MIX(pipeline-v3 프롬프트) 공용.
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

async function fetchFromPlaceSeedRaw(
  skeleton: AG1Output,
  // ⚠️ 수정금지(승인필요) 2026-05-24 = isCityReady 결과 재사용 (= findCityUnified 2 회 호출 회피)
  preResolvedCity?: { cityId: number; name: string },
): Promise<PlaceResult[] | null> {
  const _t0 = Date.now();
  const { formData, vibeWeights, requiredPlaceCount } = skeleton;
  if (!db) return null;

  let cityId: number | undefined = preResolvedCity?.cityId;
  let cityName: string = preResolvedCity?.name ?? formData.destination;
  if (!cityId) {
    // ⚠️ 2026-07-08 사장님 SSOT = 좌표(불변키) 전달 = 중복도시·재발굴 차단.
    const cityResult = await findCityUnified(
      formData.destination,
      formData.destinationCoords,
    );
    cityId = cityResult?.cityId;
    cityName = cityResult?.name ?? formData.destination;
    if (!cityId) {
      console.log(
        `[AG2-DB] 도시 "${formData.destination}" 미발견 = Gemini fallback`,
      );
      return null;
    }
  }
  // ⚠️ 2026-07-17 사장님 확정 = 풀 컨텍스트(중심좌표 + 합집합 WHERE) 1회 확보 = 아래 카테고리별 SELECT 공용
  const cid: number = cityId;
  const { center, where: poolWhere } = await getPoolContext(
    cid,
    (formData as any).accommodationCoords ?? null,
  );

  // 🧠 2026-07-05 사장님 SSOT = vibe → 카테고리 슬롯 분배 = computeCatSlots 단일 SSOT(§16). 옛 인라인 계산 폐기(§19) = 로직 그대로 함수로 이동(DB-only 동작 불변).
  const totalSlots = requiredPlaceCount;
  const dayCount = skeleton.dayCount || skeleton.daySlotsConfig?.length || 3;
  const catSlots = computeCatSlots(vibeWeights, totalSlots, dayCount);

  console.log(
    `[AG2-DB] 도시 "${cityName}" (id=${cityId}) 카테고리 슬롯:`,
    catSlots,
  );

  // ⚠️ 수정금지(승인필요) 2026-05-19 = budget 매트릭스 (= 4:6 split)
  const budgetTier = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];
  console.log(
    `[AG2-DB] travelStyle=${formData.travelStyle} = price €${budgetTier.min}-${budgetTier.max} (lunch ≤€${budgetTier.lunch} / dinner ≤€${budgetTier.dinner})`,
  );

  const SELECT_COLS = {
    id: placeSeedRaw.id,
    cityId: placeSeedRaw.cityId,
    nameEn: placeSeedRaw.nameEn,
    nameKo: placeSeedRaw.nameKo,
    // ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT = nameLocal (= buildRouteInputJson `name_local` 정확 inject)
    nameLocal: placeSeedRaw.nameLocal,
    googlePlaceId: placeSeedRaw.googlePlaceId,
    googleMapsUri: placeSeedRaw.googleMapsUri,
    address: placeSeedRaw.address,
    latitude: placeSeedRaw.latitude,
    longitude: placeSeedRaw.longitude,
    imageUrl: placeSeedRaw.imageUrl, // ⚠️ 2026-06-11 = image_url(구글 PM) 1종
    summaryKo: placeSeedRaw.summaryKo,
    editorialSummary: placeSeedRaw.editorialSummary,
    seedCategory: placeSeedRaw.seedCategory,
    rank: placeSeedRaw.rank,
    googleReviewCount: placeSeedRaw.googleReviewCount,
    priceEur: placeSeedRaw.priceEur,
    dayZone: placeSeedRaw.dayZone,
  };

  // ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인(실측 버그수정, §systemic) = core:outskirt 고정 2:3 비율 삭제.
  // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 정렬 = 전 카테고리(식당 포함) 공통 rank ASC NULLS LAST → 동순위 google_review_count DESC 1벌.
  const selectByDayZone = async (cat: string, slots: number) => {
    const isRestaurant = cat === "restaurant";
    // ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = 검증(PID) 게이트 = 미검증(TS 한 번도 안 거친) 행은 손님상 서빙 금지.
    const baseWhere = [
      poolWhere,
      eq(placeSeedRaw.seedCategory, cat),
      isNotNull(placeSeedRaw.googlePlaceId),
      // ⚠️ 2026-08-24 사장님 육안검수 반영 = 손님상 게이트 1벌(status='active' + RC 증거).
      servingGateSql(),
    ];
    if (isRestaurant)
      baseWhere.push(
        between(placeSeedRaw.priceEur, budgetTier.min, budgetTier.max),
      );
    const rows: any[] = await db!
      .select(SELECT_COLS)
      .from(placeSeedRaw)
      .where(and(...baseWhere));
    for (const r of rows) recalcCrossCityZone(r, cid, center);
    const rc = (r: any) => r.googleReviewCount ?? -1;
    // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 전 카테고리 공통 rank ASC NULLS LAST → RC DESC(rank = autorank 트리거 SSOT).
    rows.sort(
      (a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) -
          (b.rank ?? Number.MAX_SAFE_INTEGER) || rc(b) - rc(a),
    );
    // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인(엔진결함 근원수정) = day_zone 필터 삭제(옛 2026-05-21 §19).
    const picked = rows.slice(0, slots);
    const coreRows = picked.filter((r) => r.dayZone === "core");
    const outskirtRows = picked.filter((r) => r.dayZone === "outskirt");
    const crossCount = picked.filter((r) => r.cityId !== cid).length;
    const budgetLabel = isRestaurant
      ? ` (budget €${budgetTier.min}-${budgetTier.max})`
      : " (rank ASC)";
    console.log(
      `[AG2-DB] ${cat}: 통합 ${picked.length}/${slots}(core ${coreRows.length}+outskirt ${outskirtRows.length})${budgetLabel}${crossCount ? ` [크로스도시 ${crossCount}곳 포함]` : ""}`,
    );
    return picked;
  };

  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인(BTS D단계 BE-3) = 핀 주입 = 고른 장소는 반드시 포함.
  const pinIds = (formData.pinnedPlaceIds ?? []).filter((n) =>
    Number.isFinite(n),
  );
  // ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 핀이 있으면(=BTS "같이 떠나요" 전용, pinnedPlaceIds 는
  const allRows: any[] = [];
  if (!pinIds.length) {
    try {
      const queries = Object.entries(catSlots)
        .filter(([_, slots]) => slots > 0)
        .map(([cat, slots]) => selectByDayZone(cat, slots));
      const results = await Promise.all(queries);
      for (const rows of results) allRows.push(...rows);
    } catch (e: any) {
      console.error(`[AG2-DB] ❌ SELECT 실패:`, e.message);
      return null;
    }
  } else {
    console.log(
      `[AG2-DB] 📌 핀 전용 모드(BTS) = 카테고리 추가채우기 건너뜀(${pinIds.length}곳만 사용)`,
    );
  }

  if (pinIds.length) {
    const pinRows: any[] = await db!
      .select(SELECT_COLS)
      .from(placeSeedRaw)
      .where(inArray(placeSeedRaw.id, pinIds));
    for (const r of pinRows) recalcCrossCityZone(r, cid, center);
    const byId = new Map(pinRows.map((r) => [r.id, r]));
    const ordered = pinIds.map((id) => byId.get(id)).filter(Boolean) as any[];
    for (const r of ordered) {
      r.rank = -1;
      allRows.push(r);
    }
    console.log(
      `[AG2-DB] 📌 핀 ${ordered.length}/${pinIds.length}곳 주입 (rank -1 = 활동 컷 무조건 통과)`,
    );
  }

  // ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = 카테고리 공급부족 시 다른 카테고리에서 보충(도시 무관 보편 규칙).
  if (!pinIds.length && allRows.length < totalSlots) {
    const deficit = totalSlots - allRows.length;
    const pickedIds = new Set(allRows.map((r: any) => r.id));
    const FILL_CATS = [
      "heritage",
      "hotspot",
      "attraction",
      "adventure",
      "healing",
      "shopping",
    ];
    const extra: any[] = await db!
      .select(SELECT_COLS)
      .from(placeSeedRaw)
      .where(
        and(
          poolWhere,
          inArray(placeSeedRaw.seedCategory, FILL_CATS),
          isNotNull(placeSeedRaw.googlePlaceId),
          // ⚠️ 2026-08-24 사장님 육안검수 2라운드 = 보충 경로에도 같은 손님상 게이트(본 선정과 1벌).
          servingGateSql(),
        ),
      );
    for (const r of extra) recalcCrossCityZone(r, cid, center);
    const rcOf = (r: any) => r.googleReviewCount ?? -1;
    const topUp = extra
      .filter((r) => !pickedIds.has(r.id))
      .sort(
        (a, b) =>
          (a.rank ?? Number.MAX_SAFE_INTEGER) -
            (b.rank ?? Number.MAX_SAFE_INTEGER) || rcOf(b) - rcOf(a),
      )
      .slice(0, deficit);
    allRows.push(...topUp);
    console.log(
      `[AG2-DB] 🧩 공급부족 보충 = 취향카테고리 ${totalSlots - deficit} + 타카테고리 상위 ${topUp.length}`,
    );
  }
  console.log(`[AG2-DB] 행 수 = ${allRows.length}/${totalSlots}`);

  // ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = PID공유 폴백용 R2 실존목록 = 행 확정 **후** 등장한 도시 전부 로드
  const imagePidMap = await loadImagePidMap([
    cid,
    ...allRows.map((r: any) => r.cityId),
  ]);

  const places: PlaceResult[] = allRows.map((r: any, i: number) => {
    const isFood = r.seedCategory === "restaurant";
    return {
      id: `db-${r.id}`,
      name: r.nameEn || "",
      geminiPlaceId: r.googlePlaceId || "",
      geminiAddress: r.address || "",
      description: r.summaryKo || r.editorialSummary || "",
      lat: parseFloat(String(r.latitude)) || 0,
      lng: parseFloat(String(r.longitude)) || 0,
      // ⚠️ 수정금지(승인필요) 2026-05-24 = PSR.rank 단일 SSOT
      rank: r.rank,
      sourceType: "DB Direct (Place Seed Raw)",
      personaFitReason: r.summaryKo || "",
      tags: isFood ? ["restaurant", "food"] : [],
      vibeTags: isFood ? ["Foodie" as const] : [],
      // ⚠️ 수정금지(승인필요) 2026-05-20 = pickPlaceImage 단일 SSOT (= Google 1 > 2026-08-18 PID공유 폴백)
      image: pickPlaceImage(r, imagePidMap),
      priceEstimate: r.priceEur ? `€${r.priceEur}` : "",
      estimatedPriceEur: r.priceEur ?? undefined,
      seedCategory: r.seedCategory as SeedCategory,
      placeTypes: isFood ? ["restaurant"] : [],
      recommendedTime: "afternoon",
      city: formData.destination,
      region: "",
      // ⚠️ 수정금지(승인필요) 2026-05-20 = DB google_maps_uri (= cid URL) 직접 사용 (= 100% 정확)
      googleMapsUrl: r.googleMapsUri || "",
      googleMapsUri: r.googleMapsUri || "",
      userRatingCount: r.googleReviewCount || 0,
      // ⚠️ 수정금지(승인필요) 2026-05-21 = Phase E = dayZone 매핑
      dayZone: r.dayZone ?? null,
      nameKo: r.nameKo ?? null,
      nameLocal: r.nameLocal ?? null,
      address: r.address ?? null,
      summaryKo: r.summaryKo ?? null,
      editorialSummary: r.editorialSummary ?? null,
    } as any;
  });
  console.log(
    `[AG2-DB] ✅ DB 직접 = ${places.length}곳 (${Date.now() - _t0}ms, Gemini X, Google X)`,
  );
  return places;
}

/** ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = AG2 메인 = DB-only 단일 분기 */
export async function generateRecommendations(
  skeleton: AG1Output,
): Promise<PlaceResult[]> {
  // ⚠️ 2026-07-08 사장님 SSOT = 좌표(불변키) 전달 = DB-only↔MIX 예외없이 모두 좌표 우선.
  const cityCheck = await isCityReady(
    skeleton.formData.destination,
    skeleton.formData.destinationCoords,
  );

  // ⚠️ 2026-07-31 사장님 승인(BTS D단계 결정5) = 핀 있으면 행수 미달이어도 db-only 진행(pipeline-v3 직행과 같은 규칙 1벌).
  const hasPins = !!(
    cityCheck.cityId && skeleton.formData.pinnedPlaceIds?.length
  );
  if (!cityCheck.ready && !hasPins) {
    console.error(
      `[AG2] ❌ city='${cityCheck.cityName}' MIX 모드 = ag2 처리 X (= ${cityCheck.count} rows < ${READY_THRESHOLD}) = MIX path = pipeline-v3.ts step1_geminiItinerary 표준 prompt 사용`,
    );
    throw new Error(
      `MIX_MODE_DISABLED: '${cityCheck.cityName}' 미발굴 도시 = ag2 처리 X (= 사용자 SSOT 2026-05-24)`,
    );
  }

  console.log(
    `[AG2] ✅ city='${cityCheck.cityName}' (id=${cityCheck.cityId}) ready=true (${cityCheck.count} rows ≥ ${READY_THRESHOLD}) → DB-only`,
  );
  // ⚠️ 수정금지(승인필요) 2026-05-24 = isCityReady 결과 전달 = findCityUnified 2 회 호출 회피
  const dbResults = await fetchFromPlaceSeedRaw(skeleton, {
    cityId: cityCheck.cityId!,
    name: cityCheck.cityName,
  });
  return dbResults || [];
}
