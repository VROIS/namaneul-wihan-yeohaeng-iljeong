/**
 * ⚠️ 수정금지(승인필요) 2026-05-23 = 사용자 SSOT = 완전 재작성 (= 4,800 줄 → ~700 줄)
 * = 옛 ~130 endpoint 완전 삭제 = 크롤러/MCP/시드/sentiment/위기수집 모두 폐기
 * = 유지 31 endpoint = dashboard / api-keys / exchange-rates / guide-prices / transport(france) / budget / control-tower / trip-alerts
 * = dashboard + control-tower = PSR + cities + apiServices 만 사용 (= places/dataSyncLog/geminiWebSearchCache 의존 제거)
 */
import type { Express } from "express";
import { db, isDatabaseConnected } from "./db";
import path from "path";
import fs from "fs";
import {
  apiServiceStatus,
  exchangeRates,
  apiKeys,
  cities,
  placeSeedRaw,
} from "../shared/schema";
import { eq, sql, count } from "drizzle-orm";

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

export function registerAdminRoutes(app: Express) {
  // ========================================
  // /admin HTML 페이지
  // ========================================
  app.get("/admin", (_req, res) => {
    const possiblePaths = [
      path.join(__dirname, "templates", "admin-dashboard.html"),
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
      const [fillRow] = await db.execute(
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

  // ========================================
  // /api/admin/exchange-rates
  // ========================================
  app.get("/api/admin/exchange-rates", async (_req, res) => {
    if (!db) return res.json([]);
    try {
      const rates = await db
        .select()
        .from(exchangeRates)
        .orderBy(exchangeRates.targetCurrency);
      res.json(rates);
    } catch (error) {
      console.error("Error fetching exchange rates:", error);
      res.status(500).json({ error: "Failed to fetch exchange rates" });
    }
  });

  // ========================================
  // /api/admin/transport/france/* (= 가이드 가격 핵심 = 앱 차별화 영역)
  // ========================================
  app.get("/api/admin/transport/france/all", async (_req, res) => {
    try {
      const { getTransportPrices } = await import("./services/france-transport-service");
      res.json(getTransportPrices());
    } catch (error) {
      console.error("Error fetching transport prices:", error);
      res.status(500).json({ error: "Failed to fetch transport prices" });
    }
  });

  app.get("/api/admin/transport/france/version", async (_req, res) => {
    try {
      const { getDataVersion } = await import("./services/france-transport-service");
      res.json(getDataVersion());
    } catch (error) {
      console.error("Error fetching data version:", error);
      res.status(500).json({ error: "Failed to fetch data version" });
    }
  });

  app.get("/api/admin/transport/france/airport", async (_req, res) => {
    try {
      const { getAirportTransferPrices } = await import("./services/france-transport-service");
      res.json(getAirportTransferPrices());
    } catch (error) {
      console.error("Error fetching airport prices:", error);
      res.status(500).json({ error: "Failed to fetch airport prices" });
    }
  });

  app.get("/api/admin/transport/france/charter", async (_req, res) => {
    try {
      const { getVehicleCharterPrices } = await import("./services/france-transport-service");
      res.json(getVehicleCharterPrices());
    } catch (error) {
      console.error("Error fetching charter prices:", error);
      res.status(500).json({ error: "Failed to fetch charter prices" });
    }
  });

  app.get("/api/admin/transport/france/bus", async (_req, res) => {
    try {
      const { getBusCharterPrices } = await import("./services/france-transport-service");
      res.json(getBusCharterPrices());
    } catch (error) {
      console.error("Error fetching bus prices:", error);
      res.status(500).json({ error: "Failed to fetch bus prices" });
    }
  });

  app.get("/api/admin/transport/france/comparison", async (_req, res) => {
    try {
      const { getRideshareComparison } = await import("./services/france-transport-service");
      res.json(getRideshareComparison());
    } catch (error) {
      console.error("Error fetching rideshare comparison:", error);
      res.status(500).json({ error: "Failed to fetch rideshare comparison" });
    }
  });

  app.get("/api/admin/transport/france/price/:priceId", async (req, res) => {
    try {
      const { getPriceById } = await import("./services/france-transport-service");
      const price = getPriceById(req.params.priceId);
      if (!price) return res.status(404).json({ error: "Price not found" });
      res.json(price);
    } catch (error) {
      console.error("Error fetching price:", error);
      res.status(500).json({ error: "Failed to fetch price" });
    }
  });

  app.post("/api/admin/transport/france/calculate", async (req, res) => {
    try {
      const { calculateTransportCost } = await import("./services/france-transport-service");
      res.json(calculateTransportCost(req.body));
    } catch (error) {
      console.error("Error calculating transport cost:", error);
      res.status(500).json({ error: "Failed to calculate transport cost" });
    }
  });

  app.post("/api/admin/transport/france/suggest", async (req, res) => {
    try {
      const { getItineraryTransportSuggestion } = await import("./services/france-transport-service");
      res.json(getItineraryTransportSuggestion(req.body));
    } catch (error) {
      console.error("Error getting transport suggestion:", error);
      res.status(500).json({ error: "Failed to get transport suggestion" });
    }
  });

  // ========================================
  // /api/admin/guide-prices/* = 가이드 가격 CRUD (= 앱 핵심 비즈니스)
  // ========================================
  app.get("/api/admin/guide-prices", async (_req, res) => {
    if (!db) return res.json([]);
    try {
      const { guidePrices } = await import("../shared/schema");
      res.json(await db.select().from(guidePrices));
    } catch (error) {
      console.error("Error fetching guide prices:", error);
      res.status(500).json({ error: "Failed to fetch guide prices" });
    }
  });

  app.put("/api/admin/guide-prices/:id", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../shared/schema");
      const id = parseInt(req.params.id);
      const { pricePerDay, priceLow, priceHigh, description, features } = req.body;
      const [updated] = await db
        .update(guidePrices)
        .set({ pricePerDay, priceLow, priceHigh, description, features, lastUpdated: new Date() })
        .where(eq(guidePrices.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Guide price not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating guide price:", error);
      res.status(500).json({ error: "Failed to update guide price" });
    }
  });

  app.post("/api/admin/guide-prices", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../shared/schema");
      const { serviceType, serviceName, pricePerDay, priceLow, priceHigh, unit, description, features } = req.body;
      if (!serviceType || !serviceName) {
        return res.status(400).json({ error: "서비스 유형과 이름은 필수입니다" });
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
    }
  });

  app.delete("/api/admin/guide-prices/:id", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../shared/schema");
      const id = parseInt(req.params.id);
      const [deleted] = await db.delete(guidePrices).where(eq(guidePrices.id, id)).returning();
      if (!deleted) return res.status(404).json({ error: "Guide price not found" });
      res.json({ success: true, deleted });
    } catch (error) {
      console.error("Error deleting guide price:", error);
      res.status(500).json({ error: "Failed to delete guide price" });
    }
  });

  app.post("/api/admin/guide-prices/seed", async (_req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../shared/schema");
      const seedData = [
        { serviceType: "walking", serviceName: "워킹 가이드 (반일)", pricePerDay: 420, priceLow: 420, priceHigh: 420, unit: "day", description: "시내/박물관 워킹 투어", features: ["공인 가이드", "차량 미포함"] },
        { serviceType: "sedan", serviceName: "세단 가이드 (전일)", pricePerDay: 600, priceLow: 600, priceHigh: 600, unit: "day", description: "비즈니스 세단 + 가이드", features: ["E-Class", "8-10시간", "주행거리 포함"] },
        { serviceType: "vip", serviceName: "VIP 전담 (전일)", pricePerDay: 1015, priceLow: 880, priceHigh: 1015, unit: "day", description: "최상위 VIP 밴 서비스", features: ["럭셔리 미니밴", "의전 서비스", "전담 가이드"] },
        { serviceType: "airport_sedan", serviceName: "공항 픽업 (비즈니스 세단)", pricePerDay: null, priceLow: 117, priceHigh: 152, unit: "trip", description: "CDG 공항 픽업", features: ["60분 대기 무료", "피켓 마중"] },
        { serviceType: "airport_vip", serviceName: "공항 픽업 (럭셔리 세단)", pricePerDay: null, priceLow: 234, priceHigh: 480, unit: "trip", description: "CDG VIP 픽업", features: ["S-Class", "VIP 서비스"] },
      ];
      for (const data of seedData) {
        await db.insert(guidePrices).values({ ...data, currency: "EUR", isActive: true, source: "guide_verified" } as any).onConflictDoNothing();
      }
      const allPrices = await db.select().from(guidePrices);
      res.json({ success: true, count: allPrices.length, prices: allPrices });
    } catch (error) {
      console.error("Error seeding guide prices:", error);
      res.status(500).json({ error: "Failed to seed guide prices" });
    }
  });

  // 시간당 가격 조회
  app.get("/api/admin/guide-prices/hourly", async (_req, res) => {
    if (!db) return res.json({});
    try {
      const { guidePrices } = await import("../shared/schema");
      const prices = await db.select().from(guidePrices);
      const result: Record<string, any> = {};
      const comparison: Record<string, any> = {};
      for (const price of prices) {
        if (["sedan", "van", "minibus", "guide_only"].includes(price.serviceType)) {
          result[price.serviceType] = {
            basePrice4h: price.basePrice4h,
            pricePerHour: price.pricePerHour,
            minPassengers: price.minPassengers,
            maxPassengers: price.maxPassengers,
            pricePerDay: price.pricePerDay,
            priceLow: price.priceLow,
            priceHigh: price.priceHigh,
          };
          if (price.uberBlackEstimate || price.uberXEstimate || price.taxiEstimate) {
            if (!comparison.uberBlack) comparison.uberBlack = {};
            if (!comparison.uberX) comparison.uberX = {};
            if (!comparison.taxi) comparison.taxi = {};
            if (price.uberBlackEstimate) {
              const x = price.uberBlackEstimate as { low: number; high: number };
              comparison.uberBlack[price.serviceType] = `€${x.low}~${x.high}`;
            }
            if (price.uberXEstimate) {
              const x = price.uberXEstimate as { low: number; high: number };
              comparison.uberX[price.serviceType] = `€${x.low}~${x.high}`;
            }
            if (price.taxiEstimate) {
              const x = price.taxiEstimate as { low: number; high: number };
              comparison.taxi[price.serviceType] = `€${x.low}~${x.high}`;
            }
          }
          if (price.comparisonNote) comparison.marketingNote = price.comparisonNote;
        }
      }
      result.comparison = comparison;
      res.json(result);
    } catch (error) {
      console.error("Error loading hourly prices:", error);
      res.status(500).json({ error: "Failed to load hourly prices" });
    }
  });

  // 시간당 가격 저장/업데이트
  app.post("/api/admin/guide-prices/hourly", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../shared/schema");
      const { hourlyPrices, comparison } = req.body;
      const serviceTypes = ["sedan", "van", "minibus", "guide_only"];
      const results: any[] = [];
      for (const serviceType of serviceTypes) {
        const priceData = hourlyPrices[serviceType];
        if (!priceData) continue;
        const existing = await db.select().from(guidePrices).where(eq(guidePrices.serviceType, serviceType)).limit(1);
        const fullDayPrice = priceData.basePrice4h + 4 * priceData.pricePerHour;
        let uberBlackEstimate: any = null;
        let uberXEstimate: any = null;
        let taxiEstimate: any = null;
        if (comparison?.uberBlack?.[serviceType]) {
          const m = comparison.uberBlack[serviceType].match(/€?(\d+)~(\d+)/);
          if (m) uberBlackEstimate = { low: parseInt(m[1]), high: parseInt(m[2]) };
        }
        if (comparison?.uberX?.[serviceType]) {
          const m = comparison.uberX[serviceType].match(/€?(\d+)~(\d+)/);
          if (m) uberXEstimate = { low: parseInt(m[1]), high: parseInt(m[2]) };
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
          await db.update(guidePrices).set(updateData).where(eq(guidePrices.serviceType, serviceType));
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
            features: serviceType === "guide_only" ? ["차량 없음", "가이드만 동행"] : ["전일 대기", "가이드 포함", "주차비 포함"],
            source: "guide_verified",
          } as any);
          results.push({ serviceType, action: "created" });
        }
      }
      res.json({ success: true, results });
    } catch (error) {
      console.error("Error saving hourly prices:", error);
      res.status(500).json({ error: "Failed to save hourly prices" });
    }
  });

  // DB 연동 테스트
  app.get("/api/admin/guide-prices/test", async (_req, res) => {
    try {
      const { transportPricingService } = await import("./services/transport-pricing-service");
      const testResult = await transportPricingService.calculateTransportPrice({
        companionType: "Family",
        companionCount: 4,
        mobilityStyle: "Minimal",
        travelStyle: "Reasonable",
        availableHours: 8,
        dayCount: 3,
      });
      res.json({ success: true, message: "DB 연동 테스트 성공", result: testResult });
    } catch (error) {
      console.error("Error testing price calculation:", error);
      res.status(500).json({ success: false, error: "DB 연동 테스트 실패", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // 시간당 가격 계산 (일정 생성 시)
  app.post("/api/admin/guide-prices/calculate", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../shared/schema");
      const { serviceType, hours, passengers } = req.body;
      const [priceData] = await db.select().from(guidePrices).where(eq(guidePrices.serviceType, serviceType)).limit(1);
      if (!priceData) return res.status(404).json({ error: "Price data not found for service type" });
      const minHours = priceData.minHours || 4;
      const effectiveHours = Math.max(hours, minHours);
      const extraHours = Math.max(0, effectiveHours - minHours);
      const basePrice = priceData.basePrice4h || 0;
      const hourlyRate = priceData.pricePerHour || 0;
      const totalPrice = basePrice + extraHours * hourlyRate;
      const perPersonPrice = passengers > 0 ? Math.round(totalPrice / passengers) : totalPrice;
      res.json({
        serviceType,
        serviceName: priceData.serviceName,
        hours: effectiveHours,
        passengers,
        breakdown: { basePrice4h: basePrice, extraHours, hourlyRate, totalPrice, perPersonPrice },
        comparison: {
          uberBlack: priceData.uberBlackEstimate,
          uberX: priceData.uberXEstimate,
          taxi: priceData.taxiEstimate,
          marketingNote: priceData.comparisonNote,
        },
        currency: priceData.currency || "EUR",
      });
    } catch (error) {
      console.error("Error calculating price:", error);
      res.status(500).json({ error: "Failed to calculate price" });
    }
  });

  // ========================================
  // /api/budget/* = 예산 계산 (= FE 호출 0 = 보존만 = quick-estimate = 옛 dead code = 삭제)
  // ========================================
  app.post("/api/budget/calculate", async (req, res) => {
    try {
      const { budgetCalculator } = await import("./services/budget-calculator");
      const { days, companionCount, mealLevel, guideOption, mobilityStyle, mealsPerDay = 2, placeIds } = req.body;
      const result = await budgetCalculator.calculateBudget({
        days,
        companionCount,
        mealLevel,
        guideOption,
        mobilityStyle,
        mealsPerDay,
        placeIds,
      });
      res.json(result);
    } catch (error) {
      console.error("Error calculating budget:", error);
      res.status(500).json({ error: "Failed to calculate budget" });
    }
  });

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

  // ========================================
  // /api/admin/api-keys/* = API 키 CRUD
  // ========================================
  app.get("/api/admin/api-keys", async (_req, res) => {
    if (!db) return res.json([]);
    try {
      const keys = await db.select().from(apiKeys).orderBy(apiKeys.id);
      const maskedKeys = keys.map((key) => ({
        ...key,
        keyValue: key.keyValue ? `${key.keyValue.slice(0, 8)}...${key.keyValue.slice(-4)}` : "",
        hasValue: !!key.keyValue && key.keyValue.length > 0,
      }));
      res.json(maskedKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/admin/api-keys", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { keyName, displayName, description, keyValue } = req.body;
      if (!keyName || !displayName) return res.status(400).json({ error: "keyName and displayName are required" });
      if (!/^[A-Z_]+$/.test(keyName)) return res.status(400).json({ error: "keyName must be uppercase letters and underscores only" });
      const existing = await db.select().from(apiKeys).where(eq(apiKeys.keyName, keyName)).limit(1);
      if (existing.length > 0) return res.status(400).json({ error: `API key "${keyName}" already exists` });
      await db.insert(apiKeys).values({
        keyName,
        keyValue: keyValue ? keyValue.trim() : "",
        displayName,
        description: description || null,
        isActive: true,
      });
      if (keyValue && keyValue.trim()) {
        process.env[keyName] = keyValue.trim();
        if (keyName === "GOOGLE_OAUTH_CLIENT_ID" || keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID") {
          process.env.GOOGLE_CLIENT_ID = keyValue.trim();
          process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = keyValue.trim();
        }
      }
      console.log(`✅ New API Key added: ${keyName}`);
      res.json({ success: true, message: `${keyName} 추가 완료` });
    } catch (error) {
      console.error("Error adding API key:", error);
      res.status(500).json({ error: "Failed to add API key" });
    }
  });

  app.put("/api/admin/api-keys/:keyName", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { keyName } = req.params;
      const { keyValue } = req.body;
      if (!keyValue || keyValue.trim() === "") return res.status(400).json({ error: "API key value is required" });
      const existing = await db.select().from(apiKeys).where(eq(apiKeys.keyName, keyName)).limit(1);
      if (existing.length > 0) {
        await db.update(apiKeys).set({ keyValue: keyValue.trim(), updatedAt: new Date(), isActive: true }).where(eq(apiKeys.keyName, keyName));
      } else {
        await db.insert(apiKeys).values({ keyName, keyValue: keyValue.trim(), displayName: keyName, isActive: true });
      }
      process.env[keyName] = keyValue.trim();
      if (keyName === "GEMINI_API_KEY") process.env.AI_INTEGRATIONS_GEMINI_API_KEY = keyValue.trim();
      if (keyName === "GOOGLE_MAPS_API_KEY") process.env.Google_maps_api_key = keyValue.trim();
      if (keyName === "GOOGLE_OAUTH_CLIENT_ID" || keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID") {
        process.env.GOOGLE_CLIENT_ID = keyValue.trim();
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = keyValue.trim();
      }
      console.log(`✅ API Key saved: ${keyName}`);
      res.json({ success: true, message: `${keyName} 저장 완료` });
    } catch (error) {
      console.error("Error saving API key:", error);
      res.status(500).json({ error: "Failed to save API key" });
    }
  });

  app.delete("/api/admin/api-keys/:keyName", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { keyName } = req.params;
      await db.update(apiKeys).set({ keyValue: "", isActive: false, updatedAt: new Date() }).where(eq(apiKeys.keyName, keyName));
      delete process.env[keyName];
      if (keyName === "GEMINI_API_KEY") delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      if (keyName === "GOOGLE_OAUTH_CLIENT_ID" || keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID") {
        delete process.env.GOOGLE_CLIENT_ID;
        delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      }
      res.json({ success: true, message: `${keyName} 삭제 완료` });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  app.post("/api/admin/api-keys/:keyName/test", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { keyName } = req.params;
      const [keyRecord] = await db.select().from(apiKeys).where(eq(apiKeys.keyName, keyName)).limit(1);
      if (!keyRecord || !keyRecord.keyValue) return res.status(400).json({ error: "API key not found or empty" });
      const apiKey = keyRecord.keyValue;
      let testResult = { success: false, message: "" };
      switch (keyName) {
        case "GEMINI_API_KEY": {
          try {
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: "Say 'API test successful' in Korean",
            });
            testResult = { success: true, message: response.text?.slice(0, 100) || "OK" };
          } catch (e: any) {
            let msg = e?.message || String(e);
            if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) msg = "일일 API 할당량 초과";
            else if (msg.includes("API key") || msg.includes("401") || msg.includes("403")) msg = "API 키가 유효하지 않거나 권한이 없습니다";
            testResult = { success: false, message: msg };
          }
          break;
        }
        case "YOUTUBE_API_KEY": {
          try {
            const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key=${encodeURIComponent(apiKey)}`;
            const r = await fetch(url);
            const data: any = await r.json();
            if (data.error) throw new Error(data.error.message || "YouTube API 오류");
            testResult = { success: true, message: `채널 조회 성공: ${data.items?.[0]?.snippet?.title || "OK"}` };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        case "GOOGLE_MAPS_API_KEY": {
          try {
            const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Paris&key=${encodeURIComponent(apiKey)}`;
            const r = await fetch(url);
            const data: any = await r.json();
            if (data.status === "REQUEST_DENIED") throw new Error(data.error_message || "Places API 미활성화");
            const cnt = data.predictions?.length ?? 0;
            testResult = { success: true, message: `장소 자동완성 ${cnt}건 조회 성공` };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        case "OPENWEATHER_API_KEY": {
          try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=37.5665&lon=126.9780&appid=${encodeURIComponent(apiKey)}&units=metric`;
            const r = await fetch(url);
            const data: any = await r.json();
            if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
            testResult = { success: true, message: `서울 날씨 ${data.main?.temp}°C 조회 성공` };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        default:
          testResult = { success: true, message: "테스트 불가 (저장됨)" };
      }
      await db.update(apiKeys).set({ lastTestedAt: new Date(), lastTestResult: testResult.success ? "success" : "failed" }).where(eq(apiKeys.keyName, keyName));
      res.json(testResult);
    } catch (error) {
      console.error("Error testing API key:", error);
      res.status(500).json({ error: "Failed to test API key" });
    }
  });

  // ========================================
  // /api/trip-alerts* = TripPlannerScreen 호출 (= DB SELECT 만)
  // ========================================
  app.get("/api/trip-alerts", async (req, res) => {
    try {
      const { crisisAlertService } = await import("./services/crisis-alert-service");
      const city = req.query.city as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!city || !startDate || !endDate) {
        return res.status(400).json({ success: false, error: "city, startDate, endDate 파라미터가 필요합니다" });
      }
      const result = await crisisAlertService.getAlertsForTrip(city, startDate, endDate);
      res.json({
        success: true,
        ...result,
        shouldShowPopup: result.highSeverity,
        notificationLevel: result.highSeverity ? "warning" : result.hasAlerts ? "info" : "none",
        alertCount: result.alerts.length,
      });
    } catch (error) {
      console.error("Error fetching trip alerts:", error);
      res.status(500).json({ success: false, alerts: [], summary: "위기 정보 조회 실패" });
    }
  });

  app.post("/api/trip-alerts/check", async (req, res) => {
    try {
      const { crisisAlertService } = await import("./services/crisis-alert-service");
      const { cities: citiesArg, startDate, endDate } = req.body as { cities: string[]; startDate: string; endDate: string };
      if (!citiesArg || !startDate || !endDate) {
        return res.status(400).json({ success: false, error: "cities[], startDate, endDate가 필요합니다" });
      }
      const results: Record<string, any> = {};
      let hasAnyHighSeverity = false;
      let totalAlerts = 0;
      for (const c of citiesArg) {
        const result = await crisisAlertService.getAlertsForTrip(c, startDate, endDate);
        results[c] = result;
        if (result.highSeverity) hasAnyHighSeverity = true;
        totalAlerts += result.alerts.length;
      }
      res.json({
        success: true,
        results,
        summary: {
          totalAlerts,
          hasHighSeverity: hasAnyHighSeverity,
          shouldShowWarning: hasAnyHighSeverity,
          citiesWithAlerts: Object.entries(results)
            .filter(([_, r]: [string, any]) => r.hasAlerts)
            .map(([c]) => c),
        },
      });
    } catch (error) {
      console.error("Error checking trip alerts:", error);
      res.status(500).json({ success: false, error: "위기 정보 체크 실패" });
    }
  });
}
