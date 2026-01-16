--
-- PostgreSQL database dump
--


-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: data_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.data_source AS ENUM (
    'google',
    'tripadvisor',
    'yelp',
    'foursquare',
    'michelin',
    'viator'
);


--
-- Name: persona_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.persona_type AS ENUM (
    'luxury',
    'comfort'
);


--
-- Name: place_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.place_type AS ENUM (
    'restaurant',
    'attraction',
    'hotel',
    'cafe',
    'landmark'
);


--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_status AS ENUM (
    'pending',
    'in_review',
    'verified',
    'rejected'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_service_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_service_status (
    id integer NOT NULL,
    service_name text NOT NULL,
    display_name text NOT NULL,
    is_configured boolean DEFAULT false,
    is_active boolean DEFAULT true,
    last_call_at timestamp without time zone,
    last_success_at timestamp without time zone,
    last_error_at timestamp without time zone,
    last_error_message text,
    daily_call_count integer DEFAULT 0,
    daily_quota integer,
    monthly_call_count integer DEFAULT 0,
    monthly_quota integer,
    quota_reset_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: api_service_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_service_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_service_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_service_status_id_seq OWNED BY public.api_service_status.id;


--
-- Name: blog_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_sources (
    id integer NOT NULL,
    platform text NOT NULL,
    source_name text NOT NULL,
    source_url text,
    author_name text,
    category text,
    language text DEFAULT 'ko'::text,
    trust_weight real DEFAULT 1,
    is_active boolean DEFAULT true,
    last_sync_at timestamp without time zone,
    total_posts_synced integer DEFAULT 0,
    added_by text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: blog_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_sources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blog_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_sources_id_seq OWNED BY public.blog_sources.id;


--
-- Name: cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    name text NOT NULL,
    country text NOT NULL,
    country_code text NOT NULL,
    latitude real NOT NULL,
    longitude real NOT NULL,
    timezone text,
    primary_language text,
    tier integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id integer NOT NULL,
    title text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: crisis_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crisis_alerts (
    id integer NOT NULL,
    city_id integer,
    country_code text,
    alert_type text NOT NULL,
    severity integer NOT NULL,
    title text NOT NULL,
    description text,
    source_url text,
    source_name text,
    affected_areas jsonb DEFAULT '[]'::jsonb,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    gemini_analysis text,
    impact_score real,
    is_active boolean DEFAULT true,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: crisis_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crisis_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crisis_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crisis_alerts_id_seq OWNED BY public.crisis_alerts.id;


--
-- Name: data_collection_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_collection_schedule (
    id integer NOT NULL,
    task_name text NOT NULL,
    description text,
    cron_expression text NOT NULL,
    is_enabled boolean DEFAULT true,
    last_run_at timestamp without time zone,
    last_status text,
    last_duration_ms integer,
    next_run_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: data_collection_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_collection_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_collection_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_collection_schedule_id_seq OWNED BY public.data_collection_schedule.id;


--
-- Name: data_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_sync_log (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id integer,
    source text,
    status text NOT NULL,
    items_processed integer DEFAULT 0,
    items_failed integer DEFAULT 0,
    error_message text,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp without time zone
);


--
-- Name: data_sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_sync_log_id_seq OWNED BY public.data_sync_log.id;


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id integer NOT NULL,
    base_currency text DEFAULT 'KRW'::text NOT NULL,
    target_currency text NOT NULL,
    rate real NOT NULL,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_rates_id_seq OWNED BY public.exchange_rates.id;


--
-- Name: gemini_web_search_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gemini_web_search_cache (
    id integer NOT NULL,
    place_id integer,
    city_id integer,
    search_query text NOT NULL,
    search_type text NOT NULL,
    raw_result jsonb,
    extracted_data jsonb,
    confidence_score real,
    is_verified boolean DEFAULT false,
    expires_at timestamp without time zone,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: gemini_web_search_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gemini_web_search_cache_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gemini_web_search_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gemini_web_search_cache_id_seq OWNED BY public.gemini_web_search_cache.id;


--
-- Name: guide_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guide_prices (
    id integer NOT NULL,
    service_type text NOT NULL,
    service_name text NOT NULL,
    price_per_day real,
    price_low real,
    price_high real,
    currency text DEFAULT 'EUR'::text NOT NULL,
    unit text DEFAULT 'day'::text NOT NULL,
    description text,
    features jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    source text DEFAULT 'guide_verified'::text,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: guide_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guide_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guide_prices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guide_prices_id_seq OWNED BY public.guide_prices.id;


--
-- Name: instagram_hashtags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_hashtags (
    id integer NOT NULL,
    hashtag text NOT NULL,
    post_count integer,
    avg_likes integer,
    avg_comments integer,
    top_post_urls jsonb,
    linked_place_id integer,
    linked_city_id integer,
    category text,
    is_active boolean DEFAULT true,
    last_sync_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: instagram_hashtags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instagram_hashtags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instagram_hashtags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instagram_hashtags_id_seq OWNED BY public.instagram_hashtags.id;


--
-- Name: instagram_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_locations (
    id integer NOT NULL,
    location_id text NOT NULL,
    location_name text NOT NULL,
    latitude real,
    longitude real,
    post_count integer,
    top_post_urls jsonb,
    linked_place_id integer,
    linked_city_id integer,
    is_active boolean DEFAULT true,
    last_sync_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: instagram_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instagram_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instagram_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instagram_locations_id_seq OWNED BY public.instagram_locations.id;


--
-- Name: instagram_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_photos (
    id integer NOT NULL,
    hashtag_id integer,
    location_id integer,
    post_url text NOT NULL,
    image_url text,
    caption text,
    like_count integer,
    comment_count integer,
    posted_at timestamp without time zone,
    vibe_score real,
    vibe_keywords jsonb,
    is_analyzed boolean DEFAULT false,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: instagram_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instagram_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instagram_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instagram_photos_id_seq OWNED BY public.instagram_photos.id;


--
-- Name: itineraries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itineraries (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    city_id integer NOT NULL,
    title text NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    travel_style public.persona_type DEFAULT 'comfort'::public.persona_type,
    budget integer,
    optimization_mode text DEFAULT 'balanced'::text,
    total_cost real,
    total_duration integer,
    status text DEFAULT 'draft'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: itineraries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itineraries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itineraries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itineraries_id_seq OWNED BY public.itineraries.id;


--
-- Name: itinerary_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itinerary_items (
    id integer NOT NULL,
    itinerary_id integer NOT NULL,
    place_id integer NOT NULL,
    day_number integer NOT NULL,
    order_in_day integer NOT NULL,
    start_time text,
    end_time text,
    duration integer,
    travel_mode text,
    travel_duration integer,
    travel_cost real,
    notes text
);


--
-- Name: itinerary_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itinerary_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itinerary_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itinerary_items_id_seq OWNED BY public.itinerary_items.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: naver_blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.naver_blog_posts (
    id integer NOT NULL,
    place_id integer,
    city_id integer,
    blogger_name text,
    blogger_url text,
    post_title text NOT NULL,
    post_url text NOT NULL,
    post_date timestamp without time zone,
    description text,
    thumbnail_url text,
    extracted_places jsonb,
    sentiment_score real,
    trust_weight real DEFAULT 0.5,
    is_processed boolean DEFAULT false,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: naver_blog_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.naver_blog_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: naver_blog_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.naver_blog_posts_id_seq OWNED BY public.naver_blog_posts.id;


--
-- Name: place_data_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_data_sources (
    id integer NOT NULL,
    place_id integer NOT NULL,
    source public.data_source NOT NULL,
    source_id text,
    source_url text,
    rating real,
    review_count integer,
    price_level integer,
    ranking_in_category integer,
    is_michelin_star boolean DEFAULT false,
    michelin_type text,
    raw_data jsonb,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: place_data_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.place_data_sources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: place_data_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.place_data_sources_id_seq OWNED BY public.place_data_sources.id;


--
-- Name: place_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_prices (
    id integer NOT NULL,
    place_id integer,
    city_id integer,
    price_type text NOT NULL,
    source text NOT NULL,
    price_low real,
    price_high real,
    price_average real,
    currency text DEFAULT 'KRW'::text NOT NULL,
    price_label text,
    source_url text,
    raw_data jsonb,
    confidence_score real,
    is_verified boolean DEFAULT false,
    expires_at timestamp without time zone,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: place_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.place_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: place_prices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.place_prices_id_seq OWNED BY public.place_prices.id;


--
-- Name: places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.places (
    id integer NOT NULL,
    city_id integer NOT NULL,
    google_place_id text,
    name text NOT NULL,
    type public.place_type NOT NULL,
    cuisine_type text,
    cuisine_origin_country text,
    address text,
    latitude real NOT NULL,
    longitude real NOT NULL,
    price_level integer,
    photo_urls jsonb DEFAULT '[]'::jsonb,
    opening_hours jsonb,
    vibe_score real,
    buzz_score real,
    taste_verify_score real,
    reality_penalty real DEFAULT 0,
    final_score real,
    tier integer,
    vibe_keywords jsonb DEFAULT '[]'::jsonb,
    is_verified boolean DEFAULT false,
    last_data_sync timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    short_address text,
    website_uri text,
    google_maps_uri text,
    phone_number text,
    editorial_summary text,
    business_status text,
    user_rating_count integer,
    delivery boolean,
    dine_in boolean,
    takeout boolean,
    curbside_pickup boolean,
    reservable boolean,
    serves_beer boolean,
    serves_wine boolean,
    serves_breakfast boolean,
    serves_brunch boolean,
    serves_lunch boolean,
    serves_dinner boolean,
    serves_vegetarian_food boolean,
    serves_coffee boolean,
    serves_dessert boolean,
    good_for_children boolean,
    good_for_groups boolean,
    good_for_watching_sports boolean,
    live_music boolean,
    outdoor_seating boolean,
    restroom boolean,
    menu_for_children boolean,
    allows_dogs boolean,
    accessibility_options jsonb,
    parking_options jsonb,
    payment_options jsonb,
    instagram_photo_urls jsonb DEFAULT '[]'::jsonb,
    instagram_hashtags jsonb DEFAULT '[]'::jsonb,
    instagram_post_count integer DEFAULT 0
);


--
-- Name: places_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.places_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: places_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.places_id_seq OWNED BY public.places.id;


--
-- Name: reality_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reality_checks (
    id integer NOT NULL,
    city_id integer NOT NULL,
    check_type text NOT NULL,
    severity text,
    title text,
    description text,
    affected_place_ids jsonb,
    penalty_score real DEFAULT 0,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    source text,
    raw_data jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: reality_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reality_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reality_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reality_checks_id_seq OWNED BY public.reality_checks.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    place_id integer NOT NULL,
    source public.data_source NOT NULL,
    source_review_id text,
    language text,
    rating real,
    text text,
    author_country text,
    is_originator_language boolean DEFAULT false,
    sentiment_score real,
    authenticity_keywords jsonb,
    review_date timestamp without time zone,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: route_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_cache (
    id integer NOT NULL,
    origin_place_id integer NOT NULL,
    destination_place_id integer NOT NULL,
    travel_mode text NOT NULL,
    distance_meters integer,
    duration_seconds integer,
    duration_in_traffic integer,
    estimated_cost real,
    polyline text,
    steps jsonb,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: route_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.route_cache_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: route_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.route_cache_id_seq OWNED BY public.route_cache.id;


--
-- Name: tripadvisor_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tripadvisor_data (
    id integer NOT NULL,
    place_id integer,
    city_id integer,
    tripadvisor_rating real,
    tripadvisor_review_count integer,
    tripadvisor_ranking integer,
    tripadvisor_ranking_total integer,
    tripadvisor_category text,
    tripadvisor_url text,
    excellent_reviews integer,
    very_good_reviews integer,
    average_reviews integer,
    poor_reviews integer,
    terrible_reviews integer,
    recent_review_summary text,
    travelers_choice_award boolean DEFAULT false,
    raw_data jsonb,
    confidence_score real,
    expires_at timestamp without time zone,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tripadvisor_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tripadvisor_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tripadvisor_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tripadvisor_data_id_seq OWNED BY public.tripadvisor_data.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    display_name text,
    persona public.persona_type DEFAULT 'comfort'::public.persona_type,
    preferred_language text DEFAULT 'ko'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: verification_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_requests (
    id integer NOT NULL,
    itinerary_id integer NOT NULL,
    user_id character varying NOT NULL,
    itinerary_data jsonb NOT NULL,
    user_message text,
    preferred_date timestamp without time zone,
    contact_email text,
    contact_kakao text,
    status public.verification_status DEFAULT 'pending'::public.verification_status,
    admin_comment text,
    place_ratings jsonb,
    reviewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: verification_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verification_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verification_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verification_requests_id_seq OWNED BY public.verification_requests.id;


--
-- Name: vibe_analysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vibe_analysis (
    id integer NOT NULL,
    place_id integer NOT NULL,
    photo_url text,
    visual_score real,
    composition_score real,
    lighting_score real,
    color_score real,
    vibe_categories jsonb,
    gemini_response jsonb,
    analyzed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: vibe_analysis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vibe_analysis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vibe_analysis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vibe_analysis_id_seq OWNED BY public.vibe_analysis.id;


--
-- Name: weather_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_cache (
    id integer NOT NULL,
    city_id integer NOT NULL,
    date timestamp without time zone NOT NULL,
    temperature real,
    feels_like real,
    humidity integer,
    weather_condition text,
    weather_icon text,
    precipitation real,
    wind_speed real,
    uv_index integer,
    penalty real DEFAULT 0,
    raw_data jsonb,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: weather_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.weather_cache_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: weather_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.weather_cache_id_seq OWNED BY public.weather_cache.id;


--
-- Name: weather_forecast; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_forecast (
    id integer NOT NULL,
    city_id integer,
    forecast_date timestamp without time zone NOT NULL,
    temp_min real,
    temp_max real,
    humidity integer,
    weather_main text,
    weather_description text,
    weather_icon text,
    wind_speed real,
    rain_probability real,
    uv_index real,
    air_quality_index integer,
    reality_penalty real,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: weather_forecast_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.weather_forecast_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: weather_forecast_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.weather_forecast_id_seq OWNED BY public.weather_forecast.id;


--
-- Name: youtube_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.youtube_channels (
    id integer NOT NULL,
    channel_id text NOT NULL,
    channel_name text NOT NULL,
    channel_url text,
    thumbnail_url text,
    subscriber_count integer,
    video_count integer,
    category text,
    trust_weight real DEFAULT 1,
    is_active boolean DEFAULT true,
    last_video_sync_at timestamp without time zone,
    total_videos_synced integer DEFAULT 0,
    total_places_mentioned integer DEFAULT 0,
    added_by text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: youtube_channels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.youtube_channels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: youtube_channels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.youtube_channels_id_seq OWNED BY public.youtube_channels.id;


--
-- Name: youtube_place_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.youtube_place_mentions (
    id integer NOT NULL,
    video_id integer NOT NULL,
    place_id integer,
    place_name text NOT NULL,
    city_name text,
    timestamp_start integer,
    timestamp_end integer,
    sentiment text,
    summary text,
    confidence real,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: youtube_place_mentions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.youtube_place_mentions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: youtube_place_mentions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.youtube_place_mentions_id_seq OWNED BY public.youtube_place_mentions.id;


--
-- Name: youtube_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.youtube_videos (
    id integer NOT NULL,
    channel_id integer NOT NULL,
    video_id text NOT NULL,
    title text NOT NULL,
    description text,
    published_at timestamp without time zone,
    duration integer,
    view_count integer,
    like_count integer,
    thumbnail_url text,
    has_transcript boolean DEFAULT false,
    transcript_text text,
    extracted_places jsonb,
    is_processed boolean DEFAULT false,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    comment_count integer
);


--
-- Name: youtube_videos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.youtube_videos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: youtube_videos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.youtube_videos_id_seq OWNED BY public.youtube_videos.id;


--
-- Name: api_service_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_service_status ALTER COLUMN id SET DEFAULT nextval('public.api_service_status_id_seq'::regclass);


--
-- Name: blog_sources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_sources ALTER COLUMN id SET DEFAULT nextval('public.blog_sources_id_seq'::regclass);


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: crisis_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crisis_alerts ALTER COLUMN id SET DEFAULT nextval('public.crisis_alerts_id_seq'::regclass);


--
-- Name: data_collection_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_collection_schedule ALTER COLUMN id SET DEFAULT nextval('public.data_collection_schedule_id_seq'::regclass);


--
-- Name: data_sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sync_log ALTER COLUMN id SET DEFAULT nextval('public.data_sync_log_id_seq'::regclass);


--
-- Name: exchange_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates ALTER COLUMN id SET DEFAULT nextval('public.exchange_rates_id_seq'::regclass);


--
-- Name: gemini_web_search_cache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gemini_web_search_cache ALTER COLUMN id SET DEFAULT nextval('public.gemini_web_search_cache_id_seq'::regclass);


--
-- Name: guide_prices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_prices ALTER COLUMN id SET DEFAULT nextval('public.guide_prices_id_seq'::regclass);


--
-- Name: instagram_hashtags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_hashtags ALTER COLUMN id SET DEFAULT nextval('public.instagram_hashtags_id_seq'::regclass);


--
-- Name: instagram_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_locations ALTER COLUMN id SET DEFAULT nextval('public.instagram_locations_id_seq'::regclass);


--
-- Name: instagram_photos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_photos ALTER COLUMN id SET DEFAULT nextval('public.instagram_photos_id_seq'::regclass);


--
-- Name: itineraries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries ALTER COLUMN id SET DEFAULT nextval('public.itineraries_id_seq'::regclass);


--
-- Name: itinerary_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_items ALTER COLUMN id SET DEFAULT nextval('public.itinerary_items_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: naver_blog_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naver_blog_posts ALTER COLUMN id SET DEFAULT nextval('public.naver_blog_posts_id_seq'::regclass);


--
-- Name: place_data_sources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_data_sources ALTER COLUMN id SET DEFAULT nextval('public.place_data_sources_id_seq'::regclass);


--
-- Name: place_prices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_prices ALTER COLUMN id SET DEFAULT nextval('public.place_prices_id_seq'::regclass);


--
-- Name: places id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places ALTER COLUMN id SET DEFAULT nextval('public.places_id_seq'::regclass);


--
-- Name: reality_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reality_checks ALTER COLUMN id SET DEFAULT nextval('public.reality_checks_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Name: route_cache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_cache ALTER COLUMN id SET DEFAULT nextval('public.route_cache_id_seq'::regclass);


--
-- Name: tripadvisor_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tripadvisor_data ALTER COLUMN id SET DEFAULT nextval('public.tripadvisor_data_id_seq'::regclass);


--
-- Name: verification_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_requests ALTER COLUMN id SET DEFAULT nextval('public.verification_requests_id_seq'::regclass);


--
-- Name: vibe_analysis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vibe_analysis ALTER COLUMN id SET DEFAULT nextval('public.vibe_analysis_id_seq'::regclass);


--
-- Name: weather_cache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_cache ALTER COLUMN id SET DEFAULT nextval('public.weather_cache_id_seq'::regclass);


--
-- Name: weather_forecast id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_forecast ALTER COLUMN id SET DEFAULT nextval('public.weather_forecast_id_seq'::regclass);


--
-- Name: youtube_channels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_channels ALTER COLUMN id SET DEFAULT nextval('public.youtube_channels_id_seq'::regclass);


--
-- Name: youtube_place_mentions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_place_mentions ALTER COLUMN id SET DEFAULT nextval('public.youtube_place_mentions_id_seq'::regclass);


--
-- Name: youtube_videos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_videos ALTER COLUMN id SET DEFAULT nextval('public.youtube_videos_id_seq'::regclass);


--
-- Data for Name: api_service_status; Type: TABLE DATA; Schema: public; Owner: -
--

