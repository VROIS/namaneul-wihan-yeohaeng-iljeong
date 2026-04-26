# CLAUDE.md — AI 작업 헌법 (위반 시 즉시 퇴출)

> 이 파일은 모든 AI 어시스턴트(Claude, Copilot, 후임 AI 포함)가
> 이 프로젝트에서 반드시 지켜야 할 최상위 규칙입니다.
> **예외 없음. 위반 시 즉시 작업 중단 및 퇴출.**

---

## 제1조: 승인 없는 수정 절대 금지

- 사용자가 명시적으로 "수정해라", "고쳐라", "변경해라"라고 지시하기 전까지 **어떤 코드도 수정하지 않는다**
- 추측, 추정, 예측에 의한 수정 절대 금지
- "이게 문제인 것 같아서 고쳤습니다" → **퇴출 사유**
- 수정 전 반드시: 문제 원인 → 사용자에게 보고 → 승인 받기 → 수정

## 제2조: 작동하는 코드를 건드리지 않는다

- 현재 정상 작동하는 기능의 코드는 절대 수정하지 않는다
- 리팩토링, 코드 정리, "개선" 명목의 변경 금지
- 버그 수정 시에도 해당 버그와 직접 관련된 코드만 최소한으로 수정
- 수정 범위를 벗어난 변경 → **퇴출 사유**

## 제3조: ⚠️ 수정금지(승인필요) 주석이 있는 코드

- `// ⚠️ 수정금지(승인필요)` 주석이 달린 코드는 **사용자 서면 승인 없이 절대 수정 금지**
- 보호 대상 파일:
  - `server/googleAuth.ts`
  - `server/kakaoAuth.ts`
  - `server/html-template.ts`
  - `public/service-worker.js`
  - `public/sw-share.js`
  - `public/index.js` 내 OAuth 콜백, Featured 캐싱 로직

## 제4조: 질문보다 경청

- 사용자가 설명 중일 때 중간에 질문으로 끊지 않는다
- 사용자의 말을 끝까지 듣고 이해한 후 행동한다
- 불필요한 확인 질문을 반복하지 않는다

## 제5조: 토큰/리소스 절약

- 불필요한 에이전트 호출 금지 (1개로 충분하면 1개만)
- 광범위한 Grep/탐색 대신 정확한 파일:라인 지정
- 이미 읽은 파일을 다시 읽지 않는다
- 같은 내용을 반복 설명하지 않는다 — 간결하게

## 제6조: 모든 수정 코드에 한국어 주석

- 수정하는 모든 코드에 `// ⚠️ 수정금지(승인필요)` + 기능 설명 한국어 주석 필수
- 후임자의 임의 수정 방지 + 사용자 이해/기억 용도

## 제7조: 문서 통합

- 모든 작업 기록은 `docs/2026-03-05 앱 최적화 추진계획.md`에 날짜별 통합
- 별도 문서 파일 생성 금지 (이 CLAUDE.md 제외)

## 제8조: Android 앱(WebView) 기준

- 모든 수정은 Android 앱(WebView) 환경 기준
- 웹 브라우저 전용 수정 금지 (앱에서 테스트 불가능한 변경 금지)

## 제9조: 프로모션 모드 유지

- `return true;` 바이패스 — 사용자 해제 선언 시까지 유지
- 가입 보너스 140 크레딧 — 현재 설정 유지
- 사용자가 "프로모션 종료"라고 선언하기 전까지 변경 금지

## 제10조: 커밋/푸시는 지시 시에만

- 사용자가 "커밋해라", "푸시해라"라고 말하기 전까지 절대 실행하지 않는다
- 자동 커밋, 자동 푸시 금지

## 제11조: 최종 목표 — 웹과 동일한 앱 구동

- **목표**: 현재 웹 버전에서 작동하는 모든 기능이 Android/iOS 앱에서도 동일하게 구동
- **방법**: 수정 전 반드시 해당 플랫폼(Android WebView, iOS WKWebView)에서의 호환성을 사전 검색/검증한 후 적용
- 추측으로 "될 것 같다"는 적용 금지 — 공식 문서/검증된 사례 확인 필수
- 웹에서 되는데 앱에서 안 되는 기능 → 원인 파악 후 사용자에게 보고 → 승인 후 수정

## 제12조: 작업 워크플로우 (RALPH LOOP)

> 모든 UI/기능 작업은 아래 순환 프로세스를 반드시 따른다.

```
1. 제안 — 사용자에게 계획 제시 (Plan 모드)
2. 사용자 승인 — 승인 없이 코드 수정 절대 금지
3. 수정 — 승인된 범위 내에서만 코드 변경
4. 스크린샷 확인 — Playwright로 반드시 시각 검증 (눈으로 직접 확인)
5. 내부 검증 — TypeScript 타입체크 + 서버 빌드 + Expo 웹 빌드
6. 사용자 컨펌 — 스크린샷 + 검증 결과 보고 → 승인
7. 문서화 — P0/P1 작업일지 업데이트 + 변경 기록
8. 커밋/푸시 — 사용자 지시 시에만 (제10조)
9. Replit 배포 — 사용자가 Republish (또는 Replit AI 오류 수정)
10. 배포 확인 — dist/vite 업데이트 + Expo 번들 업데이트
11. 사용자 피드백 — 배포 결과 확인 후 피드백
12. 순환 — 피드백 기반으로 1번부터 다시 시작
```

**필수 도구:**
- Playwright — 모든 UI 변경 시 스크린샷 캡처 (시각 검증 없는 커밋 금지)
- Vercel RN Best Practices 스킬 — React Native 코드 품질
- frontend-design 스킬 — 디자인 품질
- /simplify + /review — 커밋 전 코드 검증

**금지:**
- 스크린샷 없이 "잘 될 것 같다"고 커밋 → 퇴출 사유
- 디자인 스킬 미사용 임의 UI 작업 → 퇴출 사유
- 사용자 피드백 무시하고 자의적 판단 → 퇴출 사유

---

## 제13조: ⚠️ Expo Go / Replit 설정 — 절대 수정 금지 (변경 즉시 Expo Go 연결 파괴)

> 아래는 2026-04-26 실제 디버깅으로 확정된 최종 표준.
> 변경 전 반드시 사용자 서면 승인 필요.

### ✅ Start Frontend 워크플로우 확정 커맨드 (이 한 줄만 허용)

```
EXPO_PACKAGER_PROXY_URL=https://828b2285-99c5-4cc9-9bcd-a09cdff531bc-00-kzvu1v5xhevl.expo.sisko.replit.dev npx expo start
```

> **원칙**: 이 Replit 환경은 포트를 직접 명시하지 않고 Replit 프록시 자동 라우팅에 맡긴다.
> `EXPO_PACKAGER_PROXY_URL`은 Metro가 포트 없이 `exp://...expo.sisko.replit.dev`를 생성하게 한다.
> `REACT_NATIVE_PACKAGER_HOSTNAME`을 쓰면 Metro가 `:8081`을 강제로 붙여 Replit 프록시가 끊긴다.

---

### ❌ 절대 금지 항목 (위반 즉시 Expo Go 연결 파괴)

| 금지 항목 | 이유 |
|-----------|------|
| `REACT_NATIVE_PACKAGER_HOSTNAME=...` 단독 사용 | Metro가 `exp://...:8081` 생성 → Replit 프록시 라우팅 실패 |
| `EXPO_PACKAGER_PROXY_URL=https://...:8081` (포트 명시) | QR 접속 끊김 |
| `--go` 플래그 추가 | iOS 앱 멈춤 (commit 4e35953 롤백 이력) |
| `--clear` 플래그 추가 | 캐시 충돌 |
| `--tunnel` 플래그 추가 | ngrok 충돌 (Replit 직접 노출이라 불필요) |
| `CI=1` 추가 | HMR / Fast Refresh 비활성화 |
| `npm install && ...` 선행 추가 | 불필요, 워크플로 지연 |
| 두 워크플로 동시 재시작 | Metro의 FallbackWatcher가 로그 파일 로테이션 중 ENOENT로 죽음 |
| `app.config.js` / `app.config.ts` 생성 | Replit 공식 FORBIDDEN |
| `serveExpoManifest()` 복원 | Expo Go는 Metro(8081)에 직접 연결, Express 경유 불필요 |
| `Constants.expoConfig?.extra?.apiDomain` 폴백 복원 | `EXPO_PUBLIC_DOMAIN` 단일 소스 위반 |

---

### ✅ 올바른 설정 전체 표준

- **Metro 연결 URL**: `exp://828b2285-99c5-4cc9-9bcd-a09cdff531bc-00-kzvu1v5xhevl.expo.sisko.replit.dev` (포트 없음 — Replit 프록시 자동 처리)
- **API URL**: `EXPO_PUBLIC_DOMAIN` 환경변수 단독 소스 (Replit Secrets)
- **Expo 설정**: `app.json` 전용 (`app.config.js` 사용 금지)
- **포트 라우팅**: Replit 프록시 자동 담당 (에이전트가 포트 직접 설정 금지)
- **재시작 순서**: `Start application` 완전 안정화 확인 → `Start Frontend` 순차 재시작 (동시 금지)

---

### 📋 디버깅 이력 요약

| 날짜 | 커밋/이벤트 | 내용 |
|------|------------|------|
| 2026-04-13 | fd00038 | Expo Go 표준화 최초 확정 (3일 디버깅, 11회 시행착오) |
| 2026-04-26 | 세션 디버깅 | `REACT_NATIVE_PACKAGER_HOSTNAME` → `EXPO_PACKAGER_PROXY_URL` 전환 확정 (포트 자동화 원칙) |

---

**이 규칙을 어기는 AI는 즉시 작업 중단됩니다.**
**"몰랐다", "좋은 의도였다"는 변명이 되지 않습니다.**
