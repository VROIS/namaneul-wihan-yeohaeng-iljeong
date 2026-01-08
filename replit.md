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
- `POST /api/routes/generate` - Generate personalized itinerary from form data
- `POST /api/routes/optimize` - Optimize travel route
- `GET /api/health` - Health check

### Admin Dashboard Endpoints
- `GET /admin` - Admin Dashboard UI
- `GET /api/admin/dashboard` - Dashboard overview
- `GET /api/admin/api-services` - API service status
- `POST /api/admin/api-services/init` - Initialize API services
- `GET /api/admin/youtube-channels` - YouTube channel whitelist
- `POST /api/admin/youtube-channels` - Add YouTube channel
- `GET /api/admin/blog-sources` - Blog source whitelist
- `POST /api/admin/blog-sources` - Add blog source
- `GET /api/admin/data-freshness` - Data freshness report
- `GET /api/admin/sync-logs` - Sync history
- `POST /api/admin/seed/defaults` - Seed default YouTube channels and blog sources
- `POST /api/admin/seed/cities` - Seed default cities (15 popular destinations)

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
- 2026-01-08: Instagram 데이터 → VIBE 점수 연동 완료
  - **Buzz Score 반영**: Instagram 해시태그 게시물 수 25% 가중치
    - popularityScore = reviewVolume(30%) + rating(30%) + sourceCount(15%) + **instagram(25%)**
    - trendingScore: 최근 7일 내 10만+ 게시물 해시태그 → 7점 (기본 5점)
    - localBuzzScore: 한국어 해시태그 존재 시 → 7점 (기본 5점)
  - **Vibe Score 반영**: Instagram 사진 Gemini Vision 분석
    - Google Photos (최대 2장) + Instagram Photos (최대 1장) 조합
  - **해시태그 매칭**: 장소명/한국어명으로 관련 해시태그 자동 검색
- 2026-01-08: Instagram 데이터 수집 시스템 완성
  - DB 스키마: instagram_hashtags, instagram_locations, instagram_photos
  - 크롤러: 해시태그/위치 게시물 수 수집, 3초 rate limiting
  - Admin Dashboard: Instagram 탭 추가 (해시태그/위치 CRUD)
- 2026-01-06 02:30 KST: 장기 여행 일정 생성 시스템 완성
  - **경로 최적화**: 지리적 그룹핑 + Nearest-neighbor 알고리즘으로 도시별 연속 일정 배치
  - **장기 여행 지원**: 10일, 11일, 30일 등 장기 여행 완전 지원 (Day 탭 무제한)
  - **장소 생성 개선**: Gemini 장소 부족 시 자동 재시도 메커니즘 추가
  - **Day 탭 UI**: 각 일차에 도시명 표시 (Day 1 파리)
  - **타입 확장**: Place, DayPlan에 city, region 필드 추가
  - **디버깅 로그**: 날짜 계산, 장소 생성 추적 로그 추가
- 2026-01-06: 기본 데이터 시드 시스템 추가
  - **시드 API**: `/api/admin/seed/defaults` (유튜브 채널 10개, 블로그 소스 8개), `/api/admin/seed/cities` (도시 15개)
  - **대시보드 버튼**: API 설정 탭에 "기본 데이터 입력", "기본 도시 입력" 버튼 추가
  - **기본 채널**: 스트릿푸드파이터(2.0), 빠니보틀(1.9), 여행에미치다(1.8), 먹보형제(1.8) 등
  - **기본 도시**: 서울, 도쿄, 오사카, 파리, 로마, 방콕, 뉴욕 등 15개 인기 여행지
- 2026-01-05: Admin Dashboard 구현 완료
  - **DB 스키마 추가**: apiServiceStatus, youtubeChannels, youtubeVideos, blogSources, exchangeRates, dataCollectionSchedule
  - **관리자 API**: 대시보드 현황, API 서비스 관리, YouTube/블로그 화이트리스트, 데이터 신선도 추적
  - **관리자 UI**: `/admin` 경로에서 접근 가능한 웹 대시보드 (서버 포트 5000)
  - **API 서비스 초기화**: Google Places, Maps, OpenWeather, YouTube, Exchange Rate, Gemini 상태 추적
- 2026-01-05: TASK.md 1.2.1, 1.3.1, 1.4.0 상세 계획 추가
  - **1.2.1 Vibe Score 표시**: 점수 배지 UI, 상세 뷰, 홈 화면 Vibe 입력 (5시간)
  - **1.3.1 성능 최적화**: React.memo, FlatList 최적화, expo-image, 페이지네이션 (5시간)
  - **1.4.0 데이터 연동**: API 키 설정, 캐싱, 폴백 로직, 실제 데이터 전환 (7시간)
- 2026-01-05: TASK.md 대폭 확장 (문서 작업)
  - **1.1.1 목적지 입력 시스템**: 경로 빌더 UX (Google Maps 스타일), 인터랙티브 지도 선택, AI 경로 추천 (9시간)
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
