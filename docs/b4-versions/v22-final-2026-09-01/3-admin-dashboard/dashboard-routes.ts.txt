import type { Express } from "express";
import { db, isDatabaseConnected } from "../db";
import path from "path";
import fs from "fs";
import {
  apiServiceStatus,
  exchangeRates,
  cities,
  placeSeedRaw,
  itineraries,
  guides,
  savedVideos,
  users,
  creditTransactions,
} from "../../shared/schema";
import { sql, count, eq, and, isNotNull } from "drizzle-orm";
import { CREDIT_CONFIG } from "../creditService";
import { recentDelta } from "../services/shared/metrics-heartbeat";

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
  app.get("/admin", (_req, res) => {
    const possiblePaths = [
      path.join(__dirname, "..", "templates", "admin-dashboard.html"), // server/admin/ 로 이동 = 템플릿은 상위 server/templates (2026-07-16 분리)
      path.join(process.cwd(), "server", "templates", "admin-dashboard.html"),
      path.join(
        process.cwd(),
        "server_dist",
        "templates",
        "admin-dashboard.html",
      ),
    ];
    const templatePath = possiblePaths.find((p) => fs.existsSync(p));
    if (templatePath) {
      res.sendFile(templatePath);
    } else {
      console.error("[Admin] Template not found");
      res.status(404).send("Admin dashboard not found");
    }
  });

  app.get("/api/admin/dashboard", async (_req, res) => {
    if (!isDatabaseConnected() || !db) {
      return res.json(DEFAULT_DASHBOARD_DATA);
    }
    try {
      const [cityRow] = await db.select({ count: count() }).from(cities);
      const [psrRow] = await db.select({ count: count() }).from(placeSeedRaw);
      const [exchangeRow] = await db
        .select({ count: count() })
        .from(exchangeRates);

      const fillRow = (await db.execute(
        sql`SELECT
          COUNT(image_url)::int AS img,
          COUNT(price_eur)::int AS price,
          COUNT(summary_ko)::int AS sum,
          COUNT(google_place_id)::int AS pid
        FROM place_seed_raw`,
      )) as any;
      const filled = fillRow?.rows?.[0] ||
        fillRow || { img: 0, price: 0, sum: 0, pid: 0 };

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

  // ⚠️ 2026-08-23 사장님 승인 = 관제탑 계기판 씨앗 = 외부 유료호출 이달 사용량·무료잔량(공급자별) = external_calls 1벌
  app.get("/api/admin/external-calls/summary", async (_req, res) => {
    try {
      const { usageSummary } = await import(
        "../services/shared/external-call-log"
      );
      res.json({
        month: new Date().toISOString().slice(0, 7),
        providers: await usageSummary(),
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  const GATED_PROVIDERS = ["ts", "pm", "veo", "omni", "nano"]; // 사전판정 대상(제미니 텍스트 제외 = 사장님)
  // 2026-08-23 사장님 = 실행 전 시뮬 API = "이 공급자로 N건 진행하면 무료잔량 안인가, 얼마 더 과금인가"(외부호출 0)
  app.get("/api/admin/external-calls/simulate", async (req, res) => {
    try {
      const { simulateCost } = await import(
        "../services/shared/external-call-log"
      );
      const provider = String(req.query.provider || "") as any;
      const planned = Number(req.query.planned || 0);
      if (!GATED_PROVIDERS.includes(provider) || !(planned >= 0))
        return res
          .status(400)
          .json({ error: "provider=ts|pm|veo|omni|nano & planned>=0" });
      res.json(await simulateCost(provider, planned));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/admin/activity-summary", async (_req, res) => {
    if (!db) return res.json({ dbConnected: false });
    try {
      // ⚠️ 수정금지(승인필요) 2026-08-31 사장님 확정 = 증감 = R2 심장박동 기록의 최근 2틱 비교 (정본 B4)
      const { latest, delta } = await recentDelta();
      const [
        [userTotal],
        [routeTotal],
        [aiOpinionTotal],
        [expertVerifyTotal],
        [guideTotal],
        [videoTotal],
      ] = await Promise.all([
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(itineraries),
        db
          .select({ count: count() })
          .from(creditTransactions)
          .where(
            and(
              eq(creditTransactions.type, "usage"),
              eq(creditTransactions.description, "AI 의견"),
            ),
          ),
        db
          .select({ count: count() })
          .from(creditTransactions)
          .where(
            and(
              eq(creditTransactions.type, "usage"),
              eq(creditTransactions.description, "전문가 검증"),
            ),
          ),
        db
          .select({ count: count() })
          .from(guides)
          .where(isNotNull(guides.placeId)),
        db.select({ count: count() }).from(savedVideos),
      ]);
      const userNew = delta.users;
      const userWithdrawn = 0;
      const routeNew = delta.routes;
      const aiOpinionNew = delta.aiOpinion;
      const expertVerifyNew = delta.expertVerify;
      const guideNew = delta.guides;
      const videoNew = delta.videos;
      void latest;

      const loginBreakdown = await db
        .select({ provider: users.provider, count: count() })
        .from(users)
        .groupBy(users.provider);

      const [purchaseCount] = await db
        .select({ count: count() })
        .from(creditTransactions)
        .where(eq(creditTransactions.type, "purchase"));

      // ⚠️ 2026-08-25 사장님 지시로 수정 = "최근 결제내역"이 충전(+)만 반쪽으로 보여주고 있었다.
      const [creditSum] = await db
        .select({ total: sql<number>`COALESCE(SUM(${users.credits}), 0)::int` })
        .from(users);

      const recentTransactions = await db
        .select({
          id: creditTransactions.id,
          type: creditTransactions.type,
          description: creditTransactions.description,
          amount: creditTransactions.amount,
          createdAt: creditTransactions.createdAt,
          userEmail: users.email,
          userDisplayName: users.displayName,
        })
        .from(creditTransactions)
        .leftJoin(users, eq(users.id, creditTransactions.userId))
        .orderBy(sql`${creditTransactions.createdAt} DESC`)
        .limit(30);

      const { usageSummary, UNIT_COST_EUR, geminiPerformance } = await import(
        "../services/shared/external-call-log"
      );
      const usage = await usageSummary();
      // ⚠️ 2026-08-25 사장님 승인 = AI 성능 카드 = 계측된 최근 gemini 호출 100건 기준 실시간 집계(geminiClient.ts 배선).
      const aiPerformance = await geminiPerformance();
      const aiCostEur = usage.reduce((sum, u) => {
        const billable = u.cap == null ? u.units : Math.max(0, u.units - u.cap);
        return (
          sum +
          billable *
            (UNIT_COST_EUR[u.provider as keyof typeof UNIT_COST_EUR] || 0)
        );
      }, 0);

      const totalRevenueEur =
        (purchaseCount?.count || 0) * CREDIT_CONFIG.PRICE_EUR;
      const arpuEur =
        (userTotal?.count || 0) > 0
          ? totalRevenueEur / (userTotal?.count || 1)
          : 0;

      res.json({
        updatedAt: new Date().toISOString(),
        activity: {
          users: {
            total: userTotal?.count || 0,
            new: userNew,
            withdrawn: userWithdrawn,
          },
          routes: { total: routeTotal?.count || 0, new: routeNew },
          aiOpinion: { total: aiOpinionTotal?.count || 0, new: aiOpinionNew },
          expertVerify: {
            total: expertVerifyTotal?.count || 0,
            new: expertVerifyNew,
          },
          guides: { total: guideTotal?.count || 0, new: guideNew },
          videos: { total: videoTotal?.count || 0, new: videoNew },
        },
        loginBreakdown: loginBreakdown.map((r) => ({
          provider: r.provider || "unknown",
          count: r.count,
        })),
        revenue: {
          totalEur: totalRevenueEur,
          aiCostEur: Math.round(aiCostEur * 100) / 100,
          arpuEur: Math.round(arpuEur * 100) / 100,
          netEur: Math.round((totalRevenueEur - aiCostEur) * 100) / 100,
        },
        aiPerformance,
        // ⚠️ 2026-08-25 사장님 지시로 수정 = 충전(+)만 반쪽으로 보여주던 것 → 전체사용자 카드내역서(엑셀표)로.
        totalCreditsHeld: creditSum?.total || 0,
        recentTransactions: recentTransactions.map((t) => ({
          id: t.id,
          type: t.type,
          description: t.description,
          amount: t.amount,
          createdAt: t.createdAt,
          user: t.userEmail || t.userDisplayName || "(탈퇴/미확인)",
        })),
      });
    } catch (error) {
      console.error("[activity-summary] 조회 실패:", error);
      res.status(500).json({ error: "activity_summary_failed" });
    }
  });
}
