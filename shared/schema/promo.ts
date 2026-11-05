// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 홍보 탭 표 2개 = 게시물(공식 채널 5 · 편 이름 · 도시/BTS) + 숫자 기록(시각별) (정본 2026-11-05)
import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const promoPosts = pgTable("promo_posts", {
  id: serial("id").primaryKey(),
  episode: text("episode").notNull(),
  track: text("track").notNull(),
  channel: text("channel").notNull(),
  url: text("url").notNull().unique(),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const promoStats = pgTable(
  "promo_stats",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => promoPosts.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
  },
  (t) => [index("promo_stats_post_time_idx").on(t.postId, t.capturedAt)],
);
