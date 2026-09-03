import type { Express } from "express";
import { db } from "./db";
import { cities, placeSeedRaw } from "../shared/schema";
import { isNotNull, asc, desc, eq, and, sql } from "drizzle-orm";
// ⚠️ 2026-07-31 사장님 승인(BTS D단계) = 옛 자체 생성기(/api/bts/generate + bts-gemini) 완전삭제 §19·§16.
import { pickRestaurantBySegment } from "./services/route-matcher";
import { servingGateSql } from "./services/shared/pool-radius";
import { readCachedPlaceTranslations } from "./services/shared/place-translation";
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
  priceEur: placeSeedRaw.priceEur,
  summaryKo: placeSeedRaw.summaryKo,
  latitude: placeSeedRaw.latitude,
  longitude: placeSeedRaw.longitude,
  googleReviewCount: placeSeedRaw.googleReviewCount,
  bestRank: placeSeedRaw.bestRank,
  editorialSummary: placeSeedRaw.editorialSummary,
  openingHours: placeSeedRaw.openingHours,
} as const;

type PlaceRow = Pick<typeof placeSeedRaw.$inferSelect, keyof typeof PLACE_COLS>;

// ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 결정성: 이미지 URL 살아있는지 검증 = HEAD 호출 + 5분 메모리 cache.
const _imgAliveCache = new Map<string, { ok: boolean; t: number }>();
const _IMG_CACHE_TTL = 5 * 60 * 1000;
const _IMG_CACHE_MAX = 500;
function _imgCacheSet(url: string, ok: boolean): void {
  if (_imgAliveCache.size >= _IMG_CACHE_MAX) {
    const cutoff = Date.now() - _IMG_CACHE_TTL;
    for (const [k, v] of _imgAliveCache)
      if (v.t < cutoff) _imgAliveCache.delete(k);
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
  return normalizeImageUrl(p.imageUrl || null, 1280);
}
// ⚠️ 수정금지(승인필요) — 2026-05-07: HEAD 검증 = Replit 서버 외부 fetch 차단/timeout 환경에서 = 모든 row false 사고.
async function pickAliveFrom<T extends PlaceRow>(
  candidates: T[],
  used: Set<number>,
): Promise<T | null> {
  const eligible = candidates.filter(
    (c) => !used.has(c.id) && !!effectiveImage(c),
  );
  return eligible[0] || null;
}

// ⚠️ 수정금지(승인필요) 2026-07-30 = **D-Day 계산 = 이 함수 1벌.**
function calcDDay(concertDate: string, today: string): number {
  return Math.ceil(
    (new Date(concertDate + "T00:00:00Z").getTime() -
      new Date(today + "T00:00:00Z").getTime()) /
      86400000,
  );
}

export function registerBtsRoutes(app: Express): void {
  app.get("/api/bts/next-concert", async (_req, res) => {
    try {
      if (!db)
        return res.status(503).json({ error: "Database not configured" });
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
            sql`'bts2026' = ANY(COALESCE(${placeSeedRaw.phaseTags}, ARRAY[]::text[]))`,
          ),
        )
        .where(isNotNull(cities.btsRank))
        .orderBy(asc(cities.btsRank));

      // ⚠️ 수정금지(승인필요) — 오늘 이후 가장 가까운 공연 찾기
      const today = new Date().toISOString().slice(0, 10);
      let next: {
        cityId: number;
        city: string;
        cityKo: string;
        date: string;
        dDay: number;
        venue: string | null;
      } | null = null;

      for (const row of rows) {
        const dates = (row.btsConcertDates || []) as string[];
        for (const d of dates) {
          if (d >= today) {
            const diff = calcDDay(d, today);
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

      // ⚠️ 수정금지(승인필요) 2026-07-30 §19 = 도시명·날짜를 글자로 박아둔 대체값 완전삭제.
      res.json(next);
    } catch (err) {
      console.error("[BTS] GET /api/bts/next-concert error:", err);
      res.status(500).json({ error: "Failed to fetch next concert" });
    }
  });

  // ⚠️ 수정금지(승인필요) — 공연 임박 순 5개 필터링용 nextConcertDate 추가 (2026-04-17)
  app.get("/api/bts/cities", async (_req, res) => {
    try {
      if (!db)
        return res.status(503).json({ error: "Database not configured" });
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          btsRank: cities.btsRank,
          country: cities.country,
          countryCode: cities.countryCode,
          btsConcertDates: cities.btsConcertDates,
          btsShowTimes: cities.btsShowTimes,
          latitude: cities.latitude,
          longitude: cities.longitude,
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
        const nextConcertDate = upcoming[0] || null;
        const dDay = nextConcertDate ? calcDDay(nextConcertDate, today) : null;
        const showTime =
          (
            ((r.btsShowTimes || []) as { date: string; time: string }[]).find(
              (s) => s.date === nextConcertDate,
            ) || {}
          ).time || null;
        return {
          id: r.id,
          nameKo: r.nameKo,
          nameEn: r.nameEn,
          btsRank: r.btsRank,
          country: r.country,
          countryCode: r.countryCode,
          nextConcertDate,
          dDay,
          showTime,
          latitude: r.latitude ? Number(r.latitude) : null,
          longitude: r.longitude ? Number(r.longitude) : null,
        };
      });

      // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = **남은 공연 도시만** 내려준다.
      res.json(enriched.filter((c) => c.nextConcertDate !== null));
    } catch (err) {
      console.error("[BTS] GET /api/bts/cities error:", err);
      res.status(500).json({ error: "Failed to fetch BTS cities" });
    }
  });

  // ⚠️ 수정금지(승인필요) — 2026-08-15 사장님 승인: 8 슬롯 고정 순서 v2
  app.get("/api/bts/top-places", async (req, res) => {
    try {
      if (!db)
        return res.status(503).json({ error: "Database not configured" });
      const cityId = parseInt(req.query.cityId as string, 10);
      const memberId = (req.query.memberId as string) || "challenger";
      // ⚠️ 수정금지(승인필요) 2026-09-02 사장님 확정 = 화면 언어(?lang=)로 카드 해설도 번역캐시에서(메인앱과 1벌)
      const lang = String(req.query.lang || "ko");
      if (!cityId || isNaN(cityId)) {
        return res.status(400).json({ error: "cityId required" });
      }

      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT: place_seed_raw 단일 테이블. collection_phase = 폐기 (= AI 과도 분류).
      const cityFilter = eq(placeSeedRaw.cityId, cityId);
      const imageNotNull = sql`${placeSeedRaw.imageUrl} IS NOT NULL`;
      const dbi = db;
      // ⚠️ 수정금지(승인필요) 2026-09-02 사장님 확정 = 캐릭터 = 메인앱 바이브 버튼 = 같은 게이트·같은 정렬(베스트→rank)
      const byCategoryTag = (tag: string, limit: number) => {
        const conditions = [
          cityFilter,
          servingGateSql(),
          sql`(${placeSeedRaw.seedCategory} = ${tag} OR ${placeSeedRaw.categoryTags} && ARRAY[${tag}]::text[])`,
          imageNotNull,
        ];
        if (tag !== "restaurant") {
          conditions.push(
            sql`NOT (${placeSeedRaw.categoryTags} && ARRAY['restaurant']::text[])`,
          );
        }
        return dbi
          .select(PLACE_COLS)
          .from(placeSeedRaw)
          .where(and(...conditions))
          .orderBy(
            sql`(${placeSeedRaw.seedCategory} = ${tag}) DESC`,
            sql`length(replace(COALESCE(${placeSeedRaw.bestRank}::text, ''), '0', '')) DESC`,
            asc(placeSeedRaw.rank),
            desc(placeSeedRaw.googleReviewCount),
          )
          .limit(limit);
      };

      const venueQuery = dbi
        .select(PLACE_COLS)
        .from(placeSeedRaw)
        .where(and(cityFilter, eq(placeSeedRaw.seedCategory, "bts_venue")))
        .orderBy(desc(placeSeedRaw.googleReviewCount))
        .limit(1);
      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 결정성: limit 확장 (= 5/10 → 15/20)
      const restaurantQuery = byCategoryTag("restaurant", 20);

      const isCompanion = memberId === "companion";
      const vibeQuery: Promise<PlaceRow[]> = isCompanion
        ? Promise.all(
            COMPANION_VIBE_CATEGORIES.map((c) =>
              byCategoryTag(c, 3).then((r) => r),
            ),
          ).then((arr) => arr.flat())
        : byCategoryTag(
            CHARACTER_PRIMARY_CATEGORY[
              memberId as keyof typeof CHARACTER_PRIMARY_CATEGORY
            ] ?? "attraction",
            15,
          );

      const [venueRows, vibeRowsAll, restaurantPoolAll] = await Promise.all([
        venueQuery,
        vibeQuery,
        restaurantQuery,
      ]);

      const venue: PlaceRow | null = venueRows[0] ?? null;

      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT 결정성:
      const usedIds = new Set<number>();
      if (venue) usedIds.add(venue.id);

      const vibeSlots: (PlaceRow | null)[] = [
        null,
        null,
        null,
        null,
        null,
        null,
      ];
      for (let vIdx = 0; vIdx < 6; vIdx++) {
        const next = await pickAliveFrom(vibeRowsAll, usedIds);
        if (!next) break;
        usedIds.add(next.id);
        vibeSlots[vIdx] = next;
      }

      const restaurantPool = restaurantPoolAll.filter(
        (r) => !usedIds.has(r.id) && !!effectiveImage(r),
      );

      const lunch = pickRestaurantBySegment(
        restaurantPool,
        vibeSlots[2],
        vibeSlots[3],
      );
      if (lunch) usedIds.add(lunch.id);

      const slotPlaces: (PlaceRow | null)[] = [
        venue, // 1 공연장
        vibeSlots[0], // 2
        vibeSlots[1], // 3
        vibeSlots[2], // 4
        lunch, // 5 점심 ★
        vibeSlots[3], // 6
        vibeSlots[4], // 7
        vibeSlots[5], // 8
      ];

      // ⚠️ 수정금지(승인필요) 2026-05-07 사용자 SSOT = 카드 노출 필드 7개 + 좌표 2개(지도 마커) · 이미지 URL 단일 정규화
      const trMap =
        lang === "ko"
          ? new Map()
          : await readCachedPlaceTranslations(
              slotPlaces.filter((p): p is PlaceRow => !!p).map((p) => p.id),
              lang,
            );
      const slots = slotPlaces.map((p, i) => {
        if (!p) return { slot: i + 1, id: null };
        const rawUrl = p.imageUrl || null;
        const tr = trMap.get(p.id);
        return {
          slot: i + 1,
          id: p.id,
          nameKo: p.nameKo,
          nameEn: p.nameEn,
          seedCategory: p.seedCategory,
          imageUrl: normalizeImageUrl(rawUrl, 1280),
          priceEur: p.priceEur,
          summaryKo: tr?.summary ?? p.summaryKo,
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

  // ⚠️ 수정금지(승인필요) — 2026-05-06 Screen 4 카트→지도 = WebView 안 Google Maps API key 노출
  app.get("/api/bts/map-config", (_req, res) => {
    const key =
      process.env.GOOGLE_MAPS_API_KEY || process.env.Google_maps_api_key || "";
    if (!key)
      return res.status(503).json({ error: "Google Maps API key missing" });
    res.json({ googleMapsApiKey: key });
  });
}
