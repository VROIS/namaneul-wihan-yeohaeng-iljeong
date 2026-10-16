import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";
import { itineraries } from "./itineraries";

// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 전문가 문의(하단 전문가 탭) = 질문+답변 1행(정규화 과잉 금지).
export const expertInquiries = pgTable("expert_inquiries", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  itineraryId: integer("itinerary_id").references(() => itineraries.id, {
    onDelete: "set null",
  }), // 저장 여정이면 연결(미저장 즉석 여정은 null)
  itineraryData: jsonb("itinerary_data"), // 여정+AI의견 스냅샷(문의 시점 박제 = 여정이 나중에 바뀌어도 문의 내용 보존)
  userMessage: text("user_message").notNull(), // 사용자 질문
  // ⚠️ 수정금지(승인필요) 2026-07-24 사장님 승인 = 일별 [바로 예약하기] = 문의함 통합(별도 테이블 금지 §0)
  kind: varchar("kind").notNull().default("expert"), // 'expert'(검증 문의) | 'booking'(드라이빙 가이드 예약 요청)
  dayNumber: integer("day_number"), // booking 전용 = 몇일차 예약인지(expert 문의 = null)
  status: varchar("status").notNull().default("pending"), // pending | in_review | answered | rejected
  expertId: varchar("expert_id").references(() => users.id, {
    onDelete: "set null",
  }), // 답변한 전문가(다수 대비). SET NULL = 전문가 탈퇴해도 답변 보존(시뮬 발견 2026-07-13)
  expertReply: text("expert_reply"), // 전문가 답변 본문
  isReadByUser: boolean("is_read_by_user").default(false), // 답변을 사용자가 읽었는지(전문가 탭 배지 카운트)
  isDeletedByUser: boolean("is_deleted_by_user").default(false), // 사용자가 전문가검증 탭 리스트에서 숨김 (DB 보존)
  isDeletedByExpert: boolean("is_deleted_by_expert").default(false), // 전문가가 답변함 리스트에서 숨김 (DB 보존)
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  answeredAt: timestamp("answered_at"),
});

export const insertExpertInquirySchema = createInsertSchema(
  expertInquiries,
).omit({
  id: true,
  status: true,
  expertId: true,
  expertReply: true,
  isReadByUser: true,
  createdAt: true,
  answeredAt: true,
});

export type ExpertInquiry = typeof expertInquiries.$inferSelect;
export type InsertExpertInquiry = z.infer<typeof insertExpertInquirySchema>;
