import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, real, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const placeTypeEnum = pgEnum("place_type", ["restaurant", "attraction", "hotel", "cafe", "landmark"]);
export const personaTypeEnum = pgEnum("persona_type", ["luxury", "comfort"]);
export const dataSourceEnum = pgEnum("data_source", ["google", "tripadvisor", "yelp", "foursquare", "michelin", "viator"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  persona: personaTypeEnum("persona").default("comfort"),
  preferredLanguage: text("preferred_language").default("ko"),
  
  // === 취향 저장 (마케팅 활용 + 영상 시나리오) ===
  // 최대 3개, 순서 중요: ["Romantic", "Foodie", "Culture"]
  preferredVibes: jsonb("preferred_vibes").$type<string[]>().default([]),
  
  // 자주 선택하는 동행 타입
  preferredCompanionType: text("preferred_companion_type"),
  
  // 선호 여행 스타일
  preferredTravelStyle: text("preferred_travel_style"),
  
  // 마케팅 동의
  marketingConsent: boolean("marketing_consent").default(false),
  
  // 마지막 취향 업데이트 시간
  vibesUpdatedAt: timestamp("vibes_updated_at"),
  
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Cities/Destinations
export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  countryCode: text("country_code").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  timezone: text("timezone"),
  primaryLanguage: text("primary_language"),
  tier: integer("tier").default(1),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Places (restaurants, attractions, etc.)
export const places = pgTable("places", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
  googlePlaceId: text("google_place_id").unique(),
  name: text("name").notNull(),
  type: placeTypeEnum("type").notNull(),
  cuisineType: text("cuisine_type"),
  cuisineOriginCountry: text("cuisine_origin_country"),
  address: text("address"),
  shortAddress: text("short_address"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  priceLevel: integer("price_level"),
  photoUrls: jsonb("photo_urls").$type<string[]>().default([]),
  openingHours: jsonb("opening_hours").$type<Record<string, string>>(),
  
  websiteUri: text("website_uri"),
  googleMapsUri: text("google_maps_uri"),
  phoneNumber: text("phone_number"),
  editorialSummary: text("editorial_summary"),
  businessStatus: text("business_status"),
  
  userRatingCount: integer("user_rating_count"),
  
  delivery: boolean("delivery"),
  dineIn: boolean("dine_in"),
  takeout: boolean("takeout"),
  curbsidePickup: boolean("curbside_pickup"),
  reservable: boolean("reservable"),
  
  servesBeer: boolean("serves_beer"),
  servesWine: boolean("serves_wine"),
  servesBreakfast: boolean("serves_breakfast"),
  servesBrunch: boolean("serves_brunch"),
  servesLunch: boolean("serves_lunch"),
  servesDinner: boolean("serves_dinner"),
  servesVegetarianFood: boolean("serves_vegetarian_food"),
  servesCoffee: boolean("serves_coffee"),
  servesDessert: boolean("serves_dessert"),
  
  goodForChildren: boolean("good_for_children"),
  goodForGroups: boolean("good_for_groups"),
  goodForWatchingSports: boolean("good_for_watching_sports"),
  
  liveMusic: boolean("live_music"),
  outdoorSeating: boolean("outdoor_seating"),
  restroom: boolean("restroom"),
  menuForChildren: boolean("menu_for_children"),
  allowsDogs: boolean("allows_dogs"),
  
  accessibilityOptions: jsonb("accessibility_options").$type<{
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  }>(),
  parkingOptions: jsonb("parking_options").$type<{
    freeParkingLot?: boolean;
    paidParkingLot?: boolean;
    freeStreetParking?: boolean;
    paidStreetParking?: boolean;
    valetParking?: boolean;
  }>(),
  paymentOptions: jsonb("payment_options").$type<{
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  }>(),
  
  instagramPhotoUrls: jsonb("instagram_photo_urls").$type<string[]>().default([]),
  instagramHashtags: jsonb("instagram_hashtags").$type<string[]>().default([]),
  instagramPostCount: integer("instagram_post_count").default(0),
  
  vibeScore: real("vibe_score"),
  buzzScore: real("buzz_score"),
  tasteVerifyScore: real("taste_verify_score"),
  realityPenalty: real("reality_penalty").default(0),
  finalScore: real("final_score"),
  tier: integer("tier"),
  vibeKeywords: jsonb("vibe_keywords").$type<string[]>().default([]),
  isVerified: boolean("is_verified").default(false),
  lastDataSync: timestamp("last_data_sync"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Multi-source place data (3+ sources per place)
export const placeDataSources = pgTable("place_data_sources", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id").notNull().references(() => places.id, { onDelete: "cascade" }),
  source: dataSourceEnum("source").notNull(),
  sourceId: text("source_id"),
  sourceUrl: text("source_url"),
  rating: real("rating"),
  reviewCount: integer("review_count"),
  priceLevel: integer("price_level"),
  rankingInCategory: integer("ranking_in_category"),
  isMichelinStar: boolean("is_michelin_star").default(false),
  michelinType: text("michelin_type"),
  rawData: jsonb("raw_data"),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Reviews for language analysis (Original Taste Verification)
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id").notNull().references(() => places.id, { onDelete: "cascade" }),
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

// Vibe analysis results from Gemini
export const vibeAnalysis = pgTable("vibe_analysis", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id").notNull().references(() => places.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url"),
  visualScore: real("visual_score"),
  compositionScore: real("composition_score"),
  lightingScore: real("lighting_score"),
  colorScore: real("color_score"),
  vibeCategories: jsonb("vibe_categories").$type<string[]>(),
  geminiResponse: jsonb("gemini_response"),
  analyzedAt: timestamp("analyzed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Reality checks (weather, safety, events)
export const realityChecks = pgTable("reality_checks", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
  checkType: text("check_type").notNull(),
  severity: text("severity"),
  title: text("title"),
  description: text("description"),
  affectedPlaceIds: jsonb("affected_place_ids").$type<number[]>(),
  penaltyScore: real("penalty_score").default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  source: text("source"),
  rawData: jsonb("raw_data"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Weather data cache
export const weatherCache = pgTable("weather_cache", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  temperature: real("temperature"),
  feelsLike: real("feels_like"),
  humidity: integer("humidity"),
  weatherCondition: text("weather_condition"),
  weatherIcon: text("weather_icon"),
  precipitation: real("precipitation"),
  windSpeed: real("wind_speed"),
  uvIndex: integer("uv_index"),
  penalty: real("penalty").default(0),
  rawData: jsonb("raw_data"),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

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
  
  // === 일정 생성 핵심 데이터 (2026-01-14 추가) ===
  // 🎯 누구를 위한 (curationFocus) - Gemini 프롬프트 가중치 1순위
  // 일정 생성의 주인공 결정 + 추후 미리보기 영상의 주인공
  curationFocus: text("curation_focus").default("Everyone"), // Kids, Parents, Everyone, Self
  companionType: text("companion_type").default("Couple"),   // Single, Couple, Family, ExtendedFamily, Group
  companionCount: integer("companion_count").default(2),
  companionAges: text("companion_ages"),                     // "5,8" 형태로 저장 (아이 나이)
  vibes: jsonb("vibes").$type<string[]>().default([]),       // ['Romantic', 'Foodie'] 등
  travelPace: text("travel_pace").default("Normal"),         // Packed, Normal, Relaxed
  mobilityStyle: text("mobility_style").default("Moderate"), // WalkMore, Moderate, Minimal
  mealLevel: text("meal_level").default("Local"),            // Michelin, Trendy, Local, Budget
  
  // 주인공 문장 (Gemini 프롬프트용 자동 생성)
  // 예: "5살 아이를 동반한 한국인 가족의 로맨틱 파리 여행"
  protagonistSentence: text("protagonist_sentence"),
  
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Itinerary items (places in order)
export const itineraryItems = pgTable("itinerary_items", {
  id: serial("id").primaryKey(),
  itineraryId: integer("itinerary_id").notNull().references(() => itineraries.id, { onDelete: "cascade" }),
  placeId: integer("place_id").notNull().references(() => places.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  orderInDay: integer("order_in_day").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  duration: integer("duration"),
  travelMode: text("travel_mode"),
  travelDuration: integer("travel_duration"),
  travelCost: real("travel_cost"),
  notes: text("notes"),
});

// Route calculations cache
export const routeCache = pgTable("route_cache", {
  id: serial("id").primaryKey(),
  originPlaceId: integer("origin_place_id").notNull().references(() => places.id, { onDelete: "cascade" }),
  destinationPlaceId: integer("destination_place_id").notNull().references(() => places.id, { onDelete: "cascade" }),
  travelMode: text("travel_mode").notNull(),
  distanceMeters: integer("distance_meters"),
  durationSeconds: integer("duration_seconds"),
  durationInTraffic: integer("duration_in_traffic"),
  estimatedCost: real("estimated_cost"),
  polyline: text("polyline"),
  steps: jsonb("steps"),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Data sync log for tracking updates
export const dataSyncLog = pgTable("data_sync_log", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  source: text("source"),
  status: text("status").notNull(),
  itemsProcessed: integer("items_processed").default(0),
  itemsFailed: integer("items_failed").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

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

// YouTube 검증 채널 (화이트리스트)
export const youtubeChannels = pgTable("youtube_channels", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  channelName: text("channel_name").notNull(),
  channelUrl: text("channel_url"),
  thumbnailUrl: text("thumbnail_url"),
  subscriberCount: integer("subscriber_count"),
  videoCount: integer("video_count"),
  category: text("category"),
  trustWeight: real("trust_weight").default(1.0),
  isActive: boolean("is_active").default(true),
  lastVideoSyncAt: timestamp("last_video_sync_at"),
  totalVideosSynced: integer("total_videos_synced").default(0),
  totalPlacesMentioned: integer("total_places_mentioned").default(0),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// YouTube 영상 데이터
export const youtubeVideos = pgTable("youtube_videos", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => youtubeChannels.id, { onDelete: "cascade" }),
  videoId: text("video_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  publishedAt: timestamp("published_at"),
  duration: integer("duration"),
  viewCount: integer("view_count"),
  likeCount: integer("like_count"),
  commentCount: integer("comment_count"),
  thumbnailUrl: text("thumbnail_url"),
  hasTranscript: boolean("has_transcript").default(false),
  transcriptText: text("transcript_text"),
  extractedPlaces: jsonb("extracted_places").$type<string[]>(),
  isProcessed: boolean("is_processed").default(false),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// YouTube 영상-장소 매핑 (타임스탬프 포함)
export const youtubePlaceMentions = pgTable("youtube_place_mentions", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull().references(() => youtubeVideos.id, { onDelete: "cascade" }),
  placeId: integer("place_id").references(() => places.id, { onDelete: "set null" }),
  placeName: text("place_name").notNull(),
  cityName: text("city_name"),
  timestampStart: integer("timestamp_start"),
  timestampEnd: integer("timestamp_end"),
  sentiment: text("sentiment"),
  summary: text("summary"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 블로그 소스 (화이트리스트)
export const blogSources = pgTable("blog_sources", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url"),
  authorName: text("author_name"),
  category: text("category"),
  language: text("language").default("ko"),
  trustWeight: real("trust_weight").default(1.0),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  totalPostsSynced: integer("total_posts_synced").default(0),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Instagram 해시태그 추적
export const instagramHashtags = pgTable("instagram_hashtags", {
  id: serial("id").primaryKey(),
  hashtag: text("hashtag").notNull().unique(),
  postCount: integer("post_count"),
  avgLikes: integer("avg_likes"),
  avgComments: integer("avg_comments"),
  topPostUrls: jsonb("top_post_urls").$type<string[]>(),
  linkedPlaceId: integer("linked_place_id").references(() => places.id, { onDelete: "set null" }),
  linkedCityId: integer("linked_city_id").references(() => cities.id, { onDelete: "set null" }),
  category: text("category"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Instagram 위치 태그 추적
export const instagramLocations = pgTable("instagram_locations", {
  id: serial("id").primaryKey(),
  locationId: text("location_id").notNull().unique(),
  locationName: text("location_name").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  postCount: integer("post_count"),
  topPostUrls: jsonb("top_post_urls").$type<string[]>(),
  linkedPlaceId: integer("linked_place_id").references(() => places.id, { onDelete: "set null" }),
  linkedCityId: integer("linked_city_id").references(() => cities.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Instagram 수집된 사진 (Gemini Vision 분석용)
export const instagramPhotos = pgTable("instagram_photos", {
  id: serial("id").primaryKey(),
  hashtagId: integer("hashtag_id").references(() => instagramHashtags.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => instagramLocations.id, { onDelete: "cascade" }),
  postUrl: text("post_url").notNull().unique(),
  imageUrl: text("image_url"),
  caption: text("caption"),
  likeCount: integer("like_count"),
  commentCount: integer("comment_count"),
  postedAt: timestamp("posted_at"),
  vibeScore: real("vibe_score"),
  vibeKeywords: jsonb("vibe_keywords").$type<string[]>(),
  isAnalyzed: boolean("is_analyzed").default(false),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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

// Gemini Web Search 결과 캐시 (미슐랭/TripAdvisor)
export const geminiWebSearchCache = pgTable("gemini_web_search_cache", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id").references(() => places.id, { onDelete: "cascade" }),
  cityId: integer("city_id").references(() => cities.id, { onDelete: "cascade" }),
  searchQuery: text("search_query").notNull(),
  searchType: text("search_type").notNull(), // michelin, tripadvisor, local_blog, expert_review
  rawResult: jsonb("raw_result"), // Raw Gemini response
  extractedData: jsonb("extracted_data").$type<{
    michelinStars?: number;
    michelinDescription?: string;
    tripAdvisorRating?: number;
    tripAdvisorReviewCount?: number;
    expertReviews?: { source: string; rating: number; summary: string }[];
    awards?: string[];
  }>(),
  confidenceScore: real("confidence_score"), // 0-1 confidence in extracted data
  isVerified: boolean("is_verified").default(false),
  expiresAt: timestamp("expires_at"),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 가격 정보 로우 데이터 (다중 소스)
export const placePrices = pgTable("place_prices", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id").references(() => places.id, { onDelete: "cascade" }),
  cityId: integer("city_id").references(() => cities.id, { onDelete: "cascade" }),
  priceType: text("price_type").notNull(), // entrance_fee, meal_average, activity, transport, ticket
  source: text("source").notNull(), // google_places, gemini_search, klook, viator, official_website
  priceLow: real("price_low"), // 최저 가격
  priceHigh: real("price_high"), // 최고 가격
  priceAverage: real("price_average"), // 평균 가격
  currency: text("currency").notNull().default("KRW"),
  priceLabel: text("price_label"), // "성인 기준", "2인 기준" 등
  sourceUrl: text("source_url"), // 원본 URL
  rawData: jsonb("raw_data").$type<{
    googlePriceLevel?: number;
    klookProductId?: string;
    viatorProductId?: string;
    extractedText?: string;
  }>(),
  confidenceScore: real("confidence_score"), // 0-1 신뢰도
  isVerified: boolean("is_verified").default(false),
  expiresAt: timestamp("expires_at"), // 캐시 만료
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 네이버 블로그 포스트
export const naverBlogPosts = pgTable("naver_blog_posts", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id").references(() => places.id, { onDelete: "cascade" }),
  cityId: integer("city_id").references(() => cities.id, { onDelete: "cascade" }),
  bloggerName: text("blogger_name"),
  bloggerUrl: text("blogger_url"),
  postTitle: text("post_title").notNull(),
  postUrl: text("post_url").notNull().unique(),
  postDate: timestamp("post_date"),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  extractedPlaces: jsonb("extracted_places").$type<{
    placeName: string;
    sentiment: "positive" | "neutral" | "negative";
    keywords: string[];
    rating?: number;
  }[]>(),
  sentimentScore: real("sentiment_score"),
  trustWeight: real("trust_weight").default(0.5),
  isProcessed: boolean("is_processed").default(false),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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

export const verificationStatusEnum = pgEnum("verification_status", ["pending", "in_review", "verified", "rejected"]);

export const verificationRequests = pgTable("verification_requests", {
  id: serial("id").primaryKey(),
  itineraryId: integer("itinerary_id").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itineraryData: jsonb("itinerary_data").notNull(),
  userMessage: text("user_message"),
  preferredDate: timestamp("preferred_date"),
  contactEmail: text("contact_email"),
  contactKakao: text("contact_kakao"),
  status: verificationStatusEnum("status").default("pending"),
  adminComment: text("admin_comment"),
  placeRatings: jsonb("place_ratings").$type<Record<string, { checked: boolean; rating: number; comment?: string }>>(),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 날씨 예보 캐시
export const weatherForecast = pgTable("weather_forecast", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").references(() => cities.id, { onDelete: "cascade" }),
  forecastDate: timestamp("forecast_date").notNull(),
  tempMin: real("temp_min"),
  tempMax: real("temp_max"),
  humidity: integer("humidity"),
  weatherMain: text("weather_main"),
  weatherDescription: text("weather_description"),
  weatherIcon: text("weather_icon"),
  windSpeed: real("wind_speed"),
  rainProbability: real("rain_probability"),
  uvIndex: real("uv_index"),
  airQualityIndex: integer("air_quality_index"),
  realityPenalty: real("reality_penalty"),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// TripAdvisor 데이터 (Gemini Search 수집)
export const tripAdvisorData = pgTable("tripadvisor_data", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id").references(() => places.id, { onDelete: "cascade" }),
  cityId: integer("city_id").references(() => cities.id, { onDelete: "cascade" }),
  tripAdvisorRating: real("tripadvisor_rating"), // 1-5
  tripAdvisorReviewCount: integer("tripadvisor_review_count"),
  tripAdvisorRanking: integer("tripadvisor_ranking"), // 순위
  tripAdvisorRankingTotal: integer("tripadvisor_ranking_total"), // 전체 수
  tripAdvisorCategory: text("tripadvisor_category"), // 카테고리 (e.g., "서울 관광지")
  tripAdvisorUrl: text("tripadvisor_url"),
  excellentReviews: integer("excellent_reviews"), // 5점 리뷰 수
  veryGoodReviews: integer("very_good_reviews"), // 4점 리뷰 수
  averageReviews: integer("average_reviews"), // 3점 리뷰 수
  poorReviews: integer("poor_reviews"), // 2점 리뷰 수
  terribleReviews: integer("terrible_reviews"), // 1점 리뷰 수
  recentReviewSummary: text("recent_review_summary"), // 최근 리뷰 요약
  travelersChoiceAward: boolean("travelers_choice_award").default(false),
  rawData: jsonb("raw_data"),
  confidenceScore: real("confidence_score"), // 0-1
  expiresAt: timestamp("expires_at"),
  fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 데이터 수집 스케줄
export const dataCollectionSchedule = pgTable("data_collection_schedule", {
  id: serial("id").primaryKey(),
  taskName: text("task_name").notNull().unique(),
  description: text("description"),
  cronExpression: text("cron_expression").notNull(),
  isEnabled: boolean("is_enabled").default(true),
  lastRunAt: timestamp("last_run_at"),
  lastStatus: text("last_status"),
  lastDurationMs: integer("last_duration_ms"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Relations
export const citiesRelations = relations(cities, ({ many }) => ({
  places: many(places),
  realityChecks: many(realityChecks),
  weatherCache: many(weatherCache),
  itineraries: many(itineraries),
}));

export const placesRelations = relations(places, ({ one, many }) => ({
  city: one(cities, {
    fields: [places.cityId],
    references: [cities.id],
  }),
  dataSources: many(placeDataSources),
  reviews: many(reviews),
  vibeAnalysis: many(vibeAnalysis),
}));

export const placeDataSourcesRelations = relations(placeDataSources, ({ one }) => ({
  place: one(places, {
    fields: [placeDataSources.placeId],
    references: [places.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  place: one(places, {
    fields: [reviews.placeId],
    references: [places.id],
  }),
}));

export const vibeAnalysisRelations = relations(vibeAnalysis, ({ one }) => ({
  place: one(places, {
    fields: [vibeAnalysis.placeId],
    references: [places.id],
  }),
}));

export const itinerariesRelations = relations(itineraries, ({ one, many }) => ({
  user: one(users, {
    fields: [itineraries.userId],
    references: [users.id],
  }),
  city: one(cities, {
    fields: [itineraries.cityId],
    references: [cities.id],
  }),
  items: many(itineraryItems),
}));

export const itineraryItemsRelations = relations(itineraryItems, ({ one }) => ({
  itinerary: one(itineraries, {
    fields: [itineraryItems.itineraryId],
    references: [itineraries.id],
  }),
  place: one(places, {
    fields: [itineraryItems.placeId],
    references: [places.id],
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

export const insertPlaceSchema = createInsertSchema(places).omit({
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
export type City = typeof cities.$inferSelect;
export type InsertCity = z.infer<typeof insertCitySchema>;
export type Place = typeof places.$inferSelect;
export type InsertPlace = z.infer<typeof insertPlaceSchema>;
export type PlaceDataSource = typeof placeDataSources.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type VibeAnalysis = typeof vibeAnalysis.$inferSelect;
export type RealityCheck = typeof realityChecks.$inferSelect;
export type WeatherCache = typeof weatherCache.$inferSelect;
export type Itinerary = typeof itineraries.$inferSelect;
export type InsertItinerary = z.infer<typeof insertItinerarySchema>;
export type ItineraryItem = typeof itineraryItems.$inferSelect;
export type RouteCache = typeof routeCache.$inferSelect;
export type DataSyncLog = typeof dataSyncLog.$inferSelect;

// Admin Dashboard Types
export type ApiServiceStatus = typeof apiServiceStatus.$inferSelect;
export type YoutubeChannel = typeof youtubeChannels.$inferSelect;
export type YoutubeVideo = typeof youtubeVideos.$inferSelect;
export type YoutubePlaceMention = typeof youtubePlaceMentions.$inferSelect;
export type BlogSource = typeof blogSources.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type DataCollectionSchedule = typeof dataCollectionSchedule.$inferSelect;
export type CrisisAlert = typeof crisisAlerts.$inferSelect;
export type GeminiWebSearchCache = typeof geminiWebSearchCache.$inferSelect;
export type PlacePrice = typeof placePrices.$inferSelect;
export type NaverBlogPost = typeof naverBlogPosts.$inferSelect;
export type WeatherForecast = typeof weatherForecast.$inferSelect;
export type GuidePrice = typeof guidePrices.$inferSelect;
export type VerificationRequest = typeof verificationRequests.$inferSelect;

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

// Re-export chat models
export * from "./models/chat";
