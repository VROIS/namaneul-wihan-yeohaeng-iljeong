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

  async initialize(): Promise<void> {
    if (this.isRunning) {
      console.log("[Scheduler] Already running");
      return;
    }

    console.log("[Scheduler] Initializing data collection scheduler");

    const schedules = await db.query.dataCollectionSchedule.findMany({
      where: eq(dataCollectionSchedule.isEnabled, true),
    });

    for (const schedule of schedules) {
      this.scheduleTask(schedule.taskName, schedule.cronExpression);
    }

    this.scheduleDefaultTasks();

    this.isRunning = true;
    console.log("[Scheduler] Data collection scheduler initialized");
  }

  private scheduleDefaultTasks(): void {
    this.scheduleTask("youtube_sync", "0 18 * * *");
    this.scheduleTask("instagram_sync", "30 18 * * *");
    this.scheduleTask("crisis_sync", "0 19 * * *");
    this.scheduleTask("exchange_rate_sync", "0 0 * * *");
    console.log("[Scheduler] Default tasks scheduled (3AM, 3:30AM, 4AM KST = 18:00, 18:30, 19:00 UTC)");
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
        case "crisis_sync":
          result = await this.runCrisisSync();
          break;
        case "exchange_rate_sync":
          result = await this.runExchangeRateSync();
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
      const result = await instagramCrawler.syncAllHashtags();
      return {
        success: true,
        itemsProcessed: result.synced,
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
      const { crawlCrisisAlerts } = await import("./crisis-crawler");
      const result = await crawlCrisisAlerts();
      return {
        success: result.success,
        itemsProcessed: result.alertsCreated,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  async runNow(taskName: string): Promise<{ success: boolean; message: string }> {
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
        crisis_sync: "매일 04:00 KST",
        exchange_rate_sync: "매일 09:00 KST",
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
