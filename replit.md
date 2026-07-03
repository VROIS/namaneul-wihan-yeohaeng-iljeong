# TRIPIS - AI Travel App

## Overview
TRIPIS (TRIP + JARVIS) is a React Native/Expo travel application with an Express backend. It provides AI-powered travel planning features, including place recommendations, weather info, exchange rates, and more. The app targets Korean-speaking users.

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

## 고정 도메인 (절대 변경 금지)

| 용도 | 고정 URL |
|------|----------|
| Express 백엔드 (port 5000) | `https://828b2285-99c5-4cc9-9bcd-a09cdff531bc-00-kzvu1v5xhevl.sisko.replit.dev` |
| **Expo Go 연결 (부모 도메인)** | `828b2285-99c5-4cc9-9bcd-a09cdff531bc-00-kzvu1v5xhevl.expo.sisko.replit.dev` |

- `REPLIT_EXPO_DEV_DOMAIN` 환경변수에서 확인 가능 (Replit이 자동 제공)
- Expo Go QR 코드: `exp://828b2285-99c5-4cc9-9bcd-a09cdff531bc-00-kzvu1v5xhevl.expo.sisko.replit.dev:8081`

## 자동 빌드/재시작 (Post-Merge Automation)
- 신규 커밋이 main에 merge되면 `scripts/post-merge.sh`가 **플랫폼에 의해 자동 실행**됨 (Agent 수동 개입 불필요)
- 스크립트 동작: `npm install` → `.local/last_built_sha`와 현재 HEAD diff → `server/`,`shared/` 변경 시 `npm run server:build` / `client/`,`assets/`,`app.json` 변경 시 `npx expo export --platform web` → 빌드된 SHA 기록
- 이후 플랫폼의 워크플로우 reconciliation이 실행 중인 워크플로우를 자동 재시작
- 설정: `.replit`의 `[postMerge]` 섹션 (`scriptPath = "scripts/post-merge.sh"`, `timeoutMs = 180000`)
- **남은 수동 단계**: 실제 배포(Publish) 버튼 클릭은 플랫폼 정책상 사용자가 직접 눌러야 함 (Agent가 대신 배포 불가) — Agent는 `suggest_deploy`로 안내만 가능
- 실패 시 Agent가 자동으로 알림을 받아 조치함 (`post_merge_setup` 스킬 참조)

## Development Workflow
- Backend: `npx tsx server/index.ts` (starts Express server on port 5000)
- Frontend (Expo Go): 아래 워크플로우 명령어 참조
- Frontend web build: `npx expo export --platform web`
- The server serves the Expo web build from `/dist` and API routes under `/api`

## ⚠️ Expo Go / Replit 절대 금지 사항 (수정 시 반드시 사전 승인)

아래 설정은 검증된 고정 표준입니다. 변경 시 Expo Go 연결이 즉시 깨집니다.

### 1. `app.config.js` 금지
- **FORBIDDEN** — Replit 공식 문서 명시 금지
- 설정은 `app.json`과 `EXPO_PUBLIC_DOMAIN` 환경변수로 관리

### 2. 워크플로우 명령어 (고정 — 절대 변경 금지)
```
EXPO_PACKAGER_PROXY_URL=https://828b2285-99c5-4cc9-9bcd-a09cdff531bc-00-kzvu1v5xhevl.expo.sisko.replit.dev npx expo start
```
- `EXPO_PACKAGER_PROXY_URL` = Replit 프록시 URL (https 포함, 포트 없음)
- Metro가 `exp://...expo.sisko.replit.dev` (포트 없음) 를 생성 → Replit 자동 라우팅
- `REACT_NATIVE_PACKAGER_HOSTNAME` 단독 사용 금지 — Metro가 `:8081` 강제 부착 → 프록시 끊김
- `CI=1` 추가 금지 (HMR 비활성화됨)
- `--tunnel` 추가 금지 (ngrok 불필요, Replit이 직접 노출)
- `--go` 추가 금지 (iOS 앱 멈춤)
- `--clear` 추가 금지 (캐시 충돌)
- `:8081` 포트 명시 금지 (QR 접속 끊김)
- 두 워크플로 동시 재시작 금지 (Metro FallbackWatcher ENOENT 크래시)

### 3. Express에서 네이티브 manifest 서빙 금지
- Expo Go는 Metro(port 8081)에 직접 연결
- `serveExpoManifest()` 함수 및 관련 미들웨어 복원 금지

### 4. API URL: `EXPO_PUBLIC_DOMAIN` 환경변수 (고정)
- 값: `https://828b2285-99c5-4cc9-9bcd-a09cdff531bc-00-kzvu1v5xhevl.sisko.replit.dev`
- `client/lib/query-client.ts`에서 `Constants.expoConfig?.extra?.apiDomain` 폴백 복원 금지

## Deployment
- Build: `npm run server:build && npx expo export --platform web`
- Run: `node server_dist/index.js`
- Target: Autoscale

## Recent Changes
- 2026-02-24: Initial Replit setup - configured port 5000, CORS for Replit proxy, cache headers, PostgreSQL database, deployment config
- 2026-04-13: Expo Go Replit 표준화 — app.config.js 삭제, serveExpoManifest() 제거, EXPO_PUBLIC_DOMAIN 설정, REACT_NATIVE_PACKAGER_HOSTNAME=*.expo.sisko.replit.dev 고정, 워크플로우 명령어 확정
- 2026-04-26: Expo Go 커맨드 재확정 — REACT_NATIVE_PACKAGER_HOSTNAME → EXPO_PACKAGER_PROXY_URL 전환 (포트 자동화 원칙: Metro가 :8081 강제 부착하는 구식 방식 폐기, Replit 프록시 자동 라우팅으로 일원화)
