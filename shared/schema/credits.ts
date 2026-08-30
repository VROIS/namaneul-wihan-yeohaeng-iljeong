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
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";
import { cities } from "./cities"; // guides.city_id 참조(2026-08-02 = TRIPIS ↔ 도시 잇기)

export const guides = pgTable(
  "guides",
  {
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
    // 🏙️ 2026-08-02 사장님 승인 = TRIPIS 도 도시와 잇는다(저장 시 좌표 → 최근접 도시 = server/city-match.ts).
    cityId: integer("city_id").references(() => cities.id),
    // 🏷️ 2026-08-02 사장님 승인 = **해설 창고 열쇠** = 그 해설이 어느 장소(place_seed_raw.id)의 것인지.
    placeId: integer("place_id"),
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
  },
  (t) => [
    // ⚠️ 수정금지(승인필요) 2026-08-03 = **창고 찾기 색인**(§22 검수 4번 수정 = 사장님 승인).
    index("guides_place_lang_idx")
      .on(t.placeId, t.language)
      .where(sql`${t.placeId} IS NOT NULL`),
  ],
);

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
    uniqueIndex("credit_transactions_purchase_ref_uniq")
      .on(t.referenceId)
      .where(sql`${t.type} = 'purchase' AND ${t.referenceId} IS NOT NULL`),
  ],
);

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

export type Guide = typeof guides.$inferSelect;
export type InsertGuide = z.infer<typeof insertGuideSchema>;
export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<
  typeof insertCreditTransactionSchema
>;
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
