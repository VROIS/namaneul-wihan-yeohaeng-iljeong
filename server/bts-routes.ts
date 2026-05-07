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
import { normalizeImageUrl } from "../shared/lib/normalize-image-url";

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

// ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 결정성: 이미지 URL 살아있는지 검증 = HEAD 호출 + 5분 메모리 cache.
// 깨진 storage URL → 다음 rank 로 자동 swap = "같은 입력 → 같은 결과 + 항상 정상 카드".
const _imgAliveCache = new Map<string, { ok: boolean; t: number }>();
const _IMG_CACHE_TTL = 5 * 60 * 1000;
const _IMG_CACHE_MAX = 500;
function _imgCacheSet(url: string, ok: boolean): void {
  if (_imgAliveCache.size >= _IMG_CACHE_MAX) {
    const cutoff = Date.now() - _IMG_CACHE_TTL;
    for (const [k, v] of _imgAliveCache) if (v.t < cutoff) _imgAliveCache.delete(k);
    if (_imgAliveCache.size >= _IMG_CACHE_MAX) {
      const oldest = _imgAliveCache.keys().next().value;
      if (oldest) _imgAliveCache.delete(oldest);
    }
  }
  _imgAliveCache.set(url, { ok, t: Date.now() });
}
async function isImageAlive(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  const now = Date.now();
  const c = _imgAliveCache.get(url);
  if (c && now - c.t < _IMG_CACHE_TTL) return c.ok;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    _imgCacheSet(url, res.ok);
    return res.ok;
  } catch {
    _imgCacheSet(url, false);
    return false;
  }
}
function effectiveImage(p: PlaceRow | null | undefined): string | null {
  if (!p) return null;
  // ⚠️ 정규화된 URL 으로 alive 검증 = 응답 URL 과 동일 보장
  return normalizeImageUrl(p.bestImageUrl || p.imageUrl || null, 1280);
}
// ⚠️ 후보 N 개 = 병렬 HEAD 검증 (= for await 직렬 X) + 첫 alive row 반환.
// 같은 row 두 번 검증 X = 응답 normalizeImageUrl 과 cache 공유.
async function pickAliveFrom<T extends PlaceRow>(
  candidates: T[],
  used: Set<number>
): Promise<T | null> {
  const eligible = candidates.filter((c) => !used.has(c.id));
  const flags = await Promise.all(eligible.map((c) => isImageAlive(effectiveImage(c))));
  for (let i = 0; i < eligible.length; i++) if (flags[i]) return eligible[i];
  return null;
}

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

      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT: place_seed_raw 단일 테이블. collection_phase = 폐기 (= AI 과도 분류).
      // = 도시 = 통합 최종 top 시드. 카테고리 태그만 사용. 정렬 = rank ASC (= 최종 랭킹순) + reviewCount DESC.
      const cityFilter = eq(placeSeedRaw.cityId, cityId);
      // 안전장치: imageUrl NULL row 자동 skip
      const imageNotNull = sql`COALESCE(${placeSeedRaw.bestImageUrl}, ${placeSeedRaw.imageUrl}) IS NOT NULL`;
      const dbi = db;
      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT: vibe 슬롯 = "순수 vibe" row만.
      // category_tags=["heritage","restaurant"] 같은 다중 tag row는 = lunch/dinner 자리만 사용.
      // 즉 vibe 검색 시 = 같은 row 가 restaurant tag 도 가지면 vibe slot 에서 제외 (= 식당 카드 중복 차단).
      const byCategoryTag = (tag: string, limit: number) => {
        const conditions = [cityFilter, sql`${placeSeedRaw.categoryTags} && ARRAY[${tag}]::text[]`, imageNotNull];
        if (tag !== "restaurant") {
          conditions.push(sql`NOT (${placeSeedRaw.categoryTags} && ARRAY['restaurant']::text[])`);
        }
        return dbi
          .select(PLACE_COLS)
          .from(placeSeedRaw)
          .where(and(...conditions))
          .orderBy(asc(placeSeedRaw.rank), desc(placeSeedRaw.googleReviewCount))
          .limit(limit);
      };

      const venueQuery = dbi
        .select(PLACE_COLS)
        .from(placeSeedRaw)
        .where(and(cityFilter, eq(placeSeedRaw.seedCategory, "bts_venue")))
        .orderBy(desc(placeSeedRaw.googleReviewCount))
        .limit(1);
      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 결정성: limit 확장 (= 5/10 → 15/20)
      // 같은 row 가 여러 category_tags (예: ["heritage","restaurant"]) 가질 수 있어
      // vibe 슬롯과 lunch/dinner 가 동일 id 매칭되는 사고 방지용 후보 풀 충분 확보.
      const restaurantQuery = byCategoryTag("restaurant", 20);

      const isCompanion = memberId === "companion";
      // companion = 5 카테고리 병렬, 그 외 = 1 카테고리 top 15
      const vibeQuery: Promise<PlaceRow[]> = isCompanion
        ? Promise.all(COMPANION_VIBE_CATEGORIES.map((c) => byCategoryTag(c, 3).then((r) => r))).then((arr) => arr.flat())
        : byCategoryTag(CHARACTER_PRIMARY_CATEGORY[memberId as keyof typeof CHARACTER_PRIMARY_CATEGORY] ?? "attraction", 15);

      const [venueRows, vibeRowsAll, restaurantPoolAll] = await Promise.all([
        venueQuery,
        vibeQuery,
        restaurantQuery,
      ]);

      const venue: PlaceRow | null = venueRows[0] ?? null;

      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT 결정성:
      // 1 장소 = 1 카드 = 누적 exclude. venue → vibe5 → lunch → dinner 모두 unique id 보장.
      // + 깨진 storage URL = 다음 rank 자동 swap (= isImageAlive HEAD 검증).
      const usedIds = new Set<number>();
      if (venue) usedIds.add(venue.id);

      // vibe top 5 = 누적 exclude + 이미지 alive 검증 → 깨진 row skip → 다음 rank
      const vibeSlots: (PlaceRow | null)[] = [null, null, null, null, null];
      for (let vIdx = 0; vIdx < 5; vIdx++) {
        const next = await pickAliveFrom(vibeRowsAll, usedIds);
        if (!next) break;
        usedIds.add(next.id);
        vibeSlots[vIdx] = next;
      }

      // 식당 풀 = 이미 사용된 id 제외 + alive 검증 적용
      const restaurantPoolFiltered = restaurantPoolAll.filter((r) => !usedIds.has(r.id));
      // alive 검증 후보만 추출 (= 병렬 검증)
      const aliveFlags = await Promise.all(
        restaurantPoolFiltered.map((r) => isImageAlive(effectiveImage(r)))
      );
      const restaurantPool = restaurantPoolFiltered.filter((_, i) => aliveFlags[i]);

      const lunch = pickRestaurantBySegment(restaurantPool, vibeSlots[2], vibeSlots[3]);
      if (lunch) usedIds.add(lunch.id);
      const dinner = pickRestaurantNearVenue(
        restaurantPool.filter((r) => !usedIds.has(r.id)),
        venue
      );

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

      // ⚠️ 수정금지(승인필요) — 카드 노출 필드 7 개 + 좌표 2 개 (= 지도 마커용, 2026-05-06 Screen 4 카트→지도)
      // 평점·리뷰수·영업시간·태그 등은 카드 공간 부족으로 미노출 (사용자 SSOT 2026-04-30)
      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT: 이미지 URL 단일 정규화.
      // 클라이언트 변환 로직 폐기 → server normalize 1 회 → 모든 도시/카테고리/신규 row 동일 적용.
      const slots = slotPlaces.map((p, i) => {
        if (!p) return { slot: i + 1, id: null };
        const rawUrl = p.bestImageUrl || p.imageUrl || null;
        return {
          slot: i + 1,
          id: p.id,
          nameKo: p.nameKo,
          nameEn: p.nameEn,
          seedCategory: p.seedCategory,
          imageUrl: normalizeImageUrl(rawUrl, 1280),
          priceEur: p.priceEur,
          nubiReason: p.nubiReason,
          latitude: p.latitude != null ? Number(p.latitude) : null,
          longitude: p.longitude != null ? Number(p.longitude) : null,
        };
      });

      res.json(slots);
    } catch (err) {
      console.error("[BTS] GET /api/bts/top-places error:", err);
      res.status(500).json({ error: "Failed to fetch top places" });
    }
  });

  // ─── GET /api/bts/map-config ───
  // ⚠️ 수정금지(승인필요) — 2026-05-06 Screen 4 카트→지도 = WebView 안 Google Maps API key 노출
  // QA `/api/config` 패턴과 동일. referrer 제한 = 운영 합의 후 Google Cloud Console 설정.
  app.get("/api/bts/map-config", (_req, res) => {
    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.Google_maps_api_key || "";
    if (!key) return res.status(503).json({ error: "Google Maps API key missing" });
    res.json({ googleMapsApiKey: key });
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
