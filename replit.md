# VibeTrip - AI Travel Agent App

## Overview
VibeTrip is a hyper-personalized AI travel agent Expo mobile app that transforms user emotions (Vibe) into optimized itineraries. It analyzes destinations using multi-source data and Gemini Vision for intelligent recommendations, aiming to provide a unique and tailored travel planning experience. The core algorithm calculates a "Final Score" based on Vibe, Buzz, Taste, and a Reality Penalty, ensuring relevant and enjoyable recommendations.

## User Preferences
- Korean language interface
- Mobile-first design
- Data-first architecture (3+ sources per category)

## System Architecture
VibeTrip is built as an Expo (React Native) mobile application with a React Navigation 7 and TanStack Query frontend. The backend uses Express and TypeScript with Drizzle ORM and PostgreSQL (Neon) for the database. AI capabilities are powered by Gemini 3.0 Flash via Replit AI Integrations.

The core recommendation engine relies on a **two-tier priority weighting system**:

### 스코어링 공식
`Final Score = Base × CurationFocusMatch × VibeMatch + StyleBonus - RealityPenalty`

### 1순위: Curation Focus (누구를 위한) - 0.3~1.5 배수
사용자가 선택한 "누구를 위한"이 최우선 필터:
- **아이(Kids)**: 아이 친화적 장소 보너스, 바/술집 등 부적합 장소 70% 감점
- **부모님(Parents)**: 접근성/편안함 중심, 계단/도보 많은 곳 70% 감점
- **모두(Everyone)**: 균형 잡힌 추천
- **나(Self)**: 개인 취향 반영

### 2순위: Vibe (무엇을) - 0.5~1.5 배수
선택 순서에 따른 가중치:
- 1개 선택: 100%
- 2개 선택: 60% / 40%
- 3개 선택: 50% / 30% / 20%

### Base Score 구성
- **Vibe Score**: Uses Gemini Vision for visual appeal analysis of photos.
- **Buzz Score**: Aggregates popularity from multiple sources (Google, TripAdvisor).
- **Taste Verify Score**: An original algorithm based on language-based authenticity from reviews, expert ratings, and global averages.
- **Reality Penalty**: Adjusts scores based on real-world factors like weather, safety, and crowd conditions.

The application also features a persona system (e.g., Luxury, Comfort) to tailor recommendations further, with corresponding UI accents.

UI/UX design adheres to a specific system including Gemini Blue (#4285F4) primary color, iOS 26 liquid glass effects with transparent glass-style tab bar, and a 4-tab bottom navigation. The app uses a "Value First" approach where TripPlannerScreen is the first screen - users can input trip preferences without login, authentication only required when clicking "일정 생성" button.

The backend provides a comprehensive set of API endpoints for managing cities, places, recommendations, itinerary generation, and optimization. An Admin Dashboard is available for managing API services, data sources (YouTube, blogs), data freshness, sync logs, guide prices, and verification requests.

### 전문가 검증 시스템
사용자가 AI 생성 일정을 파리 현지 35년 경력 가이드에게 검증 요청할 수 있는 기능:
- **verification_requests 테이블**: 검증 요청 저장 (itineraryData, userMessage, status, adminComment)
- **상태 흐름**: pending → in_review → verified/rejected
- **프론트엔드**: 일정 결과 화면 하단 "현지 전문가 검증" 버튼 → 모달 폼
- **Admin Dashboard**: "검증 요청" 탭에서 요청 관리, 상태 변경, 코멘트 작성
- **마케팅 퍼널**: 무료 AI 일정 → 검증 요청 → 가이드 서비스 연결

## External Dependencies
- **AI**: Gemini 3.0 Flash (via Replit AI Integrations)
- **Mapping & Places**: Google Maps API, Google Places API
- **Weather**: OpenWeather API
- **Database**: PostgreSQL (Neon)
- **Data Sources**: TripAdvisor, Klook, Viator, Naver Search API, YouTube Data API v3