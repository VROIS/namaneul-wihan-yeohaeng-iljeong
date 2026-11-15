import type { Express, Request, Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "../shared/schema";
import type { DayVideo } from "../shared/schema";
import {
  cityRepresentativeWhere,
  cityRepresentativeOrder,
  pickDisplayName,
  cityWithRepresentative,
} from "./lib/services/shared/city-representative-place";
import type { OpenDb } from "./db-types";
import { readyCities } from "./best-itinerary/city-resolver";
import { bestRankOrdinal } from "./lib/services/shared/best-rank";
import { regionOfCountry } from "../shared/city-region";

const { cities, placeSeedRaw, itineraries, guides, savedVideos } = schema;

type HighlightName = {
  id: number;
  nameEn: string | null;
  nameLocal: string | null;
  nameKo: string | null;
};

export function registerPlaceRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 🏙️ B2 도시 카드 데이터 = 카드는 **항상** 뜬다(2026-08-02 사장님 지시로 갱신 §19).
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

        // ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 대표여정 = cityWithRepresentative 1벌 · 얼굴·하이라이트 = 같은 줄(식당만 제외 · 인기 명소 등수순) (정본 2026-11-15)
        const [row, repRows, highlightPool] = await Promise.all([
          cityWithRepresentative(db, cityId),
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
          db
            .select({
              id: placeSeedRaw.id,
              nameEn: placeSeedRaw.nameEn,
              nameLocal: placeSeedRaw.nameLocal,
              nameKo: placeSeedRaw.nameKo,
            })
            .from(placeSeedRaw)
            .where(cityRepresentativeWhere(cityId))
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

        // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 대표사진의 요약 1벌(관리자 대시보드 열람 전용).
        const tagline = heroPlace?.summaryKo || "";

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
          highlightIds: highlightPlaces.map((p) => p.id),
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

  // ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 대시보드 사진·하이라이트 고르기 = 도시 카드와 같은 조건·순서(city-representative-place 1벌)의 후보 40곳을 사진·등수와 함께 (정본 2026-11-15)
  app.get(
    "/api/admin/cities/:id/candidates",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const cityId = parseInt(String(req.params.id));
        if (Number.isNaN(cityId))
          return res.status(404).json({ error: "City not found" });
        const rows = await db
          .select({
            id: placeSeedRaw.id,
            nameEn: placeSeedRaw.nameEn,
            nameLocal: placeSeedRaw.nameLocal,
            nameKo: placeSeedRaw.nameKo,
            imageUrl: placeSeedRaw.imageUrl,
            bestRank: placeSeedRaw.bestRank,
            seedCategory: placeSeedRaw.seedCategory,
          })
          .from(placeSeedRaw)
          .where(cityRepresentativeWhere(cityId))
          .orderBy(...cityRepresentativeOrder("ko"))
          .limit(40);
        res.json(
          rows.map((r) => ({
            id: r.id,
            name: pickDisplayName(r),
            imageUrl: r.imageUrl,
            rank: bestRankOrdinal(r.bestRank),
            seedCategory: r.seedCategory,
          })),
        );
      } catch (error) {
        console.error("[admin/candidates] 후보 조회 실패:", error);
        res.status(500).json({ error: "failed_to_fetch_candidates" });
      } finally {
        close();
      }
    },
  );

  // ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 대시보드 카드 순서 화면 = 앱과 같은 순서(readyCities 1벌)를 대륙 탭(city-region 1벌) → 나라 묶음 → 도시로 묶어 보여 준다 (정본 2026-11-15)
  app.get("/api/admin/cities/card-order", async (_req, res: Response) => {
    const { db, close } = openDb();
    try {
      const [ready, names] = await Promise.all([
        readyCities(db),
        db
          .selectDistinct({ code: cities.countryCode, name: cities.country })
          .from(cities),
      ]);
      const nameOf = new Map(names.map((n) => [n.code, n.name]));
      const tabs: Record<
        string,
        {
          code: string;
          name: string | null;
          cities: { id: number; nameKo: string; nameEn: string | null }[];
        }[]
      > = {};
      for (const c of ready) {
        const tab = (tabs[regionOfCountry(c.countryCode)] ??= []);
        const code = c.countryCode ?? "";
        let group = tab[tab.length - 1];
        if (!group || group.code !== code) {
          group = { code, name: nameOf.get(code) ?? null, cities: [] };
          tab.push(group);
        }
        group.cities.push({ id: c.id, nameKo: c.nameKo, nameEn: c.nameEn });
      }
      res.json(tabs);
    } catch (error) {
      console.error("[admin/card-order] 순서 조회 실패:", error);
      res.status(500).json({ error: "failed_to_fetch_card_order" });
    } finally {
      close();
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 카드 순서 저장 = 화면에서 옮긴 결과 순서를 그대로 1부터 쓴다 · 나라 순서는 같은 나라 코드의 도시 전부에 · 도시 순서는 그 나라 묶음 안에서 (정본 2026-11-15)
  app.post("/api/admin/cities/order", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const codes: string[] = Array.isArray(req.body?.countryCodes)
        ? req.body.countryCodes.map(String)
        : [];
      const ids: number[] = Array.isArray(req.body?.cityIds)
        ? req.body.cityIds.map(Number).filter(Number.isFinite)
        : [];
      for (const [i, code] of codes.entries())
        await db
          .update(cities)
          .set({ countryOrder: i + 1 })
          .where(eq(cities.countryCode, code));
      for (const [i, id] of ids.entries())
        await db
          .update(cities)
          .set({ cityOrder: i + 1 })
          .where(eq(cities.id, id));
      res.json({ countries: codes.length, cities: ids.length });
    } catch (error) {
      console.error("[admin/cities/order] 순서 저장 실패:", error);
      res.status(500).json({ error: "failed_to_save_card_order" });
    } finally {
      close();
    }
  });
}
