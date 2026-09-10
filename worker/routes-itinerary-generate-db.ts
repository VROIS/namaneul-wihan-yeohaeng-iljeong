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
import {
  VIBE_PRIMARY_CATEGORY,
  SIGHT_CATEGORIES,
} from "../shared/vibe-category";
// AG1 뼈대 = 순수(외부·DB 0) = 원본 그대로(§16).
import { buildSkeleton } from "../server/services/agents/ag1-skeleton-builder";
import { runPipelineBest } from "./routes-itinerary-best";
import { getUserIdFromReq } from "./best-itinerary/auth";
import {
  type CityReadyResult,
  isCityReady,
} from "./best-itinerary/city-resolver";
import {
  precheckRouteGenerate,
  chargeRouteGenerateOnSuccess,
} from "./best-itinerary/credits";
import { fetchFromPlaceSeedRaw } from "./best-itinerary/places";
import { finalizeDbOnlyItinerary } from "./best-itinerary/finalize";
import { applyItineraryTranslations } from "./best-itinerary/translate";
import { buildItineraryData } from "./best-itinerary/save";
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

export type Db = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: Db; close: () => void };

// ── 원본 상수·순수함수의 이식 (server/db.ts 를 딸려오는 파일에서만 떼어온다) ──────

/** 원본 server/services/shared/pool-radius.ts:8 */
const POOL_RADIUS_M = 100_000;
/** 원본 server/services/shared/pool-radius.ts:9 */
const CORE_KM = 10;
/** 원본 server/services/shared/pool-radius.ts:44 */
const POOL_LAT_DEG = 0.9;

/** 두 좌표 사이 거리(km). */
export function distanceKmFromCoords(
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

/** 그 도시 여정에 쓸 수 있는 범위(도시 안 + 100km) 걸러내는 조건. */
export function poolWhereSql(
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

/** 손님상에 올릴 수 있는 곳만 = 살아있고·확인됐고·폐업 아닌 것. */
export function servingGateSql(): SQL {
  return sql`(${placeSeedRaw.status} = 'active' AND (COALESCE(${placeSeedRaw.googleReviewCount}, 0) > 0 OR ${placeSeedRaw.bestRank} IS NOT NULL) AND (${placeSeedRaw.googlePlaceId} IS NOT NULL OR ${placeSeedRaw.verifySource} LIKE 'gmaps%') AND (${placeSeedRaw.businessStatus} IS NULL OR ${placeSeedRaw.businessStatus} NOT IN ('CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY')))`;
}

/** 도심에서 얼마나 먼지 다시 계산해 그 행에 적어둔다. */
export function recalcCrossCityZone(
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

/** 이 값 이하 = 무료로 보고 체류시간 계산에서 뺀다. */
export const FREE_THRESHOLD_EUR = 3;
/** 입장료 있는 곳의 표준 체류 = 2시간. */
export const HOURS_PER_AVERAGE_PLACE = 2;
/** 입장료가 체류시간을 대변하는 분류. */
export const PRICED_STAY_CATEGORIES: ReadonlySet<string> = new Set([
  "heritage",
  "attraction",
  "adventure",
  "healing",
]);

// slotMinutesFor(원본 slot-duration.ts:44) · tierRange(원본 meal-budget-tiers.ts:33) 는
// 여기서 옮기지 않는다 = buildRouteLocal 이 그 두 함수를 자기 안에서 직접 쓰고(route-local.ts:17·24),
// 이 라우트는 산출값(hourlyRate·mealTiers)만 넘긴다.

/** 그 도시 식사 예산 아래·위 경계. */
export type CityMealTiers = { lo: number; hi: number };
/** 식사 예산을 정하려면 최소 이만큼 표본이 있어야 한다. */
export const MEAL_TIERS_MIN_SAMPLE = 5;

/** 창고에 이만큼 쌓이면 그 도시는 DB 만으로 여정을 만든다. */
export const READY_THRESHOLD = 200;

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

/** 자가진단 화면이 쓰는 재수출. */
export { isCityReady };

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
              role: users.role,
            })
            .from(users)
            .where(eq(users.id, formData.userId));
          if (user) {
            enrichedFormData = {
              ...formData,
              birthDate: user.birthDate,
              userDisplayName: user.displayName,
              language: formData.language || user.preferredLanguage || "ko",
              // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 관리자면 베스트 분기로 보낸다(화면 버튼 글자도 함께 바뀐다).
              bestOnly: user.role === "admin",
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

      // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 베스트 여정 = 행수(ready 200)와 무관하게 **항상 DB-only** = 도시가 있으면 베스트 분기, 없으면 유료 MIX 로 흘리지 않고 막는다(핀 분기와 동형).
      const isBest = !!enrichedFormData.bestOnly;
      if (isBest && !cityCheck.cityId) {
        return res.status(500).json({
          error: "일정 생성 실패",
          detail: `베스트 요청인데 도시 미발견: '${enrichedFormData.destination}' = DB-only 전제 = 유료 경로로 흘리지 않는다`,
        });
      }

      // 창고가 모자란 도시 = 이 서버가 처리하지 않는다(핀·베스트는 위에서 이미 갈라졌다).
      if (!isPinnedDbOnly && !isBest && !cityCheck.ready) {
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
        itinerary = isBest
          ? await runPipelineBest(db, enrichedFormData as any, cityCheck)
          : await runPipelineDbOnlyWorker(db, enrichedFormData, cityCheck);
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
