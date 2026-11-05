// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 홍보 탭 서버 1벌 = 입력 창구 · 유튜브·틱톡·인스타·스레드 매시 자동(무료 공식 API) · 저장본 자료(하루 경계 = 파리 시간) (정본 2026-11-05)
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
const TT_ID = /\/video\/(\d+)/;
const META_ID = /\/(?:reels?|p|post)\/([^/?#]+)/;

const keyOf = async (db: AnyDb, name: string): Promise<string | null> => {
  const [k] = await db
    .select({ v: apiKeys.keyValue })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyName, name), eq(apiKeys.isActive, true)));
  return k?.v?.trim() || null;
};

// 채널 게시물 = 영상 번호 → 우리 줄 번호
async function postsByVideo(db: AnyDb, channel: string, re: RegExp) {
  const posts = await db
    .select({ id: promoPosts.id, url: promoPosts.url })
    .from(promoPosts)
    .where(eq(promoPosts.channel, channel));
  const byVideo = new Map<string, number>();
  for (const p of posts) {
    const m = p.url.match(re);
    if (m) byVideo.set(m[1], p.id);
  }
  return byVideo;
}

// 유튜브 공개 숫자(무료 할당량) = 50편씩 한 번에
export async function youtubePromoTick(db: AnyDb): Promise<number> {
  const key = await keyOf(db, "YOUTUBE_API_KEY");
  if (!key) return 0;
  const byVideo = await postsByVideo(db, "youtube", YT_ID);
  const ids = [...byVideo.keys()];
  let saved = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.slice(i, i + 50).join(",")}&key=${key}`,
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

interface TikTokVideo {
  id: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
}

// 틱톡 공식 API(무료) = 새로 고친 열쇠(돌 때마다 바뀜 = 바로 저장) → 우리 영상 목록 20편씩
export async function tiktokPromoTick(db: AnyDb): Promise<number> {
  const [clientKey, clientSecret, refreshToken] = await Promise.all(
    ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REFRESH_TOKEN"].map(
      (n) => keyOf(db, n),
    ),
  );
  if (!clientKey || !clientSecret || !refreshToken) return 0;
  const tr = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const tok = (await tr.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (!tr.ok || !tok.access_token)
    throw new Error(`TikTok 열쇠 ${tr.status} ${tok.error ?? ""}`);
  if (tok.refresh_token && tok.refresh_token !== refreshToken)
    await db
      .update(apiKeys)
      .set({
        keyValue: tok.refresh_token,
        updatedAt: sql`now() AT TIME ZONE 'UTC'`,
      })
      .where(eq(apiKeys.keyName, "TIKTOK_REFRESH_TOKEN"));
  const byVideo = await postsByVideo(db, "tiktok", TT_ID);
  let cursor: number | undefined;
  let saved = 0;
  for (let page = 0; page < 10; page++) {
    const r = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,view_count,like_count,comment_count",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
      },
    );
    const body = (await r.json()) as {
      data?: { videos?: TikTokVideo[]; cursor?: number; has_more?: boolean };
      error?: { code?: string };
    };
    if (!r.ok || (body.error?.code && body.error.code !== "ok"))
      throw new Error(`TikTok 목록 ${r.status} ${body.error?.code ?? ""}`);
    const rows = (body.data?.videos ?? [])
      .filter((v) => byVideo.has(v.id))
      .map((v) => ({
        postId: byVideo.get(v.id)!,
        views: num(v.view_count),
        likes: num(v.like_count),
        comments: num(v.comment_count),
      }));
    if (rows.length) await db.insert(promoStats).values(rows);
    saved += rows.length;
    if (!body.data?.has_more) break;
    cursor = body.data.cursor;
  }
  return saved;
}

// 메타(인스타·스레드) 공식 API(무료) = 60일 열쇠를 하루 한 번 연장해 바로 저장 → 우리 글 목록 → 글마다 숫자
interface MetaApi {
  channel: "instagram" | "threads";
  keyName: string;
  base: string;
  refreshGrant: string;
  insightMetrics: string;
}
const META: MetaApi[] = [
  {
    channel: "instagram",
    keyName: "INSTAGRAM_ACCESS_TOKEN",
    base: "https://graph.instagram.com",
    refreshGrant: "ig_refresh_token",
    insightMetrics: "views",
  },
  {
    channel: "threads",
    keyName: "THREADS_ACCESS_TOKEN",
    base: "https://graph.threads.net/v1.0",
    refreshGrant: "th_refresh_token",
    insightMetrics: "views,likes,replies",
  },
];

async function metaToken(db: AnyDb, api: MetaApi): Promise<string | null> {
  const [k] = await db
    .select({ v: apiKeys.keyValue, at: apiKeys.updatedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyName, api.keyName), eq(apiKeys.isActive, true)));
  const token = k?.v?.trim();
  if (!token) return null;
  if (Date.now() - k.at.getTime() < 864e5) return token;
  const host = api.base.replace(/\/v[\d.]+$/, "");
  const r = await fetch(
    `${host}/refresh_access_token?grant_type=${api.refreshGrant}&access_token=${token}`,
  );
  const body = (await r.json()) as { access_token?: string };
  if (!r.ok || !body.access_token)
    throw new Error(`${api.channel} 열쇠 연장 ${r.status}`);
  await db
    .update(apiKeys)
    .set({
      keyValue: body.access_token,
      updatedAt: sql`now() AT TIME ZONE 'UTC'`,
    })
    .where(eq(apiKeys.keyName, api.keyName));
  return body.access_token;
}

interface MetaInsight {
  name: string;
  values?: { value?: number }[];
  total_value?: { value?: number };
}

async function metaPromoTick(db: AnyDb, api: MetaApi): Promise<number> {
  const token = await metaToken(db, api);
  if (!token) return 0;
  const byCode = await postsByVideo(db, api.channel, META_ID);
  const fields =
    api.channel === "instagram"
      ? "id,permalink,like_count,comments_count"
      : "id,permalink";
  let next: string | undefined =
    `${api.base}/me/${api.channel === "instagram" ? "media" : "threads"}?fields=${fields}&limit=50&access_token=${token}`;
  let saved = 0;
  for (let page = 0; next && page < 10; page++) {
    const r = await fetch(next);
    const body = (await r.json()) as {
      data?: {
        id: string;
        permalink?: string;
        like_count?: number;
        comments_count?: number;
      }[];
      paging?: { next?: string };
    };
    if (!r.ok) throw new Error(`${api.channel} 목록 ${r.status}`);
    for (const m of body.data ?? []) {
      const postId = byCode.get(m.permalink?.match(META_ID)?.[1] ?? "");
      if (!postId) continue;
      const ir = await fetch(
        `${api.base}/${m.id}/insights?metric=${api.insightMetrics}&access_token=${token}`,
      );
      if (!ir.ok) continue;
      const ins = ((await ir.json()) as { data?: MetaInsight[] }).data ?? [];
      const metric = (n: string) => {
        const x = ins.find((i) => i.name === n);
        return num(x?.total_value?.value ?? x?.values?.[0]?.value);
      };
      const row = {
        postId,
        views: metric("views"),
        likes:
          api.channel === "instagram" ? num(m.like_count) : metric("likes"),
        comments:
          api.channel === "instagram"
            ? num(m.comments_count)
            : metric("replies"),
      };
      if (row.views === null && row.likes === null && row.comments === null)
        continue;
      await db.insert(promoStats).values(row);
      saved++;
    }
    next = body.paging?.next;
  }
  return saved;
}

export const instagramPromoTick = (db: AnyDb) => metaPromoTick(db, META[0]);
export const threadsPromoTick = (db: AnyDb) => metaPromoTick(db, META[1]);

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
