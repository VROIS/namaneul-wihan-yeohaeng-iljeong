# VibeTrip - AI Travel Agent App

## Overview
VibeTrip is a hyper-personalized AI travel agent Expo mobile app that transforms user emotions (Vibe) into optimized itineraries. It analyzes destinations using multi-source data and Gemini Vision for intelligent recommendations, aiming to provide a unique and tailored travel planning experience. The core algorithm calculates a "Final Score" based on Vibe, Buzz, Taste, and a Reality Penalty, ensuring relevant and enjoyable recommendations.

## User Preferences
- Korean language interface
- Mobile-first design
- Data-first architecture (3+ sources per category)

## System Architecture
VibeTrip is built as an Expo (React Native) mobile application with a React Navigation 7 and TanStack Query frontend. The backend uses Express and TypeScript with Drizzle ORM and PostgreSQL (Neon) for the database. AI capabilities are powered by Gemini 3.0 Flash via Replit AI Integrations.

The core recommendation engine relies on a proprietary scoring system: `Final Score = (Vibe + Buzz + Taste) - Reality Penalty`.
- **Vibe Score**: Uses Gemini Vision for visual appeal analysis of photos.
- **Buzz Score**: Aggregates popularity from multiple sources (Google, TripAdvisor).
- **Taste Verify Score**: An original algorithm based on language-based authenticity from reviews, expert ratings, and global averages.
- **Reality Penalty**: Adjusts scores based on real-world factors like weather, safety, and crowd conditions.

The application also features a persona system (e.g., Luxury, Comfort) to tailor recommendations further, with corresponding UI accents.

UI/UX design adheres to a specific system including a purple-pink gradient, iOS 26 liquid glass effects, a 4-tab bottom navigation with a Floating Action Button (FAB), and color-coded Vibe score badges.

The backend provides a comprehensive set of API endpoints for managing cities, places, recommendations, itinerary generation, and optimization. An Admin Dashboard is available for managing API services, data sources (YouTube, blogs), data freshness, sync logs, and seeding default data.

## External Dependencies
- **AI**: Gemini 3.0 Flash (via Replit AI Integrations)
- **Mapping & Places**: Google Maps API, Google Places API
- **Weather**: OpenWeather API
- **Database**: PostgreSQL (Neon)
- **Data Sources**: TripAdvisor, Klook, Viator, Naver Search API, YouTube Data API v3