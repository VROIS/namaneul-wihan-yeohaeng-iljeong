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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { personaTypeEnum } from "./enums";
import { users } from "./users";
import { cities } from "./cities";

// 🎬 일별 지브리 여행영상 상태 (2026-07-22 구현계획) = video_by_day jsonb 값 형
export interface DayVideo {
  status: "processing" | "succeeded" | "failed";
  url: string | null;
  taskId: string;
  scenesDone: number;
  totalScenes: number;
  /** 씬 메타(2026-07-23 사장님 목업) = 재생 화면 글라스 카드(Scene n/N·장소명·요약)용. 재생 타이밍에 맞춰 전환 */
  scenes?: { placeName: string; summary?: string }[];
}

// User itineraries
export const itineraries = pgTable("itineraries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  cityId: integer("city_id")
    .notNull()
    .references(() => cities.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  travelStyle: personaTypeEnum("travel_style").default("comfort"),
  budget: integer("budget"),
  optimizationMode: text("optimization_mode").default("balanced"),
  totalCost: real("total_cost"),
  totalDuration: integer("total_duration"),
  status: text("status").default("draft"),
  userBirthDate: text("user_birth_date"), // 레거시: 동반자 추정 로직 연동용 유지
  userGender: text("user_gender"), // 레거시: 동반자 추정 로직 연동용 유지

  // === 일정 생성 핵심 데이터 (2026-01-14 추가) ===
  // 🎯 누구를 위한 (curationFocus) - Gemini 프롬프트 가중치 1순위
  // 일정 생성의 주인공 결정 + 추후 미리보기 영상의 주인공
  curationFocus: text("curation_focus").default("Everyone"), // Kids, Parents, Everyone, Self
  companionType: text("companion_type").default("Couple"), // Single, Couple, Family, ExtendedFamily, Group
  companionCount: integer("companion_count").default(2),
  companionAges: text("companion_ages"), // "5,8" 형태로 저장 (아이 나이)
  vibes: jsonb("vibes").$type<string[]>().default([]), // ['Shopping', 'Foodie'] 등
  travelPace: text("travel_pace").default("Normal"), // Packed, Normal, Relaxed
  mobilityStyle: text("mobility_style").default("Moderate"), // WalkMore, Moderate, Minimal
  mealLevel: text("meal_level").default("Local"), // Michelin, Trendy, Local, Budget

  // 주인공 문장 (Gemini 프롬프트용 자동 생성)
  // 예: "5살 아이를 동반한 한국인 가족의 로맨틱 파리 여행"
  protagonistSentence: text("protagonist_sentence"),

  // 옛 단일영상 3컬럼(videoTaskId/videoStatus/videoUrl) = 일별 video_by_day 로 대체, Republish 후 드랍 예정 = 2026-07-22 지브리영상 구현계획
  videoTaskId: text("video_task_id"),
  videoStatus: text("video_status"),
  videoUrl: text("video_url"),

  // 🎬 지브리 일별 여행영상 SSOT (2026-07-22) = { "1": {status,url,taskId,scenesDone,totalScenes}, ... }
  videoByDay: jsonb("video_by_day").$type<Record<string, DayVideo>>(),

  // 🩹 [2026-01-26] 일정 생성 원본 데이터 저장 (영상 생성 시 재사용)
  // items 테이블 대신 이 JSON을 사용하여 장소 목록을 복원함
  rawData: jsonb("raw_data").$type<object>().default({}),

  // 사용자가 저장 버튼으로 명시 저장한 여정 = true (2026-07-21 여정공유·캘린더저장 명세)
  isSavedByUser: boolean("is_saved_by_user").default(false),

  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// [DROPPED 0013] itinerary_items — 0건, rawData JSON으로 대체됨

export const insertItinerarySchema = createInsertSchema(itineraries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Itinerary = typeof itineraries.$inferSelect;
export type InsertItinerary = z.infer<typeof insertItinerarySchema>;
