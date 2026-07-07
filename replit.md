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

## `git push` 자동화 — 최종 결정 (확정, 앞으로 재검토 불필요)
- 여러 태스크(#10, #11, #13)에서 반복 확인됨: 격리된 task-agent 컨테이너에서 `origin`(GitHub 연결됨)으로 `git push`를 실행하면 **항상 401 인증 오류**로 실패함. GitHub 연결을 재연결해도 동일하게 실패함.
- 원인: Replit의 `replit-git-askpass` 헬퍼가 사용자의 **살아있는 브라우저 세션**에 떠 있는 로컬 릴레이(포트 8284)를 통해 GitHub OAuth 토큰을 가져오는데, 이 릴레이는 백그라운드 task-agent 컨테이너의 네트워크에서 접근 불가능함. 자세한 내용: `.agents/memory/github-push-requires-live-session.md`
- PAT(Personal Access Token)를 시크릿으로 저장해 자동 푸시를 구성하는 방안도 검토했으나 **채택하지 않음** — agent(main/task 모두)는 `.git`/remote 설정 변경 같은 git 작업 자체가 플랫폼 정책상 금지되어 있어(버전 관리는 플랫폼이 전담), 토큰 기반 credential helper를 agent가 직접 구성/실행하는 것 자체가 불가능함.
- **최종 결정**: `git push`(GitHub `origin`으로의 최종 푸시)는 **항상 사용자가 Replit Git 탭에서 직접 클릭**해야 함. 앞으로 어떤 태스크에도 "GitHub에 푸시까지 완료" 를 자동화 목표로 넣지 말 것 — task agent는 로컬 merge/rebase, diff 확인, 빌드/재시작, 검증까지만 수행하고, 마지막 푸시는 항상 사용자에게 안내하고 넘긴다.
- 이 결정은 재조사 없이 그대로 따를 것. 새로운 Replit 플랫폼 기능(예: 서버사이드 PAT 연동)이 생기기 전까지는 유효함.

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

## ⚠️ 백엔드 변경 시 server:build 필수 (확정, 절대 빠뜨리지 말 것)

- `.replit` run 설정: `["node", "server_dist/index.js"]` → **운영은 TypeScript 소스가 아닌 esbuild 번들을 실행**
- `server/*.ts` 변경 후 `npm run server:build`를 실행하지 않으면 운영에 반영되지 않음
- **동기화 사이클 표준 순서**:
  1. `git diff --stat` 로 변경 파일 확인
  2. `server/` 변경 있으면 → `npm run server:build` (항상)
  3. `client/` / `app.json` / `package.json` 변경 있으면 → `npx expo export --platform web`
  4. 빌드 후 grep으로 핵심 심볼 존재 확인
  5. Start application 재시작 → Start Frontend 재시작 (순서 엄수)
- "백엔드만 변경이라 빌드 불필요"는 **틀린 판단** — server:build는 항상 필요

## Deployment
- Build: `npm run server:build && npx expo export --platform web`
- Run: `node server_dist/index.js`
- Target: Autoscale

## Recent Changes
- 2026-02-24: Initial Replit setup - configured port 5000, CORS for Replit proxy, cache headers, PostgreSQL database, deployment config
- 2026-04-13: Expo Go Replit 표준화 — app.config.js 삭제, serveExpoManifest() 제거, EXPO_PUBLIC_DOMAIN 설정, REACT_NATIVE_PACKAGER_HOSTNAME=*.expo.sisko.replit.dev 고정, 워크플로우 명령어 확정
- 2026-04-26: Expo Go 커맨드 재확정 — REACT_NATIVE_PACKAGER_HOSTNAME → EXPO_PACKAGER_PROXY_URL 전환 (포트 자동화 원칙: Metro가 :8081 강제 부착하는 구식 방식 폐기, Replit 프록시 자동 라우팅으로 일원화)
- 2026-07-04: `git push` 자동화 최종 결정 — PAT 기반 자동 푸시는 채택하지 않고, 최종 GitHub 푸시는 항상 사용자가 Git 탭에서 직접 수행하는 것으로 확정 (task agent는 로컬 merge/빌드/검증까지만 담당)
