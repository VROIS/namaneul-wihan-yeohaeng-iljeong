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
  // ─── GET /api/bts/next-concert — 다음 공연 도시/날짜 자동 계산 ───
  app.get("/api/bts/next-concert", async (_req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Database not configured" });
      // ⚠️ 수정금지(승인필요) — 2026-04-26 단일 SSOT: venue = place_seed_raw LEFT JOIN (seed_category='bts_venue')
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          btsRank: cities.btsRank,
          btsConcertDates: cities.btsConcertDates,
          venueName: placeSeedRaw.nameEn,
        })
        .from(cities)
        .leftJoin(
          placeSeedRaw,
          and(
            eq(placeSeedRaw.cityId, cities.id),
            eq(placeSeedRaw.seedCategory, "bts_venue"),
            eq(placeSeedRaw.collectionPhase, "bts2026")
          )
        )
        .where(isNotNull(cities.btsRank))
        .orderBy(asc(cities.btsRank));

      // ⚠️ 수정금지(승인필요) — 오늘 이후 가장 가까운 공연 찾기
      const today = new Date().toISOString().slice(0, 10);
      let next: { cityId: number; city: string; cityKo: string; date: string; dDay: number; venue: string | null } | null = null;

      for (const row of rows) {
        const dates = (row.btsConcertDates || []) as string[];
        for (const d of dates) {
          if (d >= today) {
            const diff = Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (!next || d < next.date) {
              next = {
                cityId: row.id,
                city: row.nameEn || "",
                cityKo: row.nameKo || "",
                date: d,
                dDay: diff,
                venue: row.venueName,
              };
            }
            break; // 각 도시에서 가장 빠른 날짜만
          }
        }
      }

      if (!next) {
        // 모든 공연 종료 시 마지막 도시 반환
        const last = rows[rows.length - 1];
        next = { cityId: last?.id || 0, city: last?.nameEn || "Manila", cityKo: last?.nameKo || "마닐라", date: "2027-03-14", dDay: 0, venue: last?.venueName || null };
      }

      res.json(next);
    } catch (err) {
      console.error("[BTS] GET /api/bts/next-concert error:", err);
      res.status(500).json({ error: "Failed to fetch next concert" });
    }
  });

  // ─── GET /api/bts/cities ───
  // ⚠️ 수정금지(승인필요) — 공연 임박 순 5개 필터링용 nextConcertDate 추가 (2026-04-17)
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
          btsConcertDates: cities.btsConcertDates,
        })
        .from(cities)
        .where(isNotNull(cities.btsRank))
        .orderBy(asc(cities.btsRank));

      // ⚠️ 수정금지(승인필요) — 오늘 이후 가장 빠른 공연일 계산
      const today = new Date().toISOString().slice(0, 10);
      const enriched = rows.map((r) => {
        const upcoming = ((r.btsConcertDates || []) as string[])
          .filter((d) => d >= today)
          .sort();
        return {
          id: r.id,
          nameKo: r.nameKo,
          nameEn: r.nameEn,
          btsRank: r.btsRank,
          country: r.country,
          countryCode: r.countryCode,
          nextConcertDate: upcoming[0] || null,
        };
      });

      res.json(enriched);
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
          // ⚠️ 수정금지(승인필요) — 좌표 추가 (지도 표시 + 동선 계산용)
          latitude: placeSeedRaw.latitude,
          longitude: placeSeedRaw.longitude,
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
          // ⚠️ 수정금지(승인필요) — 좌표 추가 (지도 표시 + 동선 계산용)
          latitude: placeSeedRaw.latitude,
          longitude: placeSeedRaw.longitude,
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
