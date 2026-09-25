// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 후처리 자동화 = MIX 응답 직후 큐에 "도시 N" 한 줄 → 큐 소비자(이 파일)가 Browser Run 으로 구글맵 페이지를 열어 창고를 채운다 = 손 0. 엔진은 lib/services/fill/gmaps-post 1벌(필시티 CLI 와 동일). 한 번에 한 도시, 실패는 큐 재시도(최대 2회) 뒤 dead-letter (정본 §)
import { env } from "cloudflare:workers";
import { launch } from "@cloudflare/playwright";
import { db, pool, withEngineDb } from "./lib/db";
import { upsertPlace } from "./lib/services/place-upsert";
import { runGmapsPost, r2PrefixOf } from "./lib/services/fill/gmaps-post";
import { appendTick } from "./lib/services/shared/metrics-heartbeat";
import { refreshKakaoJwks } from "./routes-social-auth";

// wrangler.jsonc · wrangler.build.jsonc 의 triggers.crons 와 같은 글자
const KAKAO_JWKS_CRON = "0 3 * * *";

// reportKey = 시드발굴 v3 ③ 산출표(R2 키) = 있으면 먼저 ④(신규 입력)를 돌리고 이어서 후처리
export type GmapsPostMessage = {
  cityId: number;
  reason: string;
  reportKey?: string;
};

export async function enqueueGmapsPost(
  cityId: number,
  reason: string,
  reportKey?: string,
): Promise<void> {
  await (env as any).GMAPS_POST_QUEUE.send({
    cityId,
    reason,
    ...(reportKey ? { reportKey } : {}),
  } satisfies GmapsPostMessage);
  console.log(
    `[gmaps-post] 큐 등록 city ${cityId} (${reason}${reportKey ? ", 산출표 " + reportKey : ""})`,
  );
}

// 워커 진입점(src.ts)은 700줄 초과 파일이라 건드리지 않는다 = HTTP 핸들러에 큐·심장박동을 덧붙여 돌려준다
export const withGmapsQueue = <T extends object>(httpHandler: T) => ({
  ...httpHandler,
  queue: consumeGmapsPost,
  scheduled: (controller: ScheduledController) =>
    controller.cron === KAKAO_JWKS_CRON ? kakaoJwksTick() : metricsTick(),
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

// ⚠️ 수정금지(승인필요) 2026-09-15 사장님 결정 = 관제탑 심장박동 = 운영(server/index.ts:322 startMetricsHeartbeat)과 같은 일을 Worker 에서는 Cron 으로 한다 (정본 B4)
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
    const { cityId, reason, reportKey } = msg.body || ({} as GmapsPostMessage);
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
            // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = ④(산출표 입력)는 **첫 시도에만**. 재시도면 건너뛰고 후처리만 돈다.
            //   ④ 가 이미 행을 넣은 뒤 후처리에서 실패하면, 재시도 때 그 행들 때문에 "B1 산출표가 낡음"으로 매번 죽어
            //   남은 후처리가 통째로 dead-letter 로 버려진다(판단검증 적발). 후처리는 몇 번을 돌려도 같은 결과다.
            if (reportKey && msg.attempts <= 1) {
              const { getFromR2 } = await import(
                "./lib/services/shared/r2-client"
              );
              const { insertSeedEntries } = await import(
                "./lib/services/fill/gmaps-post"
              );
              const buf = await getFromR2(reportKey);
              if (!buf) throw new Error("산출표 없음: " + reportKey);
              await insertSeedEntries({
                client,
                browser,
                cityId,
                report: JSON.parse(buf.toString("utf8")),
                reportKey,
                upsertPlace,
                log: (l) => console.log("[gmaps-post] " + l),
              });
            } else if (reportKey) {
              console.log(
                `[gmaps-post] 재시도(${msg.attempts}회) = ④ 산출표 입력은 이미 끝났으므로 건너뛰고 후처리만`,
              );
            }
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
