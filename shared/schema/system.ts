import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  real,
  boolean,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core";

export const apiServiceStatus = pgTable("api_service_status", {
  id: serial("id").primaryKey(),
  serviceName: text("service_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  isConfigured: boolean("is_configured").default(false),
  isActive: boolean("is_active").default(true),
  lastCallAt: timestamp("last_call_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastErrorAt: timestamp("last_error_at"),
  lastErrorMessage: text("last_error_message"),
  dailyCallCount: integer("daily_call_count").default(0),
  dailyQuota: integer("daily_quota"),
  monthlyCallCount: integer("monthly_call_count").default(0),
  monthlyQuota: integer("monthly_quota"),
  quotaResetAt: timestamp("quota_reset_at"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const exchangeRates = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  baseCurrency: text("base_currency").notNull().default("KRW"),
  targetCurrency: text("target_currency").notNull(),
  rate: real("rate").notNull(),
  fetchedAt: timestamp("fetched_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const guidePrices = pgTable("guide_prices", {
  id: serial("id").primaryKey(),
  serviceType: text("service_type").notNull(), // sedan, van, minibus, guide_only, airport_transfer
  serviceName: text("service_name").notNull(),

  basePrice4h: real("base_price_4h"), // 기본요금 (4시간 최소)
  pricePerHour: real("price_per_hour"), // 시간당 추가 요금
  minHours: real("min_hours").default(4), // 최소 시간 (기본 4시간)
  maxHours: real("max_hours").default(10), // 최대 시간 (기본 10시간)

  minPassengers: integer("min_passengers").default(1), // 최소 인원
  maxPassengers: integer("max_passengers").default(4), // 최대 인원

  pricePerDay: real("price_per_day"), // 일일 가격 (EUR) - deprecated
  priceLow: real("price_low"), // 최저가
  priceHigh: real("price_high"), // 최고가
  currency: text("currency").notNull().default("EUR"),
  unit: text("unit").notNull().default("hour"), // hour, day, trip
  description: text("description"),
  features: jsonb("features").$type<string[]>().default([]),

  uberBlackEstimate: jsonb("uber_black_estimate").$type<{
    low: number;
    high: number;
  }>(),
  uberXEstimate: jsonb("uber_x_estimate").$type<{
    low: number;
    high: number;
  }>(),
  taxiEstimate: jsonb("taxi_estimate").$type<{ low: number; high: number }>(),
  comparisonNote: text("comparison_note"), // 비교 설명 (마케팅용)

  isActive: boolean("is_active").default(true),
  source: text("source").default("guide_verified"), // guide_verified = 35년 경력 가이드 데이터
  lastUpdated: timestamp("last_updated")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  keyName: text("key_name").notNull().unique(), // GEMINI_API_KEY, YOUTUBE_API_KEY, etc.
  keyValue: text("key_value").notNull(), // 암호화된 값
  displayName: text("display_name").notNull(), // 표시용 이름
  description: text("description"), // 설명
  isActive: boolean("is_active").default(true),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: text("last_test_result"), // success, failed
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = external_calls drizzle 정의 = 실 DB 그대로(§16)
export const externalCalls = pgTable(
  "external_calls",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    sku: text("sku"),
    cityId: integer("city_id"),
    units: numeric("units").notNull().default("1"),
    tag: text("tag"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    responseTimeMs: integer("response_time_ms"),
    success: boolean("success"),
    errorMessage: text("error_message"),
  },
  (t) => [
    index("external_calls_provider_created_idx").on(t.provider, t.createdAt),
  ],
);

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = api_logs drizzle 정의 = 실 DB 그대로(§16)
export const apiLogs = pgTable("api_logs", {
  id: serial("id").primaryKey(),
  type: text("type"),
  userId: integer("user_id"),
  responseTime: integer("response_time"),
  tokensUsed: integer("tokens_used"),
  estimatedCost: real("estimated_cost"),
  statusCode: integer("status_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});
