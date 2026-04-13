# NUBI (누비) - AI Travel App

## Overview
NUBI is a React Native/Expo travel application with an Express backend. It provides AI-powered travel planning features, including place recommendations, weather info, exchange rates, and more. The app targets Korean-speaking users.

## Project Architecture
- **Frontend**: React Native (Expo) with web export, served as static files from `/dist`
- **Backend**: Express.js (TypeScript) serving both API routes and the web frontend
- **Database**: PostgreSQL via Drizzle ORM
- **Build**: `esbuild` for server bundle, `expo export --platform web` for frontend

### Directory Structure
- `client/` - React Native/Expo frontend code
- `server/` - Express backend (API routes, services, data scheduler)
- `shared/` - Shared schema and models (Drizzle schema)
- `assets/` - App images and icons
- `dist/` - Built Expo web output (gitignored)
- `server_dist/` - Built server output (gitignored)

## Key Configuration
- **Server Port**: 5000 (set via PORT env var)
- **Database**: PostgreSQL (Replit built-in, accessed via DATABASE_URL)
- **Schema Push**: `npx drizzle-kit push`
- **EXPO_PUBLIC_DOMAIN**: Replit Secrets에 설정 (공개 백엔드 URL, 네이티브 앱 API 연결용)

## Development Workflow
- Backend: `npx tsx server/index.ts` (starts Express server on port 5000)
- Frontend (Expo Go): `npx expo start` (Metro bundler on port 8081, Replit이 직접 노출)
- Frontend web build: `npx expo export --platform web`
- The server serves the Expo web build from `/dist` and API routes under `/api`

## ⚠️ Expo Go / Replit 절대 금지 사항 (수정 시 반드시 사전 승인)

아래 설정은 Replit 공식 문서 기준으로 확정된 표준입니다. 변경 시 Expo Go 연결이 즉시 깨집니다.

### 1. `app.config.js` 금지
- **FORBIDDEN** — Replit 공식 문서 명시 금지
- 파일이 존재하면 즉시 삭제할 것
- 설정은 `app.json`과 `EXPO_PUBLIC_DOMAIN` 환경변수로 관리

### 2. 워크플로우 명령어: `npx expo start` (고정)
- **금지**: `CI=1 npx expo start --tunnel` (CI=1은 HMR 비활성화, --tunnel은 불필요)
- Replit은 port 8081을 직접 노출하므로 ngrok/tunnel 불필요
- `EXPO_TOKEN` 시크릿이 설정되어 있어 로그인 프롬프트 없이 실행

### 3. Express에서 네이티브 manifest 서빙 금지
- Expo Go는 Metro(port 8081)에 직접 연결
- Express(port 5000)에서 Expo manifest를 서빙하는 코드는 제거됨
- `serveExpoManifest()` 함수 및 관련 미들웨어 복원 금지

### 4. API URL: `EXPO_PUBLIC_DOMAIN` 환경변수 (고정)
- Metro 번들러가 빌드 시 앱에 인라인 주입
- `client/lib/query-client.ts`에서 `Constants.expoConfig?.extra?.apiDomain` 폴백 코드 복원 금지
- 현재 값: Replit 개발 도메인 (shared 환경변수로 저장)

## Deployment
- Build: `npm run server:build && npx expo export --platform web`
- Run: `node server_dist/index.js`
- Target: Autoscale

## Recent Changes
- 2026-02-24: Initial Replit setup - configured port 5000, CORS for Replit proxy, cache headers, PostgreSQL database, deployment config
- 2026-04-13: Expo Go Replit 표준화 — app.config.js 삭제, 워크플로우 npx expo start로 변경, serveExpoManifest() 제거, EXPO_PUBLIC_DOMAIN 환경변수 설정
