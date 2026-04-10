# Overview

"내손가이드" (My Hand Guide) is a location-based travel guide application that enables users to create, manage, and share personalized travel guides. It utilizes Google's Gemini AI for automatic content generation, including descriptions and cultural insights, from user-uploaded photos and GPS data. The application aims to provide an intuitive platform for organizing travel memories into shareable, mobile-optimized guides with AI-powered content.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Design
The application is a mobile-first, responsive Single-Page Application (SPA) built with Vanilla JavaScript, manual DOM manipulation, and Tailwind CSS (via CDN). It incorporates Progressive Web App (PWA) features for a native-like experience, featuring a brand identity around Gemini Blue and the MaruBuri font.

## Technical Implementation
### Frontend
Built with Vanilla JavaScript, it uses IndexedDB for local storage and direct DOM manipulation.
### Backend
An Express.js server (TypeScript) handles API requests, using Drizzle ORM for PostgreSQL. Authentication is managed via Replit Authentication (OpenID Connect) with PostgreSQL session storage, and Multer for image uploads. ESBuild bundles the server-side code.
### Database
PostgreSQL, managed by Drizzle ORM, stores users, travel guides, share links, and authentication sessions. Guide data is also embedded in HTML files for offline access.
### AI Integration
Google Gemini AI (Gemini 2.5 Flash) generates multi-language descriptions and tips from images and location data, with image compression (0.9 quality) for efficiency. A dynamic AI prompt management system allows for language-specific and persona-driven AI responses, configurable via an admin dashboard. Prompts are stored in the DB and ensure "text-only" responses to optimize TTS.
### Authentication
Replit Auth and Google OAuth 2.0 (via Passport.js) are used, with sessions stored in PostgreSQL.
### File Upload & Storage
Replit App Storage is used for persistent media files. Shared HTML pages are stored within the PostgreSQL database.
### API Design
A RESTful Express API features shared TypeScript schemas, error handling, authentication middleware, and a short URL system for share links.
### Referral System
A referral program rewards users for sign-ups and referred user top-ups.
### Credit System
Users earn credits for new sign-ups, referrals, QR copies, and sharing. Credits are consumed for AI response generation and share page creation. Unregistered users receive free trials for AI responses.
### Performance Optimization
AI response times target 2-2.5 seconds using optimized models and image compression. A Featured Gallery uses caching.
### Share Feature
Generates short URLs and uses a standard share page template with Microsoft Heami Voice TTS. Share pages are dynamically built from guide data and stored as HTML content in the database. Shared pages support Google Translate integration with TTS playback, waiting for translation completion, and offer offline storage via IndexedDB.
### Admin UI
Provides search, automatic featured ordering, and real-time statistics for shared pages, including AI prompt management.
### Service Workers
`public/service-worker.js` (Cache First) for the main app and `public/sw-share.js` (Network First) for share pages to ensure offline access and always-latest content for shared guides.
### TTS Logic
Prioritizes specific voice names for Korean (Yuna, Sora, Heami) and uses a `voice_configs` table in PostgreSQL for other languages. **Critical: Dynamic content retranslation** - Uses `retranslateNewContent()` function to force Google Translate widget to re-scan dynamically added DOM content before TTS playback. Pattern: toggle `.goog-te-combo` dropdown ('' → currentLang) with 100ms/800ms delays, then read translated `innerText` for TTS. Applied to index.js, share-page.js, guideDetailPage.js, admin-dashboard.html, profile.html, and standard-template.ts (Gallery).

# External Dependencies

## Core Services
-   **Replit Authentication**: User authentication (OpenID Connect).
-   **Google Gemini AI**: AI vision and text generation.
-   **PostgreSQL Database**: Primary data storage.
-   **Replit App Storage**: Cloud object storage for media files.

## Frontend Libraries & APIs
-   **Vanilla JavaScript**: Core development language.
-   **IndexedDB**: Local data storage for offline capabilities.
-   **Tailwind CSS**: Utility-first CSS framework (via CDN).
-   **Web APIs**: Speech Synthesis, Media Recorder, Geolocation, Camera.

## Backend Dependencies
-   **Express.js**: Web application framework.
-   **Drizzle ORM**: PostgreSQL database toolkit.
-   **Passport.js**: Authentication middleware.
-   **Multer**: Handles `multipart/form-data`.
-   **@google-cloud/storage**: Replit App Storage client.
-   **OpenID Client**: OpenID Connect client library.
-   **connect-pg-simple**: PostgreSQL session store.

# Debugging & Troubleshooting

## Debug Code Backup
`docs/debug-code-backup.md` contains reusable debugging code for language/translation issues:
- Mobile debug box (visual on-screen debugger)
- Language initialization logs
- Google Translate debugging

## Language Settings (2026-01-22)
- **localStorage only** - No DB sync, localStorage.appLanguage is the single source of truth
- **Device language detection** - Used only if localStorage is empty (not saved)
- **One-time reset** - langResetDone v2 flag clears old 'fr' values
- **TTS auto-config** - Based on localStorage.appLanguage (ko → ko-KR, fr → fr-FR)

## Critical Bug Fixes (2026-02-01)

### 1. AI 호출 시 크레딧 차감 버그 (2025-12-11 ~ 2026-02-01)
- **증상**: AI 호출해도 크레딧이 차감되지 않음
- **원인**: `/api/gemini` 엔드포인트에서 `req.user?.id`가 항상 undefined
- **수정**: `server/routes.ts` 라인 229 - `req.user?.id || req.session?.passport?.user`로 변경
- **영향**: 약 1.5개월간 무료 AI 사용 가능했음

### 2. 프로모션 크레딧 이중지급 (43명 × 280 크레딧)
- **증상**: 신규 가입자가 140 대신 280 크레딧 수령
- **원인**: `signup_bonus(140)` + `promo_bonus_2026(140)` 중복 지급
- **수정**: `server/creditService.ts` - signup_bonus 받은 사용자는 promo_bonus 제외 로직 추가
- **DB 조치**: 배포본에서 promo_bonus_2026 삭제 + 모든 사용자 100 크레딧으로 초기화

### 3. 크레딧 부족 시 처리 추가
- **수정 위치**: `public/geminiService.js` 라인 143-148
- **동작**: 402 응답 시 alert 표시 후 `/profile.html`로 리다이렉트

### 4. API 호출 로깅 추가 (2026-02-01)
- **목적**: 정확한 AI 호출 횟수 추적 (저장 안 한 1회성 열람 포함)
- **구현**: `/api/gemini` 호출마다 `api_logs` 테이블에 기록
- **기록 항목**: 시간, 사용자ID, 응답시간(ms), 성공여부, 추정비용($0.015/call)
- **대시보드 연동**: `/api/admin/overview`, `/api/admin/stats`가 `api_logs`에서 실시간 데이터 조회
- **과거 데이터**: 버그 기간(2025-12-11~2026-02-01) AI 호출은 추적 불가 (api_logs 비어있음)

## Google Play Store 출시 준비 (2026-02-20)

### Android 앱 배포 현황
- **패키지명**: com.sonanie.guide
- **Expo 계정**: vrois (EXPO_TOKEN 설정 완료)
- **AAB 빌드**: 40MB, EAS Build + 로컬 keystore로 빌드 완료
- **keystore 파일**: `mobile-app/keystore.jks`, `mobile-app/credentials.json`
- **스토어 리스팅**: 한국어(ko-KR) 설명, 스크린샷, Feature Graphic 등록 완료
- **내부 테스트**: 승인 및 라이브
- **비공개 테스트 (Alpha)**: 승인 및 라이브, 테스터 2명 등록
- **정식 출시 조건**: 12명 이상 테스터가 14일간 참여 필요
- **테스트 링크**: https://play.google.com/apps/testing/com.sonanie.guide

### 베타 테스터 모집 이메일 발송 (2026-02-20)
- **대상**: 프로덕션 DB 기존 회원 29명 (Gmail 25개 + 교육기관 4개)
- **발송 도구**: Nodemailer + Gmail 앱 비밀번호 (GMAIL_APP_PASSWORD)
- **발송 스크립트**: `scripts/send-beta-emails.cjs`
- **결과**: 29건 전부 성공, 실패 0건
- **이메일 내용**: 베타 테스트 참여 안내 + 무료 100 크레딧 혜택 (기존 가입자는 이미 크레딧 보유)
- **발신자**: dbstour1@gmail.com ("손안의 가이드")

### 종합 점검 결과 (2026-02-20)
- **프로덕션 서버**: 정상 가동, 에러 로그 없음 (독립 VM 배포)
- **데이터베이스**: 14개 테이블 정상, 크레딧 정합성 확인 (2026-02-01 초기화 영향으로 거래내역과 차이 있으나 정상)
- **마이너스 크레딧**: dbstour1@gmail.com (관리자) -68 크레딧 → 관리자는 차감 제외라 문제 없음
- **크레딧 차감 로직**: 정상 작동 확인 (2026-02-01 버그 수정 이후)
- **보안 수정**: `/api/admin/notifications/broadcast`에 `requireAdmin` 인증 추가 (기존에는 인증 없이 누구나 전체 푸시 알림 발송 가능했음)
- **LSP 경고 3건**: Dream Studio 비디오 메타데이터 저장 시 `req.user?.id` 타입 오류 (동작에는 영향 없음)
- **Analytics (지난 2주)**: 58개 고유 IP, 2월 11일 스파이크 (QR 배포로 30명 신규 가입), 응답 대부분 49ms 이하

### 앱 최적화 적용 (2026-03-10)
- **iframe 리다이렉트 수정**: `profile.html`의 `window.location.href` → `window.top.location.href` 일괄 치환 (Stripe, OAuth, mailto 5곳)
- **pendingShareUrl 수정**: `index.js` 4곳에서 `window.open` → `openPageOverlay(addLangToUrl())` 변경
- **openPageOverlay 미래 보호**: iframe `onload` 시 `<base target="_top">` 자동 주입
- **viewport-fit=cover**: index.html, profile.html, standard-template.ts(2곳) 메타태그 추가
- **safe-area CSS**: standard-template.ts `.footer-safe-area` 2곳에 `padding-bottom: env(safe-area-inset-bottom)` 추가 (shorthand 뒤 배치)
- **App.js WebView 설정**: `injectedJavaScript`(safe-area CSS), `mediaCapturePermissionGrantType`, `PermissionsAndroid.requestMultiple()`, `sharedCookiesEnabled`, `thirdPartyCookiesEnabled`
- **app.json 권한**: `android.permissions: ["CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION"]`
- **V1 재생성**: 개발본 39개 완료, 배포본은 배포 후 재실행 필요
- **Stripe 결제 복귀 수정**: success_url/cancel_url을 루트(/)로 변경 → SPA 메인 복귀 → 프로필 오버레이 자동 열기
- **관리자 충전 버튼 수정**: localStorage 기반 isAdmin() 제거 → 서버 API 응답 기반 판단, 관리자도 충전 버튼 표시

### 향후 계획
- Google Play 비공개 테스트 14일 대기 (목표: 2026년 3월 초 정식 출시)
- Apple App Store 출시 검토 중 (Replit 대행 서비스 또는 직접 제출)