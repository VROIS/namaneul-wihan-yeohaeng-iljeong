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

// 🎬 일별 지브리 여행영상 상태 (2026-07-22 구현계획) = video_by_day jsonb 값 형
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

// User itineraries
// ⚠️ 수정금지(승인필요) 2026-08-03 §22 검수(사장님 승인) = **외래키를 걸지 않는다** = 라이브 DB 와 동일(§19-4).
//   라이브 itineraries 에는 FK 가 없다(pkey 뿐). 스키마에만 CASCADE FK 를 적어 두면 훗날 push 한 번에
//   FK 가 신설되어 도시·사용자 행 삭제가 **여정(영상 자산이 여정번호에 묶임)을 연쇄삭제**하는 시한폭탄이 된다.
export const itineraries = pgTable("itineraries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  // 🏙️ 2026-08-02 사장님 승인 = 저장 시점에 **서버가** 목적지 문자열로 매칭해 채운다(server/city-match.ts).
  //   nullable 로 바꾼 이유 = NOT NULL 이면 매칭 실패한 여정에도 아무 도시나 억지로 넣어야 한다
  //   (그렇게 전 여정에 1(파리)이 박혀 있던 것이 이번에 고치는 문제 그 자체). 모르면 비워 둔다 = §1 추측 금지.
  cityId: integer("city_id"),
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

// 📥 저장한 영상 (2026-08-03 사장님 확정) = 영상은 회사 자산(여정 video_by_day)이고,
//   저장 = "이 사용자가 이 여정 n일차 영상을 프로필에 담았다"는 연결 행 1개 = 해설(guides.user_id)과 같은 DB 방식.
//   프로필 '나의 TRIPIS' 영상 카드 = 이 표에 담긴 것만 보여준다(옛 "내 여정 자동 노출" 폐기 §19).
//   is_new = 생성 완료 자동 게시 표식(★ + 하단 TRIPIS 탭 뱃지) — 그 영상 뷰를 1회 열 때 해제.
//   FK 없음 = 위 itineraries 와 같은 사유(§19-4) = push 발 연쇄삭제 지뢰를 안 심는다. 여정이 지워진 행은 조회 JOIN 이 자연 제외.
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
    // 같은 사용자·같은 여정·같은 날짜 = 1행 = 중복 담기 차단 + 완료 자동게시 upsert 의 ON CONFLICT 대상
    unique("saved_videos_user_itin_day_uniq").on(
      t.userId,
      t.itineraryId,
      t.day,
    ),
  ],
);

// [DROPPED 0013] itinerary_items — 0건, rawData JSON으로 대체됨

export const insertItinerarySchema = createInsertSchema(itineraries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Itinerary = typeof itineraries.$inferSelect;
export type InsertItinerary = z.infer<typeof insertItinerarySchema>;
