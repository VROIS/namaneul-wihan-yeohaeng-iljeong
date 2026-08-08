import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  serial,
  timestamp,
  boolean,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { personaTypeEnum } from "./enums";

// Users table
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  persona: personaTypeEnum("persona").default("comfort"),
  preferredLanguage: text("preferred_language").default("ko"),

  // === 사용자 연령 정보 (가족 구성 추정용) ===
  birthDate: text("birth_date"),

  // === 소셜 로그인 정보 ===
  provider: text("provider"), // "kakao" | "google" | "whatsapp"
  providerId: text("provider_id"), // 소셜 계정 고유 ID (추후 실제 OAuth용)

  // === 유료/무료 구분 ===
  isPaid: boolean("is_paid").default(false),
  paidAt: timestamp("paid_at"),
  planType: text("plan_type").default("free"), // "free" | "basic" | "premium"

  // === 앱 사용 메타데이터 ===
  lastLoginAt: timestamp("last_login_at"),
  loginCount: integer("login_count").default(0),
  deviceType: text("device_type"), // "ios" | "android" | "web"
  appVersion: text("app_version"),

  // === 취향 저장 (마케팅 활용 + 영상 시나리오) ===
  preferredVibes: jsonb("preferred_vibes").$type<string[]>().default([]),
  preferredCompanionType: text("preferred_companion_type"),
  preferredTravelStyle: text("preferred_travel_style"),
  marketingConsent: boolean("marketing_consent").default(false),
  vibesUpdatedAt: timestamp("vibes_updated_at"),

  // === 내손안에 가이드 통합 컬럼 (P0-2 병합) ===
  email: varchar("email").unique(),
  profileImageUrl: text("profile_image_url"),
  locationEnabled: boolean("location_enabled").default(true),
  aiContentEnabled: boolean("ai_content_enabled").default(true),
  credits: integer("credits").default(0),
  isAdmin: boolean("is_admin").default(false),
  // ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 역할 분기(전문가 기능) = 'user' | 'expert' | 'admin'.
  //   현지 전문가 다수 대비: 전문가로 로그인 시 전문가 탭이 답변함 모드로 전환. is_admin은 배포앱 원서버가 사용 중이라 유지(신규 코드는 role만 읽음).
  role: varchar("role").default("user"),
  // ⚠️ 2026-07-13 사장님 SSOT = 현지 전문가 본인 프로필(닉네임/경력/자기소개/캐릭터) = 전문가 탭 소개카드 표시. role='expert'/'admin' 계정만 편집.
  expertProfile: jsonb("expert_profile").$type<{
    nickname?: string;
    career?: string;
    bio?: string;
    character?: string;
  }>(),
  referredBy: varchar("referred_by"),
  referralCode: varchar("referral_code").unique(),
  subscriptionStatus: varchar("subscription_status").default("active"),
  subscriptionCanceledAt: timestamp("subscription_canceled_at"),
  // ⚠️ 2026-08-08 사장님 확정 = 회원 탈퇴 6개월 유예.
  //   'active' | 'deleted'(유예중) | 'purged'(6개월 뒤 정리 끝). 탈퇴 = 'deleted' + deleted_at 기록,
  //   6개월 안에 다시 로그인하면 applyLogin 이 'active' 로 복구. 정리가 끝나면 'purged' = 다시 대상이 되지 않음.
  accountStatus: varchar("account_status").default("active"),
  deletedAt: timestamp("deleted_at"),

  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// user_providers: 한 사용자에 여러 provider(구글/카카오/WhatsApp) 연결
// 매칭 우선순위: 1) provider 2) provider 없을 때만 birth_date
export const userProviders = pgTable(
  "user_providers",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    unique("user_providers_provider_provider_id_unique").on(
      t.provider,
      t.providerId,
    ),
  ],
);

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  persona: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UserProvider = typeof userProviders.$inferSelect;
