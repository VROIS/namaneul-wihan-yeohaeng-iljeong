// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 후처리 자동화 = MIX 응답 직후 큐에 "도시 N" 한 줄 → 큐 소비자(이 파일)가 Browser Run 으로 구글맵 페이지를 열어 창고를 채운다 = 손 0. 엔진은 lib/services/fill/gmaps-post 1벌(필시티 CLI 와 동일). 한 번에 한 도시, 실패는 큐 재시도(최대 2회) 뒤 dead-letter (정본 §)
import { env } from "cloudflare:workers";
import { launch } from "@cloudflare/playwright";
import { db, pool, withEngineDb } from "./lib/db";
import { upsertPlace } from "./lib/services/place-upsert";
import { runGmapsPost, r2PrefixOf } from "./lib/services/fill/gmaps-post";
import { appendTick } from "./lib/services/shared/metrics-heartbeat";
import { refreshKakaoJwks } from "./routes-social-auth";
import { cleanupDeletedAccounts } from "./lib/services/account-cleanup";

// wrangler.jsonc · wrangler.build.jsonc 의 triggers.crons 와 같은 글자
const KAKAO_JWKS_CRON = "0 3 * * *";
const ACCOUNT_CLEANUP_CRON = "30 4 * * *";

export type GmapsPostMessage = {
  cityId: number;
  reason: string;
};

export async function enqueueGmapsPost(
  cityId: number,
  reason: string,
): Promise<void> {
  await (env as any).GMAPS_POST_QUEUE.send({
    cityId,
    reason,
  } satisfies GmapsPostMessage);
  console.log(`[gmaps-post] 큐 등록 city ${cityId} (${reason})`);
}

// 워커 진입점(src.ts)은 700줄 초과 파일이라 건드리지 않는다 = HTTP 핸들러에 큐·심장박동을 덧붙여 돌려준다
export const withGmapsQueue = <T extends object>(httpHandler: T) => ({
  ...httpHandler,
  queue: consumeGmapsPost,
  scheduled: (controller: ScheduledController) =>
    controller.cron === KAKAO_JWKS_CRON
      ? kakaoJwksTick()
      : controller.cron === ACCOUNT_CLEANUP_CRON
        ? accountCleanupTick()
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

// ⚠️ 수정금지(승인필요) 2026-09-15 사장님 결정 = 관제탑 심장박동 = Worker 에서 Cron 으로 한다 (정본 B4)
export async function metricsTick(): Promise<void> {
  try {
    await withEngineDb(async () => {
      const point = await appendTick();
      if (point) console.log(`[metrics] 틱 기록 users=${point.users}`);
    });
  } catch (e) {
    console.warn("[metrics] 틱 기록 실패:", (e as Error).message);
  }
}

export async function consumeGmapsPost(
  batch: MessageBatch<GmapsPostMessage>,
): Promise<void> {
  for (const msg of batch.messages) {
    const { cityId, reason } = msg.body || ({} as GmapsPostMessage);
    if (!cityId) {
      msg.ack();
      continue;
    }
    console.log(
      `[gmaps-post] 시작 city ${cityId} (${reason}, 시도 ${msg.attempts})`,
    );
    try {
      await withEngineDb(async () => {
        const client = await pool!.connect();
        try {
          const browser = await launch((env as any).BROWSER);
          try {
            await runGmapsPost({
              client,
              browser,
              cityId,
              r2Prefix: r2PrefixOf((env as any).R2_PUBLIC_URL),
              upsertPlace,
              log: (l) => console.log("[gmaps-post] " + l),
            });
          } finally {
            await browser.close().catch(() => {});
          }
        } finally {
          client.release();
        }
      });
      msg.ack();
    } catch (e: any) {
      console.error(`[gmaps-post] 실패 city ${cityId}: ${e?.message || e}`);
      msg.retry({ delaySeconds: 60 });
    }
  }
}
