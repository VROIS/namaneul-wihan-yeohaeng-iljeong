CREATE TYPE "public"."data_source" AS ENUM('google', 'tripadvisor', 'yelp', 'foursquare', 'michelin', 'viator');--> statement-breakpoint
CREATE TYPE "public"."persona_type" AS ENUM('luxury', 'comfort', 'economic');--> statement-breakpoint
CREATE TYPE "public"."place_type" AS ENUM('restaurant', 'attraction', 'hotel', 'cafe', 'landmark');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'in_review', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_name" text NOT NULL,
	"key_value" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"last_tested_at" timestamp,
	"last_test_result" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "api_keys_key_name_unique" UNIQUE("key_name")
);
--> statement-breakpoint
CREATE TABLE "api_service_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_name" text NOT NULL,
	"display_name" text NOT NULL,
	"is_configured" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"last_call_at" timestamp,
	"last_success_at" timestamp,
	"last_error_at" timestamp,
	"last_error_message" text,
	"daily_call_count" integer DEFAULT 0,
	"daily_quota" integer,
	"monthly_call_count" integer DEFAULT 0,
	"monthly_quota" integer,
	"quota_reset_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "api_service_status_service_name_unique" UNIQUE("service_name")
);
--> statement-breakpoint
CREATE TABLE "blog_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text,
	"author_name" text,
	"category" text,
	"language" text DEFAULT 'ko',
	"trust_weight" real DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"total_posts_synced" integer DEFAULT 0,
	"added_by" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "celeb_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"rank" integer NOT NULL,
	"name" text NOT NULL,
	"instagram_handle" text NOT NULL,
	"follower_range" text,
	"persona" text,
	"vibes" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "celeb_evidence_rank_unique" UNIQUE("rank")
);
--> statement-breakpoint
CREATE TABLE "celebrity_place_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"celeb_id" integer NOT NULL,
	"image_url" text,
	"post_url" text,
	"posted_at" text,
	"caption" text,
	"like_count" integer,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"name_local" text,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"country" text NOT NULL,
	"country_code" text NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"timezone" text,
	"primary_language" text,
	"tier" integer DEFAULT 1,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crisis_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer,
	"city" text DEFAULT 'Paris' NOT NULL,
	"country_code" text,
	"type" text DEFAULT 'strike' NOT NULL,
	"alert_type" text,
	"title" text NOT NULL,
	"title_ko" text,
	"description" text,
	"date" text NOT NULL,
	"end_date" text,
	"start_date" timestamp,
	"affected" jsonb DEFAULT '[]'::jsonb,
	"affected_areas" jsonb DEFAULT '[]'::jsonb,
	"severity" integer DEFAULT 5 NOT NULL,
	"impact_score" real,
	"recommendation" text,
	"recommendation_ko" text,
	"source" text DEFAULT 'GDELT + Gemini',
	"source_name" text,
	"source_url" text,
	"gemini_analysis" text,
	"is_active" boolean DEFAULT true,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_collection_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_name" text NOT NULL,
	"description" text,
	"cron_expression" text NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"last_run_at" timestamp,
	"last_status" text,
	"last_duration_ms" integer,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "data_collection_schedule_task_name_unique" UNIQUE("task_name")
);
--> statement-breakpoint
CREATE TABLE "data_sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"source" text,
	"status" text NOT NULL,
	"items_processed" integer DEFAULT 0,
	"items_failed" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_currency" text DEFAULT 'KRW' NOT NULL,
	"target_currency" text NOT NULL,
	"rate" real NOT NULL,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gemini_web_search_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer,
	"city_id" integer,
	"search_query" text NOT NULL,
	"search_type" text NOT NULL,
	"raw_result" jsonb,
	"extracted_data" jsonb,
	"confidence_score" real,
	"is_verified" boolean DEFAULT false,
	"expires_at" timestamp,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_type" text NOT NULL,
	"service_name" text NOT NULL,
	"base_price_4h" real,
	"price_per_hour" real,
	"min_hours" real DEFAULT 4,
	"max_hours" real DEFAULT 10,
	"min_passengers" integer DEFAULT 1,
	"max_passengers" integer DEFAULT 4,
	"price_per_day" real,
	"price_low" real,
	"price_high" real,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"unit" text DEFAULT 'hour' NOT NULL,
	"description" text,
	"features" jsonb DEFAULT '[]'::jsonb,
	"uber_black_estimate" jsonb,
	"uber_x_estimate" jsonb,
	"taxi_estimate" jsonb,
	"comparison_note" text,
	"is_active" boolean DEFAULT true,
	"source" text DEFAULT 'guide_verified',
	"last_updated" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_hashtags" (
	"id" serial PRIMARY KEY NOT NULL,
	"hashtag" text NOT NULL,
	"post_count" integer,
	"avg_likes" integer,
	"avg_comments" integer,
	"top_post_urls" jsonb,
	"linked_place_id" integer,
	"linked_city_id" integer,
	"category" text,
	"is_active" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "instagram_hashtags_hashtag_unique" UNIQUE("hashtag")
);
--> statement-breakpoint
CREATE TABLE "instagram_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"location_name" text NOT NULL,
	"latitude" real,
	"longitude" real,
	"post_count" integer,
	"top_post_urls" jsonb,
	"linked_place_id" integer,
	"linked_city_id" integer,
	"is_active" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "instagram_locations_location_id_unique" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE "instagram_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"hashtag_id" integer,
	"location_id" integer,
	"post_url" text NOT NULL,
	"image_url" text,
	"caption" text,
	"like_count" integer,
	"comment_count" integer,
	"posted_at" timestamp,
	"vibe_score" real,
	"vibe_keywords" jsonb,
	"is_analyzed" boolean DEFAULT false,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "instagram_photos_post_url_unique" UNIQUE("post_url")
);
--> statement-breakpoint
CREATE TABLE "itineraries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"city_id" integer NOT NULL,
	"title" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"travel_style" "persona_type" DEFAULT 'comfort',
	"budget" integer,
	"optimization_mode" text DEFAULT 'balanced',
	"total_cost" real,
	"total_duration" integer,
	"status" text DEFAULT 'draft',
	"curation_focus" text DEFAULT 'Everyone',
	"companion_type" text DEFAULT 'Couple',
	"companion_count" integer DEFAULT 2,
	"companion_ages" text,
	"vibes" jsonb DEFAULT '[]'::jsonb,
	"travel_pace" text DEFAULT 'Normal',
	"mobility_style" text DEFAULT 'Moderate',
	"meal_level" text DEFAULT 'Local',
	"protagonist_sentence" text,
	"video_task_id" text,
	"video_status" text,
	"video_url" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"itinerary_id" integer NOT NULL,
	"place_id" integer NOT NULL,
	"day_number" integer NOT NULL,
	"order_in_day" integer NOT NULL,
	"start_time" text,
	"end_time" text,
	"duration" integer,
	"travel_mode" text,
	"travel_duration" integer,
	"travel_cost" real,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "naver_blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer,
	"city_id" integer,
	"blogger_name" text,
	"blogger_url" text,
	"post_title" text NOT NULL,
	"post_url" text NOT NULL,
	"post_date" timestamp,
	"description" text,
	"thumbnail_url" text,
	"extracted_places" jsonb,
	"sentiment_score" real,
	"trust_weight" real DEFAULT 0.5,
	"is_processed" boolean DEFAULT false,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "naver_blog_posts_post_url_unique" UNIQUE("post_url")
);
--> statement-breakpoint
CREATE TABLE "place_data_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"source" "data_source" NOT NULL,
	"source_id" text,
	"source_url" text,
	"rating" real,
	"review_count" integer,
	"price_level" integer,
	"ranking_in_category" integer,
	"is_michelin_star" boolean DEFAULT false,
	"michelin_type" text,
	"raw_data" jsonb,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer,
	"city_id" integer,
	"price_type" text NOT NULL,
	"source" text NOT NULL,
	"price_low" real,
	"price_high" real,
	"price_average" real,
	"currency" text DEFAULT 'KRW' NOT NULL,
	"price_label" text,
	"source_url" text,
	"raw_data" jsonb,
	"confidence_score" real,
	"is_verified" boolean DEFAULT false,
	"expires_at" timestamp,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"google_place_id" text,
	"name" text NOT NULL,
	"display_name_ko" text,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"type" "place_type" NOT NULL,
	"cuisine_type" text,
	"cuisine_origin_country" text,
	"address" text,
	"short_address" text,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"price_level" integer,
	"photo_urls" jsonb DEFAULT '[]'::jsonb,
	"opening_hours" jsonb,
	"website_uri" text,
	"google_maps_uri" text,
	"phone_number" text,
	"editorial_summary" text,
	"business_status" text,
	"user_rating_count" integer,
	"delivery" boolean,
	"dine_in" boolean,
	"takeout" boolean,
	"curbside_pickup" boolean,
	"reservable" boolean,
	"serves_beer" boolean,
	"serves_wine" boolean,
	"serves_breakfast" boolean,
	"serves_brunch" boolean,
	"serves_lunch" boolean,
	"serves_dinner" boolean,
	"serves_vegetarian_food" boolean,
	"serves_coffee" boolean,
	"serves_dessert" boolean,
	"good_for_children" boolean,
	"good_for_groups" boolean,
	"good_for_watching_sports" boolean,
	"live_music" boolean,
	"outdoor_seating" boolean,
	"restroom" boolean,
	"menu_for_children" boolean,
	"allows_dogs" boolean,
	"accessibility_options" jsonb,
	"parking_options" jsonb,
	"payment_options" jsonb,
	"instagram_photo_urls" jsonb DEFAULT '[]'::jsonb,
	"instagram_hashtags" jsonb DEFAULT '[]'::jsonb,
	"instagram_post_count" integer DEFAULT 0,
	"vibe_score" real,
	"buzz_score" real,
	"taste_verify_score" real,
	"reality_penalty" real DEFAULT 0,
	"final_score" real,
	"tier" integer,
	"vibe_keywords" jsonb DEFAULT '[]'::jsonb,
	"seed_category" text,
	"is_verified" boolean DEFAULT false,
	"last_data_sync" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "places_google_place_id_unique" UNIQUE("google_place_id")
);
--> statement-breakpoint
CREATE TABLE "reality_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"check_type" text NOT NULL,
	"severity" text,
	"title" text,
	"description" text,
	"affected_place_ids" jsonb,
	"penalty_score" real DEFAULT 0,
	"start_date" timestamp,
	"end_date" timestamp,
	"source" text,
	"raw_data" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"source" "data_source" NOT NULL,
	"source_review_id" text,
	"language" text,
	"rating" real,
	"text" text,
	"author_country" text,
	"is_originator_language" boolean DEFAULT false,
	"sentiment_score" real,
	"authenticity_keywords" jsonb,
	"review_date" timestamp,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"origin_place_id" integer NOT NULL,
	"destination_place_id" integer NOT NULL,
	"travel_mode" text NOT NULL,
	"distance_meters" integer,
	"duration_seconds" integer,
	"duration_in_traffic" integer,
	"estimated_cost" real,
	"polyline" text,
	"steps" jsonb,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tripadvisor_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer,
	"city_id" integer,
	"tripadvisor_rating" real,
	"tripadvisor_review_count" integer,
	"tripadvisor_ranking" integer,
	"tripadvisor_ranking_total" integer,
	"tripadvisor_category" text,
	"tripadvisor_url" text,
	"excellent_reviews" integer,
	"very_good_reviews" integer,
	"average_reviews" integer,
	"poor_reviews" integer,
	"terrible_reviews" integer,
	"recent_review_summary" text,
	"travelers_choice_award" boolean DEFAULT false,
	"raw_data" jsonb,
	"confidence_score" real,
	"expires_at" timestamp,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"display_name" text,
	"persona" "persona_type" DEFAULT 'comfort',
	"preferred_language" text DEFAULT 'ko',
	"birth_date" text,
	"preferred_vibes" jsonb DEFAULT '[]'::jsonb,
	"preferred_companion_type" text,
	"preferred_travel_style" text,
	"marketing_consent" boolean DEFAULT false,
	"vibes_updated_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"itinerary_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"itinerary_data" jsonb NOT NULL,
	"user_message" text,
	"preferred_date" timestamp,
	"contact_email" text,
	"contact_kakao" text,
	"status" "verification_status" DEFAULT 'pending',
	"admin_comment" text,
	"place_ratings" jsonb,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vibe_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"photo_url" text,
	"visual_score" real,
	"composition_score" real,
	"lighting_score" real,
	"color_score" real,
	"vibe_categories" jsonb,
	"gemini_response" jsonb,
	"analyzed_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"temperature" real,
	"feels_like" real,
	"humidity" integer,
	"weather_condition" text,
	"weather_icon" text,
	"precipitation" real,
	"wind_speed" real,
	"uv_index" integer,
	"penalty" real DEFAULT 0,
	"raw_data" jsonb,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_forecast" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer,
	"forecast_date" timestamp NOT NULL,
	"temp_min" real,
	"temp_max" real,
	"humidity" integer,
	"weather_main" text,
	"weather_description" text,
	"weather_icon" text,
	"wind_speed" real,
	"rain_probability" real,
	"uv_index" real,
	"air_quality_index" integer,
	"reality_penalty" real,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"channel_url" text,
	"thumbnail_url" text,
	"subscriber_count" integer,
	"video_count" integer,
	"category" text,
	"trust_weight" real DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"last_video_sync_at" timestamp,
	"total_videos_synced" integer DEFAULT 0,
	"total_places_mentioned" integer DEFAULT 0,
	"added_by" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "youtube_channels_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "youtube_place_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer NOT NULL,
	"place_id" integer,
	"place_name" text NOT NULL,
	"city_name" text,
	"timestamp_start" integer,
	"timestamp_end" integer,
	"sentiment" text,
	"summary" text,
	"confidence" real,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"video_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"published_at" timestamp,
	"duration" integer,
	"view_count" integer,
	"like_count" integer,
	"comment_count" integer,
	"thumbnail_url" text,
	"has_transcript" boolean DEFAULT false,
	"transcript_text" text,
	"extracted_places" jsonb,
	"is_processed" boolean DEFAULT false,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "youtube_videos_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "celebrity_place_evidence" ADD CONSTRAINT "celebrity_place_evidence_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebrity_place_evidence" ADD CONSTRAINT "celebrity_place_evidence_celeb_id_celeb_evidence_id_fk" FOREIGN KEY ("celeb_id") REFERENCES "public"."celeb_evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_alerts" ADD CONSTRAINT "crisis_alerts_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gemini_web_search_cache" ADD CONSTRAINT "gemini_web_search_cache_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gemini_web_search_cache" ADD CONSTRAINT "gemini_web_search_cache_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_hashtags" ADD CONSTRAINT "instagram_hashtags_linked_place_id_places_id_fk" FOREIGN KEY ("linked_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_hashtags" ADD CONSTRAINT "instagram_hashtags_linked_city_id_cities_id_fk" FOREIGN KEY ("linked_city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_locations" ADD CONSTRAINT "instagram_locations_linked_place_id_places_id_fk" FOREIGN KEY ("linked_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_locations" ADD CONSTRAINT "instagram_locations_linked_city_id_cities_id_fk" FOREIGN KEY ("linked_city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_photos" ADD CONSTRAINT "instagram_photos_hashtag_id_instagram_hashtags_id_fk" FOREIGN KEY ("hashtag_id") REFERENCES "public"."instagram_hashtags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_photos" ADD CONSTRAINT "instagram_photos_location_id_instagram_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."instagram_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_blog_posts" ADD CONSTRAINT "naver_blog_posts_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_blog_posts" ADD CONSTRAINT "naver_blog_posts_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_data_sources" ADD CONSTRAINT "place_data_sources_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_prices" ADD CONSTRAINT "place_prices_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_prices" ADD CONSTRAINT "place_prices_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reality_checks" ADD CONSTRAINT "reality_checks_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_cache" ADD CONSTRAINT "route_cache_origin_place_id_places_id_fk" FOREIGN KEY ("origin_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_cache" ADD CONSTRAINT "route_cache_destination_place_id_places_id_fk" FOREIGN KEY ("destination_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tripadvisor_data" ADD CONSTRAINT "tripadvisor_data_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tripadvisor_data" ADD CONSTRAINT "tripadvisor_data_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vibe_analysis" ADD CONSTRAINT "vibe_analysis_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_cache" ADD CONSTRAINT "weather_cache_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_forecast" ADD CONSTRAINT "weather_forecast_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_place_mentions" ADD CONSTRAINT "youtube_place_mentions_video_id_youtube_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."youtube_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_place_mentions" ADD CONSTRAINT "youtube_place_mentions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_videos" ADD CONSTRAINT "youtube_videos_channel_id_youtube_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;