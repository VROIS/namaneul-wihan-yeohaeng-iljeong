import * as cron from "node-cron";
import { db } from "../db";
import { dataSyncLog, dataCollectionSchedule } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

interface ScheduledTask {
  taskName: string;
  cronExpression: string;
  description: string;
  handler: () => Promise<{ success: boolean; message: string; details?: any }>;
}

type CronTask = ReturnType<typeof cron.schedule>;

export class DataScheduler {
  private tasks: Map<string, CronTask> = new Map();
  private isRunning: boolean = false;

  // 💰 [비용 보호] Google Places API 폭탄 방지 - place_seed_sync 차단
  // 이 크롤러만 Google Places API를 직접 호출하여 월 $1,000+ 과금 유발
  // 나머지 13개 크롤러는 Gemini/무료 API만 사용하므로 안전
  private static readonly BLOCKED_TASKS: Set<string> = new Set([
    "place_seed_sync", // Google Places API 직접 호출 → $1,000+ 폭탄 주범
  ]);

  async initialize(): Promise<void> {
    if (this.isRunning) {
      console.log("[Scheduler] Already running");
      return;
    }

    console.log("[Scheduler] Initializing data collection scheduler");
    console.log(`[Scheduler] 🚫 차단된 크롤러: ${[...DataScheduler.BLOCKED_TASKS].join(", ")}`);

    const schedules = await db.query.dataCollectionSchedule.findMany({
      where: eq(dataCollectionSchedule.isEnabled, true),
    });

    for (const schedule of schedules) {
      if (DataScheduler.BLOCKED_TASKS.has(schedule.taskName)) {
        console.log(`[Scheduler] ⛔ ${schedule.taskName} - 비용 보호로 차단됨`);
        continue;
      }
      this.scheduleTask(schedule.taskName, schedule.cronExpression);
    }

    this.scheduleDefaultTasks();

    this.isRunning = true;
    console.log("[Scheduler] Data collection scheduler initialized");
    
    // 🚨 서버 시작 시 위기 정보 즉시 수집 (1분 후)
    setTimeout(async () => {
      console.log("[Scheduler] 🚨 서버 시작 - 위기 정보 즉시 수집 시작...");
      await this.executeTask("crisis_sync");
    }, 60000); // 1분 후 실행 (API 키 로드 대기)
  }

  private scheduleDefaultTasks(): void {
    // ============================================
    // 📅 자동 수집 스케줄 (KST 기준)
    // ============================================
    
    // 🌤️ 날씨: 매 시간 (실시간성 중요)
    this.scheduleTask("weather_sync", "0 * * * *");         // 매 시간 정각
    
    // 💱 환율: 하루 3번 (오전/오후/저녁)
    this.scheduleTask("exchange_rate_sync", "0 0,8,16 * * *"); // 09:00, 17:00, 01:00 KST
    
    // 🚨 위기 정보: 30분마다 (실시간성 매우 중요!)
    this.scheduleTask("crisis_sync", "*/30 * * * *");       // 매 30분
    
    // 📺 YouTube: 하루 2번
    this.scheduleTask("youtube_sync", "0 3,15 * * *");      // 12:00, 00:00 KST
    
    // 📝 블로그: 하루 2번
    this.scheduleTask("naver_blog_sync", "30 3,15 * * *");  // 12:30, 00:30 KST
    this.scheduleTask("tistory_sync", "45 3,15 * * *");     // 12:45, 00:45 KST
    
    // 📸 인스타그램: 하루 2번
    this.scheduleTask("instagram_sync", "0 4,16 * * *");    // 13:00, 01:00 KST
    
    // 🍽️ 미쉐린/TripAdvisor: 하루 1번 (새벽)
    this.scheduleTask("michelin_sync", "0 19 * * *");       // 04:00 KST
    this.scheduleTask("tripadvisor_sync", "30 19 * * *");   // 04:30 KST
    
    // 💰 가격: 하루 2번
    this.scheduleTask("price_sync", "0 5,17 * * *");        // 14:00, 02:00 KST
    
    // 🇰🇷 한국 플랫폼 (마이리얼트립/클룩/트립닷컴): 하루 1번
    this.scheduleTask("korean_platform_sync", "0 20 * * *"); // 05:00 KST
    
    // 📦 패키지 투어 검증 (하나투어/모두투어 등): 하루 1번
    this.scheduleTask("package_tour_sync", "30 20 * * *");   // 05:30 KST
    
    // 📸 포토스팟 점수 계산: 하루 1번
    this.scheduleTask("photospot_sync", "0 21 * * *");       // 06:00 KST
    
    // 🌱 장소 시딩: ⛔ 비용 보호로 차단 (Google Places API 폭탄 주범)
    // this.scheduleTask("place_seed_sync", "0 */6 * * *");
    
    console.log("[Scheduler] ✅ 자동 수집 스케줄 설정 완료:");
    console.log("  - 날씨: 매 시간");
    console.log("  - 환율: 하루 3번");
    console.log("  - 위기 정보: 30분마다");
    console.log("  - YouTube/블로그: 하루 2번");
    console.log("  - 인스타그램: 하루 2번");
    console.log("  - 미쉐린/TripAdvisor: 하루 1번");
    console.log("  - 한국 플랫폼: 하루 1번");
    console.log("  - 패키지 투어 검증: 하루 1번");
    console.log("  - 포토스팟 점수: 하루 1번");
    console.log("  - ⛔ 장소 시딩: 차단됨 (Google Places API 비용 보호)");
  }

  private scheduleTask(taskName: string, cronExpression: string): void {
    if (this.tasks.has(taskName)) {
      this.tasks.get(taskName)?.stop();
    }

    if (!cron.validate(cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression for ${taskName}: ${cronExpression}`);
      return;
    }

    const task = cron.schedule(cronExpression, async () => {
      console.log(`[Scheduler] Running scheduled task: ${taskName}`);
      await this.executeTask(taskName);
    });

    this.tasks.set(taskName, task);
    console.log(`[Scheduler] Scheduled ${taskName} with cron: ${cronExpression}`);
  }

  private async executeTask(taskName: string): Promise<void> {
    const startTime = new Date();

    try {
      await db.insert(dataSyncLog).values({
        entityType: taskName,
        source: "scheduler",
        status: "running",
        startedAt: startTime,
      });

      let result: { success: boolean; itemsProcessed?: number; errors?: string[] };

      switch (taskName) {
        case "youtube_sync":
          result = await this.runYouTubeSync();
          break;
        case "instagram_sync":
          result = await this.runInstagramSync();
          break;
        case "price_sync":
          result = await this.runPriceSync();
          break;
        case "crisis_sync":
          result = await this.runCrisisSync();
          break;
        case "naver_blog_sync":
          result = await this.runNaverBlogSync();
          break;
        case "weather_sync":
          result = await this.runWeatherSync();
          break;
        case "tripadvisor_sync":
          result = await this.runTripAdvisorSync();
          break;
        case "michelin_sync":
          result = await this.runMichelinSync();
          break;
        case "exchange_rate_sync":
          result = await this.runExchangeRateSync();
          break;
        case "tistory_sync":
          result = await this.runTistorySync();
          break;
        case "korean_platform_sync":
          result = await this.runKoreanPlatformSync();
          break;
        case "package_tour_sync":
          result = await this.runPackageTourSync();
          break;
        case "photospot_sync":
          result = await this.runPhotospotSync();
          break;
        case "place_seed_sync":
          result = await this.runPlaceSeedSync();
          break;
        default:
          console.warn(`[Scheduler] Unknown task: ${taskName}`);
          result = { success: false };
      }

      await db.insert(dataSyncLog).values({
        entityType: taskName,
        source: "scheduler",
        status: result.success ? "success" : "failed",
        startedAt: startTime,
        completedAt: new Date(),
        itemsProcessed: result.itemsProcessed || 0,
        itemsFailed: result.errors?.length || 0,
        errorMessage: result.errors?.join("; "),
      });

      console.log(`[Scheduler] Task ${taskName} completed: ${result.success ? "success" : "failed"}`);
    } catch (error: any) {
      console.error(`[Scheduler] Task ${taskName} failed:`, error);

      await db.insert(dataSyncLog).values({
        entityType: taskName,
        source: "scheduler",
        status: "failed",
        startedAt: startTime,
        completedAt: new Date(),
        errorMessage: error.message,
      });
    }
  }

  private async runYouTubeSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { youtubeCrawler } = await import("./youtube-crawler");
      const result = await youtubeCrawler.syncAllChannels();
      return {
        success: result.errors.length === 0,
        itemsProcessed: result.totalVideos,
        errors: result.errors,
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runInstagramSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { instagramCrawler } = await import("./instagram-crawler");
      
      // 해시태그 동기화
      const hashtagResult = await instagramCrawler.syncAllHashtags();
      console.log(`[Scheduler] Instagram 해시태그 동기화: ${hashtagResult.synced}개`);
      
      // 위치 동기화도 함께 실행
      let locationSynced = 0;
      try {
        const locationResult = await instagramCrawler.syncAllLocations();
        locationSynced = locationResult.synced;
        console.log(`[Scheduler] Instagram 위치 동기화: ${locationSynced}개`);
      } catch (locError) {
        console.warn("[Scheduler] Instagram 위치 동기화 실패:", locError);
      }
      
      return {
        success: true,
        itemsProcessed: hashtagResult.synced + locationSynced,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runExchangeRateSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { exchangeRateFetcher } = await import("./exchange-rate");
      const result = await exchangeRateFetcher.syncExchangeRates();
      return {
        success: true,
        itemsProcessed: result.synced,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runCrisisSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { crisisAlertService } = await import("./crisis-alert-service");
      
      // 1. 만료된 알림 자동 정리 (DB 폭발 방지)
      const cleanup = await crisisAlertService.cleanupExpiredAlerts();
      console.log(`[CrisisSync] 🧹 정리: ${cleanup.deleted}개 삭제`);
      
      // 2. 새로운 GDELT + Gemini 기반 위기 정보 수집
      const result = await crisisAlertService.collectCrisisAlerts();
      
      return {
        success: true,
        itemsProcessed: result.savedAlerts,
        errors: [],
      };
    } catch (error: any) {
      console.error("[CrisisSync] 위기 정보 수집 실패:", error);
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runPriceSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { crawlAllPrices } = await import("./price-crawler");
      const result = await crawlAllPrices();
      return {
        success: result.success,
        itemsProcessed: result.totalPrices,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runNaverBlogSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { crawlAllBlogs } = await import("./naver-blog-crawler");
      const result = await crawlAllBlogs();
      return {
        success: result.success,
        itemsProcessed: result.totalPosts,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runWeatherSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { syncAllCitiesWeather } = await import("./weather-crawler");
      const result = await syncAllCitiesWeather();
      return {
        success: result.success,
        itemsProcessed: result.citiesSynced,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runTripAdvisorSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { crawlAllTripAdvisor } = await import("./tripadvisor-crawler");
      const result = await crawlAllTripAdvisor();
      return {
        success: result.success,
        itemsProcessed: result.total,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runMichelinSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { crawlAllMichelin } = await import("./michelin-crawler");
      const result = await crawlAllMichelin();
      return {
        success: result.success,
        itemsProcessed: result.totalCollected,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runTistorySync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { crawlAllTistory } = await import("./tistory-crawler");
      const result = await crawlAllTistory();
      return {
        success: result.success,
        itemsProcessed: result.totalPosts + result.totalPlaces,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runKoreanPlatformSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { crawlAllKoreanPlatforms } = await import("./korean-platform-crawler");
      const result = await crawlAllKoreanPlatforms();
      return {
        success: result.success,
        itemsProcessed: result.totalCollected,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runPackageTourSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { validateAllPackageTours } = await import("./package-tour-validator");
      const result = await validateAllPackageTours();
      return {
        success: result.success,
        itemsProcessed: result.totalValidated,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runPhotospotSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { scoreAllPhotospots } = await import("./photospot-scorer");
      const result = await scoreAllPhotospots();
      return {
        success: result.success,
        itemsProcessed: result.totalScored,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  private async runPlaceSeedSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { placeSeeder } = await import("./place-seeder");
      const result = await placeSeeder.seedAllPendingCities();
      return {
        success: true,
        itemsProcessed: result.totalSeeded,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  async runNow(taskName: string): Promise<{ success: boolean; message: string }> {
    // 💰 차단된 크롤러는 수동 실행도 차단
    if (DataScheduler.BLOCKED_TASKS.has(taskName)) {
      console.warn(`[Scheduler] ⛔ ${taskName} 수동 실행 차단됨 (비용 보호)`);
      return { success: false, message: `${taskName}은 비용 보호로 차단되었습니다. BLOCKED_TASKS에서 제거 후 실행하세요.` };
    }
    
    console.log(`[Scheduler] Manual trigger for task: ${taskName}`);
    try {
      await this.executeTask(taskName);
      return { success: true, message: `Task ${taskName} executed successfully` };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  getStatus(): {
    isRunning: boolean;
    scheduledTasks: string[];
    nextRuns: { taskName: string; nextRun: string }[];
  } {
    const scheduledTasks = Array.from(this.tasks.keys());
    const kstOffset = 9 * 60 * 60 * 1000;

    const nextRuns = scheduledTasks.map((taskName) => {
      const expressions: { [key: string]: string } = {
        youtube_sync: "매일 03:00 KST",
        instagram_sync: "매일 03:30 KST",
        michelin_sync: "매일 03:40 KST",
        price_sync: "매일 03:45 KST",
        crisis_sync: "매일 04:00 KST",
        naver_blog_sync: "매일 04:15 KST",
        tistory_sync: "매일 04:20 KST",
        weather_sync: "매일 04:30 KST",
        tripadvisor_sync: "매일 04:45 KST",
        exchange_rate_sync: "매일 09:00 KST",
        place_seed_sync: "6시간마다 (연쇄 실행)",
      };
      return {
        taskName,
        nextRun: expressions[taskName] || "알 수 없음",
      };
    });

    return {
      isRunning: this.isRunning,
      scheduledTasks,
      nextRuns,
    };
  }

  stop(): void {
    for (const [taskName, task] of this.tasks) {
      task.stop();
      console.log(`[Scheduler] Stopped task: ${taskName}`);
    }
    this.tasks.clear();
    this.isRunning = false;
    console.log("[Scheduler] All tasks stopped");
  }
}

export const dataScheduler = new DataScheduler();
