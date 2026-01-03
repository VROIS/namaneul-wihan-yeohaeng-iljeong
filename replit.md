# VibeTrip - AI Travel Agent App

## Overview
VibeTrip is a hyper-personalized AI travel agent Expo mobile app that transforms user emotions (Vibe) into optimized itineraries. The app analyzes destinations using multi-source data and Gemini Vision for intelligent recommendations.

## Current State
- **Backend**: Complete data pipeline with Google Places, Weather, Vibe Processing, Taste Verification, Route Optimization, and Scoring services
- **Frontend**: VibeTrip UI with 4-tab navigation (Discover, Map, Plan FAB, Profile), iOS 26 liquid glass design

## Core Algorithm
**Final Score = (Vibe + Buzz + Taste) - Reality Penalty**

### Score Components
- **Vibe Score** (0-10): Gemini Vision analysis of photos for visual appeal, composition, lighting
- **Buzz Score** (0-10): Multi-source popularity (Google, TripAdvisor, review volume)
- **Taste Verify Score** (0-10): Original Taste Verification using language-based authenticity
  - W1 (50%): Originator language reviews (Korean for Korean food, etc.)
  - W2 (30%): Expert/Michelin ratings
  - W3 (20%): Global average ratings
- **Reality Penalty** (0-5): Weather, safety, crowd conditions

### Persona System
- **Luxury** (gold accent): Time-saving, photogenic, premium experiences
- **Comfort** (blue accent): Safety-first, verified dining, energy conservation

## Tech Stack
- **Frontend**: Expo (React Native), React Navigation 7, TanStack Query
- **Backend**: Express, TypeScript, Drizzle ORM
- **Database**: PostgreSQL (Neon)
- **AI**: Gemini 2.5 Flash via Replit AI Integrations

## API Endpoints
- `GET /api/cities` - List all cities
- `GET /api/cities/:id/places` - Get places in a city
- `GET /api/cities/:id/recommendations` - AI-powered recommendations
- `POST /api/sync/city/:id/places` - Sync Google Places data
- `POST /api/sync/city/:id/scores` - Calculate all scores
- `POST /api/routes/optimize` - Optimize travel route
- `GET /api/health` - Health check

## Required API Keys (Optional)
- `GOOGLE_MAPS_API_KEY` - For Google Places and Routes API
- `OPENWEATHER_API_KEY` - For weather data

## Design Guidelines
See `design_guidelines.md` for complete design system including:
- Purple-pink gradient primary colors
- iOS 26 liquid glass effects
- 4-tab bottom navigation with FAB
- Vibe score badges (purple 8+, orange 5-7, gray <5)

## Recent Changes
- 2026-01-03: Initial data pipeline and UI implementation
  - Database schema with 15+ tables
  - All core services (Google Places, Weather, Vibe, Taste, Route, Scoring)
  - VibeTrip UI with Discover, Map, Plan, Profile screens
  - App icon generated with purple-pink gradient

## User Preferences
- Korean language interface
- Mobile-first design
- Data-first architecture (3+ sources per category)
