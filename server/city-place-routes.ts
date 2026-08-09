// ⚠️ 2026-07-15 = routes.ts(1,049줄) 500줄 가드 초과 슬림화 = 순수 이동(로직 변경 없음) §0
//   담긴 라우트 = 도시 3 + 장소 3(단건조회·자동완성·상세) + 일정생성(+디버그) + Day 재최적화
import type { Express } from "express";
import { storage } from "./storage";
import { itineraryGenerator } from "./services/itinerary-generator";
import { db } from "./db";
// guides = 해설 창고 1벌(2026-08-02). 도시 카드 [해설] 배지를 켤지 여기서 있는지만 본다.
import {
  cities,
  users,
  placeSeedRaw,
  itineraries,
  guides,
} from "../shared/schema";
// ne·isNull·isNotNull = 대표장소 조건을 city-representative-place 1벌로 옮기며 이 파일에서 안 쓰게 됨(삭제 2026-08-05 §19)
import { eq, sql, desc, and, or } from "drizzle-orm";
// ⚠️ 완비 기준 = ag2 의 상수 1벌을 가져다 쓴다(§16). 여기에 300 을 다시 적으면 기준이 두 벌이 된다.
import { READY_THRESHOLD } from "./services/agents/ag2-gemini-recommender";
// 도시 대표장소 = 조건·정렬 1벌(해설 무료 판정과 같은 기준을 봐야 함, 2026-08-05 §16)
import {
  cityRepresentativeWhere,
  cityRepresentativeOrder,
} from "./services/shared/city-representative-place";
import {
  computeDayRouteLive,
  enrichStopsWithPsr,
} from "./services/shared/routes-client";
import { getUserIdFromReq } from "./auth-user"; // 토큰 → userId 1벌(§16)

export function registerCityPlaceRoutes(app: Express): void {
  // Cities
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
  //   DB-only 가 완비된 도시만 = place_seed_raw 전체 행수 ≥ READY_THRESHOLD(300, ag2 상수 1벌).
  //   완비도 높은 순(행수 DESC)으로 내려준다 = 사장님 "완비된 도시 순으로 노출".
  //   ⚠️ 반드시 아래 "/api/cities/:id" **앞**에 있어야 한다 = 뒤에 두면 :id 가 "ready" 를 id 로 먹어 404.
  //   도시를 더 발굴해 300 을 넘기면 **코드 수정 없이 자동으로 목록에 추가됨**(사장님 "점진적으로 늘려감").
  app.get("/api/cities/ready", async (_req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });
      // 화면이 쓰는 칸만 뽑는다 = 안 쓰는 칸을 뽑으면 GROUP BY 가 그만큼 길어진다(2026-07-30 §22 지적).
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
  //   조립은 1벌 = ① 도시 DB 로 기본 카드를 채우고 ② 대표여정이 있으면 그 칸만 여정 값으로 덮는다(§0 = 폴백 분기 안 만듦).
  //   아래 "/api/cities/:id" 와 경로 충돌 없음(:id 는 슬래시를 넘지 않음) = /api/cities/ready 뒤 배치.
  app.get("/api/cities/:id/representative", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });
      const cityId = parseInt(req.params.id);
      if (Number.isNaN(cityId)) {
        return res.status(404).json({ error: "City not found" });
      }
      // 🎙️ 지금 화면 언어 = 화면이 넘겨준다(앱 언어 1벌). 안 넘어오면 한국어.
      //   같은 장소라도 언어가 다르면 해설 자체가 다르므로 창고를 찾는 열쇠에 반드시 들어간다.
      const lang = String(req.query.lang || "ko");

      // 조회 2번뿐 = ① 도시 1행(+있으면 대표여정 LEFT JOIN) ② 도심 리뷰 상위 3곳(2026-08-01 "대표 사진" SQL 그대로).
      //   상위 3곳 = 사진(1위)·한 줄 카피(1위 summary_ko)·하이라이트(3곳)를 **한 번의 조회로** 다 쓴다(§16 = 같은 조건 두 번 묻지 않음).
      const [[row], top3] = await Promise.all([
        db
          .select({
            nameKo: cities.name,
            nameEn: cities.nameEn,
            country: cities.country,
            itineraryId: itineraries.id, // 대표여정 없으면 null = 그대로 "없음" 신호
            title: itineraries.title,
            protagonistSentence: itineraries.protagonistSentence,
            rawData: itineraries.rawData,
            videoByDay: itineraries.videoByDay,
          })
          .from(cities)
          // ⚠️ 수정금지(승인필요) 2026-08-02 사장님 = 대표여정 고르는 순서 1벌.
          //   ① 손으로 올린 대표(status='representative') 가 있으면 그것
          //   ② 없으면 **영상이 완성된 관리자 여정 중 최신** 이 자동으로 그 도시 대표
          //      (사장님 SSOT: "최신 영상이 있는 것이 우선 = 이게 우리 앱의 특화")
          //   ③ 둘 다 없으면 null = 카드는 도시 DB 만으로 뜬다(B-0 자동 채움).
          //   정렬로 1벌 표현 = 분기 코드를 만들지 않는다(§0).
          //   ⚠️ 2026-08-03 사장님 지적·승인 = ②에 **관리자 소유** 조건 추가. 없던 탓에 손으로 올린 대표가
          //     아직 없는 도시는 **아무 사용자가 영상을 만드는 순간 그 여정이 도시 카드에 걸렸다**(권한 구멍).
          //     판정 기준 = users.role='admin' 1벌(§9 표7 = is_admin·아이디 문자열 금지).
          .leftJoin(
            itineraries,
            and(
              eq(itineraries.cityId, cities.id),
              or(
                eq(itineraries.status, "representative"),
                and(
                  sql`EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e
                              WHERE e.value->>'status' = 'succeeded')`,
                  sql`EXISTS (SELECT 1 FROM ${users} u
                              WHERE u.id = ${itineraries.userId} AND u.role = 'admin')`,
                ),
              ),
            ),
          )
          .where(eq(cities.id, cityId))
          .orderBy(
            sql`CASE WHEN ${itineraries.status} = 'representative' THEN 0 ELSE 1 END`,
            desc(itineraries.id),
          )
          .limit(1),
        db
          .select({
            // 🎙️ 2026-08-02 = 1위 행의 우리 장소번호. 관리자 [해설 만들기] 가 이 번호로 해설 화면을 연다.
            //   이미 뽑는 조회에 칸 하나만 더한다 = 같은 조건을 두 번 묻는 새 조회를 만들지 않는다(§16).
            id: placeSeedRaw.id,
            imageUrl: placeSeedRaw.imageUrl,
            summaryKo: placeSeedRaw.summaryKo,
            nameKo: placeSeedRaw.nameKo,
            nameEn: placeSeedRaw.nameEn,
          })
          .from(placeSeedRaw)
          // ⚠️ 수정금지(승인필요) 2026-08-05 = 조건·정렬은 **city-representative-place 1벌**을 가져다 쓴다.
          //   여기서 다시 적으면 = 해설 무료 판정(guide-routes)과 갈라져 카드에 뜬 장소인데 5크레딧이 깎인다(§16).
          .where(cityRepresentativeWhere(cityId))
          .orderBy(...cityRepresentativeOrder)
          .limit(3),
      ]);
      if (!row) return res.status(404).json({ error: "City not found" });

      // 🎙️ 2026-08-02 사장님 확정 = [해설] 배지는 **그 카드 장소의 해설이 창고에 있으면 자동으로 켠다.**
      //   대표 해설을 따로 담는 칸도, 손으로 고르는 절차도 두지 않는다 =
      //   카드가 보여주는 장소(리뷰 1위)와 [해설 만들기]가 여는 장소가 같은 1곳이라 고를 것이 없다.
      //   찾는 열쇠 = (장소번호, 언어) 두 칸 = 색인 guides_place_lang_idx 그대로.
      //   ⚠️ 있는지만 본다 = 내용 칸은 뽑지 않고 1행에서 끊는다(이 라우트는 도시 칩마다 불린다).
      const repPlaceId = top3[0]?.id ?? null;
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

      // ① 기본 카드 = 도시 DB 만으로 채움. 장소가 0개면 사진 null·하이라이트 [] 로 그대로 나간다(화면이 알아서 비움).
      const card = {
        itineraryId: row.itineraryId,
        cityId,
        nameKo: row.nameKo,
        nameEn: row.nameEn,
        country: row.country,
        tagline: top3[0]?.summaryKo ?? "",
        highlights: top3.map((p) => p.nameKo || p.nameEn),
        dayCount: 0, // 0 = 화면이 "N일 코스" 배지를 안 그림
        imageUrl: top3[0]?.imageUrl ?? null,
        // 🎙️ 2026-08-02 사장님 순서 ㉠ = 관리자가 [해설 만들기] 로 여는 장소 = 위 사진과 **같은 1위 행**.
        //   그 도시에 쓸 장소가 하나도 없으면 null = 화면이 [해설 만들기] 를 아예 안 그린다.
        placeId: repPlaceId,
        // 🎙️ 해설 배지 스위치 = 그 장소 + 그 언어의 해설이 창고에 1건이라도 있으면 켜짐(위 존재 확인 1벌).
        hasGuide: guideHit.length > 0,
        hasVideo: false,
      };

      // ② 대표여정이 있으면 그 여정 값이 이긴다(사진은 위 1위 장소 그대로 = 두 경우 동일).
      if (row.itineraryId !== null) {
        const raw = row.rawData as any;
        const days: any[] = Array.isArray(raw?.days) ? raw.days : [];
        // 하이라이트 = rawData.days 앞에서부터 장소명 정확히 3개(1일차가 3곳 미만이면 다음 날 이어붙임 = B-0)
        const picked: string[] = [];
        for (const d of days) {
          for (const p of d?.places || []) {
            if (picked.length >= 3) break;
            if (typeof p?.name === "string" && p.name) picked.push(p.name);
          }
          if (picked.length >= 3) break;
        }
        card.tagline = row.protagonistSentence || row.title || ""; // 주인공 문장 우선, 없으면 제목(B-0)
        card.highlights = picked;
        card.dayCount = days.length;
        // hasVideo = 하루라도 영상 성공(succeeded)이면 true = ▶배지는 영상이 실제로 있을 때만(B5)
        card.hasVideo = Object.values(row.videoByDay || {}).some(
          (v) => v?.status === "succeeded",
        );
      }

      res.json(card);
    } catch (error) {
      console.error("[cities/:id/representative] 도시 카드 조회 실패:", error);
      res.status(500).json({ error: "failed_to_fetch_representative" });
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

  // ⚠️ 2026-05-23 = /api/cities/:cityId/places 완전 삭제 (= FE 호출 0 = storage.getPlacesByCity 의존 = Step 2 storage 정리 시 함수 삭제)

  // ⚠️ 2026-05-23 = /api/places/:id = PSR 직접 (= storage.getPlace 본문 PSR 사용)
  // = dataSources (= placeDataSources 의존) = 삭제
  app.get("/api/places/:id", async (req, res, next) => {
    // ⚠️ 2026-06-28 = :id 가 정수 아니면(예 "autocomplete"/"details") 다음 라우트로 위임 (= NaN→getPlace(NaN)→DB 22P02 500 버그 차단).
    //   원인 = 이 라우트가 /api/places/autocomplete·details 보다 먼저 정의 = Express 가 "autocomplete"를 :id 로 선매칭.
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

  // ⚠️ 2026-05-23 = /api/cities/:cityId/recommendations + /api/sync/city/* 완전 삭제
  // = FE 호출 0 = scoringEngine (= weather/places 의존 = 폐기) + DEPRECATED endpoint 정리

  // ⚠️ 2026-05-23 = /api/sync/place/*/vibe + /taste 완전 삭제 (= vibe-processor + taste-verifier 파일 삭제 = 사용자 SSOT)

  // ⚠️ 2026-05-23 = /api/cities/:cityId/weather 완전 삭제 (= FE 호출 0 = weather.ts 파일도 삭제)

  // [DROPPED 0013] reality-checks 엔드포인트 삭제

  // ⚠️ 2026-07-24 사장님 승인 = 일별 [바로가기] = 출발지+경유지+도착지 왕복(사장님 SSOT).
  //   출발/도착 = 숙소(변경시 좌표) ?? 도시명 주소(미설정 = 구글이 도시중심 지오코딩 = 좌표조회 불필요·견고, 사장님 SSOT).
  //   경유지 = 그날 슬롯(클릭 시점 순서). PSR 이름보충 + Routes API 왕복 실소요시간. 재정렬 안 함.
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
      // 왕복 실소요 endpoint = 숙소 좌표(변경시) ?? 도시명 주소(구글 지오코딩). 딥링크 출발/도착은 FE 가 동일 기준으로 조립.
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
      // ① PSR 좌표조회 = 슬롯 PID+이름(구글맵 주소 대신 장소명, 사장님 SSOT). 출발/도착은 FE 가 숙소/도시명으로.
      const enriched = await enrichStopsWithPsr(slots);
      // ② Routes API 왕복 실소요시간 (선택 = 실패해도 이름은 반환). endpoint 없으면 스킵.
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

  // 🔧 진단용: 일정 생성 단계별 타임아웃 확인
  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 관리자 전용 잠금(§9 표7 판단기준 = users.role 1벌).
  //   옛것 = 인증·차감 전혀 없이 실제 유료 파이프라인(Gemini+TS)이 그대로 도는 구멍이었다(운영배포 시 무제한 무료호출 위험).
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

      // Gemini API 키 확인
      const geminiKey = process.env.GEMINI_API_KEY;
      steps.push(
        `[${Date.now() - start}ms] Gemini key: ${geminiKey ? "present (" + geminiKey.substring(0, 8) + "...)" : "MISSING"}`,
      );

      // DB 연결 확인
      const cityCheck = await db
        .select({ count: sql<number>`count(*)` })
        .from(cities);
      steps.push(
        `[${Date.now() - start}ms] DB OK - cities: ${cityCheck[0]?.count}`,
      );

      // 간단한 일정 생성 테스트
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

      // 파이프라인 단계별 타이밍 추출
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

  // ========================================
  // 🏨 장소 검색 프록시 API (Google Places Autocomplete)
  // API 키를 서버에서만 사용 — 클라이언트 노출 방지
  // ========================================

  // 장소 자동완성 (목적지 도시 / 숙소 검색)
  app.get("/api/places/autocomplete", async (req, res) => {
    try {
      const apiKey =
        process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res
          .status(503)
          .json({ error: "Google Maps API key not configured" });
      }

      const { input, types, location, radius, language } = req.query;
      if (!input || typeof input !== "string") {
        return res.status(400).json({ error: "input parameter required" });
      }

      // Google Places Autocomplete API 호출
      const params = new URLSearchParams({
        input,
        key: apiKey,
        language: (language as string) || "ko",
      });

      if (types) params.append("types", types as string);
      if (location) params.append("location", location as string);
      if (radius) params.append("radius", radius as string);

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
      );
      const data = await response.json();

      // 필요한 필드만 반환 (API 키 노출 방지)
      const predictions = (data.predictions || []).map((p: any) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting?.main_text || p.description,
        secondaryText: p.structured_formatting?.secondary_text || "",
        types: p.types || [],
      }));

      res.json({ predictions });
    } catch (error: any) {
      console.error("[Places Autocomplete] Error:", error?.message);
      res.status(500).json({ error: "장소 검색 실패" });
    }
  });

  // 장소 상세 정보 (좌표 + 주소 확보)
  app.get("/api/places/details", async (req, res) => {
    try {
      const apiKey =
        process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res
          .status(503)
          .json({ error: "Google Maps API key not configured" });
      }

      const { placeId } = req.query;
      if (!placeId || typeof placeId !== "string") {
        return res.status(400).json({ error: "placeId parameter required" });
      }

      const params = new URLSearchParams({
        place_id: placeId,
        key: apiKey,
        language: "ko",
        fields: "geometry,formatted_address,name,place_id,types",
      });

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params}`,
      );
      const data = await response.json();

      if (!data.result) {
        return res.status(404).json({ error: "장소를 찾을 수 없습니다" });
      }

      const result = data.result;
      res.json({
        placeId: result.place_id,
        name: result.name,
        address: result.formatted_address,
        coords: {
          lat: result.geometry?.location?.lat,
          lng: result.geometry?.location?.lng,
        },
        types: result.types || [],
      });
    } catch (error: any) {
      console.error("[Places Details] Error:", error?.message);
      res.status(500).json({ error: "장소 상세 조회 실패" });
    }
  });

  // Day별 동선 재최적화 API (숙소 변경 시)
  app.post("/api/routes/regenerate-day", async (req, res) => {
    try {
      const { day, accommodationCoords, places, formData } = req.body;

      if (!day || !places || !Array.isArray(places)) {
        return res.status(400).json({ error: "day, places are required" });
      }

      // 동선 재최적화 (숙소 좌표 기반 원형 경로)
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
