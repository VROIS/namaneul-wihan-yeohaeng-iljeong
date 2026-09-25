// ⚠️ 수정금지(승인필요) 2026-09-25 사장님 결정 = 관리자 "번호로 찾아 열기" = 트리피스 1벌(원본 server/admin/lookup-routes.ts 그대로, DB 연결만 openDb) (정본 9-25)
import type { Express } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";

const { guides, itineraries, savedVideos } = schema;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

export function registerAdminLookupRoutes(app: Express, openDb: OpenDb) {
  app.get("/api/admin/lookup/:kind/:id", async (req, res) => {
    const { kind, id } = req.params;
    // 숫자 번호를 쓰는 종류는 숫자가 아니면 여기서 끊는다(질의로 내려보내지 않는다).
    if (kind !== "guide" && !Number.isFinite(Number(id)))
      return res.status(400).json({ error: "invalid_id" });
    const { db, close } = openDb();
    try {
      if (kind === "itinerary") {
        const [row] = await db
          .select()
          .from(itineraries)
          .where(eq(itineraries.id, Number(id)));
        if (!row) return res.status(404).json({ error: "not_found" });
        return res.json({ kind, item: row });
      }

      if (kind === "guide") {
        const [row] = await db.select().from(guides).where(eq(guides.id, id));
        if (!row) return res.status(404).json({ error: "not_found" });
        return res.json({ kind, item: row });
      }

      if (kind === "video") {
        const [row] = await db
          .select()
          .from(savedVideos)
          .where(eq(savedVideos.id, Number(id)));
        if (!row) return res.status(404).json({ error: "not_found" });
        return res.json({ kind, item: row });
      }

      return res.status(400).json({ error: "unknown_kind" });
    } catch (e) {
      console.error("[Admin] lookup 실패:", (e as Error)?.message);
      res.status(500).json({ error: "server_error" });
    } finally {
      close();
    }
  });
}
