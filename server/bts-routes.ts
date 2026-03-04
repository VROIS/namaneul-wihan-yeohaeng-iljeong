/**
 * BTS 이벤트 페이지 전용 API
 * docs/BTS/BTS_구체화_계획.md 참조
 */

import type { Express } from "express";
import { db } from "./db";
import { cities, placeSeedRaw } from "../shared/schema";
import { isNotNull, asc, eq, and, inArray } from "drizzle-orm";

// 멤버별 seed_category 가중치 (5.3.2 형식 → 50%, 30%, 20%)
const MEMBER_WEIGHTS: Record<string, Record<string, number>> = {
  collector: { attraction: 5, healing: 3, restaurant: 2 },
  romanticist: { attraction: 5, healing: 3, restaurant: 2 },
  explorer: { hotspot: 5, adventure: 3, attraction: 2 },
  challenger: { adventure: 5, restaurant: 3, hotspot: 2 },
  companion: { healing: 5, attraction: 3, restaurant: 2 },
  recharger: { healing: 5, restaurant: 3, attraction: 2 },
  chiller: { healing: 5, attraction: 3, restaurant: 2 },
};

export function registerBtsRoutes(app: Express): void {
  // GET /api/bts/cities - BTS 2026 34도시 목록 (bts_rank 순)
  app.get("/api/bts/cities", async (_req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ error: "Database not configured" });
      }
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          btsRank: cities.btsRank,
        })
        .from(cities)
        .where(isNotNull(cities.btsRank))
        .orderBy(asc(cities.btsRank));
      res.json(rows);
    } catch (err) {
      console.error("[BTS] GET /api/bts/cities error:", err);
      res.status(500).json({ error: "Failed to fetch BTS cities" });
    }
  });

  // GET /api/bts/top-places?cityId=&memberId= - 멤버 가중치 기반 상위 8곳
  app.get("/api/bts/top-places", async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ error: "Database not configured" });
      }
      const cityId = parseInt(req.query.cityId as string, 10);
      const memberId = (req.query.memberId as string) || "challenger";
      if (!cityId || isNaN(cityId)) {
        return res.status(400).json({ error: "cityId required" });
      }
      const weights = MEMBER_WEIGHTS[memberId] || MEMBER_WEIGHTS.challenger;

      const rows = await db
        .select({
          id: placeSeedRaw.id,
          nameKo: placeSeedRaw.nameKo,
          nameEn: placeSeedRaw.nameEn,
          seedCategory: placeSeedRaw.seedCategory,
          imageUrl: placeSeedRaw.imageUrl,
          bestImageUrl: placeSeedRaw.bestImageUrl,
          priceEur: placeSeedRaw.priceEur,
          nubiReason: placeSeedRaw.nubiReason,
        })
        .from(placeSeedRaw)
        .where(
          and(
            eq(placeSeedRaw.cityId, cityId),
            eq(placeSeedRaw.collectionPhase, "bts2026")
          )
        );

      // 가중치 점수 계산 후 상위 8개
      const scored = rows.map((r) => {
        const w = weights[r.seedCategory || ""] || 0;
        return { ...r, score: w };
      });
      scored.sort((a, b) => b.score - a.score);
      const top8 = scored.slice(0, 8).map(({ score, bestImageUrl, imageUrl, ...r }) => ({
        ...r,
        imageUrl: bestImageUrl || imageUrl || null,
      }));

      res.json(top8);
    } catch (err) {
      console.error("[BTS] GET /api/bts/top-places error:", err);
      res.status(500).json({ error: "Failed to fetch top places" });
    }
  });

  // POST /api/bts/generate - 선택 장소 → 일정 생성 (간소화 버전)
  app.post("/api/bts/generate", async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ error: "Database not configured" });
      }
      const { cityId, memberId, selectedPlaceIds } = req.body as {
        cityId: number;
        memberId?: string;
        selectedPlaceIds: number[];
      };
      if (!cityId || !Array.isArray(selectedPlaceIds) || selectedPlaceIds.length === 0) {
        return res.status(400).json({ error: "cityId and selectedPlaceIds required" });
      }

      const [cityRow] = await db
        .select({ name: cities.name, nameEn: cities.nameEn })
        .from(cities)
        .where(eq(cities.id, cityId));
      if (!cityRow) {
        return res.status(404).json({ error: "City not found" });
      }

      const ids = selectedPlaceIds.slice(0, 8).filter((n: number) => Number.isInteger(n));
      if (ids.length === 0) {
        return res.status(400).json({ error: "selectedPlaceIds must contain valid ids" });
      }

      const seeds = await db
        .select({
          id: placeSeedRaw.id,
          nameKo: placeSeedRaw.nameKo,
          nameEn: placeSeedRaw.nameEn,
          seedCategory: placeSeedRaw.seedCategory,
          imageUrl: placeSeedRaw.imageUrl,
          bestImageUrl: placeSeedRaw.bestImageUrl,
          priceEur: placeSeedRaw.priceEur,
          nubiReason: placeSeedRaw.nubiReason,
        })
        .from(placeSeedRaw)
        .where(
          and(
            eq(placeSeedRaw.cityId, cityId),
            eq(placeSeedRaw.collectionPhase, "bts2026"),
            inArray(placeSeedRaw.id, ids)
          )
        );

      const orderMap = new Map(ids.map((id: number, i: number) => [id, i]));
      const selected = seeds.sort((a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99));

      const SLOT_STARTS = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30"];
      const places = selected.map((s, i) => ({
        id: `bts-${s.id}`,
        name: s.nameKo || s.nameEn,
        description: s.nubiReason || "",
        startTime: SLOT_STARTS[i] || "09:00",
        endTime: SLOT_STARTS[i + 1] || "21:00",
        lat: 0,
        lng: 0,
        vibeScore: 8,
        confidenceScore: 0.9,
        sourceType: "bts",
        personaFitReason: s.nubiReason || "",
        tags: [s.seedCategory || ""],
        vibeTags: [],
        image: s.bestImageUrl || s.imageUrl || "",
        priceEstimate: s.priceEur != null ? `€${s.priceEur}` : "",
        estimatedPriceEur: s.priceEur ?? 0,
        nubiReason: s.nubiReason,
      }));

      const itinerary = {
        title: `나만의 방탄 투어 - ${cityRow.name}`,
        destination: cityRow.nameEn || cityRow.name,
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        days: [
          {
            day: 1,
            places,
            city: cityRow.name,
            summary: `${selected.length}곳 방문`,
          },
        ],
      };
      res.json(itinerary);
    } catch (err) {
      console.error("[BTS] POST /api/bts/generate error:", err);
      res.status(500).json({ error: "Failed to generate BTS itinerary" });
    }
  });
}
