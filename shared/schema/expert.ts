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
//   사용자가 여정+AI의견을 첨부해 현지 전문가에게 문의 → 전문가(role='expert'/'admin')가 답변 → 알림(notifications) 발송.
//   status 값 = admin-dashboard 검증요청 탭과 동일 규약(pending/in_review/answered/rejected). users 컬럼 방식은 1인 N문의라 불가 판정(2026-07-13 연구).
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
  status: varchar("status").notNull().default("pending"), // pending | in_review | answered | rejected
  expertId: varchar("expert_id").references(() => users.id, {
    onDelete: "set null",
  }), // 답변한 전문가(다수 대비). SET NULL = 전문가 탈퇴해도 답변 보존(시뮬 발견 2026-07-13)
  expertReply: text("expert_reply"), // 전문가 답변 본문
  isReadByUser: boolean("is_read_by_user").default(false), // 답변을 사용자가 읽었는지(전문가 탭 배지 카운트)
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  answeredAt: timestamp("answered_at"),
});

// 전문가 문의(2026-07-13) = 접수 시 사용자 입력만 받음(답변·상태는 전문가 라우트가 갱신)
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
