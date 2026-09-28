import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { getRoleFromDb, getUserIdFromReq } from "./auth-user";

const { users } = schema;

// 연결 1벌 = 반드시 close.
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

export function registerMisc2Routes(app: Express, openDb: OpenDb): void {
  // 같은 경로의 /me 는 GET 뿐이라 메서드가 겹치지 않는다.
  app.patch("/api/expert/profile", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });
      const role = await getRoleFromDb(db, authId);
      if (role !== "expert" && role !== "admin")
        return res.status(403).json({ error: "expert_only" });

      const { nickname, career, bio, character, avatarUrl } = req.body || {};
      const s = (v: unknown, n: number) =>
        typeof v === "string" && v.trim() !== "" ? v.slice(0, n) : undefined;
      const profile = {
        nickname: s(nickname, 40),
        career: s(career, 60),
        bio: s(bio, 150),
        character: s(character, 20),
        avatarUrl: typeof avatarUrl === "string" ? avatarUrl : undefined,
      };
      const [u] = await db
        .update(users)
        .set({ expertProfile: profile })
        .where(eq(users.id, authId))
        .returning({ profile: users.expertProfile });
      res.json({ success: true, profile: u?.profile || null });
    } catch (e) {
      console.error("[Expert] 프로필 저장 실패:", (e as Error)?.message);
      res.status(500).json({ error: "Failed to save profile" });
    } finally {
      close();
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 탈퇴 유예 만료 계정 즉시 정리(관리자 버튼) = 매일 04:30 예약과 같은 정리 함수 1벌 (정본 9-27)
  app.post(
    "/api/admin/account-cleanup",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const uid = getUserIdFromReq(req);
        if (!uid) return res.status(401).json({ error: "login_required" });
        if ((await getRoleFromDb(db, uid)) !== "admin")
          return res.status(403).json({ error: "admin_only" });

        const { withEngineDb } = await import("./lib/db");
        const { cleanupDeletedAccounts } = await import(
          "./lib/services/account-cleanup"
        );
        const result = await withEngineDb(() => cleanupDeletedAccounts());
        res.json({ success: true, ...result });
      } catch (error) {
        console.error(
          "[Admin] 탈퇴 계정 정리 실패:",
          (error as Error)?.message || error,
        );
        res.status(500).json({ success: false, error: "cleanup_failed" });
      } finally {
        close();
      }
    },
  );
}
