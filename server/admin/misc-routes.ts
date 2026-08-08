// 여정 경보 라우트 = admin-routes 분리(2026-07-16 §0 슬림화, 순수 이동)
// ⚠️ 2026-07-16 = /api/budget/* 라우트군 = 호출자 0 + 기존 500 크래시(계약 불일치) = §19 완전삭제(admin·itinerary 양쪽 모두).
import type { Express } from "express";

export function registerMiscAdminRoutes(app: Express) {
  // ========================================
  // /api/trip-alerts* = TripPlannerScreen 호출 (= DB SELECT 만)
  // ========================================
  app.get("/api/trip-alerts", async (req, res) => {
    try {
      const { crisisAlertService } = await import(
        "../services/crisis-alert-service"
      );
      const city = req.query.city as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!city || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: "city, startDate, endDate 파라미터가 필요합니다",
        });
      }
      const result = await crisisAlertService.getAlertsForTrip(
        city,
        startDate,
        endDate,
      );
      res.json({
        success: true,
        ...result,
        shouldShowPopup: result.highSeverity,
        notificationLevel: result.highSeverity
          ? "warning"
          : result.hasAlerts
            ? "info"
            : "none",
        alertCount: result.alerts.length,
      });
    } catch (error) {
      console.error("Error fetching trip alerts:", error);
      res
        .status(500)
        .json({ success: false, alerts: [], summary: "위기 정보 조회 실패" });
    }
  });

  // ⚠️ 2026-07-16 = POST /api/trip-alerts/check 완전삭제(§19) = client/bts-app/public/admin-dashboard.html 전수 grep 호출자 0.
  //   GET /api/trip-alerts(위)는 useGenerateItinerary.ts 실사용 = 무손 보존.

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **탈퇴 유예 만료 계정 즉시 정리**(관리자 버튼).
  //   자동(하루 1회 data-scheduler)과 **같은 함수 1벌**을 부른다 = 동작이 두 벌로 갈리지 않는다(§0).
  //   존재 이유 = 6개월을 기다릴 수 없으니 눈으로 확인하려면 즉시 실행이 필요하다(§22 실증).
  //   ⚠️ 화면 버튼은 아직 없다 = 지금은 관리자 토큰으로 직접 호출하는 검증용(2026-08-08).
  //   ⚠️ 이 라우트만 **R2 파일을 영구 삭제**하므로 형제 admin 라우트와 달리 관리자 확인을 반드시 건다(§22 판단검증).
  //     판정 기준 = users.role='admin' (credit-charge.ts:56 과 같은 1벌. 아이디 문자열 판단 금지 §9 표7).
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
