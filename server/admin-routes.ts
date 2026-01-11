import type { Express } from "express";
import { db } from "./db";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { 
  apiServiceStatus, 
  youtubeChannels, 
  youtubeVideos,
  youtubePlaceMentions,
  blogSources, 
  exchangeRates,
  dataCollectionSchedule,
  dataSyncLog,
  cities,
  places,
  placeDataSources,
  reviews,
  instagramHashtags,
  instagramLocations,
  instagramPhotos,
  crisisAlerts,
  geminiWebSearchCache,
  placePrices,
  naverBlogPosts,
  weatherForecast
} from "../shared/schema";
import { instagramCrawler } from "./services/instagram-crawler";
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
  // 데이터 품질 알림 API
  // ========================================
  
  app.get("/api/admin/data-quality/alerts", async (req, res) => {
    try {
      const alerts: Array<{ type: string; severity: string; message: string; action?: string }> = [];
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        failedSyncsToday,
        staleYoutubeChannels,
        inactiveApiServices,
        emptyPlacesCount
      ] = await Promise.all([
        db.select({ count: count() }).from(dataSyncLog)
          .where(and(eq(dataSyncLog.status, "failed"), gte(dataSyncLog.startedAt, oneDayAgo))),
        db.select({ count: count() }).from(youtubeChannels)
          .where(and(eq(youtubeChannels.isActive, true), sql`${youtubeChannels.lastVideoSyncAt} < ${sevenDaysAgo} OR ${youtubeChannels.lastVideoSyncAt} IS NULL`)),
        db.select({ count: count() }).from(apiServiceStatus)
          .where(eq(apiServiceStatus.isActive, false)),
        db.select({ count: count() }).from(places)
          .where(sql`${places.userRatingCount} IS NULL OR ${places.userRatingCount} = 0`)
      ]);

      if (failedSyncsToday[0]?.count > 0) {
        alerts.push({
          type: "sync_failure",
          severity: "warning",
          message: `오늘 ${failedSyncsToday[0].count}개 동기화 작업이 실패했습니다`,
          action: "동기화 로그 확인"
        });
      }

      if (staleYoutubeChannels[0]?.count > 3) {
        alerts.push({
          type: "stale_data",
          severity: "info",
          message: `${staleYoutubeChannels[0].count}개 YouTube 채널이 7일 이상 동기화되지 않았습니다`,
          action: "YouTube 동기화 실행"
        });
      }

      if (inactiveApiServices[0]?.count > 0) {
        alerts.push({
          type: "api_inactive",
          severity: "error",
          message: `${inactiveApiServices[0].count}개 API 서비스가 비활성 상태입니다`,
          action: "API 설정 확인"
        });
      }

      if (emptyPlacesCount[0]?.count > 5) {
        alerts.push({
          type: "incomplete_data",
          severity: "info",
          message: `${emptyPlacesCount[0].count}개 장소에 평점 데이터가 없습니다`,
          action: "TripAdvisor 동기화 실행"
        });
      }

      res.json({
        alerts,
        totalAlerts: alerts.length,
        criticalCount: alerts.filter(a => a.severity === "error").length,
        warningCount: alerts.filter(a => a.severity === "warning").length,
        infoCount: alerts.filter(a => a.severity === "info").length
      });
    } catch (error) {
      console.error("Data quality alerts error:", error);
      res.status(500).json({ error: "Failed to fetch data quality alerts" });
    }
  });

  // ========================================
  // 수집 통계 API
  // ========================================
  
  app.get("/api/admin/collection-stats", async (req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

      const [
        videoCount,
        blogPostCount,
        exchangeRateCount,
        placeMentionCount,
        todaySyncs,
        weekSyncs
      ] = await Promise.all([
        db.select({ count: count() }).from(youtubeVideos),
        db.select({ count: count() }).from(naverBlogPosts),
        db.select({ count: count() }).from(exchangeRates),
        db.select({ count: count() }).from(youtubePlaceMentions),
        db.select({ count: count() }).from(dataSyncLog).where(gte(dataSyncLog.startedAt, todayStart)),
        db.select({ count: count() }).from(dataSyncLog).where(gte(dataSyncLog.startedAt, weekStart))
      ]);

      const dailyStats = await db
        .select({
          date: sql<string>`DATE(${dataSyncLog.startedAt})`,
          total: count(),
          success: sql<number>`COUNT(*) FILTER (WHERE ${dataSyncLog.status} = 'success')`,
          failed: sql<number>`COUNT(*) FILTER (WHERE ${dataSyncLog.status} = 'failed')`
        })
        .from(dataSyncLog)
        .where(gte(dataSyncLog.startedAt, weekStart))
        .groupBy(sql`DATE(${dataSyncLog.startedAt})`)
        .orderBy(sql`DATE(${dataSyncLog.startedAt})`);

      res.json({
        totals: {
          youtubeVideos: videoCount[0]?.count || 0,
          blogPosts: blogPostCount[0]?.count || 0,
          exchangeRates: exchangeRateCount[0]?.count || 0,
          placeMentions: placeMentionCount[0]?.count || 0
        },
        syncs: {
          today: todaySyncs[0]?.count || 0,
          thisWeek: weekSyncs[0]?.count || 0
        },
        dailyStats
      });
    } catch (error) {
      console.error("Collection stats error:", error);
      res.status(500).json({ error: "Failed to fetch collection stats" });
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
  // 통합 데이터 소스 현황
  // ========================================
  
  app.get("/api/admin/data-sources/status", async (req, res) => {
    try {
      const formatDate = (d: Date | null) => d ? new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
      
      // Google Places
      const [googlePlaces] = await db.select({ count: count() }).from(places);
      const [googleLastSync] = await db.select({ lastSync: places.lastDataSync })
        .from(places)
        .orderBy(desc(places.lastDataSync))
        .limit(1);
      
      // Instagram
      const [instagramTags] = await db.select({ count: count() }).from(instagramHashtags);
      const [instagramLastSync] = await db.select({ lastSync: instagramHashtags.lastSyncAt })
        .from(instagramHashtags)
        .orderBy(desc(instagramHashtags.lastSyncAt))
        .limit(1);
      
      // YouTube
      const [youtubeCount] = await db.select({ count: count() }).from(youtubeChannels).where(eq(youtubeChannels.isActive, true));
      const [youtubeVideoCount] = await db.select({ count: count() }).from(youtubeVideos);
      const [youtubePlaceCount] = await db.select({ count: count() }).from(youtubePlaceMentions);
      const [youtubeLastSync] = await db.select({ lastSync: youtubeChannels.lastVideoSyncAt })
        .from(youtubeChannels)
        .orderBy(desc(youtubeChannels.lastVideoSyncAt))
        .limit(1);
      
      // Naver Blog
      const [naverCount] = await db.select({ count: count() }).from(blogSources).where(eq(blogSources.isActive, true));
      const [naverLastSync] = await db.select({ lastSync: blogSources.lastSyncAt })
        .from(blogSources)
        .orderBy(desc(blogSources.lastSyncAt))
        .limit(1);
      
      // Crisis Alerts
      const [crisisTotal] = await db.select({ count: count() }).from(crisisAlerts);
      const [crisisActive] = await db.select({ count: count() }).from(crisisAlerts).where(eq(crisisAlerts.isActive, true));
      const [crisisLastSync] = await db.select({ lastSync: crisisAlerts.fetchedAt })
        .from(crisisAlerts)
        .orderBy(desc(crisisAlerts.fetchedAt))
        .limit(1);
      
      // Web Search Cache
      const [webSearchTotal] = await db.select({ count: count() }).from(geminiWebSearchCache);
      const [webSearchLastSync] = await db.select({ lastSync: geminiWebSearchCache.fetchedAt })
        .from(geminiWebSearchCache)
        .orderBy(desc(geminiWebSearchCache.fetchedAt))
        .limit(1);
      
      res.json({
        google: {
          count: googlePlaces.count || 0,
          status: googlePlaces.count > 0 ? '활성' : '대기',
          lastSync: formatDate(googleLastSync?.lastSync || null)
        },
        instagram: {
          count: instagramTags.count || 0,
          status: instagramTags.count > 0 ? '활성' : '대기',
          lastSync: formatDate(instagramLastSync?.lastSync || null)
        },
        youtube: {
          count: youtubeCount.count || 0,
          videos: youtubeVideoCount.count || 0,
          placeMentions: youtubePlaceCount.count || 0,
          status: youtubeCount.count > 0 ? '활성' : '대기',
          lastSync: formatDate(youtubeLastSync?.lastSync || null)
        },
        naver: {
          count: naverCount.count || 0,
          status: naverCount.count > 0 ? '활성' : '대기',
          lastSync: formatDate(naverLastSync?.lastSync || null)
        },
        crisis: {
          total: crisisTotal.count || 0,
          active: crisisActive.count || 0,
          status: crisisActive.count > 0 ? '활성' : '정상',
          lastSync: formatDate(crisisLastSync?.lastSync || null)
        },
        webSearch: {
          count: webSearchTotal.count || 0,
          status: webSearchTotal.count > 0 ? '활성' : '대기',
          lastSync: formatDate(webSearchLastSync?.lastSync || null)
        }
      });
    } catch (error) {
      console.error("Error fetching data sources status:", error);
      res.status(500).json({ error: "Failed to fetch data sources status" });
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
      const { youtubeCrawler } = await import("./services/youtube-crawler");
      
      if (!process.env.YOUTUBE_API_KEY) {
        res.status(400).json({ 
          error: "YouTube API 키가 설정되지 않았습니다", 
          needsKey: true,
          instructions: "Google Cloud Console에서 YouTube Data API v3를 활성화하고 API 키를 발급받으세요."
        });
        return;
      }
      
      const result = await youtubeCrawler.syncAllChannels();
      
      await db.insert(dataSyncLog).values({
        entityType: "youtube_channels",
        source: "youtube",
        status: result.errors.length === 0 ? "success" : "partial",
        itemsProcessed: result.totalVideos,
        itemsFailed: result.errors.length,
        completedAt: new Date(),
      });
      
      res.json({ 
        message: "유튜브 채널 동기화 완료",
        videosAdded: result.totalVideos,
        placesExtracted: result.totalPlaces,
        errors: result.errors
      });
    } catch (error) {
      console.error("Error syncing YouTube:", error);
      res.status(500).json({ error: "유튜브 동기화 실패", details: String(error) });
    }
  });

  app.get("/api/admin/youtube/stats", async (req, res) => {
    try {
      const { youtubeCrawler } = await import("./services/youtube-crawler");
      const stats = await youtubeCrawler.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting YouTube stats:", error);
      res.status(500).json({ error: "통계 조회 실패" });
    }
  });

  app.post("/api/admin/youtube/sync/channel/:id", async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const { youtubeCrawler } = await import("./services/youtube-crawler");
      
      if (!process.env.YOUTUBE_API_KEY) {
        res.status(400).json({ error: "YouTube API 키가 설정되지 않았습니다" });
        return;
      }
      
      const result = await youtubeCrawler.syncChannelVideos(channelId, 10);
      res.json({
        message: "채널 동기화 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing channel:", error);
      res.status(500).json({ error: "채널 동기화 실패" });
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
  // 스케줄러 상태 및 수동 실행
  // ========================================
  
  app.get("/api/admin/scheduler/status", async (req, res) => {
    try {
      const { dataScheduler } = await import("./services/data-scheduler");
      const status = dataScheduler.getStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting scheduler status:", error);
      res.status(500).json({ error: "스케줄러 상태 조회 실패" });
    }
  });

  app.post("/api/admin/scheduler/run/:taskName", async (req, res) => {
    try {
      const { taskName } = req.params;
      const { dataScheduler } = await import("./services/data-scheduler");
      const result = await dataScheduler.runNow(taskName);
      res.json(result);
    } catch (error) {
      console.error("Error running scheduler task:", error);
      res.status(500).json({ error: "스케줄러 태스크 실행 실패" });
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

  // ========================================
  // 기본 Instagram 해시태그 시드
  // ========================================
  
  app.post("/api/admin/seed/instagram", async (req, res) => {
    try {
      const defaultHashtags = [
        // 파리 (프랑스)
        { hashtag: "#에펠탑", category: "landmark", relatedCity: "파리" },
        { hashtag: "#toureiffel", category: "landmark", relatedCity: "파리" },
        { hashtag: "#파리여행", category: "travel", relatedCity: "파리" },
        { hashtag: "#파리맛집", category: "food", relatedCity: "파리" },
        { hashtag: "#몽마르뜨", category: "landmark", relatedCity: "파리" },
        { hashtag: "#루브르", category: "landmark", relatedCity: "파리" },
        { hashtag: "#샹젤리제", category: "landmark", relatedCity: "파리" },
        
        // 도쿄 (일본)
        { hashtag: "#도쿄타워", category: "landmark", relatedCity: "도쿄" },
        { hashtag: "#tokyotower", category: "landmark", relatedCity: "도쿄" },
        { hashtag: "#도쿄여행", category: "travel", relatedCity: "도쿄" },
        { hashtag: "#도쿄맛집", category: "food", relatedCity: "도쿄" },
        { hashtag: "#시부야", category: "landmark", relatedCity: "도쿄" },
        { hashtag: "#신주쿠", category: "landmark", relatedCity: "도쿄" },
        { hashtag: "#아사쿠사", category: "landmark", relatedCity: "도쿄" },
        { hashtag: "#센소지", category: "landmark", relatedCity: "도쿄" },
        
        // 오사카 (일본)
        { hashtag: "#오사카여행", category: "travel", relatedCity: "오사카" },
        { hashtag: "#오사카맛집", category: "food", relatedCity: "오사카" },
        { hashtag: "#도톤보리", category: "landmark", relatedCity: "오사카" },
        { hashtag: "#오사카성", category: "landmark", relatedCity: "오사카" },
        { hashtag: "#난바", category: "landmark", relatedCity: "오사카" },
        
        // 서울 (한국)
        { hashtag: "#서울여행", category: "travel", relatedCity: "서울" },
        { hashtag: "#서울맛집", category: "food", relatedCity: "서울" },
        { hashtag: "#경복궁", category: "landmark", relatedCity: "서울" },
        { hashtag: "#남산타워", category: "landmark", relatedCity: "서울" },
        { hashtag: "#명동", category: "landmark", relatedCity: "서울" },
        { hashtag: "#홍대", category: "landmark", relatedCity: "서울" },
        { hashtag: "#이태원", category: "landmark", relatedCity: "서울" },
        
        // 로마 (이탈리아)
        { hashtag: "#로마여행", category: "travel", relatedCity: "로마" },
        { hashtag: "#로마맛집", category: "food", relatedCity: "로마" },
        { hashtag: "#콜로세움", category: "landmark", relatedCity: "로마" },
        { hashtag: "#바티칸", category: "landmark", relatedCity: "로마" },
        { hashtag: "#트레비분수", category: "landmark", relatedCity: "로마" },
        
        // 방콕 (태국)
        { hashtag: "#방콕여행", category: "travel", relatedCity: "방콕" },
        { hashtag: "#방콕맛집", category: "food", relatedCity: "방콕" },
        { hashtag: "#카오산로드", category: "landmark", relatedCity: "방콕" },
        { hashtag: "#왓포", category: "landmark", relatedCity: "방콕" },
        { hashtag: "#아이콘시암", category: "landmark", relatedCity: "방콕" },
        
        // 뉴욕 (미국)
        { hashtag: "#뉴욕여행", category: "travel", relatedCity: "뉴욕" },
        { hashtag: "#뉴욕맛집", category: "food", relatedCity: "뉴욕" },
        { hashtag: "#타임스퀘어", category: "landmark", relatedCity: "뉴욕" },
        { hashtag: "#센트럴파크", category: "landmark", relatedCity: "뉴욕" },
        { hashtag: "#자유의여신상", category: "landmark", relatedCity: "뉴욕" },
        
        // 런던 (영국)
        { hashtag: "#런던여행", category: "travel", relatedCity: "런던" },
        { hashtag: "#런던맛집", category: "food", relatedCity: "런던" },
        { hashtag: "#빅벤", category: "landmark", relatedCity: "런던" },
        { hashtag: "#타워브릿지", category: "landmark", relatedCity: "런던" },
        
        // 바르셀로나 (스페인)
        { hashtag: "#바르셀로나여행", category: "travel", relatedCity: "바르셀로나" },
        { hashtag: "#사그라다파밀리아", category: "landmark", relatedCity: "바르셀로나" },
        { hashtag: "#구엘공원", category: "landmark", relatedCity: "바르셀로나" },
        
        // 싱가포르
        { hashtag: "#싱가포르여행", category: "travel", relatedCity: "싱가포르" },
        { hashtag: "#마리나베이샌즈", category: "landmark", relatedCity: "싱가포르" },
        { hashtag: "#가든스바이더베이", category: "landmark", relatedCity: "싱가포르" },
        
        // 홍콩
        { hashtag: "#홍콩여행", category: "travel", relatedCity: "홍콩" },
        { hashtag: "#홍콩맛집", category: "food", relatedCity: "홍콩" },
        { hashtag: "#빅토리아피크", category: "landmark", relatedCity: "홍콩" },
        
        // 다낭/베트남
        { hashtag: "#다낭여행", category: "travel", relatedCity: "다낭" },
        { hashtag: "#다낭맛집", category: "food", relatedCity: "다낭" },
        { hashtag: "#바나힐", category: "landmark", relatedCity: "다낭" },
        { hashtag: "#미케비치", category: "landmark", relatedCity: "다낭" },
        { hashtag: "#하노이여행", category: "travel", relatedCity: "하노이" },
        { hashtag: "#하노이맛집", category: "food", relatedCity: "하노이" },
      ];
      
      let hashtagsAdded = 0;
      
      for (const tag of defaultHashtags) {
        try {
          await db
            .insert(instagramHashtags)
            .values({
              hashtag: tag.hashtag,
              category: tag.category,
            })
            .onConflictDoNothing();
          hashtagsAdded++;
        } catch (e) {
        }
      }
      
      res.json({ 
        message: "기본 Instagram 해시태그가 추가되었습니다",
        hashtagsAdded
      });
    } catch (error) {
      console.error("Error seeding instagram hashtags:", error);
      res.status(500).json({ error: "Failed to seed instagram hashtags" });
    }
  });

  // ========================================
  // Instagram 해시태그 관리
  // ========================================

  app.get("/api/admin/instagram/hashtags", async (req, res) => {
    try {
      const hashtags = await db
        .select()
        .from(instagramHashtags)
        .orderBy(desc(instagramHashtags.postCount));
      res.json(hashtags);
    } catch (error) {
      console.error("Error fetching hashtags:", error);
      res.status(500).json({ error: "Failed to fetch hashtags" });
    }
  });

  app.post("/api/admin/instagram/hashtags", async (req, res) => {
    try {
      const { hashtag, category, linkedPlaceId, linkedCityId } = req.body;
      
      if (!hashtag) {
        return res.status(400).json({ error: "Hashtag is required" });
      }

      const cleanHashtag = hashtag.startsWith("#") ? hashtag : `#${hashtag}`;

      const [newHashtag] = await db
        .insert(instagramHashtags)
        .values({
          hashtag: cleanHashtag,
          category,
          linkedPlaceId,
          linkedCityId,
        })
        .returning();

      res.json(newHashtag);
    } catch (error) {
      console.error("Error adding hashtag:", error);
      res.status(500).json({ error: "Failed to add hashtag" });
    }
  });

  app.delete("/api/admin/instagram/hashtags/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(instagramHashtags).where(eq(instagramHashtags.id, id));
      res.json({ message: "Hashtag deleted" });
    } catch (error) {
      console.error("Error deleting hashtag:", error);
      res.status(500).json({ error: "Failed to delete hashtag" });
    }
  });

  app.post("/api/admin/instagram/hashtags/:id/sync", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await instagramCrawler.syncHashtag(id);
      res.json(result);
    } catch (error) {
      console.error("Error syncing hashtag:", error);
      res.status(500).json({ error: "Failed to sync hashtag" });
    }
  });

  // ========================================
  // Instagram 위치 관리
  // ========================================

  app.get("/api/admin/instagram/locations", async (req, res) => {
    try {
      const locations = await db
        .select()
        .from(instagramLocations)
        .orderBy(desc(instagramLocations.postCount));
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.post("/api/admin/instagram/locations", async (req, res) => {
    try {
      const { locationId, locationName, linkedPlaceId, linkedCityId } = req.body;
      
      if (!locationId || !locationName) {
        return res.status(400).json({ error: "Location ID and name are required" });
      }

      const [newLocation] = await db
        .insert(instagramLocations)
        .values({
          locationId,
          locationName,
          linkedPlaceId,
          linkedCityId,
        })
        .returning();

      res.json(newLocation);
    } catch (error) {
      console.error("Error adding location:", error);
      res.status(500).json({ error: "Failed to add location" });
    }
  });

  app.delete("/api/admin/instagram/locations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(instagramLocations).where(eq(instagramLocations.id, id));
      res.json({ message: "Location deleted" });
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  app.post("/api/admin/instagram/locations/:id/sync", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await instagramCrawler.syncLocation(id);
      res.json(result);
    } catch (error) {
      console.error("Error syncing location:", error);
      res.status(500).json({ error: "Failed to sync location" });
    }
  });

  // ========================================
  // Instagram 전체 동기화
  // ========================================

  app.post("/api/admin/instagram/sync-all", async (req, res) => {
    try {
      const [hashtagResult, locationResult] = await Promise.all([
        instagramCrawler.syncAllHashtags(),
        instagramCrawler.syncAllLocations(),
      ]);

      res.json({
        hashtags: hashtagResult,
        locations: locationResult,
      });
    } catch (error) {
      console.error("Error syncing all Instagram data:", error);
      res.status(500).json({ error: "Failed to sync Instagram data" });
    }
  });

  app.get("/api/admin/instagram/stats", async (req, res) => {
    try {
      const stats = await instagramCrawler.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching Instagram stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // 기본 인스타그램 해시태그 시드
  app.post("/api/admin/instagram/seed", async (req, res) => {
    try {
      const defaultHashtags = [
        { hashtag: "#에펠탑", category: "landmark" },
        { hashtag: "#파리여행", category: "travel" },
        { hashtag: "#도쿄여행", category: "travel" },
        { hashtag: "#오사카맛집", category: "food" },
        { hashtag: "#방콕여행", category: "travel" },
        { hashtag: "#성수동카페", category: "cafe" },
        { hashtag: "#제주도여행", category: "travel" },
        { hashtag: "#뉴욕여행", category: "travel" },
        { hashtag: "#로마여행", category: "travel" },
        { hashtag: "#런던여행", category: "travel" },
      ];

      let added = 0;
      for (const tag of defaultHashtags) {
        try {
          await db.insert(instagramHashtags).values(tag).onConflictDoNothing();
          added++;
        } catch (e) {}
      }

      res.json({ message: "기본 해시태그가 추가되었습니다", added });
    } catch (error) {
      console.error("Error seeding hashtags:", error);
      res.status(500).json({ error: "Failed to seed hashtags" });
    }
  });

  // ========================================
  // Instagram 자동 수집 API
  // ========================================

  app.post("/api/admin/instagram/collect/place/:id", async (req, res) => {
    try {
      const placeId = parseInt(req.params.id);
      const { instagramAutoCollector } = await import("./services/instagram-auto-collector");
      
      const result = await instagramAutoCollector.collectForPlace(placeId);
      
      res.json({
        message: `Instagram 데이터 수집 완료`,
        ...result,
      });
    } catch (error) {
      console.error("Error collecting Instagram for place:", error);
      res.status(500).json({ error: "Failed to collect Instagram data" });
    }
  });

  app.post("/api/admin/instagram/collect/city/:id", async (req, res) => {
    try {
      const cityId = parseInt(req.params.id);
      const { instagramAutoCollector } = await import("./services/instagram-auto-collector");
      
      const result = await instagramAutoCollector.collectForCity(cityId);
      
      res.json({
        message: `도시 내 모든 장소 Instagram 데이터 수집 완료`,
        ...result,
      });
    } catch (error) {
      console.error("Error collecting Instagram for city:", error);
      res.status(500).json({ error: "Failed to collect Instagram data for city" });
    }
  });

  app.get("/api/admin/places/:id/instagram", async (req, res) => {
    try {
      const placeId = parseInt(req.params.id);
      
      const place = await db.query.places.findFirst({
        where: eq(places.id, placeId),
      });
      
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      
      res.json({
        placeId: place.id,
        name: place.name,
        googlePhotoCount: place.photoUrls?.length || 0,
        instagramPhotoCount: place.instagramPhotoUrls?.length || 0,
        instagramHashtags: place.instagramHashtags || [],
        instagramPostCount: place.instagramPostCount || 0,
        photoUrls: {
          google: place.photoUrls || [],
          instagram: place.instagramPhotoUrls || [],
        },
      });
    } catch (error) {
      console.error("Error fetching place Instagram data:", error);
      res.status(500).json({ error: "Failed to fetch place Instagram data" });
    }
  });

  // ========================================
  // 위기 정보 API (Crisis Alerts)
  // ========================================
  
  app.get("/api/admin/crisis/stats", async (req, res) => {
    try {
      const { getCrisisStats } = await import("./services/crisis-crawler");
      const stats = await getCrisisStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching crisis stats:", error);
      res.status(500).json({ error: "Failed to fetch crisis stats" });
    }
  });

  app.get("/api/admin/crisis/alerts", async (req, res) => {
    try {
      const { getActiveCrisisAlerts } = await import("./services/crisis-crawler");
      const cityId = req.query.cityId ? parseInt(req.query.cityId as string) : undefined;
      const alerts = await getActiveCrisisAlerts(cityId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching crisis alerts:", error);
      res.status(500).json({ error: "Failed to fetch crisis alerts" });
    }
  });

  app.post("/api/admin/crisis/sync", async (req, res) => {
    try {
      const { crawlCrisisAlerts } = await import("./services/crisis-crawler");
      const cityId = req.body.cityId ? parseInt(req.body.cityId) : undefined;
      const result = await crawlCrisisAlerts(cityId);
      res.json({
        message: "위기 정보 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing crisis alerts:", error);
      res.status(500).json({ error: "Failed to sync crisis alerts" });
    }
  });

  // ========================================
  // Gemini Web Search API (미슐랭/TripAdvisor)
  // ========================================

  app.get("/api/admin/websearch/stats", async (req, res) => {
    try {
      const { getWebSearchStats } = await import("./services/gemini-web-search");
      const stats = await getWebSearchStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching web search stats:", error);
      res.status(500).json({ error: "Failed to fetch web search stats" });
    }
  });

  app.post("/api/admin/websearch/enrich/:placeId", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const { enrichPlaceWithWebData } = await import("./services/gemini-web-search");
      const result = await enrichPlaceWithWebData(placeId);
      res.json({
        message: "웹 검색 데이터 보강 완료",
        ...result
      });
    } catch (error) {
      console.error("Error enriching place with web data:", error);
      res.status(500).json({ error: "Failed to enrich place with web data" });
    }
  });

  app.post("/api/admin/websearch/michelin", async (req, res) => {
    try {
      const { placeName, cityName, placeId } = req.body;
      if (!placeName || !cityName) {
        return res.status(400).json({ error: "placeName and cityName are required" });
      }
      const { searchMichelinInfo } = await import("./services/gemini-web-search");
      const result = await searchMichelinInfo(placeName, cityName, placeId);
      res.json(result);
    } catch (error) {
      console.error("Error searching Michelin info:", error);
      res.status(500).json({ error: "Failed to search Michelin info" });
    }
  });

  app.post("/api/admin/websearch/tripadvisor", async (req, res) => {
    try {
      const { placeName, cityName, placeId } = req.body;
      if (!placeName || !cityName) {
        return res.status(400).json({ error: "placeName and cityName are required" });
      }
      const { searchTripAdvisorInfo } = await import("./services/gemini-web-search");
      const result = await searchTripAdvisorInfo(placeName, cityName, placeId);
      res.json(result);
    } catch (error) {
      console.error("Error searching TripAdvisor info:", error);
      res.status(500).json({ error: "Failed to search TripAdvisor info" });
    }
  });

  // ========================================
  // 가격 정보 API
  // ========================================

  app.get("/api/admin/prices/stats", async (req, res) => {
    try {
      const { getPriceStats } = await import("./services/price-crawler");
      const stats = await getPriceStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching price stats:", error);
      res.status(500).json({ error: "Failed to fetch price stats" });
    }
  });

  app.get("/api/admin/prices/place/:placeId", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const { getPlacePrices } = await import("./services/price-crawler");
      const result = await getPlacePrices(placeId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching place prices:", error);
      res.status(500).json({ error: "Failed to fetch place prices" });
    }
  });

  app.post("/api/admin/prices/sync/city/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { crawlPricesForCity } = await import("./services/price-crawler");
      const result = await crawlPricesForCity(cityId);
      res.json({
        message: "가격 정보 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing city prices:", error);
      res.status(500).json({ error: "Failed to sync city prices" });
    }
  });

  app.post("/api/admin/prices/sync/all", async (req, res) => {
    try {
      const { crawlAllPrices } = await import("./services/price-crawler");
      const result = await crawlAllPrices();
      res.json({
        message: "전체 가격 정보 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing all prices:", error);
      res.status(500).json({ error: "Failed to sync all prices" });
    }
  });

  // ========================================
  // 네이버 블로그 API
  // ========================================

  app.get("/api/admin/naver-blog/stats", async (req, res) => {
    try {
      const { getBlogStats } = await import("./services/naver-blog-crawler");
      const stats = await getBlogStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching blog stats:", error);
      res.status(500).json({ error: "Failed to fetch blog stats" });
    }
  });

  app.get("/api/admin/naver-blog/city/:cityId/insights", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { getCityBlogInsights } = await import("./services/naver-blog-crawler");
      const insights = await getCityBlogInsights(cityId);
      res.json(insights);
    } catch (error) {
      console.error("Error fetching city blog insights:", error);
      res.status(500).json({ error: "Failed to fetch city blog insights" });
    }
  });

  app.post("/api/admin/naver-blog/sync/city/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { crawlBlogsForCity } = await import("./services/naver-blog-crawler");
      const result = await crawlBlogsForCity(cityId);
      res.json({
        message: "네이버 블로그 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing city blogs:", error);
      res.status(500).json({ error: "Failed to sync city blogs" });
    }
  });

  app.post("/api/admin/naver-blog/sync/all", async (req, res) => {
    try {
      const { crawlAllBlogs } = await import("./services/naver-blog-crawler");
      const result = await crawlAllBlogs();
      res.json({
        message: "전체 블로그 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing all blogs:", error);
      res.status(500).json({ error: "Failed to sync all blogs" });
    }
  });

  // ========================================
  // 날씨 API
  // ========================================

  app.get("/api/admin/weather/stats", async (req, res) => {
    try {
      const { getWeatherStats } = await import("./services/weather-crawler");
      const stats = await getWeatherStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching weather stats:", error);
      res.status(500).json({ error: "Failed to fetch weather stats" });
    }
  });

  app.get("/api/admin/weather/city/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { getCityWeather } = await import("./services/weather-crawler");
      const weather = await getCityWeather(cityId);
      res.json(weather);
    } catch (error) {
      console.error("Error fetching city weather:", error);
      res.status(500).json({ error: "Failed to fetch city weather" });
    }
  });

  app.post("/api/admin/weather/sync/city/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { fetchWeatherForCity } = await import("./services/weather-crawler");
      const result = await fetchWeatherForCity(cityId);
      res.json({
        message: "날씨 정보 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing city weather:", error);
      res.status(500).json({ error: "Failed to sync city weather" });
    }
  });

  app.post("/api/admin/weather/sync/all", async (req, res) => {
    try {
      const { syncAllCitiesWeather } = await import("./services/weather-crawler");
      const result = await syncAllCitiesWeather();
      res.json({
        message: "전체 날씨 정보 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing all weather:", error);
      res.status(500).json({ error: "Failed to sync all weather" });
    }
  });

  // ========================================
  // TripAdvisor API (Gemini Search)
  // ========================================

  app.get("/api/admin/tripadvisor/stats", async (req, res) => {
    try {
      const { getTripAdvisorStats } = await import("./services/tripadvisor-crawler");
      const stats = await getTripAdvisorStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching TripAdvisor stats:", error);
      res.status(500).json({ error: "Failed to fetch TripAdvisor stats" });
    }
  });

  app.get("/api/admin/tripadvisor/place/:placeId", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const { getPlaceTripAdvisorData } = await import("./services/tripadvisor-crawler");
      const data = await getPlaceTripAdvisorData(placeId);
      res.json(data || { message: "No TripAdvisor data found" });
    } catch (error) {
      console.error("Error fetching place TripAdvisor data:", error);
      res.status(500).json({ error: "Failed to fetch TripAdvisor data" });
    }
  });

  app.post("/api/admin/tripadvisor/sync/city/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { crawlTripAdvisorForCity } = await import("./services/tripadvisor-crawler");
      const result = await crawlTripAdvisorForCity(cityId);
      res.json({
        message: "TripAdvisor 데이터 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing city TripAdvisor:", error);
      res.status(500).json({ error: "Failed to sync TripAdvisor data" });
    }
  });

  app.post("/api/admin/tripadvisor/sync/all", async (req, res) => {
    try {
      const { crawlAllTripAdvisor } = await import("./services/tripadvisor-crawler");
      const result = await crawlAllTripAdvisor();
      res.json({
        message: "전체 TripAdvisor 데이터 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing all TripAdvisor:", error);
      res.status(500).json({ error: "Failed to sync all TripAdvisor data" });
    }
  });

  // ========================================
  // 프랑스 교통 비용 API (가이드 검증 데이터)
  // ========================================

  app.get("/api/admin/transport/france/all", async (req, res) => {
    try {
      const { getTransportPrices } = await import("./services/france-transport-service");
      const data = getTransportPrices();
      res.json(data);
    } catch (error) {
      console.error("Error fetching transport prices:", error);
      res.status(500).json({ error: "Failed to fetch transport prices" });
    }
  });

  app.get("/api/admin/transport/france/version", async (req, res) => {
    try {
      const { getDataVersion } = await import("./services/france-transport-service");
      res.json(getDataVersion());
    } catch (error) {
      console.error("Error fetching data version:", error);
      res.status(500).json({ error: "Failed to fetch data version" });
    }
  });

  app.get("/api/admin/transport/france/airport", async (req, res) => {
    try {
      const { getAirportTransferPrices } = await import("./services/france-transport-service");
      res.json(getAirportTransferPrices());
    } catch (error) {
      console.error("Error fetching airport prices:", error);
      res.status(500).json({ error: "Failed to fetch airport prices" });
    }
  });

  app.get("/api/admin/transport/france/charter", async (req, res) => {
    try {
      const { getVehicleCharterPrices } = await import("./services/france-transport-service");
      res.json(getVehicleCharterPrices());
    } catch (error) {
      console.error("Error fetching charter prices:", error);
      res.status(500).json({ error: "Failed to fetch charter prices" });
    }
  });

  app.get("/api/admin/transport/france/bus", async (req, res) => {
    try {
      const { getBusCharterPrices } = await import("./services/france-transport-service");
      res.json(getBusCharterPrices());
    } catch (error) {
      console.error("Error fetching bus prices:", error);
      res.status(500).json({ error: "Failed to fetch bus prices" });
    }
  });

  app.get("/api/admin/transport/france/comparison", async (req, res) => {
    try {
      const { getRideshareComparison } = await import("./services/france-transport-service");
      res.json(getRideshareComparison());
    } catch (error) {
      console.error("Error fetching rideshare comparison:", error);
      res.status(500).json({ error: "Failed to fetch rideshare comparison" });
    }
  });

  app.get("/api/admin/transport/france/price/:priceId", async (req, res) => {
    try {
      const { getPriceById } = await import("./services/france-transport-service");
      const price = getPriceById(req.params.priceId);
      if (!price) {
        return res.status(404).json({ error: "Price not found" });
      }
      res.json(price);
    } catch (error) {
      console.error("Error fetching price:", error);
      res.status(500).json({ error: "Failed to fetch price" });
    }
  });

  app.post("/api/admin/transport/france/calculate", async (req, res) => {
    try {
      const { calculateTransportCost } = await import("./services/france-transport-service");
      const result = calculateTransportCost(req.body);
      res.json(result);
    } catch (error) {
      console.error("Error calculating transport cost:", error);
      res.status(500).json({ error: "Failed to calculate transport cost" });
    }
  });

  app.post("/api/admin/transport/france/suggest", async (req, res) => {
    try {
      const { getItineraryTransportSuggestion } = await import("./services/france-transport-service");
      const result = getItineraryTransportSuggestion(req.body);
      res.json(result);
    } catch (error) {
      console.error("Error getting transport suggestion:", error);
      res.status(500).json({ error: "Failed to get transport suggestion" });
    }
  });

  // ========================================
  // 가이드 가격 관리 API (Admin에서 수정 가능)
  // ========================================
  
  app.get("/api/admin/guide-prices", async (req, res) => {
    try {
      const { guidePrices } = await import("../shared/schema");
      const prices = await db.select().from(guidePrices);
      res.json(prices);
    } catch (error) {
      console.error("Error fetching guide prices:", error);
      res.status(500).json({ error: "Failed to fetch guide prices" });
    }
  });

  app.put("/api/admin/guide-prices/:id", async (req, res) => {
    try {
      const { guidePrices } = await import("../shared/schema");
      const id = parseInt(req.params.id);
      const { pricePerDay, priceLow, priceHigh, description, features } = req.body;
      
      const [updated] = await db.update(guidePrices)
        .set({ 
          pricePerDay, 
          priceLow, 
          priceHigh,
          description,
          features,
          lastUpdated: new Date()
        })
        .where(eq(guidePrices.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Guide price not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating guide price:", error);
      res.status(500).json({ error: "Failed to update guide price" });
    }
  });

  app.post("/api/admin/guide-prices/seed", async (req, res) => {
    try {
      const { guidePrices } = await import("../shared/schema");
      
      const seedData = [
        { serviceType: 'walking', serviceName: '워킹 가이드 (반일)', pricePerDay: 420, priceLow: 420, priceHigh: 420, unit: 'day', description: '시내/박물관 워킹 투어', features: ['공인 가이드', '차량 미포함'] },
        { serviceType: 'sedan', serviceName: '세단 가이드 (전일)', pricePerDay: 600, priceLow: 600, priceHigh: 600, unit: 'day', description: '비즈니스 세단 + 가이드', features: ['E-Class', '8-10시간', '주행거리 포함'] },
        { serviceType: 'vip', serviceName: 'VIP 전담 (전일)', pricePerDay: 1015, priceLow: 880, priceHigh: 1015, unit: 'day', description: '최상위 VIP 밴 서비스', features: ['럭셔리 미니밴', '의전 서비스', '전담 가이드'] },
        { serviceType: 'airport_sedan', serviceName: '공항 픽업 (비즈니스 세단)', pricePerDay: null, priceLow: 117, priceHigh: 152, unit: 'trip', description: 'CDG 공항 픽업', features: ['60분 대기 무료', '피켓 마중'] },
        { serviceType: 'airport_vip', serviceName: '공항 픽업 (럭셔리 세단)', pricePerDay: null, priceLow: 234, priceHigh: 480, unit: 'trip', description: 'CDG VIP 픽업', features: ['S-Class', 'VIP 서비스'] },
      ];
      
      for (const data of seedData) {
        await db.insert(guidePrices).values({
          ...data,
          currency: 'EUR',
          isActive: true,
          source: 'guide_verified',
        }).onConflictDoNothing();
      }
      
      const allPrices = await db.select().from(guidePrices);
      res.json({ success: true, count: allPrices.length, prices: allPrices });
    } catch (error) {
      console.error("Error seeding guide prices:", error);
      res.status(500).json({ error: "Failed to seed guide prices" });
    }
  });

  // ========================================
  // 예산 계산 API
  // ========================================
  
  app.post("/api/budget/calculate", async (req, res) => {
    try {
      const { budgetCalculator } = await import("./services/budget-calculator");
      const { days, companionCount, mealLevel, guideOption, mobilityStyle, mealsPerDay = 2, placeIds } = req.body;
      
      const result = await budgetCalculator.calculateBudget({
        days,
        companionCount,
        mealLevel,
        guideOption,
        mobilityStyle,
        mealsPerDay,
        placeIds,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error calculating budget:", error);
      res.status(500).json({ error: "Failed to calculate budget" });
    }
  });

  app.post("/api/budget/quick-estimate", async (req, res) => {
    try {
      const { budgetCalculator } = await import("./services/budget-calculator");
      const { days, companionCount, mealLevel, guideOption } = req.body;
      
      const result = await budgetCalculator.estimateQuickBudget(
        days,
        companionCount,
        mealLevel,
        guideOption
      );
      
      res.json(result);
    } catch (error) {
      console.error("Error estimating budget:", error);
      res.status(500).json({ error: "Failed to estimate budget" });
    }
  });
}
