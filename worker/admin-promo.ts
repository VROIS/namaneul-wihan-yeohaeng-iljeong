// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 홍보 탭 서버 1벌 = 어사이드 입력 창구 · 유튜브 1시간 자동 · 저장본 자료(하루 경계 = 파리 시간) (정본 2026-11-05)
import type { Express, Request, Response } from "express";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import type { OpenDb } from "./db-types";

const { apiKeys, promoPosts, promoStats, users } = schema;

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export const PROMO_CHANNELS = [
  "youtube",
  "instagram",
  "tiktok",
  "threads",
  "x",
] as const;
const TRACKS = ["city", "bts"];

const parisDay = (col: unknown) =>
  sql<string>`to_char(${col} AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')`;

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

interface PromoItem {
  episode?: unknown;
  track?: unknown;
  channel?: unknown;
  url?: unknown;
  postedAt?: unknown;
  views?: unknown;
  likes?: unknown;
  comments?: unknown;
  checkedAt?: unknown;
}

export function invalidReason(it: PromoItem): string | null {
  if (typeof it.episode !== "string" || !it.episode.trim()) return "episode";
  if (!TRACKS.includes(String(it.track))) return "track";
  if (!(PROMO_CHANNELS as readonly string[]).includes(String(it.channel)))
    return "channel";
  if (typeof it.url !== "string" || !/^https?:\/\//.test(it.url)) return "url";
  if (Number.isNaN(Date.parse(String(it.postedAt)))) return "postedAt";
  if (it.checkedAt != null && Number.isNaN(Date.parse(String(it.checkedAt))))
    return "checkedAt";
  for (const k of ["views", "likes", "comments"] as const) {
    const v = num(it[k]);
    if (v !== null && !(Number.isInteger(v) && v >= 0)) return k;
  }
  return null;
}

// 같은 주소 = 같은 게시물 = 새 값으로 덮는다 · 숫자가 하나라도 오면 그 시각 기록 1줄
export async function savePromoItem(
  db: AnyDb,
  it: PromoItem,
): Promise<boolean> {
  const row = {
    episode: String(it.episode).trim(),
    track: String(it.track),
    channel: String(it.channel),
    url: String(it.url).trim(),
    postedAt: new Date(String(it.postedAt)),
  };
  const [post] = await db
    .insert(promoPosts)
    .values(row)
    .onConflictDoUpdate({
      target: promoPosts.url,
      set: {
        episode: row.episode,
        track: row.track,
        channel: row.channel,
        postedAt: row.postedAt,
      },
    })
    .returning({ id: promoPosts.id });
  const views = num(it.views);
  const likes = num(it.likes);
  const comments = num(it.comments);
  if (views === null && likes === null && comments === null) return false;
  await db.insert(promoStats).values({
    postId: post.id,
    capturedAt: it.checkedAt ? new Date(String(it.checkedAt)) : new Date(),
    views,
    likes,
    comments,
  });
  return true;
}

export function registerAdminPromoRoutes(app: Express, openDb: OpenDb): void {
  app.post("/api/admin/promo", async (req: Request, res: Response) => {
    const items: PromoItem[] = Array.isArray(req.body?.items)
      ? req.body.items
      : [];
    if (!items.length) return res.status(400).json({ error: "items_empty" });
    const rejected = items
      .map((it, i) => ({ i, reason: invalidReason(it) }))
      .filter((r) => r.reason);
    if (rejected.length) return res.status(400).json({ rejected });
    const { db, close } = openDb();
    try {
      let stats = 0;
      for (const it of items) if (await savePromoItem(db, it)) stats++;
      res.json({ saved: items.length, stats });
    } catch (e) {
      console.error("[홍보] 입력 저장 실패:", (e as Error).message);
      res.status(500).json({ error: "server_error" });
    } finally {
      close();
    }
  });
}

const YT_ID = /(?:shorts\/|[?&]v=|youtu\.be\/)([\w-]{11})/;

// 유튜브 공개 숫자(무료 할당량) = 50편씩 한 번에
export async function youtubePromoTick(db: AnyDb): Promise<number> {
  const [key] = await db
    .select({ v: apiKeys.keyValue })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.keyName, "YOUTUBE_API_KEY"), eq(apiKeys.isActive, true)),
    );
  if (!key?.v) return 0;
  const posts = await db
    .select({ id: promoPosts.id, url: promoPosts.url })
    .from(promoPosts)
    .where(eq(promoPosts.channel, "youtube"));
  const byVideo = new Map<string, number>();
  for (const p of posts) {
    const m = p.url.match(YT_ID);
    if (m) byVideo.set(m[1], p.id);
  }
  const ids = [...byVideo.keys()];
  let saved = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.slice(i, i + 50).join(",")}&key=${key.v.trim()}`,
    );
    if (!r.ok) throw new Error(`YouTube ${r.status}`);
    const body = (await r.json()) as {
      items?: { id: string; statistics?: Record<string, string> }[];
    };
    const rows = (body.items ?? []).map((v) => ({
      postId: byVideo.get(v.id)!,
      views: num(v.statistics?.viewCount),
      likes: num(v.statistics?.likeCount),
      comments: num(v.statistics?.commentCount),
    }));
    if (rows.length) await db.insert(promoStats).values(rows);
    saved += rows.length;
  }
  return saved;
}

// 저장본 자료 = 게시물마다 파리 하루의 마지막 숫자 · 하루별 가입 수 (기간·증가·순위 계산은 화면)
export async function promoSummaryData(db: AnyDb) {
  const statDay = parisDay(promoStats.capturedAt);
  const [posts, points, signups] = await Promise.all([
    db.select().from(promoPosts).orderBy(asc(promoPosts.postedAt)),
    db
      .selectDistinctOn([promoStats.postId, statDay], {
        postId: promoStats.postId,
        d: statDay,
        at: promoStats.capturedAt,
        v: promoStats.views,
        l: promoStats.likes,
        c: promoStats.comments,
      })
      .from(promoStats)
      .orderBy(promoStats.postId, statDay, desc(promoStats.capturedAt)),
    db
      .select({
        d: sql<string>`to_char((${users.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')`,
        n: count(),
      })
      .from(users)
      .groupBy(sql`1`),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date());
  return {
    today,
    posts: posts.map((p) => ({
      id: p.id,
      episode: p.episode,
      track: p.track,
      channel: p.channel,
      url: p.url,
      postedAt: p.postedAt,
      points: points
        .filter((s) => s.postId === p.id)
        .map(({ d, at, v, l, c }) => ({ d, at, v, l, c })),
    })),
    signups: Object.fromEntries(signups.map((s) => [s.d, Number(s.n)])),
  };
}
