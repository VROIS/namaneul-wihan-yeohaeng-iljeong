// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 베스트 여정 v1(오늘 확정본) = DB-only 에서 갈라진 별도 분기(관리자 쇼윈도용).
//   엔진(뼈대·조립·동선)은 그대로 쓰고, 이 분기 안에서만 다르다 = 풀(언어 동의 7→3) · 식당(직접 골라 넘김) · 이동시간(더함) · 점심창 11~14.
//   기존 여정(DB-only·MIX)은 이 파일을 거치지 않으므로 영향 0. 도시별 적정 일수는 사장님이 화면에서 보고 정한다(기계값 ≠ 화면).

import { and, eq, sql } from "drizzle-orm";
import type { TripFormData } from "../server/services/agents/types";
import { buildSkeleton } from "../server/services/agents/ag1-skeleton-builder";
import {
  type Db,
  poolWhereSql,
  servingGateSql,
  recalcCrossCityZone,
  FREE_THRESHOLD_EUR,
  PRICED_STAY_CATEGORIES,
} from "./routes-itinerary-generate-db";
import {
  cityHourlyRate,
  finalizeDbOnlyItinerary,
} from "./best-itinerary/finalize";
import { AG2_SELECT_COLS, dbRowToPlace } from "./best-itinerary/places";
import type { CityReadyResult } from "./best-itinerary/city-resolver";
import { placeSeedRaw } from "../shared/schema";
import { bestRankLangCount } from "../server/services/shared/best-rank";

// ⚠️ 수정금지(승인필요) 2026-08-31 사장님 결정 = 입장료 기반 슬롯시간 단일 진입점 (정본 B4)
//   원본 server/services/shared/slot-duration.ts:43 그대로. 그 파일은 최상단에서 db 를 부르므로(Cloudflare 금지) 이 순수 함수만 옮긴다.
const SLOT_STEP_MIN = 30;
/** 장소 1곳 슬롯 소요분 = 유료는 입장료÷시간당요금(30분 반올림), 그 외는 밀도 기본값. */
function slotMinutesFor(
  priceEur: number | null | undefined,
  paceSlotMinutes: number,
  hourlyRate: number | null,
  seedCategory?: string | null,
): number {
  if (
    !hourlyRate ||
    priceEur == null ||
    !(priceEur > FREE_THRESHOLD_EUR) ||
    !PRICED_STAY_CATEGORIES.has(seedCategory ?? "")
  ) {
    return paceSlotMinutes;
  }
  const raw = (priceEur / hourlyRate) * 60;
  return Math.max(
    SLOT_STEP_MIN,
    Math.round(raw / SLOT_STEP_MIN) * SLOT_STEP_MIN,
  );
}

/** "09:00" → 540 */
function toMin(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

// ⚠️ 수정금지(승인필요) 2026-09-10 사장님 확정 = 채울 갈래 네 개. 7동의는 이 목록과 무관하게 전부 간다.
const FILL_CATEGORIES = ["heritage", "hotspot", "healing", "attraction"];
// 채울 재료를 자리의 몇 배로 줄지 = 1km 안에 고를 것이 남게 하는 여유분.
const FILL_HEADROOM = 3;

/** 그 곳을 고른 언어 수(= best_rank 세는 함수 1벌 §16). */
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
  // ⚠️ 수정금지(승인필요) 2026-09-10 사장님 확정 = 7동의만 특별대우(카테고리 무관 = 고정 기차역, 전부 간다).
  //   나머지는 등급 차이 없음 = 채울 네 갈래(유적·명소·힐링·attraction) 안에서 리뷰수 순으로 넉넉히 넘긴다.
  //   앞 역 1km 안에서 고르는 일은 동선 엔진이 한다 = 여기서는 그 재료를 모자라지 않게 준다. 옛 동의 버킷 7→3 폐기 = 2026-09-10 §19.
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
  // 자리보다 넉넉히 줘야 1km 안에 고를 것이 남는다(딱 맞게 주면 노선 옆이 비어 멀리서 끌어온다).
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

  // 머무는 시간 = 엔진과 같은 계산(입장료 기반) 1벌.
  const hourlyRate = await cityHourlyRate(db, cityId);
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
    dbRowToPlace(r, formData.destination),
  );
  const restaurants = restRows.map((r) =>
    dbRowToPlace(r, formData.destination),
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
