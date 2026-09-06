// POST /api/routes/generate = Worker 이관본 (DB-only 경로만, 2026-09-06)
//
// 원본 = server/itinerary-generate-route.ts:15 (라우트)
//        → server/services/itinerary-generator.ts:? → server/services/agents/pipeline-v3.ts:24 runPipelineV3
//        → server/services/agents/pipeline-db-only.ts:13 runPipelineDbOnly (외부호출 0)
//
// ────────────────────────────────────────────────────────────────────────────
// 무엇을 옮겼고 무엇을 안 옮겼나
//
// [옮긴 것] runPipelineV3 의 3갈래 중 **DB-only 2갈래**(pipeline-v3.ts:32 핀 / :41 ready).
//   실측 = 이 경로의 전이 의존 47파일 6,491줄 안에 `fetch(`/`generateContent`/`getAI` = 0건.
//   (city-resolver.ts:323 의 gemini-city-meta 는 **동적 import** 이고 4단계 매칭이 전부 실패한
//    신규 도시에서만 불린다. DB-only 는 isCityReady 가 도시를 이미 찾은 뒤라 도달하지 않는다.)
//
// [안 옮긴 것] MIX 경로(pipeline-v3.ts:48 runPipelineMix) = 제미니·TS 유료호출이 있다.
//   이 라우트는 MIX 로 갈 요청을 **처리하지 않고** 501 로 돌려보낸다(아래 MIX_NOT_HERE).
//
// ────────────────────────────────────────────────────────────────────────────
// 🔴 왜 server/** 의 파이프라인을 그대로 import 하지 않았나 (= 실측 차단 사유)
//
// 번들은 된다. 실측 = `esbuild --bundle --platform=node` 로 pipeline-db-only.ts 를 통째로
// 묶으면 2.6MB 로 성공한다(pg 포함, @aws-sdk·@google/genai 포함). 즉 "규모가 커서 불가"가
// 아니다. 진짜 차단은 **런타임 DB 연결 모델**이다:
//
//   ① server/db.ts:39 은 **모듈 최상단**에서 `new Pool(...)` 을 만든다.
//      Hyperdrive 공식 문제해결표(hyperdrive/observability/troubleshooting) =
//        "Cannot perform I/O on behalf of a different request. ...
//         Create a new database client on every request instead of caching it in a
//         global variable."
//      = 모듈 최상단 Pool = isolate 전역 = 두 번째 요청부터 위 오류. 정확히 금지된 형태다.
//      추가로 server/db.ts:23 은 모듈 최상단에서 process.env 를 읽는다(Worker 금지사항).
//
//   ② 그 Pool 을 물고 있는 것이 DB-only 경로만 해도 8벌이다(전부 `import { db } from "../../db"`):
//        ag2-gemini-recommender.ts:10 · ag4-db-finalize.ts:3 · city-resolver.ts:1 ·
//        exchange-rate.ts:1 · pool-radius.ts:4 · slot-duration.ts:4 ·
//        meal-budget-tiers.ts:4 · place-upsert.ts:2
//      이들 중 어느 것도 db 를 주입받는 인자가 없다(실측 = 위 파일들의 export 시그니처).
//
//   ③ 모듈 교체(alias)로 우회할 수 없다. 위 8벌이 쓰는 지정자는 전부 **상대경로**
//      ("../../db" / "../db") 인데, wrangler 의 alias 는 패키지(모듈) 지정자만 바꾼다:
//        workers/wrangler/configuration "Module Aliasing" =
//        "replace all calls to import a particular **package** with a module of your choice"
//      상대경로를 갈아끼우려면 esbuild 플러그인이 필요한데 wrangler 는 플러그인 훅을 열어두지 않는다
//      (같은 문서에 alias 와 build.command 만 있고 plugin 항목이 없다).
//      → 상대경로를 바꾸려면 server/** 를 고쳐야 하는데 그건 이 작업의 금지사항이다.
//
//   ④ 드라이버 결과 모양도 다르다. ag4-db-finalize.ts:91·:371 은 `db.execute(...)` 의 결과를
//      `.rows` 로 읽는다(= node-postgres 모양). Worker 가 쓰는 drizzle-orm/postgres-js 의
//      execute 는 평평한 배열을 돌려준다(node_modules/drizzle-orm/postgres-js/session.d.ts:48
//      `type: RowList<...[]>` vs node-postgres/session.d.ts:46 QueryResult).
//      = 드라이버만 바꿔 끼워도 이 두 지점은 조용히 빈 배열이 된다.
//
// ⇒ 그래서 **DB 를 만지는 함수만** 이 파일에 openDb() 기준으로 옮기고,
//    **순수 계산 모듈은 원본 그대로 import** 한다(§16 재발명 금지 = 아래 import 블록).
//    옮긴 함수는 각각 원본 파일:줄번호를 달아 두었다.
//
// ────────────────────────────────────────────────────────────────────────────
// 🔴🔴 앞으로 이 Worker 를 만지는 사람이 **반드시** 알아야 할 함정
//
// 이 파일은 동선 두뇌 buildRouteLocal(server/services/route/route-local.ts) 을 그대로
// import 한다(§16). 그런데 그 파일이 딸고 오는 3벌
//   route-local.ts:16 → transport-pricing-service → transport/guide-pricing.ts:1
//   route-local.ts:21 → shared/slot-duration.ts:4
//   route-local.ts:24 → shared/meal-budget-tiers.ts:4
// 이 전부 `import { db } from "server/db.ts"` 라서, **server/db.ts 가 번들에 들어온다**
// (실측 = esbuild metafile). 지금 이게 터지지 않는 이유는 딱 하나다:
//
//   server/db.ts:22 는 `process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL`
//   을 읽는데, 이 Worker 의 wrangler.jsonc 에는 그 둘이 **없다**(vars 는 R2_PUBLIC_URL 뿐).
//   → :31 `if (!connectionString)` 가 참 → 경고 한 줄만 찍고 db = null 로 끝난다.
//   → pg.Pool 이 **아예 만들어지지 않는다** = 모듈 최상단 I/O 0 = 지금은 안전하다.
//
// ⚠️ 그래서 **이 Worker 에 DATABASE_URL 또는 SUPABASE_DATABASE_URL 을 vars/secret 으로
//    넣으면 안 된다.** 넣는 순간 server/db.ts:39 가 isolate 전역에 pg.Pool 을 만들고,
//    Hyperdrive 문제해결표의 "Cannot perform I/O on behalf of a different request ...
//    Create a new database client on every request instead of caching it in a global
//    variable" 에 그대로 걸려 두 번째 요청부터 깨진다.
//    DB 접근은 이 파일 어디서도 그 db 를 쓰지 않는다 = 전부 인자로 받은 openDb() 의 db 다.
// ────────────────────────────────────────────────────────────────────────────

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  and,
  between,
  eq,
  inArray,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";
import * as schema from "../shared/schema";

// ── 순수 계산 모듈 = 원본 그대로 재사용(§16). server/db.ts 를 딸려오지 않는 것만 고른다. ──
import {
  MEAL_BUDGET,
  type AG1Output,
  type DaySlotConfig,
  type PlaceResult,
  type SeedCategory,
  type TravelPace,
  type TripFormData,
} from "../server/services/agents/types";
import {
  normalizeTravelStyle,
  sanitizePriceEur,
} from "../server/services/agents/pipeline-v3-types";
import {
  haversineKm,
  pickTransitMode,
  estimateTransitCost,
} from "../server/services/agents/transit-haversine";
import { bestRankOrderSql } from "../server/services/shared/best-rank";
// 교통 상수표만 원본 그대로(순수, worker/src.ts 도 같은 파일을 쓴다).
// transport-pricing-service.ts 는 통째로 못 쓴다 = 그 그래프의 guide-pricing.ts:33 이
// server/db.ts 싱글턴을 쓴다(위 ②). 필요한 두 함수만 아래에 원본 줄번호와 함께 옮겼다.
import {
  COMPANION_TO_TRANSPORT,
  DEFAULT_PRICES,
  type CompanionType,
  type MobilityStyle,
  type TransportType,
  type TravelStyle,
} from "../server/services/transport/constants";
import { VIBE_PRIMARY_CATEGORY } from "../shared/vibe-category";
// AG1 뼈대 = 순수(외부·DB 0) = 원본 그대로(§16).
import { buildSkeleton } from "../server/services/agents/ag1-skeleton-builder";
// 동선 두뇌 = 순수 = 원본 그대로(§16). 이 파일을 옮겨쓰면 보호블록 재작성이 된다.
import { buildRouteLocal } from "../server/services/route/route-local";
// slot-duration.ts / meal-budget-tiers.ts / pool-radius.ts 는 순수 함수도 갖고 있지만
// 파일 최상단에서 server/db.ts 를 정적 import 하므로 통째로 가져올 수 없다(위 ①).
// → 순수 부분만 아래 "원본 상수·순수함수의 이식" 절에 원본 줄번호와 함께 옮겼다.

const {
  cities,
  creditTransactions,
  itineraries,
  placeSeedRaw,
  placeTranslations,
  users,
} = schema;

type Db = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: Db; close: () => void };

// ── 원본 상수·순수함수의 이식 (server/db.ts 를 딸려오는 파일에서만 떼어온다) ──────

/** 원본 server/services/shared/pool-radius.ts:8 */
const POOL_RADIUS_M = 100_000;
/** 원본 server/services/shared/pool-radius.ts:9 */
const CORE_KM = 10;
/** 원본 server/services/shared/pool-radius.ts:44 */
const POOL_LAT_DEG = 0.9;

/** 원본 server/services/shared/pool-radius.ts:25 distanceKmFromCoords */
function distanceKmFromCoords(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const dLat = (latA - latB) * 111320;
  const dLng =
    (lngA - lngB) * 111320 * Math.cos((((latA + latB) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng) / 1000;
}

/** 원본 server/services/shared/pool-radius.ts:38 zoneForDistanceKm */
function zoneForDistanceKm(distKm: number): "core" | "outskirt" | null {
  if (!(distKm >= 0) || distKm > POOL_RADIUS_M / 1000) return null;
  return distKm <= CORE_KM ? "core" : "outskirt";
}

/** 원본 server/services/shared/pool-radius.ts:46 poolWhereSql — SQL 문자열 그대로. */
function poolWhereSql(
  cityId: number,
  center: { lat: number; lng: number } | null,
): SQL {
  if (!center) return sql`${placeSeedRaw.cityId} = ${cityId}`;
  const lngDeg =
    POOL_LAT_DEG / Math.max(Math.cos((center.lat * Math.PI) / 180), 0.15);
  return sql`((
    ${placeSeedRaw.latitude} IS NOT NULL AND ${placeSeedRaw.longitude} IS NOT NULL
    AND ${placeSeedRaw.latitude} <> 0 AND ${placeSeedRaw.longitude} <> 0
    AND ${placeSeedRaw.latitude} BETWEEN ${center.lat - POOL_LAT_DEG} AND ${center.lat + POOL_LAT_DEG}
    AND ${placeSeedRaw.longitude} BETWEEN ${center.lng - lngDeg} AND ${center.lng + lngDeg}
    AND sqrt( power((${center.lat} - ${placeSeedRaw.latitude}) * 111320, 2)
            + power((${center.lng} - ${placeSeedRaw.longitude}) * 111320 * cos(radians((${center.lat} + ${placeSeedRaw.latitude}) / 2)), 2) ) <= ${POOL_RADIUS_M}
  ) OR (${placeSeedRaw.cityId} = ${cityId} AND (
    ${placeSeedRaw.latitude} IS NULL OR ${placeSeedRaw.longitude} IS NULL
    OR ${placeSeedRaw.latitude} = 0 OR ${placeSeedRaw.longitude} = 0
  )))`;
}

/** 원본 server/services/shared/pool-radius.ts:66 servingGateSql = 손님상 게이트. */
function servingGateSql(): SQL {
  return sql`(${placeSeedRaw.status} = 'active' AND (COALESCE(${placeSeedRaw.googleReviewCount}, 0) > 0 OR ${placeSeedRaw.bestRank} IS NOT NULL))`;
}

/** 원본 server/services/shared/pool-radius.ts:80 recalcCrossCityZone */
function recalcCrossCityZone(
  row: {
    cityId: number;
    latitude: any;
    longitude: any;
    dayZone?: any;
    distanceKmFromCenter?: any;
  },
  requestCityId: number,
  center: { lat: number; lng: number } | null,
): void {
  if (!center || row.cityId === requestCityId) return;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!lat || !lng) return;
  const distKm = distanceKmFromCoords(center.lat, center.lng, lat, lng);
  row.distanceKmFromCenter = Math.round(distKm * 10) / 10;
  row.dayZone = zoneForDistanceKm(distKm);
}

/** 원본 server/services/shared/slot-duration.ts:9 */
const FREE_THRESHOLD_EUR = 3;
/** 원본 server/services/shared/slot-duration.ts:12 */
const HOURS_PER_AVERAGE_PLACE = 2;
/** 원본 server/services/shared/slot-duration.ts:17 PRICED_STAY_CATEGORIES */
const PRICED_STAY_CATEGORIES: ReadonlySet<string> = new Set([
  "heritage",
  "attraction",
  "adventure",
  "healing",
]);

// slotMinutesFor(원본 slot-duration.ts:44) · tierRange(원본 meal-budget-tiers.ts:33) 는
// 여기서 옮기지 않는다 = buildRouteLocal 이 그 두 함수를 자기 안에서 직접 쓰고(route-local.ts:17·24),
// 이 라우트는 산출값(hourlyRate·mealTiers)만 넘긴다.

/** 원본 server/services/shared/meal-budget-tiers.ts:8 CityMealTiers */
type CityMealTiers = { lo: number; hi: number };
/** 원본 server/services/shared/meal-budget-tiers.ts:10 MIN_SAMPLE */
const MEAL_TIERS_MIN_SAMPLE = 5;

/** 원본 server/services/agents/ag2-gemini-recommender.ts:24 READY_THRESHOLD */
const READY_THRESHOLD = 200;

// ── 교통비 (원본 server/services/transport/guide-pricing.ts · day-config.ts) ──

/** 원본 server/services/transport/guide-pricing.ts:12 round2 */
function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/** 원본 server/services/transport/guide-pricing.ts:17 shouldApplyGuidePrice — 순수. */
function shouldApplyGuidePrice(
  mobilityStyle: MobilityStyle,
  travelStyle: TravelStyle,
): boolean {
  const ms = (mobilityStyle || "").toLowerCase();
  const ts = (travelStyle || "").toLowerCase();
  return (
    ms === "minimal" || ms === "moderate" || ts === "premium" || ts === "luxury"
  );
}

/**
 * 원본 server/services/transport/guide-pricing.ts:28 getGuidePriceFromDB.
 * 실패·미발견이면 DEFAULT_PRICES 로 되돌리는 것까지 원본과 같다(원본 :64 `dbPrice || DEFAULT_PRICES[...]`).
 */
async function guidePriceConfig(
  db: Db,
  transportType: TransportType,
): Promise<{ basePrice4h: number; pricePerHour: number }> {
  try {
    const [row] = await db
      .select()
      .from(schema.guidePrices)
      .where(eq(schema.guidePrices.serviceType, transportType))
      .limit(1);
    if (!row) return DEFAULT_PRICES[transportType];
    return {
      basePrice4h: row.basePrice4h || DEFAULT_PRICES[transportType].basePrice4h,
      pricePerHour:
        row.pricePerHour || DEFAULT_PRICES[transportType].pricePerHour,
    };
  } catch (error) {
    console.warn(
      `[Transport] DB 조회 실패, 기본값 사용: ${transportType}`,
      (error as Error)?.message,
    );
    return DEFAULT_PRICES[transportType];
  }
}

/**
 * 원본 server/services/transport/day-config.ts:53 guideCostForDay.
 * 이 라우트는 shouldApplyGuidePrice 가 true 일 때만 부르므로(아래 :isGuideDay 분기),
 * 원본 transport-pricing-service.ts:70 의 **가이드 가지만** 옮겼다
 * (transit 가지는 원본에서도 category!=="guide" 라 0 을 돌려준다 = 부를 일이 없다).
 */
async function guideCostForDay(
  db: Db,
  args: {
    dayConfig: { startTime: string; endTime: string };
    companionType: CompanionType;
    companionCount: number;
    isRegionalTravel?: boolean;
  },
): Promise<number> {
  const [startH, startM] = (args.dayConfig.startTime || "09:00")
    .split(":")
    .map(Number);
  const [endH, endM] = (args.dayConfig.endTime || "21:00")
    .split(":")
    .map(Number);
  // 원본 day-config.ts:64 = 최소 4시간.
  const availableHours = Math.max(
    4,
    round2((endH * 60 + endM - (startH * 60 + startM)) / 60),
  );
  const transportType =
    COMPANION_TO_TRANSPORT[args.companionType]?.transportType ?? "sedan";
  const priceConfig = await guidePriceConfig(db, transportType);
  // 원본 guide-pricing.ts:64 calculateGuideDailyPrice.
  const effectiveHours = Math.max(availableHours, 4);
  const additionalHours = Math.max(0, effectiveHours - 4);
  let dailyVehiclePrice = round2(
    priceConfig.basePrice4h + additionalHours * priceConfig.pricePerHour,
  );
  if (args.isRegionalTravel)
    dailyVehiclePrice = round2(dailyVehiclePrice * 1.5);
  // 원본 transport-pricing-service.ts:76 = 1인 하루치.
  return round2(dailyVehiclePrice / Math.max(1, args.companionCount));
}

/** 원본 server/services/agents/ag4-db-finalize.ts:38 addMinutes */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// ── 크레딧 (§9). 원본 server/credit-charge.ts. worker/routes-gemini.ts:100 과 같은 1벌 형태. ──

/** 원본 server/credit-charge.ts:6 CREDIT_COSTS 의 route_generate. */
const ROUTE_GENERATE_COST = 5;
/** 원본 server/credit-charge.ts:16 CREDIT_LABELS 의 route_generate(장부에 그대로 남는다). */
const ROUTE_GENERATE_LABEL = "여정 생성";

/**
 * 원본 server/credit-charge.ts:83 precheckFeature = 잔액 사전확인(차감 0).
 * 비로그인·관리자 = 면제(§9). 잔액부족 = 402 + 원본과 같은 본문.
 * ⚠️ 반드시 첫 res 출력 **전에** 부른다(§9 금지 4번).
 */
async function precheckRouteGenerate(
  db: Db,
  res: Response,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return true;
  const [user] = await db
    .select({ role: users.role, credits: users.credits })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.role === "admin") return true;
  const balance = user.credits ?? 0;
  if (balance < ROUTE_GENERATE_COST) {
    res.status(402).json({
      error: "insufficient_credits",
      message: `크레딧이 부족합니다. (필요: ${ROUTE_GENERATE_COST}, 잔액: ${balance})`,
      balance,
      required: ROUTE_GENERATE_COST,
    });
    return false;
  }
  return true;
}

/**
 * 원본 server/credit-charge.ts:62 chargeOnSuccess → chargeFeature → creditService.useCredits.
 * 장부 줄 + 잔액을 한 트랜잭션으로(원본 server/creditService.ts:43 addCredits).
 * 실패해도 완성물은 보존한다(원본과 같음).
 */
async function chargeRouteGenerateOnSuccess(
  db: Db,
  userId: string | null,
  referenceId?: string,
): Promise<void> {
  if (!userId) return;
  try {
    const [user] = await db
      .select({ role: users.role, credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));
    if (!user || user.role === "admin") return;
    if ((user.credits ?? 0) < ROUTE_GENERATE_COST) {
      console.error(
        `[credits] ${ROUTE_GENERATE_LABEL} 완성했으나 차감 실패(잔액 소진) = 무료 처리 기록`,
      );
      return;
    }
    await db.transaction(async (tx) => {
      await tx.insert(creditTransactions).values({
        userId,
        type: "usage",
        amount: -ROUTE_GENERATE_COST,
        description: ROUTE_GENERATE_LABEL,
        referenceId,
      });
      await tx
        .update(users)
        .set({
          credits: sql`COALESCE(${users.credits}, 0) + ${-ROUTE_GENERATE_COST}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });
  } catch (e) {
    console.error(
      `[credits] ${ROUTE_GENERATE_LABEL} 차감 예외(완성물은 그대로 보존):`,
      (e as Error)?.message,
    );
  }
}

// ── 인증 ────────────────────────────────────────────────────────────────────

/**
 * 원본 server/auth-user.ts:8 getUserIdFromReq = 헤더 정규식만(DB 무관).
 * worker/routes-auth-credits.ts:18 과 같은 1벌(그 파일을 import 하면 순환이 되므로 같은 식을 둔다).
 */
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

// ── 도시 찾기 (원본 server/services/city-resolver.ts findCityUnified 의 DB 단계) ──

interface CityResolveResult {
  cityId: number;
  name: string;
  nameEn: string;
  nameLocal: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

function toCityResult(city: typeof cities.$inferSelect): CityResolveResult {
  return {
    cityId: city.id,
    name: city.name,
    nameEn: city.nameEn || city.name,
    nameLocal: city.nameLocal || city.name,
    countryCode: city.countryCode,
    latitude: city.latitude,
    longitude: city.longitude,
  };
}

/**
 * 원본 server/services/city-resolver.ts:109 findCityUnified 의 **DB 매칭 단계만**
 * (0단계 좌표10m → 1단계 이름정확 → 2단계 aliases → 4단계 부분매칭).
 *
 * 옮기지 않은 단계 = 3단계 CITY_NAME_MAP(정적 한글표) 과 5단계 신규도시 자동 INSERT.
 *   · 5단계는 원본 :323 에서 제미니(유료 외부호출)를 부르고 cities 에 INSERT 한다.
 *     이 라우트는 **DB-only(외부호출 0 · 쓰기 0)** 전용이므로 그 단계에 닿으면 도시 미발견으로
 *     끝내고, 아래 라우트가 MIX_NOT_HERE(501) 로 돌려보낸다(사장님이 직접 처리하실 몫).
 *   · 3단계 CITY_NAME_MAP 은 원본 파일 상단의 정적표인데 그 파일은 server/db.ts 를 물고 있어
 *     통째로 가져올 수 없다. 대신 4단계 부분매칭이 같은 입력을 대부분 잡는다.
 *     ⚠️ 드리프트 주의 = 이 차이 때문에 DB-only 판정이 원본보다 **보수적**이다
 *        (원본이 DB-only 로 갈 요청 일부가 여기서는 501 로 나간다 = 유료경로로 새지 않으므로 안전).
 */
async function findCityInDb(
  db: Db,
  input: string,
  coords?: { lat: number; lng: number } | null,
): Promise<CityResolveResult | null> {
  if (!input) return null;
  let cleaned = input.trim();
  if (cleaned.includes(",")) cleaned = cleaned.split(",")[0].trim();
  const inputLower = cleaned.toLowerCase();
  if (!inputLower) return null;

  // 원본 :124 0단계 = 도시중심좌표(불변키) 10m 매칭 최우선.
  if (coords && coords.lat != null && coords.lng != null) {
    const near = await db
      .select()
      .from(cities)
      .where(
        sql`ABS(${cities.latitude} - ${coords.lat}) < 0.0001 AND ABS(${cities.longitude} - ${coords.lng}) < 0.0001`,
      )
      .orderBy(cities.id)
      .limit(1);
    if (near.length > 0) return toCityResult(near[0]);
  }

  // 원본 :154 1단계 = 이름 정확 일치.
  const exact = await db
    .select()
    .from(cities)
    .where(
      sql`LOWER(${cities.name}) = ${inputLower}
         OR LOWER(COALESCE(${cities.nameEn}, '')) = ${inputLower}
         OR LOWER(COALESCE(${cities.nameLocal}, '')) = ${inputLower}`,
    )
    .limit(1);
  if (exact.length > 0) return toCityResult(exact[0]);

  // 원본 :184 2단계 = aliases 포함.
  const alias = await db
    .select()
    .from(cities)
    .where(sql`${cities.aliases}::jsonb @> ${JSON.stringify([input])}::jsonb`)
    .limit(1);
  if (alias.length > 0) return toCityResult(alias[0]);

  // 원본 :287 4단계 = 유사어 부분 매칭(양방향 LIKE, 2자 이상).
  const partial = await db
    .select()
    .from(cities)
    .where(
      sql`LOWER(${cities.name}) LIKE ${`%${inputLower}%`} OR ${inputLower} LIKE '%' || LOWER(${cities.name}) || '%'
         OR LOWER(COALESCE(${cities.nameEn}, '')) LIKE ${`%${inputLower}%`} OR (LENGTH(COALESCE(${cities.nameEn},''))>=2 AND ${inputLower} LIKE '%' || LOWER(${cities.nameEn}) || '%')
         OR LOWER(COALESCE(${cities.nameLocal}, '')) LIKE ${`%${inputLower}%`} OR (LENGTH(COALESCE(${cities.nameLocal},''))>=2 AND ${inputLower} LIKE '%' || LOWER(${cities.nameLocal}) || '%')`,
    )
    .limit(1);
  if (partial.length > 0) return toCityResult(partial[0]);

  return null;
}

interface CityReadyResult {
  ready: boolean;
  cityId: number | null;
  cityName: string;
  count: number;
  latitude: number | null;
  longitude: number | null;
}

/** 원본 server/services/agents/ag2-gemini-recommender.ts:26 isCityReady. */
async function isCityReady(
  db: Db,
  destination: string,
  destinationCoords?: { lat: number; lng: number } | null,
): Promise<CityReadyResult> {
  const city = await findCityInDb(db, destination, destinationCoords);
  if (!city) {
    return {
      ready: false,
      cityId: null,
      cityName: destination,
      count: 0,
      latitude: null,
      longitude: null,
    };
  }
  // 원본 :61 = 전체 행수 COUNT(후보군 포함).
  const countRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, city.cityId));
  const count = Number(countRows[0]?.count || 0);
  return {
    ready: count >= READY_THRESHOLD,
    cityId: city.cityId,
    cityName: city.name,
    count,
    latitude: city.latitude ?? null,
    longitude: city.longitude ?? null,
  };
}

// ── 사진 (원본 server/services/shared/place-image.ts) ────────────────────────
//
// 원본 loadImagePidMap 은 R2 를 통째로 나열(listR2)해 PID→키 지도를 만든다.
// 그 파일은 @aws-sdk/client-s3(REST) 를 쓰는데, Worker 안에서는 REST 대신 R2 **바인딩**을 쓰는 것이
// 공식 권고다(cloudflare rules.md "Use bindings for Cloudflare services, not REST APIs").
// 지금 wrangler.jsonc 의 RAW_BUCKET 바인딩은 raw 전용이고 place-images/ 프리픽스 나열 권한 배선은
// 이 작업 범위 밖이므로, **imageUrl 이 있는 행만** 그대로 쓴다(원본 pickPlaceImage 의 첫 분기).
// ⚠️ 차이 = imageUrl 이 비었고 PID 공유 폴백으로만 사진이 붙던 행은 여기서 사진이 빈다.
//    (아래 식당풀 쿼리는 원본과 같이 image_url NOT NULL 을 강제하므로 식당은 영향 없다.)

/** 원본 server/services/shared/place-image.ts:37 pickPlaceImage 의 imageUrl 분기. */
function pickPlaceImage(seed: { imageUrl?: string | null }): string {
  return seed.imageUrl || "";
}

// ── AG1 뼈대 (원본 server/services/agents/ag1-skeleton-builder.ts) ───────────

// ── AG2 = 창고에서 고르기 (원본 ag2-gemini-recommender.ts:125 fetchFromPlaceSeedRaw) ──

/** 원본 server/services/agents/ag2-gemini-recommender.ts:84 computeCatSlots — 순수. */
function computeCatSlots(
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
const AG2_SELECT_COLS = {
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
async function fetchFromPlaceSeedRaw(
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
      isNotNull(placeSeedRaw.googlePlaceId),
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
    const FILL_CATS = [
      "heritage",
      "hotspot",
      "attraction",
      "adventure",
      "healing",
      "shopping",
    ];
    const extra: any[] = await db
      .select(AG2_SELECT_COLS)
      .from(placeSeedRaw)
      .where(
        and(
          poolWhere,
          inArray(placeSeedRaw.seedCategory, FILL_CATS),
          isNotNull(placeSeedRaw.googlePlaceId),
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

  // 원본 :339 = 슬롯 객체 모양 그대로.
  return allRows.map((r: any) => {
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
      city: formData.destination,
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
  });
}

// ── AG4 = 완성 (원본 server/services/agents/ag4-db-finalize.ts:59) ───────────

/** 원본 server/services/exchange-rate.ts:190 getEurToKrwRate — DB 읽기만(외부호출 없음). */
async function getEurToKrwRate(db: Db): Promise<number> {
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

/**
 * 원본 server/services/shared/slot-duration.ts:24 cityHourlyRate.
 * ⚠️ 원본은 db.execute(...).rows 를 읽지만 postgres-js drizzle 의 execute 는 평평한 배열이다
 *    (위 헤더 ④). 그래서 여기서는 같은 SQL 을 drizzle 질의빌더로 다시 세운다 = 결과 동일.
 */
async function cityHourlyRate(db: Db, cityId: number): Promise<number | null> {
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
async function cityMealTiers(
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

interface AG4DbInput {
  daySlotsConfig: DaySlotConfig[];
  travelPace: TravelPace;
  formData: TripFormData;
  companionCount: number;
  dayCount: number;
  cityId: number;
  cityCoords?: { lat: number; lng: number };
  skeleton: AG1Output;
  inputPlaces: PlaceResult[];
}

/** 원본 server/services/agents/ag4-db-finalize.ts:59 finalizeDbOnlyItinerary. */
async function finalizeDbOnlyItinerary(
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
        sql`(${placeSeedRaw.googlePlaceId} IS NOT NULL OR (${pinCond}))`,
        sql`(${placeSeedRaw.priceEur} IS NOT NULL OR (${pinCond}))`,
        sql`((${placeSeedRaw.imageUrl} IS NOT NULL AND ${placeSeedRaw.imageUrl} <> '') OR (${pinCond}))`,
      ),
    )
    .orderBy(
      sql.raw(bestRankOrderSql()),
      sql`${placeSeedRaw.googleReviewCount} DESC NULLS LAST`,
    );

  // 원본 :110 = 좌표 0/NULL 제외 후 슬롯 모양으로.
  const restaurantPool = poolRows
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
    })) as unknown as PlaceResult[];

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
  );
  if (!routeResult.ok || !routeResult.response) {
    throw new Error(
      `[AG4-DB] 로컬 동선 생성 실패 (days=0) = daySlotsConfig 비정상 = 뼈대 점검 필요 (elapsedMs=${routeResult.elapsedMs})`,
    );
  }
  const routeResponse = routeResult.response;

  // ⚠️ 원본 :158 은 backfillFromRoute(...) 를 fire-and-forget 으로 띄운다.
  //    여기서는 부르지 않는다. 두 가지 이유가 다 걸린다:
  //      ① 그 함수는 place-upsert.ts:? upsertPlace 로 place_seed_raw 에 **쓴다**(§14).
  //         이 라우트는 DB-only(읽기 전용) 관문이다.
  //      ② Worker 는 응답 후 대기 없는 작업을 끊는다(fire-and-forget 은 waitUntil 없이는 죽는다).
  //    = 원본과의 의도된 차이. 백필은 Replit 원본이 계속 담당한다.

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

// ── 응답 번역 (원본 server/services/shared/place-translation.ts:75) ──────────

/** 원본 server/services/shared/language-instruction.ts:? LANGS. */
const LANGS = ["ko", "en", "ja", "zh", "fr", "es", "de"] as const;

/** 원본 place-translation.ts:53 readCachedPlaceTranslations = 캐시 읽기만(외부호출 0). */
async function readCachedPlaceTranslations(
  db: Db,
  ids: number[],
  language: string,
): Promise<
  Map<number, { summary: string | null; editorialSummary: string | null }>
> {
  const result = new Map<
    number,
    { summary: string | null; editorialSummary: string | null }
  >();
  if (ids.length === 0) return result;
  const cached = await db
    .select()
    .from(placeTranslations)
    .where(
      and(
        inArray(placeTranslations.placeId, ids),
        eq(placeTranslations.language, language),
      ),
    );
  for (const c of cached)
    result.set(c.placeId, {
      summary: c.summary,
      editorialSummary: c.editorialSummary,
    });
  return result;
}

/** 원본 place-translation.ts:75 applyItineraryTranslations = 제미니 호출 없음(사장님 2026-08-27 = 끔). */
async function applyItineraryTranslations<T extends Record<string, any>>(
  db: Db,
  itinerary: T,
  language: string,
): Promise<T> {
  if (
    !itinerary ||
    language === "ko" ||
    !(LANGS as readonly string[]).includes(language)
  )
    return itinerary;
  const days: any[] = Array.isArray(itinerary.days) ? itinerary.days : [];
  const psrIdOf = (slot: any): number | null => {
    const m = /^db-(\d+)$/.exec(String(slot?.id ?? ""));
    return m ? Number(m[1]) : null;
  };
  const ids = new Set<number>();
  for (const d of days)
    for (const s of Array.isArray(d?.places) ? d.places : []) {
      const id = psrIdOf(s);
      if (id != null) ids.add(id);
    }
  if (ids.size === 0) return itinerary;

  const primary = await readCachedPlaceTranslations(db, [...ids], language);
  const enIds =
    language === "en"
      ? []
      : [...ids].filter((id) => {
          const t = primary.get(id);
          return !t || !t.editorialSummary || !t.summary;
        });
  const fallbackEn =
    enIds.length > 0
      ? await readCachedPlaceTranslations(db, enIds, "en")
      : new Map<
          number,
          { summary: string | null; editorialSummary: string | null }
        >();
  if (primary.size === 0 && fallbackEn.size === 0) return itinerary;

  return {
    ...itinerary,
    days: days.map((d) => {
      if (!Array.isArray(d?.places)) return d;
      return {
        ...d,
        places: d.places.map((s: any) => {
          const id = psrIdOf(s);
          const t = id != null ? primary.get(id) : undefined;
          const e = id != null ? fallbackEn.get(id) : undefined;
          if (!t && !e) return s;
          const editorialSummary = t?.editorialSummary || e?.editorialSummary;
          const summary = t?.summary || e?.summary;
          return {
            ...s,
            ...(editorialSummary ? { editorialSummary } : {}),
            ...(summary ? { summaryKo: summary } : {}),
          };
        }),
      };
    }),
  };
}

// ── 여정 행 저장 (원본 server/itinerary-save.ts + server/storage.ts) ─────────

/** 원본 server/itinerary-save.ts:25 styleToPersonaType. */
const STYLE_TO_PERSONA: Record<string, string> = {
  Luxury: "luxury",
  Premium: "comfort",
  Reasonable: "comfort",
  Economic: "comfort",
  luxury: "luxury",
  comfort: "comfort",
  reasonable: "comfort",
  economic: "comfort",
};

/** 원본 server/city-match.ts:8 matchCityIdByName. */
async function matchCityIdByName(
  db: Db,
  destination: string | null | undefined,
): Promise<number | null> {
  const dest = String(destination || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!dest) return null;
  const rows = await db
    .select({ id: cities.id })
    .from(cities)
    .where(
      sql`LOWER(TRIM(${cities.nameEn})) = ${dest}
          OR LOWER(TRIM(${cities.name})) = ${dest}
          OR LOWER(TRIM(${cities.nameLocal})) = ${dest}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${cities.aliases}) AS alias
            WHERE LOWER(TRIM(alias)) = ${dest}
          )`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * 원본 server/itinerary-save.ts:24 buildItineraryData.
 * ⚠️ 원본 :20 의 computeItineraryFingerprint(node:crypto sha1) 는 여기서 쓰지 않는다.
 *    그 지문은 body.rawData.verificationResult(FE 가 실어 보내는 "AI 의견" 박제)가 있을 때만
 *    쓰이는데, 여정 **생성** 요청에는 그 값이 없다(원본 :35 `if (vr?.result)` 분기 밖).
 */
async function buildItineraryData(db: Db, body: any) {
  const { verificationResult: _vr, ...rawData } = (body.rawData || {}) as any;
  const { cityId: _fromClient, ...bodyRest } = body || {};
  const matchedCityId = await matchCityIdByName(db, rawData?.destination);
  const perPersonEur = (rawData as any)?.totalCost?.perPersonEur;
  const totalCostEur =
    typeof perPersonEur === "number" && isFinite(perPersonEur)
      ? perPersonEur
      : undefined;
  const truthCols = Object.fromEntries(
    [
      "companionType",
      "companionCount",
      "companionAges",
      "curationFocus",
      "vibes",
      "travelPace",
    ]
      .map((k) => [k, (body as any)[k] ?? (rawData as any)[k]])
      .filter(([, v]) => v != null),
  );
  return {
    ...bodyRest,
    ...truthCols,
    ...(matchedCityId != null ? { cityId: matchedCityId } : {}),
    ...(totalCostEur != null ? { totalCost: totalCostEur } : {}),
    userId: body.userId || "admin",
    startDate: body.startDate ? new Date(body.startDate) : new Date(),
    endDate: body.endDate ? new Date(body.endDate) : new Date(),
    personaType: STYLE_TO_PERSONA[body.travelStyle] || "comfort",
    travelStyle: STYLE_TO_PERSONA[body.travelStyle] || "comfort",
    rawData,
  };
}

// ── 파이프라인 (라우트와 자가진단이 함께 쓰는 1벌) ───────────────────────────

/**
 * 원본 server/services/agents/pipeline-db-only.ts:13 runPipelineDbOnly 순서 그대로.
 * ⚠️ 아래 /api/routes/generate 의 본문에서 그대로 떼어낸 1벌이다(문장·순서 무변경).
 *    worker/routes-debug.ts 의 자가진단이 같은 1벌을 부른다(§16 = 재발명 0).
 */
export async function runPipelineDbOnlyWorker(
  db: Db,
  enrichedFormData: Record<string, any>,
  cityCheck: CityReadyResult,
): Promise<any> {
  const skeleton = await buildSkeleton(
    enrichedFormData as unknown as TripFormData,
  );
  const placesArr = await fetchFromPlaceSeedRaw(db, skeleton, {
    cityId: cityCheck.cityId!,
    name: cityCheck.cityName,
  });
  // 원본 pipeline-db-only.ts:37 = isCityReady 가 이미 조회한 도시중심좌표 그대로 전달.
  const cityCoords =
    cityCheck.latitude != null && cityCheck.longitude != null
      ? { lat: cityCheck.latitude, lng: cityCheck.longitude }
      : undefined;
  const itinerary = await finalizeDbOnlyItinerary(db, {
    daySlotsConfig: skeleton.daySlotsConfig,
    travelPace: skeleton.travelPace,
    formData: enrichedFormData as unknown as TripFormData,
    companionCount: skeleton.companionCount,
    dayCount: skeleton.dayCount,
    cityId: cityCheck.cityId!,
    cityCoords,
    skeleton,
    inputPlaces: placesArr,
  });
  // 원본 pipeline-db-only.ts:61 = 메타 표식.
  itinerary.metadata = {
    ...itinerary.metadata,
    _pipelineVersion: "db-only-v2-scene-direct",
    _sourceMode: "db-only",
    _runtime: "cloudflare-worker",
  };
  return itinerary;
}

/** 자가진단(worker/routes-debug.ts)이 쓰는 재수출 1벌 = 값 재선언 0. */
export { isCityReady, READY_THRESHOLD };

// ── 라우트 ──────────────────────────────────────────────────────────────────

/**
 * MIX 로 가야 하는 요청의 응답.
 *   상태코드 501 Not Implemented = "이 서버는 그 기능을 아직 갖고 있지 않다"(RFC 9110 §15.6.2).
 *   400/404 는 "요청이 잘못됐다"는 뜻이라 맞지 않고, 503 은 "잠깐 안 된다(곧 됨)" 라서 맞지 않다.
 *   FE 는 이 본문을 보고 Replit 원본으로 재시도하거나 사장님께 알리면 된다.
 * ⚠️ 차감 0 = 여기까지 오면 크레딧을 건드리지 않는다(§9 = 만든 것이 없으므로).
 */
const MIX_NOT_HERE = {
  error: "mix_route_not_on_worker",
  message:
    "이 도시는 창고 자료가 모자라 외부 호출(MIX) 경로가 필요합니다. 이 서버는 창고(DB)만으로 만드는 경로만 처리합니다.",
} as const;

export function registerItineraryGenerateDbRoutes(
  app: Express,
  openDb: OpenDb,
): void {
  // 원본 server/itinerary-generate-route.ts:15
  app.post("/api/routes/generate", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const formData = req.body;

      // 원본 :19 = 필수값 검사(문구·상태코드 그대로).
      if (!formData.destination || !formData.startDate || !formData.endDate) {
        return res.status(400).json({
          error: "destination, startDate, endDate are required",
        });
      }

      // 원본 :25 = 언어 기본 ko + 로그인 사용자 정보 얹기.
      let enrichedFormData: Record<string, any> = {
        ...formData,
        language: formData.language || "ko",
      };
      if (formData.userId) {
        try {
          const [user] = await db
            .select({
              birthDate: users.birthDate,
              displayName: users.displayName,
              preferredVibes: users.preferredVibes,
              preferredLanguage: users.preferredLanguage,
            })
            .from(users)
            .where(eq(users.id, formData.userId));
          if (user) {
            enrichedFormData = {
              ...formData,
              birthDate: user.birthDate,
              userDisplayName: user.displayName,
              language: formData.language || user.preferredLanguage || "ko",
            };
          }
        } catch (userError) {
          console.warn(
            "[Routes] 사용자 정보 조회 실패 (계속 진행):",
            (userError as Error)?.message,
          );
        }
      }

      // ── 분기 판정 = 원본 pipeline-v3.ts:24 runPipelineV3 과 같은 순서 ──
      //    핀이 있으면 도시만 찾으면 db-only(:32) / 없으면 ready 여야 db-only(:41).
      const isPinnedDbOnly = !!(
        Array.isArray(formData.pinnedPlaceIds) && formData.pinnedPlaceIds.length
      );
      const cityCheck = await isCityReady(
        db,
        enrichedFormData.destination,
        enrichedFormData.destinationCoords,
      );

      if (isPinnedDbOnly && !cityCheck.cityId) {
        // 원본 pipeline-v3.ts:34 = 핀 요청인데 도시 미발견 = 유료 경로로 흘리지 않는다(throw).
        //   원본은 throw → 라우트 :160 catch → 500. 같은 결과를 그대로 낸다.
        return res.status(500).json({
          error: "일정 생성 실패",
          detail: `핀 요청인데 도시 미발견: '${enrichedFormData.destination}' = 무료(db-only) 전제 = 유료 경로로 흘리지 않는다`,
        });
      }

      // MIX 로 가야 하는 요청 = 이 Worker 가 처리하지 않는다.
      if (!isPinnedDbOnly && !cityCheck.ready) {
        console.log(
          `[Worker] city='${cityCheck.cityName}' ready=false (${cityCheck.count} rows) → MIX = 이 서버 대상 아님`,
        );
        return res.status(501).json({
          ...MIX_NOT_HERE,
          destination: enrichedFormData.destination,
          cityId: cityCheck.cityId,
          rows: cityCheck.count,
          required: READY_THRESHOLD,
        });
      }

      // ── §9 크레딧 = 원본 :62 와 같은 자리·같은 규칙 ──
      //   차감 기준 신원은 **로그인 토큰에서만** 읽는다(원본 :63 주석).
      //   핀(BTS) 요청은 원본 :66 대로 사전확인·차감 둘 다 건너뛴다.
      const payerId = getUserIdFromReq(req);
      if (!isPinnedDbOnly && !(await precheckRouteGenerate(db, res, payerId)))
        return; // 402 는 위에서 이미 보냈다(§9 금지 4번 = 헤더 나가기 전).

      // 원본 :72 = 만드는 순간 '만드는 중' 한 줄을 남긴다.
      let draftId: number | null = null;
      if (payerId) {
        try {
          const [row] = await db
            .insert(itineraries)
            .values({
              userId: payerId,
              title: String(enrichedFormData.destination || "여정"),
              startDate: new Date(enrichedFormData.startDate),
              endDate: new Date(enrichedFormData.endDate),
              status: "generating",
            } as any)
            .returning({ id: itineraries.id });
          draftId = row?.id ?? null;
        } catch (e) {
          console.error(
            "[Routes] '만드는 중' 자리 생성 실패(생성은 계속):",
            (e as Error)?.message,
          );
        }
      }

      // ── 파이프라인 = 원본 pipeline-db-only.ts:13 runPipelineDbOnly 순서 그대로 ──
      let itinerary: any;
      try {
        itinerary = await runPipelineDbOnlyWorker(
          db,
          enrichedFormData,
          cityCheck,
        );
      } catch (genErr) {
        if (draftId)
          await db
            .update(itineraries)
            .set({
              status: "failed",
              rawData: { error: String((genErr as Error)?.message || genErr) },
              updatedAt: new Date(),
            } as any)
            .where(eq(itineraries.id, draftId))
            .catch(() => {});
        throw genErr;
      }

      const totalPlacesInDays = (itinerary?.days || []).reduce(
        (sum: number, d: any) => sum + (d.places?.length || 0),
        0,
      );

      // 원본 :127 = 다 만든 여정을 그 자리(위에서 만든 행)에 채운다.
      if (draftId) {
        try {
          const data = await buildItineraryData(db, {
            userId: payerId,
            title:
              itinerary?.title ||
              String(enrichedFormData.destination || "여정"),
            startDate: enrichedFormData.startDate,
            endDate: enrichedFormData.endDate,
            travelStyle: enrichedFormData.travelStyle,
            rawData: itinerary,
          });
          await db
            .update(itineraries)
            .set({ ...data, status: "draft", updatedAt: new Date() } as any)
            .where(eq(itineraries.id, draftId));
        } catch (e) {
          console.error(
            "[Routes] 만든 여정 저장 실패(여정은 그대로 응답):",
            (e as Error)?.message,
          );
        }
      }

      // 원본 :151 = 차감은 **완성 시점에만**(장소가 실제로 담겼을 때만).
      if (!isPinnedDbOnly && totalPlacesInDays > 0)
        await chargeRouteGenerateOnSuccess(
          db,
          payerId,
          draftId ? String(draftId) : undefined,
        );

      // 원본 :157
      res.json(
        await applyItineraryTranslations(
          db,
          draftId ? { ...itinerary, itineraryId: draftId } : itinerary,
          enrichedFormData.language,
        ),
      );
    } catch (error: any) {
      console.error("Error generating itinerary:", error?.message || error);
      // 원본 :165 = API/키 오류면 503, 그 외 500(문구·필드 그대로).
      if (error?.message?.includes("API") || error?.message?.includes("키")) {
        res.status(503).json({
          error: "AI 서비스 연결 오류",
          detail: error.message,
          suggestion: "관리자 대시보드에서 API 키를 확인해주세요.",
        });
      } else {
        res.status(500).json({
          error: "일정 생성 실패",
          detail: error?.message || "Unknown error",
          stack: (error?.stack || "").substring(0, 300),
        });
      }
    } finally {
      close();
    }
  });
}
