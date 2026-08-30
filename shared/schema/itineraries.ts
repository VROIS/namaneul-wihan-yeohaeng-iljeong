import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  serial,
  timestamp,
  real,
  jsonb,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { personaTypeEnum } from "./enums";

export interface DayVideo {
  status: "processing" | "succeeded" | "failed";
  url: string | null;
  taskId: string;
  scenesDone: number;
  totalScenes: number;
  /** 씬 메타(2026-07-23 사장님 목업) = 재생 화면 글라스 카드(Scene n/N·장소명·요약)용. 재생 타이밍에 맞춰 전환 */
  scenes?: { placeName: string; summary?: string }[];
  /** 실패 사유(2026-08-06 사장님 승인 = 서버 예외 문구 그대로 기록 = 화면 표시·포렌식용, 뭉개기 금지 SSOT) */
  error?: string;
}

// ⚠️ 수정금지(승인필요) 2026-08-03 §22 검수(사장님 승인) = **외래키를 걸지 않는다** = 라이브 DB 와 동일(§19-4).
export const itineraries = pgTable("itineraries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  // 🏙️ 2026-08-02 사장님 승인 = 저장 시점에 **서버가** 목적지 문자열로 매칭해 채운다(server/city-match.ts).
  cityId: integer("city_id"),
  title: text("title").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  travelStyle: personaTypeEnum("travel_style").default("comfort"),
  budget: integer("budget"),
  optimizationMode: text("optimization_mode").default("balanced"),
  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 확정 = **1인 유로(€)**. 화면의 "1인 €232" 와 같은 값.
  totalCost: real("total_cost"),
  totalDuration: integer("total_duration"),
  status: text("status").default("draft"),
  userBirthDate: text("user_birth_date"), // 레거시: 동반자 추정 로직 연동용 유지
  userGender: text("user_gender"), // 레거시: 동반자 추정 로직 연동용 유지

  curationFocus: text("curation_focus").default("Everyone"), // Kids, Parents, Everyone, Self
  companionType: text("companion_type").default("Couple"), // Single, Couple, Family, ExtendedFamily, Group
  companionCount: integer("companion_count").default(2),
  companionAges: text("companion_ages"), // "5,8" 형태로 저장 (아이 나이)
  vibes: jsonb("vibes").$type<string[]>().default([]), // ['Shopping', 'Foodie'] 등
  travelPace: text("travel_pace").default("Normal"), // Packed, Normal, Relaxed
  mobilityStyle: text("mobility_style").default("Moderate"), // WalkMore, Moderate, Minimal
  mealLevel: text("meal_level").default("Local"), // Michelin, Trendy, Local, Budget

  protagonistSentence: text("protagonist_sentence"),

  videoTaskId: text("video_task_id"),
  videoStatus: text("video_status"),
  videoUrl: text("video_url"),

  videoByDay: jsonb("video_by_day").$type<Record<string, DayVideo>>(),

  rawData: jsonb("raw_data").$type<object>().default({}),

  isSavedByUser: boolean("is_saved_by_user").default(false),

  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// 📥 저장한 영상 (2026-08-03 사장님 확정) = 영상은 회사 자산(여정 video_by_day)이고,
export const savedVideos = pgTable(
  "saved_videos",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    itineraryId: integer("itinerary_id").notNull(),
    day: integer("day").notNull(),
    isNew: boolean("is_new").default(false).notNull(),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    unique("saved_videos_user_itin_day_uniq").on(
      t.userId,
      t.itineraryId,
      t.day,
    ),
  ],
);

export const insertItinerarySchema = createInsertSchema(itineraries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Itinerary = typeof itineraries.$inferSelect;
export type InsertItinerary = z.infer<typeof insertItinerarySchema>;
