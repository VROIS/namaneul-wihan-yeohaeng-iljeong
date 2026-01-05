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
- **AI**: Gemini 3.0 Flash via Replit AI Integrations

## API Endpoints
- `GET /api/cities` - List all cities
- `GET /api/cities/:id/places` - Get places in a city
- `GET /api/cities/:id/recommendations` - AI-powered recommendations
- `POST /api/sync/city/:id/places` - Sync Google Places data
- `POST /api/sync/city/:id/scores` - Calculate all scores
- `POST /api/routes/generate` - **NEW** Generate personalized itinerary from form data
- `POST /api/routes/optimize` - Optimize travel route
- `GET /api/health` - Health check

## Required API Keys (Optional)
- `GOOGLE_MAPS_API_KEY` - For Google Places and Routes API
- `OPENWEATHER_API_KEY` - For weather data

## 프로젝트 문서
- `docs/PRD.md` - 제품 요구사항 정의서
- `docs/TRD.md` - 기술 요구사항 정의서
- `docs/TASK.md` - 개발 태스크 및 로드맵
- `docs/USER_INPUT.md` - 사용자 입력 요소 정의

## Design Guidelines
See `design_guidelines.md` for complete design system including:
- Purple-pink gradient primary colors
- iOS 26 liquid glass effects
- 4-tab bottom navigation with FAB
- Vibe score badges (purple 8+, orange 5-7, gray <5)

## Recent Changes
- 2026-01-05: TASK.md 대폭 확장 (문서 작업)
  - **1.1.1 목적지 입력 시스템**: 경로 빌더 UX (Google Maps 스타일), 인터랙티브 지도 선택, AI 경로 추천
  - **목적지 유형 확장**: 단일 도시, 국가 일주, 다국가 투어, 지역 투어 지원
  - **환율 시스템**: 실시간 환율, KRW 디폴트, 150+ 통화 지원, 일별 예산 환산
  - **1.4.1 경쟁사 Gap 분석**: VibeTrip 3대 차별화 포인트 정의
  - **데이터 신선도 경고**: 수집 시점 표시, 30일 경과 시 경고, 사용자 재수집 요청 기능
  - **블로그 소스 DB 스키마**: blog_sources 테이블, trust_weight 가중치 시스템
- 2026-01-03: Backend API connection for itinerary generation
  - Upgraded all Gemini models to gemini-3.0-flash (latest)
  - Created /api/routes/generate endpoint for personalized itinerary generation
  - Implemented itinerary-generator.ts service with:
    - Google Places API integration (with Gemini fallback)
    - Slot-based scheduling (morning/lunch/afternoon/evening)
    - Vibe weight calculation with protagonist adjustments
  - Connected TripPlannerScreen to real API (replaced mock data)
- 2026-01-03: Fixed "Invalid hook call" error on web platform
  - Replaced custom useTheme hook with direct useColorScheme usage across all components
  - Updated ThemedText, ThemedView, Button, Card, all screen components
  - Fixed web compatibility issues with React Navigation
- 2026-01-03: Initial data pipeline and UI implementation
  - Database schema with 15+ tables
  - All core services (Google Places, Weather, Vibe, Taste, Route, Scoring)
  - VibeTrip UI with Discover, Map, Plan, Profile screens
  - App icon generated with purple-pink gradient

## Technical Notes
- **IMPORTANT**: Do not use custom useTheme hook on web platform - causes "Invalid hook call" error
- Use `useColorScheme` from 'react-native' directly with `Colors[colorScheme ?? "light"]` pattern
- Shadow styles deprecated on web - use boxShadow instead
- props.pointerEvents deprecated - use style.pointerEvents instead

## User Preferences
- Korean language interface
- Mobile-first design
- Data-first architecture (3+ sources per category)
