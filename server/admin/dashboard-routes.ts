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
  itineraries,
  guides,
  savedVideos,
  users,
  creditTransactions,
} from "../../shared/schema";
import { sql, count, eq, and, gte, isNotNull } from "drizzle-orm";
import { CREDIT_CONFIG } from "../creditService";

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
      const [exchangeRow] = await db
        .select({ count: count() })
        .from(exchangeRates);

      // PSR 14 SSOT 채움률 (= 사용자 SSOT)
      // ⚠️ 2026-07-16 수정 = db.execute()는 배열이 아니라 pg.QueryResult 객체 반환(.rows 프로퍼티 보유) = 배열 구조분해 시 "not iterable" 500 (실측: node-postgres 드라이버 실제 호출로 shape 확인). 구조분해 제거.
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

  // ⚠️ 2026-07-16 = GET /api/admin/exchange-rates 완전삭제(§19) = client/bts-app/public/admin-dashboard.html 전수 grep 호출자 0.
  //   admin-dashboard.html 은 다른 경로(/api/admin/sync/exchange-rates POST, 서버에 없음)를 부르는 옛 UI 잔존이었음(D 항목에서 별도 정리).

  // ⚠️ 2026-08-25 = 옛 /api/admin/control-tower/summary(PSR+cities+apiServices 요약) 완전삭제 §19 = 호출자 0(admin-dashboard.html
  //   죽은 4필드 카드 삭제로 유일한 호출자가 없어짐). psr/cities 총계는 /api/admin/dashboard 가 이미 준다(중복 엔드포인트 아님).
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

  // 🎯 2026-08-25 확정 스펙 v2 = 활동지표(가입자·여정건수·AI의견·전문가검증) + 데이터현황(Audioguide·영상) + 로그인방식별 + 수익.
  //   "+신규" 배지 기준시각 = in-memory 변수(adminVideoOptionMode 와 같은 패턴, video-routes.ts:41) — 이 엔드포인트가
  //   인증 헤더 없이 불리는 공개 통계 API라 "어느 관리자"인지 알 방법이 없어 DB 컬럼이 아니라 서버 프로세스 전역 1개.
  //   재배포 시 리셋(= 다음 열람에서 "이번 것 전부 신규"로 한 번 보임) = video-config 와 같은 허용된 트레이드오프.
  let activitySummaryLastViewedAt: Date | null = null;

  app.get("/api/admin/activity-summary", async (req, res) => {
    if (!db) return res.json({ dbConnected: false });
    try {
      const since = activitySummaryLastViewedAt;
      // ⚠️ 2026-08-25 판단3종 지적으로 수정 = 예전엔 매 GET(30초 자동새로고침 포함)마다 기준시각을 now() 로
      //   밀어버려서 "+신규" 창이 항상 직전 30초로만 좁아져 사실상 0/1 만 보였다. 이제 페이지가 처음 열릴 때
      //   1회만(?markViewed=1) 기준시각을 전진시키고, 자동새로고침 폴링은 기준시각을 안 건드리고 델타만 다시 계산한다
      //   (admin-dashboard.html 의 loadActivitySummary 가 세션당 최초 1회만 markViewed 를 붙임).
      const markViewed = req.query.markViewed === "1";

      // 여정건수 "+신규" = 외부호출분만(사장님 확정) = MIX 경로만 metadata._pipelineVersion='v3-2step' 로 찍힘
      //   (DB-only 경로는 'db-only-v2-scene-direct'). credit_transactions 는 두 경로가 같은 금액·설명이라 구분 불가(§0 확인).
      const isMixItinerary = sql`${itineraries.rawData}->'metadata'->>'_pipelineVersion' = 'v3-2step'`;

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

      let userNew = 0,
        userWithdrawn = 0,
        routeNew = 0,
        aiOpinionNew = 0,
        expertVerifyNew = 0,
        guideNew = 0,
        videoNew = 0;
      if (since) {
        const [[uN], [uW], [rN], [aN], [eN], [gN], [vN]] = await Promise.all([
          db
            .select({ count: count() })
            .from(users)
            .where(gte(users.createdAt, since)),
          db
            .select({ count: count() })
            .from(users)
            .where(gte(users.deletedAt, since)),
          db
            .select({ count: count() })
            .from(itineraries)
            .where(and(gte(itineraries.createdAt, since), isMixItinerary)),
          db
            .select({ count: count() })
            .from(creditTransactions)
            .where(
              and(
                eq(creditTransactions.type, "usage"),
                eq(creditTransactions.description, "AI 의견"),
                gte(creditTransactions.createdAt, since),
              ),
            ),
          db
            .select({ count: count() })
            .from(creditTransactions)
            .where(
              and(
                eq(creditTransactions.type, "usage"),
                eq(creditTransactions.description, "전문가 검증"),
                gte(creditTransactions.createdAt, since),
              ),
            ),
          db
            .select({ count: count() })
            .from(guides)
            .where(
              and(isNotNull(guides.placeId), gte(guides.createdAt, since)),
            ),
          db
            .select({ count: count() })
            .from(savedVideos)
            .where(gte(savedVideos.createdAt, since)),
        ]);
        userNew = uN?.count || 0;
        userWithdrawn = uW?.count || 0;
        routeNew = rN?.count || 0;
        aiOpinionNew = aN?.count || 0;
        expertVerifyNew = eN?.count || 0;
        guideNew = gN?.count || 0;
        videoNew = vN?.count || 0;
      }
      if (markViewed) activitySummaryLastViewedAt = new Date();

      const loginBreakdown = await db
        .select({ provider: users.provider, count: count() })
        .from(users)
        .groupBy(users.provider);

      const [purchaseCount] = await db
        .select({ count: count() })
        .from(creditTransactions)
        .where(eq(creditTransactions.type, "purchase"));

      // ⚠️ 2026-08-25 사장님 지시로 수정 = "최근 결제내역"이 충전(+)만 반쪽으로 보여주고 있었다.
      //   전체사용자 카드내역서(엑셀표)처럼 = 누구(email/닉네임)의 어떤 항목(+충전/-사용)인지 전부 원장 그대로.
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

      // AI 비용(추정) = 무료한도 있는 공급자(ts·pm)는 초과분만, 없는 공급자(veo·omni·nano)는 전량 × 단가(§15 실측 단가).
      //   simulateCost(planned=0) 은 "추가 계획분" 시뮬이라 여기 목적(이달 누적비용)엔 안 맞음 = usageSummary+UNIT_COST_EUR 직접 계산.
      const { usageSummary, UNIT_COST_EUR, geminiPerformance } = await import(
        "../services/shared/external-call-log"
      );
      const usage = await usageSummary();
      // ⚠️ 2026-08-25 사장님 승인 = AI 성능 카드 = 계측된 최근 gemini 호출 100건 기준 실시간 집계(geminiClient.ts 배선).
      const aiPerformance = await geminiPerformance();
      // ⚠️ 2026-08-25 판단3종 지적으로 정정 = UNIT_COST_EUR 는 이름·주석 그대로 유로(€) 단가다(external-call-log.ts:20
      //   "초과분 단가(€, 2026-08 GCP 실청구 환산·세전)"). 옛 aiCostUsd 변수명·"$" 표시는 잘못된 통화 라벨이었음.
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
          // 총수입·AI비용 둘 다 €라 바로 차감 가능(위 통화 정정으로 해결). 고정비는 DB에 없어 미포함(임의 추정 안 함).
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
