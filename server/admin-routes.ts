import type { Express } from "express";
import { db } from "./db";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { 
  apiServiceStatus, 
  youtubeChannels, 
  youtubeVideos,
  blogSources, 
  exchangeRates,
  dataCollectionSchedule,
  dataSyncLog,
  cities,
  places,
  placeDataSources,
  reviews
} from "../shared/schema";
import { eq, desc, sql, count, and, gte } from "drizzle-orm";

export function registerAdminRoutes(app: Express) {
  
  app.get("/admin", (req, res) => {
    const templatePath = path.join(__dirname, "templates", "admin-dashboard.html");
    if (fs.existsSync(templatePath)) {
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  });
  
  // ========================================
  // 대시보드 현황 API
  // ========================================
  
  app.get("/api/admin/dashboard", async (req, res) => {
    try {
      const [
        apiServices,
        cityCount,
        placeCount,
        channelCount,
        blogCount,
        recentSyncs
      ] = await Promise.all([
        db.select().from(apiServiceStatus).orderBy(apiServiceStatus.serviceName),
        db.select({ count: count() }).from(cities),
        db.select({ count: count() }).from(places),
        db.select({ count: count() }).from(youtubeChannels).where(eq(youtubeChannels.isActive, true)),
        db.select({ count: count() }).from(blogSources).where(eq(blogSources.isActive, true)),
        db.select().from(dataSyncLog).orderBy(desc(dataSyncLog.startedAt)).limit(10)
      ]);
      
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const [freshDataCount] = await db
        .select({ count: count() })
        .from(places)
        .where(gte(places.lastDataSync, sevenDaysAgo));
      
      res.json({
        overview: {
          cities: cityCount[0]?.count || 0,
          places: placeCount[0]?.count || 0,
          youtubeChannels: channelCount[0]?.count || 0,
          blogSources: blogCount[0]?.count || 0,
          freshDataRatio: placeCount[0]?.count 
            ? Math.round((freshDataCount.count / placeCount[0].count) * 100) 
            : 0
        },
        apiServices,
        recentSyncs
      });
    } catch (error) {
      console.error("Admin dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  // ========================================
  // API 서비스 상태
  // ========================================
  
  app.get("/api/admin/api-services", async (req, res) => {
    try {
      const dbServices = await db.select().from(apiServiceStatus);
      
      const getRealtimeConfigured = (serviceName: string): boolean => {
        switch (serviceName) {
          case "google_places":
          case "google_maps":
            return !!(process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY);
          case "openweather":
            return !!process.env.OPENWEATHER_API_KEY;
          case "youtube_data":
            return !!process.env.YOUTUBE_API_KEY;
          case "exchange_rate":
            return true;
          case "gemini":
            return !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
          default:
            return false;
        }
      };

      const services = dbServices.map(service => ({
        ...service,
        isConfigured: getRealtimeConfigured(service.serviceName),
        healthStatus: getServiceHealthStatus(service),
      }));
      
      const envStatus = {
        GOOGLE_MAPS_API_KEY: !!(process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY),
        OPENWEATHER_API_KEY: !!process.env.OPENWEATHER_API_KEY,
        YOUTUBE_API_KEY: !!process.env.YOUTUBE_API_KEY,
        EXCHANGE_RATE_API_KEY: true,
        AI_INTEGRATIONS_GEMINI_API_KEY: !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      };
      
      res.json({ services, envStatus });
    } catch (error) {
      console.error("Error fetching API services:", error);
      res.status(500).json({ error: "Failed to fetch API services" });
    }
  });

  function getServiceHealthStatus(service: typeof apiServiceStatus.$inferSelect): {
    status: "healthy" | "warning" | "error" | "unknown";
    message: string;
    lastCall: string | null;
    errorMessage: string | null;
  } {
    const lastCall = service.lastCallAt ? new Date(service.lastCallAt).toISOString() : null;
    const errorMessage = service.lastErrorMessage || null;
    
    if (!service.lastCallAt) {
      return { status: "unknown", message: "아직 호출되지 않음", lastCall, errorMessage };
    }
    
    if (service.lastErrorAt && service.lastSuccessAt) {
      if (new Date(service.lastErrorAt) > new Date(service.lastSuccessAt)) {
        return { 
          status: "error", 
          message: service.lastErrorMessage || "마지막 호출 실패",
          lastCall,
          errorMessage
        };
      }
    } else if (service.lastErrorAt && !service.lastSuccessAt) {
      return { 
        status: "error", 
        message: service.lastErrorMessage || "마지막 호출 실패",
        lastCall,
        errorMessage
      };
    }
    
    const lastCallDate = new Date(service.lastCallAt);
    const hoursSinceLastCall = (Date.now() - lastCallDate.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceLastCall > 24) {
      return { status: "warning", message: `${Math.floor(hoursSinceLastCall)}시간 전 마지막 호출`, lastCall, errorMessage };
    }
    
    return { status: "healthy", message: "정상 작동 중", lastCall, errorMessage };
  }
  
  app.post("/api/admin/api-services/init", async (req, res) => {
    try {
      const defaultServices = [
        { serviceName: "google_places", displayName: "Google Places API", dailyQuota: 5000, monthlyQuota: null },
        { serviceName: "google_maps", displayName: "Google Maps API", dailyQuota: null, monthlyQuota: 28500 },
        { serviceName: "openweather", displayName: "OpenWeather API", dailyQuota: 1000, monthlyQuota: null },
        { serviceName: "youtube_data", displayName: "YouTube Data API", dailyQuota: 10000, monthlyQuota: null },
        { serviceName: "exchange_rate", displayName: "Exchange Rate API", dailyQuota: null, monthlyQuota: 1500 },
        { serviceName: "gemini", displayName: "Gemini AI", dailyQuota: null, monthlyQuota: null },
      ];
      
      for (const service of defaultServices) {
        const isConfigured = (() => {
          switch (service.serviceName) {
            case "google_places":
            case "google_maps":
              return !!(process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY);
            case "openweather":
              return !!process.env.OPENWEATHER_API_KEY;
            case "youtube_data":
              return !!process.env.YOUTUBE_API_KEY;
            case "exchange_rate":
              return true;
            case "gemini":
              return !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
            default:
              return false;
          }
        })();
        
        await db
          .insert(apiServiceStatus)
          .values({ ...service, isConfigured })
          .onConflictDoUpdate({
            target: apiServiceStatus.serviceName,
            set: { isConfigured, displayName: service.displayName }
          });
      }
      
      res.json({ message: "API services initialized" });
    } catch (error) {
      console.error("Error initializing API services:", error);
      res.status(500).json({ error: "Failed to initialize API services" });
    }
  });

  // ========================================
  // API 실시간 연결 상태 확인 (Health Check)
  // ========================================
  
  app.get("/api/admin/api-services/health", async (req, res) => {
    try {
      const healthResults: Record<string, {
        connected: boolean;
        latency: number | null;
        error: string | null;
        lastChecked: string;
      }> = {};

      const checkWithTimeout = async (
        name: string,
        checkFn: () => Promise<void>,
        timeoutMs: number = 5000
      ) => {
        const start = Date.now();
        try {
          await Promise.race([
            checkFn(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Timeout")), timeoutMs)
            )
          ]);
          healthResults[name] = {
            connected: true,
            latency: Date.now() - start,
            error: null,
            lastChecked: new Date().toISOString()
          };
        } catch (err: any) {
          healthResults[name] = {
            connected: false,
            latency: null,
            error: err.message || "Connection failed",
            lastChecked: new Date().toISOString()
          };
        }
      };

      // Google Maps API 테스트
      const googleMapsKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
      if (googleMapsKey) {
        await checkWithTimeout("google_maps", async () => {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=Seoul&key=${googleMapsKey}`
          );
          const data = await response.json();
          if (data.status === "REQUEST_DENIED") {
            throw new Error(data.error_message || "API key invalid");
          }
        });
        // Google Places는 같은 키 사용
        healthResults["google_places"] = { ...healthResults["google_maps"] };
      } else {
        healthResults["google_maps"] = { connected: false, latency: null, error: "API key not configured", lastChecked: new Date().toISOString() };
        healthResults["google_places"] = { connected: false, latency: null, error: "API key not configured", lastChecked: new Date().toISOString() };
      }

      // YouTube Data API 테스트
      const youtubeKey = process.env.YOUTUBE_API_KEY;
      if (youtubeKey) {
        await checkWithTimeout("youtube_data", async () => {
          const response = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${youtubeKey}`
          );
          const data = await response.json();
          if (data.error) {
            throw new Error(data.error.message || "API error");
          }
        });
      } else {
        healthResults["youtube_data"] = { connected: false, latency: null, error: "API key not configured", lastChecked: new Date().toISOString() };
      }

      // OpenWeather API 테스트
      const weatherKey = process.env.OPENWEATHER_API_KEY;
      if (weatherKey) {
        await checkWithTimeout("openweather", async () => {
          const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=Seoul&appid=${weatherKey}`
          );
          const data = await response.json();
          if (data.cod && data.cod !== 200 && data.cod !== "200") {
            throw new Error(data.message || "API error");
          }
        });
      } else {
        healthResults["openweather"] = { connected: false, latency: null, error: "API key not configured", lastChecked: new Date().toISOString() };
      }

      // Gemini AI 테스트 (SDK 방식)
      const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
      if (geminiKey && geminiBaseUrl) {
        await checkWithTimeout("gemini", async () => {
          const ai = new GoogleGenAI({
            apiKey: geminiKey,
            httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl }
          });
          await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
          });
        });
      } else {
        healthResults["gemini"] = { connected: false, latency: null, error: "API key not configured", lastChecked: new Date().toISOString() };
      }

      // Exchange Rate API 테스트 (무료 API)
      await checkWithTimeout("exchange_rate", async () => {
        const response = await fetch(
          "https://api.exchangerate-api.com/v4/latest/USD"
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      });

      // DB에 상태 업데이트
      for (const [serviceName, health] of Object.entries(healthResults)) {
        await db
          .update(apiServiceStatus)
          .set({
            lastCallAt: new Date(),
            lastSuccessAt: health.connected ? new Date() : undefined,
            lastErrorAt: health.connected ? undefined : new Date(),
            lastErrorMessage: health.error,
          })
          .where(eq(apiServiceStatus.serviceName, serviceName));
      }

      res.json({
        timestamp: new Date().toISOString(),
        services: healthResults
      });
    } catch (error) {
      console.error("Health check error:", error);
      res.status(500).json({ error: "Health check failed" });
    }
  });

  // ========================================
  // YouTube 채널 관리
  // ========================================
  
  app.get("/api/admin/youtube-channels", async (req, res) => {
    try {
      const channels = await db
        .select()
        .from(youtubeChannels)
        .orderBy(desc(youtubeChannels.trustWeight), youtubeChannels.channelName);
      res.json(channels);
    } catch (error) {
      console.error("Error fetching YouTube channels:", error);
      res.status(500).json({ error: "Failed to fetch YouTube channels" });
    }
  });
  
  app.post("/api/admin/youtube-channels", async (req, res) => {
    try {
      const { channelId, channelName, channelUrl, category, trustWeight } = req.body;
      
      if (!channelId || !channelName) {
        return res.status(400).json({ error: "channelId and channelName are required" });
      }
      
      const [channel] = await db
        .insert(youtubeChannels)
        .values({
          channelId,
          channelName,
          channelUrl,
          category,
          trustWeight: trustWeight || 1.0,
        })
        .returning();
      
      res.status(201).json(channel);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Channel already exists" });
      }
      console.error("Error creating YouTube channel:", error);
      res.status(500).json({ error: "Failed to create YouTube channel" });
    }
  });
  
  app.patch("/api/admin/youtube-channels/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isActive, trustWeight, category } = req.body;
      
      const [channel] = await db
        .update(youtubeChannels)
        .set({
          ...(isActive !== undefined && { isActive }),
          ...(trustWeight !== undefined && { trustWeight }),
          ...(category !== undefined && { category }),
          updatedAt: new Date()
        })
        .where(eq(youtubeChannels.id, id))
        .returning();
      
      res.json(channel);
    } catch (error) {
      console.error("Error updating YouTube channel:", error);
      res.status(500).json({ error: "Failed to update YouTube channel" });
    }
  });
  
  app.delete("/api/admin/youtube-channels/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(youtubeChannels).where(eq(youtubeChannels.id, id));
      res.json({ message: "Channel deleted" });
    } catch (error) {
      console.error("Error deleting YouTube channel:", error);
      res.status(500).json({ error: "Failed to delete YouTube channel" });
    }
  });

  // ========================================
  // 블로그 소스 관리
  // ========================================
  
  app.get("/api/admin/blog-sources", async (req, res) => {
    try {
      const sources = await db
        .select()
        .from(blogSources)
        .orderBy(desc(blogSources.trustWeight), blogSources.sourceName);
      res.json(sources);
    } catch (error) {
      console.error("Error fetching blog sources:", error);
      res.status(500).json({ error: "Failed to fetch blog sources" });
    }
  });
  
  app.post("/api/admin/blog-sources", async (req, res) => {
    try {
      const { platform, sourceName, sourceUrl, authorName, category, language, trustWeight } = req.body;
      
      if (!platform || !sourceName) {
        return res.status(400).json({ error: "platform and sourceName are required" });
      }
      
      const [source] = await db
        .insert(blogSources)
        .values({
          platform,
          sourceName,
          sourceUrl,
          authorName,
          category,
          language: language || "ko",
          trustWeight: trustWeight || 1.0,
        })
        .returning();
      
      res.status(201).json(source);
    } catch (error) {
      console.error("Error creating blog source:", error);
      res.status(500).json({ error: "Failed to create blog source" });
    }
  });
  
  app.patch("/api/admin/blog-sources/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isActive, trustWeight, category } = req.body;
      
      const [source] = await db
        .update(blogSources)
        .set({
          ...(isActive !== undefined && { isActive }),
          ...(trustWeight !== undefined && { trustWeight }),
          ...(category !== undefined && { category }),
          updatedAt: new Date()
        })
        .where(eq(blogSources.id, id))
        .returning();
      
      res.json(source);
    } catch (error) {
      console.error("Error updating blog source:", error);
      res.status(500).json({ error: "Failed to update blog source" });
    }
  });
  
  app.delete("/api/admin/blog-sources/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(blogSources).where(eq(blogSources.id, id));
      res.json({ message: "Blog source deleted" });
    } catch (error) {
      console.error("Error deleting blog source:", error);
      res.status(500).json({ error: "Failed to delete blog source" });
    }
  });

  // ========================================
  // 환율 데이터
  // ========================================
  
  app.get("/api/admin/exchange-rates", async (req, res) => {
    try {
      const rates = await db
        .select()
        .from(exchangeRates)
        .orderBy(exchangeRates.targetCurrency);
      res.json(rates);
    } catch (error) {
      console.error("Error fetching exchange rates:", error);
      res.status(500).json({ error: "Failed to fetch exchange rates" });
    }
  });

  // ========================================
  // 데이터 수집 스케줄
  // ========================================
  
  app.get("/api/admin/schedules", async (req, res) => {
    try {
      const schedules = await db.select().from(dataCollectionSchedule);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      res.status(500).json({ error: "Failed to fetch schedules" });
    }
  });
  
  app.post("/api/admin/schedules/init", async (req, res) => {
    try {
      const defaultSchedules = [
        { taskName: "youtube_sync", description: "YouTube 채널 신규 영상 수집", cronExpression: "0 3 * * *" },
        { taskName: "blog_sync", description: "블로그/미슐랭/TripAdvisor 수집", cronExpression: "15 3 * * *" },
        { taskName: "crisis_sync", description: "위기 정보 수집 (파업/시위)", cronExpression: "30 3 * * *" },
        { taskName: "price_sync", description: "가격 정보 업데이트", cronExpression: "45 3 * * *" },
        { taskName: "exchange_sync", description: "환율 정보 업데이트", cronExpression: "0 4 * * *" },
        { taskName: "weather_sync", description: "날씨 정보 업데이트", cronExpression: "0 * * * *" },
      ];
      
      for (const schedule of defaultSchedules) {
        await db
          .insert(dataCollectionSchedule)
          .values(schedule)
          .onConflictDoUpdate({
            target: dataCollectionSchedule.taskName,
            set: { description: schedule.description, cronExpression: schedule.cronExpression }
          });
      }
      
      res.json({ message: "Schedules initialized" });
    } catch (error) {
      console.error("Error initializing schedules:", error);
      res.status(500).json({ error: "Failed to initialize schedules" });
    }
  });
  
  app.patch("/api/admin/schedules/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isEnabled, cronExpression } = req.body;
      
      const [schedule] = await db
        .update(dataCollectionSchedule)
        .set({
          ...(isEnabled !== undefined && { isEnabled }),
          ...(cronExpression !== undefined && { cronExpression }),
        })
        .where(eq(dataCollectionSchedule.id, id))
        .returning();
      
      res.json(schedule);
    } catch (error) {
      console.error("Error updating schedule:", error);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  // ========================================
  // 데이터 신선도 현황
  // ========================================
  
  app.get("/api/admin/data-freshness", async (req, res) => {
    try {
      const now = new Date();
      const sevenDays = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDays = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const thirtyDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const allPlaces = await db.select({
        id: places.id,
        name: places.name,
        lastDataSync: places.lastDataSync
      }).from(places);
      
      const freshness = {
        fresh: 0,
        recent: 0,
        aging: 0,
        stale: 0,
        never: 0,
        details: [] as any[]
      };
      
      for (const place of allPlaces) {
        if (!place.lastDataSync) {
          freshness.never++;
          if (freshness.details.length < 20) {
            freshness.details.push({ ...place, status: "never" });
          }
        } else if (place.lastDataSync >= sevenDays) {
          freshness.fresh++;
        } else if (place.lastDataSync >= fourteenDays) {
          freshness.recent++;
        } else if (place.lastDataSync >= thirtyDays) {
          freshness.aging++;
          if (freshness.details.length < 20) {
            freshness.details.push({ ...place, status: "aging" });
          }
        } else {
          freshness.stale++;
          if (freshness.details.length < 20) {
            freshness.details.push({ ...place, status: "stale" });
          }
        }
      }
      
      res.json({
        summary: {
          fresh: { count: freshness.fresh, label: "신선 (0-7일)", color: "#22C55E" },
          recent: { count: freshness.recent, label: "최근 (8-14일)", color: "#F59E0B" },
          aging: { count: freshness.aging, label: "노후 (15-30일)", color: "#EF4444" },
          stale: { count: freshness.stale, label: "오래됨 (31일+)", color: "#6B7280" },
          never: { count: freshness.never, label: "수집 안됨", color: "#9CA3AF" },
        },
        total: allPlaces.length,
        needsUpdate: freshness.details
      });
    } catch (error) {
      console.error("Error fetching data freshness:", error);
      res.status(500).json({ error: "Failed to fetch data freshness" });
    }
  });

  // ========================================
  // 동기화 로그
  // ========================================
  
  app.get("/api/admin/sync-logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await db
        .select()
        .from(dataSyncLog)
        .orderBy(desc(dataSyncLog.startedAt))
        .limit(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching sync logs:", error);
      res.status(500).json({ error: "Failed to fetch sync logs" });
    }
  });

  // ========================================
  // 수동 데이터 수집 트리거
  // ========================================
  
  app.post("/api/admin/sync/trigger", async (req, res) => {
    try {
      const { taskName, entityId } = req.body;
      
      const [log] = await db
        .insert(dataSyncLog)
        .values({
          entityType: taskName,
          entityId,
          source: "manual",
          status: "pending"
        })
        .returning();
      
      res.json({ message: `Sync task ${taskName} queued`, logId: log.id });
    } catch (error) {
      console.error("Error triggering sync:", error);
      res.status(500).json({ error: "Failed to trigger sync" });
    }
  });

  // ========================================
  // 유튜브 채널 동기화
  // ========================================
  
  app.post("/api/admin/sync/youtube", async (req, res) => {
    try {
      const { youtubeFetcher } = await import("./services/youtube-fetcher");
      
      if (!youtubeFetcher.isConfigured()) {
        res.status(400).json({ 
          error: "YouTube API 키가 설정되지 않았습니다", 
          needsKey: true,
          instructions: "Google Cloud Console에서 YouTube Data API v3를 활성화하고 API 키를 발급받으세요."
        });
        return;
      }
      
      const result = await youtubeFetcher.syncAllChannels();
      
      await db.insert(dataSyncLog).values({
        entityType: "youtube_channels",
        source: "youtube",
        status: result.totalFailed === 0 ? "success" : "partial",
        itemsProcessed: result.totalSynced,
        itemsFailed: result.totalFailed,
        completedAt: new Date(),
      });
      
      res.json({ 
        message: "유튜브 채널 동기화 완료",
        ...result 
      });
    } catch (error) {
      console.error("Error syncing YouTube:", error);
      res.status(500).json({ error: "유튜브 동기화 실패", details: String(error) });
    }
  });

  // ========================================
  // 환율 동기화
  // ========================================
  
  app.post("/api/admin/sync/exchange-rates", async (req, res) => {
    try {
      const { exchangeRateFetcher } = await import("./services/exchange-rate");
      
      const result = await exchangeRateFetcher.syncExchangeRates();
      
      await db.insert(dataSyncLog).values({
        entityType: "exchange_rates",
        source: "frankfurter",
        status: "success",
        itemsProcessed: result.synced,
        completedAt: new Date(),
      });
      
      res.json({ 
        message: "환율 동기화 완료",
        ...result 
      });
    } catch (error) {
      console.error("Error syncing exchange rates:", error);
      res.status(500).json({ error: "환율 동기화 실패", details: String(error) });
    }
  });

  // ========================================
  // Google Places 동기화
  // ========================================
  
  app.post("/api/admin/sync/places/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
      
      if (!city) {
        res.status(404).json({ error: "도시를 찾을 수 없습니다" });
        return;
      }
      
      const { googlePlacesFetcher } = await import("./services/google-places");
      
      const result = await googlePlacesFetcher.syncCityPlaces(
        cityId,
        city.latitude,
        city.longitude,
        ["restaurant", "attraction"]
      );
      
      res.json({ 
        message: `${city.name} 장소 동기화 완료`,
        city: city.name,
        ...result 
      });
    } catch (error) {
      console.error("Error syncing places:", error);
      res.status(500).json({ error: "장소 동기화 실패", details: String(error) });
    }
  });

  // ========================================
  // API 상태 확인
  // ========================================
  
  app.get("/api/admin/api-status", async (req, res) => {
    try {
      const googleMapsKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
      const youtubeKey = process.env.YOUTUBE_API_KEY;
      const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      const openWeatherKey = process.env.OPENWEATHER_API_KEY;
      
      const status = {
        googlePlaces: {
          configured: !!googleMapsKey,
          message: googleMapsKey ? "설정됨" : "Google Cloud Console에서 Places API 활성화 필요"
        },
        youtube: {
          configured: !!youtubeKey,
          message: youtubeKey ? "설정됨" : "YOUTUBE_API_KEY 환경변수 필요 (Google Cloud Console에서 발급)"
        },
        gemini: {
          configured: !!geminiKey,
          message: geminiKey ? "설정됨 (Replit AI 통합)" : "Replit AI 통합 필요"
        },
        exchangeRate: {
          configured: true,
          message: "무료 API 사용 (API 키 불필요)"
        },
        openWeather: {
          configured: !!openWeatherKey,
          message: openWeatherKey ? "설정됨" : "OPENWEATHER_API_KEY 환경변수 필요 (openweathermap.org에서 발급)"
        }
      };
      
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "API 상태 확인 실패" });
    }
  });

  // ========================================
  // 기본 데이터 시드 (디폴트 채널/소스)
  // ========================================
  
  app.post("/api/admin/seed/defaults", async (req, res) => {
    try {
      const defaultYoutubeChannels = [
        // 맛집 채널 (최고 신뢰도)
        { channelId: "UC3mY_QDRF9lQvd_wXKfn", channelName: "성시경", category: "food", trustWeight: 2.0 },
        { channelId: "UC_BAEK_JONGWON", channelName: "백종원", category: "food", trustWeight: 2.0 },
        { channelId: "UCGrJqBQRypR7BMVp7lwnUUQ", channelName: "스트릿푸드파이터", category: "food", trustWeight: 2.0 },
        { channelId: "UC_CHOIZA_ROAD", channelName: "최자로드", category: "food", trustWeight: 1.9 },
        // 미식/와인 채널
        { channelId: "UC_BIMILIYA", channelName: "비밀이야", category: "food", trustWeight: 1.8 },
        { channelId: "UC_WINE_ATOM", channelName: "와인 마시는 아톰", category: "food", trustWeight: 1.7 },
        // 현지 채널
        { channelId: "UC_PARIS_OINOJA", channelName: "파리외노자", category: "travel", trustWeight: 1.9 },
        { channelId: "UC_CHUNG_HAEMI", channelName: "CHUNG Haemi", category: "travel", trustWeight: 1.8 },
        { channelId: "UC_MAKITCHEN", channelName: "마키친", category: "food", trustWeight: 1.8 },
        // 여행 채널
        { channelId: "UCsJ6RuBiTVLvNWb56-wr_aQ", channelName: "빠니보틀", category: "travel", trustWeight: 1.9 },
        { channelId: "UCw_QDRF9lQvd_wXKfnsJIVQ", channelName: "여행에 미치다", category: "travel", trustWeight: 1.8 },
        { channelId: "UCyn-K7rZLXjGl7VXGweIlcA", channelName: "먹보형제", category: "food", trustWeight: 1.8 },
        { channelId: "UCCgR5yXXzF-4T1hTkM_oLFA", channelName: "곱창막창대창", category: "food", trustWeight: 1.7 },
        { channelId: "UCZQ1_FVU_Yt0YBryqN6Mvqg", channelName: "아리랑TV 투어", category: "travel", trustWeight: 1.6 },
        { channelId: "UCqy2Dq3xDPVhXKSIw2WaZGQ", channelName: "트래블튜브", category: "travel", trustWeight: 1.6 },
      ];
      
      const defaultBlogSources = [
        { platform: "michelin", sourceName: "미쉐린 가이드 서울", sourceUrl: "https://guide.michelin.com/kr/ko/seoul-region/seoul", category: "food", trustWeight: 2.0, language: "ko" },
        { platform: "michelin", sourceName: "미쉐린 가이드 도쿄", sourceUrl: "https://guide.michelin.com/jp/en/tokyo-region/tokyo", category: "food", trustWeight: 2.0, language: "ja" },
        { platform: "michelin", sourceName: "미쉐린 가이드 파리", sourceUrl: "https://guide.michelin.com/fr/en/paris-region/paris", category: "food", trustWeight: 2.0, language: "fr" },
        { platform: "tripadvisor", sourceName: "트립어드바이저 아시아", sourceUrl: "https://www.tripadvisor.com/", category: "travel", trustWeight: 1.5, language: "en" },
        { platform: "tripadvisor", sourceName: "트립어드바이저 유럽", sourceUrl: "https://www.tripadvisor.com/", category: "travel", trustWeight: 1.5, language: "en" },
        { platform: "naver", sourceName: "네이버 맛집 랭킹", sourceUrl: "https://map.naver.com/", category: "food", trustWeight: 1.3, language: "ko" },
        { platform: "naver", sourceName: "네이버 여행 플러스", sourceUrl: "https://m.blog.naver.com/", category: "travel", trustWeight: 1.2, language: "ko" },
        { platform: "tistory", sourceName: "티스토리 여행 카테고리", sourceUrl: "https://www.tistory.com/", category: "travel", trustWeight: 1.0, language: "ko" },
      ];
      
      let channelsAdded = 0;
      let sourcesAdded = 0;
      
      for (const channel of defaultYoutubeChannels) {
        try {
          await db
            .insert(youtubeChannels)
            .values({
              channelId: channel.channelId,
              channelName: channel.channelName,
              channelUrl: `https://www.youtube.com/channel/${channel.channelId}`,
              category: channel.category,
              trustWeight: channel.trustWeight,
            })
            .onConflictDoNothing();
          channelsAdded++;
        } catch (e) {
        }
      }
      
      for (const source of defaultBlogSources) {
        try {
          await db
            .insert(blogSources)
            .values(source)
            .onConflictDoNothing();
          sourcesAdded++;
        } catch (e) {
        }
      }
      
      res.json({ 
        message: "기본 데이터가 추가되었습니다",
        channelsAdded,
        sourcesAdded
      });
    } catch (error) {
      console.error("Error seeding defaults:", error);
      res.status(500).json({ error: "Failed to seed default data" });
    }
  });

  // ========================================
  // 기본 도시 데이터 시드
  // ========================================
  
  app.post("/api/admin/seed/cities", async (req, res) => {
    try {
      const defaultCities = [
        { name: "서울", country: "대한민국", countryCode: "KR", latitude: 37.5665, longitude: 126.9780, timezone: "Asia/Seoul", primaryLanguage: "ko" },
        { name: "도쿄", country: "일본", countryCode: "JP", latitude: 35.6762, longitude: 139.6503, timezone: "Asia/Tokyo", primaryLanguage: "ja" },
        { name: "오사카", country: "일본", countryCode: "JP", latitude: 34.6937, longitude: 135.5023, timezone: "Asia/Tokyo", primaryLanguage: "ja" },
        { name: "파리", country: "프랑스", countryCode: "FR", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris", primaryLanguage: "fr" },
        { name: "로마", country: "이탈리아", countryCode: "IT", latitude: 41.9028, longitude: 12.4964, timezone: "Europe/Rome", primaryLanguage: "it" },
        { name: "피렌체", country: "이탈리아", countryCode: "IT", latitude: 43.7696, longitude: 11.2558, timezone: "Europe/Rome", primaryLanguage: "it" },
        { name: "베니스", country: "이탈리아", countryCode: "IT", latitude: 45.4408, longitude: 12.3155, timezone: "Europe/Rome", primaryLanguage: "it" },
        { name: "바르셀로나", country: "스페인", countryCode: "ES", latitude: 41.3851, longitude: 2.1734, timezone: "Europe/Madrid", primaryLanguage: "es" },
        { name: "런던", country: "영국", countryCode: "GB", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London", primaryLanguage: "en" },
        { name: "뉴욕", country: "미국", countryCode: "US", latitude: 40.7128, longitude: -74.0060, timezone: "America/New_York", primaryLanguage: "en" },
        { name: "방콕", country: "태국", countryCode: "TH", latitude: 13.7563, longitude: 100.5018, timezone: "Asia/Bangkok", primaryLanguage: "th" },
        { name: "싱가포르", country: "싱가포르", countryCode: "SG", latitude: 1.3521, longitude: 103.8198, timezone: "Asia/Singapore", primaryLanguage: "en" },
        { name: "홍콩", country: "홍콩", countryCode: "HK", latitude: 22.3193, longitude: 114.1694, timezone: "Asia/Hong_Kong", primaryLanguage: "zh" },
        { name: "다낭", country: "베트남", countryCode: "VN", latitude: 16.0544, longitude: 108.2022, timezone: "Asia/Ho_Chi_Minh", primaryLanguage: "vi" },
        { name: "하노이", country: "베트남", countryCode: "VN", latitude: 21.0285, longitude: 105.8542, timezone: "Asia/Ho_Chi_Minh", primaryLanguage: "vi" },
      ];
      
      let citiesAdded = 0;
      
      for (const city of defaultCities) {
        try {
          await db
            .insert(cities)
            .values(city)
            .onConflictDoNothing();
          citiesAdded++;
        } catch (e) {
        }
      }
      
      res.json({ 
        message: "기본 도시 데이터가 추가되었습니다",
        citiesAdded
      });
    } catch (error) {
      console.error("Error seeding cities:", error);
      res.status(500).json({ error: "Failed to seed city data" });
    }
  });
}
