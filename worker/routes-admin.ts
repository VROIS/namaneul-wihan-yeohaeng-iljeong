// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 관리자 라우트 = DB 접근 openDb() 1벌
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { getFirstAdmin, loginResponse } from "./auth-user";
import {
  FREE_CAPS,
  UNIT_COST_EUR,
  activitySummaryData,
  apiKeysMasked,
  dashboardData,
  externalCallsSummaryData,
  monthlyUsage,
} from "./admin-data";
import { registerAdminSnapshot } from "./admin-snapshot";

const { guidePrices } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

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

const GATED_PROVIDERS = ["ts", "pm", "veo", "omni", "nano"];

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

export function registerAdminRoutes(app: Express, openDb: OpenDb): void {
  registerAdminSnapshot(app, openDb);
  // ⚠️ 수정금지(승인필요) 2026-07-13 = 관리자 로그인 = 비번 서버검증 → 관리자 세션 토큰 발급(§16 = 기존 Bearer 인증 재사용).
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
      // ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 관리자 계정을 아이디로 박지 않는다 = 가장 먼저 만든 관리자(getFirstAdmin 1벌) (정본 9-27)
      const admin = await getFirstAdmin(db);
      if (!admin) {
        return res
          .status(500)
          .json({ success: false, error: "admin_account_missing" });
      }
      res.json(loginResponse(admin));
    } catch {
      res.status(500).json({ success: false, error: "server_error" });
    } finally {
      close();
    }
  });

  app.get("/api/admin/dashboard", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      res.json(await dashboardData(db));
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      res.status(500).json(DEFAULT_DASHBOARD_DATA);
    } finally {
      close();
    }
  });

  // ⚠️ 2026-08-23 사장님 승인 = 관제탑 계기판 씨앗 = 외부 유료호출 이달 사용량·무료잔량(공급자별) = external_calls 1벌
  app.get(
    "/api/admin/external-calls/summary",
    async (_req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        res.json(await externalCallsSummaryData(db));
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      } finally {
        close();
      }
    },
  );

  // 2026-08-23 사장님 = 실행 전 시뮬 API = "이 공급자로 N건 진행하면 무료잔량 안인가, 얼마 더 과금인가"(외부호출 0)
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

  app.get(
    "/api/admin/activity-summary",
    async (_req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        res.json(await activitySummaryData(db));
      } catch (error) {
        console.error("[activity-summary] 조회 실패:", error);
        res.status(500).json({ error: "activity_summary_failed" });
      } finally {
        close();
      }
    },
  );

  // ⚠️ 2026-08-25 사장님 지시로 수정 = 삭제(DELETE, 아래)는 소프트삭제(isActive=false)라 이 목록이 필터
  app.get("/api/admin/api-keys", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      res.json(await apiKeysMasked(db));
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    } finally {
      close();
    }
  });

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
