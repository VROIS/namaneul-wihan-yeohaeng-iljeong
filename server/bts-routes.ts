/**
 * BTS 이벤트 페이지 전용 API (v2 - Gemini AI 보강)
 * docs/BTS/BTS_구체화_계획.md 참조
 */

import type { Express } from "express";
import { db } from "./db";
import { cities, placeSeedRaw } from "../shared/schema";
import { isNotNull, asc, desc, eq, and, inArray, sql } from "drizzle-orm";
import { optimizeBTSRoute, type PlaceForOptimization } from "./services/bts-gemini";
import { pickRestaurantBySegment, pickRestaurantNearVenue } from "./services/route-matcher";
import {
  CHARACTER_PRIMARY_CATEGORY,
  COMPANION_VIBE_CATEGORIES,
} from "../shared/bts-character-mapping";

// ⚠️ 수정금지(승인필요) — /api/bts/top-places 가 SELECT 하는 컬럼. 슬롯 4 곳 동일 형상 보장용.
const PLACE_COLS = {
  id: placeSeedRaw.id,
  nameKo: placeSeedRaw.nameKo,
  nameEn: placeSeedRaw.nameEn,
  seedCategory: placeSeedRaw.seedCategory,
  categoryTags: placeSeedRaw.categoryTags,
  imageUrl: placeSeedRaw.imageUrl,
  bestImageUrl: placeSeedRaw.bestImageUrl,
  priceEur: placeSeedRaw.priceEur,
  nubiReason: placeSeedRaw.nubiReason,
  latitude: placeSeedRaw.latitude,
  longitude: placeSeedRaw.longitude,
  googleRating: placeSeedRaw.googleRating,
  googleReviewCount: placeSeedRaw.googleReviewCount,
  editorialSummary: placeSeedRaw.editorialSummary,
  openingHours: placeSeedRaw.openingHours,
} as const;

type PlaceRow = Pick<typeof placeSeedRaw.$inferSelect, keyof typeof PLACE_COLS>;

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
  // ⚠️ 수정금지(승인필요) — 2026-04-30 사용자 SSOT: 8 슬롯 고정 순서
  // slot 1 = bts_venue (출발), slot 5 = 점심 (segment 매칭, 정중앙 하단)
  // slot 8 = 저녁 (venue 인근), slot 2,3,4,6,7 = 주 카테고리 vibe 1~5 (companion = 5 카테고리)
  app.get("/api/bts/top-places", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Database not configured" });
      const cityId = parseInt(req.query.cityId as string, 10);
      const memberId = (req.query.memberId as string) || "challenger";
      if (!cityId || isNaN(cityId)) {
        return res.status(400).json({ error: "cityId required" });
      }

      const phaseFilter = and(
        eq(placeSeedRaw.cityId, cityId),
        eq(placeSeedRaw.collectionPhase, "bts2026")
      );
      const dbi = db;
      const byCategoryTag = (tag: string, limit: number) =>
        dbi
          .select(PLACE_COLS)
          .from(placeSeedRaw)
          .where(and(phaseFilter, sql`${placeSeedRaw.categoryTags} && ARRAY[${tag}]::text[]`))
          .orderBy(desc(placeSeedRaw.googleReviewCount))
          .limit(limit);

      const venueQuery = dbi
        .select(PLACE_COLS)
        .from(placeSeedRaw)
        .where(and(phaseFilter, eq(placeSeedRaw.seedCategory, "bts_venue")))
        .orderBy(desc(placeSeedRaw.googleReviewCount))
        .limit(1);
      const restaurantQuery = byCategoryTag("restaurant", 10);

      const isCompanion = memberId === "companion";
      // companion = 5 카테고리 병렬, 그 외 = 1 카테고리 top 5
      const vibeQuery: Promise<PlaceRow[]> = isCompanion
        ? Promise.all(COMPANION_VIBE_CATEGORIES.map((c) => byCategoryTag(c, 1).then((r) => r[0]))).then((arr) => arr.filter((p): p is PlaceRow => !!p))
        : byCategoryTag(CHARACTER_PRIMARY_CATEGORY[memberId as keyof typeof CHARACTER_PRIMARY_CATEGORY] ?? "attraction", 5);

      const [venueRows, vibeRows, restaurantPool] = await Promise.all([
        venueQuery,
        vibeQuery,
        restaurantQuery,
      ]);

      const venue: PlaceRow | null = venueRows[0] ?? null;
      // 부족분 = null 로 패딩 (가짜 채우기 X, 슬롯 길이 5 보장)
      const vibeSlots: (PlaceRow | null)[] = Array.from({ length: 5 }, (_, i) => vibeRows[i] ?? null);

      const lunch = pickRestaurantBySegment(restaurantPool, vibeSlots[2], vibeSlots[3]);
      const dinner = pickRestaurantNearVenue(restaurantPool, venue, lunch ? [lunch.id] : []);

      const slotPlaces: (PlaceRow | null)[] = [
        venue,          // 1 공연장
        vibeSlots[0],   // 2
        vibeSlots[1],   // 3
        vibeSlots[2],   // 4
        lunch,          // 5 점심 ★
        vibeSlots[3],   // 6
        vibeSlots[4],   // 7
        dinner,         // 8 저녁 (venue 인근)
      ];

      // ⚠️ 수정금지(승인필요) — 카드 노출 필드 7 개만 (BTSContext.tsx BTSPlace 타입)
      // 평점·리뷰수·영업시간·태그 등은 카드 공간 부족으로 미노출 (사용자 SSOT 2026-04-30)
      const slots = slotPlaces.map((p, i) => {
        if (!p) return { slot: i + 1, id: null };
        return {
          slot: i + 1,
          id: p.id,
          nameKo: p.nameKo,
          nameEn: p.nameEn,
          seedCategory: p.seedCategory,
          imageUrl: p.bestImageUrl || p.imageUrl || null,
          priceEur: p.priceEur,
          nubiReason: p.nubiReason,
        };
      });

      res.json(slots);
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
