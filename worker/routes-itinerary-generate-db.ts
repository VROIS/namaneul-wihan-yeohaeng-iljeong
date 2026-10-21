// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 갈래 = pipeline-v3.ts 그대로(핀·베스트·DB-only·MIX). 베스트·DB-only = 이 워커 판(사장님 튜닝), MIX = lib/services/agents/pipeline-v3.ts 원본 복사본 + withEngineDb 연결 (정본 §)

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";

import { type TripFormData } from "./lib/services/agents/types";
import { buildSkeleton } from "./lib/services/agents/ag1-skeleton-builder";
import { listBest, runPipelinePicked } from "./routes-itinerary-best";
// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = DB 올리 전환 기준 미달 도시 = 운영 엔진(pipeline-v3 = MIX) 그대로, 연결만 withEngineDb (정본 §)
import { withEngineDb } from "./lib/db";
import { runPipelineV3 } from "./lib/services/agents/pipeline-v3";
import type { Sql } from "postgres";
import { ensureKeys } from "./keys";
import { getUserIdFromReq } from "./auth-user";
import {
  type CityReadyResult,
  cityCoordsOf,
  cityReadyById,
  isCityReady,
} from "./best-itinerary/city-resolver";
import { chargeOnSuccess, precheckFeature } from "../shared/credits";
import { fetchFromPlaceSeedRaw } from "./best-itinerary/places";
import { finalizeDbOnlyItinerary } from "./best-itinerary/finalize";
import { applyItineraryTranslations } from "./best-itinerary/translate";
import { buildItineraryData } from "./best-itinerary/save";
import { waitUntil } from "cloudflare:workers";
import type { Db, OpenDb } from "./db-types";

const { itineraries, users } = schema;

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

async function runPipelineDbOnlyWorker(
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
  const cityCoords = cityCoordsOf(cityCheck);
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
  itinerary.metadata = {
    ...itinerary.metadata,
    _pipelineVersion: "db-only-v2-scene-direct",
    _sourceMode: "db-only",
    _runtime: "cloudflare-worker",
  };
  return itinerary;
}

export function registerItineraryGenerateDbRoutes(
  app: Express,
  openDb: OpenDb,
  openSql: OpenSql,
): void {
  // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 인기 명소 목록 = 로그인한 모든 사용자 · DB 읽기만 · 고른 장소는 /api/routes/generate 에 pickedDays 로 넘겨 예상 여정 (정본 §)
  app.post("/api/best/list", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      const formData = req.body;
      if (!formData.destination || !formData.startDate || !formData.endDate)
        return res.status(400).json({
          error: "destination, startDate, endDate are required",
        });
      // 수정 화면(저장된 여정)은 그 여정의 거점 번호로 같은 목록을 다시 받는다
      const cityCheck = formData.cityId
        ? await cityReadyById(db, Number(formData.cityId))
        : await isCityReady(
            db,
            formData.destination,
            formData.accommodationCoords ?? formData.destinationCoords,
            formData.destinationCountryCode,
          );
      if (!cityCheck.cityId)
        return res.status(404).json({ error: "도시 없음" });
      res.json(await listBest(db, formData, cityCheck));
    } catch (error: any) {
      console.error("[BestList] 실패:", error?.message || error);
      res.status(500).json({ error: "목록 실패", detail: error?.message });
    } finally {
      close();
    }
  });

  app.post("/api/routes/generate", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const formData = req.body;

      if (!formData.destination || !formData.startDate || !formData.endDate) {
        return res.status(400).json({
          error: "destination, startDate, endDate are required",
        });
      }

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

      const isPinnedDbOnly = !!(
        Array.isArray(formData.pinnedPlaceIds) && formData.pinnedPlaceIds.length
      );
      // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 여정은 아이디 하나 = 수정 화면 완료(finalDays) = 그 여정 행을 최종본으로 덮어쓴다 · 새 행 없음 · 차감 없음 · 계산 = 예상 여정과 같은 엔진(식사 칸마다 식당 새로) · 도시 = 그 여정의 거점 번호 (정본 §)
      const isFinal = Array.isArray(enrichedFormData.finalDays);
      const overwriteId = isFinal
        ? Number(enrichedFormData.itineraryId) || null
        : null;
      const payerId = getUserIdFromReq(req);
      let ownRaw: Record<string, any> | null = null;
      let ownCityId: number | null = null;
      if (overwriteId) {
        const [own] = await db
          .select({
            userId: itineraries.userId,
            rawData: itineraries.rawData,
            cityId: itineraries.cityId,
          })
          .from(itineraries)
          .where(eq(itineraries.id, overwriteId));
        if (!own || own.userId !== payerId)
          return res.status(403).json({ error: "내 여정이 아님" });
        ownRaw = (own.rawData as Record<string, any>) ?? null;
        ownCityId = own.cityId ?? null;
      }
      // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 출발점 좌표(없으면 이름)로 거점 폴더를 찾는다(같은 나라 우선, 100km) · 여정 수정 완료 = 내 여정은 그 여정의 거점 번호 · 공유받은 여정은 1일차 출발 좌표 = 읽기만 (정본 §)
      const cityCheck = ownCityId
        ? await cityReadyById(db, ownCityId)
        : await isCityReady(
            db,
            enrichedFormData.destination,
            (isFinal ? enrichedFormData.finalDays[0]?.anchor : null) ??
              enrichedFormData.accommodationCoords ??
              enrichedFormData.destinationCoords,
            enrichedFormData.destinationCountryCode,
          );

      console.log(
        `[CityHub] 조회: "${enrichedFormData.destination}" cc=${enrichedFormData.destinationCountryCode ?? "-"} → 거점=${cityCheck.cityId ?? "없음"} 준비=${cityCheck.ready} 풀=${cityCheck.count}`,
      );

      if (isPinnedDbOnly && !cityCheck.cityId) {
        return res.status(500).json({
          error: "일정 생성 실패",
          detail: `핀 요청인데 도시 미발견: '${enrichedFormData.destination}' = 무료(db-only) 전제 = 유료 경로로 흘리지 않는다`,
        });
      }

      // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 인기 명소 고르기(pickedDays) = 메인 앱 · 핀 없음 · 항상 DB-only(도시 없으면 막음) (정본 §)
      const isBest =
        Array.isArray(enrichedFormData.pickedDays) && !isPinnedDbOnly;
      if (isBest && !cityCheck.cityId) {
        return res.status(500).json({
          error: "일정 생성 실패",
          detail: `인기 명소 요청인데 도시 미발견: '${enrichedFormData.destination}' = DB-only 전제 = 유료 경로로 흘리지 않는다`,
        });
      }

      if (isFinal && !cityCheck.cityId)
        return res
          .status(400)
          .json({ error: "도시 없음(DB 여정만 완료 계산)" });

      const isMix = !isPinnedDbOnly && !isBest && !isFinal && !cityCheck.ready;

      if (
        !isPinnedDbOnly &&
        !isFinal &&
        !(await precheckFeature(db, res, payerId, "route_generate"))
      )
        return; // 402 는 위에서 이미 보냈다(§9 금지 4번 = 헤더 나가기 전).

      let draftId: number | null = overwriteId;
      if (payerId && !overwriteId) {
        try {
          const [row] = await db
            .insert(itineraries)
            .values({
              userId: payerId,
              title: String(enrichedFormData.destination || "여정"),
              startDate: new Date(enrichedFormData.startDate),
              endDate: new Date(enrichedFormData.endDate),
              ...(cityCheck.cityId != null ? { cityId: cityCheck.cityId } : {}),
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

      let itinerary: any;
      try {
        itinerary =
          isFinal || isBest
            ? await runPipelinePicked(db, enrichedFormData as any, cityCheck)
            : isMix
              ? await (async () => {
                  await loadAllKeys(openSql);
                  return withEngineDb(() =>
                    runPipelineV3(enrichedFormData as any),
                  );
                })()
              : await runPipelineDbOnlyWorker(db, enrichedFormData, cityCheck);
      } catch (genErr) {
        if (draftId && !overwriteId)
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

      // ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 빈 일정은 절대 내보내지 않는다(장소 0곳, 또는 3시간 이상인 날이 비면 실패 = 앱은 입력 화면으로 복귀·크레딧 차감 없음) (정본 §)
      const minutesOf = (t: any) => {
        const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      };
      const emptyLongDay = (itinerary?.days || []).some((d: any) => {
        const a = minutesOf(d.startTime);
        const b = minutesOf(d.endTime);
        return !d.places?.length && a != null && b != null && b - a >= 180;
      });
      if (totalPlacesInDays === 0 || emptyLongDay) {
        const empty = new Error("일정 생성 실패: 장소가 비어 있는 날이 있음");
        if (draftId && !overwriteId)
          await db
            .update(itineraries)
            .set({
              status: "failed",
              rawData: { error: empty.message },
              updatedAt: new Date(),
            } as any)
            .where(eq(itineraries.id, draftId))
            .catch(() => {});
        throw empty;
      }

      // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 여정은 아이디 하나 = 완료 덮어쓰기는 원래 여정(만든 길·취향·동행·요약 표시·날마다 숙소)을 그대로 두고 날·비용·동선 기록만 새 계산으로 바꾼다 (정본 §)
      const baseRaw = isFinal
        ? (ownRaw ?? enrichedFormData.baseItinerary ?? null)
        : null;
      if (baseRaw)
        itinerary = {
          ...baseRaw,
          days: itinerary.days.map((d: any, k: number) => ({
            ...d,
            accommodation: baseRaw.days?.[k]?.accommodation ?? d.accommodation,
          })),
          totalCost: itinerary.totalCost,
          metadata: { ...baseRaw.metadata, route: itinerary.metadata?.route },
        };

      const hubCityId: number | null =
        itinerary?.cityId ?? cityCheck.cityId ?? null;
      if (itinerary && hubCityId != null) itinerary.cityId = hubCityId;

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
            .set({
              ...data,
              ...(hubCityId != null ? { cityId: hubCityId } : {}),
              ...(overwriteId ? {} : { status: "draft" }),
              updatedAt: new Date(),
            } as any)
            .where(eq(itineraries.id, draftId));
        } catch (e) {
          console.error(
            "[Routes] 만든 여정 저장 실패(여정은 그대로 응답):",
            (e as Error)?.message,
          );
        }
      }

      if (!isPinnedDbOnly && !isFinal && totalPlacesInDays > 0)
        await chargeOnSuccess(
          db,
          payerId,
          "route_generate",
          draftId ? String(draftId) : undefined,
        );

      res.json(
        await applyItineraryTranslations(
          db,
          draftId ? { ...itinerary, itineraryId: draftId } : itinerary,
          enrichedFormData.language,
        ),
      );
    } catch (error: any) {
      console.error("Error generating itinerary:", error?.message || error);
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
