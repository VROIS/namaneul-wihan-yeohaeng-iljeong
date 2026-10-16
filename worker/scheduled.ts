// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 워커 정기 작업(카카오 열쇠·환율·계정 정리·지표·멈춘 여정 청소) 한 곳 = 후처리 큐는 사람 인증이 필요해 영구 삭제 (정본 §정리)
import { sql } from "drizzle-orm";
import { db, pool, withEngineDb } from "./lib/db";
import { refreshRates } from "./lib/services/fill/exchange-rates";
import { appendTick } from "./lib/services/shared/metrics-heartbeat";
import { runSnapshotTick } from "./admin-snapshot";
import { refreshKakaoJwks } from "./routes-social-auth";
import { cleanupDeletedAccounts } from "./lib/services/account-cleanup";

const KAKAO_JWKS_CRON = "0 3 * * *";
const ACCOUNT_CLEANUP_CRON = "30 4 * * *";
const RATES_CRON = "0 5 * * *";

export const withScheduled = <T extends object>(httpHandler: T) => ({
  ...httpHandler,
  scheduled: (controller: ScheduledController) =>
    controller.cron === KAKAO_JWKS_CRON
      ? kakaoJwksTick()
      : controller.cron === ACCOUNT_CLEANUP_CRON
        ? accountCleanupTick()
        : controller.cron === RATES_CRON
          ? ratesTick()
          : metricsTick(),
});

// ⚠️ 수정금지(승인필요) 2026-09-25 사장님 결정 = 관제탑이 매일 카카오 공개 열쇠를 금고에 갱신 = 로그인 중에는 카카오를 부르지 않는다, 실패하면 금고의 기존 열쇠 유지 (정본 9-25)
async function kakaoJwksTick(): Promise<void> {
  try {
    await withEngineDb(() => refreshKakaoJwks(db!));
    console.log("[카카오] 공개 열쇠 갱신 확인");
  } catch (e) {
    console.warn("[카카오] 공개 열쇠 갱신 실패:", (e as Error).message);
  }
}

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 환율표는 사람 없이 자동 갱신 (정본 §)
async function ratesTick(): Promise<void> {
  try {
    const n = await withEngineDb(() => refreshRates(pool!));
    console.log(`[환율] 환율표 갱신 = ${n} 통화`);
  } catch (e) {
    console.warn("[환율] 환율표 갱신 실패:", (e as Error).message);
  }
}

// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 탈퇴 6개월 정리 = 관제탑이 매일 04:30(UTC) 정리 함수 1벌을 부른다(관리자 버튼과 같은 함수) (정본 9-27)
async function accountCleanupTick(): Promise<void> {
  try {
    const r = await withEngineDb(() => cleanupDeletedAccounts());
    console.log(
      `[정리] 탈퇴 계정 정리 = 대상 ${r.대상계정} / 완료 ${r.정리완료} / 보류 ${r.보류} (사진 삭제 ${r.삭제한사진}장, 실패 ${r.실패한사진}장)`,
    );
  } catch (e) {
    console.warn("[정리] 탈퇴 계정 정리 실패:", (e as Error).message);
  }
}

// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 관제탑 심장박동 = Worker 에서 Cron 으로 한다 (정본 B4)
async function metricsTick(): Promise<void> {
  try {
    await withEngineDb(async () => {
      const point = await appendTick();
      if (point) console.log(`[metrics] 틱 기록 users=${point.users}`);
      await failStaleItineraries();
    });
  } catch (e) {
    console.warn("[metrics] 틱 기록 실패:", (e as Error).message);
  }
  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 관리자 화면 저장본 = 매분 0초·30초 두 번 갱신 (정본 §)
  for (let i = 0; i < 2; i++) {
    await runSnapshotTick().catch((e) =>
      console.warn("[snapshot] 저장 실패:", (e as Error).message),
    );
    if (i === 0) await new Promise((r) => setTimeout(r, 30_000));
  }
}

// ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 끊겨서 영영 '만드는 중'인 일정은 10분 뒤 실패로 정리한다(관제탑이 매분) (정본 §)
async function failStaleItineraries(): Promise<void> {
  try {
    const r: any = await db!.execute(sql`
      UPDATE itineraries
         SET status = 'failed',
             raw_data = jsonb_build_object('error', '생성이 끝나지 않고 끊김(10분 경과)'),
             updated_at = now() AT TIME ZONE 'UTC'
       WHERE status = 'generating'
         AND updated_at < (now() AT TIME ZONE 'UTC') - interval '10 minutes'`);
    const n = Number(r?.rowCount ?? r?.rows?.length ?? 0);
    if (n > 0) console.log(`[정리] 멈춘 일정 ${n}건 = failed`);
  } catch (e) {
    console.warn("[정리] 멈춘 일정 정리 실패:", (e as Error).message);
  }
}
