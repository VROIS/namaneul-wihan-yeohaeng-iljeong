/**
 * BTS 이벤트 페이지 전용 API (v2 - Gemini AI 보강)
 * docs/BTS/BTS_구체화_계획.md 참조
 */

import type { Express } from "express";
import { db } from "./db";
import { cities, placeSeedRaw } from "../shared/schema";
import { isNotNull, asc, eq, and, inArray } from "drizzle-orm";
import { optimizeBTSRoute, type PlaceForOptimization } from "./services/bts-gemini";

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

// 캐릭터명 매핑
const MEMBER_NAMES: Record<string, string> = {
  collector: "컬렉터",
  romanticist: "로맨티스트",
  explorer: "익스플로러",
  challenger: "챌린저",
  companion: "컴패니언",
  recharger: "리차저",
  chiller: "칠러",
};

export function registerBtsRoutes(app: Express): void {
  // ─── GET /api/bts/cities ───
  app.get("/api/bts/cities", async (_req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Database not configured" });
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          btsRank: cities.btsRank,
          country: cities.country,
          countryCode: cities.countryCode,
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

  // ─── GET /api/bts/top-places ───
  app.get("/api/bts/top-places", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Database not configured" });
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

      // 가중치 점수 계산 + 동일 점수 내 랜덤 셔플
      const scored = rows.map((r) => {
        const w = weights[r.seedCategory || ""] || 0;
        return { ...r, score: w, rand: Math.random() };
      });
      scored.sort((a, b) => b.score - a.score || a.rand - b.rand);

      const top8 = scored.slice(0, 8).map(({ score, rand, bestImageUrl, imageUrl, ...r }) => ({
        ...r,
        imageUrl: bestImageUrl || imageUrl || null,
      }));

      res.json(top8);
    } catch (err) {
      console.error("[BTS] GET /api/bts/top-places error:", err);
      res.status(500).json({ error: "Failed to fetch top places" });
    }
  });

  // ─── POST /api/bts/generate (Gemini AI 보강) ───
  app.post("/api/bts/generate", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Database not configured" });

      const { cityId, memberId, selectedPlaceIds } = req.body as {
        cityId: number;
        memberId?: string;
        selectedPlaceIds: number[];
      };
      if (!cityId || !Array.isArray(selectedPlaceIds) || selectedPlaceIds.length === 0) {
        return res.status(400).json({ error: "cityId and selectedPlaceIds required" });
      }

      // 도시 조회
      const [cityRow] = await db
        .select({ name: cities.name, nameEn: cities.nameEn })
        .from(cities)
        .where(eq(cities.id, cityId));
      if (!cityRow) return res.status(404).json({ error: "City not found" });

      // 선택된 장소 조회
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

      // Gemini AI 동선 최적화
      const characterName = MEMBER_NAMES[memberId || "challenger"] || "챌린저";
      const placesForOpt: PlaceForOptimization[] = seeds.map((s) => ({
        id: s.id,
        name: s.nameKo || s.nameEn,
        category: s.seedCategory || "attraction",
        priceEur: s.priceEur,
        nubiReason: s.nubiReason,
      }));

      const optimized = await optimizeBTSRoute(
        cityRow.nameEn || cityRow.name,
        characterName,
        placesForOpt
      );

      // 최종 일정 조립
      const resultPlaces = optimized.map((opt) => {
        const seed = seeds.find((s) => s.id === opt.id);
        return {
          id: `bts-${opt.id}`,
          name: opt.name,
          description: opt.travelTip || seed?.nubiReason || "",
          startTime: opt.startTime,
          endTime: opt.endTime,
          lat: 0,
          lng: 0,
          vibeScore: 8,
          confidenceScore: 0.9,
          sourceType: "bts",
          personaFitReason: seed?.nubiReason || "",
          tags: [seed?.seedCategory || ""],
          vibeTags: [],
          image: seed?.bestImageUrl || seed?.imageUrl || "",
          priceEstimate: seed?.priceEur != null ? `€${seed.priceEur}` : "",
          estimatedPriceEur: seed?.priceEur ?? 0,
          nubiReason: seed?.nubiReason ?? null,
          estimatedDuration: opt.estimatedDuration,
        };
      });

      const totalCost = resultPlaces.reduce(
        (sum, p) => sum + (p.estimatedPriceEur || 0),
        0
      );

      const itinerary = {
        title: `나만의 방탄 투어 - ${cityRow.name}`,
        destination: cityRow.nameEn || cityRow.name,
        character: characterName,
        memberId: memberId || "challenger",
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        totalEstimatedCost: `€${totalCost.toFixed(0)}`,
        days: [
          {
            day: 1,
            places: resultPlaces,
            city: cityRow.name,
            summary: `${resultPlaces.length}곳 방문 · 예상 €${totalCost.toFixed(0)}`,
          },
        ],
      };

      console.log(`[BTS] ✅ 일정 생성: ${cityRow.name} / ${characterName} / ${resultPlaces.length}곳`);
      res.json(itinerary);
    } catch (err) {
      console.error("[BTS] POST /api/bts/generate error:", err);
      res.status(500).json({ error: "Failed to generate BTS itinerary" });
    }
  });
}
