// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 베스트 여정 v1(오늘 확정본) = DB-only 에서 갈라진 별도 분기(관리자 쇼윈도용).
//   엔진(뼈대·조립·동선)은 그대로 쓰고, 이 분기 안에서만 다르다 = 풀(언어 동의 7→3) · 식당(직접 골라 넘김) · 이동시간(더함) · 점심창 11~14.
//   기존 여정(DB-only·MIX)은 이 파일을 거치지 않으므로 영향 0. 도시별 적정 일수는 사장님이 화면에서 보고 정한다(기계값 ≠ 화면).

import { and, eq, sql } from "drizzle-orm";
import type { TripFormData } from "./types";
import { buildSkeleton } from "./ag1-skeleton-builder";
import type { isCityReady } from "./ag2-gemini-recommender";
import { finalizeDbOnlyItinerary } from "./ag4-db-finalize";
import { db } from "../../db";
import { placeSeedRaw } from "../../../shared/schema";
import {
  getPoolContext,
  servingGateSql,
  recalcCrossCityZone,
} from "../shared/pool-radius";
import { loadImagePidMap } from "../shared/place-image";
import { bestRankLangCount } from "../shared/best-rank";
import { SIGHT_CATEGORIES } from "@shared/vibe-category";
// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = DB 행 → 장소 변환 = DB-only 와 같은 1벌(§16).
import { dbRowToPlace } from "./ag2-gemini-recommender";
import { cityHourlyRate, slotMinutesFor } from "../shared/slot-duration";

type CityReadyResult = Awaited<ReturnType<typeof isCityReady>>;

/** "09:00" → 540 */
function toMin(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 볼거리 = 7동의부터 쓰고 자리가 안 차면 6·5·4·3 으로 한 칸씩 내려간다. 그래도 자리가 남으면 **동의 없는 행을 카테고리 순(heritage부터)·리뷰수 순으로** 채운다 = 빈 슬롯 0(5일 브뤼셀 6시간 공백 실측). 옛 "3 아래는 안 쓴다"(9-07) 폐기 §19.
const SIGHT_BUCKETS = [7, 6, 5, 4, 3] as const;
const BEST_COLS = {
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

/** 그 곳을 고른 언어 수(= best_rank 세는 함수 1벌 §16). */
const agreeOf = (r: { bestRank?: number | null }) =>
  bestRankLangCount(r.bestRank);

// 채움 순서 = 볼거리 6분류 목록 순. 목록에 없는 분류는 맨 뒤로(옛 indexOf 가 -1 이라 맨 앞으로 튀던 자리).
const catOrder = (cat: string | null | undefined) => {
  const i = (SIGHT_CATEGORIES as readonly string[]).indexOf(cat ?? "");
  return i < 0 ? SIGHT_CATEGORIES.length : i;
};

// ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 볼거리는 동의 1까지 실제로 있어 버킷으로 내려가고, 식당은 창고에 4동의까지만 있어 그 뒤는 리뷰수 순으로 이어 붙인다(베스트 랜드마크 옆에 딸려 들어온 곳들 = 이미 카테고리 안 RC 순).
async function selectBest(
  cityId: number,
  cityCoords: { lat: number; lng: number } | null | undefined,
  isRestaurant: boolean,
) {
  const { center, where: poolWhere } = await getPoolContext(cityId, cityCoords);
  const rows: any[] = await db!
    .select(BEST_COLS)
    .from(placeSeedRaw)
    .where(
      and(
        poolWhere,
        isRestaurant
          ? eq(placeSeedRaw.seedCategory, "restaurant")
          : sql`${placeSeedRaw.seedCategory} <> 'restaurant'`,
        // 볼거리·식당 모두 현관문 통과 전부 = 동의 순으로 먼저 쓰고, 바닥나면 리뷰수 순으로 이어 붙인다(하한 없음).
        servingGateSql(),
      ),
    );
  for (const r of rows) recalcCrossCityZone(r, cityId, center);
  // 많은 언어가 동의한 순 → 같으면 리뷰수 순(= 동의 없는 식당은 자연히 뒤에서 RC 순).
  rows.sort(
    (a, b) =>
      agreeOf(b) - agreeOf(a) ||
      (b.googleReviewCount ?? -1) - (a.googleReviewCount ?? -1),
  );
  return rows;
}

/** 버킷 = 7동의부터 담고 자리(분)가 안 차면 6·5·4 순으로 내려간다(넉넉한 도시는 낮은 등급을 안 씀). */
function fillBuckets(
  rows: any[],
  needMinutes: number,
  stayOf: (r: any) => number,
) {
  const out: any[] = [];
  let sum = 0;
  const usedByLevel: number[] = [];
  for (const level of SIGHT_BUCKETS) {
    if (sum >= needMinutes) break;
    let n = 0;
    for (const r of rows) {
      if (sum >= needMinutes) break;
      if (agreeOf(r) !== level) continue;
      out.push(r);
      sum += stayOf(r);
      n++;
    }
    if (n) usedByLevel.push(level);
  }
  if (sum < needMinutes) {
    // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 채움 = **동의 0(어느 언어도 안 고른) 행만** 카테고리·리뷰수 순으로. 동의 1·2 = 먼 외곽 잡동사니 구간이라 쓰지 않는다(브뤼셀 워털루·안트베르펜 실증).
    const rest = rows
      .filter((r) => agreeOf(r) === 0)
      .sort(
        (a, b) =>
          catOrder(a.seedCategory) - catOrder(b.seedCategory) ||
          (b.googleReviewCount ?? -1) - (a.googleReviewCount ?? -1),
      );
    let n = 0;
    for (const r of rest) {
      if (sum >= needMinutes) break;
      out.push(r);
      sum += stayOf(r);
      n++;
    }
    if (n) usedByLevel.push(0);
  }
  return { picked: out, minutes: sum, levels: usedByLevel };
}

export async function runPipelineBest(
  formData: TripFormData,
  cityCheck: CityReadyResult,
): Promise<any> {
  const _t0 = Date.now();
  const cityId = cityCheck.cityId!;
  const cityCoords =
    cityCheck.latitude != null && cityCheck.longitude != null
      ? { lat: cityCheck.latitude, lng: cityCheck.longitude }
      : undefined;

  console.log(
    `\n[Best] ===== 베스트 여정 city=${cityCheck.cityName} (볼거리 ${SIGHT_BUCKETS.join("→")}동의 순 / 식당 = 동의 순 뒤 리뷰수 순) =====`,
  );

  const skeleton = await buildSkeleton(formData);

  const [sightRows, restRows] = await Promise.all([
    selectBest(cityId, cityCoords, false),
    selectBest(cityId, cityCoords, true),
  ]);
  const imagePidMap = await loadImagePidMap([
    cityId,
    ...sightRows.map((r) => r.cityId),
    ...restRows.map((r) => r.cityId),
  ]);

  // 머무는 시간 = 엔진과 같은 계산(입장료 기반) 1벌.
  const hourlyRate = await cityHourlyRate(cityId);
  const paceMin = skeleton.paceConfig.slotDurationMinutes;
  const stayOf = (r: any) =>
    slotMinutesFor(
      r.priceEur != null ? Number(r.priceEur) : null,
      paceMin,
      hourlyRate,
      r.seedCategory,
    );

  // 자리 = 곳수가 아니라 분(minute). 하루 = 활동시간에서 식사 2회를 뺀 만큼.
  const mealMin = skeleton.paceConfig.mealDurationMinutes;
  const needMinutes = skeleton.daySlotsConfig.reduce(
    (sum, dc) =>
      sum + Math.max(0, toMin(dc.endTime) - toMin(dc.startTime) - mealMin * 2),
    0,
  );
  const bucket = fillBuckets(sightRows, needMinutes, stayOf);
  const sights = bucket.picked.map((r) =>
    dbRowToPlace(r, imagePidMap, formData.destination),
  );
  const restaurants = restRows.map((r) =>
    dbRowToPlace(r, imagePidMap, formData.destination),
  );

  const restAgreed = restRows.filter((r) => agreeOf(r) > 0).length;
  console.log(
    `[Best] 볼거리 ${sights.length}곳 ${bucket.minutes}분(필요 ${needMinutes}분) = ${bucket.levels.join("·")}동의 사용 / 식당 ${restaurants.length}곳(동의 ${restAgreed} + 리뷰수 ${restaurants.length - restAgreed})`,
  );
  if (bucket.minutes < needMinutes)
    console.log(
      `[Best] ⚠️ ${needMinutes - bucket.minutes}분은 비운다(언어가 고른 볼거리를 다 썼다)`,
    );

  const result = await finalizeDbOnlyItinerary({
    daySlotsConfig: skeleton.daySlotsConfig,
    travelPace: skeleton.travelPace,
    formData,
    companionCount: skeleton.companionCount,
    dayCount: skeleton.dayCount,
    cityId,
    cityCoords,
    skeleton,
    inputPlaces: sights,
    // 식당을 직접 넘긴다 = 엔진이 자기 식당풀을 새로 뽑지 않는다(베스트 아닌 식당 유입 차단).
    restaurantPool: restaurants,
    // 이 분기에서만 켠다(기존 여정은 안 넘기므로 그대로).
    bestMode: true,
  });

  const totalMs = Date.now() - _t0;
  console.log(`[Best] ===== 완료 (${totalMs}ms) =====`);

  result.metadata = {
    ...result.metadata,
    _totalMs: totalMs,
    // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 오늘 확정본. v2 = 사장님이 장소 id 를 직접 넣어 슬롯을 만드는 판(기계는 시간·동선·식당만 계산).
    _pipelineVersion: "best-v1-2026-09-08",
    _sourceMode: "best",
  };
  return result;
}
