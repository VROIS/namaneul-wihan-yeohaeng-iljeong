SELECT pg_catalog.setval('public.guide_prices_id_seq', 6, true);


--
-- Name: instagram_hashtags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.instagram_hashtags_id_seq', 74, true);


--
-- Name: instagram_locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.instagram_locations_id_seq', 1, false);


--
-- Name: instagram_photos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.instagram_photos_id_seq', 1, false);


--
-- Name: itineraries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.itineraries_id_seq', 1, false);


--
-- Name: itinerary_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.itinerary_items_id_seq', 1, false);


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.messages_id_seq', 1, false);


--
-- Name: naver_blog_posts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.naver_blog_posts_id_seq', 818, true);


--
-- Name: place_data_sources_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.place_data_sources_id_seq', 20, true);


--
-- Name: place_prices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.place_prices_id_seq', 96, true);


--
-- Name: places_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.places_id_seq', 20, true);


--
-- Name: reality_checks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reality_checks_id_seq', 1, false);


--
-- Name: reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reviews_id_seq', 300, true);


--
-- Name: route_cache_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.route_cache_id_seq', 1, false);


--
-- Name: tripadvisor_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tripadvisor_data_id_seq', 20, true);


--
-- Name: verification_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.verification_requests_id_seq', 2, true);


--
-- Name: vibe_analysis_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vibe_analysis_id_seq', 1, false);


--
-- Name: weather_cache_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.weather_cache_id_seq', 32, true);


--
-- Name: weather_forecast_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.weather_forecast_id_seq', 192, true);


--
-- Name: youtube_channels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.youtube_channels_id_seq', 55, true);


--
-- Name: youtube_place_mentions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.youtube_place_mentions_id_seq', 121, true);


--
-- Name: youtube_videos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.youtube_videos_id_seq', 112, true);


--
-- Name: api_service_status api_service_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_service_status
    ADD CONSTRAINT api_service_status_pkey PRIMARY KEY (id);


--
-- Name: api_service_status api_service_status_service_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_service_status
    ADD CONSTRAINT api_service_status_service_name_unique UNIQUE (service_name);


--
-- Name: blog_sources blog_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_sources
    ADD CONSTRAINT blog_sources_pkey PRIMARY KEY (id);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: crisis_alerts crisis_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crisis_alerts
    ADD CONSTRAINT crisis_alerts_pkey PRIMARY KEY (id);


--
-- Name: data_collection_schedule data_collection_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_collection_schedule
    ADD CONSTRAINT data_collection_schedule_pkey PRIMARY KEY (id);


--
-- Name: data_collection_schedule data_collection_schedule_task_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_collection_schedule
    ADD CONSTRAINT data_collection_schedule_task_name_unique UNIQUE (task_name);


--
-- Name: data_sync_log data_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sync_log
    ADD CONSTRAINT data_sync_log_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: gemini_web_search_cache gemini_web_search_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gemini_web_search_cache
    ADD CONSTRAINT gemini_web_search_cache_pkey PRIMARY KEY (id);


--
-- Name: guide_prices guide_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_prices
    ADD CONSTRAINT guide_prices_pkey PRIMARY KEY (id);


--
-- Name: instagram_hashtags instagram_hashtags_hashtag_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_hashtags
    ADD CONSTRAINT instagram_hashtags_hashtag_unique UNIQUE (hashtag);


--
-- Name: instagram_hashtags instagram_hashtags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_hashtags
    ADD CONSTRAINT instagram_hashtags_pkey PRIMARY KEY (id);


--
-- Name: instagram_locations instagram_locations_location_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_locations
    ADD CONSTRAINT instagram_locations_location_id_unique UNIQUE (location_id);


--
-- Name: instagram_locations instagram_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_locations
    ADD CONSTRAINT instagram_locations_pkey PRIMARY KEY (id);


--
-- Name: instagram_photos instagram_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_photos
    ADD CONSTRAINT instagram_photos_pkey PRIMARY KEY (id);


--
-- Name: instagram_photos instagram_photos_post_url_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_photos
    ADD CONSTRAINT instagram_photos_post_url_unique UNIQUE (post_url);


--
-- Name: itineraries itineraries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_pkey PRIMARY KEY (id);


--
-- Name: itinerary_items itinerary_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_items
    ADD CONSTRAINT itinerary_items_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: naver_blog_posts naver_blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naver_blog_posts
    ADD CONSTRAINT naver_blog_posts_pkey PRIMARY KEY (id);


--
-- Name: naver_blog_posts naver_blog_posts_post_url_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naver_blog_posts
    ADD CONSTRAINT naver_blog_posts_post_url_unique UNIQUE (post_url);


--
-- Name: place_data_sources place_data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_data_sources
    ADD CONSTRAINT place_data_sources_pkey PRIMARY KEY (id);


--
-- Name: place_prices place_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_prices
    ADD CONSTRAINT place_prices_pkey PRIMARY KEY (id);


--
-- Name: places places_google_place_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_google_place_id_unique UNIQUE (google_place_id);


--
-- Name: places places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_pkey PRIMARY KEY (id);


--
-- Name: reality_checks reality_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reality_checks
    ADD CONSTRAINT reality_checks_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: route_cache route_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_cache
    ADD CONSTRAINT route_cache_pkey PRIMARY KEY (id);


--
-- Name: tripadvisor_data tripadvisor_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tripadvisor_data
    ADD CONSTRAINT tripadvisor_data_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: verification_requests verification_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_pkey PRIMARY KEY (id);


--
-- Name: vibe_analysis vibe_analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vibe_analysis
    ADD CONSTRAINT vibe_analysis_pkey PRIMARY KEY (id);


--
-- Name: weather_cache weather_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_cache
    ADD CONSTRAINT weather_cache_pkey PRIMARY KEY (id);


--
-- Name: weather_forecast weather_forecast_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_forecast
    ADD CONSTRAINT weather_forecast_pkey PRIMARY KEY (id);


--
-- Name: youtube_channels youtube_channels_channel_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_channels
    ADD CONSTRAINT youtube_channels_channel_id_unique UNIQUE (channel_id);


--
-- Name: youtube_channels youtube_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_channels
    ADD CONSTRAINT youtube_channels_pkey PRIMARY KEY (id);


--
-- Name: youtube_place_mentions youtube_place_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_place_mentions
    ADD CONSTRAINT youtube_place_mentions_pkey PRIMARY KEY (id);


--
-- Name: youtube_videos youtube_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_videos
    ADD CONSTRAINT youtube_videos_pkey PRIMARY KEY (id);


--
-- Name: youtube_videos youtube_videos_video_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_videos
    ADD CONSTRAINT youtube_videos_video_id_unique UNIQUE (video_id);


--
-- Name: crisis_alerts crisis_alerts_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crisis_alerts
    ADD CONSTRAINT crisis_alerts_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: gemini_web_search_cache gemini_web_search_cache_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gemini_web_search_cache
    ADD CONSTRAINT gemini_web_search_cache_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: gemini_web_search_cache gemini_web_search_cache_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gemini_web_search_cache
    ADD CONSTRAINT gemini_web_search_cache_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: instagram_hashtags instagram_hashtags_linked_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_hashtags
    ADD CONSTRAINT instagram_hashtags_linked_city_id_cities_id_fk FOREIGN KEY (linked_city_id) REFERENCES public.cities(id) ON DELETE SET NULL;


--
-- Name: instagram_hashtags instagram_hashtags_linked_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_hashtags
    ADD CONSTRAINT instagram_hashtags_linked_place_id_places_id_fk FOREIGN KEY (linked_place_id) REFERENCES public.places(id) ON DELETE SET NULL;


--
-- Name: instagram_locations instagram_locations_linked_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_locations
    ADD CONSTRAINT instagram_locations_linked_city_id_cities_id_fk FOREIGN KEY (linked_city_id) REFERENCES public.cities(id) ON DELETE SET NULL;


--
-- Name: instagram_locations instagram_locations_linked_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_locations
    ADD CONSTRAINT instagram_locations_linked_place_id_places_id_fk FOREIGN KEY (linked_place_id) REFERENCES public.places(id) ON DELETE SET NULL;


--
-- Name: instagram_photos instagram_photos_hashtag_id_instagram_hashtags_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_photos
    ADD CONSTRAINT instagram_photos_hashtag_id_instagram_hashtags_id_fk FOREIGN KEY (hashtag_id) REFERENCES public.instagram_hashtags(id) ON DELETE CASCADE;


--
-- Name: instagram_photos instagram_photos_location_id_instagram_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_photos
    ADD CONSTRAINT instagram_photos_location_id_instagram_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.instagram_locations(id) ON DELETE CASCADE;


--
-- Name: itineraries itineraries_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: itineraries itineraries_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: itinerary_items itinerary_items_itinerary_id_itineraries_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_items
    ADD CONSTRAINT itinerary_items_itinerary_id_itineraries_id_fk FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: itinerary_items itinerary_items_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_items
    ADD CONSTRAINT itinerary_items_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: naver_blog_posts naver_blog_posts_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naver_blog_posts
    ADD CONSTRAINT naver_blog_posts_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: naver_blog_posts naver_blog_posts_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naver_blog_posts
    ADD CONSTRAINT naver_blog_posts_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_data_sources place_data_sources_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_data_sources
    ADD CONSTRAINT place_data_sources_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_prices place_prices_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_prices
    ADD CONSTRAINT place_prices_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: place_prices place_prices_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_prices
    ADD CONSTRAINT place_prices_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: places places_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: reality_checks reality_checks_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reality_checks
    ADD CONSTRAINT reality_checks_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: route_cache route_cache_destination_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_cache
    ADD CONSTRAINT route_cache_destination_place_id_places_id_fk FOREIGN KEY (destination_place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: route_cache route_cache_origin_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_cache
    ADD CONSTRAINT route_cache_origin_place_id_places_id_fk FOREIGN KEY (origin_place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: tripadvisor_data tripadvisor_data_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tripadvisor_data
    ADD CONSTRAINT tripadvisor_data_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: tripadvisor_data tripadvisor_data_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tripadvisor_data
    ADD CONSTRAINT tripadvisor_data_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: verification_requests verification_requests_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vibe_analysis vibe_analysis_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vibe_analysis
    ADD CONSTRAINT vibe_analysis_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: weather_cache weather_cache_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_cache
    ADD CONSTRAINT weather_cache_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: weather_forecast weather_forecast_city_id_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_forecast
    ADD CONSTRAINT weather_forecast_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;


--
-- Name: youtube_place_mentions youtube_place_mentions_place_id_places_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_place_mentions
    ADD CONSTRAINT youtube_place_mentions_place_id_places_id_fk FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE SET NULL;


--
-- Name: youtube_place_mentions youtube_place_mentions_video_id_youtube_videos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_place_mentions
    ADD CONSTRAINT youtube_place_mentions_video_id_youtube_videos_id_fk FOREIGN KEY (video_id) REFERENCES public.youtube_videos(id) ON DELETE CASCADE;


--
-- Name: youtube_videos youtube_videos_channel_id_youtube_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_videos
    ADD CONSTRAINT youtube_videos_channel_id_youtube_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.youtube_channels(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


