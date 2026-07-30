import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  serial,
  timestamp,
  boolean,
  jsonb,
  decimal,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

// ═══════════════════════════════════════════════════════════════════════════════
// 내손안에 가이드 통합 테이블 (P0-2 병합, 2026-03-27)
// ═══════════════════════════════════════════════════════════════════════════════

// AI 가이드 콘텐츠 (사진→Gemini→TTS 해설)
export const guides = pgTable("guides", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  localId: varchar("local_id"), // IndexedDB ID 매핑용
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  locationName: text("location_name"),
  aiGeneratedContent: text("ai_generated_content"),
  tags: text("tags").array(), // 태그 (예: ['궁전', '역사', '바로크'])
  viewCount: integer("view_count").default(0),
  language: varchar("language").default("ko"),
  voiceLang: varchar("voice_lang").default("ko-KR"), // TTS 언어 코드
  voiceName: varchar("voice_name"), // TTS 음성 이름
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// 공유 링크 (보관함 → 외부 공유)
export const shareLinks = pgTable("share_links", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  guideIds: text("guide_ids").array().notNull(),
  includeLocation: boolean("include_location").default(true),
  includeAudio: boolean("include_audio").default(false),
  viewCount: integer("view_count").default(0),
  isActive: boolean("is_active").default(true),
  featured: boolean("featured").default(false),
  featuredOrder: integer("featured_order"),
  htmlFilePath: text("html_file_path"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// 크레딧 거래 이력 (결제/사용/보너스/관리자 지급)
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type").notNull(), // 'purchase' | 'usage' | 'referral_bonus' | 'admin_grant'
    amount: integer("amount").notNull(), // 양수=획득, 음수=사용
    description: text("description").notNull(),
    referenceId: varchar("reference_id"), // Stripe payment id 등
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    // ⚠️ 수정금지(승인필요) 2026-07-30 = **이중충전 차단 열쇠**(§9). 실제 DB 에는 마이그 0019 로 이미 있다.
    //   여기에 **반드시 같이 적어 둬야 한다** = 스키마에 없으면 `drizzle-kit push` 가
    //   "쓸모없는 인덱스"로 보고 **지워 버려** 같은 결제가 두 번 적립될 수 있다(€10 에 280 크레딧).
    //   ⚠️ 반드시 **부분(where)** 인덱스여야 한다. 전체 UNIQUE 로 만들면 `usage` 줄이
    //   여정번호를 다시 쓰는 정상 동작과 부딪혀 **차감이 통째로 막힌다**.
    uniqueIndex("credit_transactions_purchase_ref_uniq")
      .on(t.referenceId)
      .where(sql`${t.type} = 'purchase' AND ${t.referenceId} IS NOT NULL`),
  ],
);

// API 호출 로그 (비용 추적)
export const apiLogs = pgTable("api_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(), // 'gemini' | 'maps'
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  responseTime: integer("response_time"), // ms
  tokensUsed: integer("tokens_used"),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 6 }), // USD
  statusCode: integer("status_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// 사용자 활동 로그 (분석용)
export const userActivityLogs = pgTable("user_activity_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  sessionId: varchar("session_id"),
  deviceType: varchar("device_type"), // 'mobile' | 'tablet' | 'desktop'
  browser: varchar("browser"),
  userAgent: text("user_agent"),
  sessionDuration: integer("session_duration"), // 초
  pageViews: integer("page_views").default(1),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// 공유 HTML 페이지 (짧은 URL /s/:id)
export const sharedHtmlPages = pgTable("shared_html_pages", {
  id: varchar("id").primaryKey(), // 8자 nanoid
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  htmlContent: text("html_content"), // 구버전 호환용
  htmlFilePath: text("html_file_path"),
  templateVersion: varchar("template_version").default("v1"),
  guideIds: text("guide_ids").array().notNull(),
  thumbnail: text("thumbnail"),
  sender: text("sender"),
  location: text("location"),
  date: text("date"), // YYYY-MM-DD
  featured: boolean("featured").default(false),
  featuredOrder: integer("featured_order"),
  downloadCount: integer("download_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// 인앱 알림 (YouTube 스타일 벨)
export const notifications = pgTable("notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "cascade",
  }), // null=전체 공지
  type: varchar("type").notNull(), // 'reward' | 'content' | 'event' | 'update' | 'urgent'
  title: text("title").notNull(),
  message: text("message").notNull(),
  icon: varchar("icon").default("bell"),
  link: text("link"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// 웹 푸시 구독
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// TTS 음성 설정 (7언어×4플랫폼)
export const voiceConfigs = pgTable("voice_configs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  langCode: varchar("lang_code").notNull(), // 'ko-KR', 'en-US', 'ja-JP' 등
  platform: varchar("platform").notNull(), // 'ios' | 'android' | 'windows' | 'default'
  voicePriorities: text("voice_priorities").array().notNull(),
  excludeVoices: text("exclude_voices").array(),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// AI 프롬프트 (7개 언어, 관리자 수정 가능)
export const prompts = pgTable("prompts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  language: varchar("language").notNull(), // 'ko', 'en', 'zh-CN', 'ja', 'fr', 'de', 'es'
  type: varchar("type").notNull(), // 'image' | 'text'
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  createdBy: varchar("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// bts_event_info 테이블 삭제됨 — BTS 공연 정보는 cities 테이블 컬럼으로 통합 (SSoT)
// cities.bts_concert_dates, bts_venue, bts_venue_capacity, bts_fan_zone, bts_merch_info 참조

// ═══════════════════════════════════════════════════════════════════════════════
// 통합 Insert Schemas + Types
// ═══════════════════════════════════════════════════════════════════════════════

export const insertGuideSchema = createInsertSchema(guides).omit({
  id: true,
  userId: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
});
export const insertShareLinkSchema = createInsertSchema(shareLinks).omit({
  id: true,
  userId: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCreditTransactionSchema = createInsertSchema(
  creditTransactions,
).omit({
  id: true,
  createdAt: true,
});
export const insertApiLogSchema = createInsertSchema(apiLogs).omit({
  id: true,
  createdAt: true,
});
export const insertUserActivityLogSchema = createInsertSchema(
  userActivityLogs,
).omit({
  id: true,
  createdAt: true,
});
export const insertSharedHtmlPageSchema = createInsertSchema(
  sharedHtmlPages,
).omit({
  id: true,
  userId: true,
  downloadCount: true,
  createdAt: true,
  updatedAt: true,
});
export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  isRead: true,
  createdAt: true,
});
export const insertPushSubscriptionSchema = createInsertSchema(
  pushSubscriptions,
).omit({
  id: true,
  createdAt: true,
});
export const insertVoiceConfigSchema = createInsertSchema(voiceConfigs).omit({
  id: true,
  updatedAt: true,
});
export const insertPromptSchema = createInsertSchema(prompts).omit({
  id: true,
  createdAt: true,
});

// 가이드 통합 Types
export type Guide = typeof guides.$inferSelect;
export type InsertGuide = z.infer<typeof insertGuideSchema>;
export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<
  typeof insertCreditTransactionSchema
>;
export type ApiLog = typeof apiLogs.$inferSelect;
export type InsertApiLog = z.infer<typeof insertApiLogSchema>;
export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = z.infer<typeof insertUserActivityLogSchema>;
export type SharedHtmlPage = typeof sharedHtmlPages.$inferSelect;
export type InsertSharedHtmlPage = z.infer<typeof insertSharedHtmlPageSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<
  typeof insertPushSubscriptionSchema
>;
export type VoiceConfig = typeof voiceConfigs.$inferSelect;
export type InsertVoiceConfig = z.infer<typeof insertVoiceConfigSchema>;
export type Prompt = typeof prompts.$inferSelect;
export type InsertPrompt = z.infer<typeof insertPromptSchema>;
// BtsEventInfo 타입 삭제 — cities 테이블로 통합됨
