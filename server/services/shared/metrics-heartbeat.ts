// ⚠️ 수정금지(승인필요) 2026-08-31 사장님 확정 = 관제탑 지표 심장박동 = 30초마다 R2 에 기록, 최근 2줄 비교로 증감 (정본 B4)

import { db } from "../../db";
import { sql } from "drizzle-orm";
import { getFromR2, uploadToR2, isR2Configured } from "./r2-client";

export const TICK_MS = 30_000;

export type MetricPoint = {
  t: string; // ISO
  users: number;
  routes: number;
  aiOpinion: number;
  expertVerify: number;
  guides: number;
  videos: number;
};

export type MetricDelta = Record<keyof Omit<MetricPoint, "t">, number>;

const keyOf = (d = new Date()) =>
  `admin-metrics/${d.toISOString().slice(0, 10)}.jsonl`;

/** 지금 시점 지표 1벌. 여정은 MIX·DB-only 구분 없이 전체(2026-08-31 사장님 확정). */
export async function readMetrics(): Promise<MetricPoint> {
  const r = (await db!.execute(sql`
    SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM itineraries)::int AS routes,
      (SELECT count(*) FROM credit_transactions WHERE type='usage' AND description='AI 의견')::int AS ai_opinion,
      (SELECT count(*) FROM credit_transactions WHERE type='usage' AND description='전문가 검증')::int AS expert_verify,
      (SELECT count(*) FROM guides WHERE place_id IS NOT NULL)::int AS guides,
      (SELECT count(*) FROM saved_videos)::int AS videos
  `)) as any;
  const x = r.rows?.[0] ?? r[0] ?? {};
  return {
    t: new Date().toISOString(),
    users: Number(x.users) || 0,
    routes: Number(x.routes) || 0,
    aiOpinion: Number(x.ai_opinion) || 0,
    expertVerify: Number(x.expert_verify) || 0,
    guides: Number(x.guides) || 0,
    videos: Number(x.videos) || 0,
  };
}

async function readDay(key: string): Promise<MetricPoint[]> {
  const buf = await getFromR2(key);
  if (!buf) return [];
  return buf
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as MetricPoint;
      } catch {
        return null;
      }
    })
    .filter((x): x is MetricPoint => x != null);
}

/** 한 틱 기록 = 지금 값을 그날 파일 끝에 이어 붙인다. */
export async function appendTick(): Promise<MetricPoint | null> {
  if (!db || !isR2Configured()) return null;
  const now = await readMetrics();
  const key = keyOf();
  const prev = await getFromR2(key);
  const body = Buffer.concat([
    prev ?? Buffer.alloc(0),
    Buffer.from(JSON.stringify(now) + "\n", "utf8"),
  ]);
  await uploadToR2(key, body, "application/x-ndjson");
  return now;
}

/** ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 증감 = 최근 30초 비교, 그 창에 변화가 없으면 오늘 하루 누적 증가분(늘어난 순간이 지나도 플러스가 남게). 기록이 1줄뿐이면 전부 0. */
export async function recentDelta(): Promise<{
  latest: MetricPoint | null;
  delta: MetricDelta;
}> {
  const zero: MetricDelta = {
    users: 0,
    routes: 0,
    aiOpinion: 0,
    expertVerify: 0,
    guides: 0,
    videos: 0,
  };
  if (!isR2Configured()) return { latest: null, delta: zero };
  let rows = await readDay(keyOf());
  if (rows.length < 2) {
    // 자정 직후 = 전날 마지막 줄을 앞 기준으로 쓴다.
    const y = new Date(Date.now() - 86_400_000);
    const yr = await readDay(keyOf(y));
    rows = [...yr.slice(-1), ...rows];
  }
  if (rows.length < 2) return { latest: rows[0] ?? null, delta: zero };
  const a = rows[rows.length - 2];
  const b = rows[rows.length - 1];
  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 실시간 증감(최근 30초)이 0이면 오늘 하루 누적 증가분을 보여준다 = 늘어난 순간이 지나도 플러스가 남는다
  const today = rows[0];
  const pick = (k: keyof MetricDelta) => {
    const live = (b[k] as number) - (a[k] as number);
    return live !== 0 ? live : (b[k] as number) - (today[k] as number);
  };
  return {
    latest: b,
    delta: {
      users: pick("users"),
      routes: pick("routes"),
      aiOpinion: pick("aiOpinion"),
      expertVerify: pick("expertVerify"),
      guides: pick("guides"),
      videos: pick("videos"),
    },
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** 서버 기동 시 1회 호출 = 대시보드를 안 열어도 계속 기록된다. */
export function startMetricsHeartbeat(): void {
  if (timer || !isR2Configured()) return;
  const tick = () =>
    appendTick().catch((e) =>
      console.warn("[metrics] 틱 기록 실패:", (e as Error).message),
    );
  tick();
  const h = setInterval(tick, TICK_MS);
  (h as unknown as { unref?: () => void }).unref?.();
  timer = h;
  console.log(`[metrics] 관제탑 심장박동 시작 = ${TICK_MS / 1000}초 주기 → R2`);
}
