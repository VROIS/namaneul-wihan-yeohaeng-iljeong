import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import { googlePlacesFetcher } from "./services/google-places";
import { weatherFetcher } from "./services/weather";
import { vibeProcessor } from "./services/vibe-processor";
import { tasteVerifier } from "./services/taste-verifier";
import { routeOptimizer } from "./services/route-optimizer";
import { scoringEngine } from "./services/scoring-engine";
import { itineraryGenerator } from "./services/itinerary-generator";
import { createVideoGenerationTask, getVideoGenerationTask } from "./services/seedance-video-generator";
import { generateVideoPrompts, generateSingleScenePrompt, type VideoPromptData } from "./services/scene-prompt-generator";
import { generateSceneDialogue } from "./services/video-dialogue-generator";
import { runVideoGenerationPipeline } from "./services/video-pipeline";
import { getTestVideoHtml } from "./test-video-ui";
import { registerAdminRoutes } from "./admin-routes";
import { db } from "./db";
import { instagramHashtags, cities, youtubeChannels, verificationRequests, itineraries } from "../shared/schema";
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

  // Places
  app.get("/api/cities/:cityId/places", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const type = req.query.type as string | undefined;
      const places = await storage.getPlacesByCity(cityId, type);
      res.json(places);
    } catch (error) {
      console.error("Error fetching places:", error);
      res.status(500).json({ error: "Failed to fetch places" });
    }
  });

  app.get("/api/places/:id", async (req, res) => {
    try {
      const place = await storage.getPlace(parseInt(req.params.id));
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }

      const dataSources = await storage.getPlaceDataSources(place.id);
      const vibeAnalysis = await storage.getVibeAnalysis(place.id);

      res.json({ ...place, dataSources, vibeAnalysis });
    } catch (error) {
      console.error("Error fetching place:", error);
      res.status(500).json({ error: "Failed to fetch place" });
    }
  });

  // Top recommendations
  app.get("/api/cities/:cityId/recommendations", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const type = (req.query.type as string) || "restaurant";
      const limit = parseInt(req.query.limit as string) || 10;
      const persona = (req.query.persona as "luxury" | "comfort") || "comfort";

      const recommendations = await scoringEngine.getTopRecommendations(
        cityId,
        type as any,
        limit,
        persona
      );

      res.json(recommendations);
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  // Data sync endpoints
  app.post("/api/sync/city/:cityId/places", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const city = await storage.getCity(cityId);

      if (!city) {
        return res.status(404).json({ error: "City not found" });
      }

      const types = req.body.types || ["restaurant", "attraction"];
      const result = await googlePlacesFetcher.syncCityPlaces(
        cityId,
        city.latitude,
        city.longitude,
        types
      );

      res.json({ message: "Sync completed", ...result });
    } catch (error) {
      console.error("Error syncing places:", error);
      res.status(500).json({ error: "Failed to sync places" });
    }
  });

  app.post("/api/sync/city/:cityId/scores", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const result = await scoringEngine.processCity(cityId);
      res.json({ message: "Scoring completed", ...result });
    } catch (error) {
      console.error("Error processing scores:", error);
      res.status(500).json({ error: "Failed to process scores" });
    }
  });

  app.post("/api/sync/place/:placeId/vibe", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const result = await vibeProcessor.processPlaceVibe(placeId);
      res.json({ message: "Vibe processing completed", ...result });
    } catch (error) {
      console.error("Error processing vibe:", error);
      res.status(500).json({ error: "Failed to process vibe" });
    }
  });

  app.post("/api/sync/place/:placeId/taste", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const result = await tasteVerifier.verifyRestaurant(placeId);
      res.json({ message: "Taste verification completed", ...result });
    } catch (error) {
      console.error("Error verifying taste:", error);
      res.status(500).json({ error: "Failed to verify taste" });
    }
  });

  // Weather
  app.get("/api/cities/:cityId/weather", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const weather = await weatherFetcher.getWeatherForCity(cityId);

      if (!weather) {
        return res.status(404).json({ error: "Weather data not available" });
      }

      res.json({
        ...weather,
        description: weatherFetcher.getWeatherDescription(weather.weatherCondition || ""),
        severity: weatherFetcher.getPenaltySeverity(weather.penalty || 0),
      });
    } catch (error) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ error: "Failed to fetch weather" });
    }
  });

  // Reality checks
  app.get("/api/cities/:cityId/reality-checks", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const checks = await storage.getActiveRealityChecks(cityId);
      res.json(checks);
    } catch (error) {
      console.error("Error fetching reality checks:", error);
      res.status(500).json({ error: "Failed to fetch reality checks" });
    }
  });

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
      let enrichedFormData = { ...formData };

      if (formData.userId) {
        try {
          const [user] = await db.select({
            birthDate: users.birthDate,
            displayName: users.displayName,
            preferredVibes: users.preferredVibes,
          }).from(users).where(eq(users.id, formData.userId));

          if (user) {
            // DB에서 가져온 사용자 정보 병합
            enrichedFormData = {
              ...formData,
              birthDate: user.birthDate,  // 🎯 핵심: 가족 연령 추정용
              userDisplayName: user.displayName,
              // preferredVibes는 프론트에서 선택한 vibes 우선
            };

            console.log(`[Routes] 🎯 사용자 정보 조회 완료: userId=${formData.userId}, birthDate=${user.birthDate}`);
          }
        } catch (userError) {
          console.warn("[Routes] 사용자 정보 조회 실패 (계속 진행):", userError);
        }
      }

      const itinerary = await itineraryGenerator.generate(enrichedFormData);
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

  // Route optimization
  app.post("/api/routes/optimize", async (req, res) => {
    try {
      const { placeIds, travelMode = "TRANSIT" } = req.body;

      if (!placeIds || !Array.isArray(placeIds) || placeIds.length === 0) {
        return res.status(400).json({ error: "placeIds array is required" });
      }

      const places = await Promise.all(
        placeIds.map((id: number) => storage.getPlace(id))
      );

      const validPlaces = places.filter(Boolean);
      if (validPlaces.length === 0) {
        return res.status(404).json({ error: "No valid places found" });
      }

      const result = await routeOptimizer.optimizeRoute(validPlaces as any[], travelMode);

      res.json({
        ...result,
        formattedDuration: routeOptimizer.formatDuration(result.totalDurationSeconds),
        formattedDistance: routeOptimizer.formatDistance(result.totalDistanceMeters),
      });
    } catch (error) {
      console.error("Error optimizing route:", error);
      res.status(500).json({ error: "Failed to optimize route" });
    }
  });

  app.post("/api/routes/compare", async (req, res) => {
    try {
      const { placeIds } = req.body;

      if (!placeIds || !Array.isArray(placeIds) || placeIds.length === 0) {
        return res.status(400).json({ error: "placeIds array is required" });
      }

      const places = await Promise.all(
        placeIds.map((id: number) => storage.getPlace(id))
      );

      const validPlaces = places.filter(Boolean);
      const comparison = await routeOptimizer.compareTransportModes(validPlaces as any[]);

      const formattedComparison: Record<string, any> = {};
      for (const [mode, result] of Object.entries(comparison)) {
        formattedComparison[mode] = {
          ...result,
          formattedDuration: routeOptimizer.formatDuration(result.totalDurationSeconds),
          formattedDistance: routeOptimizer.formatDistance(result.totalDistanceMeters),
        };
      }

      res.json(formattedComparison);
    } catch (error) {
      console.error("Error comparing routes:", error);
      res.status(500).json({ error: "Failed to compare routes" });
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

  app.get("/api/itineraries/:id", async (req, res) => {
    try {
      const itinerary = await storage.getItinerary(parseInt(req.params.id));
      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }

      const items = await storage.getItineraryItems(itinerary.id);
      const itemsWithPlaces = await Promise.all(
        items.map(async (item) => {
          const place = await storage.getPlace(item.placeId);
          return { ...item, place };
        })
      );

      res.json({ ...itinerary, items: itemsWithPlaces });
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

  // 🎬 영상 프롬프트 미리보기 API (Gemini로 장면별 대사/프롬프트 생성)
  app.get("/api/itineraries/:id/video/prompts", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const itinerary = await storage.getItinerary(id);

      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }

      // 일정표 아이템 조회
      const items = await storage.getItineraryItems(id);
      const city = await storage.getCity(itinerary.cityId);

      // VideoPromptData 생성을 위한 데이터 구성
      const itineraryData = {
        id: itinerary.id,
        destination: city?.name || 'Paris',
        startDate: itinerary.startDate?.toString() || new Date().toISOString(),
        endDate: itinerary.endDate?.toString() || new Date().toISOString(),
        curationFocus: (itinerary.curationFocus as any) || 'Everyone',
        companionType: itinerary.companionType || 'Family',
        companionCount: itinerary.companionCount || 4,
        companionAges: itinerary.companionAges || undefined,
        vibes: itinerary.vibes || ['Family', 'Culture'],
        travelPace: (itinerary.travelPace as any) || 'Normal',
        travelStyle: (itinerary.travelStyle as any) || 'Reasonable',
        mobilityStyle: (itinerary.mobilityStyle as any) || 'Moderate',
        userBirthDate: itinerary.userBirthDate || undefined,
        userGender: (itinerary.userGender as any) || 'M',
        items: items.map(item => ({
          day: item.day,
          slotNumber: item.slotNumber,
          placeName: item.placeName || '장소',
          placeType: item.type || 'attraction',
          startTime: item.startTime || '09:00',
          endTime: item.endTime || '10:00',
          description: item.description || ''
        }))
      };

      console.log(`[Video Prompts] Generating prompts for itinerary #${id}...`);

      const videoPrompts = await generateVideoPrompts(itineraryData);

      res.json({
        success: true,
        data: videoPrompts,
        message: `${videoPrompts.dayCount}일 여행에 대한 영상 프롬프트가 생성되었습니다.`
      });

    } catch (error) {
      console.error("Error generating video prompts:", error);
      res.status(500).json({ error: "Failed to generate video prompts" });
    }
  });

  // 🎬 단일 장면 프롬프트 테스트 API
  app.post("/api/video/test-prompt", async (req, res) => {
    try {
      const { placeName, curationFocus, vibes, destination } = req.body;

      if (!placeName) {
        return res.status(400).json({ error: "placeName is required" });
      }

      const scenePrompt = await generateSingleScenePrompt(
        placeName,
        curationFocus || 'Kids',
        vibes || ['Family', 'Culture'],
        destination || 'Paris'
      );

      res.json({
        success: true,
        data: scenePrompt
      });

    } catch (error) {
      console.error("Error generating test prompt:", error);
      res.status(500).json({ error: "Failed to generate test prompt" });
    }
  });

  // 🎬 영상 생성 시작 (기존 API 개선 - scene-prompt-generator 연동)
  app.post("/api/itineraries/:id/video/generate", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const itinerary = await storage.getItinerary(id);

      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }

      // 일정표 아이템 조회
      // 🩹 [2026-01-26] rawData(JSONB) 우선 사용 (생성 당시의 모든 정보 보존)
      const rawData = itinerary.rawData as any;
      let itineraryItems: any[] = [];

      if (rawData && rawData.days && Array.isArray(rawData.days)) {
        // rawData에서 items 추출
        console.log(`[Video] 🎯 저장된 rawData 사용 (원본 장소 정보 복원)`);
        itineraryItems = rawData.days.flatMap((day: any) =>
          day.places.map((place: any, index: number) => ({
            day: day.day,
            slotNumber: index + 1,
            placeName: place.name,
            placeType: place.placeTypes?.[0] || 'attraction',
            startTime: place.startTime || '09:00',
            endTime: place.endTime || '10:00',
            description: place.description || ''
          }))
        );
      } else {
        // 기존 items 조회
        const dbItems = await storage.getItineraryItems(id);
        itineraryItems = dbItems;
      }

      const city = await storage.getCity(itinerary.cityId);

      // 🔧 일정 아이템이 없으면 기본 더미 데이터 생성 (테스트용)
      const defaultItems = itineraryItems.length > 0 ? itineraryItems : [
        { day: 1, slotNumber: 1, placeName: '에펠탑', type: 'landmark', startTime: '09:00', endTime: '10:30', description: '파리의 상징' },
        { day: 1, slotNumber: 2, placeName: '루브르 박물관', type: 'museum', startTime: '11:00', endTime: '13:00', description: '세계 최대 미술관' },
        { day: 1, slotNumber: 3, placeName: '카페 마를리', type: 'restaurant', startTime: '13:30', endTime: '14:30', description: '루브르 레스토랑' },
        { day: 1, slotNumber: 4, placeName: '샹젤리제 거리', type: 'attraction', startTime: '15:00', endTime: '17:00', description: '유명한 쇼핑가' },
        { day: 1, slotNumber: 5, placeName: '개선문', type: 'landmark', startTime: '17:30', endTime: '18:30', description: '나폴레옹 승전 기념' },
        { day: 1, slotNumber: 6, placeName: '세느강 유람선', type: 'attraction', startTime: '19:00', endTime: '20:30', description: '야경 크루즈' },
      ];

      console.log(`[Video] 아이템 수: ${defaultItems.length}개 (출처: ${rawData?.days ? 'rawData' : 'DB Items'})`);

      // 🎬 scene-prompt-generator를 사용하여 표준화된 프롬프트 생성
      const itineraryData = {
        id: itinerary.id,
        destination: city?.name || 'Paris',
        startDate: itinerary.startDate?.toString() || new Date().toISOString(),
        endDate: itinerary.endDate?.toString() || new Date().toISOString(),
        curationFocus: (itinerary.curationFocus as any) || 'Everyone',
        companionType: itinerary.companionType || 'Family',
        companionCount: itinerary.companionCount || 4,
        companionAges: itinerary.companionAges || undefined,
        vibes: itinerary.vibes || ['Family', 'Culture'],
        travelPace: (itinerary.travelPace as any) || 'Normal',
        travelStyle: (itinerary.travelStyle as any) || 'Reasonable',
        mobilityStyle: (itinerary.mobilityStyle as any) || 'Moderate',
        userBirthDate: itinerary.userBirthDate || undefined,
        userGender: (itinerary.userGender as any) || 'M',
        items: defaultItems.map((item: any) => ({
          day: item.day,
          slotNumber: item.slotNumber,
          placeName: item.placeName || '장소',
          placeType: item.placeType || item.type || 'attraction', // type도 허용
          startTime: item.startTime || '09:00',
          endTime: item.endTime || '10:00',
          description: item.description || ''
        }))
      };

      console.log(`[Video] Generating video prompts for itinerary #${id}...`);

      // Gemini로 장면별 프롬프트 생성
      const videoPrompts = await generateVideoPrompts(itineraryData);

      // ⏱️ travelPace에 따른 클립 설정
      // Relaxed: 4장면 x 15초 = 60초
      // Normal: 6장면 x 10초 = 60초  
      // Packed: 8장면 x 8초 = 64초
      const clipConfig: Record<string, { clips: number; duration: number }> = {
        Relaxed: { clips: 4, duration: 15 },
        Normal: { clips: 6, duration: 10 },
        Packed: { clips: 8, duration: 8 }
      };
      const config = clipConfig[itineraryData.travelPace] || clipConfig.Normal;

      // 모든 장면 수집 (일별로 펼치기)
      const allScenes: Array<{ prompt: string; dialogue: any; mood: string }> = [];
      for (const day of videoPrompts.days) {
        for (const scene of day.scenes) {
          allScenes.push(scene);
        }
      }

      // 필요한 장면 수만큼 자르기 (travelPace에 따라)
      const scenesToGenerate = allScenes.slice(0, config.clips);

      if (scenesToGenerate.length === 0) {
        return res.status(400).json({ error: "No scenes available to generate video" });
      }

      console.log(`[Video] 🎬 다중 장면 순차 생성 시작: ${scenesToGenerate.length}개 장면, 각 ${config.duration}초`);

      // DB 상태 업데이트 (processing)
      await db.update(itineraries)
        .set({
          videoStatus: "processing"
        })
        .where(eq(itineraries.id, id));

      // 클라이언트에 즉시 응답 (비동기 처리)
      res.json({
        success: true,
        status: "processing",
        totalScenes: scenesToGenerate.length,
        clipDuration: config.duration,
        estimatedTime: `약 ${Math.ceil(scenesToGenerate.length * 30 / 60)}분`,
        videoPrompts: videoPrompts,
        message: `영상 생성이 시작되었습니다. ${scenesToGenerate.length}개 장면 순차 생성 중...`
      });

      // 🔄 백그라운드에서 순차 생성 (응답 후 처리)
      (async () => {
        const taskIds: string[] = [];
        const videoUrls: string[] = [];
        let hasError = false;

        for (let i = 0; i < scenesToGenerate.length; i++) {
          const scene = scenesToGenerate[i];

          // 프롬프트에 한국어 대사 포함
          const fullPrompt = `${scene.prompt}
The main character says in Korean: "${scene.dialogue.protagonist}"
Studio Ghibli animation style, warm colors, soft lighting.
High quality, 4k, professional animation.`;

          console.log(`[Video] 📹 장면 ${i + 1}/${scenesToGenerate.length} 생성 시작...`);

          try {
            const result = await createVideoGenerationTask({
              prompt: fullPrompt,
              duration: config.duration, // travelPace에 따른 클립 길이 (8-15초)
              aspectRatio: "9:16",
            });

            if (result.success && result.taskId) {
              taskIds.push(result.taskId);
              console.log(`[Video] ✅ 장면 ${i + 1} Task 생성: ${result.taskId}`);

              // 장면별 완료 대기 (폴링)
              let attempts = 0;
              const maxAttempts = 60; // 최대 5분 대기

              while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기

                const status = await getVideoGenerationTask(result.taskId);
                console.log(`[Video] 장면 ${i + 1} 상태: ${status.status}`);

                if (status.status === 'Succeed' && status.videoUrl) {
                  videoUrls.push(status.videoUrl);
                  console.log(`[Video] ✅ 장면 ${i + 1} 완료: ${status.videoUrl}`);
                  break;
                } else if (status.status === 'Failed') {
                  console.error(`[Video] ❌ 장면 ${i + 1} 실패`);
                  hasError = true;
                  break;
                }
                attempts++;
              }

              if (attempts >= maxAttempts) {
                console.error(`[Video] ⏰ 장면 ${i + 1} 타임아웃`);
                hasError = true;
              }
            } else {
              console.error(`[Video] ❌ 장면 ${i + 1} Task 생성 실패`);
              hasError = true;
            }
          } catch (error) {
            console.error(`[Video] ❌ 장면 ${i + 1} 오류:`, error);
            hasError = true;
          }

          // 에러 발생 시 중단
          if (hasError) break;

          // Rate limit 방지: 다음 장면 생성 전 2초 대기
          if (i < scenesToGenerate.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // 최종 결과 DB 업데이트
        if (videoUrls.length > 0) {
          // 첫 번째 영상 URL을 대표로 저장 (추후 합성 영상으로 교체)
          await db.update(itineraries)
            .set({
              videoTaskId: taskIds.join(','),
              videoStatus: hasError ? "partial" : "succeeded",
              videoUrl: videoUrls[0] // 대표 영상
            })
            .where(eq(itineraries.id, id));

          console.log(`[Video] 🎉 전체 영상 생성 완료: ${videoUrls.length}/${scenesToGenerate.length} 성공`);
        } else {
          await db.update(itineraries)
            .set({
              videoStatus: "failed"
            })
            .where(eq(itineraries.id, id));

          console.error(`[Video] ❌ 전체 영상 생성 실패`);
        }
      })();

    } catch (error) {
      console.error("Error starting video generation:", error);
      res.status(500).json({ error: "Failed to start video generation" });
    }
  });

  // ========================================
  // 🎬 임시 테스트용 영상 생성 API (DB 저장 없음)
  // ========================================

  /**
   * POST /api/video/generate-direct
   * 
   * 일정 데이터를 직접 Body로 받아서 영상 프롬프트 생성 + Seedance 호출
   * DB 저장 로직 확정 전에 영상 파이프라인을 테스트할 수 있는 임시 API
   * 
   * Request Body 예시:
   * {
   *   "destination": "파리, 프랑스",
   *   "startDate": "2026-02-01",
   *   "endDate": "2026-02-03",
   *   "curationFocus": "Kids",
   *   "companionType": "Family",
   *   "companionCount": 4,
   *   "vibes": ["Healing", "Foodie"],
   *   "travelPace": "Normal",
   *   "travelStyle": "Reasonable",
   *   "mobilityStyle": "Moderate",
   *   "userBirthDate": "1985-06-15",
   *   "userGender": "M",
   *   "items": [
   *     { "day": 1, "slotNumber": 1, "placeName": "에펠탑", "placeType": "landmark", "startTime": "09:00", "endTime": "11:00" },
   *     { "day": 1, "slotNumber": 2, "placeName": "루브르 박물관", "placeType": "museum", "startTime": "11:30", "endTime": "14:00" }
   *   ]
   * }
   */
  app.post("/api/video/generate-direct", async (req, res) => {
    try {
      const {
        destination,
        startDate,
        endDate,
        curationFocus = 'Everyone',
        companionType = 'Family',
        companionCount = 2,
        vibes = ['Family', 'Culture'],
        travelPace = 'Normal',
        travelStyle = 'Reasonable',
        mobilityStyle = 'Moderate',
        userBirthDate,
        userGender = 'M',
        items = []
      } = req.body;

      // 필수 필드 검증
      if (!destination) {
        return res.status(400).json({ error: "destination is required" });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required and must not be empty" });
      }

      console.log(`[Video Direct] 직접 영상 생성 요청: ${destination}, ${items.length}개 장소`);

      // VideoPromptData용 일정 데이터 구성 (DB 없이 직접 생성)
      const itineraryData = {
        id: 0, // 임시 ID (DB 저장 안 함)
        destination,
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || new Date().toISOString().split('T')[0],
        curationFocus: curationFocus as 'Kids' | 'Parents' | 'Self' | 'Everyone',
        companionType,
        companionCount,
        companionAges: undefined,
        vibes,
        travelPace: travelPace as 'Relaxed' | 'Normal' | 'Packed',
        travelStyle: travelStyle as 'Luxury' | 'Premium' | 'Reasonable' | 'Economic',
        mobilityStyle: mobilityStyle as 'Minimal' | 'Moderate' | 'WalkMore',
        userBirthDate,
        userGender: userGender as 'M' | 'F',
        items: items.map((item: any, index: number) => ({
          day: item.day || 1,
          slotNumber: item.slotNumber || index + 1,
          placeName: item.placeName || `장소 ${index + 1}`,
          placeType: item.placeType || 'attraction',
          startTime: item.startTime || '09:00',
          endTime: item.endTime || '10:00',
          description: item.description || ''
        }))
      };

      console.log(`[Video Direct] Gemini로 영상 프롬프트 생성 중...`);

      // 1. Gemini로 장면별 프롬프트 생성
      const videoPrompts = await generateVideoPrompts(itineraryData);

      console.log(`[Video Direct] 프롬프트 생성 완료: ${videoPrompts.dayCount}일, ${videoPrompts.days.reduce((sum, d) => sum + d.scenes.length, 0)}개 장면`);

      // 2. 첫 번째 장면으로 Seedance 영상 생성 (MVP)
      const firstScene = videoPrompts.days[0]?.scenes[0];

      if (!firstScene) {
        return res.status(400).json({ error: "No scenes available to generate video" });
      }

      // 프롬프트에 한국어 대사 포함
      const fullPrompt = `${firstScene.prompt}
The main character says in Korean: "${firstScene.dialogue.protagonist}"
Studio Ghibli animation style, warm colors, soft lighting, joyful expressions.
High quality, 4k, professional animation.`;

      console.log(`[Video Direct] Seedance 영상 생성 시작: ${fullPrompt.substring(0, 100)}...`);

      // 3. Seedance 비동기 작업 생성
      const result = await createVideoGenerationTask({
        prompt: fullPrompt,
        duration: 60, // 🎬 강제 60초 (1분)
        aspectRatio: "9:16",
        modelId: "seedance-1-5-pro-251215"
      });

      if (!result.success || !result.taskId) {
        console.error(`[Video Direct] Seedance 영상 생성 실패:`, result.error);
        return res.status(500).json({
          success: false,
          error: "Failed to start video generation",
          details: result.error,
          videoPrompts // 프롬프트는 반환 (디버깅용)
        });
      }

      console.log(`[Video Direct] Seedance 작업 생성 완료: taskId=${result.taskId}`);

      // 4. 성공 응답 (DB 저장 없음)
      res.json({
        success: true,
        taskId: result.taskId,
        status: "pending",
        videoPrompts,
        message: `영상 생성이 시작되었습니다. 주인공: ${videoPrompts.protagonist.type} (${videoPrompts.protagonist.age}세)`,
        note: "⚠️ 이 API는 테스트용입니다. 결과는 DB에 저장되지 않습니다. GET /api/video/task/:taskId로 상태를 확인하세요."
      });

    } catch (error) {
      console.error("[Video Direct] Error:", error);
      res.status(500).json({ error: "Failed to generate video", details: String(error) });
    }
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
      version: `cursor-dev-${process.env.COMMIT_HASH || "local"}`,
      timestamp: new Date().toISOString(),
      services: {
        googlePlaces: !!(process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY),
        weather: !!process.env.OPENWEATHER_API_KEY,
        gemini: !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      }
    });
  });

  // Verification Request APIs
  app.post("/api/verification/request", async (req, res) => {
    try {
      const { userId, itineraryData, userMessage, preferredDate, contactEmail, contactKakao } = req.body;

      if (!userId || !itineraryData) {
        return res.status(400).json({ error: "userId and itineraryData are required" });
      }

      const [request] = await db.insert(verificationRequests).values({
        itineraryId: itineraryData.id || 0,
        userId,
        itineraryData,
        userMessage,
        preferredDate: preferredDate ? new Date(preferredDate) : null,
        contactEmail,
        contactKakao,
        status: "pending",
      }).returning();

      res.json({ success: true, requestId: request.id });
    } catch (error) {
      console.error("Error creating verification request:", error);
      res.status(500).json({ error: "Failed to create verification request" });
    }
  });

  app.get("/api/verification/requests", async (req, res) => {
    try {
      const { userId, status } = req.query;

      let query = db.select().from(verificationRequests);

      if (userId) {
        query = query.where(eq(verificationRequests.userId, userId as string));
      }

      const requests = await query.orderBy(desc(verificationRequests.createdAt));
      res.json(requests);
    } catch (error) {
      console.error("Error fetching verification requests:", error);
      res.status(500).json({ error: "Failed to fetch verification requests" });
    }
  });

  app.get("/api/verification/requests/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const [request] = await db.select().from(verificationRequests).where(eq(verificationRequests.id, parseInt(id)));

      if (!request) {
        return res.status(404).json({ error: "Verification request not found" });
      }

      res.json(request);
    } catch (error) {
      console.error("Error fetching verification request:", error);
      res.status(500).json({ error: "Failed to fetch verification request" });
    }
  });

  app.patch("/api/verification/requests/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminComment, placeRatings } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (status) updateData.status = status;
      if (adminComment !== undefined) updateData.adminComment = adminComment;
      if (placeRatings) updateData.placeRatings = placeRatings;
      if (status === "verified" || status === "rejected") {
        updateData.reviewedAt = new Date();
      }

      const [updated] = await db.update(verificationRequests)
        .set(updateData)
        .where(eq(verificationRequests.id, parseInt(id)))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating verification request:", error);
      res.status(500).json({ error: "Failed to update verification request" });
    }
  });

  const httpServer = createServer(app);

  // 서버 시작 시 기본 데이터 자동 시드
  autoSeedDefaultData();

  return httpServer;
}

async function autoSeedDefaultData() {
  try {
    // 해시태그 테이블이 비어있으면 자동 시드
    const [hashtagCount] = await db.select({ count: count() }).from(instagramHashtags);
    if (hashtagCount.count === 0) {
      console.log('[AutoSeed] Instagram 해시태그 테이블이 비어있습니다. 기본 데이터를 입력합니다...');
      await seedDefaultInstagramHashtags();
      console.log('[AutoSeed] Instagram 해시태그 시드 완료');
    }

    // 도시 테이블이 비어있으면 자동 시드
    const [cityCount] = await db.select({ count: count() }).from(cities);
    if (cityCount.count === 0) {
      console.log('[AutoSeed] 도시 테이블이 비어있습니다. 기본 데이터를 입력합니다...');
      await seedDefaultCities();
      console.log('[AutoSeed] 도시 시드 완료');
    }

    // YouTube 채널 테이블이 비어있으면 자동 시드
    const [channelCount] = await db.select({ count: count() }).from(youtubeChannels);
    if (channelCount.count === 0) {
      console.log('[AutoSeed] YouTube 채널 테이블이 비어있습니다. 기본 데이터를 입력합니다...');
      await seedDefaultYouTubeChannels();
      console.log('[AutoSeed] YouTube 채널 시드 완료');
    }
  } catch (error) {
    console.error('[AutoSeed] 자동 시드 오류:', error);
  }
}

async function seedDefaultInstagramHashtags() {
  const defaultHashtags = [
    { hashtag: "#에펠탑", category: "landmark" },
    { hashtag: "#toureiffel", category: "landmark" },
    { hashtag: "#파리여행", category: "travel" },
    { hashtag: "#파리맛집", category: "food" },
    { hashtag: "#도쿄타워", category: "landmark" },
    { hashtag: "#도쿄여행", category: "travel" },
    { hashtag: "#도쿄맛집", category: "food" },
    { hashtag: "#시부야", category: "landmark" },
    { hashtag: "#센소지", category: "landmark" },
    { hashtag: "#오사카여행", category: "travel" },
    { hashtag: "#오사카맛집", category: "food" },
    { hashtag: "#도톤보리", category: "landmark" },
    { hashtag: "#서울여행", category: "travel" },
    { hashtag: "#서울맛집", category: "food" },
    { hashtag: "#경복궁", category: "landmark" },
    { hashtag: "#남산타워", category: "landmark" },
    { hashtag: "#홍대", category: "landmark" },
    { hashtag: "#로마여행", category: "travel" },
    { hashtag: "#콜로세움", category: "landmark" },
    { hashtag: "#방콕여행", category: "travel" },
    { hashtag: "#방콕맛집", category: "food" },
    { hashtag: "#뉴욕여행", category: "travel" },
    { hashtag: "#타임스퀘어", category: "landmark" },
    { hashtag: "#런던여행", category: "travel" },
    { hashtag: "#빅벤", category: "landmark" },
    { hashtag: "#바르셀로나여행", category: "travel" },
    { hashtag: "#사그라다파밀리아", category: "landmark" },
    { hashtag: "#싱가포르여행", category: "travel" },
    { hashtag: "#마리나베이샌즈", category: "landmark" },
    { hashtag: "#홍콩여행", category: "travel" },
    { hashtag: "#다낭여행", category: "travel" },
    { hashtag: "#하노이여행", category: "travel" },
  ];

  for (const tag of defaultHashtags) {
    try {
      await db.insert(instagramHashtags).values(tag).onConflictDoNothing();
    } catch (e) { }
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

async function seedDefaultYouTubeChannels() {
  const defaultChannels = [
    { channelId: "UC3mY_QDRF9lQvd_wXKfn", channelName: "성시경", channelUrl: "https://www.youtube.com/@sungsikyung", category: "food", trustWeight: 2.0 },
    { channelId: "UC_BAEK_JONGWON", channelName: "백종원", channelUrl: "https://www.youtube.com/@paaborns", category: "food", trustWeight: 2.0 },
    { channelId: "UCGrJqBQRypR7BMVp7lwnUUQ", channelName: "스트릿푸드파이터", channelUrl: "https://www.youtube.com/@StreetFoodFighter", category: "food", trustWeight: 2.0 },
    { channelId: "UCsJ6RuBiTVLvNWb56-wr_aQ", channelName: "빠니보틀", channelUrl: "https://www.youtube.com/@ppanibottle", category: "travel", trustWeight: 1.9 },
    { channelId: "UC_PARIS_OINOJA", channelName: "파리외노자", channelUrl: "https://www.youtube.com/@parisnoja", category: "travel", trustWeight: 1.9 },
  ];

  for (const channel of defaultChannels) {
    try {
      await db.insert(youtubeChannels).values(channel).onConflictDoNothing();
    } catch (e) { }
  }
}
