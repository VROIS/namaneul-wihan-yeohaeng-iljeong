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
}
