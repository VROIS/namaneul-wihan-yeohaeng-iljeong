// 가이드(해설 보관함·프롬프트·음성설정) + 영상(상태·담기·뱃지) 라우트 = Worker 이관본.
// 원본 = server/guide-routes.ts · server/video-routes.ts. 응답 모양은 원본과 같게 유지한다.
import type { Express, Request } from "express";
import { and, desc, eq, sql as dsql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../shared/schema";
import type { DayVideo } from "../shared/schema";
import { DEFAULT_OPTION_MODE, readOptionMode } from "./routes-video-config";

type Db = ReturnType<typeof drizzle<typeof schema>>;
export type OpenDb = () => { db: Db; close: () => void };

// 원본 server/auth-user.ts:8 getUserIdFromReq 와 같은 식(정규식 1글자까지 동일).
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

// 원본 server/auth-user.ts:16 getRoleFromDb = creditService.getUserProfile(users 단일행) 의 role.
async function getRoleFromDb(db: Db, userId: string): Promise<string> {
  const [u] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return u?.role || "user";
}

// 원본 server/video-routes.ts:38 · :62
const STALE_PROCESSING_MS = 15 * 60 * 1000;
function isStaleProcessing(v: DayVideo | undefined): boolean {
  if (v?.status !== "processing") return false;
  const ts = Number(v.taskId?.split("_").pop());
  return !ts || Date.now() - ts > STALE_PROCESSING_MS;
}

export function registerGuideVideoRoutes(app: Express, openDb: OpenDb): void {
  // ── 가이드(해설) ──────────────────────────────────────────────────────────

  // 원본 server/guide-routes.ts:304
  app.get("/api/prompts/:language/:type", async (req, res) => {
    const { db, close } = openDb();
    try {
      const { language, type } = req.params;
      const rows = await db
        .select()
        .from(schema.prompts)
        .where(
          and(
            eq(schema.prompts.language, language),
            eq(schema.prompts.type, type),
            eq(schema.prompts.isActive, true),
          ),
        )
        .orderBy(desc(schema.prompts.version))
        .limit(1);
      if (!rows.length)
        return res.status(404).json({ error: "prompt not found" });
      res.json({
        content: rows[0].content,
        language,
        type,
        version: rows[0].version,
      });
    } catch (e) {
      console.error("[guide/prompts]", (e as Error)?.message || e);
      res.status(500).json({ error: "프롬프트 조회 실패" });
    } finally {
      close();
    }
  });

  // 원본 server/guide-routes.ts:333
  app.get("/api/voice-configs", async (_req, res) => {
    const { db, close } = openDb();
    try {
      const rows = await db
        .select()
        .from(schema.voiceConfigs)
        .where(eq(schema.voiceConfigs.isActive, true));
      res.json(
        rows.map((r) => ({
          langCode: r.langCode,
          platform: r.platform,
          voicePriorities: r.voicePriorities,
          excludeVoices: r.excludeVoices || [],
        })),
      );
    } catch (e) {
      console.error("[guide/voice-configs]", (e as Error)?.message || e);
      res.status(500).json({ error: "음성설정 조회 실패" });
    } finally {
      close();
    }
  });

  // 원본 server/guide-routes.ts:432
  // ⚠️ 수정금지(승인필요) 2026-08-06 사장님 승인 = 관리자 = 전체 상황판(모든 사용자의 해설).
  app.get("/api/guides", async (req, res) => {
    const { db, close } = openDb();
    try {
      const authId = getUserIdFromReq(req);
      const owner = authId || (req.query.userId as string);
      if (!owner) return res.status(401).json({ error: "userId required" });
      const isAdmin = authId
        ? (await getRoleFromDb(db, authId)) === "admin"
        : false;
      const rows = await (isAdmin
        ? db.select().from(schema.guides).orderBy(desc(schema.guides.createdAt))
        : db
            .select()
            .from(schema.guides)
            .where(eq(schema.guides.userId, owner))
            .orderBy(desc(schema.guides.createdAt)));
      res.json(rows);
    } catch (e) {
      console.error("[guide/guides]", (e as Error)?.message || e);
      res.status(500).json({ error: "보관함 조회 실패" });
    } finally {
      close();
    }
  });

  // 원본 server/guide-routes.ts:454
  app.delete("/api/guides/:id", async (req, res) => {
    const { db, close } = openDb();
    try {
      const owner = getUserIdFromReq(req) || (req.body?.userId as string);
      if (!owner) return res.status(401).json({ error: "userId required" });
      await db
        .delete(schema.guides)
        .where(
          and(
            eq(schema.guides.id, req.params.id),
            eq(schema.guides.userId, owner),
          ),
        );
      res.json({ success: true });
    } catch (e) {
      console.error("[guide/guides delete]", (e as Error)?.message || e);
      res.status(500).json({ error: "보관함 삭제 실패" });
    } finally {
      close();
    }
  });

  // ── 영상 ─────────────────────────────────────────────────────────────────

  // 원본 server/video-routes.ts:485 — 구체 경로가 :param 보다 먼저.
  app.get("/api/videos/badge", async (req, res) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.json({ count: 0 });
      const [row] = await db
        .select({ n: dsql<number>`COUNT(*)::int` })
        .from(schema.savedVideos)
        .where(
          and(
            eq(schema.savedVideos.userId, userId),
            eq(schema.savedVideos.isNew, true),
          ),
        );
      res.json({ count: row?.n || 0 });
    } catch (e) {
      console.error("[video] 뱃지 오류:", e);
      res.json({ count: 0 }); // 뱃지는 장식 = 실패가 앱을 막으면 안 됨
    } finally {
      close();
    }
  });

  // 원본 server/video-routes.ts:421
  // ⚠️ 2026-08-06 사장님 승인 = 관리자 = 전체 상황판(모든 사용자의 담긴 영상).
  app.get("/api/videos/saved", async (req, res) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      const isAdmin = (await getRoleFromDb(db, userId)) === "admin";
      // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = cityNameEn = 읽을 때 이어붙이는 도시 영문명(§16).
      const rows = await db
        .select({
          itineraryId: schema.savedVideos.itineraryId,
          day: schema.savedVideos.day,
          isNew: schema.savedVideos.isNew,
          savedAt: schema.savedVideos.createdAt,
          title: schema.itineraries.title,
          startDate: schema.itineraries.startDate,
          cityNameEn: schema.cities.nameEn,
        })
        .from(schema.savedVideos)
        .innerJoin(
          schema.itineraries,
          eq(schema.itineraries.id, schema.savedVideos.itineraryId),
        )
        .leftJoin(
          schema.cities,
          eq(schema.cities.id, schema.itineraries.cityId),
        )
        .where(
          and(
            dsql`(${isAdmin} OR ${schema.savedVideos.userId} = ${userId})`,
            dsql`${schema.itineraries.videoByDay} -> (${schema.savedVideos.day}::text) ->> 'status' = 'succeeded'`,
          ),
        )
        .orderBy(
          desc(schema.savedVideos.isNew),
          desc(schema.savedVideos.createdAt),
          schema.savedVideos.day,
        );
      res.json(rows);
    } catch (e) {
      console.error("[video] 저장목록 오류:", e);
      res.status(500).json({ error: "저장 목록 조회 실패" });
    } finally {
      close();
    }
  });

  // 원본 server/video-routes.ts:456
  app.post("/api/videos/save", async (req, res) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      const itineraryId = parseInt(String(req.body?.itineraryId));
      const day = parseInt(String(req.body?.day));
      if (isNaN(itineraryId) || isNaN(day) || day < 1)
        return res.status(400).json({ error: "itineraryId + day 필요" });
      const chk = await db
        .select({ one: dsql<number>`1` })
        .from(schema.itineraries)
        .where(
          and(
            eq(schema.itineraries.id, itineraryId),
            dsql`${schema.itineraries.videoByDay} -> (${String(day)}::text) ->> 'status' = 'succeeded'`,
          ),
        );
      if (!chk.length)
        return res.status(404).json({ error: "완성된 영상이 없는 날짜" });
      await db
        .insert(schema.savedVideos)
        .values({ userId, itineraryId, day, isNew: false })
        .onConflictDoNothing({
          target: [
            schema.savedVideos.userId,
            schema.savedVideos.itineraryId,
            schema.savedVideos.day,
          ],
        });
      res.json({ success: true });
    } catch (e) {
      console.error("[video] 담기 오류:", e);
      res.status(500).json({ error: "저장 실패" });
    } finally {
      close();
    }
  });

  // 원본 server/video-routes.ts:500
  app.post("/api/videos/seen", async (req, res) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      const itineraryId = parseInt(String(req.body?.itineraryId));
      const day = parseInt(String(req.body?.day));
      if (isNaN(itineraryId) || isNaN(day))
        return res.status(400).json({ error: "itineraryId + day 필요" });
      await db
        .update(schema.savedVideos)
        .set({ isNew: false })
        .where(
          and(
            eq(schema.savedVideos.userId, userId),
            eq(schema.savedVideos.itineraryId, itineraryId),
            eq(schema.savedVideos.day, day),
          ),
        );
      res.json({ success: true });
    } catch (e) {
      console.error("[video] 열람해제 오류:", e);
      res.status(500).json({ error: "열람 처리 실패" });
    } finally {
      close();
    }
  });

  // 원본 server/video-routes.ts:399
  app.get("/api/itineraries/:id/video", async (req, res) => {
    const { db, close } = openDb();
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "잘못된 id" });
      const [itin] = await db
        .select()
        .from(schema.itineraries)
        .where(eq(schema.itineraries.id, id));
      if (!itin) return res.status(404).json({ error: "여정 없음" });
      const videoByDay: Record<string, DayVideo> = {
        ...(itin.videoByDay || {}),
      };
      for (const [d, v] of Object.entries(videoByDay)) {
        if (isStaleProcessing(v)) videoByDay[d] = { ...v, status: "failed" };
      }
      // 설정 읽기가 실패해도 영상 상태 조회는 살린다(모드는 기본값으로).
      const optionMode = await readOptionMode(db).catch(
        () => DEFAULT_OPTION_MODE,
      );
      res.json({ videoByDay, optionMode });
    } catch (e) {
      console.error("[video] 상태조회 오류:", e);
      res.status(500).json({ error: "상태 조회 실패" });
    } finally {
      close();
    }
  });
}
