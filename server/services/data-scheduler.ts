import * as cron from "node-cron";
import { db } from "../db";
import { dataSyncLog, dataCollectionSchedule } from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";

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

  // 💰 [비용 관리] BLOCKED_TASKS = 수동 실행도 차단
  private static readonly BLOCKED_TASKS: Set<string> = new Set([]);

  // ⏸️ [일시 중단] 비용 나가는 크롤러 — 삭제 아님, 추후 재활성화 가능
  // 현재 정책: 비용 유발 6개만 즉시 중단
  private static readonly PAUSED_TASKS: Set<string> = new Set([
    "youtube_sync",         // YouTube API
    "instagram_sync",       // Meta/인스타
    "naver_blog_sync",      // 블로그 크롤러
    "tistory_sync",         // 블로그 크롤러
    "michelin_sync",        // 미쉐린/TripAdvisor
    "tripadvisor_sync",
  ]);

  static isTaskDisabledByPolicy(taskName: string): boolean {
    return DataScheduler.BLOCKED_TASKS.has(taskName) || DataScheduler.PAUSED_TASKS.has(taskName);
  }

  static getPausedTasks(): string[] {
    return [...DataScheduler.PAUSED_TASKS];
  }

  async initialize(): Promise<void> {
    if (this.isRunning) {
      console.log("[Scheduler] Already running");
      return;
    }

    console.log("[Scheduler] Initializing data collection scheduler");
    console.log(`[Scheduler] 🚫 차단(BLOCKED): ${[...DataScheduler.BLOCKED_TASKS].join(", ") || "없음"}`);
    console.log(`[Scheduler] ⏸️ 일시 중단(PAUSED, 비용 절감): ${DataScheduler.PAUSED_TASKS.size}개`);

    await this.syncPausedTasksToDb();

    const schedules = await db.query.dataCollectionSchedule.findMany({
      where: eq(dataCollectionSchedule.isEnabled, true),
    });

    for (const schedule of schedules) {
      if (DataScheduler.isTaskDisabledByPolicy(schedule.taskName)) {
        console.log(`[Scheduler] ⛔ ${schedule.taskName} - 정책상 차단/일시중단`);
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

    // 🌱 장소 시딩: PAUSED 시 스킵 (비용 절감)
    setTimeout(async () => {
      if (DataScheduler.BLOCKED_TASKS.has("place_seed_sync")) return;
      if (DataScheduler.PAUSED_TASKS.has("place_seed_sync")) return;
      if (!(await this.isPlaceSeedSyncEnabled())) return;
      console.log("[Scheduler] 🌱 서버 시작 - place_seed_sync 1회 실행...");
      await this.executeTask("place_seed_sync");
    }, 120000);
  }

  private scheduleTaskIfNotPaused(taskName: string, cronExpression: string): void {
    if (DataScheduler.isTaskDisabledByPolicy(taskName)) {
      console.log(`[Scheduler] ⏸️ ${taskName} 일시 중단됨 (PAUSED_TASKS)`);
      return;
    }
    this.scheduleTask(taskName, cronExpression);
  }

  private scheduleDefaultTasks(): void {
    // ============================================
    // 📅 자동 수집 스케줄 (KST 기준)
    // ⏸️ PAUSED_TASKS에 있는 크롤러는 스케줄 안 함 (비용 절감)
    // ✅ 유지: 날씨, 환율, 위기경보 (무료·실사긴성)
    // ============================================
    
    // 🌤️ 날씨: 매 시간 (실시간성 중요) — 유지
    this.scheduleTask("weather_sync", "0 * * * *");
    
    // 💱 환율: 하루 3번 — 유지 (Frankfurter API 무료)
    this.scheduleTask("exchange_rate_sync", "0 0,8,16 * * *");
    
    // 🚨 위기 정보: 30분마다 — 유지 (GDELT 무료 + Gemini)
    this.scheduleTask("crisis_sync", "*/30 * * * *");
    
    // ⏸️ 아래는 PAUSED (비용/크롤러 파이프라인)
    this.scheduleTaskIfNotPaused("wikimedia_sync", "30 1 * * *");
    this.scheduleTaskIfNotPaused("opentripmap_sync", "0 2 * * *");
    this.scheduleTaskIfNotPaused("youtube_sync", "0 3,15 * * *");
    this.scheduleTaskIfNotPaused("naver_blog_sync", "30 3,15 * * *");
    this.scheduleTaskIfNotPaused("tistory_sync", "45 3,15 * * *");
    this.scheduleTaskIfNotPaused("instagram_sync", "0 4,16 * * *");
    this.scheduleTaskIfNotPaused("michelin_sync", "0 19 * * *");
    this.scheduleTaskIfNotPaused("tripadvisor_sync", "30 19 * * *");
    this.scheduleTaskIfNotPaused("price_sync", "0 5,17 * * *");
    this.scheduleTaskIfNotPaused("korean_platform_sync", "0 20 * * *");
    this.scheduleTaskIfNotPaused("package_tour_sync", "30 20 * * *");
    this.scheduleTaskIfNotPaused("photospot_sync", "0 21 * * *");
    this.scheduleTaskIfNotPaused("score_aggregation", "0 22 * * *");
    this.scheduleTaskIfNotPaused("place_seed_sync", "0 18 * * *");
    this.scheduleTaskIfNotPaused("place_link_sync", "30 21 * * *");
    
    console.log("[Scheduler] ✅ 스케줄 설정 완료:");
    console.log("  - 🌤️ 날씨: 매 시간");
    console.log("  - 💱 환율: 하루 3번");
    console.log("  - 🚨 위기 정보: 30분마다");
    console.log(`  - ⏸️ 일시 중단: ${DataScheduler.PAUSED_TASKS.size}개 크롤러 (재활성화: PAUSED_TASKS에서 제거)`);
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
    if (DataScheduler.isTaskDisabledByPolicy(taskName)) {
      console.warn(`[Scheduler] ⛔ ${taskName} 실행 차단 (정책상 중단)`);
      return;
    }

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
        case "wikimedia_sync":
          result = await this.runWikimediaSync();
          break;
        case "opentripmap_sync":
          result = await this.runOpenTripMapSync();
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
          if (!(await this.isPlaceSeedSyncEnabled())) {
            console.log("[Scheduler] 🌱 place_seed_sync 토글 OFF — 건너뜀 (일정 생성용 API 할당량 확보)");
            result = { success: true, itemsProcessed: 0 };
          } else {
            result = await this.runPlaceSeedSync();
          }
          break;
        case "place_link_sync":
          result = await this.runPlaceLinkSync();
          break;
        case "score_aggregation":
          result = await this.runScoreAggregation();
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

      if (!result.success && result.errors?.length) {
        console.error(`[Scheduler] Task ${taskName} failed:`, result.errors.join("; "));
      }
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

  private async runWikimediaSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { syncWikimediaPhotos } = await import("./wikimedia-enrichment");
      const result = await syncWikimediaPhotos();
      return {
        success: result.success,
        itemsProcessed: result.placesProcessed,
        errors: result.errors,
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [(error as Error).message] };
    }
  }

  private async runOpenTripMapSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { syncOpenTripMapDescriptions } = await import("./opentripmap-enrichment");
      const result = await syncOpenTripMapDescriptions();
      return {
        success: result.success,
        itemsProcessed: result.placesProcessed,
        errors: result.errors,
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [(error as Error).message] };
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

  private async runScoreAggregation(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { aggregateAllScores } = await import("./score-aggregator");
      const result = await aggregateAllScores();
      return {
        success: result.success,
        itemsProcessed: result.updated,
        errors: result.errors,
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  /** place_seed_sync 자동 실행 on/off (DB data_collection_schedule) */
  async isPlaceSeedSyncEnabled(): Promise<boolean> {
    try {
      const [row] = await db
        .select({ isEnabled: dataCollectionSchedule.isEnabled })
        .from(dataCollectionSchedule)
        .where(eq(dataCollectionSchedule.taskName, "place_seed_sync"))
        .limit(1);
      return row ? row.isEnabled !== false : true;
    } catch {
      return true;
    }
  }

  private async runPlaceSeedSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { placeSeeder } = await import("./place-seeder");
      const result = await placeSeeder.seedPriorityCityByCategory();
      return { success: true, itemsProcessed: result.seeded + result.linked, errors: [] };
    } catch (error: any) {
      console.error("[Scheduler] place_seed_sync 스택:", error?.stack || error);
      return { success: false, itemsProcessed: 0, errors: [error?.message || String(error)] };
    }
  }

  private async runPlaceLinkSync(): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
    try {
      const { linkAllPendingData } = await import("./place-linker");
      const result = await linkAllPendingData();
      return {
        success: true,
        itemsProcessed: result.totalLinked,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  async runNow(taskName: string): Promise<{ success: boolean; message: string }> {
    if (DataScheduler.isTaskDisabledByPolicy(taskName)) {
      console.warn(`[Scheduler] ⛔ ${taskName} 수동 실행 차단됨 (정책상 중단)`);
      return { success: false, message: `${taskName}은 현재 일시 중단 정책으로 실행이 차단되었습니다.` };
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

  private async syncPausedTasksToDb(): Promise<void> {
    const pausedTasks = [...DataScheduler.PAUSED_TASKS];
    if (pausedTasks.length === 0) return;

    try {
      await db
        .update(dataCollectionSchedule)
        .set({
          isEnabled: false,
          lastStatus: "paused_by_policy",
        })
        .where(inArray(dataCollectionSchedule.taskName, pausedTasks));
      console.log(`[Scheduler] 🔒 정책 중단 태스크 DB 동기화 완료: ${pausedTasks.join(", ")}`);
    } catch (error) {
      console.warn("[Scheduler] 정책 중단 태스크 DB 동기화 실패:", error);
    }
  }
}

export const dataScheduler = new DataScheduler();
