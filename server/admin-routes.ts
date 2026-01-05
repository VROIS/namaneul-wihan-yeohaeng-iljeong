import type { Express } from "express";
import { db } from "./db";
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
      const services = await db.select().from(apiServiceStatus);
      
      const envStatus = {
        GOOGLE_MAPS_API_KEY: !!process.env.GOOGLE_MAPS_API_KEY,
        OPENWEATHER_API_KEY: !!process.env.OPENWEATHER_API_KEY,
        YOUTUBE_DATA_API_KEY: !!process.env.YOUTUBE_DATA_API_KEY,
        EXCHANGE_RATE_API_KEY: !!process.env.EXCHANGE_RATE_API_KEY,
        AI_INTEGRATIONS_GEMINI_API_KEY: !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      };
      
      res.json({ services, envStatus });
    } catch (error) {
      console.error("Error fetching API services:", error);
      res.status(500).json({ error: "Failed to fetch API services" });
    }
  });
  
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
              return !!process.env.GOOGLE_MAPS_API_KEY;
            case "openweather":
              return !!process.env.OPENWEATHER_API_KEY;
            case "youtube_data":
              return !!process.env.YOUTUBE_DATA_API_KEY;
            case "exchange_rate":
              return !!process.env.EXCHANGE_RATE_API_KEY;
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
}
