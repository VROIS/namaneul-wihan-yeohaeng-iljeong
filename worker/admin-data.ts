// ⚠️ 수정금지(승인필요) 2026-10-03 사장님 결정 = 관리자 화면 숫자 계산 1벌 = 옛 길(각 엔드포인트)과 저장본(admin-snapshot) 이 같은 함수를 부른다 (정본 §)
import type { drizzle } from "drizzle-orm/postgres-js";
import { and, count, eq, isNotNull, ne, sql } from "drizzle-orm";
import * as schema from "../shared/schema";
import { PRICE_EUR } from "../shared/credits";
import { accessSummary } from "./routes-admin-access";
import { recentDelta } from "./lib/services/shared/metrics-heartbeat";

const {
  apiKeys,
  apiServiceStatus,
  cities,
  creditTransactions,
  guides,
  itineraries,
  placeSeedRaw,
  savedVideos,
  users,
} = schema;

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export const FREE_CAPS: Record<string, number | undefined> = {
  ts: 1000,
  pm: 1000,
};

/** UNIT_COST_LEDGER 의 eur 만(= UNIT_COST_EUR). */
export const UNIT_COST_EUR: Record<string, number> = {
  ts: 0.0424,
  pm: 0.0085,
  veo: 0.0605,
  omni: 0.0383, // ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 옴니 단가 = 360p 실측 토큰 · 콘솔 환산(1달러 ≈ €0.858) · 세금 20% (정본 §)
  nano: 0.0472,
  gemini: 0,
};

/** providers 목록(순서 그대로). */
export const USAGE_PROVIDERS = ["ts", "pm", "veo", "omni", "nano", "gemini"];

/** monthlyUsage. external_calls 는 drizzle 스키마에 없어 SQL 로 읽는다. */
export async function monthlyUsage(
  db: Db,
  provider: string,
): Promise<{ count: number; units: number }> {
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS count, COALESCE(sum(units), 0)::float AS units
       FROM external_calls
      WHERE provider = ${provider} AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
  )) as unknown as { count: number; units: number }[];
  return { count: rows[0]?.count ?? 0, units: rows[0]?.units ?? 0 };
}

interface UsageRow {
  provider: string;
  count: number;
  units: number;
  cap: number | null;
  remaining: number | null;
}
export async function usageSummary(db: Db): Promise<UsageRow[]> {
  const out: UsageRow[] = [];
  for (const p of USAGE_PROVIDERS) {
    const u = await monthlyUsage(db, p);
    const cap = FREE_CAPS[p] ?? null;
    out.push({
      provider: p,
      count: u.count,
      units: u.units,
      cap,
      remaining: cap == null ? null : Math.max(0, cap - u.count),
    });
  }
  return out;
}

async function geminiPerformance(db: Db): Promise<{
  sampleSize: number;
  avgResponseTimeMs: number | null;
  successRate: number | null;
  errorRate: number | null;
}> {
  const rows = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS sample_size,
      ROUND(AVG(response_time_ms)) AS avg_response_time_ms,
      ROUND(COUNT(*) FILTER (WHERE success = true) * 100.0 / NULLIF(COUNT(*), 0), 1) AS success_rate,
      ROUND(COUNT(*) FILTER (WHERE success = false) * 100.0 / NULLIF(COUNT(*), 0), 1) AS error_rate
    FROM (
      SELECT response_time_ms, success
        FROM external_calls
       WHERE provider = 'gemini' AND success IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 100
    ) recent
  `)) as unknown as Record<string, unknown>[];
  const row = rows[0] || {};
  return {
    sampleSize: (row.sample_size as number) ?? 0,
    avgResponseTimeMs:
      row.avg_response_time_ms != null
        ? Number(row.avg_response_time_ms)
        : null,
    successRate: row.success_rate != null ? Number(row.success_rate) : null,
    errorRate: row.error_rate != null ? Number(row.error_rate) : null,
  };
}

export async function externalCallsSummaryData(db: Db) {
  return {
    month: new Date().toISOString().slice(0, 7),
    providers: await usageSummary(db),
  };
}

export async function dashboardData(db: Db) {
  const [cityRow] = await db.select({ count: count() }).from(cities);
  const [psrRow] = await db.select({ count: count() }).from(placeSeedRaw);

  const fillRows = (await db.execute(
    sql`SELECT
          COUNT(image_url)::int AS img,
          COUNT(price_eur)::int AS price,
          COUNT(summary_ko)::int AS sum,
          COUNT(google_place_id)::int AS pid
        FROM place_seed_raw`,
  )) as unknown as {
    img: number;
    price: number;
    sum: number;
    pid: number;
  }[];
  const filled = fillRows[0] || { img: 0, price: 0, sum: 0, pid: 0 };

  const apiServicesList = await db.select().from(apiServiceStatus);

  return {
    overview: {
      cities: cityRow?.count || 0,
      places: psrRow?.count || 0, // ← 옛 필드명 보존 (= 실제는 PSR)
      youtubeChannels: 0,
      blogSources: 0,
      freshDataRatio: 0,
    },
    psrFillRate: {
      image: filled.img || 0,
      price: filled.price || 0,
      summary: filled.sum || 0,
      pid: filled.pid || 0,
      total: psrRow?.count || 0,
    },
    apiServices: apiServicesList,
    recentSyncs: [],
    dbConnected: true,
    lastUpdated: new Date().toISOString(),
  };
}

export async function activitySummaryData(db: Db) {
  // ⚠️ 수정금지(승인필요) 2026-09-15 사장님 결정 = 증감 = R2 심장박동 최근 30초 비교, 변화 0 이면 오늘 하루 누적 증가분 (정본 B4)
  const { latest, delta } = await recentDelta();
  void latest;
  const [
    [userTotal],
    [routeTotal],
    [aiOpinionTotal],
    [expertVerifyTotal],
    [guideTotal],
    [videoTotal],
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(itineraries),
    db
      .select({ count: count() })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.type, "usage"),
          eq(creditTransactions.description, "AI 의견"),
        ),
      ),
    db
      .select({ count: count() })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.type, "usage"),
          eq(creditTransactions.description, "전문가 검증"),
        ),
      ),
    db.select({ count: count() }).from(guides).where(isNotNull(guides.placeId)),
    db.select({ count: count() }).from(savedVideos),
  ]);
  const userNew = delta.users;
  const userWithdrawn = 0;
  const routeNew = delta.routes;
  const aiOpinionNew = delta.aiOpinion;
  const expertVerifyNew = delta.expertVerify;
  const guideNew = delta.guides;
  const videoNew = delta.videos;

  const loginBreakdown = await db
    .select({ provider: users.provider, count: count() })
    .from(users)
    .groupBy(users.provider);

  // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 접속 현황 자료 = routes-admin-access.ts 1벌
  const accessData = await accessSummary(db);

  const [purchaseCount] = await db
    .select({ count: count() })
    .from(creditTransactions)
    .where(eq(creditTransactions.type, "purchase"));

  // ⚠️ 2026-08-25 사장님 지시로 수정 = "최근 결제내역"이 충전(+)만 반쪽으로 보여주고 있었다.
  const [creditSum] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${users.credits}), 0)::int`,
    })
    .from(users);

  const recentTransactions = await db
    .select({
      id: creditTransactions.id,
      type: creditTransactions.type,
      description: creditTransactions.description,
      amount: creditTransactions.amount,
      createdAt: creditTransactions.createdAt,
      userEmail: users.email,
      userDisplayName: users.displayName,
    })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .orderBy(sql`${creditTransactions.createdAt} DESC`)
    .limit(30);

  const usage = await usageSummary(db);
  // ⚠️ 2026-08-25 사장님 승인 = AI 성능 카드 = 계측된 최근 gemini 호출 100건 기준 실시간 집계(geminiClient.ts 배선).
  const aiPerformance = await geminiPerformance(db);
  const aiCostEur = usage.reduce((sum, u) => {
    const billable = u.cap == null ? u.units : Math.max(0, u.units - u.cap);
    return sum + billable * (UNIT_COST_EUR[u.provider] || 0);
  }, 0);

  const totalRevenueEur = (purchaseCount?.count || 0) * PRICE_EUR;
  const arpuEur =
    (userTotal?.count || 0) > 0 ? totalRevenueEur / (userTotal?.count || 1) : 0;

  return {
    updatedAt: new Date().toISOString(),
    activity: {
      users: {
        total: userTotal?.count || 0,
        new: userNew,
        withdrawn: userWithdrawn,
      },
      routes: { total: routeTotal?.count || 0, new: routeNew },
      aiOpinion: { total: aiOpinionTotal?.count || 0, new: aiOpinionNew },
      expertVerify: {
        total: expertVerifyTotal?.count || 0,
        new: expertVerifyNew,
      },
      guides: { total: guideTotal?.count || 0, new: guideNew },
      videos: { total: videoTotal?.count || 0, new: videoNew },
    },
    loginBreakdown: loginBreakdown.map((r) => ({
      provider: r.provider || "unknown",
      count: r.count,
    })),
    ...accessData,
    revenue: {
      totalEur: totalRevenueEur,
      aiCostEur: Math.round(aiCostEur * 100) / 100,
      arpuEur: Math.round(arpuEur * 100) / 100,
      netEur: Math.round((totalRevenueEur - aiCostEur) * 100) / 100,
    },
    aiPerformance,
    // ⚠️ 2026-08-25 사장님 지시로 수정 = 충전(+)만 반쪽으로 보여주던 것 → 전체사용자 카드내역서(엑셀표)로.
    totalCreditsHeld: creditSum?.total || 0,
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      type: t.type,
      description: t.description,
      amount: t.amount,
      createdAt: t.createdAt,
      user: t.userEmail || t.userDisplayName || "(탈퇴/미확인)",
    })),
  };
}

export async function apiKeysMasked(db: Db) {
  const keys = await db
    .select()
    .from(apiKeys)
    .where(ne(apiKeys.isActive, false))
    .orderBy(apiKeys.id);
  const maskedKeys = keys.map((key) => ({
    ...key,
    keyValue: key.keyValue
      ? `${key.keyValue.slice(0, 8)}...${key.keyValue.slice(-4)}`
      : "",
    hasValue: !!key.keyValue && key.keyValue.length > 0,
  }));
  return maskedKeys;
}
