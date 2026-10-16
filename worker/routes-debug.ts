import type { Express, Request, Response } from "express";
import { getRoleFromDb, getUserIdFromReq } from "./auth-user";
import { type OpenDb } from "./routes-itinerary-generate-db";

// 후처리 큐 스위치(이 파일)와 큐 소비자는 한 묶음 = 진입점(src.ts, 700줄 초과)이 import 한 줄로 받도록 여기서 내보낸다
export { withGmapsQueue } from "./gmaps-post-queue";

export function registerDebugRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 후처리 큐를 손으로 밀어 넣는 관리자 전용 스위치(실호출 없이 배선 실증·시드발굴 뒤 호출용). GET = 대기 현황만, POST = 큐 등록 (정본 §)
  const gmapsPost = async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      const role = userId ? await getRoleFromDb(db, userId) : "user";
      if (role !== "admin")
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
        await enqueueGmapsPost(cityId, "manual");
      }
      // probe=<cid 숫자|PID> = Browser Run 으로 그 페이지 1장을 읽어 7요소를 돌려준다(쓰기 0) = 워커 안 브라우저 실증
      let probe: unknown = null;
      const key = String(req.query.probe || "");
      if (key) {
        const { launch } = await import("@cloudflare/playwright");
        const { uaFor, readPlacePage } = await import(
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
            userAgent: uaFor(browser),
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
}
