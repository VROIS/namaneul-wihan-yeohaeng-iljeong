import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, real, boolean, jsonb, pgEnum, unique, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const placeTypeEnum = pgEnum("place_type", ["restaurant", "attraction", "hotel", "cafe", "landmark"]);
export const personaTypeEnum = pgEnum("persona_type", ["luxury", "comfort", "economic"]);
export const dataSourceEnum = pgEnum("data_source", ["google", "tripadvisor", "yelp", "foursquare", "michelin", "viator"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  persona: personaTypeEnum("persona").default("comfort"),
  preferredLanguage: text("preferred_language").default("ko"),

  // === 사용자 연령 정보 (가족 구성 추정용) ===
  birthDate: text("birth_date"),

  // === 소셜 로그인 정보 ===
  provider: text("provider"),           // "kakao" | "google" | "whatsapp"
  providerId: text("provider_id"),      // 소셜 계정 고유 ID (추후 실제 OAuth용)

  // === 유료/무료 구분 ===
  isPaid: boolean("is_paid").default(false),
  paidAt: timestamp("paid_at"),
  planType: text("plan_type").default("free"), // "free" | "basic" | "premium"

  // === 앱 사용 메타데이터 ===
  lastLoginAt: timestamp("last_login_at"),
  loginCount: integer("login_count").default(0),
  deviceType: text("device_type"),      // "ios" | "android" | "web"
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
  referredBy: varchar("referred_by"),
  referralCode: varchar("referral_code").unique(),
  subscriptionStatus: varchar("subscription_status").default('active'),
  subscriptionCanceledAt: timestamp("subscription_canceled_at"),
  accountStatus: varchar("account_status").default('active'),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// user_providers: 한 사용자에 여러 provider(구글/카카오/WhatsApp) 연결
// 매칭 우선순위: 1) provider 2) provider 없을 때만 birth_date
export const userProviders = pgTable("user_providers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerId: text("provider_id").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [unique("user_providers_provider_provider_id_unique").on(t.provider, t.providerId)]);

// Cities/Destinations
// 🔗 Agent Protocol v1.0: 도시 식별 규약
// name=한국어, nameEn=영어(매칭키), nameLocal=현지명, aliases=별칭배열
export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                    // 한국어 표시명 (예: "파리")
  nameEn: text("name_en"),                         // 영어 공식명 (매칭 키, 예: "Paris")
  nameLocal: text("name_local"),                   // 현지 공식명 (예: "Paris", "Roma", "München")
  aliases: jsonb("aliases").$type<string[]>().default([]),  // 별칭 배열 (예: ["巴黎","パリ"])
  country: text("country").notNull(),
  countryCode: text("country_code").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  timezone: text("timezone"),
  primaryLanguage: text("primary_language"),
  // MCP 고정 순위 기준(프랑스30/유럽30)
  mcpBucket: text("mcp_bucket"), // france30 | europe30 | both (레거시)
  mcpPhases: jsonb("mcp_phases").$type<string[]>().default([]), // 수집 단계 배열: ["bts2026","france30"]
  mcpRankFr: integer("mcp_rank_fr"), // 1~30
  mcpRankEu: integer("mcp_rank_eu"), // 1~30
  mcpRankBasis: text("mcp_rank_basis"), // euromonitor_un_tourism_2024_2025
  mcpRankNote: text("mcp_rank_note"),
  mcpRankUpdatedAt: timestamp("mcp_rank_updated_at"),
  btsRank: integer("bts_rank"), // BTS 2026 공연 도시 순번 1~34 (null=해당없음)
  // ⚠️ 수정금지(승인필요) — 2026-04-26 단일 SSOT 정리 (사용자 결정):
  //   장소 정보 (venue/army_zone/merch_store) = place_seed_raw 통합
  //   cities 는 도시 자체의 BTS 활동 메타만 보유 (일정/순위/검증)
  btsConcertDates: jsonb("bts_concert_dates").$type<string[]>().default([]), // ["2026-04-09","2026-04-12"]
  btsShowTimes: jsonb("bts_show_times").$type<{ date: string; time: string }[]>().default([]),
  btsTimeConfirmed: boolean("bts_time_confirmed").default(false),
  btsArchived: boolean("bts_archived").default(false),
  btsSpecialNotes: text("bts_special_notes"),
  btsSource: text("bts_source"),
  btsVerified: boolean("bts_verified").default(false),
  tier: integer("tier").default(1),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Places (restaurants, attractions, etc.)
// 🔗 Agent Protocol v1.0: 장소 식별 규약
// googlePlaceId=글로벌유일키(바코드), name=Google공식명, displayNameKo=한국어표시명, aliases=별칭배열
// Reviews for language analysis (Original Taste Verification)
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  // ⚠️ 수정금지(승인필요) 2026-05-24 = Step 4 DB DROP = places FK 제거 (= places 테이블 폐기 = 컬럼만 유지)
  placeId: integer("place_id").notNull(),
  source: dataSourceEnum("source").notNull(),
  sourceReviewId: text("source_review_id"),
  language: text("language"),
  rating: real("rating"),
  text: text("text"),
  authorCountry: text("author_country"),
  isOriginatorLanguage: boolean("is_originator_language").default(false),
  sentimentScore: real("sentiment_score"),
  authenticityKeywords: jsonb("authenticity_keywords").$type<string[]>(),
  reviewDate: timestamp("review_date"),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// [DROPPED 0013] vibe_analysis — 0건, 미사용
// [DROPPED 0013] reality_checks — 0건, 미사용

// User itineraries
export const itineraries = pgTable("itineraries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cityId: integer("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
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
  userGender: text("user_gender"),       // 레거시: 동반자 추정 로직 연동용 유지

  // === 일정 생성 핵심 데이터 (2026-01-14 추가) ===
  // 🎯 누구를 위한 (curationFocus) - Gemini 프롬프트 가중치 1순위
  // 일정 생성의 주인공 결정 + 추후 미리보기 영상의 주인공
  curationFocus: text("curation_focus").default("Everyone"), // Kids, Parents, Everyone, Self
  companionType: text("companion_type").default("Couple"),   // Single, Couple, Family, ExtendedFamily, Group
  companionCount: integer("companion_count").default(2),
  companionAges: text("companion_ages"),                     // "5,8" 형태로 저장 (아이 나이)
  vibes: jsonb("vibes").$type<string[]>().default([]),       // ['Shopping', 'Foodie'] 등
  travelPace: text("travel_pace").default("Normal"),         // Packed, Normal, Relaxed
  mobilityStyle: text("mobility_style").default("Moderate"), // WalkMore, Moderate, Minimal
  mealLevel: text("meal_level").default("Local"),            // Michelin, Trendy, Local, Budget

  // 주인공 문장 (Gemini 프롬프트용 자동 생성)
  // 예: "5살 아이를 동반한 한국인 가족의 로맨틱 파리 여행"
  protagonistSentence: text("protagonist_sentence"),

  // Output Video Generation Status (Seedance)
  videoTaskId: text("video_task_id"),
  videoStatus: text("video_status"), // pending, processing, succeeded, failed
  videoUrl: text("video_url"), // Final MP4 URL

  // 🩹 [2026-01-26] 일정 생성 원본 데이터 저장 (영상 생성 시 재사용)
  // items 테이블 대신 이 JSON을 사용하여 장소 목록을 복원함
  rawData: jsonb("raw_data").$type<object>().default({}),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// [DROPPED 0013] itinerary_items — 0건, rawData JSON으로 대체됨


// ========================================
// 관리자 대시보드 테이블
// ========================================

// API 서비스 상태 추적
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
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});


// 환율 캐시
export const exchangeRates = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  baseCurrency: text("base_currency").notNull().default("KRW"),
  targetCurrency: text("target_currency").notNull(),
  rate: real("rate").notNull(),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 위기 정보 알림 (GDELT/NewsAPI + Gemini 분석)
// 🚨 파업, 시위, 교통 장애, 기상 경보 등 여행 영향 정보
export const crisisAlerts = pgTable("crisis_alerts", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").references(() => cities.id, { onDelete: "cascade" }),

  // === 도시 정보 (직접 저장) ===
  city: text("city").notNull().default("Paris"),  // Paris, London, Rome 등
  countryCode: text("country_code"),

  // === 위기 유형 ===
  // strike: 파업, protest: 시위, traffic: 교통장애, weather: 기상경보, security: 보안
  type: text("type").notNull().default("strike"),
  alertType: text("alert_type"), // 하위호환 (deprecated)

  // === 제목/설명 (다국어) ===
  title: text("title").notNull(),
  titleKo: text("title_ko"),  // 한글 제목
  description: text("description"),

  // === 날짜 ===
  date: text("date").notNull(),  // YYYY-MM-DD (발생일)
  endDate: text("end_date"),     // YYYY-MM-DD (종료일)
  startDate: timestamp("start_date"),  // 하위호환

  // === 영향/심각도 ===
  affected: jsonb("affected").$type<string[]>().default([]),  // ["metro", "RER", "bus"]
  affectedAreas: jsonb("affected_areas").$type<string[]>().default([]),  // 하위호환
  severity: integer("severity").notNull().default(5), // 1-10 (10이 가장 심각)
  impactScore: real("impact_score"), // 하위호환

  // === 여행자 조언 (다국어) ===
  recommendation: text("recommendation"),     // 영문 조언
  recommendationKo: text("recommendation_ko"), // 한글 조언

  // === 소스 정보 ===
  source: text("source").default("GDELT + Gemini"),  // 수집 소스
  sourceName: text("source_name"),  // 하위호환
  sourceUrl: text("source_url"),
  geminiAnalysis: text("gemini_analysis"),

  // === 상태 ===
  isActive: boolean("is_active").default(true),

  // === 타임스탬프 ===
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});


// MCP 1·2단계 통합 로우데이터 (도시×카테고리 장소 + 한국인 인지도)
export const placeSeedRaw = pgTable("place_seed_raw", {
  id: serial("id").primaryKey(),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = place_id(옛 places FK) DROP = 헛바퀴(google_place_id 가 진짜 연결)
  cityId: integer("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
  seedCategory: text("seed_category").notNull(), // attraction|restaurant|healing|adventure|hotspot
  // ⚠️ 2026-05-23 = collection_phase DROP = phase_tags 배열로 대체 (= 사용자 SSOT 2026-05-21)
  rank: integer("rank").notNull(),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = 헛바퀴 9컬럼 DROP (원재료 소진 = 미사용 = FE 재구성 예정)
  //   = unified_id/google_*_note 3/source/source_rank/source_type/evidence_verified/naver_blog_count 정의 제거 (= DB DROP 동반).
  nameKo: text("name_ko"),
  nameEn: text("name_en").notNull(),
  imageUrl: text("image_url"), // 대표 이미지 1개 URL
  // ⚠️ 수정금지(승인필요) 2026-06-11 = nubi_reason → summary_ko 흡수통합 / evidence_url DROP (= 헛바퀴)
  // ⚠️ 2026-05-15 사용자 SSOT = price_eur 단일 컬럼 (= 1인 입장료/식사비 통합)
  // = price_source / price_fetched_at = 영구 폐기 (SSOT §14 + 제15조)
  priceEur: real("price_eur"),           // 1인 입장료/식사비 (EUR), 0=무료

  // 6단계: googlePlaceId 바코드 (places 테이블 100% 정확 연결용)
  googlePlaceId: text("google_place_id"),
  // ⚠️ 수정금지(승인필요) 2026-05-15 = 13 번째 SSOT 요소 = google_maps_uri
  // = 프론트엔드 "구글맵 바로가기" 버튼 = 최후의 보루 (lat/lng 폴백보다 정확)
  googleMapsUri: text("google_maps_uri"),

  // 4단계: 통합 마스터 창고용 파생/집계 데이터
  // ⚠️ 수정금지(승인필요) 2026-06-11 = best_image_url DROP = 이미지 image_url(구글 PM) 1종 통일 (고아·비PM 2순위 폴백 폐기)
  // ⚠️ 수정금지(승인필요) 2026-06-11 = celeb_mention DROP (= 헛바퀴, ag3 미프로젝션 데드)
  // ⚠️ 수정금지(승인필요) 2026-06-11 = naver_blog_count DROP (= 네이버 수집 파이프라인 폐기 = 헛바퀴)
  vibeKeywords: jsonb("vibe_keywords").$type<string[]>(), // 분위기 키워드 배열
  // SSoT 통합: places 테이블에서 역수집한 데이터
  latitude: real("latitude"),
  longitude: real("longitude"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = google_rating DROP (= 별점 비노출 정책 = 헛바퀴)
  googleReviewCount: integer("google_review_count"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = photo_urls DROP = 이미지 image_url(구글 PM) 1종 통일 (고아·버그 폐기)
  openingHours: jsonb("opening_hours").$type<Record<string, string>>(),
  editorialSummary: text("editorial_summary"),
  nameLocal: text("name_local"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = names_i18n(고유명사 번역 무의미) / instagram·tiktok_post_url(인스타 가짜 폐기) DROP = 헛바퀴
  // ⚠️ 수정금지(승인필요) — 2026-04-30: multi-tag SSOT (1 장소 = N 카테고리)
  phaseTags: text("phase_tags").array(),       // ['bts2026'] 등 수집 phase 태그
  categoryTags: text("category_tags").array(), // ['heritage','hotspot','attraction'] 등 다중 카테고리 태그
  imageAttribution: text("image_attribution"), // "Photo via Google Places (placeId)"
  imageUpdatedAt: timestamp("image_updated_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // ⚠️ 수정금지(승인필요) — 2026-05-04 사용자 SSOT: gemini3-2026-05 표준화 17 필드 추가 (메인앱 통합 진입점)
  summaryKo: text("summary_ko"),                          // 한국어 감성 요약 (NUBI 카피, 숏폼 KO)
  dayZone: text("day_zone"),                              // core (≤10km) / outskirt (10-100km)
  distanceKmFromCenter: real("distance_km_from_center"),  // 도심 거리 (haversine)
  address: text("address"),                               // 전체 주소 + 우편번호
  googlePrimaryType: text("google_primary_type"),         // Google primary type (museum, restaurant 등)
  geminiRank: integer("gemini_rank"),                     // Gemini 응답 순위 (rank 재정렬 우선 키)
});


// 가이드 서비스 가격 (Admin에서 수정 가능)
// 💰 시간당 계산 수식: 총비용 = basePrice4h + (추가시간 × pricePerHour)
export const guidePrices = pgTable("guide_prices", {
  id: serial("id").primaryKey(),
  serviceType: text("service_type").notNull(), // sedan, van, minibus, guide_only, airport_transfer
  serviceName: text("service_name").notNull(),

  // === 시간당 가격 계산 필드 (NEW) ===
  basePrice4h: real("base_price_4h"),        // 기본요금 (4시간 최소)
  pricePerHour: real("price_per_hour"),      // 시간당 추가 요금
  minHours: real("min_hours").default(4),    // 최소 시간 (기본 4시간)
  maxHours: real("max_hours").default(10),   // 최대 시간 (기본 10시간)

  // === 인원 범위 ===
  minPassengers: integer("min_passengers").default(1),  // 최소 인원
  maxPassengers: integer("max_passengers").default(4),  // 최대 인원

  // === 기존 필드 (하위 호환) ===
  pricePerDay: real("price_per_day"),        // 일일 가격 (EUR) - deprecated
  priceLow: real("price_low"),               // 최저가
  priceHigh: real("price_high"),             // 최고가
  currency: text("currency").notNull().default("EUR"),
  unit: text("unit").notNull().default("hour"), // hour, day, trip
  description: text("description"),
  features: jsonb("features").$type<string[]>().default([]),

  // === 우버/택시 비교용 ===
  uberBlackEstimate: jsonb("uber_black_estimate").$type<{ low: number; high: number }>(),
  uberXEstimate: jsonb("uber_x_estimate").$type<{ low: number; high: number }>(),
  taxiEstimate: jsonb("taxi_estimate").$type<{ low: number; high: number }>(),
  comparisonNote: text("comparison_note"),   // 비교 설명 (마케팅용)

  isActive: boolean("is_active").default(true),
  source: text("source").default("guide_verified"), // guide_verified = 35년 경력 가이드 데이터
  lastUpdated: timestamp("last_updated").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});


// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Step 4 DB DROP = 폐기된 21 테이블 relations + insert schema + type 모두 삭제
// = 유지 = cities + users + itineraries + reviews + apiServiceStatus + exchangeRates + crisisAlerts + guidePrices + placeSeedRaw + apiKeys

// Relations (= 유지된 테이블만)
export const citiesRelations = relations(cities, ({ many }) => ({
  itineraries: many(itineraries),
}));

export const reviewsRelations = relations(reviews, ({ one: _one }) => ({}));

export const itinerariesRelations = relations(itineraries, ({ one }) => ({
  user: one(users, {
    fields: [itineraries.userId],
    references: [users.id],
  }),
  city: one(cities, {
    fields: [itineraries.cityId],
    references: [cities.id],
  }),
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  persona: true,
});

export const insertCitySchema = createInsertSchema(cities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertItinerarySchema = createInsertSchema(itineraries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UserProvider = typeof userProviders.$inferSelect;
export type City = typeof cities.$inferSelect;
export type InsertCity = z.infer<typeof insertCitySchema>;
export type Review = typeof reviews.$inferSelect;
export type Itinerary = typeof itineraries.$inferSelect;
export type InsertItinerary = z.infer<typeof insertItinerarySchema>;

// Admin Dashboard Types
export type ApiServiceStatus = typeof apiServiceStatus.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type CrisisAlert = typeof crisisAlerts.$inferSelect;
export type PlaceSeedRaw = typeof placeSeedRaw.$inferSelect;
export type GuidePrice = typeof guidePrices.$inferSelect;

// API 키 저장 테이블 (대시보드에서 관리)
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  keyName: text("key_name").notNull().unique(), // GEMINI_API_KEY, YOUTUBE_API_KEY, etc.
  keyValue: text("key_value").notNull(), // 암호화된 값
  displayName: text("display_name").notNull(), // 표시용 이름
  description: text("description"), // 설명
  isActive: boolean("is_active").default(true),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: text("last_test_result"), // success, failed
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// 내손안에 가이드 통합 테이블 (P0-2 병합, 2026-03-27)
// ═══════════════════════════════════════════════════════════════════════════════

// AI 가이드 콘텐츠 (사진→Gemini→TTS 해설)
export const guides = pgTable("guides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  localId: varchar("local_id"), // IndexedDB ID 매핑용
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  locationName: text("location_name"),
  aiGeneratedContent: text("ai_generated_content"),
  tags: text("tags").array(), // 태그 (예: ['궁전', '역사', '바로크'])
  viewCount: integer("view_count").default(0),
  language: varchar("language").default('ko'),
  voiceLang: varchar("voice_lang").default('ko-KR'), // TTS 언어 코드
  voiceName: varchar("voice_name"), // TTS 음성 이름
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// 공유 링크 (보관함 → 외부 공유)
export const shareLinks = pgTable("share_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  guideIds: text("guide_ids").array().notNull(),
  includeLocation: boolean("include_location").default(true),
  includeAudio: boolean("include_audio").default(false),
  viewCount: integer("view_count").default(0),
  isActive: boolean("is_active").default(true),
  featured: boolean("featured").default(false),
  featuredOrder: integer("featured_order"),
  htmlFilePath: text("html_file_path"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// 크레딧 거래 이력 (결제/사용/보너스/관리자 지급)
export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar("type").notNull(), // 'purchase' | 'usage' | 'referral_bonus' | 'admin_grant'
  amount: integer("amount").notNull(), // 양수=획득, 음수=사용
  description: text("description").notNull(),
  referenceId: varchar("reference_id"), // Stripe payment id 등
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});


// API 호출 로그 (비용 추적)
export const apiLogs = pgTable("api_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(), // 'gemini' | 'maps'
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  responseTime: integer("response_time"), // ms
  tokensUsed: integer("tokens_used"),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 6 }), // USD
  statusCode: integer("status_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 사용자 활동 로그 (분석용)
export const userActivityLogs = pgTable("user_activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  sessionId: varchar("session_id"),
  deviceType: varchar("device_type"), // 'mobile' | 'tablet' | 'desktop'
  browser: varchar("browser"),
  userAgent: text("user_agent"),
  sessionDuration: integer("session_duration"), // 초
  pageViews: integer("page_views").default(1),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 공유 HTML 페이지 (짧은 URL /s/:id)
export const sharedHtmlPages = pgTable("shared_html_pages", {
  id: varchar("id").primaryKey(), // 8자 nanoid
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  htmlContent: text("html_content"), // 구버전 호환용
  htmlFilePath: text("html_file_path"),
  templateVersion: varchar("template_version").default('v1'),
  guideIds: text("guide_ids").array().notNull(),
  thumbnail: text("thumbnail"),
  sender: text("sender"),
  location: text("location"),
  date: text("date"), // YYYY-MM-DD
  featured: boolean("featured").default(false),
  featuredOrder: integer("featured_order"),
  downloadCount: integer("download_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// 인앱 알림 (YouTube 스타일 벨)
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }), // null=전체 공지
  type: varchar("type").notNull(), // 'reward' | 'content' | 'event' | 'update' | 'urgent'
  title: text("title").notNull(),
  message: text("message").notNull(),
  icon: varchar("icon").default('bell'),
  link: text("link"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 웹 푸시 구독
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// TTS 음성 설정 (7언어×4플랫폼)
export const voiceConfigs = pgTable("voice_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  langCode: varchar("lang_code").notNull(), // 'ko-KR', 'en-US', 'ja-JP' 등
  platform: varchar("platform").notNull(), // 'ios' | 'android' | 'windows' | 'default'
  voicePriorities: text("voice_priorities").array().notNull(),
  excludeVoices: text("exclude_voices").array(),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// AI 프롬프트 (7개 언어, 관리자 수정 가능)
export const prompts = pgTable("prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  language: varchar("language").notNull(), // 'ko', 'en', 'zh-CN', 'ja', 'fr', 'de', 'es'
  type: varchar("type").notNull(), // 'image' | 'text'
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// bts_event_info 테이블 삭제됨 — BTS 공연 정보는 cities 테이블 컬럼으로 통합 (SSoT)
// cities.bts_concert_dates, bts_venue, bts_venue_capacity, bts_fan_zone, bts_merch_info 참조

// ═══════════════════════════════════════════════════════════════════════════════
// 통합 Insert Schemas + Types
// ═══════════════════════════════════════════════════════════════════════════════

export const insertGuideSchema = createInsertSchema(guides).omit({
  id: true, userId: true, viewCount: true, createdAt: true, updatedAt: true,
});
export const insertShareLinkSchema = createInsertSchema(shareLinks).omit({
  id: true, userId: true, viewCount: true, createdAt: true, updatedAt: true,
});
export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true, createdAt: true,
});
export const insertApiLogSchema = createInsertSchema(apiLogs).omit({
  id: true, createdAt: true,
});
export const insertUserActivityLogSchema = createInsertSchema(userActivityLogs).omit({
  id: true, createdAt: true,
});
export const insertSharedHtmlPageSchema = createInsertSchema(sharedHtmlPages).omit({
  id: true, userId: true, downloadCount: true, createdAt: true, updatedAt: true,
});
export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true, isRead: true, createdAt: true,
});
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true, createdAt: true,
});
export const insertVoiceConfigSchema = createInsertSchema(voiceConfigs).omit({
  id: true, updatedAt: true,
});
export const insertPromptSchema = createInsertSchema(prompts).omit({
  id: true, createdAt: true,
});

// 가이드 통합 Types
export type Guide = typeof guides.$inferSelect;
export type InsertGuide = z.infer<typeof insertGuideSchema>;
export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type ApiLog = typeof apiLogs.$inferSelect;
export type InsertApiLog = z.infer<typeof insertApiLogSchema>;
export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = z.infer<typeof insertUserActivityLogSchema>;
export type SharedHtmlPage = typeof sharedHtmlPages.$inferSelect;
export type InsertSharedHtmlPage = z.infer<typeof insertSharedHtmlPageSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type VoiceConfig = typeof voiceConfigs.$inferSelect;
export type InsertVoiceConfig = z.infer<typeof insertVoiceConfigSchema>;
export type Prompt = typeof prompts.$inferSelect;
export type InsertPrompt = z.infer<typeof insertPromptSchema>;
// BtsEventInfo 타입 삭제 — cities 테이블로 통합됨

// Re-export chat models
export * from "./models/chat";
