import type { Express } from "express";

export function registerMiscAdminRoutes(app: Express) {
  // ⚠️ 2026-08-10 사장님 지시 = 위기경보 전부 완전삭제(§19). 서비스·라우트·화면 배너·팝업 모두 제거.

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **탈퇴 유예 만료 계정 즉시 정리**(관리자 버튼).
  app.post("/api/admin/account-cleanup", async (req, res) => {
    try {
      const { getUserIdFromReq, getRoleFromDb } = await import("../auth-user");
      const uid = getUserIdFromReq(req);
      if (!uid) return res.status(401).json({ error: "login_required" });
      if ((await getRoleFromDb(uid)) !== "admin")
        return res.status(403).json({ error: "admin_only" });

      const { cleanupDeletedAccounts } = await import(
        "../services/account-cleanup"
      );
      const result = await cleanupDeletedAccounts();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Admin] 탈퇴 계정 정리 실패:", error?.message || error);
      res.status(500).json({ success: false, error: "cleanup_failed" });
    }
  });
}
