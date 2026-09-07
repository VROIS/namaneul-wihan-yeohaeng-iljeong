// ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 관리자 "번호로 찾아 열기" = 열람 전용 1벌(프로필은 최신 20건만 보이므로 그 밖의 건은 여기서 연다)
import type { Express } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { guides, itineraries, savedVideos } from "../../shared/schema";

export function registerAdminLookupRoutes(app: Express) {
  app.get("/api/admin/lookup/:kind/:id", async (req, res) => {
    if (!db) return res.status(503).json({ error: "db_unavailable" });

    const { kind, id } = req.params;
    // 숫자 번호를 쓰는 종류는 숫자가 아니면 여기서 끊는다(질의로 내려보내지 않는다).
    if (kind !== "guide" && !Number.isFinite(Number(id)))
      return res.status(400).json({ error: "invalid_id" });
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
    }
  });
}
