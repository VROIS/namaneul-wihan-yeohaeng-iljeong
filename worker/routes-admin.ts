// Cloudflare Worker 이관 = 관리자 라우트 (2026-09-06)
// 원본 = server/auth.ts:324 · server/admin/dashboard-routes.ts · server/admin/api-keys-routes.ts ·
//        server/admin/guide-prices-routes.ts.
// 응답·상태코드·에러문구·정렬은 원본과 동일하게 옮겼다.
// server/db.ts 를 딸려오는 모듈(storage·creditService·external-call-log·metrics-heartbeat)은
// Worker 번들이 불가하므로, 그 안의 상수·쿼리만 여기서 openDb() 로 같은 형태로 실행한다(로직·정렬 동일).
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { and, count, eq, isNotNull, ne, sql } from "drizzle-orm";
import * as schema from "../shared/schema";

const {
  apiKeys,
  apiServiceStatus,
  cities,
  creditTransactions,
  exchangeRates,
  guidePrices,
  guides,
  itineraries,
  placeSeedRaw,
  savedVideos,
  users,
} = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

// ── 원본 상수의 이식 (server/db.ts 미탑재분) ────────────────────────────────

/** 원본 server/admin/dashboard-routes.ts:21 DEFAULT_DASHBOARD_DATA */
const DEFAULT_DASHBOARD_DATA = {
  overview: {
    cities: 0,
    places: 0,
    youtubeChannels: 0,
    blogSources: 0,
    freshDataRatio: 0,
  },
  apiServices: [] as unknown[],
  recentSyncs: [] as unknown[],
  dbConnected: false,
};

/** 원본 server/admin/dashboard-routes.ts:110 GATED_PROVIDERS */
const GATED_PROVIDERS = ["ts", "pm", "veo", "omni", "nano"];

/** 원본 server/services/shared/external-call-log.ts:8 FREE_CAPS */
const FREE_CAPS: Record<string, number | undefined> = { ts: 1000, pm: 1000 };

/** 원본 server/services/shared/external-call-log.ts:24 UNIT_COST_LEDGER 의 eur 만(= UNIT_COST_EUR). */
const UNIT_COST_EUR: Record<string, number> = {
  ts: 0.0424,
  pm: 0.0085,
  veo: 0.0605,
  omni: 0.121,
  nano: 0.0472,
  gemini: 0,
};

/** 원본 server/services/shared/external-call-log.ts:250 providers 목록(순서 그대로). */
const USAGE_PROVIDERS = ["ts", "pm", "veo", "omni", "nano", "gemini"];

/** 원본 server/creditService.ts:17 CREDIT_CONFIG.PRICE_EUR */
const CREDIT_PRICE_EUR = 10;

/** 원본 server/auth-user.ts:166 toClientUser */
type UserRow = typeof users.$inferSelect;
function toClientUser(user: UserRow) {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    provider: user.provider,
    birthDate: user.birthDate,
    language: user.preferredLanguage,
    isPaid: user.isPaid,
    planType: user.planType,
    role: user.role,
  };
}

/** 원본 server/services/shared/external-call-log.ts:224 monthlyUsage. external_calls 는 drizzle 스키마에 없어 원본 SQL 그대로. */
async function monthlyUsage(
  db: Db,
  provider: string,
): Promise<{ count: number; units: number }> {
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS count, COALESCE(sum(units), 0)::float AS units
       FROM external_calls
      WHERE provider = ${provider} AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
  )) as unknown as { count: number; units: number }[];
  return { count: rows[0]?.count ?? 0, units: rows[0]?.units ?? 0 };
}

/** 원본 server/services/shared/external-call-log.ts:249 usageSummary */
interface UsageRow {
  provider: string;
  count: number;
  units: number;
  cap: number | null;
  remaining: number | null;
}
async function usageSummary(db: Db): Promise<UsageRow[]> {
  const out: UsageRow[] = [];
  for (const p of USAGE_PROVIDERS) {
    const u = await monthlyUsage(db, p);
    const cap = FREE_CAPS[p] ?? null;
    out.push({
      provider: p,
      count: u.count,
      units: u.units,
      cap,
      remaining: cap == null ? null : Math.max(0, cap - u.count),
    });
  }
  return out;
}

/** 원본 server/services/shared/external-call-log.ts:97 simulateCost */
async function simulateCost(db: Db, provider: string, planned: number) {
  const cap = FREE_CAPS[provider] ?? null;
  const { count: used } = await monthlyUsage(db, provider);
  const remaining = cap == null ? null : Math.max(0, cap - used);
  const overflow =
    remaining == null ? planned : Math.max(0, planned - remaining);
  return {
    provider,
    cap,
    used,
    remaining,
    planned,
    overflow,
    extraEur: +(overflow * UNIT_COST_EUR[provider]).toFixed(3),
  };
}

/** 원본 server/services/shared/external-call-log.ts:170 geminiPerformance */
async function geminiPerformance(db: Db): Promise<{
  sampleSize: number;
  avgResponseTimeMs: number | null;
  successRate: number | null;
  errorRate: number | null;
}> {
  const rows = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS sample_size,
      ROUND(AVG(response_time_ms)) AS avg_response_time_ms,
      ROUND(COUNT(*) FILTER (WHERE success = true) * 100.0 / NULLIF(COUNT(*), 0), 1) AS success_rate,
      ROUND(COUNT(*) FILTER (WHERE success = false) * 100.0 / NULLIF(COUNT(*), 0), 1) AS error_rate
    FROM (
      SELECT response_time_ms, success
        FROM external_calls
       WHERE provider = 'gemini' AND success IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 100
    ) recent
  `)) as unknown as Record<string, unknown>[];
  const row = rows[0] || {};
  return {
    sampleSize: (row.sample_size as number) ?? 0,
    avgResponseTimeMs:
      row.avg_response_time_ms != null
        ? Number(row.avg_response_time_ms)
        : null,
    successRate: row.success_rate != null ? Number(row.success_rate) : null,
    errorRate: row.error_rate != null ? Number(row.error_rate) : null,
  };
}

export function registerAdminRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 2026-07-13 = 관리자 로그인 = 비번 서버검증 → 관리자 세션 토큰 발급(§16 = 기존 Bearer 인증 재사용).
  // 원본 server/auth.ts:324
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 비밀번호만 맞으면 누구든 들어간다 = 앞뒤 공백은 떼고 비교(키보드·자동완성이 붙이는 공백 때문에 401 나던 원인)
      const password = String(req.body?.password ?? "").trim();
      const expected = (process.env.ADMIN_PASSWORD || "nubi2026").trim();
      if (!password || password !== expected) {
        return res
          .status(401)
          .json({ success: false, error: "invalid_password" });
      }
      // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = 관리자 계정을 **아이디로 박지 않는다** §19.
      // 원본 storage.getAdminUser()(server/storage.ts:92) 와 같은 조건·정렬.
      const [admin] = await db
        .select()
        .from(users)
        .where(eq(users.role, "admin"))
        .orderBy(users.createdAt)
        .limit(1);
      if (!admin) {
        return res
          .status(500)
          .json({ success: false, error: "admin_account_missing" });
      }
      res.json({
        success: true,
        user: toClientUser(admin),
        token: "simple_auth_token_v1_" + admin.id,
      });
    } catch {
      res.status(500).json({ success: false, error: "server_error" });
    } finally {
      close();
    }
  });

  // 원본 server/admin/dashboard-routes.ts:54
  app.get("/api/admin/dashboard", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const [cityRow] = await db.select({ count: count() }).from(cities);
      const [psrRow] = await db.select({ count: count() }).from(placeSeedRaw);
      const [exchangeRow] = await db
        .select({ count: count() })
        .from(exchangeRates);

      const fillRows = (await db.execute(
        sql`SELECT
          COUNT(image_url)::int AS img,
          COUNT(price_eur)::int AS price,
          COUNT(summary_ko)::int AS sum,
          COUNT(google_place_id)::int AS pid
        FROM place_seed_raw`,
      )) as unknown as {
        img: number;
        price: number;
        sum: number;
        pid: number;
      }[];
      const filled = fillRows[0] || { img: 0, price: 0, sum: 0, pid: 0 };

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
    } finally {
      close();
    }
  });

  // ⚠️ 2026-08-23 사장님 승인 = 관제탑 계기판 씨앗 = 외부 유료호출 이달 사용량·무료잔량(공급자별) = external_calls 1벌
  // 원본 server/admin/dashboard-routes.ts:106
  app.get(
    "/api/admin/external-calls/summary",
    async (_req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        res.json({
          month: new Date().toISOString().slice(0, 7),
          providers: await usageSummary(db),
        });
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      } finally {
        close();
      }
    },
  );

  // 2026-08-23 사장님 = 실행 전 시뮬 API = "이 공급자로 N건 진행하면 무료잔량 안인가, 얼마 더 과금인가"(외부호출 0)
  // 원본 server/admin/dashboard-routes.ts:122
  app.get(
    "/api/admin/external-calls/simulate",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const provider = String(req.query.provider || "");
        const planned = Number(req.query.planned || 0);
        if (!GATED_PROVIDERS.includes(provider) || !(planned >= 0))
          return res
            .status(400)
            .json({ error: "provider=ts|pm|veo|omni|nano & planned>=0" });
        res.json(await simulateCost(db, provider, planned));
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      } finally {
        close();
      }
    },
  );

  // 원본 server/admin/dashboard-routes.ts:139
  app.get(
    "/api/admin/activity-summary",
    async (_req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        // ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = Worker 는 R2 심장박동(server/services/shared/metrics-heartbeat.ts)이 없어 증감 6종 = 0
        const delta = {
          users: 0,
          routes: 0,
          aiOpinion: 0,
          expertVerify: 0,
          guides: 0,
          videos: 0,
        };
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
          .select({
            total: sql<number>`COALESCE(SUM(${users.credits}), 0)::int`,
          })
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

        const usage = await usageSummary(db);
        // ⚠️ 2026-08-25 사장님 승인 = AI 성능 카드 = 계측된 최근 gemini 호출 100건 기준 실시간 집계(geminiClient.ts 배선).
        const aiPerformance = await geminiPerformance(db);
        const aiCostEur = usage.reduce((sum, u) => {
          const billable =
            u.cap == null ? u.units : Math.max(0, u.units - u.cap);
          return sum + billable * (UNIT_COST_EUR[u.provider] || 0);
        }, 0);

        const totalRevenueEur = (purchaseCount?.count || 0) * CREDIT_PRICE_EUR;
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
      } finally {
        close();
      }
    },
  );

  // ⚠️ 2026-08-25 사장님 지시로 수정 = 삭제(DELETE, 아래)는 소프트삭제(isActive=false)라 이 목록이 필터
  // 원본 server/admin/api-keys-routes.ts:8
  app.get("/api/admin/api-keys", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const keys = await db
        .select()
        .from(apiKeys)
        .where(ne(apiKeys.isActive, false))
        .orderBy(apiKeys.id);
      const maskedKeys = keys.map((key) => ({
        ...key,
        keyValue: key.keyValue
          ? `${key.keyValue.slice(0, 8)}...${key.keyValue.slice(-4)}`
          : "",
        hasValue: !!key.keyValue && key.keyValue.length > 0,
      }));
      res.json(maskedKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    } finally {
      close();
    }
  });

  // 원본 server/admin/guide-prices-routes.ts:6
  app.get("/api/admin/guide-prices", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      res.json(await db.select().from(guidePrices));
    } catch (error) {
      console.error("Error fetching guide prices:", error);
      res.status(500).json({ error: "Failed to fetch guide prices" });
    } finally {
      close();
    }
  });

  // 구체 경로(/hourly)를 /api/admin/guide-prices/:id 보다 먼저 등록한다.
  // 원본 server/admin/guide-prices-routes.ts:180
  app.get(
    "/api/admin/guide-prices/hourly",
    async (_req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const prices = await db.select().from(guidePrices);
        const result: Record<string, unknown> = {};
        const comparison: Record<string, Record<string, string> | string> = {};
        for (const price of prices) {
          if (
            ["sedan", "van", "minibus", "guide_only"].includes(
              price.serviceType,
            )
          ) {
            result[price.serviceType] = {
              basePrice4h: price.basePrice4h,
              pricePerHour: price.pricePerHour,
              minPassengers: price.minPassengers,
              maxPassengers: price.maxPassengers,
              pricePerDay: price.pricePerDay,
              priceLow: price.priceLow,
              priceHigh: price.priceHigh,
            };
            if (
              price.uberBlackEstimate ||
              price.uberXEstimate ||
              price.taxiEstimate
            ) {
              if (!comparison.uberBlack) comparison.uberBlack = {};
              if (!comparison.uberX) comparison.uberX = {};
              if (!comparison.taxi) comparison.taxi = {};
              if (price.uberBlackEstimate) {
                const x = price.uberBlackEstimate;
                (comparison.uberBlack as Record<string, string>)[
                  price.serviceType
                ] = `€${x.low}~${x.high}`;
              }
              if (price.uberXEstimate) {
                const x = price.uberXEstimate;
                (comparison.uberX as Record<string, string>)[
                  price.serviceType
                ] = `€${x.low}~${x.high}`;
              }
              if (price.taxiEstimate) {
                const x = price.taxiEstimate;
                (comparison.taxi as Record<string, string>)[price.serviceType] =
                  `€${x.low}~${x.high}`;
              }
            }
            if (price.comparisonNote)
              comparison.marketingNote = price.comparisonNote;
          }
        }
        result.comparison = comparison;
        res.json(result);
      } catch (error) {
        console.error("Error loading hourly prices:", error);
        res.status(500).json({ error: "Failed to load hourly prices" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/admin/guide-prices-routes.ts:236
  app.post(
    "/api/admin/guide-prices/hourly",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const { hourlyPrices, comparison } = req.body;
        const serviceTypes = ["sedan", "van", "minibus", "guide_only"];
        const results: { serviceType: string; action: string }[] = [];
        for (const serviceType of serviceTypes) {
          const priceData = hourlyPrices[serviceType];
          if (!priceData) continue;
          const existing = await db
            .select()
            .from(guidePrices)
            .where(eq(guidePrices.serviceType, serviceType))
            .limit(1);
          const fullDayPrice =
            priceData.basePrice4h + 4 * priceData.pricePerHour;
          let uberBlackEstimate: { low: number; high: number } | null = null;
          let uberXEstimate: { low: number; high: number } | null = null;
          let taxiEstimate: { low: number; high: number } | null = null;
          if (comparison?.uberBlack?.[serviceType]) {
            const m = comparison.uberBlack[serviceType].match(/€?(\d+)~(\d+)/);
            if (m)
              uberBlackEstimate = {
                low: parseInt(m[1]),
                high: parseInt(m[2]),
              };
          }
          if (comparison?.uberX?.[serviceType]) {
            const m = comparison.uberX[serviceType].match(/€?(\d+)~(\d+)/);
            if (m)
              uberXEstimate = { low: parseInt(m[1]), high: parseInt(m[2]) };
          }
          if (comparison?.taxi?.[serviceType]) {
            const m = comparison.taxi[serviceType].match(/€?(\d+)~(\d+)/);
            if (m) taxiEstimate = { low: parseInt(m[1]), high: parseInt(m[2]) };
          }
          const updateData = {
            basePrice4h: priceData.basePrice4h,
            pricePerHour: priceData.pricePerHour,
            minPassengers: priceData.minPassengers,
            maxPassengers: priceData.maxPassengers,
            pricePerDay: fullDayPrice,
            priceLow: priceData.basePrice4h,
            priceHigh: fullDayPrice,
            unit: "hour" as const,
            uberBlackEstimate,
            uberXEstimate,
            taxiEstimate,
            comparisonNote: comparison?.marketingNote || null,
            lastUpdated: new Date(),
          };
          if (existing.length > 0) {
            await db
              .update(guidePrices)
              .set(updateData)
              .where(eq(guidePrices.serviceType, serviceType));
            results.push({ serviceType, action: "updated" });
          } else {
            const serviceNames: Record<string, string> = {
              sedan: "세단 (1-4인)",
              van: "밴 (5-7인)",
              minibus: "미니버스 (8인+)",
              guide_only: "가이드 온리",
            };
            await db.insert(guidePrices).values({
              serviceType,
              serviceName: serviceNames[serviceType] || serviceType,
              ...updateData,
              features:
                serviceType === "guide_only"
                  ? ["차량 없음", "가이드만 동행"]
                  : ["전일 대기", "가이드 포함", "주차비 포함"],
              source: "guide_verified",
            });
            results.push({ serviceType, action: "created" });
          }
        }
        res.json({ success: true, results });
      } catch (error) {
        console.error("Error saving hourly prices:", error);
        res.status(500).json({ error: "Failed to save hourly prices" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/admin/guide-prices-routes.ts:105
  app.post(
    "/api/admin/guide-prices/seed",
    async (_req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const seedData = [
          {
            serviceType: "walking",
            serviceName: "워킹 가이드 (반일)",
            pricePerDay: 420,
            priceLow: 420,
            priceHigh: 420,
            unit: "day",
            description: "시내/박물관 워킹 투어",
            features: ["공인 가이드", "차량 미포함"],
          },
          {
            serviceType: "sedan",
            serviceName: "세단 가이드 (전일)",
            pricePerDay: 600,
            priceLow: 600,
            priceHigh: 600,
            unit: "day",
            description: "비즈니스 세단 + 가이드",
            features: ["E-Class", "8-10시간", "주행거리 포함"],
          },
          {
            serviceType: "vip",
            serviceName: "VIP 전담 (전일)",
            pricePerDay: 1015,
            priceLow: 880,
            priceHigh: 1015,
            unit: "day",
            description: "최상위 VIP 밴 서비스",
            features: ["럭셔리 미니밴", "의전 서비스", "전담 가이드"],
          },
          {
            serviceType: "airport_sedan",
            serviceName: "공항 픽업 (비즈니스 세단)",
            pricePerDay: null,
            priceLow: 117,
            priceHigh: 152,
            unit: "trip",
            description: "CDG 공항 픽업",
            features: ["60분 대기 무료", "피켓 마중"],
          },
          {
            serviceType: "airport_vip",
            serviceName: "공항 픽업 (럭셔리 세단)",
            pricePerDay: null,
            priceLow: 234,
            priceHigh: 480,
            unit: "trip",
            description: "CDG VIP 픽업",
            features: ["S-Class", "VIP 서비스"],
          },
        ];
        for (const data of seedData) {
          await db
            .insert(guidePrices)
            .values({
              ...data,
              currency: "EUR",
              isActive: true,
              source: "guide_verified",
            })
            .onConflictDoNothing();
        }
        const allPrices = await db.select().from(guidePrices);
        res.json({ success: true, count: allPrices.length, prices: allPrices });
      } catch (error) {
        console.error("Error seeding guide prices:", error);
        res.status(500).json({ error: "Failed to seed guide prices" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/admin/guide-prices-routes.ts:45
  app.post("/api/admin/guide-prices", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const {
        serviceType,
        serviceName,
        pricePerDay,
        priceLow,
        priceHigh,
        unit,
        description,
        features,
      } = req.body;
      if (!serviceType || !serviceName) {
        return res
          .status(400)
          .json({ error: "서비스 유형과 이름은 필수입니다" });
      }
      const [created] = await db
        .insert(guidePrices)
        .values({
          serviceType,
          serviceName,
          pricePerDay: pricePerDay || null,
          priceLow: priceLow || null,
          priceHigh: priceHigh || null,
          currency: "EUR",
          unit: unit || "day",
          description: description || "",
          features: features || [],
          isActive: true,
          source: "admin_added",
        })
        .returning();
      res.json(created);
    } catch (error) {
      console.error("Error creating guide price:", error);
      res.status(500).json({ error: "Failed to create guide price" });
    } finally {
      close();
    }
  });

  // 원본 server/admin/guide-prices-routes.ts:17
  app.put(
    "/api/admin/guide-prices/:id",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const id = parseInt(String(req.params.id));
        const { pricePerDay, priceLow, priceHigh, description, features } =
          req.body;
        const [updated] = await db
          .update(guidePrices)
          .set({
            pricePerDay,
            priceLow,
            priceHigh,
            description,
            features,
            lastUpdated: new Date(),
          })
          .where(eq(guidePrices.id, id))
          .returning();
        if (!updated)
          return res.status(404).json({ error: "Guide price not found" });
        res.json(updated);
      } catch (error) {
        console.error("Error updating guide price:", error);
        res.status(500).json({ error: "Failed to update guide price" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/admin/guide-prices-routes.ts:87
  app.delete(
    "/api/admin/guide-prices/:id",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const id = parseInt(String(req.params.id));
        const [deleted] = await db
          .delete(guidePrices)
          .where(eq(guidePrices.id, id))
          .returning();
        if (!deleted)
          return res.status(404).json({ error: "Guide price not found" });
        res.json({ success: true, deleted });
      } catch (error) {
        console.error("Error deleting guide price:", error);
        res.status(500).json({ error: "Failed to delete guide price" });
      } finally {
        close();
      }
    },
  );
}
