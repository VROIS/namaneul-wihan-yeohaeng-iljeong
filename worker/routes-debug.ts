// GET /api/debug/generate-test = Worker 이관본 (2026-09-06)
// 원본 = server/city-place-routes.ts:395 (가드 :396 / steps :401 / 응답 :454 / catch :489)
//
// 이 라우트는 여정 생성 파이프라인이 실제로 도는지 보는 **자가진단**이다.
// 고정 테스트값이 destination="Paris"(원본 :419) 이고 파리는 창고가 차 있어
// isCityReady().ready 가 참 → 원본 pipeline-v3.ts:41 이 runPipelineDbOnly 로 직행한다
// = 외부 유료호출 0건. 그래서 Worker 로 옮길 수 있다.
//
// 파이프라인은 **다시 짜지 않는다**(§16). routes-itinerary-generate-db.ts 가 이미 옮겨둔
// runPipelineDbOnlyWorker / isCityReady / READY_THRESHOLD 1벌을 그대로 부른다.
import type { Express, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import * as schema from "../shared/schema";
import {
  isCityReady,
  runPipelineDbOnlyWorker,
  READY_THRESHOLD,
  type OpenDb,
} from "./routes-itinerary-generate-db";

const { cities, users } = schema;
// 후처리 큐 스위치(이 파일)와 큐 소비자는 한 묶음 = 진입점(src.ts, 700줄 초과)이 import 한 줄로 받도록 여기서 내보낸다
export { withGmapsQueue } from "./gmaps-post-queue";

/** 원본 server/auth-user.ts:8 getUserIdFromReq = 헤더 정규식만(DB 무관). */
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

interface PlaceSample {
  name: unknown;
  source: unknown;
  score: unknown;
}

export function registerDebugRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 후처리 큐를 손으로 밀어 넣는 관리자 전용 스위치(실호출 없이 배선 실증·시드발굴 뒤 호출용). GET = 대기 현황만, POST = 큐 등록 (정본 §)
  const gmapsPost = async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      const [user] = userId
        ? await db.select().from(users).where(eq(users.id, userId))
        : [undefined];
      if (user?.role !== "admin")
        return res.status(403).json({ error: "관리자 전용" });
      const cityId = Number(req.query.cityId || req.body?.cityId || 0);
      const { pendingByCity, r2PrefixOf } = await import(
        "./lib/services/fill/gmaps-post"
      );
      const { withEngineDb, pool } = await import("./lib/db");
      const pending = await withEngineDb(() =>
        pendingByCity(pool!, r2PrefixOf(process.env.R2_PUBLIC_URL), cityId),
      );
      if (req.method === "POST") {
        if (!cityId) return res.status(400).json({ error: "cityId 필요" });
        const { enqueueGmapsPost } = await import("./gmaps-post-queue");
        const reportKey = String(req.body?.reportKey || "") || undefined;
        await enqueueGmapsPost(
          cityId,
          reportKey ? "seed-insert" : "manual",
          reportKey,
        );
      }
      // probe=<cid 숫자|PID> = Browser Run 으로 그 페이지 1장을 읽어 7요소를 돌려준다(쓰기 0) = 워커 안 브라우저 실증
      let probe: unknown = null;
      const key = String(req.query.probe || "");
      if (key) {
        const { launch } = await import("@cloudflare/playwright");
        const { BROWSER_UA, readPlacePage } = await import(
          "./lib/services/fill/gmaps-pid-identity/page-reader"
        );
        const t0 = Date.now();
        const browser = await launch(
          (process.env as any).BROWSER ??
            (await import("cloudflare:workers")).env.BROWSER,
        );
        try {
          const ctx = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            userAgent: BROWSER_UA,
          });
          const page = await ctx.newPage();
          const d = await readPlacePage(
            page,
            /^\d+$/.test(key) ? `cid:${key}` : key,
            "en",
            true,
            400,
          );
          await ctx.close();
          probe = { ...d, ms: Date.now() - t0 };
        } finally {
          await browser.close().catch(() => {});
        }
      }
      res.json({
        enqueued: req.method === "POST" ? cityId : null,
        pending,
        probe,
      });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    } finally {
      await close();
    }
  };
  app.get("/api/debug/gmaps-post", gmapsPost);
  app.post("/api/debug/gmaps-post", gmapsPost);

  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 관리자 전용 잠금(§9 표7 판단기준 = users.role 1벌).
  app.get("/api/debug/generate-test", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      // 원본 :397 storage.getUser(server/storage.ts:61).
      const [user] = userId
        ? await db.select().from(users).where(eq(users.id, userId))
        : [undefined];
      if (user?.role !== "admin") {
        return res.status(403).json({ error: "관리자 전용 진단 엔드포인트" });
      }
      const steps: string[] = [];
      const start = Date.now();
      try {
        steps.push(`[${Date.now() - start}ms] Start`);

        // 원본 :406 = 제미니 열쇠 유무를 steps 에 적을 뿐, 막지는 않는다.
        //   Worker 는 모듈 최상단 process.env 를 읽지 않으므로 요청 시점의 env 에서 읽는다.
        //   DB-only 경로는 제미니를 부르지 않는다 = 없어도 그대로 진행(원본과 동일).
        const geminiKey =
          (globalThis as { process?: { env?: Record<string, string> } }).process
            ?.env?.GEMINI_API_KEY || "";
        steps.push(
          `[${Date.now() - start}ms] Gemini key: ${geminiKey ? "present (" + geminiKey.substring(0, 8) + "...)" : "MISSING"}`,
        );

        // 원본 :411
        const cityCheck0 = await db
          .select({ count: sql<number>`count(*)` })
          .from(cities);
        steps.push(
          `[${Date.now() - start}ms] DB OK - cities: ${cityCheck0[0]?.count}`,
        );

        // 원본 :418 = 고정 테스트값(한 글자도 바꾸지 않는다).
        const testFormData = {
          destination: "Paris",
          startDate: "2026-03-01",
          endDate: "2026-03-01",
          vibes: ["Shopping"],
          curationFocus: "Everyone",
          companionType: "Single",
          companionCount: 1,
          travelStyle: "Reasonable",
          mobilityStyle: "Moderate",
          travelPace: "Normal",
          birthDate: "1990-01-01",
          companionAges: "",
          startTime: "10:00",
          endTime: "18:00",
          destinationCoords: { lat: 48.8566, lng: 2.3522 },
        };

        steps.push(
          `[${Date.now() - start}ms] Calling generateItinerary (4+1 Agent Pipeline)...`,
        );

        // 원본 :439 itineraryGenerator.generate → pipeline-v3.ts:24 runPipelineV3 의 분기를
        //   그대로 밟는다. 파리는 ready 라 :41 db-only 로 간다(외부호출 0).
        const cityCheck = await isCityReady(
          db,
          testFormData.destination,
          testFormData.destinationCoords,
        );
        if (!cityCheck.ready) {
          // MIX 로 갈 요청은 이 서버가 처리하지 않는다
          //   (routes-itinerary-generate-db.ts 의 501 과 같은 뜻 = 여기서는 진단이므로 steps 로 보고).
          throw new Error(
            `MIX 경로 필요 = 이 서버 대상 아님: city='${cityCheck.cityName}' rows=${cityCheck.count} < ${READY_THRESHOLD}`,
          );
        }
        const result = await runPipelineDbOnlyWorker(
          db,
          testFormData,
          cityCheck,
        );

        const totalMs = Date.now() - start;
        const dayCount = result?.days?.length || 0;
        const placeCount =
          result?.days?.reduce(
            (sum: number, d: { places?: unknown[] }) =>
              sum + (d?.places?.length || 0),
            0,
          ) || 0;

        steps.push(`[${totalMs}ms] SUCCESS - ${dayCount}일 ${placeCount}곳`);

        const pipelineTimings: Record<string, number> =
          result?.metadata?._timings || {};
        const pipelineTotal = result?.metadata?._totalMs || totalMs;

        // 원본 :454 = 응답 형식·필드명 그대로.
        res.json({
          status: "ok",
          steps,
          totalMs,
          pipeline: {
            version: result?.metadata?._pipelineVersion || "unknown",
            totalMs: pipelineTotal,
            stages: {
              AG1_skeleton: pipelineTimings["AG1_skeleton"] || 0,
              AG2_AG3pre_parallel: pipelineTimings["AG2_AG3pre_parallel"]
                ? pipelineTimings["AG2_AG3pre_parallel"] -
                  (pipelineTimings["AG1_skeleton"] || 0)
                : 0,
              AG3_matchScore: pipelineTimings["AG3_matchScore"]
                ? pipelineTimings["AG3_matchScore"] -
                  (pipelineTimings["AG2_AG3pre_parallel"] || 0)
                : 0,
              AG4_finalize: pipelineTimings["AG4_finalize"]
                ? pipelineTimings["AG4_finalize"] -
                  (pipelineTimings["AG3_matchScore"] || 0)
                : 0,
            },
            summary: `AG1:${pipelineTimings["AG1_skeleton"] || "?"}ms → AG2+3pre:${pipelineTimings["AG2_AG3pre_parallel"] ? pipelineTimings["AG2_AG3pre_parallel"] - (pipelineTimings["AG1_skeleton"] || 0) : "?"}ms → AG3:${pipelineTimings["AG3_matchScore"] ? pipelineTimings["AG3_matchScore"] - (pipelineTimings["AG2_AG3pre_parallel"] || 0) : "?"}ms → AG4:${pipelineTimings["AG4_finalize"] ? pipelineTimings["AG4_finalize"] - (pipelineTimings["AG3_matchScore"] || 0) : "?"}ms = 총 ${pipelineTotal}ms`,
          },
          result: {
            days: dayCount,
            totalPlaces: placeCount,
            placeSample:
              result?.days?.[0]?.places?.slice(0, 3)?.map(
                (p: {
                  name?: unknown;
                  sourceType?: unknown;
                  finalScore?: unknown;
                }): PlaceSample => ({
                  name: p.name,
                  source: p.sourceType,
                  score: p.finalScore,
                }),
              ) || [],
          },
        });
      } catch (error) {
        // 원본 :489 = 실패해도 200 + status:"error"(진단용이라 그대로).
        const err = error as { message?: string; stack?: string };
        steps.push(`[${Date.now() - start}ms] ERROR: ${err?.message}`);
        steps.push(
          `[${Date.now() - start}ms] Stack: ${(err?.stack || "").substring(0, 500)}`,
        );
        res.json({ status: "error", steps, totalMs: Date.now() - start });
      }
    } finally {
      close();
    }
  });
}
