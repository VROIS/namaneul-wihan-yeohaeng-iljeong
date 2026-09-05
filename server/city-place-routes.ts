import type { Express } from "express";
import { storage } from "./storage";
import { itineraryGenerator } from "./services/itinerary-generator";
import { db } from "./db";
// savedVideos = 도시카드 선별입력(영상 override, 2026-08-25) = "영상 자신의 id"(itinerary.id 아님, 사장님 정정) 조회용.
import {
  cities,
  placeSeedRaw,
  itineraries,
  guides,
  savedVideos,
} from "../shared/schema";
import { eq, sql, desc, and, or, inArray } from "drizzle-orm";
import { READY_THRESHOLD } from "./services/agents/ag2-gemini-recommender";
import {
  cityRepresentativeWhere,
  cityHighlightWhere,
  cityRepresentativeOrder,
  pickDisplayName,
} from "./services/shared/city-representative-place";
import {
  computeDayRouteLive,
  enrichStopsWithPsr,
} from "./services/shared/routes-client";
import { getUserIdFromReq } from "./auth-user"; // 토큰 → userId 1벌(§16)

export function registerCityPlaceRoutes(app: Express): void {
  app.get("/api/cities", async (req, res) => {
    try {
      const cities = await storage.getCities();
      res.json(cities);
    } catch (error) {
      console.error("Error fetching cities:", error);
      res.status(500).json({ error: "Failed to fetch cities" });
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 여정 플래너 상단 **도시버튼의 유일한 목록 소스.**
  app.get("/api/cities/ready", async (_req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          rows: sql<number>`COUNT(*)::int`,
        })
        .from(cities)
        .innerJoin(placeSeedRaw, eq(placeSeedRaw.cityId, cities.id))
        .groupBy(cities.id, cities.name, cities.nameEn)
        .having(sql`COUNT(*) >= ${READY_THRESHOLD}`)
        .orderBy(desc(sql`COUNT(*)`));
      res.json(rows);
    } catch (error) {
      console.error("[cities/ready] 완비도시 조회 실패:", error);
      res.status(500).json({ error: "failed_to_fetch_ready_cities" });
    }
  });

  // ⚠️ 수정금지(승인필요) 🏙️ B2 도시 카드 데이터 = 카드는 **항상** 뜬다(2026-08-02 사장님 지시로 갱신 §19).
  app.get("/api/cities/:id/representative", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });
      const cityId = parseInt(req.params.id);
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
      let highlightPlaces: {
        nameEn: string | null;
        nameLocal: string | null;
        nameKo: string | null;
      }[] = highlightPool.filter((p) => p.id !== heroPlace?.id).slice(0, 3);
      const overrideHighlightIds = (row.overrideHighlightPlaceIds || []).filter(
        (id): id is number => id != null,
      );
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
                and(eq(guides.placeId, repPlaceId), eq(guides.language, lang)),
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
        const raw = row.rawData as any;
        const days: any[] = Array.isArray(raw?.days) ? raw.days : [];
        card.dayCount = days.length;
        card.hasVideo = Object.values(row.videoByDay || {}).some(
          (v) => v?.status === "succeeded",
        );
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
          const dayEntry = (overrideVideo.videoByDay as any)?.[
            overrideVideo.day
          ];
          card.hasVideo = dayEntry?.status === "succeeded";
          card.videoItineraryId = overrideVideo.itineraryId;
          card.videoDay = overrideVideo.day;
        }
      }

      res.json(card);
    } catch (error) {
      console.error("[cities/:id/representative] 도시 카드 조회 실패:", error);
      res.status(500).json({ error: "failed_to_fetch_representative" });
    }
  });

  app.post("/api/admin/cities/:id/content-override", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });
      const cityId = parseInt(req.params.id);
      if (Number.isNaN(cityId)) {
        return res.status(404).json({ error: "City not found" });
      }
      const toIdOrNull = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const heroPlaceId = toIdOrNull(req.body?.heroPlaceId);
      const highlightPlaceIds = Array.isArray(req.body?.highlightPlaceIds)
        ? req.body.highlightPlaceIds
            .map(toIdOrNull)
            .filter((v: number | null) => v != null)
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
    }
  });

  app.get("/api/cities/:id", async (req, res) => {
    try {
      const city = await storage.getCity(parseInt(req.params.id));
      if (!city) {
        return res.status(404).json({ error: "City not found" });
      }
      res.json(city);
    } catch (error) {
      console.error("Error fetching city:", error);
      res.status(500).json({ error: "Failed to fetch city" });
    }
  });

  app.post("/api/cities", async (req, res) => {
    try {
      const city = await storage.createCity(req.body);
      res.status(201).json(city);
    } catch (error) {
      console.error("Error creating city:", error);
      res.status(500).json({ error: "Failed to create city" });
    }
  });

  app.get("/api/places/:id", async (req, res, next) => {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return next();
    try {
      const place = await storage.getPlace(id);
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json(place);
    } catch (error) {
      console.error("Error fetching place:", error);
      res.status(500).json({ error: "Failed to fetch place" });
    }
  });

  // ⚠️ 2026-07-24 사장님 승인 = 일별 [바로가기] = 출발지+경유지+도착지 왕복(사장님 SSOT).
  app.post("/api/routes/day-live", async (req, res) => {
    try {
      const slots = Array.isArray(req.body?.slots)
        ? req.body.slots.filter(
            (s: any) =>
              typeof s?.lat === "number" && typeof s?.lng === "number",
          )
        : [];
      const accom = req.body?.accommodation; // {lat,lng,name,placeId} | null (숙소 변경시)
      const cityName =
        typeof req.body?.cityName === "string" ? req.body.cityName.trim() : "";
      if (slots.length < 1) {
        return res.status(400).json({ error: "slots(lat,lng) 필요" });
      }
      const hasAccom =
        accom && typeof accom.lat === "number" && typeof accom.lng === "number";
      const endpoint = hasAccom
        ? { lat: accom.lat, lng: accom.lng }
        : cityName
          ? { address: cityName }
          : null;
      const startSrc = hasAccom ? "숙소" : cityName ? "도시명주소" : "없음";
      console.log(
        `[day-live] 슬롯 ${slots.length} | 출발/도착 기준=${startSrc}${cityName ? `(${cityName})` : ""}`,
      );
      const enriched = await enrichStopsWithPsr(slots);
      let live: { durationSec: number; distanceKm: number } | null = null;
      if (endpoint) {
        try {
          live = await computeDayRouteLive(slots, endpoint);
        } catch (e: any) {
          console.error("[day-live] ETA 실패(이름은 반환):", e?.message);
        }
      }
      res.json({
        durationSec: live?.durationSec ?? null,
        distanceKm: live?.distanceKm ?? null,
        stops: enriched,
      });
    } catch (e: any) {
      console.error("[day-live] 실패:", e?.message);
      res.status(502).json({ error: "day_live_failed" }); // FE = 딥링크만 오픈(기능 불중단)
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 관리자 전용 잠금(§9 표7 판단기준 = users.role 1벌).
  app.get("/api/debug/generate-test", async (req, res) => {
    const userId = getUserIdFromReq(req);
    const user = userId ? await storage.getUser(userId) : undefined;
    if (user?.role !== "admin") {
      return res.status(403).json({ error: "관리자 전용 진단 엔드포인트" });
    }
    const steps: string[] = [];
    const start = Date.now();
    try {
      steps.push(`[${Date.now() - start}ms] Start`);

      const geminiKey = process.env.GEMINI_API_KEY;
      steps.push(
        `[${Date.now() - start}ms] Gemini key: ${geminiKey ? "present (" + geminiKey.substring(0, 8) + "...)" : "MISSING"}`,
      );

      const cityCheck = await db
        .select({ count: sql<number>`count(*)` })
        .from(cities);
      steps.push(
        `[${Date.now() - start}ms] DB OK - cities: ${cityCheck[0]?.count}`,
      );

      const testFormData = {
        destination: "Paris",
        startDate: "2026-03-01",
        endDate: "2026-03-01",
        vibes: ["Shopping"] as any, // ⚠️ 2026-06-28 = 옛 Foodie 버튼폐기 → 정식 vibe(Shopping)로 교체(§19)
        curationFocus: "Everyone" as any,
        companionType: "Single",
        companionCount: 1,
        travelStyle: "Reasonable" as any,
        mobilityStyle: "Moderate" as any,
        travelPace: "Normal" as any,
        birthDate: "1990-01-01",
        companionAges: "",
        startTime: "10:00",
        endTime: "18:00",
        destinationCoords: { lat: 48.8566, lng: 2.3522 },
      };

      steps.push(
        `[${Date.now() - start}ms] Calling generateItinerary (4+1 Agent Pipeline)...`,
      );
      const result = await itineraryGenerator.generate(testFormData);

      const totalMs = Date.now() - start;
      const dayCount = result?.days?.length || 0;
      const placeCount =
        result?.days?.reduce(
          (sum: number, d: any) => sum + (d?.places?.length || 0),
          0,
        ) || 0;

      steps.push(`[${totalMs}ms] SUCCESS - ${dayCount}일 ${placeCount}곳`);

      const pipelineTimings = result?.metadata?._timings || {};
      const pipelineTotal = result?.metadata?._totalMs || totalMs;

      res.json({
        status: "ok",
        steps,
        totalMs,
        pipeline: {
          version: result?.metadata?._pipelineVersion || "unknown",
          totalMs: pipelineTotal,
          stages: {
            AG1_skeleton: pipelineTimings["AG1_skeleton"] || 0,
            AG2_AG3pre_parallel: pipelineTimings["AG2_AG3pre_parallel"]
              ? pipelineTimings["AG2_AG3pre_parallel"] -
                (pipelineTimings["AG1_skeleton"] || 0)
              : 0,
            AG3_matchScore: pipelineTimings["AG3_matchScore"]
              ? pipelineTimings["AG3_matchScore"] -
                (pipelineTimings["AG2_AG3pre_parallel"] || 0)
              : 0,
            AG4_finalize: pipelineTimings["AG4_finalize"]
              ? pipelineTimings["AG4_finalize"] -
                (pipelineTimings["AG3_matchScore"] || 0)
              : 0,
          },
          summary: `AG1:${pipelineTimings["AG1_skeleton"] || "?"}ms → AG2+3pre:${pipelineTimings["AG2_AG3pre_parallel"] ? pipelineTimings["AG2_AG3pre_parallel"] - (pipelineTimings["AG1_skeleton"] || 0) : "?"}ms → AG3:${pipelineTimings["AG3_matchScore"] ? pipelineTimings["AG3_matchScore"] - (pipelineTimings["AG2_AG3pre_parallel"] || 0) : "?"}ms → AG4:${pipelineTimings["AG4_finalize"] ? pipelineTimings["AG4_finalize"] - (pipelineTimings["AG3_matchScore"] || 0) : "?"}ms = 총 ${pipelineTotal}ms`,
        },
        result: {
          days: dayCount,
          totalPlaces: placeCount,
          placeSample:
            result?.days?.[0]?.places?.slice(0, 3)?.map((p: any) => ({
              name: p.name,
              source: p.sourceType,
              score: p.finalScore,
            })) || [],
        },
      });
    } catch (error: any) {
      steps.push(`[${Date.now() - start}ms] ERROR: ${error?.message}`);
      steps.push(
        `[${Date.now() - start}ms] Stack: ${(error?.stack || "").substring(0, 500)}`,
      );
      res.json({ status: "error", steps, totalMs: Date.now() - start });
    }
  });

  // 2026-08-23 사장님 승인 = 구(legacy) Places Autocomplete/Details 프록시 2라우트 삭제 §19 = 소스 호출자 0(숙소·도시 검색은 구글 공식 위젯 직통), 옛 번들만 두드리던 유료 표면 제거.

  app.post("/api/routes/regenerate-day", async (req, res) => {
    try {
      const { day, accommodationCoords, places, formData } = req.body;

      if (!day || !places || !Array.isArray(places)) {
        return res.status(400).json({ error: "day, places are required" });
      }

      const result = await itineraryGenerator.regenerateDay({
        day,
        accommodationCoords,
        places,
        formData,
      });

      res.json(result);
    } catch (error: any) {
      console.error("[Regenerate Day] Error:", error?.message);
      res.status(500).json({ error: "동선 재최적화 실패" });
    }
  });
}
