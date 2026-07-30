// ⚠️ 2026-07-15 = routes.ts(1,049줄) 500줄 가드 초과 슬림화 = 순수 이동(로직 변경 없음) §0
//   담긴 라우트 = 도시 3 + 장소 3(단건조회·자동완성·상세) + 일정생성(+디버그) + Day 재최적화
import type { Express } from "express";
import { storage } from "./storage";
import { itineraryGenerator } from "./services/itinerary-generator";
import { db } from "./db";
import { cities, users, placeSeedRaw } from "../shared/schema";
import { eq, sql, desc } from "drizzle-orm";
// ⚠️ 완비 기준 = ag2 의 상수 1벌을 가져다 쓴다(§16). 여기에 300 을 다시 적으면 기준이 두 벌이 된다.
import { READY_THRESHOLD } from "./services/agents/ag2-gemini-recommender";
import {
  computeDayRouteLive,
  enrichStopsWithPsr,
} from "./services/shared/routes-client";
import { chargeFeature } from "./credit-charge"; // 크레딧 차감 단일 관문(2026-07-29 §9)

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
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          country: cities.country,
          latitude: cities.latitude,
          longitude: cities.longitude,
          rows: sql<number>`COUNT(${placeSeedRaw.id})::int`,
        })
        .from(cities)
        .innerJoin(placeSeedRaw, eq(placeSeedRaw.cityId, cities.id))
        .groupBy(
          cities.id,
          cities.name,
          cities.nameEn,
          cities.country,
          cities.latitude,
          cities.longitude,
        )
        .having(sql`COUNT(${placeSeedRaw.id}) >= ${READY_THRESHOLD}`)
        .orderBy(desc(sql`COUNT(${placeSeedRaw.id})`));
      res.json(rows);
    } catch (error) {
      console.error("[cities/ready] 완비도시 조회 실패:", error);
      res.status(500).json({ error: "failed_to_fetch_ready_cities" });
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

  // Itinerary generation
  app.post("/api/routes/generate", async (req, res) => {
    try {
      const formData = req.body;

      if (!formData.destination || !formData.startDate || !formData.endDate) {
        return res.status(400).json({
          error: "destination, startDate, endDate are required",
        });
      }

      // 🎯 사용자 정보 DB에서 조회 (birthDate 필수 - 로그인시 입력됨)
      let enrichedFormData: Record<string, any> = {
        ...formData,
        language: formData.language || "ko", // 일정 생성 출력 언어 (기본 한국어)
      };

      if (formData.userId) {
        try {
          const [user] = await db
            .select({
              birthDate: users.birthDate,
              displayName: users.displayName,
              preferredVibes: users.preferredVibes,
              preferredLanguage: users.preferredLanguage,
            })
            .from(users)
            .where(eq(users.id, formData.userId));

          if (user) {
            // DB에서 가져온 사용자 정보 병합 (language: 일정 생성 출력 언어)
            enrichedFormData = {
              ...formData,
              birthDate: user.birthDate, // 🎯 핵심: 가족 연령 추정용
              userDisplayName: user.displayName,
              language: formData.language || user.preferredLanguage || "ko",
              // preferredVibes는 프론트에서 선택한 vibes 우선
            };

            console.log(
              `[Routes] 🎯 사용자 정보 조회 완료: userId=${formData.userId}, birthDate=${user.birthDate}`,
            );
          }
        } catch (userError) {
          console.warn(
            "[Routes] 사용자 정보 조회 실패 (계속 진행):",
            userError,
          );
        }
      }

      // 🪙 여정 생성 5크레딧 차감 (2026-07-29 §9) = 유료 파이프라인 진입 **직전**.
      //   userId 는 이 라우트의 규약대로 body 에서 온다(위 formData.userId) = 여기서 다른 갈래를 만들지 않는다(§0).
      if (
        !(await chargeFeature(res, formData.userId ?? null, "route_generate"))
      )
        return;

      const itinerary = await itineraryGenerator.generate(enrichedFormData);

      // 🔍 디버그: places 비어있는 문제 추적
      const debugInfo = {
        daysCount: itinerary?.days?.length || 0,
        placesPerDay:
          itinerary?.days?.map((d: any) => ({
            day: d.day,
            placesCount: d.places?.length || 0,
            placeNames: d.places?.slice(0, 3).map((p: any) => p.name) || [],
          })) || [],
        totalPlaces: itinerary?.metadata?.totalPlaces || 0,
        pipelineVersion: itinerary?.metadata?._pipelineVersion || "unknown",
        totalMs: itinerary?.metadata?._totalMs || 0,
      };
      console.log(`[Routes] 📊 일정 생성 완료:`, JSON.stringify(debugInfo));

      // places가 전부 비어있으면 경고
      const totalPlacesInDays = debugInfo.placesPerDay.reduce(
        (sum: number, d: any) => sum + d.placesCount,
        0,
      );
      if (totalPlacesInDays === 0) {
        console.error(
          `[Routes] ❌ 경고: 모든 day의 places가 비어있습니다! schedule이 비었을 수 있음`,
        );
      }

      res.json(itinerary);
    } catch (error: any) {
      console.error("Error generating itinerary:", error?.message || error);

      // API 키 누락 에러 구분
      if (error?.message?.includes("API") || error?.message?.includes("키")) {
        res.status(503).json({
          error: "AI 서비스 연결 오류",
          detail: error.message,
          suggestion: "관리자 대시보드에서 API 키를 확인해주세요.",
        });
      } else {
        res.status(500).json({
          error: "일정 생성 실패",
          detail: error?.message || "Unknown error",
          stack: (error?.stack || "").substring(0, 300),
        });
      }
    }
  });

  // 🔧 진단용: 일정 생성 단계별 타임아웃 확인
  app.get("/api/debug/generate-test", async (req, res) => {
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
