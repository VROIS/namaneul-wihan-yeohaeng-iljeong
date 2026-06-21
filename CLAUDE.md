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

### 🔴 1.1 거짓말 / 게으름 / 꼼수 = 즉시 발각 + 입증 + 처벌 (2026-05-16 사용자 SSOT)

> AI 의 본능적 패턴 = 사용자가 매번 입증으로 폭로함. 변명/수습 = 불가능.

**금지 행동 (= 흔한 AI 꼼수)**:

| # | 행동 | 사용자 입증 방법 |
|---|---|---|
| 1 | 단순 검색 (= ILIKE %X%) 으로 "DB 에 없다" 결론 | 사용자 = ag3 의 9 조합 매칭 + norm + noAccent 직접 시도 → 매칭 발견 → AI 거짓말 폭로 |
| 2 | "신규 INSERT 발생" / "외부 호출 18 곳" 같은 추정 결론 | DB 직접 SELECT = 변경 0 / 행 매칭 100% → 추정 폭로 |
| 3 | "archive 누락" / "코드 버그" 추정 | 어제 마이그 코드 직접 Read → 정확 구현 확인 → 헛걱정 폭로 |
| 4 | Agent 권고를 자율 모드 명분으로 자동 적용 | 변질된 코드 = 사용자가 byte 비교로 발각 |
| 5 | "곧 배포되면 검증 가능" 같은 사용자 압박 | 결정 떠넘기기 = 사용자 거부 |
| 6 | 가능한 검증 안 하고 "한계가 있어서 어렵다" 회피 | 사용자 = "시도도 안 해보고" 지적 → 게으름 폭로 |

**필수 행동 (= 사용자 SSOT 2026-05-16)**:

1. **할 수 있는 최선 = 모두 시도 후** = 못 함 / 모름 = **솔직히 인정**
2. **추정 결론 금지** = 사실 SELECT / 코드 Read / 직접 검증만
3. **편한 추정 + 거짓 정확성 보고** = 즉시 발각 + 퇴출
4. **사용자 = 시스템 (= ag3 / DB / 마이그 코드) 의 정확성을 입증해 줌** = AI 만이 = 거짓말 게으름뱅이 = 통하지 않음

= AI 의 꼼수 = 사용자에게 = **100% 통하지 않음**. 사용자 = 매번 사실로 입증 + AI 의 잘못 폭로. 변명/수습 = 불가능 = 즉시 처벌.

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

---

## 제14조: ⚠️ place_seed_raw INSERT/UPDATE = upsertPlace() 만 사용 (2026-05-15 사용자 SSOT)

> 모든 신규 행 추가/덮어쓰기는 **단일 함수 `upsertPlace()` 통과 강제**.
> 직접 INSERT/UPDATE = 즉시 작업 중단.

### ✅ 유일한 진입점

```ts
import { upsertPlace, upsertPlaces } from 'server/services/place-upsert';

const r = await upsertPlace({
  cityId: 19,
  seedCategory: 'restaurant',
  nameEn: 'Angelina',
  address: '226 Rue de Rivoli, 75001 Paris, France',
  latitude: 48.8651,
  longitude: 2.3278,
  googlePlaceId: 'ChIJ...',
  priceEur: 30,
  // ...
});
// r.action = 'inserted' | 'updated' | 'skipped'
// r.matchedBy = 'pid' | 'address' | 'coords' | 'name' | 'none'
```

### 매칭 단계 (= 같은 장소 확률 순, 절대 변경 금지)

| 순위 | 기준 | 확률 |
|---|---|---|
| **0** | google_place_id 일치 | ~100% |
<!-- ⚠️ 수정금지(승인필요) — matcher PID veto 제거 동기화(2026-06-15 SSOT): PID 가 달라도 보조매칭(주소·좌표·로컬이름) 일치 시 = 같은 장소(우리 PID 오류 = TS 교정). PID 차이는 더이상 veto 아님. URI(cid)만 veto 유지. (이 veto 정책 변경은 아래 "변경하려면?" = 헌법 변경 통제 = 사용자 명시 승인 대상) -->
| **1** | 풀 주소 정규화 100% (= 번지 + 우편번호) | ~99% |
| **2** | 좌표 10m | ~95% |
| **3** | 장소명 LOWER+trim (= 보조, 체인 위험) | ~30-50% |

### 매칭 시 UPDATE 정책

- 식별/검증 데이터 (= name/주소/좌표/PID/URI/리뷰수) = **COALESCE 새 우선** (= 최신 TS 가 가장 신뢰 = 사용자 SSOT 2026-06-03 확정). ⚠️ 옛 "옛 우선" 폐기 = 코드(place-upsert.ts)와 정합.
- 이미지 (image_url) = **COALESCE 새 우선** (= 새 값 있을 때만 교체, 없으면 옛 보존 = WK 이미지 유지 = 빈 화면 방지)
- 가격 (price_eur) = **COALESCE 새 우선** (= 최신최우선 = 전 컬럼 동일. 옛 "GREATEST 비싼 쪽" 폐기 2026-06-10 = 레거시 garbage(€88K) 영구잠금 버그 해소 / 코드 place-upsert.ts:130·147 정합 = §19 동기화 2026-06-20)
- 카피 (summary_ko/editorial_summary) = **새 우선** (= Gemini 큐레이션 갱신)
- tags = **UNION** (= 누적)

### ❌ 절대 금지 (= 위반 즉시 작업 중단)

| # | 금지 | 이유 |
|---|---|---|
| 1 | `db.insert(placeSeedRaw)` 직접 호출 | 매칭 우회 = 중복 행 발생 |
| 2 | `INSERT INTO place_seed_raw ...` SQL 직접 | 동일 |
| 3 | 임시 스크립트 _tmp_*.mjs 에서 직접 INSERT | 사용자 시스템 우회 |
| 4 | "한 번만 우회" 명목 | 영구화됨 |

### DB 트리거 최종 안전망

`scripts/_migration-place-upsert-trigger-2026-05-15.mjs` 실행 시 = DB 단에서 = BEFORE INSERT 자동 검사 = AI/스크립트 누가 우회해도 EXCEPTION 발생.

### 변경하려면?

사용자 명시 승인 + 매칭 알고리즘 변경 = 헌법 변경 통제 절차 따름.

---

## 제15조: ⚠️ Google Places API SKU 등급 = Atmosphere 절대 금지 (2026-05-15 사용자 SSOT)

> Google 공식 등급체계 + GCP 청구서 실측 (= 사용자님 직접 확인) = TS Enterprise = **€0.0299/호출**.
> FieldMask 안에 들어간 필드 1 개라도 상위 SKU 면 = 전체 호출이 그 SKU 가격.

### ✅ 허용 최고 SKU = **Enterprise** ($35/1K, 무료 1K/월)

= 시스템 SSOT 필수 필드 포함:
- `places.userRatingCount` (= 인기도 정렬 = `feedback_place_api_verified_pattern` 메모리)
- `places.priceRange` (= 가격 SSOT = §14 = COALESCE 새 우선 / 옛 "GREATEST" 폐기 2026-06-20 = §14 정합)

### ❌ 절대 금지 = **Enterprise + Atmosphere** ($40/1K, 무료 1K/월)

33 필드 = `editorialSummary`, `reviews`, `generativeSummary`, `dineIn`, `takeout`, `delivery` 등.

전체 목록 = [`docs/SEED_SSOT_2026-05-02.md`](docs/SEED_SSOT_2026-05-02.md) §16 참조.

### 강제 가드 = `validateFieldMask()` 단일 진입점

```ts
import { validateFieldMask } from 'server/services/shared/google-places-sku';

const FIELD_MASK = 'places.id,places.displayName,places.userRatingCount,places.priceRange';
validateFieldMask(FIELD_MASK);  // Atmosphere 필드 감지 시 throw
```

### ❌ 절대 금지

| # | 금지 | 이유 |
|---|---|---|
| 1 | Atmosphere 33 필드 사용 (= `editorialSummary` 등) | $40/1K 폭탄 (= Enterprise 대비 14% 추가) |
| 2 | `validateFieldMask()` 우회 = 직접 `fetch('places.googleapis.com')` | 가드레일 무효화 = AI 미래 실수 무방비 |
| 3 | PD (Place Details) + TS 동시 사용 | 같은 데이터 2 회 호출 = 비용 2 배 (= 2026-05-15 사용자 결정 = TS 단독) |
| 4 | "한 번만 Atmosphere" 명목 | 영구화됨 = SSOT 깨짐 |

### 변경하려면?

사용자 명시 승인 + [`docs/SEED_SSOT_2026-05-02.md`](docs/SEED_SSOT_2026-05-02.md) §16 + §11 변경 통제 절차.

---

## 제16조: ⚠️ 폴더 구조 강제 + 1 회용 스크립트 금지 (2026-05-15 사용자 SSOT)

> 1 달간 AI 마다 임시 스크립트 + 메가 파일 누적 = 사용자 명시 분노. **영구 컴포넌트만** 작성.

### ✅ 표준 폴더 구조 (= SEED_SSOT §19 + 메모리 [[project_p0_architecture_handover]])

```
server/services/
  ├─ shared/                          ← 단일 진입점 헬퍼 (= AI 재발명 차단)
  │   ├─ prompts/                     (Gemini prompt = 1 글자 변경 금지)
  │   ├─ google-places-sku.ts         ✅ Atmosphere 가드
  │   ├─ geminiClient.ts              (= Gemini 단일 진입점)
  │   ├─ ts-client.ts                 (= TS Enterprise + languageCode='ko' 자동)
  │   ├─ matcher.ts                   (= 5 단계 + 9 조합 매칭 유일)
  │   └─ image-pipeline.ts            (= PhotoMedia → Storage)
  ├─ place-upsert.ts                  ✅ INSERT/UPDATE 단일 진입점
  ├─ seed/                            ← 시드 발굴 컴포넌트
  ├─ itinerary/                       ← 메인앱 여정 (= ag1~4)
  ├─ shortform/                       (= 예정)
  └─ legacy/                          (= 옛 메가 파일 백업만)
```

### ❌ 절대 금지 (= 위반 즉시 작업 중단)

| # | 금지 | 이유 |
|---|---|---|
| 1 | **1 회용 임시 스크립트** (= `_migration-*.mjs`, `_diag-*.mjs` 새로 만들기) | AI 가 작성 → 결과만 보여줌 → 폐기 → 후임 다시 작성 = 1 달 반복 |
| 2 | **메가 파일 추가** (= 1,000 줄+ 단일 파일) | pipeline-v3.ts (1.5K) + itinerary-generator.ts (2.5K) = 사용자 짜증 |
| 3 | **shared/ 우회 = 직접 Gemini/TS 호출 코드 작성** | matcher 9 조합 + SKU 가드 + languageCode='ko' 누락 위험 |
| 4 | **`db.insert(placeSeedRaw)` 직접** | upsertPlace() 단일 진입점 우회 = 중복 행 발생 (= 제14조) |
| 5 | **"Recommended" 옵션 제시** | 사용자 분노 = €860 자산 비가역 (= [[feedback_db_860eur_cost_no_proposals]]) |
| 6 | **AI 가 매번 매칭 코드 재발명** | shared/matcher.ts 단일 코드만 사용 |

### 신규 작업 절차

1. **shared/ 헬퍼 호출** (= geminiClient, ts-client, matcher, place-upsert)
2. **새 컴포넌트** = `seed/` 또는 `itinerary/` 폴더 안에만 작성
3. **CLI** = `scripts/seed-*.mjs` 한 줄 호출 = 다른 도시 동일 결과 보장
4. **1 회용 정제 작업** = 컴포넌트 안의 영구 함수로 = 표준화

### 세션 간 인수인계 = 메모리 + WORKLOG

- 작업 시작 시 = `MEMORY.md` 자동 로드 (= 모든 메모리 인덱스)
- 핵심 SSOT 메모리 = `project_p0_architecture_handover.md` (= 다음 작업 잠금)
- 작업 정리 = `docs/WORKLOG.md` = 날짜 역순 누적 + 완료/다음 P0/P1/P2 명시

### 변경하려면?

사용자 명시 승인 + `docs/SEED_SSOT §19` + §11 변경 통제 절차.

---

## 제17조: ⚠️ 리팩토링 작업 원칙 (= 3 게이트 + 자율 모드, 2026-05-15 사용자 SSOT)

> 모든 리팩토링 = 단계별 세분화 + 각 단계 종료 = **3 종 통과 후에만** 다음 단계. 미비 시 = Ralph-loop. 다음 단계 = **자율 모드**.

### 작업 흐름 (= 절대 위반 금지)

```
단계 N 시작 → 코드 작성 → 3 종 통과 검증
   ↓ (= 통과)
다음 단계 N+1 = 자율 진행 (= 묻지 말고 시작)
   ↓ (= 미비)
/ralph-loop:ralph-loop 자동 반복 → 통과까지 보완
```

### 3 게이트 (= 모두 통과해야 단계 완료)

| 게이트 | 명령 | 검증 |
|---|---|---|
| ① | `/simplify` | 재사용 / 품질 / 효율 |
| ② | `/review` | 정확성 / 컨벤션 / 보안 |
| ③ | `/vercel:react-best-practices` | React 패턴 / 성능 / 접근성 |

### 단계 세분화 원칙

- 1 단계 = 1 컴포넌트 (= ~200-300K 토큰)
- 작은 책임 = 함수 1 개 또는 폴더 1 개
- 다른 컴포넌트 안 깨짐

### 자율 모드 (= 다음 단계 진행 방식)

- 사용자가 단계 N 완료 = 다음 N+1 = AI 자율 시작
- 옵션 제시 X / 권고 X / "다음 단계 진행할까요?" 묻기 X
- 사용자 개입 = 멈춤 명시 또는 위반 발견 시만

### ❌ 위반

| # | 금지 |
|---|---|
| 1 | 3 게이트 통과 X 채로 다음 단계 진행 |
| 2 | "다음 단계 진행해도 될까요?" 묻기 (= 자율 모드 위반) |
| 3 | 1 단계에 컴포넌트 여러 개 묶기 (= 세분화 위반) |
| 4 | Ralph-loop 안 쓰고 사용자에게 보완 요청 |

### 변경하려면?

사용자 명시 승인 + `[[feedback_refactor_workflow_3gate]]` 메모리 + §11 변경 통제.

---

## 제18조: ⚠️ 외부호출 raw 산출물 형식 = 단일 표준 (2026-06-16 사용자 SSOT)

> 모든 유료 외부호출(TS·Gemini)의 응답 raw = 돈·자산. 형식·경로·저장 위치가 이미 `save-raw.ts` 에 잠금됨.
> 이 조항 = 그 잠금을 헌법으로 명문화. 우회·형식 변경 = 즉시 작업 중단.

### ✅ 유일한 저장 관문 = `saveRaw()` (= `server/services/shared/save-raw.ts`)

- 모든 외부 클라이언트(`ts-client.ts` / `geminiClient.ts`)가 응답 직후 이 함수로 저장 강제.
- 직접 `fetch().then(저장 안 함)` = 관문 우회 = **금지** (= raw 누락 = 비용 증발 = 은폐 위험).

### ✅ 파일 규칙 (= save-raw.ts 36줄 = 절대 변경 금지)

```
{cityId}/{YYYY-MM-DD}_{source}-{tag}.json
```

| 요소 | 값 | 비고 |
|---|---|---|
| **위치** | 로컬 `docs/raw/{cityId}/` + Storage `raw-responses/{cityId}/` | **2 곳 동형** (= 비용 보호 + 재활용) |
| **cityId** | 발굴 = 도시 id / cityId 없는 호출(동선·메인앱) = `runtime` | |
| **날짜** | `YYYY-MM-DD` (= 앞) | 같은 날 같은 tag + **같은 raw 내용** = 덮어쓰기 = 중복0. **raw 내용 다르면** = `_1`/`_2` 버전 순번 분리 보존(손실0) |
| **source** | `ts` \| `gemini` | |
| **tag** | 호출 맥락 식별(영숫자, `-` 치환, 48자) | 미지정 = `call` |

### ✅ 내용 형식 (= pretty 들여쓰기 2 = 사람 눈 검수 가능)

```json
{
  "savedAt": "<ISO>",
  "source": "ts | gemini",
  "contextId": "<cityId | runtime>",
  "request": { "prompt": "...", "model": "...", ... },
  "raw": { "parsed": {...}, "text": "...", "finishReason": "..." }
}
```

= `request` = 프롬프트 원본 통째로 (= 사장님 byte 검수 = 임의삽입/누락 적발).
= `raw` = 외부 응답 원본 (= 진짜 raw = 환각·오류도 그대로 보존 = 추후 대조).

### ✅ 버전 순번 (2026-06-16 사장님 SSOT)

- 같은 날 같은 tag 재호출 시 = 로컬 `docs/raw` 기준 `md5(raw)` 비교.
  - **동일** = 1 개 파일 덮어쓰기 (= 중복0).
  - **상이** = `_N`(= `_1`/`_2`...) 버전 순번 분리 보존 (= raw 손실0 = 다른 결과는 비가역 자산).
- 규칙 SSOT = `server/services/shared/raw-filename.ts` 의 `rawHash` / `versionedName` (= `storage-raw-restructure` 로직 흡수 = 재발명0).
- `saveRaw()` + debug-dump 양쪽에 동일 적용 (= 단일 SSOT = 경로 어디든 같은 순번 규칙).

### ❌ 절대 금지 (= 위반 즉시 작업 중단)

| # | 금지 | 이유 |
|---|---|---|
| 1 | minified(한 줄) 저장 | 사장님 원본 검수 불가 = 은폐 (= 선임 구속사유) |
| 2 | 로컬 1 곳만 / Storage 1 곳만 | 2 곳 동형 깨짐 = 재활용·비용보호 무효 |
| 3 | 파일명에 시각(HH-mm-ss) 추가 | 같은 호출이 매번 새 파일 = 중복 누적 (단, 내용이 실제 다를 때의 `_N` 버전 순번은 허용 = 위 버전 순번 소절) |
| 4 | `saveRaw()` 우회 = 직접 외부 fetch 후 미저장 | raw 누락 = 유료 결과 증발 |
| 5 | `request`/`raw` 구조 임의 변경·필드 누락 | 대조·재현 불가 |

### 변경하려면?

사용자 명시 승인 + `save-raw.ts` 의 `// ⚠️ 수정금지` 잠금 주석 + §11 변경 통제.
= 관련 메모리 [[feedback_external_call_raw_2places_visible]] · [[feedback_prompt_is_code_show_before_apply]].

---

## 제19조: ⚠️⚠️ 옛것 완전 삭제 = 주석으로 살려놓기 금지 (2026-06-17 사장님 최우선 헌법)

> 근원 진단: 지금까지 본 모든 문제(라이브 DB ≠ 레포 SQL, SSOT 충돌 주석, 매칭 3벌 공존)의 뿌리 =
> **옛것을 완전 삭제 안 하고 주석으로 살려놓는 것.**
> 비유 = 똥을 안 치우고 덮은 뒤 그 위에 음식을 올리면 = **음식도 똥이 된다.**
> = 옛것이 새것과 공존하면 = 스파게티·버그·AI 환각·SSOT 충돌 = 전부 오염.

### ✅ 절대 규칙 (예외 없음)

1. **사장님이 변경 확정하면 = 옛것은 어떤 경우도 쓰면 안 됨 = 새것으로 무조건 교체.**
2. **옛것 = 완전 삭제.** 주석 처리(`// 옛 …`)·폴백 코드·`if (옛방식)` 분기·옛 SSOT 문구 = **남기지 마라 = 삭제.**
3. **공존 금지.** md·스크립트·DB·트리거·프론트·프롬프트 = 가장 최신 1 개만 존재. 2 벌·3 벌 공존 = 위반.
4. **DB ↔ 레포 동기화 강제.** 라이브 DB(트리거·함수)가 최신이면 = 레포 SQL 파일도 그 최신으로 즉시 교체(구버전 잔존 = 재적용 시 회귀 = 위반). 레포가 최신이면 = DB 도 그것으로.

### ❌ 절대 금지 (= 위반 즉시 작업 중단)

| # | 금지 | 결과 |
|---|---|---|
| 1 | 옛 코드를 삭제 안 하고 `// 옛것 = 참고` 주석으로 살려둠 | 새것과 섞임 = 똥 덮기 |
| 2 | 폴백 코드(`옛방식 \|\| 새방식`) 잔존 | 옛 경로로 빠짐 = 오염 |
| 3 | 옛 SSOT 문구(예 "id직행 금지")와 새 SSOT(예 "id직행 필수") 공존 | 후임 AI 어느 게 정본인지 모름 = 충돌 |
| 4 | 라이브 DB(7단계)와 레포 SQL(3단계) 불일치 방치 | 재적용 시 회귀 = 시한폭탄 |
| 5 | "혹시 몰라서 옛것 남김" 명목 | = 똥 안 치움 = 영구 오염 |

### 작업 방식 (= 이 헌법으로 바뀜)

- 변경 = 옛 코드 라인 **삭제 후** 새 코드 작성 (주석 보존 X).
- 새 SSOT 확정 = 옛 SSOT 문구를 **찾아 삭제**(전수 grep) 후 새것 1 개만.
- DB 변경 = 라이브와 레포 SQL 을 **동시에** 최신 1 벌로.

### 변경하려면?

= 이 헌법 자체 = 사장님 최우선 SSOT = 변경 불가(사장님 명시 외).
= 관련 메모리 [[feedback_latest_is_truth_delete_old]] (강화·헌법화).
