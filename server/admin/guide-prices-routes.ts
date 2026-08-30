import type { Express } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";

export function registerGuidePricesRoutes(app: Express) {
  app.get("/api/admin/guide-prices", async (_req, res) => {
    if (!db) return res.json([]);
    try {
      const { guidePrices } = await import("../../shared/schema");
      res.json(await db.select().from(guidePrices));
    } catch (error) {
      console.error("Error fetching guide prices:", error);
      res.status(500).json({ error: "Failed to fetch guide prices" });
    }
  });

  app.put("/api/admin/guide-prices/:id", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../../shared/schema");
      const id = parseInt(req.params.id);
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
    }
  });

  app.post("/api/admin/guide-prices", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../../shared/schema");
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
    }
  });

  app.delete("/api/admin/guide-prices/:id", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../../shared/schema");
      const id = parseInt(req.params.id);
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
    }
  });

  app.post("/api/admin/guide-prices/seed", async (_req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../../shared/schema");
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
          } as any)
          .onConflictDoNothing();
      }
      const allPrices = await db.select().from(guidePrices);
      res.json({ success: true, count: allPrices.length, prices: allPrices });
    } catch (error) {
      console.error("Error seeding guide prices:", error);
      res.status(500).json({ error: "Failed to seed guide prices" });
    }
  });

  app.get("/api/admin/guide-prices/hourly", async (_req, res) => {
    if (!db) return res.json({});
    try {
      const { guidePrices } = await import("../../shared/schema");
      const prices = await db.select().from(guidePrices);
      const result: Record<string, any> = {};
      const comparison: Record<string, any> = {};
      for (const price of prices) {
        if (
          ["sedan", "van", "minibus", "guide_only"].includes(price.serviceType)
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
              const x = price.uberBlackEstimate as {
                low: number;
                high: number;
              };
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
          if (price.comparisonNote)
            comparison.marketingNote = price.comparisonNote;
        }
      }
      result.comparison = comparison;
      res.json(result);
    } catch (error) {
      console.error("Error loading hourly prices:", error);
      res.status(500).json({ error: "Failed to load hourly prices" });
    }
  });

  app.post("/api/admin/guide-prices/hourly", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { guidePrices } = await import("../../shared/schema");
      const { hourlyPrices, comparison } = req.body;
      const serviceTypes = ["sedan", "van", "minibus", "guide_only"];
      const results: any[] = [];
      for (const serviceType of serviceTypes) {
        const priceData = hourlyPrices[serviceType];
        if (!priceData) continue;
        const existing = await db
          .select()
          .from(guidePrices)
          .where(eq(guidePrices.serviceType, serviceType))
          .limit(1);
        const fullDayPrice = priceData.basePrice4h + 4 * priceData.pricePerHour;
        let uberBlackEstimate: any = null;
        let uberXEstimate: any = null;
        let taxiEstimate: any = null;
        if (comparison?.uberBlack?.[serviceType]) {
          const m = comparison.uberBlack[serviceType].match(/€?(\d+)~(\d+)/);
          if (m)
            uberBlackEstimate = { low: parseInt(m[1]), high: parseInt(m[2]) };
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
}
