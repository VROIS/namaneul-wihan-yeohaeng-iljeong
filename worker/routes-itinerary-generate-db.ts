// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 갈래 = 원본 pipeline-v3.ts:24 그대로(핀·베스트·DB-only·MIX). 베스트·DB-only = 이 워커 판(사장님 튜닝), MIX = lib/services/agents/pipeline-v3.ts 원본 복사본 + withEngineDb 연결 (정본 §)

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

import {
  MEAL_BUDGET,
  type AG1Output,
  type DaySlotConfig,
  type PlaceResult,
  type SeedCategory,
  type TravelPace,
  type TripFormData,
} from "./lib/services/agents/types";
import {
  normalizeTravelStyle,
  sanitizePriceEur,
} from "./lib/services/agents/pipeline-v3-types";
import {
  haversineKm,
  pickTransitMode,
  estimateTransitCost,
} from "./lib/services/agents/transit-haversine";
import { bestRankOrderSql } from "./lib/services/shared/best-rank";
import {
  COMPANION_TO_TRANSPORT,
  DEFAULT_PRICES,
  type CompanionType,
  type MobilityStyle,
  type TransportType,
  type TravelStyle,
} from "./lib/services/transport/constants";
import {
  VIBE_PRIMARY_CATEGORY,
  SIGHT_CATEGORIES,
} from "../shared/vibe-category";
import { buildSkeleton } from "./lib/services/agents/ag1-skeleton-builder";
import { runPipelineBest } from "./routes-itinerary-best";
// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 창고 200행 미만 도시 = 운영 엔진(pipeline-v3 = MIX) 그대로, 연결만 withEngineDb (정본 §)
import { withEngineDb } from "./lib/db";
import { runPipelineV3 } from "./lib/services/agents/pipeline-v3";
import type { Sql } from "postgres";
import { ensureKeys } from "./keys";
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
import { buildRouteLocal } from "./lib/services/route/route-local";
import { enqueueGmapsPost } from "./gmaps-post-queue";
import { waitUntil } from "cloudflare:workers";

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
type OpenSql = () => Sql;

async function loadAllKeys(openSql: OpenSql): Promise<void> {
  const kc = openSql();
  try {
    await ensureKeys(kc);
  } finally {
    // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 응답 뒤 끊기는 약속을 waitUntil 로 살려 실제로 닫는다(src.ts openDb 와 같은 수리 = 풀러 칸 누수).
    waitUntil(kc.end({ timeout: 5 }));
  }
}

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

export function registerItineraryGenerateDbRoutes(
  app: Express,
  openDb: OpenDb,
  openSql: OpenSql,
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

      // 원본 pipeline-v3.ts:51-58 = 창고 200행 미만(핀·베스트 아님) = MIX 엔진.
      const isMix = !isPinnedDbOnly && !isBest && !cityCheck.ready;

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
          : isMix
            ? await (async () => {
                await loadAllKeys(openSql);
                return withEngineDb(() =>
                  runPipelineV3(enrichedFormData as any),
                );
              })()
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

      // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = MIX 가 창고를 건드렸으면 응답과 별개로 큐에 "도시 N" 한 줄 = 후처리(구글맵 채움·흡수)가 뒤에서 스스로 돈다. 큐 실패는 응답을 막지 않는다 (정본 §)
      if (isMix && cityCheck.cityId)
        await enqueueGmapsPost(cityCheck.cityId, "mix").catch((e) =>
          console.error("[gmaps-post] 큐 등록 실패:", (e as Error)?.message),
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
