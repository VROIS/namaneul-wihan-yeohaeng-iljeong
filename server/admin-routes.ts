import type { Express } from "express";
import { db, isDatabaseConnected } from "./db";
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
  weatherForecast,
  apiKeys,
  celebrityPlaceEvidence,
  celebEvidence
} from "../shared/schema";
import { instagramCrawler } from "./services/instagram-crawler";
import { eq, desc, sql, count, and, gte } from "drizzle-orm";

// DB 연결 없이 반환할 기본 대시보드 데이터
const DEFAULT_DASHBOARD_DATA = {
  overview: {
    cities: 0,
    places: 0,
    youtubeChannels: 0,
    blogSources: 0,
    freshDataRatio: 0
  },
  apiServices: [],
  recentSyncs: [],
  dbConnected: false
};

export function registerAdminRoutes(app: Express) {
  const isPausedCostCrawler = async (taskName: string): Promise<boolean> => {
    const { DataScheduler } = await import("./services/data-scheduler");
    return DataScheduler.isTaskDisabledByPolicy(taskName);
  };

  const rejectIfPaused = async (taskName: string, res: any): Promise<boolean> => {
    if (await isPausedCostCrawler(taskName)) {
      res.status(423).json({
        success: false,
        error: `${taskName}은(는) 비용 절감 정책으로 현재 일시 중단되었습니다.`,
      });
      return true;
    }
    return false;
  };
  
  app.get("/admin", (req, res) => {
    // 여러 경로에서 템플릿 검색 (개발 환경 + 빌드된 환경 모두 지원)
    const possiblePaths = [
      path.join(__dirname, "templates", "admin-dashboard.html"),
      path.join(process.cwd(), "server", "templates", "admin-dashboard.html"),
      path.join(process.cwd(), "server_dist", "templates", "admin-dashboard.html"),
    ];
    
    const templatePath = possiblePaths.find(p => fs.existsSync(p));
    
    if (templatePath) {
      res.sendFile(templatePath);
    } else {
      console.error("[Admin] Template not found. Searched paths:", possiblePaths);
      res.status(404).send("Admin dashboard not found. Searched: " + possiblePaths.join(", "));
    }
  });
  
  // ========================================
  // 대시보드 현황 API
  // ========================================
  
  app.get("/api/admin/dashboard", async (req, res) => {
    // DB 연결이 없으면 기본 데이터 반환
    if (!isDatabaseConnected() || !db) {
      return res.json({
        ...DEFAULT_DASHBOARD_DATA,
        message: "DB 연결이 필요합니다. .env 파일에 DATABASE_URL을 설정하세요."
      });
    }
    
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
        recentSyncs,
        dbConnected: true
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

      // 미슐랭 통계 가져오기
      let michelinStats = { totalWithMichelin: 0, stars3: 0, stars2: 0, stars1: 0, bibGourmand: 0, recommended: 0 };
      try {
        const { getMichelinStats } = await import("./services/michelin-crawler");
        michelinStats = await getMichelinStats();
      } catch (e) {
        console.log("[Admin] Michelin stats not available");
      }

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
        michelin: {
          total: michelinStats.totalWithMichelin,
          stars3: michelinStats.stars3,
          stars2: michelinStats.stars2,
          stars1: michelinStats.stars1,
          bibGourmand: michelinStats.bibGourmand,
          recommended: michelinStats.recommended
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
        AI_INTEGRATIONS_GEMINI_API_KEY: !!(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY),
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
    
    // API 키가 설정되어 있으면 "healthy"로 표시 (호출 전이라도)
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
          return !!(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY);
        default:
          return false;
      }
    })();
    
    if (!service.lastCallAt) {
      if (isConfigured) {
        return { status: "healthy", message: "설정됨 (대기 중)", lastCall, errorMessage };
      }
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
        { serviceName: "wikimedia_commons", displayName: "Wikimedia Commons (무료)", dailyQuota: null, monthlyQuota: null },
        { serviceName: "opentripmap", displayName: "OpenTripMap (무료)", dailyQuota: null, monthlyQuota: null },
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
            case "wikimedia_commons":
            case "opentripmap":
              return true;
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

      // Google Maps/Places API 테스트 (DB 키 우선 - 테스트 버튼과 동일한 키 사용)
      let googleMapsKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
      if (isDatabaseConnected() && db) {
        const [row] = await db.select({ keyValue: apiKeys.keyValue }).from(apiKeys).where(eq(apiKeys.keyName, "GOOGLE_MAPS_API_KEY")).limit(1);
        if (row?.keyValue) googleMapsKey = row.keyValue;
      }
      if (googleMapsKey) {
        await checkWithTimeout("google_maps", async () => {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Paris&key=${googleMapsKey}`
          );
          const data = await response.json();
          if (data.status === "REQUEST_DENIED") {
            throw new Error(data.error_message || "Places API 미활성화");
          }
        });
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
      const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (geminiKey) {
        // Google AI Studio 직접 API 사용
        await checkWithTimeout("gemini", async () => {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: "test"
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

      // DB에 상태 업데이트 (DB 연결이 있을 때만)
      if (isDatabaseConnected() && db) {
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
      }

      res.json({
        timestamp: new Date().toISOString(),
        services: healthResults,
        dbConnected: isDatabaseConnected()
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
      const { channelName, isActive, trustWeight, category } = req.body;
      
      const [channel] = await db
        .update(youtubeChannels)
        .set({
          ...(channelName !== undefined && { channelName }),
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
      const { sourceName, isActive, trustWeight, category } = req.body;
      
      const [source] = await db
        .update(blogSources)
        .set({
          ...(sourceName !== undefined && { sourceName }),
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
        { taskName: "mcp_workflow_france_phase1", description: "MCP 프랑스30 자동 배치(유럽은 승인 후 수동)", cronExpression: "0 2 * * 0" },
        { taskName: "mcp_raw_stage1", description: "MCP 1단계 로우데이터 수집", cronExpression: "0 2 * * 0" },
        { taskName: "mcp_raw_stage2", description: "MCP 2단계 한국인 인지도 보강", cronExpression: "30 2 * * 0" },
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
      
      // 🎯 실제 동기화 로그 기반 신선도 측정 (dataSyncLog 테이블 활용)
      const syncLogs = await db.select({
        entityType: dataSyncLog.entityType,
        startedAt: dataSyncLog.startedAt,
        status: dataSyncLog.status,
        itemsProcessed: dataSyncLog.itemsProcessed,
      }).from(dataSyncLog)
        .where(eq(dataSyncLog.status, 'success'))
        .orderBy(desc(dataSyncLog.startedAt));
      
      // 엔티티 타입별 마지막 동기화 시간
      const entityLastSync: Record<string, Date> = {};
      for (const log of syncLogs) {
        if (!entityLastSync[log.entityType]) {
          entityLastSync[log.entityType] = new Date(log.startedAt);
        }
      }
      
      // 주요 데이터 소스 목록
      const dataSources = [
        { key: 'youtube', label: 'YouTube 영상', table: 'youtube_videos' },
        { key: 'naver_blog', label: '네이버 블로그', table: 'naver_blog_posts' },
        { key: 'instagram', label: '인스타그램', table: 'instagram_hashtags' },
        { key: 'weather', label: '날씨 정보', table: 'weather_forecast' },
        { key: 'crisis', label: '위기 정보', table: 'crisis_alerts' },
        { key: 'exchange_rate', label: '환율 정보', table: 'exchange_rates' },
        { key: 'places', label: '장소 정보', table: 'places' },
        { key: 'tripadvisor', label: 'TripAdvisor', table: 'tripadvisor_data' },
      ];
      
      const freshness = {
        fresh: 0,    // 0-7일
        recent: 0,   // 8-14일
        aging: 0,    // 15-30일
        stale: 0,    // 31일+
        never: 0,    // 동기화 없음
        details: [] as any[]
      };
      
      for (const source of dataSources) {
        const lastSync = entityLastSync[source.key] || entityLastSync[source.table];
        
        if (!lastSync) {
          freshness.never++;
          freshness.details.push({ name: source.label, status: 'never', lastSync: null });
        } else if (lastSync >= sevenDays) {
          freshness.fresh++;
          freshness.details.push({ name: source.label, status: 'fresh', lastSync });
        } else if (lastSync >= fourteenDays) {
          freshness.recent++;
          freshness.details.push({ name: source.label, status: 'recent', lastSync });
        } else if (lastSync >= thirtyDays) {
          freshness.aging++;
          freshness.details.push({ name: source.label, status: 'aging', lastSync });
        } else {
          freshness.stale++;
          freshness.details.push({ name: source.label, status: 'stale', lastSync });
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
        total: dataSources.length,
        needsUpdate: freshness.details.filter(d => d.status !== 'fresh')
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
  
  app.get("/api/admin/celebrity-evidence/stats", async (req, res) => {
    try {
      if (!db) return res.json({ total: 0, celebs: 0, sample: [] });
      const [totalRow] = await db.select({ count: count() }).from(celebrityPlaceEvidence);
      const [celebRow] = await db.select({ count: count() }).from(celebEvidence).where(eq(celebEvidence.isActive, true));
      const sample = await db
        .select({
          placeName: places.name,
          imageUrl: celebrityPlaceEvidence.imageUrl,
          celebName: celebEvidence.name,
          postUrl: celebrityPlaceEvidence.postUrl
        })
        .from(celebrityPlaceEvidence)
        .innerJoin(places, eq(places.id, celebrityPlaceEvidence.placeId))
        .innerJoin(celebEvidence, eq(celebEvidence.id, celebrityPlaceEvidence.celebId))
        .orderBy(desc(celebrityPlaceEvidence.createdAt))
        .limit(10);
      res.json({ total: totalRow?.count ?? 0, celebs: celebRow?.count ?? 0, sample });
    } catch (e) {
      console.error("[Admin] celebrity-evidence/stats:", e);
      res.status(500).json({ error: "Failed to fetch" });
    }
  });

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
      if (taskName && (await rejectIfPaused(String(taskName), res))) return;
      
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
      if (await rejectIfPaused("youtube_sync", res)) return;
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

  // YouTube 영상 재처리 리셋 (isProcessed를 false로 리셋하여 장소 추출 재시도)
  app.post("/api/admin/youtube/reset-processing", async (req, res) => {
    try {
      const result = await db
        .update(youtubeVideos)
        .set({ isProcessed: false })
        .where(eq(youtubeVideos.isProcessed, true));
      
      const resetCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(youtubeVideos)
        .where(eq(youtubeVideos.isProcessed, false));
      
      console.log(`[YouTube] 영상 재처리 리셋: ${resetCount[0]?.count || 0}개 영상`);
      
      res.json({ 
        message: "YouTube 영상 재처리 리셋 완료",
        resetCount: Number(resetCount[0]?.count) || 0,
        instruction: "이제 YouTube 동기화를 실행하면 모든 영상에서 장소를 다시 추출합니다."
      });
    } catch (error) {
      console.error("Error resetting YouTube processing:", error);
      res.status(500).json({ error: "리셋 실패", details: String(error) });
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
      if (await rejectIfPaused("youtube_sync", res)) return;
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
  // Wikimedia Commons 동기화 (무료)
  // ========================================
  app.post("/api/admin/sync/wikimedia", async (req, res) => {
    try {
      const { syncWikimediaPhotos } = await import("./services/wikimedia-enrichment");
      const result = await syncWikimediaPhotos();
      await db.insert(dataSyncLog).values({
        entityType: "wikimedia_sync",
        source: "wikimedia_commons",
        status: result.success ? "success" : "partial",
        itemsProcessed: result.placesProcessed,
        completedAt: new Date(),
        errorMessage: result.errors?.length ? result.errors.slice(0, 3).join("; ") : null,
      });
      res.json({ message: "Wikimedia 사진 보강 완료", ...result });
    } catch (error: any) {
      res.status(500).json({ error: "Wikimedia 동기화 실패", details: String(error) });
    }
  });

  // ========================================
  // OpenTripMap 동기화 (무료)
  // ========================================
  app.post("/api/admin/sync/opentripmap", async (req, res) => {
    try {
      const { syncOpenTripMapDescriptions } = await import("./services/opentripmap-enrichment");
      const result = await syncOpenTripMapDescriptions();
      await db.insert(dataSyncLog).values({
        entityType: "opentripmap_sync",
        source: "opentripmap",
        status: result.success ? "success" : "partial",
        itemsProcessed: result.placesProcessed,
        completedAt: new Date(),
        errorMessage: result.errors?.length ? result.errors.slice(0, 3).join("; ") : null,
      });
      res.json({ message: "OpenTripMap 설명 보강 완료", ...result });
    } catch (error: any) {
      res.status(500).json({ error: "OpenTripMap 동기화 실패", details: String(error) });
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
      if (await rejectIfPaused(taskName, res)) return;
      const { dataScheduler } = await import("./services/data-scheduler");
      const result = await dataScheduler.runNow(taskName);
      res.json(result);
    } catch (error) {
      console.error("Error running scheduler task:", error);
      res.status(500).json({ error: "스케줄러 태스크 실행 실패" });
    }
  });

  // 🌱 장소 시딩 자동 실행 on/off (일정 생성용 Places API 할당량 확보)
  app.get("/api/admin/scheduler/place-seed-toggle", async (req, res) => {
    try {
      const [row] = await db
        .select({ isEnabled: dataCollectionSchedule.isEnabled })
        .from(dataCollectionSchedule)
        .where(eq(dataCollectionSchedule.taskName, "place_seed_sync"))
        .limit(1);
      res.json({ enabled: row ? row.isEnabled !== false : true });
    } catch (error: any) {
      res.json({ enabled: true });
    }
  });

  app.post("/api/admin/scheduler/place-seed-toggle", async (req, res) => {
    try {
      const { enabled } = req.body;
      const isEnabled = enabled === true || enabled === "true";
      await db
        .insert(dataCollectionSchedule)
        .values({
          taskName: "place_seed_sync",
          description: "장소 시딩 (1일1카테고리, Google Places API)",
          cronExpression: "0 18 * * *",
          isEnabled,
        })
        .onConflictDoUpdate({
          target: dataCollectionSchedule.taskName,
          set: { isEnabled },
        });
      res.json({ enabled: isEnabled, message: isEnabled ? "장소 시딩 자동 실행 ON" : "장소 시딩 자동 실행 OFF (일정 생성용 할당량 확보)" });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "토글 실패" });
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
      const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
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
          message: geminiKey ? "설정됨" : "GEMINI_API_KEY 설정 필요"
        },
        exchangeRate: {
          configured: true,
          message: "무료 API 사용 (API 키 불필요)"
        },
        openWeather: {
          configured: !!openWeatherKey,
          message: openWeatherKey ? "설정됨" : "OPENWEATHER_API_KEY 환경변수 필요 (openweathermap.org에서 발급)"
        },
        wikimedia: {
          configured: true,
          message: "무료 API (장소 사진 보강)"
        },
        opentripmap: {
          configured: true,
          message: "무료 API (장소 설명 보강)"
        }
      };
      
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "API 상태 확인 실패" });
    }
  });

  // ========================================
  // 장소 시딩 API (Place Seeder)
  // ========================================

  // 단일 도시 시딩
  app.post("/api/admin/seed/places/city", async (req, res) => {
    try {
      const { cityId } = req.body;
      if (!cityId) {
        return res.json({ success: false, error: "cityId 필요" });
      }
      const { placeSeeder } = await import("./services/place-seeder");
      // 비동기 실행 (즉시 응답 반환)
      placeSeeder.seedCityPlaces(cityId).then(result => {
        console.log(`[Admin] 도시 ${cityId} 시딩 완료: ${result.seeded}개`);
      }).catch(err => {
        console.error(`[Admin] 도시 ${cityId} 시딩 실패:`, err);
      });
      res.json({ success: true, message: `도시 ${cityId} 시딩 시작됨 (백그라운드 실행)` });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // 다중 도시 시딩 (연쇄 실행)
  app.post("/api/admin/seed/places/batch", async (req, res) => {
    try {
      const { cityIds } = req.body;
      if (!cityIds || !Array.isArray(cityIds)) {
        return res.json({ success: false, error: "cityIds 배열 필요" });
      }
      const { placeSeeder } = await import("./services/place-seeder");
      // 비동기 실행 (즉시 응답 반환)
      placeSeeder.seedBatchCities(cityIds).then(result => {
        console.log(`[Admin] 배치 시딩 완료: ${result.citiesProcessed}개 도시, ${result.totalSeeded}개 장소`);
      }).catch(err => {
        console.error(`[Admin] 배치 시딩 실패:`, err);
      });
      res.json({ success: true, message: `${cityIds.length}개 도시 시딩 시작됨 (백그라운드 연쇄 실행)` });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // 전체 미시딩 도시 자동 시딩 (1차 목표까지 쉬지 않고)
  app.post("/api/admin/seed/places/all", async (req, res) => {
    try {
      const { placeSeeder } = await import("./services/place-seeder");
      // 비동기 실행 (즉시 응답 반환)
      placeSeeder.seedAllPendingCities().then(result => {
        console.log(`[Admin] 전체 시딩 완료: ${result.citiesProcessed}개 도시, ${result.totalSeeded}개 장소`);
      }).catch(err => {
        console.error(`[Admin] 전체 시딩 실패:`, err);
      });
      res.json({ success: true, message: "전체 미시딩 도시 시딩 시작됨 (백그라운드 연쇄 실행)" });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // 시딩 현황 조회
  app.get("/api/admin/seed/places/status", async (req, res) => {
    try {
      const { placeSeeder } = await import("./services/place-seeder");
      const status = await placeSeeder.getSeedingStatus();
      res.json({ success: true, ...status });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // 로우데이터 저장/가공/확보 보고 (검증용)
  app.get("/api/admin/seed/places/report", async (req, res) => {
    try {
      const cityId = req.query.cityId ? parseInt(String(req.query.cityId), 10) : null;
      const { db } = await import("./db");
      const { places, cities, youtubePlaceMentions, naverBlogPosts, instagramHashtags, placePrices } = await import("@shared/schema");
      const { eq, count, inArray, isNotNull, and } = await import("drizzle-orm");
      const targetCityId = cityId ?? (await db.select({ id: cities.id }).from(cities).where(eq(cities.name, "파리")).then(r => r[0]?.id));
      if (!targetCityId) return res.json({ success: false, error: "cityId 없음 (파리 또는 쿼리)" });

      const city = await db.select().from(cities).where(eq(cities.id, targetCityId)).then(r => r[0]);
      if (!city) return res.json({ success: false, error: "도시 없음" });

      const { placeSeeder } = await import("./services/place-seeder");
      const byCategory = await placeSeeder.getCityPlaceCountsByCategory(targetCityId);
      const placeIds = await db.select({ id: places.id }).from(places).where(eq(places.cityId, targetCityId)).then(r => r.map(x => x.id));
      const idList = placeIds.map(p => p.id);
      const hasPlaces = idList.length > 0;

      const [yt] = hasPlaces ? await db.select({ cnt: count() }).from(youtubePlaceMentions).where(inArray(youtubePlaceMentions.placeId, idList)) : [{ cnt: 0 }];
      const [nb] = await db.select({ cnt: count() }).from(naverBlogPosts).where(and(eq(naverBlogPosts.cityId, targetCityId), isNotNull(naverBlogPosts.placeId)));
      const [ig] = await db.select({ cnt: count() }).from(instagramHashtags).where(and(eq(instagramHashtags.linkedCityId, targetCityId), isNotNull(instagramHashtags.linkedPlaceId)));
      const [pp] = hasPlaces ? await db.select({ cnt: count() }).from(placePrices).where(inArray(placePrices.placeId, idList)) : [{ cnt: 0 }];

      res.json({
        success: true,
        city: { id: city.id, name: city.name },
        storage: { byCategory, total: byCategory.total },
        processing: { youtubeLinked: Number(yt?.cnt ?? 0), naverBlogLinked: Number(nb?.cnt ?? 0), instagramLinked: Number(ig?.cnt ?? 0), placePrices: Number(pp?.cnt ?? 0) },
        target: { perCategory: 30, activeCategories: ["attraction", "restaurant", "healing", "adventure", "hotspot"] },
      });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // 파리 1일 1카테고리 시딩 (수동 트리거)
  app.post("/api/admin/seed/places/paris-daily", async (req, res) => {
    try {
      const { placeSeeder } = await import("./services/place-seeder");
      const result = await placeSeeder.seedPriorityCityByCategory();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.json({ success: false, error: error?.message });
    }
  });

  // attraction→adventure 보정 (5카테고리 모두 존재하도록)
  app.post("/api/admin/seed/refine-adventure", async (req, res) => {
    try {
      const { placeSeeder } = await import("./services/place-seeder");
      const result = await placeSeeder.refineAdventureFromAttractions();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.json({ success: false, error: error?.message });
    }
  });

  // nubiReason 배치 수집 (카테고리별 30곳 → 10곳×3배치 Gemini 호출)
  app.post("/api/admin/nubi-reason/collect", async (req, res) => {
    try {
      const { cityId, category } = req.body;
      const targetCityId = cityId ?? null;
      const targetCategory = category ?? "attraction";
      if (!targetCityId) {
        return res.json({ success: false, error: "cityId 필요" });
      }
      const {
        collectNubiReasonsForCategory,
        getPlaceNamesForCategory,
      } = await import("./services/nubi-reason-batch-service");
      const { db } = await import("./db");
      const { cities } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const city = await db.select().from(cities).where(eq(cities.id, targetCityId)).then((r) => r[0]);
      if (!city) return res.json({ success: false, error: "도시 없음" });
      const placeNames = await getPlaceNamesForCategory(targetCityId, targetCategory, 30);
      if (placeNames.length === 0) {
        return res.json({ success: false, error: `해당 카테고리(${targetCategory}) 장소 없음` });
      }
      const result = await collectNubiReasonsForCategory(targetCityId, city.name, placeNames);
      res.json({
        success: true,
        cityId: targetCityId,
        cityName: city.name,
        category: targetCategory,
        placeCount: placeNames.length,
        ...result,
      });
    } catch (error: any) {
      res.json({ success: false, error: error?.message });
    }
  });

  // 전 도시 기존 장소 5개 카테고리로 분류정돈 (seed_category 보정)
  app.post("/api/admin/seed/reclassify-all", async (req, res) => {
    try {
      const { placeSeeder } = await import("./services/place-seeder");
      const result = await placeSeeder.reclassifyAllCitiesPlaces();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.json({ success: false, error: error?.message });
    }
  });

  // nubiReason 배치 수집 (10곳/회 Gemini + 4단계 검증)
  // POST /api/admin/nubi-reasons/collect?cityId=1&category=attraction
  app.post("/api/admin/nubi-reasons/collect", async (req, res) => {
    try {
      const cityId = req.query.cityId ? parseInt(String(req.query.cityId), 10) : null;
      const category = (req.query.category as string) || "attraction";
      if (!cityId) return res.json({ success: false, error: "cityId 쿼리 필요" });

      const { db } = await import("./db");
      const { cities } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const city = await db.select().from(cities).where(eq(cities.id, cityId)).then((r) => r[0]);
      if (!city) return res.json({ success: false, error: "도시 없음" });

      const {
        getPlaceNamesForCategory,
        collectNubiReasonsForCategory,
      } = await import("./services/nubi-reason-batch-service");

      const placeNames = await getPlaceNamesForCategory(cityId, category, 30);
      if (placeNames.length === 0) {
        return res.json({ success: true, totalSaved: 0, totalFailed: 0, message: "해당 카테고리 장소 없음" });
      }

      const result = await collectNubiReasonsForCategory(cityId, city.name, placeNames);
      res.json({
        success: true,
        cityId,
        cityName: city.name,
        category,
        placeCount: placeNames.length,
        ...result,
      });
    } catch (error: any) {
      res.json({ success: false, error: error?.message });
    }
  });

  // 파리 기존 장소 5개 카테고리로 분류정돈만 (seed_category 보정)
  app.post("/api/admin/seed/paris-reclassify", async (req, res) => {
    try {
      const { placeSeeder } = await import("./services/place-seeder");
      const result = await placeSeeder.reclassifyParisPlaces();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.json({ success: false, error: error?.message });
    }
  });

  // 파리 1차 완성: 분류정돈 + 카테고리별 부족분 채우기 (명소/맛집/힐링/모험 각 30곳)
  app.post("/api/admin/seed/paris-phase1", async (req, res) => {
    try {
      const { placeSeeder } = await import("./services/place-seeder");
      const result = await placeSeeder.completeParisPhase1();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.json({ success: false, error: error?.message });
    }
  });

  // 도시별 10개 크롤러 연쇄 실행 (시딩 없이 기존 장소 대상)
  app.post("/api/admin/crawl/city", async (req, res) => {
    try {
      const { cityId } = req.body;
      if (!cityId) return res.status(400).json({ success: false, error: "cityId 필요" });
      const { placeSeeder } = await import("./services/place-seeder");
      res.json({ success: true, message: `도시 ${cityId} 크롤러 연쇄 실행 시작 (백그라운드)` });
      placeSeeder.runChainedCrawlers(cityId, `city-${cityId}`).then(() => {
        console.log(`[Admin] 도시 ${cityId} 크롤러 완료`);
      }).catch(e => console.error(`[Admin] 크롤러 실패:`, e));
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Place Linker 수동 실행
  app.post("/api/admin/place-linker/run", async (req, res) => {
    try {
      const { cityId } = req.body;
      const { linkAllPendingData, linkDataForCity } = await import("./services/place-linker");
      const result = cityId ? await linkDataForCity(cityId) : await linkAllPendingData();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
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

  // 범용: phase별 도시 시드 (bts2026 | france30 | europe30)
  app.post("/api/admin/seed/cities-by-phase", async (req, res) => {
    try {
      const phase = req.body?.phase as "bts2026" | "france30" | "europe30";
      if (!phase || !["bts2026", "france30", "europe30"].includes(phase)) {
        return res.status(400).json({ error: "phase는 bts2026, france30, europe30 중 하나여야 합니다." });
      }
      const { getMcpPhaseCities } = await import("./config/mcp-raw-data-final");
      const { BTS2026_CITY_COORDS } = await import("./config/bts2026-city-coords");
      const phaseCities = getMcpPhaseCities(phase);
      let upserted = 0;
      for (const c of phaseCities) {
        const coords = phase === "bts2026" ? BTS2026_CITY_COORDS[c.nameEn] : undefined;
        const [existing] = await db
          .select({ id: cities.id, mcpPhases: cities.mcpPhases })
          .from(cities)
          .where(
            sql`LOWER(${cities.name}) = LOWER(${c.nameKo}) OR LOWER(COALESCE(${cities.nameEn}, '')) = LOWER(${c.nameEn})`
          )
          .limit(1);
        const phases = (existing?.mcpPhases as string[] | null) || [];
        if (!phases.includes(phase)) phases.push(phase);
        if (existing) {
          const updateData: Record<string, unknown> = { mcpPhases: phases, nameEn: c.nameEn };
          if (phase === "bts2026") updateData.btsRank = c.rank;
          await db.update(cities).set(updateData).where(eq(cities.id, existing.id));
          upserted++;
          continue;
        }
        if (phase === "bts2026" && coords) {
          const { country, latitude: lat, longitude: lon, timezone, primaryLanguage: lang } = coords;
          await db.insert(cities).values({
            name: c.nameKo,
            nameEn: c.nameEn,
            country,
            countryCode: c.countryCode ?? "XX",
            latitude: lat,
            longitude: lon,
            timezone,
            primaryLanguage: lang,
            mcpPhases: [phase],
            btsRank: c.rank,
          });
          upserted++;
        } else if (phase === "bts2026" && !coords) {
          console.warn(`[seed/cities-by-phase] bts2026 좌표 없음: ${c.nameEn}`);
        }
      }
      res.json({ success: true, phase, upserted, total: phaseCities.length });
    } catch (error) {
      console.error("Error seeding cities by phase:", error);
      res.status(500).json({ error: "Failed to seed cities by phase" });
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
      if (await rejectIfPaused("instagram_sync", res)) return;
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
      if (await rejectIfPaused("instagram_sync", res)) return;
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
      if (await rejectIfPaused("instagram_sync", res)) return;
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
      if (await rejectIfPaused("naver_blog_sync", res)) return;
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
      if (await rejectIfPaused("naver_blog_sync", res)) return;
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
      if (await rejectIfPaused("tripadvisor_sync", res)) return;
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
      if (await rejectIfPaused("tripadvisor_sync", res)) return;
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
  // 🇰🇷 한국 플랫폼 크롤러 API (마이리얼트립/클룩/트립닷컴)
  // ========================================

  app.get("/api/admin/korean-platforms/stats", async (req, res) => {
    try {
      const { getKoreanPlatformStats } = await import("./services/korean-platform-crawler");
      const stats = await getKoreanPlatformStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting Korean platform stats:", error);
      res.status(500).json({ error: "한국 플랫폼 통계 조회 실패" });
    }
  });

  app.post("/api/admin/korean-platforms/sync/city/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { crawlKoreanPlatformsForCity } = await import("./services/korean-platform-crawler");
      const result = await crawlKoreanPlatformsForCity(cityId);
      res.json({
        message: "한국 플랫폼 데이터 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing Korean platforms for city:", error);
      res.status(500).json({ error: "한국 플랫폼 수집 실패" });
    }
  });

  app.post("/api/admin/korean-platforms/sync/all", async (req, res) => {
    try {
      const { crawlAllKoreanPlatforms } = await import("./services/korean-platform-crawler");
      const result = await crawlAllKoreanPlatforms();
      res.json({
        message: "전체 한국 플랫폼 데이터 수집 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing all Korean platforms:", error);
      res.status(500).json({ error: "전체 한국 플랫폼 수집 실패" });
    }
  });

  app.get("/api/admin/korean-platforms/place/:placeId", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const { getPlaceKoreanPlatformPrices } = await import("./services/korean-platform-crawler");
      const result = await getPlaceKoreanPlatformPrices(placeId);
      res.json(result);
    } catch (error) {
      console.error("Error getting Korean platform prices:", error);
      res.status(500).json({ error: "한국 플랫폼 가격 조회 실패" });
    }
  });

  // ========================================
  // 📸 포토스팟 점수 API (Instagram+Google+Gemini)
  // ========================================

  app.get("/api/admin/photospot/stats", async (req, res) => {
    try {
      const { getPhotospotStats } = await import("./services/photospot-scorer");
      const stats = await getPhotospotStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting photospot stats:", error);
      res.status(500).json({ error: "포토스팟 통계 조회 실패" });
    }
  });

  app.post("/api/admin/photospot/score/city/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { scorePhotospotsForCity } = await import("./services/photospot-scorer");
      const result = await scorePhotospotsForCity(cityId);
      res.json({ message: "포토스팟 점수 계산 완료", ...result });
    } catch (error) {
      console.error("Error scoring photospots:", error);
      res.status(500).json({ error: "포토스팟 점수 계산 실패" });
    }
  });

  app.post("/api/admin/photospot/score/all", async (req, res) => {
    try {
      const { scoreAllPhotospots } = await import("./services/photospot-scorer");
      const result = await scoreAllPhotospots();
      res.json({ message: "전체 포토스팟 점수 계산 완료", ...result });
    } catch (error) {
      console.error("Error scoring all photospots:", error);
      res.status(500).json({ error: "전체 포토스팟 점수 계산 실패" });
    }
  });

  app.get("/api/admin/photospot/place/:placeId", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const { getPlacePhotospotScore } = await import("./services/photospot-scorer");
      const result = await getPlacePhotospotScore(placeId);
      res.json(result || { totalScore: 0, isPhotoSpot: false });
    } catch (error) {
      console.error("Error getting photospot score:", error);
      res.status(500).json({ error: "포토스팟 점수 조회 실패" });
    }
  });

  // ========================================
  // 📦 패키지 투어 검증 API (하나투어/모두투어/참좋은여행/노랑풍선)
  // ========================================

  app.get("/api/admin/package-tour/stats", async (req, res) => {
    try {
      const { getPackageTourStats } = await import("./services/package-tour-validator");
      const stats = await getPackageTourStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting package tour stats:", error);
      res.status(500).json({ error: "패키지 투어 통계 조회 실패" });
    }
  });

  app.post("/api/admin/package-tour/validate/city/:cityId", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const { validatePackageToursForCity } = await import("./services/package-tour-validator");
      const result = await validatePackageToursForCity(cityId);
      res.json({
        message: "패키지 투어 검증 완료",
        ...result
      });
    } catch (error) {
      console.error("Error validating package tours for city:", error);
      res.status(500).json({ error: "패키지 투어 검증 실패" });
    }
  });

  app.post("/api/admin/package-tour/validate/all", async (req, res) => {
    try {
      const { validateAllPackageTours } = await import("./services/package-tour-validator");
      const result = await validateAllPackageTours();
      res.json({
        message: "전체 패키지 투어 검증 완료",
        ...result
      });
    } catch (error) {
      console.error("Error validating all package tours:", error);
      res.status(500).json({ error: "전체 패키지 투어 검증 실패" });
    }
  });

  app.get("/api/admin/package-tour/place/:placeId", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const { getPlacePackageTourStatus } = await import("./services/package-tour-validator");
      const result = await getPlacePackageTourStatus(placeId);
      res.json(result || { isPackageTourIncluded: false, packageMentionCount: 0, mentionedBy: [] });
    } catch (error) {
      console.error("Error getting package tour status:", error);
      res.status(500).json({ error: "패키지 투어 상태 조회 실패" });
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

  // 가이드 가격 추가
  app.post("/api/admin/guide-prices", async (req, res) => {
    try {
      const { guidePrices } = await import("../shared/schema");
      const { serviceType, serviceName, pricePerDay, priceLow, priceHigh, unit, description, features } = req.body;
      
      if (!serviceType || !serviceName) {
        return res.status(400).json({ error: "서비스 유형과 이름은 필수입니다" });
      }
      
      const [created] = await db.insert(guidePrices).values({
        serviceType,
        serviceName,
        pricePerDay: pricePerDay || null,
        priceLow: priceLow || null,
        priceHigh: priceHigh || null,
        currency: 'EUR',
        unit: unit || 'day',
        description: description || '',
        features: features || [],
        isActive: true,
        source: 'admin_added',
      }).returning();
      
      res.json(created);
    } catch (error) {
      console.error("Error creating guide price:", error);
      res.status(500).json({ error: "Failed to create guide price" });
    }
  });

  // 가이드 가격 삭제
  app.delete("/api/admin/guide-prices/:id", async (req, res) => {
    try {
      const { guidePrices } = await import("../shared/schema");
      const id = parseInt(req.params.id);
      
      const [deleted] = await db.delete(guidePrices)
        .where(eq(guidePrices.id, id))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: "Guide price not found" });
      }
      
      res.json({ success: true, deleted });
    } catch (error) {
      console.error("Error deleting guide price:", error);
      res.status(500).json({ error: "Failed to delete guide price" });
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
  // 💰 시간당 가격 API (마케팅 핵심)
  // ========================================
  
  // 시간당 가격 조회
  app.get("/api/admin/guide-prices/hourly", async (req, res) => {
    try {
      const { guidePrices } = await import("../shared/schema");
      const prices = await db.select().from(guidePrices);
      
      // 차량 타입별로 그룹화
      const result: Record<string, any> = {};
      const comparison: Record<string, any> = {};
      
      for (const price of prices) {
        if (['sedan', 'van', 'minibus', 'guide_only'].includes(price.serviceType)) {
          result[price.serviceType] = {
            basePrice4h: price.basePrice4h,
            pricePerHour: price.pricePerHour,
            minPassengers: price.minPassengers,
            maxPassengers: price.maxPassengers,
            pricePerDay: price.pricePerDay,
            priceLow: price.priceLow,
            priceHigh: price.priceHigh
          };
          
          // 비교 데이터
          if (price.uberBlackEstimate || price.uberXEstimate || price.taxiEstimate) {
            if (!comparison.uberBlack) comparison.uberBlack = {};
            if (!comparison.uberX) comparison.uberX = {};
            if (!comparison.taxi) comparison.taxi = {};
            
            if (price.uberBlackEstimate) {
              const uberBlack = price.uberBlackEstimate as { low: number; high: number };
              comparison.uberBlack[price.serviceType] = `€${uberBlack.low}~${uberBlack.high}`;
            }
            if (price.uberXEstimate) {
              const uberX = price.uberXEstimate as { low: number; high: number };
              comparison.uberX[price.serviceType] = `€${uberX.low}~${uberX.high}`;
            }
            if (price.taxiEstimate) {
              const taxi = price.taxiEstimate as { low: number; high: number };
              comparison.taxi[price.serviceType] = `€${taxi.low}~${taxi.high}`;
            }
          }
          
          if (price.comparisonNote) {
            comparison.marketingNote = price.comparisonNote;
          }
        }
      }
      
      result.comparison = comparison;
      res.json(result);
    } catch (error) {
      console.error("Error loading hourly prices:", error);
      res.status(500).json({ error: "Failed to load hourly prices" });
    }
  });
  
  // 시간당 가격 저장/업데이트
  app.post("/api/admin/guide-prices/hourly", async (req, res) => {
    try {
      const { guidePrices } = await import("../shared/schema");
      const { hourlyPrices, comparison } = req.body;
      
      const serviceTypes = ['sedan', 'van', 'minibus', 'guide_only'];
      const results = [];
      
      for (const serviceType of serviceTypes) {
        const priceData = hourlyPrices[serviceType];
        if (!priceData) continue;
        
        // 기존 데이터 확인
        const existing = await db.select().from(guidePrices)
          .where(eq(guidePrices.serviceType, serviceType))
          .limit(1);
        
        // 8시간 전일 가격 계산
        const fullDayPrice = priceData.basePrice4h + (4 * priceData.pricePerHour);
        
        // 비교 데이터 파싱
        let uberBlackEstimate = null;
        let uberXEstimate = null;
        let taxiEstimate = null;
        
        if (comparison?.uberBlack?.[serviceType]) {
          const match = comparison.uberBlack[serviceType].match(/€?(\d+)~(\d+)/);
          if (match) uberBlackEstimate = { low: parseInt(match[1]), high: parseInt(match[2]) };
        }
        if (comparison?.uberX?.[serviceType]) {
          const match = comparison.uberX[serviceType].match(/€?(\d+)~(\d+)/);
          if (match) uberXEstimate = { low: parseInt(match[1]), high: parseInt(match[2]) };
        }
        if (comparison?.taxi?.[serviceType]) {
          const match = comparison.taxi[serviceType].match(/€?(\d+)~(\d+)/);
          if (match) taxiEstimate = { low: parseInt(match[1]), high: parseInt(match[2]) };
        }
        
        const updateData = {
          basePrice4h: priceData.basePrice4h,
          pricePerHour: priceData.pricePerHour,
          minPassengers: priceData.minPassengers,
          maxPassengers: priceData.maxPassengers,
          pricePerDay: fullDayPrice,
          priceLow: priceData.basePrice4h,
          priceHigh: fullDayPrice,
          unit: 'hour' as const,
          uberBlackEstimate,
          uberXEstimate,
          taxiEstimate,
          comparisonNote: comparison?.marketingNote || null,
          lastUpdated: new Date()
        };
        
        if (existing.length > 0) {
          // 업데이트
          await db.update(guidePrices)
            .set(updateData)
            .where(eq(guidePrices.serviceType, serviceType));
          results.push({ serviceType, action: 'updated' });
        } else {
          // 새로 생성
          const serviceNames: Record<string, string> = {
            sedan: '세단 (1-4인)',
            van: '밴 (5-7인)',
            minibus: '미니버스 (8인+)',
            guide_only: '가이드 온리'
          };
          
          await db.insert(guidePrices).values({
            serviceType,
            serviceName: serviceNames[serviceType] || serviceType,
            ...updateData,
            features: serviceType === 'guide_only' 
              ? ['차량 없음', '가이드만 동행']
              : ['전일 대기', '가이드 포함', '주차비 포함'],
            source: 'guide_verified'
          });
          results.push({ serviceType, action: 'created' });
        }
      }
      
      res.json({ success: true, results });
    } catch (error) {
      console.error("Error saving hourly prices:", error);
      res.status(500).json({ error: "Failed to save hourly prices" });
    }
  });
  
  // 💰 시간당 가격 테스트 API (DB 연동 확인용)
  app.get("/api/admin/guide-prices/test", async (req, res) => {
    try {
      const { transportPricingService } = await import("./services/transport-pricing-service");
      
      // 테스트: 가족(4인), 이동최소화, 8시간, 3일 여행
      const testResult = await transportPricingService.calculateTransportPrice({
        companionType: 'Family',
        companionCount: 4,
        mobilityStyle: 'Minimal',
        travelStyle: 'Reasonable',
        hours: 8,
        dayCount: 3
      });
      
      res.json({
        success: true,
        message: 'DB 연동 테스트 성공',
        testInput: {
          companionType: 'Family (4인)',
          mobilityStyle: 'Minimal (이동최소화)',
          hours: 8,
          dayCount: 3
        },
        result: testResult
      });
    } catch (error) {
      console.error("Error testing price calculation:", error);
      res.status(500).json({ 
        success: false, 
        error: "DB 연동 테스트 실패",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 시간당 가격 계산 API (일정 생성시 호출)
  app.post("/api/admin/guide-prices/calculate", async (req, res) => {
    try {
      const { guidePrices } = await import("../shared/schema");
      const { serviceType, hours, passengers } = req.body;
      
      // DB에서 해당 서비스 타입의 가격 조회
      const [priceData] = await db.select().from(guidePrices)
        .where(eq(guidePrices.serviceType, serviceType))
        .limit(1);
      
      if (!priceData) {
        return res.status(404).json({ error: "Price data not found for service type" });
      }
      
      const minHours = priceData.minHours || 4;
      const effectiveHours = Math.max(hours, minHours);
      const extraHours = Math.max(0, effectiveHours - minHours);
      
      const basePrice = priceData.basePrice4h || 0;
      const hourlyRate = priceData.pricePerHour || 0;
      const totalPrice = basePrice + (extraHours * hourlyRate);
      const perPersonPrice = passengers > 0 ? Math.round(totalPrice / passengers) : totalPrice;
      
      res.json({
        serviceType,
        serviceName: priceData.serviceName,
        hours: effectiveHours,
        passengers,
        breakdown: {
          basePrice4h: basePrice,
          extraHours,
          hourlyRate,
          totalPrice,
          perPersonPrice
        },
        comparison: {
          uberBlack: priceData.uberBlackEstimate,
          uberX: priceData.uberXEstimate,
          taxi: priceData.taxiEstimate,
          marketingNote: priceData.comparisonNote
        },
        currency: priceData.currency || 'EUR'
      });
    } catch (error) {
      console.error("Error calculating price:", error);
      res.status(500).json({ error: "Failed to calculate price" });
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

  // ========================================
  // 🎯 실시간 관제탑 API - 스케줄러 현황
  // ========================================

  app.get("/api/admin/scheduler/realtime-status", async (req, res) => {
    try {
      const { dataScheduler } = await import("./services/data-scheduler");
      const status = dataScheduler.getStatus();
      
      // 마지막 실행 결과 조회
      const recentLogs = await db
        .select()
        .from(dataSyncLog)
        .orderBy(desc(dataSyncLog.startedAt))
        .limit(20);
      
      // 태스크별 마지막 실행 상태
      const taskStatuses = status.scheduledTasks.map(taskName => {
        const lastLog = recentLogs.find(log => log.entityType === taskName);
        return {
          taskName,
          nextRun: status.nextRuns.find(n => n.taskName === taskName)?.nextRun || '알 수 없음',
          lastRunAt: lastLog?.startedAt || null,
          lastStatus: lastLog?.status || 'never',
          lastProcessed: lastLog?.itemsProcessed || 0,
          lastError: lastLog?.errorMessage || null,
        };
      });
      
      res.json({
        isRunning: status.isRunning,
        totalTasks: status.scheduledTasks.length,
        taskStatuses,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error getting scheduler realtime status:", error);
      res.status(500).json({ error: "스케줄러 상태 조회 실패" });
    }
  });

  // ========================================
  // 🎯 실시간 관제탑 API - 혼잡도 분석기 통계
  // ========================================

  app.get("/api/admin/popularity/stats", async (req, res) => {
    try {
      // 캐시된 혼잡도 데이터 수 조회
      const [popularityCache] = await db
        .select({ count: count() })
        .from(geminiWebSearchCache)
        .where(eq(geminiWebSearchCache.searchType, "popularity"));
      
      // 최근 24시간 내 조회된 장소 수
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [recentQueries] = await db
        .select({ count: count() })
        .from(geminiWebSearchCache)
        .where(
          and(
            eq(geminiWebSearchCache.searchType, "popularity"),
            gte(geminiWebSearchCache.fetchedAt, yesterday)
          )
        );
      
      res.json({
        totalCached: popularityCache.count || 0,
        last24Hours: recentQueries.count || 0,
        cacheHitRate: popularityCache.count > 0 ? Math.round((recentQueries.count / popularityCache.count) * 100) : 0,
        status: popularityCache.count > 0 ? '활성' : '대기',
      });
    } catch (error) {
      console.error("Error fetching popularity stats:", error);
      res.status(500).json({ error: "혼잡도 통계 조회 실패" });
    }
  });

  // ========================================
  // 🎯 실시간 관제탑 API - 경로 캐시 현황
  // ========================================

  app.get("/api/admin/route-cache/stats", async (req, res) => {
    try {
      const { routeCache } = await import("../shared/schema");
      
      const [totalRoutes] = await db.select({ count: count() }).from(routeCache);
      
      // 최근 7일 내 캐시된 경로 (fetchedAt 컬럼 사용)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [recentRoutes] = await db
        .select({ count: count() })
        .from(routeCache)
        .where(gte(routeCache.fetchedAt, weekAgo));
      
      // 교통수단별 통계
      const byTravelMode = await db
        .select({
          travelMode: routeCache.travelMode,
          count: count(),
        })
        .from(routeCache)
        .groupBy(routeCache.travelMode);
      
      res.json({
        totalCached: totalRoutes?.count || 0,
        last7Days: recentRoutes?.count || 0,
        byTravelMode: byTravelMode.reduce((acc, item) => {
          acc[item.travelMode] = item.count;
          return acc;
        }, {} as Record<string, number>),
        status: (totalRoutes?.count || 0) > 0 ? '활성' : '대기',
      });
    } catch (error) {
      console.error("Error fetching route cache stats:", error);
      res.status(500).json({ error: "경로 캐시 통계 조회 실패" });
    }
  });

  // ========================================
  // 🎯 실시간 관제탑 API - 티스토리 크롤러 통계
  // ========================================

  app.get("/api/admin/tistory/stats", async (req, res) => {
    try {
      // 티스토리 관련 캐시 데이터 조회
      const [tistoryCache] = await db
        .select({ count: count() })
        .from(geminiWebSearchCache)
        .where(eq(geminiWebSearchCache.searchType, "tistory"));
      
      // 마지막 동기화 시간
      const [lastSync] = await db
        .select({ lastSync: geminiWebSearchCache.fetchedAt })
        .from(geminiWebSearchCache)
        .where(eq(geminiWebSearchCache.searchType, "tistory"))
        .orderBy(desc(geminiWebSearchCache.fetchedAt))
        .limit(1);
      
      res.json({
        totalPosts: tistoryCache.count || 0,
        lastSync: lastSync?.lastSync || null,
        status: tistoryCache.count > 0 ? '활성' : '대기',
      });
    } catch (error) {
      console.error("Error fetching Tistory stats:", error);
      res.status(500).json({ error: "티스토리 통계 조회 실패" });
    }
  });

  app.post("/api/admin/tistory/sync", async (req, res) => {
    try {
      if (await rejectIfPaused("tistory_sync", res)) return;
      const { crawlAllTistory } = await import("./services/tistory-crawler");
      const result = await crawlAllTistory();
      res.json({
        message: "티스토리 동기화 완료",
        ...result
      });
    } catch (error) {
      console.error("Error syncing Tistory:", error);
      res.status(500).json({ error: "티스토리 동기화 실패" });
    }
  });

  // ========================================
  // 🎯 실시간 관제탑 API - 일정 생성 통계
  // ========================================

  app.get("/api/admin/itinerary/stats", async (req, res) => {
    try {
      const { itineraries } = await import("../shared/schema");
      
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      
      // 전체 일정 수
      const [totalItineraries] = await db.select({ count: count() }).from(itineraries);
      
      // 오늘 생성된 일정
      const [todayItineraries] = await db
        .select({ count: count() })
        .from(itineraries)
        .where(gte(itineraries.createdAt, todayStart));
      
      // 이번 주 생성된 일정
      const [weekItineraries] = await db
        .select({ count: count() })
        .from(itineraries)
        .where(gte(itineraries.createdAt, weekStart));
      
      // 도시별 통계
      const byCityData = await db
        .select({
          cityId: itineraries.cityId,
          count: count(),
        })
        .from(itineraries)
        .groupBy(itineraries.cityId)
        .limit(5);
      
      // 도시 이름 조회
      const cityIds = byCityData.map(d => d.cityId).filter(id => id !== null);
      const cityNames = cityIds.length > 0 
        ? await db.select({ id: cities.id, name: cities.name }).from(cities).where(sql`${cities.id} IN (${sql.join(cityIds, sql`, `)})`)
        : [];
      
      const byCity = byCityData.map(d => ({
        cityId: d.cityId,
        cityName: cityNames.find(c => c.id === d.cityId)?.name || '알 수 없음',
        count: d.count,
      }));
      
      res.json({
        total: totalItineraries.count || 0,
        today: todayItineraries.count || 0,
        thisWeek: weekItineraries.count || 0,
        topCities: byCity,
      });
    } catch (error) {
      console.error("Error fetching itinerary stats:", error);
      // 테이블이 없을 수 있으므로 기본값 반환
      res.json({
        total: 0,
        today: 0,
        thisWeek: 0,
        topCities: [],
      });
    }
  });

  // ========================================
  // 🎯 실시간 관제탑 API - 통합 현황 요약
  // ========================================

  app.get("/api/admin/control-tower/summary", async (req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // 데이터 수집 상태
      const [todaySyncs] = await db
        .select({ count: count() })
        .from(dataSyncLog)
        .where(gte(dataSyncLog.startedAt, todayStart));
      
      const [failedSyncs] = await db
        .select({ count: count() })
        .from(dataSyncLog)
        .where(
          and(
            gte(dataSyncLog.startedAt, todayStart),
            eq(dataSyncLog.status, "failed")
          )
        );
      
      // API 연결 상태
      const apiServices = await db.select().from(apiServiceStatus);
      const connectedApis = apiServices.filter(s => s.isConfigured).length;
      
      // 웹 검색 캐시 현황
      const [totalWebCache] = await db.select({ count: count() }).from(geminiWebSearchCache);
      
      // 실시간 교통비 데이터 (routeCache)
      const { routeCache } = await import("../shared/schema");
      const [totalRoutes] = await db.select({ count: count() }).from(routeCache);
      
      res.json({
        dataCollection: {
          todaySyncs: todaySyncs.count || 0,
          failedSyncs: failedSyncs.count || 0,
          successRate: todaySyncs.count > 0 
            ? Math.round(((todaySyncs.count - failedSyncs.count) / todaySyncs.count) * 100) 
            : 100,
        },
        apiConnections: {
          connected: connectedApis,
          total: apiServices.length,
        },
        caches: {
          webSearch: totalWebCache.count || 0,
          routes: totalRoutes.count || 0,
        },
        lastUpdated: now.toISOString(),
      });
    } catch (error) {
      console.error("Error fetching control tower summary:", error);
      res.status(500).json({ error: "관제탑 요약 조회 실패" });
    }
  });

  // ========================================
  // API 키 관리 엔드포인트
  // ========================================
  
  // API 키 목록 조회
  app.get("/api/admin/api-keys", async (req, res) => {
    try {
      const keys = await db.select().from(apiKeys).orderBy(apiKeys.id);
      
      // 키 값은 마스킹해서 반환 (보안)
      const maskedKeys = keys.map(key => ({
        ...key,
        keyValue: key.keyValue ? `${key.keyValue.slice(0, 8)}...${key.keyValue.slice(-4)}` : '',
        hasValue: !!key.keyValue && key.keyValue.length > 0
      }));
      
      res.json(maskedKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });
  
  // 새 API 키 추가
  app.post("/api/admin/api-keys", async (req, res) => {
    try {
      const { keyName, displayName, description, keyValue } = req.body;
      
      if (!keyName || !displayName) {
        return res.status(400).json({ error: "keyName and displayName are required" });
      }
      
      // 키 이름 검증 (대문자, 언더스코어만 허용)
      if (!/^[A-Z_]+$/.test(keyName)) {
        return res.status(400).json({ error: "keyName must be uppercase letters and underscores only" });
      }
      
      // 중복 확인
      const existing = await db.select().from(apiKeys).where(eq(apiKeys.keyName, keyName)).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ error: `API key "${keyName}" already exists` });
      }
      
      // DB에 추가
      await db.insert(apiKeys).values({
        keyName,
        keyValue: keyValue ? keyValue.trim() : '',
        displayName,
        description: description || null,
        isActive: true
      });
      
      // 키 값이 있으면 환경변수에도 반영
      if (keyValue && keyValue.trim()) {
        process.env[keyName] = keyValue.trim();
      }
      
      console.log(`✅ New API Key added: ${keyName}`);
      res.json({ success: true, message: `${keyName} 추가 완료` });
    } catch (error) {
      console.error("Error adding API key:", error);
      res.status(500).json({ error: "Failed to add API key" });
    }
  });
  
  // API 키 저장/업데이트
  app.put("/api/admin/api-keys/:keyName", async (req, res) => {
    try {
      const { keyName } = req.params;
      const { keyValue } = req.body;
      
      if (!keyValue || keyValue.trim() === '') {
        return res.status(400).json({ error: "API key value is required" });
      }
      
      // DB에 저장
      const existing = await db.select().from(apiKeys).where(eq(apiKeys.keyName, keyName)).limit(1);
      
      if (existing.length > 0) {
        await db.update(apiKeys)
          .set({ 
            keyValue: keyValue.trim(), 
            updatedAt: new Date(),
            isActive: true 
          })
          .where(eq(apiKeys.keyName, keyName));
      } else {
        await db.insert(apiKeys).values({
          keyName,
          keyValue: keyValue.trim(),
          displayName: keyName,
          isActive: true
        });
      }
      
      // 런타임 환경변수에도 즉시 반영 (자동 연동)
      process.env[keyName] = keyValue.trim();
      
      // 특정 키는 추가 매핑
      if (keyName === 'GEMINI_API_KEY') {
        process.env.AI_INTEGRATIONS_GEMINI_API_KEY = keyValue.trim();
      }
      if (keyName === 'GOOGLE_MAPS_API_KEY') {
        process.env.Google_maps_api_key = keyValue.trim();
      }
      
      console.log(`✅ API Key saved: ${keyName}`);
      res.json({ success: true, message: `${keyName} 저장 완료` });
    } catch (error) {
      console.error("Error saving API key:", error);
      res.status(500).json({ error: "Failed to save API key" });
    }
  });
  
  // API 키 삭제 (값만 비움)
  app.delete("/api/admin/api-keys/:keyName", async (req, res) => {
    try {
      const { keyName } = req.params;
      
      await db.update(apiKeys)
        .set({ keyValue: '', isActive: false, updatedAt: new Date() })
        .where(eq(apiKeys.keyName, keyName));
      
      // 런타임 환경변수에서도 제거
      delete process.env[keyName];
      if (keyName === 'GEMINI_API_KEY') {
        delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      }
      
      res.json({ success: true, message: `${keyName} 삭제 완료` });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });
  
  // API 키 테스트
  app.post("/api/admin/api-keys/:keyName/test", async (req, res) => {
    try {
      const { keyName } = req.params;
      
      // DB에서 키 조회
      const [keyRecord] = await db.select().from(apiKeys).where(eq(apiKeys.keyName, keyName)).limit(1);
      
      if (!keyRecord || !keyRecord.keyValue) {
        return res.status(400).json({ error: "API key not found or empty" });
      }
      
      const apiKey = keyRecord.keyValue;
      let testResult = { success: false, message: '' };
      
      switch (keyName) {
        case 'GEMINI_API_KEY': {
          try {
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: "Say 'API test successful' in Korean"
            });
            testResult = { success: true, message: response.text?.slice(0, 100) || 'OK' };
          } catch (e: any) {
            let msg = e?.message || String(e);
            if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
              msg = '일일 API 할당량 초과 (Google AI Studio에서 사용량·결제 확인)';
            } else if (msg.includes('API key') || msg.includes('401') || msg.includes('403')) {
              msg = 'API 키가 유효하지 않거나 권한이 없습니다';
            }
            testResult = { success: false, message: msg };
          }
          break;
        }
        
        case 'YOUTUBE_API_KEY': {
          try {
            const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.error) throw new Error(data.error.message || 'YouTube API 오류');
            testResult = { success: true, message: `채널 조회 성공: ${data.items?.[0]?.snippet?.title || 'OK'}` };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        
        case 'GOOGLE_MAPS_API_KEY': {
          try {
            const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Paris&key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.status === 'REQUEST_DENIED') throw new Error(data.error_message || 'Places API 미활성화');
            const count = data.predictions?.length ?? 0;
            testResult = { success: true, message: `장소 자동완성 ${count}건 조회 성공 (Places API Legacy)` };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        
        case 'OPENWEATHER_API_KEY': {
          try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=37.5665&lon=126.9780&appid=${encodeURIComponent(apiKey)}&units=metric`;
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
            testResult = { success: true, message: `서울 날씨 ${data.main?.temp}°C 조회 성공` };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        
        default:
          testResult = { success: true, message: '테스트 불가 (저장됨)' };
      }
      
      // 테스트 결과 DB에 기록
      await db.update(apiKeys)
        .set({ 
          lastTestedAt: new Date(),
          lastTestResult: testResult.success ? 'success' : 'failed'
        })
        .where(eq(apiKeys.keyName, keyName));
      
      res.json(testResult);
    } catch (error) {
      console.error("Error testing API key:", error);
      res.status(500).json({ error: "Failed to test API key" });
    }
  });

  // ========================================
  // 🇰🇷 한국 감성 데이터 API (Vibe 추천 소스)
  // Instagram(1순위), 네이버블로그(2순위), YouTube(3순위)
  // ========================================

  // 네이버 블로그 통합 통계 (한국 감성용)
  app.get("/api/admin/korean-sentiment/naver", async (req, res) => {
    try {
      // 네이버 블로그 포스트 통계
      const totalPosts = await db.select({ count: count() }).from(naverBlogPosts);
      
      // 장소와 연결된 포스트 수
      const linkedPosts = await db.select({ count: count() })
        .from(naverBlogPosts)
        .where(sql`${naverBlogPosts.placeId} IS NOT NULL`);
      
      // 감성 점수 기반 분류 (sentimentScore 사용)
      // sentimentScore: 0~1 범위, 0.6 이상 긍정, 0.4 이하 부정, 중간은 중립
      const allPosts = await db.select({ score: naverBlogPosts.sentimentScore })
        .from(naverBlogPosts);
      
      let positive = 0, neutral = 0, negative = 0;
      for (const post of allPosts) {
        const score = post.score ?? 0.5;
        if (score >= 0.6) positive++;
        else if (score <= 0.4) negative++;
        else neutral++;
      }
      
      const totalSentimentPosts = positive + neutral + negative;
      const positiveSentimentRatio = totalSentimentPosts > 0 
        ? Math.round((positive / totalSentimentPosts) * 100) 
        : 0;
      
      // 마지막 동기화 시간 (fetchedAt 사용)
      const [lastSync] = await db.select({ lastSync: naverBlogPosts.fetchedAt })
        .from(naverBlogPosts)
        .orderBy(desc(naverBlogPosts.fetchedAt))
        .limit(1);

      res.json({
        totalPosts: Number(totalPosts[0]?.count || 0),
        linkedPlaces: Number(linkedPosts[0]?.count || 0),
        positiveSentimentRatio,
        sentimentBreakdown: { positive, neutral, negative },
        lastSyncAt: lastSync?.lastSync || null
      });
    } catch (error) {
      console.error("Error fetching Korean sentiment Naver data:", error);
      res.status(500).json({ error: "Failed to fetch Naver sentiment data" });
    }
  });

  // YouTube 통합 통계 (한국 감성용)
  app.get("/api/admin/korean-sentiment/youtube", async (req, res) => {
    try {
      // 채널 수
      const totalChannels = await db.select({ count: count() })
        .from(youtubeChannels)
        .where(eq(youtubeChannels.isActive, true));
      
      // 영상 수
      const totalVideos = await db.select({ count: count() }).from(youtubeVideos);
      
      // 장소 언급 수
      const totalMentions = await db.select({ count: count() }).from(youtubePlaceMentions);
      
      // 마지막 동기화 시간
      const [lastSync] = await db.select({ lastSync: youtubeVideos.fetchedAt })
        .from(youtubeVideos)
        .orderBy(desc(youtubeVideos.fetchedAt))
        .limit(1);
      
      // 한국어 채널 수 (category로 추정)
      const koreanChannels = await db.select({ count: count() })
        .from(youtubeChannels)
        .where(and(
          eq(youtubeChannels.isActive, true),
          sql`${youtubeChannels.category} LIKE '%korea%' OR ${youtubeChannels.category} LIKE '%한국%' OR ${youtubeChannels.channelName} LIKE '%여행%'`
        ));

      res.json({
        totalChannels: Number(totalChannels[0]?.count || 0),
        totalVideos: Number(totalVideos[0]?.count || 0),
        totalMentions: Number(totalMentions[0]?.count || 0),
        koreanChannels: Number(koreanChannels[0]?.count || 0),
        lastSyncAt: lastSync?.lastSync || null
      });
    } catch (error) {
      console.error("Error fetching Korean sentiment YouTube data:", error);
      res.status(500).json({ error: "Failed to fetch YouTube sentiment data" });
    }
  });

  // Instagram 확장 통계 (총 게시물 수 포함)
  app.get("/api/admin/korean-sentiment/instagram", async (req, res) => {
    try {
      const stats = await instagramCrawler.getStats();
      
      // 해시태그별 게시물 수 합계
      const totalPostsResult = await db.select({ 
        total: sql`COALESCE(SUM(${instagramHashtags.postCount}), 0)` 
      }).from(instagramHashtags);
      
      const totalPosts = Number(totalPostsResult[0]?.total || 0);

      res.json({
        ...stats,
        totalPosts
      });
    } catch (error) {
      console.error("Error fetching Korean sentiment Instagram data:", error);
      res.status(500).json({ error: "Failed to fetch Instagram sentiment data" });
    }
  });

  // 한국 감성 데이터 통합 요약
  app.get("/api/admin/korean-sentiment/summary", async (req, res) => {
    try {
      // Instagram
      const instaHashtags = await db.select({ count: count() }).from(instagramHashtags);
      const instaPhotos = await db.select({ count: count() }).from(instagramPhotos);
      const instaTotalPosts = await db.select({ 
        total: sql`COALESCE(SUM(${instagramHashtags.postCount}), 0)` 
      }).from(instagramHashtags);
      
      // Naver
      const naverPosts = await db.select({ count: count() }).from(naverBlogPosts);
      
      // YouTube
      const ytChannels = await db.select({ count: count() })
        .from(youtubeChannels)
        .where(eq(youtubeChannels.isActive, true));
      const ytMentions = await db.select({ count: count() }).from(youtubePlaceMentions);

      res.json({
        instagram: {
          hashtags: Number(instaHashtags[0]?.count || 0),
          photos: Number(instaPhotos[0]?.count || 0),
          totalPosts: Number(instaTotalPosts[0]?.total || 0),
          priority: 1,
          weight: 0.4
        },
        naver: {
          posts: Number(naverPosts[0]?.count || 0),
          priority: 2,
          weight: 0.35
        },
        youtube: {
          channels: Number(ytChannels[0]?.count || 0),
          mentions: Number(ytMentions[0]?.count || 0),
          priority: 3,
          weight: 0.25
        },
        description: "한국 사용자 감성 만족을 위한 가중치 데이터 소스 (취향 선택 시 Gemini AI가 참고)"
      });
    } catch (error) {
      console.error("Error fetching Korean sentiment summary:", error);
      res.status(500).json({ error: "Failed to fetch Korean sentiment summary" });
    }
  });

  // YouTube 전체 동기화 엔드포인트
  app.post("/api/admin/youtube/sync-all", async (req, res) => {
    try {
      if (await rejectIfPaused("youtube_sync", res)) return;
      const { youtubeCrawler } = await import("./services/youtube-crawler");
      
      if (!process.env.YOUTUBE_API_KEY) {
        return res.status(400).json({ 
          error: "YouTube API 키가 설정되지 않았습니다" 
        });
      }
      
      const result = await youtubeCrawler.syncAllChannels();
      
      res.json({
        message: "YouTube 전체 동기화 완료",
        synced: result.synced,
        videos: result.totalVideos || 0,
        mentions: result.totalMentions || 0
      });
    } catch (error) {
      console.error("Error syncing all YouTube:", error);
      res.status(500).json({ error: "Failed to sync YouTube data" });
    }
  });

  // ========================================
  // 🇪🇺 유럽 30개 대표 도시 한국 감성 데이터 동기화
  // Gemini Web Search 기반 (캐시 7일)
  // ========================================

  // 🔗 Agent Protocol v1.0: 유럽 30개 도시 (한국어 + 영어 + 현지명)
  const EUROPE_30_CITIES = [
    // 프랑스 (5)
    { name: '파리', nameEn: 'Paris', nameLocal: 'Paris', country: '프랑스', countryCode: 'FR' },
    { name: '니스', nameEn: 'Nice', nameLocal: 'Nice', country: '프랑스', countryCode: 'FR' },
    { name: '마르세유', nameEn: 'Marseille', nameLocal: 'Marseille', country: '프랑스', countryCode: 'FR' },
    { name: '리옹', nameEn: 'Lyon', nameLocal: 'Lyon', country: '프랑스', countryCode: 'FR' },
    { name: '스트라스부르', nameEn: 'Strasbourg', nameLocal: 'Strasbourg', country: '프랑스', countryCode: 'FR' },
    // 이탈리아 (5)
    { name: '로마', nameEn: 'Rome', nameLocal: 'Roma', country: '이탈리아', countryCode: 'IT' },
    { name: '피렌체', nameEn: 'Florence', nameLocal: 'Firenze', country: '이탈리아', countryCode: 'IT' },
    { name: '베니스', nameEn: 'Venice', nameLocal: 'Venezia', country: '이탈리아', countryCode: 'IT' },
    { name: '밀라노', nameEn: 'Milan', nameLocal: 'Milano', country: '이탈리아', countryCode: 'IT' },
    { name: '아말피', nameEn: 'Amalfi', nameLocal: 'Amalfi', country: '이탈리아', countryCode: 'IT' },
    // 스페인 (4)
    { name: '바르셀로나', nameEn: 'Barcelona', nameLocal: 'Barcelona', country: '스페인', countryCode: 'ES' },
    { name: '마드리드', nameEn: 'Madrid', nameLocal: 'Madrid', country: '스페인', countryCode: 'ES' },
    { name: '세비야', nameEn: 'Seville', nameLocal: 'Sevilla', country: '스페인', countryCode: 'ES' },
    { name: '그라나다', nameEn: 'Granada', nameLocal: 'Granada', country: '스페인', countryCode: 'ES' },
    // 영국 (2)
    { name: '런던', nameEn: 'London', nameLocal: 'London', country: '영국', countryCode: 'GB' },
    { name: '에딘버러', nameEn: 'Edinburgh', nameLocal: 'Edinburgh', country: '영국', countryCode: 'GB' },
    // 독일 (3)
    { name: '뮌헨', nameEn: 'Munich', nameLocal: 'München', country: '독일', countryCode: 'DE' },
    { name: '베를린', nameEn: 'Berlin', nameLocal: 'Berlin', country: '독일', countryCode: 'DE' },
    { name: '프랑크푸르트', nameEn: 'Frankfurt', nameLocal: 'Frankfurt', country: '독일', countryCode: 'DE' },
    // 스위스 (2)
    { name: '취리히', nameEn: 'Zurich', nameLocal: 'Zürich', country: '스위스', countryCode: 'CH' },
    { name: '인터라켄', nameEn: 'Interlaken', nameLocal: 'Interlaken', country: '스위스', countryCode: 'CH' },
    // 오스트리아 (2)
    { name: '비엔나', nameEn: 'Vienna', nameLocal: 'Wien', country: '오스트리아', countryCode: 'AT' },
    { name: '잘츠부르크', nameEn: 'Salzburg', nameLocal: 'Salzburg', country: '오스트리아', countryCode: 'AT' },
    // 네덜란드 (1)
    { name: '암스테르담', nameEn: 'Amsterdam', nameLocal: 'Amsterdam', country: '네덜란드', countryCode: 'NL' },
    // 벨기에 (1)
    { name: '브뤼셀', nameEn: 'Brussels', nameLocal: 'Bruxelles', country: '벨기에', countryCode: 'BE' },
    // 체코 (1)
    { name: '프라하', nameEn: 'Prague', nameLocal: 'Praha', country: '체코', countryCode: 'CZ' },
    // 헝가리 (1)
    { name: '부다페스트', nameEn: 'Budapest', nameLocal: 'Budapest', country: '헝가리', countryCode: 'HU' },
    // 포르투갈 (1)
    { name: '리스본', nameEn: 'Lisbon', nameLocal: 'Lisboa', country: '포르투갈', countryCode: 'PT' },
    // 그리스 (1)
    { name: '아테네', nameEn: 'Athens', nameLocal: 'Αθήνα', country: '그리스', countryCode: 'GR' },
    // 크로아티아 (1)
    { name: '두브로브니크', nameEn: 'Dubrovnik', nameLocal: 'Dubrovnik', country: '크로아티아', countryCode: 'HR' },
  ];

  // 유럽 30개 도시 목록 조회
  app.get("/api/admin/korean-sentiment/europe-cities", (req, res) => {
    res.json({
      cities: EUROPE_30_CITIES,
      totalCount: EUROPE_30_CITIES.length,
      description: "한국인 여행 인기 기준 유럽 30개 대표 도시"
    });
  });

  // 전체 한국 감성 데이터 동기화 (Gemini 기반)
  app.post("/api/admin/korean-sentiment/sync-all", async (req, res) => {
    try {
      const { getKoreanSentimentForCity } = await import("./services/korean-sentiment-service");
      
      const results: Array<{
        city: string;
        country: string;
        success: boolean;
        totalBonus?: number;
        error?: string;
      }> = [];
      
      let successCount = 0;
      let errorCount = 0;
      
      // 한 번에 3개씩 병렬 처리 (API 제한 고려)
      for (let i = 0; i < EUROPE_30_CITIES.length; i += 3) {
        const batch = EUROPE_30_CITIES.slice(i, i + 3);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (city) => {
            const sentiment = await getKoreanSentimentForCity(city.name, ['Hotspot', 'Foodie', 'Culture']);
            return { city: city.name, country: city.country, sentiment };
          })
        );
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push({
              city: result.value.city,
              country: result.value.country,
              success: true,
              totalBonus: result.value.sentiment.totalBonus
            });
            successCount++;
          } else {
            const cityName = batch[batchResults.indexOf(result)]?.name || 'Unknown';
            results.push({
              city: cityName,
              country: batch[batchResults.indexOf(result)]?.country || 'Unknown',
              success: false,
              error: result.reason?.message || 'Unknown error'
            });
            errorCount++;
          }
        }
        
        // API 제한 방지를 위한 딜레이
        if (i + 3 < EUROPE_30_CITIES.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      res.json({
        message: `유럽 30개 도시 한국 감성 데이터 동기화 완료`,
        totalCities: EUROPE_30_CITIES.length,
        success: successCount,
        errors: errorCount,
        results
      });
    } catch (error) {
      console.error("Error syncing Korean sentiment for all cities:", error);
      res.status(500).json({ error: "Failed to sync Korean sentiment data" });
    }
  });

  // Instagram 한국 감성 동기화 (Gemini 기반 - 직접 크롤링 대신)
  app.post("/api/admin/korean-sentiment/sync-instagram", async (req, res) => {
    try {
      const { getKoreanSentimentForCity } = await import("./services/korean-sentiment-service");
      
      let successCount = 0;
      const results: Array<{ city: string; postCount: number; hashtags: string[] }> = [];
      
      for (const city of EUROPE_30_CITIES.slice(0, 10)) { // 처음 10개만
        try {
          const sentiment = await getKoreanSentimentForCity(city.name, ['Hotspot']);
          results.push({
            city: city.name,
            postCount: sentiment.instagram.postCount,
            hashtags: sentiment.instagram.trendingHashtags.slice(0, 3)
          });
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          // 개별 실패는 무시하고 계속
        }
      }
      
      res.json({
        message: "Instagram 감성 데이터 동기화 완료 (Gemini 기반)",
        synced: successCount,
        totalPosts: results.reduce((sum, r) => sum + r.postCount, 0),
        results
      });
    } catch (error) {
      console.error("Error syncing Instagram sentiment:", error);
      res.status(500).json({ error: "Failed to sync Instagram sentiment data" });
    }
  });

  // 네이버 블로그 한국 감성 동기화 (Gemini 기반)
  app.post("/api/admin/korean-sentiment/sync-naver", async (req, res) => {
    try {
      const { getKoreanSentimentForCity } = await import("./services/korean-sentiment-service");
      
      let successCount = 0;
      const results: Array<{ city: string; sentiment: string; keywords: string[] }> = [];
      
      for (const city of EUROPE_30_CITIES.slice(0, 10)) {
        try {
          const sentiment = await getKoreanSentimentForCity(city.name, ['Foodie', 'Culture']);
          results.push({
            city: city.name,
            sentiment: sentiment.naverBlog.sentiment,
            keywords: sentiment.naverBlog.keywords.slice(0, 5)
          });
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          // 개별 실패는 무시
        }
      }
      
      res.json({
        message: "네이버 블로그 감성 데이터 동기화 완료 (Gemini 기반)",
        synced: successCount,
        results
      });
    } catch (error) {
      console.error("Error syncing Naver sentiment:", error);
      res.status(500).json({ error: "Failed to sync Naver sentiment data" });
    }
  });

  // YouTube 한국 감성 동기화 (Gemini 기반)
  app.post("/api/admin/korean-sentiment/sync-youtube", async (req, res) => {
    try {
      const { getKoreanSentimentForCity } = await import("./services/korean-sentiment-service");
      
      let successCount = 0;
      const results: Array<{ city: string; videoCount: number; channels: string[] }> = [];
      
      for (const city of EUROPE_30_CITIES.slice(0, 10)) {
        try {
          const sentiment = await getKoreanSentimentForCity(city.name, ['Adventure', 'Culture']);
          results.push({
            city: city.name,
            videoCount: sentiment.youtube.mentionCount,
            channels: sentiment.youtube.channels.slice(0, 3)
          });
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          // 개별 실패는 무시
        }
      }
      
      res.json({
        message: "YouTube 감성 데이터 동기화 완료 (Gemini 기반)",
        synced: successCount,
        results
      });
    } catch (error) {
      console.error("Error syncing YouTube sentiment:", error);
      res.status(500).json({ error: "Failed to sync YouTube sentiment data" });
    }
  });

  // 캐시된 한국 감성 데이터 현황 조회
  app.get("/api/admin/korean-sentiment/cache-status", async (req, res) => {
    try {
      // geminiWebSearchCache에서 korean_sentiment 타입 조회
      const cachedData = await db.select({
        id: geminiWebSearchCache.id,
        searchQuery: geminiWebSearchCache.searchQuery,
        fetchedAt: geminiWebSearchCache.fetchedAt,
        extractedData: geminiWebSearchCache.extractedData
      })
        .from(geminiWebSearchCache)
        .where(eq(geminiWebSearchCache.searchType, 'korean_sentiment'))
        .orderBy(desc(geminiWebSearchCache.fetchedAt));
      
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const citiesWithData = cachedData.map(c => {
        const cityName = c.searchQuery?.replace('korean_sentiment_', '') || 'Unknown';
        const data = c.extractedData as any;
        const isValid = c.fetchedAt && new Date(c.fetchedAt) > sevenDaysAgo;
        
        return {
          city: cityName,
          fetchedAt: c.fetchedAt,
          isValid,
          totalBonus: data?.totalBonus || 0,
          instagram: data?.instagram?.score || 0,
          naver: data?.naverBlog?.score || 0,
          youtube: data?.youtube?.score || 0
        };
      });
      
      const validCount = citiesWithData.filter(c => c.isValid).length;
      const expiredCount = citiesWithData.filter(c => !c.isValid).length;
      
      res.json({
        totalCached: citiesWithData.length,
        validCount,
        expiredCount,
        europeCitiesCovered: EUROPE_30_CITIES.filter(ec => 
          citiesWithData.some(c => c.city === ec.name && c.isValid)
        ).length,
        europeCitiesTotal: EUROPE_30_CITIES.length,
        cities: citiesWithData
      });
    } catch (error) {
      console.error("Error fetching cache status:", error);
      res.status(500).json({ error: "Failed to fetch cache status" });
    }
  });
  
  // =============================================
  // 🚨 위기 정보 API (GDELT + Gemini)
  // =============================================
  
  // 위기 정보 목록 조회 (대시보드용)
  app.get("/api/admin/crisis-alerts", async (req, res) => {
    try {
      const { crisisAlertService } = await import("./services/crisis-alert-service");
      
      const cityFilter = req.query.city as string;
      const typeFilter = req.query.type as string;
      
      // 통계 조회
      const stats = await crisisAlertService.getCollectionStats();
      
      // 모든 활성 알림 조회
      let alerts = await crisisAlertService.getAllActiveAlerts();
      
      // 필터 적용
      if (cityFilter) {
        alerts = alerts.filter(a => a.city === cityFilter);
      }
      if (typeFilter) {
        alerts = alerts.filter(a => a.type === typeFilter);
      }

      // 앱 기준 우선순위: 파리 -> 프랑스(파리 제외) -> 유럽(중복 제거)
      const { getMcpExecutionOrder } = await import("./config/mcp-raw-data-final");
      const ordered = getMcpExecutionOrder();
      const orderMap = new Map<string, number>();
      ordered.forEach((c, idx) => {
        const keyEn = String(c.nameEn || "").trim().toLowerCase();
        const keyKo = String(c.nameKo || "").trim().toLowerCase();
        if (keyEn) orderMap.set(keyEn, idx);
        if (keyKo) orderMap.set(keyKo, idx);
      });
      alerts = alerts.sort((a, b) => {
        const aIdx = orderMap.get(String(a.city || "").toLowerCase()) ?? 9999;
        const bIdx = orderMap.get(String(b.city || "").toLowerCase()) ?? 9999;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return b.severity - a.severity;
      });
      
      res.json({
        success: true,
        stats,
        alerts,
        lastUpdate: stats.lastCollection
      });
    } catch (error) {
      console.error("Error fetching crisis alerts:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch crisis alerts",
        alerts: [],
        stats: { totalAlerts: 0, activeAlerts: 0, byCity: {}, byType: {} }
      });
    }
  });
  
  // MCP 최종 도시 목록 조회 (수동 검증용)
  app.get("/api/admin/mcp-final-cities", async (req, res) => {
    try {
      const {
        getMcpFinalCities,
        getMcpExecutionOrder,
        getMcpPhaseCities,
        getMcpCitySourceMeta,
      } = await import("./config/mcp-raw-data-final");
      const cities = getMcpFinalCities();
      const executionOrder = getMcpExecutionOrder();
      const bts2026 = getMcpPhaseCities("bts2026");
      const france30 = getMcpPhaseCities("france30");
      const europe30 = getMcpPhaseCities("europe30");
      const meta = getMcpCitySourceMeta();
      res.json({
        success: true,
        source: meta.source,
        sourcePath: meta.path,
        count: cities.length,
        bts2026Count: meta.bts2026Count,
        franceCount: meta.franceCount,
        europeCount: meta.europeCount,
        distinctCount: meta.distinctCount,
        duplicateCount: meta.duplicateCount,
        executionOrder,
        bts2026,
        france30,
        europe30,
        cities,
      });
    } catch (error) {
      console.error("Error fetching MCP final cities:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch MCP final cities",
      });
    }
  });

  // MCP 확정 순위를 cities 컬럼으로 동기화
  app.post("/api/admin/mcp-final-cities/sync-ranks", async (_req, res) => {
    try {
      const { syncMcpCityRanksToDb } = await import("./services/mcp-city-rank-sync-service");
      const result = await syncMcpCityRanksToDb();
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error("Error syncing MCP city ranks:", error);
      res.status(500).json({
        success: false,
        error: "Failed to sync MCP city ranks",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // MCP 1단계 수동 실행: 확정 프롬프트 -> 도시/카테고리 순회 -> DB 정리 저장
  app.post("/api/admin/mcp-raw/stage1", async (req, res) => {
    try {
      const { runMcpRawStage1 } = await import("./services/mcp-raw-service");
      const cityId = req.body?.cityId ? Number(req.body.cityId) : undefined;
      const category = req.body?.category as "attraction" | "restaurant" | "healing" | "adventure" | "hotspot" | undefined;
      const runBatchId = req.body?.runBatchId ? String(req.body.runBatchId) : undefined;
      const result = await runMcpRawStage1({ cityId, category, runBatchId });
      res.json({
        success: result.success,
        stage: "stage1",
        runBatchId: result.runBatchId,
        citySource: result.citySource,
        citySourcePath: result.citySourcePath,
        processedCities: result.processedCities,
        processedCategories: result.processedCategories,
        savedRows: result.savedRows,
        errors: result.errors,
      });
    } catch (error) {
      console.error("Error running mcp-raw stage1:", error);
      res.status(500).json({
        success: false,
        stage: "stage1",
        error: "Failed to run mcp-raw stage1",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // MCP 2단계 수동 실행: 확정 도시 1개 + 카테고리 1개 단위 처리
  app.post("/api/admin/mcp-raw/stage2", async (req, res) => {
    try {
      const { runMcpRawStage2 } = await import("./services/mcp-raw-service");
      const cityId = Number(req.body?.cityId);
      const category = req.body?.category as "attraction" | "restaurant" | "healing" | "adventure" | "hotspot" | undefined;
      const runBatchId = req.body?.runBatchId ? String(req.body.runBatchId) : undefined;
      if (!Number.isFinite(cityId) || cityId <= 0) {
        return res.status(400).json({
          success: false,
          stage: "stage2",
          error: "cityId는 필수입니다.",
        });
      }
      if (!category) {
        return res.status(400).json({
          success: false,
          stage: "stage2",
          error: "category는 필수입니다.",
        });
      }
      const result = await runMcpRawStage2({ cityId, category, runBatchId });
      res.json({
        success: result.success,
        stage: "stage2",
        runBatchId: result.runBatchId,
        citySource: result.citySource,
        citySourcePath: result.citySourcePath,
        processedCityId: result.processedCityId,
        processedCategory: result.processedCategory,
        updatedRawRows: result.updatedRawRows,
        savedNubiReasonRows: result.savedNubiReasonRows,
        errors: result.errors,
      });
    } catch (error) {
      console.error("Error running mcp-raw stage2:", error);
      res.status(500).json({
        success: false,
        stage: "stage2",
        error: "Failed to run mcp-raw stage2",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // MCP 3단계 수동 실행: place_seed_raw 가격 수집 (Gemini Search)
  app.post("/api/admin/mcp-raw/stage3", async (req, res) => {
    try {
      const { runMcpRawStage3 } = await import("./services/mcp-raw-service");
      const cityId = req.body?.cityId ? Number(req.body.cityId) : undefined;
      const category = req.body?.category as "attraction" | "restaurant" | "healing" | "adventure" | "hotspot" | undefined;
      const runBatchId = req.body?.runBatchId ? String(req.body.runBatchId) : undefined;
      const batchSize = req.body?.batchSize ? Number(req.body.batchSize) : 10;
      const result = await runMcpRawStage3({ cityId, category, runBatchId, batchSize });
      res.json({
        success: result.success,
        stage: "stage3",
        runBatchId: result.runBatchId,
        citySource: result.citySource,
        citySourcePath: result.citySourcePath,
        processedCities: result.processedCities,
        processedCategories: result.processedCategories,
        updatedRows: result.updatedRows,
        errors: result.errors,
      });
    } catch (error) {
      console.error("Error running mcp-raw stage3:", error);
      res.status(500).json({
        success: false,
        stage: "stage3",
        error: "Failed to run mcp-raw stage3",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // MCP 상태 조회: 프론트 전달용
  app.get("/api/admin/mcp-raw/status", async (req, res) => {
    try {
      const { getMcpRawStatus } = await import("./services/mcp-raw-service");
      const { getMcpCitySourceMeta } = await import("./config/mcp-raw-data-final");
      const stats = await getMcpRawStatus();
      const source = getMcpCitySourceMeta();
      res.json({
        success: true,
        citySource: source.source,
        citySourcePath: source.path,
        citySourceCount: source.count,
        ...stats,
      });
    } catch (error) {
      console.error("Error fetching mcp-raw status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch mcp-raw status",
      });
    }
  });

  // MCP 워크플로우 시작 (도시/카테고리 완전 순차)
  app.post("/api/admin/mcp/workflow/start", async (req, res) => {
    try {
      const { runMcpWorkflowStart } = await import("./services/mcp-raw-service");
      const startCity = req.body?.startCity;
      const endCity = req.body?.endCity;
      const runBatchId = req.body?.runBatchId ? String(req.body.runBatchId) : undefined;
      const retryLimit = req.body?.retryLimit !== undefined ? Number(req.body.retryLimit) : undefined;
      const result = await runMcpWorkflowStart({ startCity, endCity, runBatchId, retryLimit });
      res.json({ success: result.success, ...result });
    } catch (error) {
      console.error("Error starting MCP workflow:", error);
      res.status(500).json({
        success: false,
        error: "Failed to start MCP workflow",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // MCP 워크플로우 재개 (pending/failed 재실행)
  app.post("/api/admin/mcp/workflow/resume", async (req, res) => {
    try {
      const { runMcpWorkflowResume } = await import("./services/mcp-raw-service");
      const runBatchId = req.body?.runBatchId ? String(req.body.runBatchId) : "";
      if (!runBatchId) {
        return res.status(400).json({
          success: false,
          error: "runBatchId는 필수입니다.",
        });
      }
      const retryLimit = req.body?.retryLimit !== undefined ? Number(req.body.retryLimit) : undefined;
      const startCity = req.body?.startCity;
      const endCity = req.body?.endCity;
      const result = await runMcpWorkflowResume({ runBatchId, retryLimit, startCity, endCity });
      res.json({ success: result.success, ...result });
    } catch (error) {
      console.error("Error resuming MCP workflow:", error);
      res.status(500).json({
        success: false,
        error: "Failed to resume MCP workflow",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // MCP 워크플로우 상태 조회
  app.get("/api/admin/mcp/workflow/status", async (req, res) => {
    try {
      const { getMcpWorkflowStatus } = await import("./services/mcp-raw-service");
      const runBatchId = req.query?.runBatchId ? String(req.query.runBatchId) : "";
      if (!runBatchId) {
        return res.status(400).json({
          success: false,
          error: "runBatchId 쿼리 파라미터는 필수입니다.",
        });
      }
      const status = await getMcpWorkflowStatus(runBatchId);
      res.json({ success: true, ...status });
    } catch (error) {
      console.error("Error fetching MCP workflow status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch MCP workflow status",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // MCP 워크플로우 리포트 조회
  app.get("/api/admin/mcp/workflow/report", async (req, res) => {
    try {
      const { getMcpWorkflowReport } = await import("./services/mcp-raw-service");
      const runBatchId = req.query?.runBatchId ? String(req.query.runBatchId) : "";
      if (!runBatchId) {
        return res.status(400).json({
          success: false,
          error: "runBatchId 쿼리 파라미터는 필수입니다.",
        });
      }
      const report = await getMcpWorkflowReport(runBatchId);
      res.json({ success: true, ...report });
    } catch (error) {
      console.error("Error fetching MCP workflow report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch MCP workflow report",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 위기 정보 수동 수집
  app.post("/api/admin/crisis-alerts/collect", async (req, res) => {
    try {
      const { crisisAlertService } = await import("./services/crisis-alert-service");
      const { getMcpExecutionCityNamesEn, getMcpCitySourceMeta } = await import("./config/mcp-raw-data-final");
      
      console.log("[Admin] 위기 정보 수동 수집 시작");
      const targetCities = getMcpExecutionCityNamesEn();
      const cityMeta = getMcpCitySourceMeta();
      const result = await crisisAlertService.collectCrisisAlerts(targetCities);
      
      res.json({
        success: true,
        message: "위기 정보 수집 완료",
        citySource: cityMeta.source,
        cityCount: targetCities.length,
        targetCities,
        ...result
      });
    } catch (error) {
      console.error("Error collecting crisis alerts:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to collect crisis alerts",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // MCP 순위 동기화 상태 점검 (DB 컬럼 기준)
  app.get("/api/admin/mcp-final-cities/rank-status", async (_req, res) => {
    try {
      const rows = await db.select({
        id: cities.id,
        nameKo: cities.name,
        nameEn: cities.nameEn,
        countryCode: cities.countryCode,
        mcpBucket: cities.mcpBucket,
        mcpRankFr: cities.mcpRankFr,
        mcpRankEu: cities.mcpRankEu,
        mcpRankBasis: cities.mcpRankBasis,
        mcpRankUpdatedAt: cities.mcpRankUpdatedAt,
      }).from(cities);

      const ranked = rows
        .filter((r) => r.mcpRankFr !== null || r.mcpRankEu !== null)
        .sort((a, b) => {
          const aEu = a.mcpRankEu ?? 9999;
          const bEu = b.mcpRankEu ?? 9999;
          if (aEu !== bEu) return aEu - bEu;
          const aFr = a.mcpRankFr ?? 9999;
          const bFr = b.mcpRankFr ?? 9999;
          return aFr - bFr;
        });

      res.json({
        success: true,
        rankedCount: ranked.length,
        franceCount: ranked.filter((r) => r.mcpRankFr !== null).length,
        europeCount: ranked.filter((r) => r.mcpRankEu !== null).length,
        bothCount: ranked.filter((r) => r.mcpRankFr !== null && r.mcpRankEu !== null).length,
        rankedCities: ranked,
      });
    } catch (error) {
      console.error("Error fetching MCP city rank status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch MCP city rank status",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  // 위기 정보 비활성화
  app.post("/api/admin/crisis-alerts/:id/deactivate", async (req, res) => {
    try {
      const { crisisAlertService } = await import("./services/crisis-alert-service");
      
      const alertId = parseInt(req.params.id);
      const result = await crisisAlertService.deactivateAlert(alertId);
      
      res.json({
        success: result,
        message: result ? "알림 비활성화 완료" : "비활성화 실패"
      });
    } catch (error) {
      console.error("Error deactivating crisis alert:", error);
      res.status(500).json({ success: false, error: "Failed to deactivate alert" });
    }
  });
  
  // 특정 도시 위기 정보 조회 (일정표용)
  app.get("/api/crisis-alerts/:city", async (req, res) => {
    try {
      const { crisisAlertService } = await import("./services/crisis-alert-service");
      
      const city = req.params.city;
      const alerts = await crisisAlertService.getActiveAlerts(city);
      
      res.json({
        success: true,
        city,
        alerts,
        hasActiveAlerts: alerts.length > 0,
        highestSeverity: alerts.length > 0 ? Math.max(...alerts.map(a => a.severity)) : 0
      });
    } catch (error) {
      console.error("Error fetching city crisis alerts:", error);
      res.status(500).json({ success: false, alerts: [] });
    }
  });
  
  // ========================================
  // 🚨 여행 일정 ↔ 위기 정보 실시간 매칭 API
  // 사용자가 일정 생성/조회 시 해당 도시+날짜의 위기 정보 반환
  // ========================================
  
  app.get("/api/trip-alerts", async (req, res) => {
    try {
      const { crisisAlertService } = await import("./services/crisis-alert-service");
      
      const city = req.query.city as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!city || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: "city, startDate, endDate 파라미터가 필요합니다"
        });
      }
      
      const result = await crisisAlertService.getAlertsForTrip(city, startDate, endDate);
      
      res.json({
        success: true,
        ...result,
        // 프론트엔드용 추가 정보
        shouldShowPopup: result.highSeverity,
        notificationLevel: result.highSeverity ? 'warning' : (result.hasAlerts ? 'info' : 'none'),
        alertCount: result.alerts.length
      });
    } catch (error) {
      console.error("Error fetching trip alerts:", error);
      res.status(500).json({ success: false, alerts: [], summary: "위기 정보 조회 실패" });
    }
  });
  
  // 여행 일정 생성 시 위기 정보 체크 (POST - 여러 도시 지원)
  app.post("/api/trip-alerts/check", async (req, res) => {
    try {
      const { crisisAlertService } = await import("./services/crisis-alert-service");
      
      const { cities, startDate, endDate } = req.body as {
        cities: string[];
        startDate: string;
        endDate: string;
      };
      
      if (!cities || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: "cities[], startDate, endDate가 필요합니다"
        });
      }
      
      const results: Record<string, any> = {};
      let hasAnyHighSeverity = false;
      let totalAlerts = 0;
      
      for (const city of cities) {
        const result = await crisisAlertService.getAlertsForTrip(city, startDate, endDate);
        results[city] = result;
        if (result.highSeverity) hasAnyHighSeverity = true;
        totalAlerts += result.alerts.length;
      }
      
      res.json({
        success: true,
        results,
        summary: {
          totalAlerts,
          hasHighSeverity: hasAnyHighSeverity,
          shouldShowWarning: hasAnyHighSeverity,
          citiesWithAlerts: Object.entries(results)
            .filter(([_, r]: [string, any]) => r.hasAlerts)
            .map(([city]) => city)
        }
      });
    } catch (error) {
      console.error("Error checking trip alerts:", error);
      res.status(500).json({ success: false, error: "위기 정보 체크 실패" });
    }
  });
  
}
