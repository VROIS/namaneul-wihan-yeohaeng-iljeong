// ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 관리자 대시보드 "로그인 방식 · 접속 현황" 자료 = 서버·Worker 공용 1벌(§0·§16).
//   드라이버가 다르다(서버 = node-postgres → { rows }, Worker = postgres-js → 배열). 그 차이는 여기서 한 번만 흡수한다.
import { count, sql } from "drizzle-orm";
import { users } from "./schema";

export interface AccessSummary {
  entryBreakdown: { entry: string; count: number }[];
  access: { today: number; todayNew: number; week: number; dormant: number };
  recentUsers: {
    name: string;
    provider: string;
    entry: string;
    lastLoginAt: Date | null;
    loginCount: number;
  }[];
}

/** 오늘·주간·휴면 인원을 한 번에 세는 질의. 기준을 바꿀 곳은 여기 한 곳뿐이다. */
const ACCESS_COUNTS = sql`SELECT
  COUNT(*) FILTER (WHERE last_login_at >= date_trunc('day', now()))::int AS today,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today_new,
  COUNT(*) FILTER (WHERE last_login_at >= now() - interval '7 days')::int AS week,
  COUNT(*) FILTER (WHERE last_login_at IS NULL OR last_login_at < now() - interval '30 days')::int AS dormant
FROM users`;

/** 드라이버별 결과 모양 차이를 여기서만 흡수한다. */
function firstRow(result: unknown): Record<string, unknown> {
  const r = result as { rows?: unknown[] } | unknown[];
  const rows = Array.isArray(r) ? r : r?.rows;
  return (rows?.[0] as Record<string, unknown>) || {};
}

/** 최근 접속 20명. 한 번도 안 들어온 계정은 뒤로 보낸다. */
const RECENT_LIMIT = 20;

type AnyDb = any;

export async function accessSummary(db: AnyDb): Promise<AccessSummary> {
  const entryRows = await db
    .select({ entry: users.referredBy, count: count() })
    .from(users)
    .groupBy(users.referredBy);

  const a = firstRow(await db.execute(ACCESS_COUNTS));

  const recent = await db
    .select({
      email: users.email,
      displayName: users.displayName,
      provider: users.provider,
      entry: users.referredBy,
      lastLoginAt: users.lastLoginAt,
      loginCount: users.loginCount,
    })
    .from(users)
    .orderBy(sql`${users.lastLoginAt} DESC NULLS LAST`)
    .limit(RECENT_LIMIT);

  return {
    entryBreakdown: entryRows.map(
      (r: { entry: string | null; count: number }) => ({
        entry: r.entry || "unknown",
        count: r.count,
      }),
    ),
    access: {
      today: Number(a.today) || 0,
      todayNew: Number(a.today_new) || 0,
      week: Number(a.week) || 0,
      dormant: Number(a.dormant) || 0,
    },
    recentUsers: recent.map(
      (u: {
        email: string | null;
        displayName: string | null;
        provider: string | null;
        entry: string | null;
        lastLoginAt: Date | null;
        loginCount: number | null;
      }) => ({
        name: u.displayName || u.email || "-",
        provider: u.provider || "unknown",
        entry: u.entry || "unknown",
        lastLoginAt: u.lastLoginAt,
        loginCount: u.loginCount || 0,
      }),
    ),
  };
}
