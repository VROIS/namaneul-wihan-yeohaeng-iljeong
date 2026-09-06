// Cloudflare Worker 이관 = 도시·장소 라우트 4벌 (2026-09-06)
// 원본 = server/city-place-routes.ts. 응답·상태코드·에러문구는 원본과 동일하게 옮겼다.
// 조건·정렬은 원본이 쓰는 server/services/shared/** 를 그대로 import 한다(§16 재발명 금지).
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql, desc, and, or, inArray } from "drizzle-orm";
import * as schema from "../shared/schema";
import type { DayVideo } from "../shared/schema";
import {
  cityRepresentativeWhere,
  cityHighlightWhere,
  cityRepresentativeOrder,
  pickDisplayName,
} from "../server/services/shared/city-representative-place";

const { cities, placeSeedRaw, itineraries, guides, savedVideos } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

// 원본 storage.getPlace(server/storage.ts:205) = PSR 행 + name/type/photoUrl 별칭 3개.
type PsrRow = typeof placeSeedRaw.$inferSelect;
function toPlace(psr: PsrRow) {
  return {
    ...psr,
    name: psr.nameEn || psr.nameKo || "",
    type: psr.seedCategory,
    photoUrl: psr.imageUrl,
  };
}

type HighlightName = {
  nameEn: string | null;
  nameLocal: string | null;
  nameKo: string | null;
};

export function registerPlaceRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 🏙️ B2 도시 카드 데이터 = 카드는 **항상** 뜬다(2026-08-02 사장님 지시로 갱신 §19).
  // 원본 server/city-place-routes.ts:62
  // 구체 경로(/representative)를 /api/cities/:id 보다 먼저 등록한다.
  app.get(
    "/api/cities/:id/representative",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const cityId = parseInt(String(req.params.id));
        if (Number.isNaN(cityId)) {
          return res.status(404).json({ error: "City not found" });
        }
        const lang = String(req.query.lang || "ko");

        // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 얼굴(heritage 고정)과 하이라이트(식당·쇼핑만 제외)는 기준이 다르므로 따로 조회한다.
        const [[row], repRows, highlightPool] = await Promise.all([
          db
            .select({
              nameKo: cities.name,
              nameEn: cities.nameEn,
              country: cities.country,
              // ⚠️ 수정금지(승인필요) 2026-08-20 사장님 승인 = 도시대표카드 국가명 영어통일용.
              countryCode: cities.countryCode,
              itineraryId: itineraries.id, // 대표여정 없으면 null = 그대로 "없음" 신호
              title: itineraries.title,
              protagonistSentence: itineraries.protagonistSentence,
              rawData: itineraries.rawData,
              videoByDay: itineraries.videoByDay,
              overrideHeroPlaceId: cities.overrideHeroPlaceId,
              overrideHighlightPlaceIds: cities.overrideHighlightPlaceIds,
              overrideVideoId: cities.overrideVideoId,
            })
            .from(cities)
            // ⚠️ 수정금지(승인필요) 2026-08-20 사장님 SSOT = 대표여정 고르는 순서 1벌(재정정).
            .leftJoin(
              itineraries,
              and(
                eq(itineraries.cityId, cities.id),
                or(
                  eq(itineraries.status, "representative"),
                  sql`EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e
                            WHERE e.value->>'status' = 'succeeded')`,
                ),
              ),
            )
            .where(eq(cities.id, cityId))
            .orderBy(
              sql`CASE
                  WHEN ${itineraries.status} = 'representative'
                       AND EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e WHERE e.value->>'status'='succeeded')
                       THEN 0
                  WHEN EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e WHERE e.value->>'status'='succeeded')
                       THEN 1
                  WHEN ${itineraries.status} = 'representative' THEN 2
                  ELSE 3
                END`,
              sql`(SELECT MAX(sv.created_at) FROM saved_videos sv WHERE sv.itinerary_id = ${itineraries.id}) DESC NULLS LAST`,
              desc(itineraries.id),
            )
            .limit(1),
          db
            .select({
              id: placeSeedRaw.id,
              imageUrl: placeSeedRaw.imageUrl,
              summaryKo: placeSeedRaw.summaryKo,
              nameKo: placeSeedRaw.nameKo,
              nameEn: placeSeedRaw.nameEn,
            })
            .from(placeSeedRaw)
            // ⚠️ 수정금지(승인필요) 2026-08-05 = 조건·정렬은 **city-representative-place 1벌**을 가져다 쓴다(§16).
            .where(cityRepresentativeWhere(cityId))
            .orderBy(...cityRepresentativeOrder(lang))
            .limit(1),
          // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 하이라이트 = 얼굴과 같은 줄에서 얼굴만 빼고 위에서 3개
          //   (= 얼굴을 바꾸면 그 자리가 메워지고 옛 얼굴이 내려온다 = 벽돌 쌓기). 얼굴 몫 1개 여유로 4개를 받는다.
          db
            .select({
              id: placeSeedRaw.id,
              nameEn: placeSeedRaw.nameEn,
              nameLocal: placeSeedRaw.nameLocal,
              nameKo: placeSeedRaw.nameKo,
            })
            .from(placeSeedRaw)
            .where(cityHighlightWhere(cityId))
            .orderBy(...cityRepresentativeOrder(lang))
            .limit(4),
        ]);
        if (!row) return res.status(404).json({ error: "City not found" });

        let heroPlace = repRows[0] ?? null;
        if (row.overrideHeroPlaceId != null) {
          const [overrideHero] = await db
            .select({
              id: placeSeedRaw.id,
              imageUrl: placeSeedRaw.imageUrl,
              summaryKo: placeSeedRaw.summaryKo,
              nameKo: placeSeedRaw.nameKo,
              nameEn: placeSeedRaw.nameEn,
            })
            .from(placeSeedRaw)
            .where(eq(placeSeedRaw.id, row.overrideHeroPlaceId))
            .limit(1);
          if (overrideHero) heroPlace = overrideHero;
        }

        // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 얼굴로 정해진 곳만 빼고 위에서 3개 = 얼굴을 바꾸면 자동으로 한 칸씩 밀린다.
        let highlightPlaces: HighlightName[] = highlightPool
          .filter((p) => p.id !== heroPlace?.id)
          .slice(0, 3);
        const overrideHighlightIds = (
          row.overrideHighlightPlaceIds || []
        ).filter((id): id is number => id != null);
        if (overrideHighlightIds.length > 0) {
          const overrideRows = await db
            .select({
              id: placeSeedRaw.id,
              nameEn: placeSeedRaw.nameEn,
              nameLocal: placeSeedRaw.nameLocal,
              nameKo: placeSeedRaw.nameKo,
            })
            .from(placeSeedRaw)
            .where(inArray(placeSeedRaw.id, overrideHighlightIds));
          const byId = new Map(overrideRows.map((r) => [r.id, r]));
          highlightPlaces = overrideHighlightIds
            .map((id) => byId.get(id))
            .filter((r): r is (typeof overrideRows)[number] => r != null);
        }

        // 🎙️ 2026-08-02 사장님 확정 = [해설] 배지는 **그 카드 장소의 해설이 창고에 있으면 자동으로 켠다.**
        const repPlaceId = heroPlace?.id ?? null;
        const guideHit =
          repPlaceId === null
            ? []
            : await db
                .select({ id: guides.id })
                .from(guides)
                .where(
                  and(
                    eq(guides.placeId, repPlaceId),
                    eq(guides.language, lang),
                  ),
                )
                .limit(1);

        // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 태그라인 = 대표여정 유무와 무관하게 공식 1벌(§0·§19).
        const tagline =
          (row.itineraryId !== null && row.protagonistSentence) ||
          heroPlace?.summaryKo ||
          (row.itineraryId !== null && row.title) ||
          "";

        const card = {
          itineraryId: row.itineraryId,
          cityId,
          nameKo: row.nameKo,
          nameEn: row.nameEn,
          country: row.country,
          countryCode: row.countryCode,
          tagline,
          // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 표시명 = pickDisplayName 1벌(§16, 규칙·사유는
          highlights: highlightPlaces.map(pickDisplayName),
          dayCount: 0, // 0 = 화면이 "N일 코스" 배지를 안 그림
          imageUrl: heroPlace?.imageUrl ?? null,
          // 🎙️ 2026-08-02 사장님 순서 ㉠ = 관리자가 [해설 만들기] 로 여는 장소 = 위 사진과 **같은 1위 행**.
          placeId: repPlaceId,
          hasGuide: guideHit.length > 0,
          hasVideo: false,
          videoItineraryId: null as number | null,
          videoDay: null as number | null,
          overrides: {
            heroPlaceId: row.overrideHeroPlaceId,
            highlightPlaceIds: row.overrideHighlightPlaceIds,
            videoId: row.overrideVideoId,
          },
        };

        //   ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 하이라이트를 여정 rawData 로 덮어쓰던 경로
        if (row.itineraryId !== null) {
          const raw = row.rawData as { days?: unknown[] } | null;
          const days: unknown[] = Array.isArray(raw?.days) ? raw.days : [];
          card.dayCount = days.length;
          card.hasVideo = Object.values(
            (row.videoByDay || {}) as Record<string, DayVideo>,
          ).some((v) => v?.status === "succeeded");
        }

        // 🎬 영상 override = saved_videos.id(영상 자신의 id) 직접 지정 — itinerary 선택과 무관(사장님 정정, 2026-08-25).
        if (row.overrideVideoId != null) {
          const [overrideVideo] = await db
            .select({
              itineraryId: savedVideos.itineraryId,
              day: savedVideos.day,
              videoByDay: itineraries.videoByDay,
            })
            .from(savedVideos)
            .innerJoin(itineraries, eq(itineraries.id, savedVideos.itineraryId))
            .where(eq(savedVideos.id, row.overrideVideoId))
            .limit(1);
          if (overrideVideo) {
            const dayEntry = (
              overrideVideo.videoByDay as Record<string, DayVideo> | null
            )?.[overrideVideo.day];
            card.hasVideo = dayEntry?.status === "succeeded";
            card.videoItineraryId = overrideVideo.itineraryId;
            card.videoDay = overrideVideo.day;
          }
        }

        res.json(card);
      } catch (error) {
        console.error(
          "[cities/:id/representative] 도시 카드 조회 실패:",
          error,
        );
        res.status(500).json({ error: "failed_to_fetch_representative" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/city-place-routes.ts:271
  app.post(
    "/api/admin/cities/:id/content-override",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const cityId = parseInt(String(req.params.id));
        if (Number.isNaN(cityId)) {
          return res.status(404).json({ error: "City not found" });
        }
        const toIdOrNull = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : null;
        };
        const heroPlaceId = toIdOrNull(req.body?.heroPlaceId);
        const highlightPlaceIds = Array.isArray(req.body?.highlightPlaceIds)
          ? (req.body.highlightPlaceIds as unknown[])
              .map(toIdOrNull)
              .filter((v: number | null): v is number => v != null)
          : null;
        const videoId = toIdOrNull(req.body?.videoId);

        await db
          .update(cities)
          .set({
            overrideHeroPlaceId: heroPlaceId,
            overrideHighlightPlaceIds:
              highlightPlaceIds && highlightPlaceIds.length > 0
                ? highlightPlaceIds
                : null,
            overrideVideoId: videoId,
          })
          .where(eq(cities.id, cityId));

        console.log(`[ContentOverride] 도시 ${cityId} 선별입력 저장 완료`);
        res.json({ cityId, heroPlaceId, highlightPlaceIds, videoId });
      } catch (error) {
        console.error("[ContentOverride] 저장 실패:", error);
        res.status(500).json({ error: "failed_to_save_content_override" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/city-place-routes.ts:323 (storage.createCity = server/storage.ts:200)
  app.post("/api/cities", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const [city] = await db.insert(cities).values(req.body).returning();
      res.status(201).json(city);
    } catch (error) {
      console.error("Error creating city:", error);
      res.status(500).json({ error: "Failed to create city" });
    } finally {
      close();
    }
  });

  // 원본 server/city-place-routes.ts:333 (storage.getPlace = server/storage.ts:205)
  app.get("/api/places/:id", async (req: Request, res: Response, next) => {
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id)) return next();
    const { db, close } = openDb();
    try {
      const [psr] = await db
        .select()
        .from(placeSeedRaw)
        .where(eq(placeSeedRaw.id, id));
      if (!psr) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json(toPlace(psr));
    } catch (error) {
      console.error("Error fetching place:", error);
      res.status(500).json({ error: "Failed to fetch place" });
    } finally {
      close();
    }
  });
}
