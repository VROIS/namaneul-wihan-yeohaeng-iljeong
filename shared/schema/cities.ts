import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { numericNumber } from "./numeric-number";

export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // 한국어 표시명 (예: "파리")
  nameEn: text("name_en"), // 영어 공식명 (매칭 키, 예: "Paris")
  nameLocal: text("name_local"), // 현지 공식명 (예: "Paris", "Roma", "München")
  aliases: jsonb("aliases").$type<string[]>().default([]), // 별칭 배열 (예: ["巴黎","パリ"])
  country: text("country").notNull(),
  countryCode: text("country_code").notNull(),
  // ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 도시 좌표 = DB 형 numeric(9,6) 그대로 (정본 2026-11-03)
  latitude: numericNumber("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numericNumber("longitude", { precision: 9, scale: 6 }).notNull(),
  timezone: text("timezone"),
  primaryLanguage: text("primary_language"),
  mcpBucket: text("mcp_bucket"), // france30 | europe30 | both (레거시)
  mcpPhases: jsonb("mcp_phases").$type<string[]>().default([]), // 수집 단계 배열: ["bts2026","france30"]
  mcpRankFr: integer("mcp_rank_fr"), // 1~30
  mcpRankEu: integer("mcp_rank_eu"), // 1~30
  mcpRankBasis: text("mcp_rank_basis"), // euromonitor_un_tourism_2024_2025
  mcpRankNote: text("mcp_rank_note"),
  mcpRankUpdatedAt: timestamp("mcp_rank_updated_at"),
  btsRank: integer("bts_rank"), // BTS 2026 공연 도시 순번 1~34 (null=해당없음)
  // ⚠️ 수정금지(승인필요) — 2026-04-26 단일 SSOT 정리 (사용자 결정):
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
  overrideHeroPlaceId: integer("override_hero_place_id"),
  overrideHighlightPlaceIds: integer("override_highlight_place_ids").array(),
  overrideVideoId: integer("override_video_id"),
  // ⚠️ 수정금지(승인필요) 2026-11-21 사장님 결정 = 거점 깃발 = 사장님이 정한 거점(비어 있어도 거점) · 가장 가까운 거점 판정·통폐합·끌어오기는 이 칸만 본다 (정본 2026-11-21)
  isHub: boolean("is_hub").notNull().default(false),
  population: integer("population"), // 도시 인구(도시 카드 노출 순서의 기본값)
  countryPopulation: integer("country_population"), // 그 도시가 속한 나라의 인구(나라 묶음 순서의 기본값)
  countryOrder: integer("country_order"), // 관리자 지정 = 대륙 탭 안에서 그 나라 묶음의 순서(같은 나라 도시에 같은 값)
  cityOrder: integer("city_order"), // 관리자 지정 = 나라 묶음 안에서 그 도시 카드의 순서
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export type City = typeof cities.$inferSelect;
