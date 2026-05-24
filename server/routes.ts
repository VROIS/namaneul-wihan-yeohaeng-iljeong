import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
// ⚠️ 2026-05-23 = googlePlacesFetcher + vibeProcessor + tasteVerifier import 제거 (= 파일 삭제 = 사용자 SSOT)
import { itineraryGenerator } from "./services/itinerary-generator";
import { getVideoGenerationTask } from "./services/seedance-video-generator";
import { getTestVideoHtml } from "./test-video-ui";
import { registerAdminRoutes } from "./admin-routes";
import { registerAuthRoutes } from "./auth";
import { registerBtsRoutes } from "./bts-routes";
import { registerGuideRoutes } from "./guide-routes";
import { db } from "./db";
import { cities, itineraries } from "../shared/schema";
import { count, eq, desc, sql } from "drizzle-orm";
import { users } from "../shared/schema";

const BRAND_PRIMARY = "#6366F1";

function getEmptyMapHtml(): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,sans-serif;background:#f5f5f5}.msg{color:#666;font-size:14px}</style></head><body><div class="msg">장소 좌표 없음</div></body></html>`;
}

function generateMapHtml(places: any[], apiKey: string): string {
  const center = {
    lat: places.reduce((sum, p) => sum + (p.lat || 0), 0) / places.length,
    lng: places.reduce((sum, p) => sum + (p.lng || 0), 0) / places.length,
  };

  const markersJson = JSON.stringify(places.map((p, i) => ({
    position: { lat: p.lat, lng: p.lng },
    label: String(i + 1),
    title: p.name || `장소 ${i + 1}`,
    vibeScore: p.vibeScore || 0,
  })));

  const pathJson = JSON.stringify(places.map(p => ({ lat: p.lat, lng: p.lng })));
  const centerJson = JSON.stringify(center);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}#map{width:100%;height:100%}.iw{padding:8px;max-width:180px}.iw-t{font-weight:700;font-size:13px;margin-bottom:4px}.iw-s{background:${BRAND_PRIMARY}20;color:${BRAND_PRIMARY};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}</style>
<script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry"></script>
</head>
<body>
<div id="map"></div>
<script>
const places=${markersJson};
const path=${pathJson};
const center=${centerJson};
function init(){
const map=new google.maps.Map(document.getElementById('map'),{center,zoom:13,disableDefaultUI:true,zoomControl:true,gestureHandling:'greedy',styles:[{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},{featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]}]});
const bounds=new google.maps.LatLngBounds();
places.forEach((p,i)=>{
const pos=new google.maps.LatLng(p.position.lat,p.position.lng);
bounds.extend(pos);
const m=new google.maps.Marker({position:pos,map,label:{text:p.label,color:'white',fontWeight:'bold',fontSize:'12px'},icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:'${BRAND_PRIMARY}',fillOpacity:1,strokeColor:'white',strokeWeight:3},title:p.title});
const iw=new google.maps.InfoWindow({content:'<div class="iw"><div class="iw-t">'+p.title+'</div><span class="iw-s">Vibe '+p.vibeScore+'</span></div>'});
m.addListener('click',()=>iw.open(map,m));
});
if(path.length>1){
new google.maps.Polyline({path,geodesic:true,strokeColor:'${BRAND_PRIMARY}',strokeOpacity:0.8,strokeWeight:4,icons:[{icon:{path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:3},offset:'50%'}]}).setMap(map);
}
if(places.length>1)map.fitBounds(bounds,{top:20,right:20,bottom:20,left:20});
}
init();
</script>
</body>
</html>`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerAdminRoutes(app);
  registerAuthRoutes(app);
  registerBtsRoutes(app);
  registerGuideRoutes(app); // 내손안에 가이드 API (Phase 4 구현)

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
  app.get("/api/places/:id", async (req, res) => {
    try {
      const place = await storage.getPlace(parseInt(req.params.id));
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

  // Itinerary generation
  app.post("/api/routes/generate", async (req, res) => {
    try {
      const formData = req.body;

      if (!formData.destination || !formData.startDate || !formData.endDate) {
        return res.status(400).json({
          error: "destination, startDate, endDate are required"
        });
      }

      // 🎯 사용자 정보 DB에서 조회 (birthDate 필수 - 로그인시 입력됨)
      let enrichedFormData: Record<string, any> = {
        ...formData,
        language: formData.language || "ko",  // 일정 생성 출력 언어 (기본 한국어)
      };

      if (formData.userId) {
        try {
          const [user] = await db.select({
            birthDate: users.birthDate,
            displayName: users.displayName,
            preferredVibes: users.preferredVibes,
            preferredLanguage: users.preferredLanguage,
          }).from(users).where(eq(users.id, formData.userId));

          if (user) {
            // DB에서 가져온 사용자 정보 병합 (language: 일정 생성 출력 언어)
            enrichedFormData = {
              ...formData,
              birthDate: user.birthDate,  // 🎯 핵심: 가족 연령 추정용
              userDisplayName: user.displayName,
              language: formData.language || user.preferredLanguage || "ko",
              // preferredVibes는 프론트에서 선택한 vibes 우선
            };

            console.log(`[Routes] 🎯 사용자 정보 조회 완료: userId=${formData.userId}, birthDate=${user.birthDate}`);
          }
        } catch (userError) {
          console.warn("[Routes] 사용자 정보 조회 실패 (계속 진행):", userError);
        }
      }

      const itinerary = await itineraryGenerator.generate(enrichedFormData);

      // 🔍 디버그: places 비어있는 문제 추적
      const debugInfo = {
        daysCount: itinerary?.days?.length || 0,
        placesPerDay: itinerary?.days?.map((d: any) => ({
          day: d.day,
          placesCount: d.places?.length || 0,
          placeNames: d.places?.slice(0, 3).map((p: any) => p.name) || [],
        })) || [],
        totalPlaces: itinerary?.metadata?.totalPlaces || 0,
        pipelineVersion: itinerary?.metadata?._pipelineVersion || 'unknown',
        totalMs: itinerary?.metadata?._totalMs || 0,
      };
      console.log(`[Routes] 📊 일정 생성 완료:`, JSON.stringify(debugInfo));

      // places가 전부 비어있으면 경고
      const totalPlacesInDays = debugInfo.placesPerDay.reduce((sum: number, d: any) => sum + d.placesCount, 0);
      if (totalPlacesInDays === 0) {
        console.error(`[Routes] ❌ 경고: 모든 day의 places가 비어있습니다! schedule이 비었을 수 있음`);
      }

      res.json(itinerary);
    } catch (error: any) {
      console.error("Error generating itinerary:", error?.message || error);

      // API 키 누락 에러 구분
      if (error?.message?.includes('API') || error?.message?.includes('키')) {
        res.status(503).json({
          error: "AI 서비스 연결 오류",
          detail: error.message,
          suggestion: "관리자 대시보드에서 API 키를 확인해주세요."
        });
      } else {
        res.status(500).json({
          error: "일정 생성 실패",
          detail: error?.message || 'Unknown error',
          stack: (error?.stack || '').substring(0, 300),
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
      steps.push(`[${Date.now() - start}ms] Gemini key: ${geminiKey ? 'present (' + geminiKey.substring(0, 8) + '...)' : 'MISSING'}`);

      // DB 연결 확인
      const cityCheck = await db.select({ count: sql<number>`count(*)` }).from(cities);
      steps.push(`[${Date.now() - start}ms] DB OK - cities: ${cityCheck[0]?.count}`);

      // 간단한 일정 생성 테스트
      const testFormData = {
        destination: "Paris",
        startDate: "2026-03-01",
        endDate: "2026-03-01",
        vibes: ["Foodie"] as any,
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

      steps.push(`[${Date.now() - start}ms] Calling generateItinerary (4+1 Agent Pipeline)...`);
      const result = await itineraryGenerator.generate(testFormData);

      const totalMs = Date.now() - start;
      const dayCount = result?.days?.length || 0;
      const placeCount = result?.days?.reduce((sum: number, d: any) => sum + (d?.places?.length || 0), 0) || 0;

      steps.push(`[${totalMs}ms] SUCCESS - ${dayCount}일 ${placeCount}곳`);

      // 파이프라인 단계별 타이밍 추출
      const pipelineTimings = result?.metadata?._timings || {};
      const pipelineTotal = result?.metadata?._totalMs || totalMs;

      res.json({
        status: "ok",
        steps,
        totalMs,
        pipeline: {
          version: result?.metadata?._pipelineVersion || 'unknown',
          totalMs: pipelineTotal,
          stages: {
            AG1_skeleton: pipelineTimings['AG1_skeleton'] || 0,
            AG2_AG3pre_parallel: pipelineTimings['AG2_AG3pre_parallel']
              ? pipelineTimings['AG2_AG3pre_parallel'] - (pipelineTimings['AG1_skeleton'] || 0) : 0,
            AG3_matchScore: pipelineTimings['AG3_matchScore']
              ? pipelineTimings['AG3_matchScore'] - (pipelineTimings['AG2_AG3pre_parallel'] || 0) : 0,
            AG4_finalize: pipelineTimings['AG4_finalize']
              ? pipelineTimings['AG4_finalize'] - (pipelineTimings['AG3_matchScore'] || 0) : 0,
          },
          summary: `AG1:${pipelineTimings['AG1_skeleton'] || '?'}ms → AG2+3pre:${pipelineTimings['AG2_AG3pre_parallel'] ? pipelineTimings['AG2_AG3pre_parallel'] - (pipelineTimings['AG1_skeleton'] || 0) : '?'}ms → AG3:${pipelineTimings['AG3_matchScore'] ? pipelineTimings['AG3_matchScore'] - (pipelineTimings['AG2_AG3pre_parallel'] || 0) : '?'}ms → AG4:${pipelineTimings['AG4_finalize'] ? pipelineTimings['AG4_finalize'] - (pipelineTimings['AG3_matchScore'] || 0) : '?'}ms = 총 ${pipelineTotal}ms`
        },
        result: {
          days: dayCount,
          totalPlaces: placeCount,
          placeSample: result?.days?.[0]?.places?.slice(0, 3)?.map((p: any) => ({
            name: p.name,
            source: p.sourceType,
            score: p.finalScore,
          })) || [],
        }
      });
    } catch (error: any) {
      steps.push(`[${Date.now() - start}ms] ERROR: ${error?.message}`);
      steps.push(`[${Date.now() - start}ms] Stack: ${(error?.stack || '').substring(0, 500)}`);
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
      const apiKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Google Maps API key not configured" });
      }

      const { input, types, location, radius, language } = req.query;
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: "input parameter required" });
      }

      // Google Places Autocomplete API 호출
      const params = new URLSearchParams({
        input,
        key: apiKey,
        language: (language as string) || 'ko',
      });

      if (types) params.append('types', types as string);
      if (location) params.append('location', location as string);
      if (radius) params.append('radius', radius as string);

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
      );
      const data = await response.json();

      // 필요한 필드만 반환 (API 키 노출 방지)
      const predictions = (data.predictions || []).map((p: any) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting?.main_text || p.description,
        secondaryText: p.structured_formatting?.secondary_text || '',
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
      const apiKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Google Maps API key not configured" });
      }

      const { placeId } = req.query;
      if (!placeId || typeof placeId !== 'string') {
        return res.status(400).json({ error: "placeId parameter required" });
      }

      const params = new URLSearchParams({
        place_id: placeId,
        key: apiKey,
        language: 'ko',
        fields: 'geometry,formatted_address,name,place_id,types',
      });

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params}`
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

  // ========================================
  // 💰 예산 계산 API (TravelStyle 기반)
  // ========================================

  // 빠른 예산 미리보기 (버튼 선택시 실시간 표시)
  app.post("/api/budget/preview", async (req, res) => {
    try {
      const { getQuickBudgetPreview } = await import("./services/budget-calculator");
      const { travelStyle, companionCount, dayCount, hoursPerDay } = req.body;

      const preview = await getQuickBudgetPreview(
        travelStyle || 'Reasonable',
        companionCount || 2,
        dayCount || 1,
        hoursPerDay || 8
      );

      res.json(preview);
    } catch (error) {
      console.error("Error calculating budget preview:", error);
      res.status(500).json({ error: "Failed to calculate budget preview" });
    }
  });

  // 상세 예산 계산 (일정 생성 후)
  app.post("/api/budget/calculate", async (req, res) => {
    try {
      const { calculateTravelBudget } = await import("./services/budget-calculator");
      const {
        travelStyle,
        companionType,
        companionCount,
        mobilityStyle,
        dayCount,
        hoursPerDay,
        mealsPerDay,
        places,
      } = req.body;

      const result = await calculateTravelBudget({
        travelStyle: travelStyle || 'Reasonable',
        companionType: companionType || 'Couple',
        companionCount: companionCount || 2,
        mobilityStyle: mobilityStyle || 'Moderate',
        dayCount: dayCount || 1,
        hoursPerDay: hoursPerDay || 8,
        mealsPerDay: mealsPerDay || 2,
        places: places || [],
      });

      res.json(result);
    } catch (error) {
      console.error("Error calculating budget:", error);
      res.status(500).json({ error: "Failed to calculate budget" });
    }
  });

  // TravelStyle별 비용 비교 (4가지 모두 표시)
  app.post("/api/budget/compare", async (req, res) => {
    try {
      const { getQuickBudgetPreview } = await import("./services/budget-calculator");
      const { companionCount, dayCount, hoursPerDay } = req.body;

      const styles = ['Luxury', 'Premium', 'Reasonable', 'Economic'] as const;
      const comparisons = await Promise.all(
        styles.map(async (style) => ({
          style,
          ...await getQuickBudgetPreview(style, companionCount || 2, dayCount || 1, hoursPerDay || 8)
        }))
      );

      res.json({
        comparisons,
        currency: 'EUR',
        note: '합리적/경제적 선택시에도 프리미엄 가이드 서비스 옵션 확인 가능',
      });
    } catch (error) {
      console.error("Error comparing budgets:", error);
      res.status(500).json({ error: "Failed to compare budgets" });
    }
  });

  // ⚠️ 2026-05-23 = /api/routes/optimize + /compare 완전 삭제 (= 사용자 SSOT = FE 호출 0 + Google Routes API 비용 폭탄 차단)
  // = route-optimizer.ts 파일 = 함께 삭제 = 메인앱 = transit-haversine.ts (= Haversine 자체 계산 = 외부 0) 사용

  // 사용자 언어 설정 업데이트 (i18n 동기화)
  app.patch("/api/users/:userId/preferred-language", async (req, res) => {
    try {
      const { userId } = req.params;
      const { preferredLanguage } = req.body;
      if (!userId || !preferredLanguage || typeof preferredLanguage !== "string") {
        return res.status(400).json({ error: "userId and preferredLanguage required" });
      }
      const valid = ["ko", "en", "ja", "fr", "zh", "es", "de"];
      if (!valid.includes(preferredLanguage)) {
        return res.status(400).json({ error: "Invalid preferredLanguage" });
      }
      const updated = await storage.updateUserLogin(userId, { preferredLanguage });
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({ success: true, preferredLanguage: updated.preferredLanguage });
    } catch (error: any) {
      console.error("Error updating preferred language:", error);
      res.status(500).json({ error: "Failed to update language" });
    }
  });

  // Itineraries
  app.get("/api/users/:userId/itineraries", async (req, res) => {
    try {
      const itineraries = await storage.getUserItineraries(req.params.userId);
      res.json(itineraries);
    } catch (error) {
      console.error("Error fetching itineraries:", error);
      res.status(500).json({ error: "Failed to fetch itineraries" });
    }
  });

  // ⚠️ 2026-05-23 = itineraries.rawData JSON 사용 (= 외래키 없음 = items 별도 SELECT 불필요)
  app.get("/api/itineraries/:id", async (req, res) => {
    try {
      const itinerary = await storage.getItinerary(parseInt(req.params.id));
      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      res.json(itinerary);
    } catch (error) {
      console.error("Error fetching itinerary:", error);
      res.status(500).json({ error: "Failed to fetch itinerary" });
    }
  });

  app.post("/api/itineraries", async (req, res) => {
    try {
      // 🔧 로그인 제거: userId를 'admin'으로 고정
      const userId = "admin";

      // admin 사용자 존재 확인 (없으면 자동 생성)
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        console.log(`[Itinerary] Admin user not found, creating...`);
        await storage.createUser({
          username: "admin",
          password: "admin",
          displayName: "관리자"
        });
        console.log(`[Itinerary] Admin user created`);
      }

      // 날짜 문자열을 Date 객체로 변환
      // travelStyle을 DB persona_type enum으로 매핑 (대문자 → 소문자)
      const styleToPersonaType: Record<string, string> = {
        'Luxury': 'luxury',
        'Premium': 'comfort',
        'Reasonable': 'comfort',
        'Economic': 'comfort', // 🩹 [2026-01-26] DB Enum 불일치 방지 (economic -> comfort)
        'luxury': 'luxury',
        'comfort': 'comfort',
        'reasonable': 'comfort',
        'economic': 'comfort', // 🩹 [2026-01-26] DB Enum 불일치 방지
      };

      const itineraryData = {
        ...req.body,
        userId: userId, // 강제로 admin
        startDate: req.body.startDate ? new Date(req.body.startDate) : new Date(),
        endDate: req.body.endDate ? new Date(req.body.endDate) : new Date(),
        personaType: styleToPersonaType[req.body.travelStyle] || 'comfort', // 소문자 매핑
        // 🩹 [2026-01-26] raw_data 저장 (없으면 빈 객체)
        rawData: req.body.rawData || {},
      };

      console.log(`[Itinerary] Creating for admin user...`);
      const itinerary = await storage.createItinerary(itineraryData);
      console.log(`[Itinerary] Created successfully: id=${itinerary.id}`);
      res.status(201).json(itinerary);
    } catch (error: any) {
      console.error("Error creating itinerary:", error?.message || error);
      console.error("Stack:", error?.stack);
      res.status(500).json({ error: "Failed to create itinerary", details: error?.message });
    }
  });

  // 테스트 UI 서빙
  app.get("/test-video", (req, res) => {
    res.send(getTestVideoHtml());
  });

  // ========================================
  // 🎥 Seedance 비디오 생성 API (Seedance 1.5 Pro)
  // ========================================

  // 🎬 영상 프롬프트 미리보기 API — 🚫 당분간 봉쇄 (미구현, Gemini 비용 절감)
  app.get("/api/itineraries/:id/video/prompts", (_req, res) => {
    res.status(503).json({
      error: "영상 프롬프트 API는 비용 절감을 위해 당분간 비활성화되었습니다.",
      code: "VIDEO_API_DISABLED",
    });
  });

  // 🎬 단일 장면 프롬프트 테스트 API — 🚫 당분간 봉쇄 (미구현, Gemini 비용 절감)
  app.post("/api/video/test-prompt", (_req, res) => {
    res.status(503).json({
      error: "영상 테스트 API는 비용 절감을 위해 당분간 비활성화되었습니다.",
      code: "VIDEO_API_DISABLED",
    });
  });

  // 🎬 영상 생성 시작 — 🚫 당분간 봉쇄 (미구현, Gemini 비용 절감)
  app.post("/api/itineraries/:id/video/generate", (_req, res) => {
    res.status(503).json({
      error: "영상 생성 API는 비용 절감을 위해 당분간 비활성화되었습니다.",
      code: "VIDEO_API_DISABLED",
    });
  });

  // ========================================
  // 🎬 임시 테스트용 영상 생성 API (DB 저장 없음)
  // ========================================

  // POST /api/video/generate-direct — 🚫 당분간 봉쇄 (미구현, Gemini 비용 절감)
  app.post("/api/video/generate-direct", (_req, res) => {
    res.status(503).json({
      error: "영상 직접 생성 API는 비용 절감을 위해 당분간 비활성화되었습니다.",
      code: "VIDEO_API_DISABLED",
    });
  });

  // 🎬 Seedance 작업 상태 조회 (DB 없이)
  app.get("/api/video/task/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return res.status(400).json({ error: "taskId is required" });
      }

      console.log(`[Video Task] 상태 조회: ${taskId}`);

      const taskStatus = await getVideoGenerationTask(taskId);

      if (!taskStatus) {
        return res.status(404).json({ error: "Task not found or API error" });
      }

      res.json({
        success: true,
        ...taskStatus
      });

    } catch (error) {
      console.error("[Video Task] Error:", error);
      res.status(500).json({ error: "Failed to get task status", details: String(error) });
    }
  });

  app.get("/api/itineraries/:id/video", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const itinerary = await storage.getItinerary(id);

      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }

      // 영상 생성을 요청한 적이 없는 경우
      if (!itinerary.videoTaskId && !itinerary.videoStatus) {
        return res.json({ status: "not_started", videoUrl: null });
      }

      // processing 상태 (다중 장면 백그라운드 생성 중)
      if (itinerary.videoStatus === "processing") {
        return res.json({
          status: "processing",
          videoUrl: null,
          message: "영상 생성 중... (여러 장면을 순차 생성합니다)"
        });
      }

      // 완료, 부분 완료, 실패 상태
      if (itinerary.videoStatus === "succeeded" ||
        itinerary.videoStatus === "partial" ||
        itinerary.videoStatus === "failed") {
        return res.json({
          status: itinerary.videoStatus,
          videoUrl: itinerary.videoUrl,
          taskId: itinerary.videoTaskId
        });
      }

      // pending 상태 (기존 단일 장면 호환)
      if (itinerary.videoTaskId && !itinerary.videoTaskId.includes(',')) {
        const taskStatus = await getVideoGenerationTask(itinerary.videoTaskId);

        if (taskStatus) {
          if (taskStatus.status === 'Succeed' && taskStatus.videoUrl) {
            await db.update(itineraries)
              .set({
                videoStatus: "succeeded",
                videoUrl: taskStatus.videoUrl
              })
              .where(eq(itineraries.id, id));

            return res.json({
              status: "succeeded",
              videoUrl: taskStatus.videoUrl,
              taskId: itinerary.videoTaskId
            });
          } else if (taskStatus.status === 'Failed') {
            await db.update(itineraries)
              .set({ videoStatus: "failed" })
              .where(eq(itineraries.id, id));

            return res.json({
              status: "failed",
              videoUrl: null,
              taskId: itinerary.videoTaskId
            });
          }
        }
      }

      res.json({
        status: itinerary.videoStatus || "pending",
        videoUrl: itinerary.videoUrl,
        taskId: itinerary.videoTaskId
      });

    } catch (error) {
      console.error("Error fetching video status:", error);
      res.status(500).json({ error: "Failed to fetch video status" });
    }
  });

  // Map HTML generator
  app.post("/api/map/html", (req, res) => {
    const { places } = req.body;
    const apiKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || "";

    if (!apiKey) {
      return res.status(400).json({ error: "Google Maps API key not configured" });
    }

    if (!places || !Array.isArray(places) || places.length === 0) {
      return res.json({ html: getEmptyMapHtml() });
    }

    const validPlaces = places.filter((p: any) => p.lat && p.lng);
    if (validPlaces.length === 0) {
      return res.json({ html: getEmptyMapHtml() });
    }

    const html = generateMapHtml(validPlaces, apiKey);
    res.json({ html });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      version: `main-${process.env.COMMIT_HASH || "local"}`,
      timestamp: new Date().toISOString(),
      services: {
        googlePlaces: !!(process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY),
        weather: !!process.env.OPENWEATHER_API_KEY,
        gemini: !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      }
    });
  });

  const httpServer = createServer(app);

  // 서버 시작 시 기본 데이터 자동 시드
  autoSeedDefaultData();

  return httpServer;
}

async function autoSeedDefaultData() {
  try {
    const [cityCount] = await db.select({ count: count() }).from(cities);
    if (cityCount.count === 0) {
      console.log('[AutoSeed] 도시 테이블이 비어있습니다. 기본 데이터를 입력합니다...');
      await seedDefaultCities();
      console.log('[AutoSeed] 도시 시드 완료');
    }
  } catch (error) {
    console.error('[AutoSeed] 자동 시드 오류:', error);
  }
}


async function seedDefaultCities() {
  const defaultCities = [
    // ===== 기존 아시아/미주 13개 =====
    { name: "서울", country: "대한민국", countryCode: "KR", latitude: 37.5665, longitude: 126.9780, timezone: "Asia/Seoul", primaryLanguage: "ko" },
    { name: "도쿄", country: "일본", countryCode: "JP", latitude: 35.6762, longitude: 139.6503, timezone: "Asia/Tokyo", primaryLanguage: "ja" },
    { name: "오사카", country: "일본", countryCode: "JP", latitude: 34.6937, longitude: 135.5023, timezone: "Asia/Tokyo", primaryLanguage: "ja" },
    { name: "파리", country: "프랑스", countryCode: "FR", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "로마", country: "이탈리아", countryCode: "IT", latitude: 41.9028, longitude: 12.4964, timezone: "Europe/Rome", primaryLanguage: "it" },
    { name: "방콕", country: "태국", countryCode: "TH", latitude: 13.7563, longitude: 100.5018, timezone: "Asia/Bangkok", primaryLanguage: "th" },
    { name: "뉴욕", country: "미국", countryCode: "US", latitude: 40.7128, longitude: -74.0060, timezone: "America/New_York", primaryLanguage: "en" },
    { name: "런던", country: "영국", countryCode: "GB", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London", primaryLanguage: "en" },
    { name: "바르셀로나", country: "스페인", countryCode: "ES", latitude: 41.3851, longitude: 2.1734, timezone: "Europe/Madrid", primaryLanguage: "es" },
    { name: "싱가포르", country: "싱가포르", countryCode: "SG", latitude: 1.3521, longitude: 103.8198, timezone: "Asia/Singapore", primaryLanguage: "en" },
    { name: "홍콩", country: "홍콩", countryCode: "HK", latitude: 22.3193, longitude: 114.1694, timezone: "Asia/Hong_Kong", primaryLanguage: "zh" },
    { name: "다낭", country: "베트남", countryCode: "VN", latitude: 16.0544, longitude: 108.2022, timezone: "Asia/Ho_Chi_Minh", primaryLanguage: "vi" },
    { name: "하노이", country: "베트남", countryCode: "VN", latitude: 21.0285, longitude: 105.8542, timezone: "Asia/Ho_Chi_Minh", primaryLanguage: "vi" },

    // ===== 유럽 30개 도시 (1차 목표) =====
    // 이탈리아
    { name: "밀라노", country: "이탈리아", countryCode: "IT", latitude: 45.4642, longitude: 9.1900, timezone: "Europe/Rome", primaryLanguage: "it" },
    { name: "피렌체", country: "이탈리아", countryCode: "IT", latitude: 43.7696, longitude: 11.2558, timezone: "Europe/Rome", primaryLanguage: "it" },
    { name: "베니스", country: "이탈리아", countryCode: "IT", latitude: 45.4408, longitude: 12.3155, timezone: "Europe/Rome", primaryLanguage: "it" },
    { name: "나폴리", country: "이탈리아", countryCode: "IT", latitude: 40.8518, longitude: 14.2681, timezone: "Europe/Rome", primaryLanguage: "it" },
    // 프랑스 (30개 관광도시 - 1차 목표)
    { name: "니스", country: "프랑스", countryCode: "FR", latitude: 43.7102, longitude: 7.2620, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "리옹", country: "프랑스", countryCode: "FR", latitude: 45.7640, longitude: 4.8357, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "마르세유", country: "프랑스", countryCode: "FR", latitude: 43.2965, longitude: 5.3698, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "보르도", country: "프랑스", countryCode: "FR", latitude: 44.8378, longitude: -0.5792, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "스트라스부르", country: "프랑스", countryCode: "FR", latitude: 48.5734, longitude: 7.7521, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "툴루즈", country: "프랑스", countryCode: "FR", latitude: 43.6047, longitude: 1.4442, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "몽펠리에", country: "프랑스", countryCode: "FR", latitude: 43.6108, longitude: 3.8767, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "낭트", country: "프랑스", countryCode: "FR", latitude: 47.2184, longitude: -1.5536, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "칸", country: "프랑스", countryCode: "FR", latitude: 43.5528, longitude: 7.0174, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "아비뇽", country: "프랑스", countryCode: "FR", latitude: 43.9493, longitude: 4.8055, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "엑상프로방스", country: "프랑스", countryCode: "FR", latitude: 43.5297, longitude: 5.4474, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "콜마르", country: "프랑스", countryCode: "FR", latitude: 48.0794, longitude: 7.3558, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "앙시", country: "프랑스", countryCode: "FR", latitude: 45.8992, longitude: 6.1294, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "디종", country: "프랑스", countryCode: "FR", latitude: 47.3220, longitude: 5.0415, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "루앙", country: "프랑스", countryCode: "FR", latitude: 49.4432, longitude: 1.0993, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "릴", country: "프랑스", countryCode: "FR", latitude: 50.6292, longitude: 3.0573, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "렌", country: "프랑스", countryCode: "FR", latitude: 48.1173, longitude: -1.6778, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "카르카손", country: "프랑스", countryCode: "FR", latitude: 43.2130, longitude: 2.3491, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "비아리츠", country: "프랑스", countryCode: "FR", latitude: 43.4832, longitude: -1.5586, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "생말로", country: "프랑스", countryCode: "FR", latitude: 48.6493, longitude: -2.0007, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "샤모니", country: "프랑스", countryCode: "FR", latitude: 45.9237, longitude: 6.8694, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "아를", country: "프랑스", countryCode: "FR", latitude: 43.6767, longitude: 4.6278, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "생트로페", country: "프랑스", countryCode: "FR", latitude: 43.2727, longitude: 6.6406, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "베르사유", country: "프랑스", countryCode: "FR", latitude: 48.8014, longitude: 2.1301, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "그르노블", country: "프랑스", countryCode: "FR", latitude: 45.1885, longitude: 5.7245, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "랭스", country: "프랑스", countryCode: "FR", latitude: 49.2583, longitude: 4.0317, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "안티브", country: "프랑스", countryCode: "FR", latitude: 43.5808, longitude: 7.1239, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "망통", country: "프랑스", countryCode: "FR", latitude: 43.7764, longitude: 7.5048, timezone: "Europe/Paris", primaryLanguage: "fr" },
    { name: "투르", country: "프랑스", countryCode: "FR", latitude: 47.3941, longitude: 0.6848, timezone: "Europe/Paris", primaryLanguage: "fr" },
    // 스페인
    { name: "마드리드", country: "스페인", countryCode: "ES", latitude: 40.4168, longitude: -3.7038, timezone: "Europe/Madrid", primaryLanguage: "es" },
    { name: "세비야", country: "스페인", countryCode: "ES", latitude: 37.3891, longitude: -5.9845, timezone: "Europe/Madrid", primaryLanguage: "es" },
    // 독일
    { name: "베를린", country: "독일", countryCode: "DE", latitude: 52.5200, longitude: 13.4050, timezone: "Europe/Berlin", primaryLanguage: "de" },
    { name: "뮌헨", country: "독일", countryCode: "DE", latitude: 48.1351, longitude: 11.5820, timezone: "Europe/Berlin", primaryLanguage: "de" },
    // 오스트리아
    { name: "빈", country: "오스트리아", countryCode: "AT", latitude: 48.2082, longitude: 16.3738, timezone: "Europe/Vienna", primaryLanguage: "de" },
    { name: "잘츠부르크", country: "오스트리아", countryCode: "AT", latitude: 47.8095, longitude: 13.0550, timezone: "Europe/Vienna", primaryLanguage: "de" },
    // 스위스
    { name: "취리히", country: "스위스", countryCode: "CH", latitude: 47.3769, longitude: 8.5417, timezone: "Europe/Zurich", primaryLanguage: "de" },
    { name: "인터라켄", country: "스위스", countryCode: "CH", latitude: 46.6863, longitude: 7.8632, timezone: "Europe/Zurich", primaryLanguage: "de" },
    { name: "루체른", country: "스위스", countryCode: "CH", latitude: 47.0502, longitude: 8.3093, timezone: "Europe/Zurich", primaryLanguage: "de" },
    // 네덜란드
    { name: "암스테르담", country: "네덜란드", countryCode: "NL", latitude: 52.3676, longitude: 4.9041, timezone: "Europe/Amsterdam", primaryLanguage: "nl" },
    // 체코
    { name: "프라하", country: "체코", countryCode: "CZ", latitude: 50.0755, longitude: 14.4378, timezone: "Europe/Prague", primaryLanguage: "cs" },
    // 포르투갈
    { name: "리스본", country: "포르투갈", countryCode: "PT", latitude: 38.7223, longitude: -9.1393, timezone: "Europe/Lisbon", primaryLanguage: "pt" },
    { name: "포르투", country: "포르투갈", countryCode: "PT", latitude: 41.1579, longitude: -8.6291, timezone: "Europe/Lisbon", primaryLanguage: "pt" },
    // 그리스
    { name: "아테네", country: "그리스", countryCode: "GR", latitude: 37.9838, longitude: 23.7275, timezone: "Europe/Athens", primaryLanguage: "el" },
    { name: "산토리니", country: "그리스", countryCode: "GR", latitude: 36.3932, longitude: 25.4615, timezone: "Europe/Athens", primaryLanguage: "el" },
    // 터키
    { name: "이스탄불", country: "터키", countryCode: "TR", latitude: 41.0082, longitude: 28.9784, timezone: "Europe/Istanbul", primaryLanguage: "tr" },
    // 크로아티아
    { name: "두브로브니크", country: "크로아티아", countryCode: "HR", latitude: 42.6507, longitude: 18.0944, timezone: "Europe/Zagreb", primaryLanguage: "hr" },
    // 헝가리
    { name: "부다페스트", country: "헝가리", countryCode: "HU", latitude: 47.4979, longitude: 19.0402, timezone: "Europe/Budapest", primaryLanguage: "hu" },
    // 영국
    { name: "에든버러", country: "영국", countryCode: "GB", latitude: 55.9533, longitude: -3.1883, timezone: "Europe/London", primaryLanguage: "en" },
    // 벨기에
    { name: "브뤼셀", country: "벨기에", countryCode: "BE", latitude: 50.8503, longitude: 4.3517, timezone: "Europe/Brussels", primaryLanguage: "fr" },
    // 덴마크
    { name: "코펜하겐", country: "덴마크", countryCode: "DK", latitude: 55.6761, longitude: 12.5683, timezone: "Europe/Copenhagen", primaryLanguage: "da" },
    // 스웨덴
    { name: "스톡홀름", country: "스웨덴", countryCode: "SE", latitude: 59.3293, longitude: 18.0686, timezone: "Europe/Stockholm", primaryLanguage: "sv" },
    // 핀란드
    { name: "헬싱키", country: "핀란드", countryCode: "FI", latitude: 60.1699, longitude: 24.9384, timezone: "Europe/Helsinki", primaryLanguage: "fi" },
    // 모나코
    { name: "모나코", country: "모나코", countryCode: "MC", latitude: 43.7384, longitude: 7.4246, timezone: "Europe/Monaco", primaryLanguage: "fr" },
    // 폴란드
    { name: "바르샤바", country: "폴란드", countryCode: "PL", latitude: 52.2297, longitude: 21.0122, timezone: "Europe/Warsaw", primaryLanguage: "pl" },
  ];

  for (const city of defaultCities) {
    try {
      await db.insert(cities).values(city).onConflictDoNothing();
    } catch (e) { }
  }
}

