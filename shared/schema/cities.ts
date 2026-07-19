import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  timestamp,
  real,
  boolean,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Cities/Destinations
// 🔗 Agent Protocol v1.0: 도시 식별 규약
// name=한국어, nameEn=영어(매칭키), nameLocal=현지명, aliases=별칭배열
export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // 한국어 표시명 (예: "파리")
  nameEn: text("name_en"), // 영어 공식명 (매칭 키, 예: "Paris")
  nameLocal: text("name_local"), // 현지 공식명 (예: "Paris", "Roma", "München")
  aliases: jsonb("aliases").$type<string[]>().default([]), // 별칭 배열 (예: ["巴黎","パリ"])
  country: text("country").notNull(),
  countryCode: text("country_code").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  timezone: text("timezone"),
  primaryLanguage: text("primary_language"),
  // MCP 고정 순위 기준(프랑스30/유럽30)
  mcpBucket: text("mcp_bucket"), // france30 | europe30 | both (레거시)
  mcpPhases: jsonb("mcp_phases").$type<string[]>().default([]), // 수집 단계 배열: ["bts2026","france30"]
  mcpRankFr: integer("mcp_rank_fr"), // 1~30
  mcpRankEu: integer("mcp_rank_eu"), // 1~30
  mcpRankBasis: text("mcp_rank_basis"), // euromonitor_un_tourism_2024_2025
  mcpRankNote: text("mcp_rank_note"),
  mcpRankUpdatedAt: timestamp("mcp_rank_updated_at"),
  btsRank: integer("bts_rank"), // BTS 2026 공연 도시 순번 1~34 (null=해당없음)
  // ⚠️ 수정금지(승인필요) — 2026-04-26 단일 SSOT 정리 (사용자 결정):
  //   장소 정보 (venue/army_zone/merch_store) = place_seed_raw 통합
  //   cities 는 도시 자체의 BTS 활동 메타만 보유 (일정/순위/검증)
  btsConcertDates: jsonb("bts_concert_dates").$type<string[]>().default([]), // ["2026-04-09","2026-04-12"]
  btsShowTimes: jsonb("bts_show_times")
    .$type<{ date: string; time: string }[]>()
    .default([]),
  btsTimeConfirmed: boolean("bts_time_confirmed").default(false),
  btsArchived: boolean("bts_archived").default(false),
  btsSpecialNotes: text("bts_special_notes"),
  btsSource: text("bts_source"),
  btsVerified: boolean("bts_verified").default(false),
  tier: integer("tier").default(1),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const insertCitySchema = createInsertSchema(cities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type City = typeof cities.$inferSelect;
export type InsertCity = z.infer<typeof insertCitySchema>;
