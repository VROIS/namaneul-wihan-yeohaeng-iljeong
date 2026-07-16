// 대시보드/환율/관제탑 라우트 = admin-routes 분리(2026-07-16 §0 슬림화, 순수 이동)
import type { Express } from "express";
import { db, isDatabaseConnected } from "../db";
import path from "path";
import fs from "fs";
import {
  apiServiceStatus,
  exchangeRates,
  cities,
  placeSeedRaw,
} from "../../shared/schema";
import { sql, count } from "drizzle-orm";

const DEFAULT_DASHBOARD_DATA = {
  overview: {
    cities: 0,
    places: 0,
    youtubeChannels: 0,
    blogSources: 0,
    freshDataRatio: 0,
  },
  apiServices: [],
  recentSyncs: [],
  dbConnected: false,
};

export function registerDashboardRoutes(app: Express) {
  // ========================================
  // /admin HTML 페이지
  // ========================================
  app.get("/admin", (_req, res) => {
    const possiblePaths = [
      path.join(__dirname, "..", "templates", "admin-dashboard.html"), // server/admin/ 로 이동 = 템플릿은 상위 server/templates (2026-07-16 분리)
      path.join(process.cwd(), "server", "templates", "admin-dashboard.html"),
      path.join(process.cwd(), "server_dist", "templates", "admin-dashboard.html"),
    ];
    const templatePath = possiblePaths.find((p) => fs.existsSync(p));
    if (templatePath) {
      res.sendFile(templatePath);
    } else {
      console.error("[Admin] Template not found");
      res.status(404).send("Admin dashboard not found");
    }
  });

  // ========================================
  // /api/admin/dashboard = 단순 통계 (PSR + cities + exchange 만)
  // = 옛 places/youtubeChannels/blogSources/freshDataRatio = 호환 위해 0 반환
  // ========================================
  app.get("/api/admin/dashboard", async (_req, res) => {
    if (!isDatabaseConnected() || !db) {
      return res.json(DEFAULT_DASHBOARD_DATA);
    }
    try {
      const [cityRow] = await db.select({ count: count() }).from(cities);
      const [psrRow] = await db.select({ count: count() }).from(placeSeedRaw);
      const [exchangeRow] = await db.select({ count: count() }).from(exchangeRates);

      // PSR 14 SSOT 채움률 (= 사용자 SSOT)
      // ⚠️ 2026-07-16 수정 = db.execute()는 배열이 아니라 pg.QueryResult 객체 반환(.rows 프로퍼티 보유) = 배열 구조분해 시 "not iterable" 500 (실측: node-postgres 드라이버 실제 호출로 shape 확인). 구조분해 제거.
      const fillRow = await db.execute(
        sql`SELECT
          COUNT(image_url)::int AS img,
          COUNT(price_eur)::int AS price,
          COUNT(summary_ko)::int AS sum,
          COUNT(google_place_id)::int AS pid
        FROM place_seed_raw`,
      ) as any;
      const filled = fillRow?.rows?.[0] || fillRow || { img: 0, price: 0, sum: 0, pid: 0 };

      const apiServicesList = await db.select().from(apiServiceStatus);

      res.json({
        overview: {
          cities: cityRow?.count || 0,
          places: psrRow?.count || 0, // ← 옛 필드명 보존 (= 실제는 PSR)
          youtubeChannels: 0,
          blogSources: 0,
          freshDataRatio: 0,
        },
        psrFillRate: {
          image: filled.img || 0,
          price: filled.price || 0,
          summary: filled.sum || 0,
          pid: filled.pid || 0,
          total: psrRow?.count || 0,
        },
        exchangeRates: exchangeRow?.count || 0,
        apiServices: apiServicesList,
        recentSyncs: [],
        dbConnected: true,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      res.status(500).json(DEFAULT_DASHBOARD_DATA);
    }
  });

  // ⚠️ 2026-07-16 = GET /api/admin/exchange-rates 완전삭제(§19) = client/bts-app/public/admin-dashboard.html 전수 grep 호출자 0.
  //   admin-dashboard.html 은 다른 경로(/api/admin/sync/exchange-rates POST, 서버에 없음)를 부르는 옛 UI 잔존이었음(D 항목에서 별도 정리).

  // ========================================
  // /api/admin/control-tower/summary = 시스템 상태 요약 (= PSR + cities + apiServices 만)
  // = 옛 dataSyncLog + geminiWebSearchCache + routeCache 의존 제거
  // ========================================
  app.get("/api/admin/control-tower/summary", async (_req, res) => {
    if (!db) return res.json({ dbConnected: false });
    try {
      const [cityRow] = await db.select({ count: count() }).from(cities);
      const [psrRow] = await db.select({ count: count() }).from(placeSeedRaw);
      const apiServices = await db.select().from(apiServiceStatus);
      const connectedApis = apiServices.filter((s) => s.isConfigured).length;
      res.json({
        psr: {
          total: psrRow?.count || 0,
        },
        cities: {
          total: cityRow?.count || 0,
        },
        apiConnections: {
          connected: connectedApis,
          total: apiServices.length,
        },
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching control tower summary:", error);
      res.status(500).json({ error: "관제탑 요약 조회 실패" });
    }
  });
}
