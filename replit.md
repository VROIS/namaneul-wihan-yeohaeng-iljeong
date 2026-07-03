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

## 빌드/재시작 자동화 — 적용 범위 한정 (중요, 정정됨)
- `scripts/post-merge.sh`와 `.replit`의 `[postMerge]` 설정(`scriptPath`, `timeoutMs`)은 준비되어 있으나, **Replit 공식 문서 기준으로 이 훅은 Replit "Task 시스템"(Agent가 격리 환경에서 작업 후 승인을 거쳐 main에 반영하는 방식)에만 자동 실행이 보장됨**
- **이 프로젝트는 외부(Cursor 등)에서 작업 후 GitHub에 푸시 → Replit 화면의 Git 탭 Pull/Sync 버튼으로 가져오는 방식**을 사용 중이며, 이 경로에서 `[postMerge]` 훅이 자동 실행된다는 근거는 문서에 없음 (미확인)
- Git 레벨 `post-merge` 훅 설치도 시도했으나, **main agent는 `.git` 내부(config, hooks) 수정이 플랫폼에 의해 차단됨** ("destructive git operation") → 이 경로로도 우회 불가
- **결론**: 신규 커밋을 Pull한 뒤에는 여전히 사용자가 Agent에게 알려야 하며, 그 다음부터 diff 확인 → 조건부 빌드(`npm run server:build` / `npx expo export --platform web`) → 워크플로우 재시작(순서: Start application → Start Frontend) → 검증 → `suggest_deploy` 안내는 Agent가 빠르게 처리
- 배포(Publish) 버튼 클릭은 항상 사용자가 직접 수행해야 함 (Agent 대행 불가)

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
