// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 베스트 여정 v1(오늘 확정본) = DB-only 에서 갈라진 별도 분기(관리자 쇼윈도용).

import { and, eq, sql } from "drizzle-orm";
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
import { finalizeDbOnlyItinerary } from "./best-itinerary/finalize";
import { AG2_SELECT_COLS, dbRowToPlace } from "./best-itinerary/places";
import { loadImagePidMap } from "./lib/services/shared/place-image";
import type { CityReadyResult } from "./best-itinerary/city-resolver";
import { placeSeedRaw } from "../shared/schema";
import { bestRankLangCount } from "./lib/services/shared/best-rank";

function toMin(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

// ⚠️ 수정금지(승인필요) 2026-10-14 사장님 결정 = 분류 이름을 포토스팟으로 바꿈 (정본 §2026-10-14)
const FILL_CATEGORIES = ["heritage", "photospot", "healing", "attraction"];
const FILL_HEADROOM = 3;

const agreeOf = (r: { bestRank?: number | null }) =>
  bestRankLangCount(r.bestRank);

// ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 볼거리는 동의 1까지 실제로 있어 버킷으로 내려가고, 식당은 창고에 4동의까지만 있어 그 뒤는 리뷰수 순으로 이어 붙인다(베스트 랜드마크 옆에 딸려 들어온 곳들 = 이미 카테고리 안 RC 순).
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
      agreeOf(b) - agreeOf(a) ||
      (b.googleReviewCount ?? -1) - (a.googleReviewCount ?? -1),
  );
  return rows;
}

function fillBuckets(
  rows: any[],
  needMinutes: number,
  stayOf: (r: any) => number,
) {
  // ⚠️ 수정금지(승인필요) 2026-09-10 사장님 확정 = 7동의만 특별대우(카테고리 무관 = 고정 기차역, 전부 간다).
  const out: any[] = [];
  let sum = 0;
  const usedByLevel: number[] = [];

  for (const r of rows) {
    if (agreeOf(r) !== 7) continue;
    out.push(r);
    sum += stayOf(r);
  }
  if (out.length) usedByLevel.push(7);

  const fill = rows
    .filter(
      (r) =>
        agreeOf(r) !== 7 &&
        FILL_CATEGORIES.includes(String(r.seedCategory ?? "")),
    )
    .sort((a, b) => (b.googleReviewCount ?? -1) - (a.googleReviewCount ?? -1));
  const want = needMinutes * FILL_HEADROOM;
  let n = 0;
  for (const r of fill) {
    if (sum >= want) break;
    out.push(r);
    sum += stayOf(r);
    n++;
  }
  if (n) usedByLevel.push(0);
  return { picked: out, minutes: sum, levels: usedByLevel };
}

export async function runPipelineBest(
  db: Db,
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
    `
[Best] ===== 베스트 여정 city=${cityCheck.cityName} (볼거리 = 7동의 전부 + ${FILL_CATEGORIES.join("·")} 리뷰수 순 / 식당 = 동의 순 뒤 리뷰수 순) =====`,
  );

  const skeleton = await buildSkeleton(formData);

  const [sightRows, restRows] = await Promise.all([
    selectBest(db, cityId, cityCoords, false),
    selectBest(db, cityId, cityCoords, true),
  ]);
  // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = PID공유 폴백 목록(사진)
  const imagePidMap = await loadImagePidMap([
    cityId,
    ...sightRows.map((r) => r.cityId),
    ...restRows.map((r) => r.cityId),
  ]);

  const hourlyRate = await cityHourlyRate(db, cityId);
  const paceMin = skeleton.paceConfig.slotDurationMinutes;
  const stayOf = (r: any) =>
    slotMinutesFor(
      r.priceEur != null ? Number(r.priceEur) : null,
      paceMin,
      hourlyRate,
      r.seedCategory,
    );

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

  const result = await finalizeDbOnlyItinerary(db, {
    daySlotsConfig: skeleton.daySlotsConfig,
    travelPace: skeleton.travelPace,
    formData,
    companionCount: skeleton.companionCount,
    dayCount: skeleton.dayCount,
    cityId,
    cityCoords,
    skeleton,
    inputPlaces: sights,
    restaurantPool: restaurants,
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
