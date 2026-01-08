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

// Re-export chat models
export * from "./models/chat";
