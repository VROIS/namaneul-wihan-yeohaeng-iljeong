/**
 * ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Step 4 DB DROP = data_sync_log 테이블 폐기
 * = 옛 INSERT 2 곳 = console.log 로 대체 (= cron 실행 로그 = stdout 만 = 영속 X)
 * = 유지 1 task = exchange_rate_sync (= Frankfurter 무료 + 30 통화 실시간)
 */
import * as cron from "node-cron";
import { db } from "../db";

type CronTask = ReturnType<typeof cron.schedule>;

export class DataScheduler {
  private tasks: Map<string, CronTask> = new Map();
  private isRunning: boolean = false;

  async initialize(): Promise<void> {
    if (this.isRunning) {
      console.log("[Scheduler] Already running");
      return;
    }

    console.log("[Scheduler] Initializing (= 단순화 = exchange_rate_sync 만)");

    // 💱 환율: 하루 3번 (= Frankfurter API 무료)
    this.scheduleTask("exchange_rate_sync", "0 0,8,16 * * *");

    // 🧹 탈퇴 유예(6개월) 만료 계정 정리: 하루 1번 새벽 (2026-08-08 사장님 확정)
    //   관리자 화면 버튼(POST /api/admin/account-cleanup)과 **같은 함수 1벌**을 부른다(§0).
    this.scheduleTask("account_cleanup", "30 4 * * *");

    // 💳 결제 원장 대조: 하루 1번 새벽 (2026-08-12 사장님 승인 = 자가치유 최후망)
    //   부팅 자가치유·관리자 수동 라우트와 **같은 함수 1벌**(payment-routes reconcilePayments §0).
    this.scheduleTask("payment_reconcile", "50 4 * * *");

    this.isRunning = true;
    console.log(
      "[Scheduler] ✅ exchange_rate_sync 매일 00:00 / 08:00 / 16:00 + account_cleanup 매일 04:30 + payment_reconcile 매일 04:50 활성",
    );
  }

  private scheduleTask(taskName: string, cronExpression: string): void {
    if (this.tasks.has(taskName)) return;
    const task = cron.schedule(cronExpression, async () => {
      await this.executeTask(taskName);
    });
    this.tasks.set(taskName, task);
  }

  private async executeTask(taskName: string): Promise<void> {
    const startTime = new Date();
    console.log(`[Scheduler] Executing task: ${taskName}`);

    try {
      if (!db) {
        console.warn(`[Scheduler] DB 미연결 = ${taskName} 스킵`);
        return;
      }

      let result: {
        success: boolean;
        itemsProcessed: number;
        errors: string[];
      } = { success: false, itemsProcessed: 0, errors: ["unknown task"] };

      if (taskName === "exchange_rate_sync") {
        result = await this.runExchangeRateSync();
      } else if (taskName === "account_cleanup") {
        // 탈퇴 유예 만료 정리 = 관리자 버튼과 같은 함수 1벌(§0)
        const { cleanupDeletedAccounts } = await import("./account-cleanup");
        const r = await cleanupDeletedAccounts();
        result = {
          success: true,
          itemsProcessed: r.대상계정,
          errors: r.실패한사진 > 0 ? [`사진 삭제 실패 ${r.실패한사진}장`] : [],
        };
      } else if (taskName === "payment_reconcile") {
        // 결제 원장 대조 = 부팅·관리자 라우트와 같은 함수 1벌(§0). 놓친 충전을 자동 회수.
        const { reconcilePayments } = await import("../payment-routes");
        const r = await reconcilePayments(3);
        result = { success: true, itemsProcessed: r.credited, errors: [] };
      }

      const elapsed = Date.now() - startTime.getTime();
      console.log(
        `[Scheduler] Task ${taskName} ${result.success ? "✅" : "❌"} = ${result.itemsProcessed} 항목 / ${result.errors.length} 오류 / ${elapsed}ms`,
      );
      if (result.errors.length > 0)
        console.warn(`[Scheduler] errors:`, result.errors.join("; "));
    } catch (error: any) {
      const elapsed = Date.now() - startTime.getTime();
      console.error(
        `[Scheduler] Task ${taskName} ❌ FATAL (${elapsed}ms):`,
        error.message,
      );
    }
  }

  private async runExchangeRateSync(): Promise<{
    success: boolean;
    itemsProcessed: number;
    errors: string[];
  }> {
    try {
      const { exchangeRateFetcher } = await import("./exchange-rate");
      const result = await exchangeRateFetcher.syncExchangeRates();
      return {
        success: true,
        itemsProcessed: result?.synced || 0,
        errors: [],
      };
    } catch (error: any) {
      return { success: false, itemsProcessed: 0, errors: [error.message] };
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isRunning) return;
    console.log("[Scheduler] Shutting down...");
    for (const [name, task] of Array.from(this.tasks.entries())) {
      task.stop();
      console.log(`[Scheduler] Stopped: ${name}`);
    }
    this.tasks.clear();
    this.isRunning = false;
    console.log("[Scheduler] ✅ Shutdown complete");
  }
}

export const dataScheduler = new DataScheduler();
