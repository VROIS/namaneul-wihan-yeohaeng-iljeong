# NUBI 프로젝트 통합 태스크 관리

> **최종 업데이트: 2026-02-08 (일) 야간**
> **관리 방식: 이 파일 하나로 모든 작업/계획/이력 통합 관리**
> **참조 문서: PRD.md, TRD.md, NUBI_WHITEPAPER.md (핵심 설계 - 수정 금지)**

---

## 0. 현재 진행 상태 (AI 핸드오프용)

> **이 섹션은 AI가 새 세션 시작 시 가장 먼저 읽는 인수인계 문서입니다.**
> **매 세션 종료/중단 시 반드시 업데이트할 것.**

| 항목 | 내용 |
|------|------|
| **마지막 작업일** | 2026-02-08 (일) 심야 |
| **마지막 작업 내용** | **빌드/배포 완료, 테스트 결과: places 배열 비어있음 (치명적 버그 발견)** |
| **다음 해야 할 작업** | **places 빈 배열 버그 수정 → 재배포 → 재검증** |
| **환경 상태** | node_modules 설치 완료, Cursor 최적화 완료, Koyeb 배포 운영 중 |
| **개발 프로세스** | 로컬호스트 미사용. 코드수정 → Git 커밋(cursor-dev) → Koyeb 자동배포 → Supabase DB |
| **주의사항** | ⚠️ Google Maps API 일일 500회 제한 + $200/월 무료 크레딧 범위 내 운영. Atmosphere 필드 제거 완료 |
| **현재 브랜치** | cursor-dev |
| **참조 규약** | `docs/AGENT_PROTOCOL.md` (에이전트 간 통신 프로토콜, googlePlaceId 기반) |
| **긴급 이슈** | ⚠️ **API 응답에서 days[0].places 배열이 비어있음 + 속도 28초 (목표 8-12초)** |

### ⚡ 지금 해야 할 일 (최우선, 순서대로)

> **원칙: 내부 테스트 → 배포 → 검증 → 문제 발견 시 수정 → 재배포 → 원하는 결과 나올 때까지 무한 반복**

| # | 작업 | 상태 | 성공 기준 |
|---|------|------|-----------|
| 1 | **내부 테스트** (TypeScript 빌드 + esbuild 번들링) | 대기 | 에러 0 |
| 2 | **배포** (커밋 → 푸시 → Koyeb 자동배포) | 대기 | 서버 정상 기동 |
| 3 | **속도 측정** | 대기 | 총 8~12초 이내 (AG1: 0.3s, AG2: 5~8s, AG3: 1~2s, AG4: 1~2s) |
| 4 | **DB 활용 현황** | 대기 | AG3 매칭률 80%+ (기존 0% → 목표 80%+, nameEn/aliases 활용) |
| 5 | **각 에이전트 수행 평가** | 대기 | AG1~AG4 각각 정상 작동, 규약대로 데이터 전달 |
| 6 | **최종 프론트엔드 산출물** | 대기 | 일정표(장소+사진+이유), 비용(EUR+KRW), 이동시간 정상 표시 |
| 7 | ⚠️ 문제 발견 시 → **수정 → 1번으로 돌아가서 반복** | - | 3~6번 전부 통과할 때까지 |
| 8 | **성공 시 결과 보고** | 대기 | 위 전체 통과 |

### 📦 1차 시딩 목표 (위 검증 완료 후 실행)

| # | 작업 | 상태 | 설명 |
|---|------|------|------|
| 1 | 프랑스 신규 28개 도시 장소 시딩 | 대기 | 일일 500회 API 제한, POPULARITY(인기순) 정렬, 약 $37 예상 (무료 크레딧 내) |
| 2 | 유럽 신규 4개 도시 장소 시딩 | 대기 | 잘츠부르크, 루체른, 프랑크푸르트, 아말피 |
| 3 | 실제 Google API 청구 비용 확인 | 대기 | 1차 시딩 후 확인 → 비용 승인 후 확대 |
| 4 | ⏸️ 1차 목표 완료 후 멈춤 → 사용자 승인 대기 | - | 비용 확인 후 2차 확대 여부 결정 |

### ✅ 이번 세션 완료된 작업 (2026-02-08 야간)

| # | 작업 | 카테고리 | 핵심 파일 |
|---|------|----------|-----------|
| 1 | **에이전트 통신 규약 수립** (AGENT_PROTOCOL.md) | 규약 | `docs/AGENT_PROTOCOL.md` (신규) |
| 2 | **DB 스키마 확장** (cities: nameEn/nameLocal/aliases, places: displayNameKo/aliases) | DB | `shared/schema.ts` |
| 3 | **Supabase 마이그레이션 실행** (5개 컬럼 추가 + 39개 도시 영어/현지명 입력) | DB | Supabase 직접 실행 |
| 4 | **프랑스 28개 + 유럽 4개 도시 추가** (총 39→71개 도시) | DB | Supabase 직접 실행 |
| 5 | **통합 도시 검색 함수** (findCityUnified: 영어/한국어/현지어/별칭 매칭) | 백엔드 | `server/services/city-resolver.ts` (신규) |
| 6 | **AG2 Gemini 프롬프트 개선** (영어 공식명 강제 + JSON 잘림 복구) | 에이전트 | `server/services/agents/ag2-gemini-recommender.ts` |
| 7 | **AG3 데이터 매칭 강화** (googlePlaceId 우선 + aliases 자동 학습) | 에이전트 | `server/services/agents/ag3-data-matcher.ts` |
| 8 | **AG4 프론트엔드 호환** (budget 필드 구조 맞춤) | 에이전트 | `server/services/agents/ag4-realtime-finalizer.ts` |
| 9 | **findCityUnified 전역 적용** (itinerary-generator, korean-sentiment 등 5곳) | 백엔드 | 다수 파일 |
| 10 | **admin-routes.ts 도시 데이터 보강** (nameEn/nameLocal 포함) | 백엔드 | `server/admin-routes.ts` |
| 11 | **place-seeder 최적화** (30회→4회 API, POPULARITY 정렬, 87% 비용 절감) | 시딩 | `server/services/place-seeder.ts` |
| 12 | **google-places.ts 규약 적용** (rankPreference: POPULARITY + displayNameKo/aliases 저장) | 시딩 | `server/services/google-places.ts` |
| 13 | **DailyBudgetBreakdown 타입 추가** | 타입 | `client/types/trip.ts` |

### 이전 DB 자산 확보 체크리스트 (완료)

> **배경**: €1,001 Google API 요금 발생 후 비용 최적화 완료. 데이터 저장 파이프라인 수정 완료.

| # | 작업 | 상태 | 설명 |
|---|------|------|------|
| 1 | **스키마 rating 필드 추가** | ✅ 완료 | `shared/schema.ts` places 테이블에 `rating: real("rating")` 추가 |
| 2 | **getPlaceDetails() 필드마스크 보강** | ✅ 완료 | `editorialSummary`, `websiteUri`, `internationalPhoneNumber` 추가 (Basic 등급, 추가 비용 없음) |
| 3 | **fetchAndStorePlace() 매핑 보강** | ✅ 완료 | `rating`, `editorialSummary`, `websiteUri`, `phoneNumber` 저장 + 기존 장소 업데이트 로직 추가 |
| 4 | **storage.ts updatePlaceData() 추가** | ✅ 완료 | 기존 장소의 핵심 필드 업데이트 함수 (인터페이스+구현) |
| 5 | **DB 마이그레이션** | ✅ 완료 | nameEn/nameLocal/aliases/displayNameKo 컬럼 Supabase에 직접 추가 완료 |
| 6 | **점수 집계 파이프라인** | ✅ 완료 | `score-aggregator.ts` — 전 크롤러 데이터 → places 테이블 buzzScore/vibeScore/finalScore/tier 집계 |
| 7 | **AG3 DB 우선 활용 보강** | ✅ 완료 | rating, editorialSummary 활용 추가, confidenceLevel 개선, 선정이유에 Google 평점 표시 |
| 8 | **sql import 버그 수정** | ✅ 완료 | routes.ts에서 drizzle-orm의 sql 미 import → ReferenceError 해결 |
| 9 | **배포 + 일정 생성 테스트** | ✅ 완료 | 아래 "성능 테스트 결과" 참조 |

#### 성능 테스트 결과 (2026-02-08 실제 배포 서버, Paris 1일)

| 단계 | 소요시간 | 목표 | 판정 |
|------|----------|------|------|
| AG1 (뼈대 설계) | **251ms** | 300ms | ✅ 달성 |
| AG2+AG3-pre (Gemini+DB 병렬) | **12,151ms** | 5,000~8,000ms | ⚠️ 미달 (Gemini 응답 느림) |
| AG3 (매칭/점수/확정) | **4,222ms** | 1,000~2,000ms | ⚠️ 미달 (DB 매칭 0건→Google API) |
| AG4 (실시간 완성) | **1,293ms** | 1,000~2,000ms | ✅ 달성 |
| **총합** | **17,917ms** | **8,000~12,000ms** | ⚠️ 18초 (목표 대비 +6초) |
| **이전 대비** | 40초 → 18초 | - | ✅ 55% 단축 |

#### 성능 병목 원인 분석
1. **AG2 (12초)**: Koyeb 무료 티어 네트워크 지연 + Gemini 모델 응답 시간. 프롬프트는 이미 500자로 축소 완료
2. **AG3 (4초)**: DB 매칭 0건 → Google Places Text Search API 호출 × 4곳. Paris DB에 장소 있지만 한국어/영어 이름 불일치로 매칭 실패
3. **해결 방향**: AG2 응답에 영문 장소명 강제, DB에 alias(별칭) 필드 추가, Gemini 모델 변경 검토

#### 핵심 변경 파일 (이 커밋)
- `shared/schema.ts`: rating 필드 추가 (L81)
- `server/services/google-places.ts`: 필드마스크 3개 추가 + fetchAndStorePlace() 매핑 보강 + 기존 장소 업데이트
- `server/storage.ts`: updatePlaceData() 인터페이스+구현 추가

#### 이전 긴급 대응 (이 커밋에 포함)
- `server/index.ts`: dataScheduler 복원 (place_seed_sync만 차단)
- `server/services/data-scheduler.ts`: BLOCKED_TASKS로 place_seed_sync 차단
- `server/services/google-places.ts`: 일일 API 500건 제한, Atmosphere 26개 필드 제거
- `server/services/gemini-search-limiter.ts`: 신규 — Gemini Google Search 일일 160건 제한
- `server/services/crawler-utils.ts`: 신규 — safeParseJSON, safePrice 등 안전 유틸
- 12개 크롤러: Gemini Search 리미터 + crawler-utils 통합 + 프롬프트 최적화
- `server/services/crisis-alert-service.ts`: sql import 누락 수정

### 1차 목표 실행 플랜 (사용자 확정, 2026-02-07)

> **목표: 앱스토어 배포 수준의 일정표 생성 + 비용계산 + UI/UX + 수익화(가이드예약)**
> **순서: 백엔드 로직 확정 → 프론트엔드 UI 개편 → 수익화 연동**

#### 스트림 1: 일정생성 로직 확정 (백엔드)

| # | 작업 | 상태 | 핵심 변경 파일 | 산출물 목표 |
|---|------|------|--------------|------------|
| 1-2 | 한국인 선호 최우선 정렬 강화 | **완료** | itinerary-generator.ts (L119-220, L560-766) | 식당 리뷰수50%+한국리뷰30%+SNS20%, 인스타/유튜브/블로그 최신 1.5x 가중치 |
| 1-3 | 동선 최적화 (하루 내 장소 순서) | **완료** | itinerary-generator.ts, route-optimizer.ts | 숙소 기반 nearest-neighbor+2-opt 원형 경로, Day별 재최적화 |
| 1-4 | 장소 대표 이미지 확보 | 대기 | itinerary-generator.ts | Google사진 > 인스타 > 블로그 > Wikimedia > placeholder (빈페이지 불가) |
| 1-5 | 식사 슬롯 모든 날 강제 | **완료** | itinerary-generator.ts (L82-119) | 점심1+저녁1 강제, 식당 선정 4대원칙 (슬롯강제/동선/예산/유명세) |

#### 스트림 2: 일정표 신뢰도 강화 (백엔드+프론트)

| # | 작업 | 상태 | 핵심 변경 파일 | 산출물 목표 |
|---|------|------|--------------|------------|
| 2-1 | 선정 최우선이유 1개 표시 | **완료** | itinerary-generator.ts (L1279-1370) | 구체적 데이터 근거 (리뷰수, SNS 점수, 포토스팟, 패키지투어 등) |
| 2-2 | 상단 여행요약 섹션 (수식 노출) | 대기 | TripPlannerScreen.tsx | 가중치 수식, 인당비용(원화), 날씨/위기 → 지도 토글 전환 |
| 2-3 | 로딩 페이지 실시간 계산과정 | 대기 | TripPlannerScreen.tsx | 8-10단계 메시지 + 실제 숫자 (23곳 추천 완료 등) |

#### 스트림 3: 비용계산 로직 완성 (백엔드)

| # | 작업 | 상태 | 핵심 변경 파일 | 산출물 목표 |
|---|------|------|--------------|------------|
| 3-1 | 인당 비용 표시 | 대기 | transport-pricing-service.ts | "가족 4명 기준 1인당 EUR" 명시 |
| 3-2 | 대중교통 실시간 요금 | 대기 | transport-pricing-service.ts | Google Routes transitFare + Uber/Bolt 병렬 표시 |
| 3-3 | 입장료 수집 강화 | 대기 | price-crawler.ts, itinerary-generator.ts | 실제 데이터 우선, 없으면 추정 최대값, 무료=명시 |
| 3-4 | 럭셔리/프리미엄 가이드 비용 | 대기 | transport-pricing-service.ts | basePrice4h + extraHours*hourlyRate / 인원 |
| 3-5 | 식사비 최대값 적용 | 대기 | itinerary-generator.ts | 구글맵 추정치 최대값 우선 (20-30유로면 30유로) |

#### 스트림 4: 전체 UI/UX 개편 (프론트엔드)

| # | 작업 | 상태 | 핵심 변경 파일 | 산출물 목표 |
|---|------|------|--------------|------------|
| 4-1 | 긴 한 페이지 구조 | 대기 | TripPlannerScreen.tsx | 일별 탭 제거, 모든 날 세로 나열 |
| 4-3 | 출발지 설정 (숙소/지도) | **완료** | TripPlannerScreen.tsx, trip.ts, PlaceAutocomplete.tsx | 숙소 Google Autocomplete + 서버 프록시 + Day별 변경/재최적화 |
| 4-4 | 하단 푸터 5탭 개편 | 대기 | MainTabNavigator.tsx | 일정/지도(토글)/전문가(애니메이션)/프로필/설정 |
| 4-5 | 슬롯 색상 구분 | 대기 | TripPlannerScreen.tsx | 관광(파랑)/점심(주황)/저녁(빨강)/이동(회색) |

#### 스트림 5: 수익화 기초

| # | 작업 | 상태 | 핵심 변경 파일 | 산출물 목표 |
|---|------|------|--------------|------------|
| 5-1 | 드라이빙 가이드 예약+결제 | 대기 | 신규: GuideBookingScreen.tsx, booking-routes.ts | 앱 내 예약 → Stripe/인앱결제 → 알림 |

### 완료된 작업 요약 (2026-02-08 기준)

**백엔드 로직 (스트림 1)**
1. 식당 선정 4대 원칙: 슬롯강제(점심1+저녁1) → 동선 → 예산(점심35%/저녁65%) → 유명세(리뷰50%+한국리뷰30%+SNS20%)
2. 한국인 선호 인스타(45%)+유튜브(30%)+블로그(25%), 최신 6개월 데이터 1.5x 가중치
3. 동선 최적화: 숙소→nearest-neighbor+2-opt→숙소 원형 경로, departureTransit/returnTransit 계산
4. 숙소 좌표 우선순위: Day별 개별숙소 → 공통숙소 → 도심좌표 → 첫장소
5. Day별 재최적화 API (`/api/routes/regenerate-day`)

**프론트엔드 (스트림 2, 4)**
6. 선정 이유: 데이터 기반 구체적 근거 (리뷰수 K, SNS 점수, 포토스팟 등)
7. 목적지 입력: Google Places Autocomplete (서버 프록시로 API 키 보호)
8. 숙소 입력: 목적지 선택 후 활성화, lodging 타입 검색, 좌표 자동 확보
9. 결과 화면: 숙소 정보 바 + 변경 버튼 + 재최적화 로딩 + 복귀 이동시간

**환경/인프라**
10. Cursor 환경 최적화 (.cursorrules, .cursorignore, settings.json)
11. Gemini-first + DB-Enrich 파이프라인 (좌표 기반 도시 매칭)
12. 14개 크롤러 자동 가동 (인스타/유튜브/블로그/미쉐린/TA/가격/포토/투어/한국플랫폼)
13. 날씨/위기 실제 데이터 연동 (weatherCache, crisisAlerts)
14. 바이브별 동적 가중치 매트릭스 (6바이브×6요소) + 데이터 등급 보정 (A/B/C/D)

### [긴급] 4+1 에이전트 파이프라인 아키텍처 (일정 생성 속도 최적화)

> **배경**: 현재 일정 생성 40초 중 Gemini AI 호출이 39초(96.5%) 차지 → 사용자 이탈 심각
> **목표**: 40초 → 8~12초 (70% 단축)
> **핵심**: Gemini 단일 거대 호출을 4+1 전문 에이전트 파이프라인으로 분해

#### 파이프라인 흐름

```
사용자 입력
    ↓
[AG1: 뼈대 설계자] ─── 0.3초
    ↓
    ├──→ [AG2: Gemini 최소 추천] ─── 5~8초 (병렬)
    ├──→ [AG3-pre: DB 로우데이터 사전 로드] ─── 0.5초 (병렬)
    ↓
[AG3: 매칭/점수/확정] ─── 1~2초
    ↓
[AG4: 실시간 완성] ─── 1~2초
    ↓
완성된 일정표 (8~12초)

── 온디맨드 (요청 시만) ──
[AG5: 영상 프롬프트 전문가] ← 사용자 "영상 만들기" 버튼
```

#### AG1: Skeleton Builder (뼈대 설계자)
- **소요**: 0.2~0.5초 (AI 호출 없음, 순수 계산)
- 사용자 입력 파싱 (vibes, pace, style, dates, companion 등)
- 일별 슬롯 수 계산 + 역할 배정 (morning_activity, lunch, afternoon_activity, cafe, dinner, evening_activity)
- AG2에 전달할 최적 프롬프트 구성 (역할별 최소한의 질문)
- 출력: 일정표 뼈대 JSON + Gemini 프롬프트

#### AG2: Gemini Creative Recommender (AI 최소 추천)
- **소요**: 5~8초 (현재 39초 대비 80% 감소)
- 현재: "27개 장소 전부 추천해줘" (거대 프롬프트 2000자+, 거대 응답 5000자+)
- 변경: "역할별 2~3곳 이름만 추천" (간결 프롬프트 500자, 응답 1000자)
- Gemini에게 요청하는 정보: **장소명 + 한줄 이유** (좌표/점수는 AG3 처리)
- 핵심: Gemini의 창의적 추천 능력은 유지하되, 작업량만 최소화
- AG3-pre와 **병렬 실행** (Promise.all)

#### AG3: Data Matcher & Scorer (데이터 매칭/확정)
- **소요**: 1~2초
- AG3-pre(병렬): AG2 대기 중 해당 도시 DB 장소 40~45개 미리 메모리 로드
- AG2 추천 장소를 DB places 테이블과 이름 매칭
- 매칭 성공: DB 로우데이터 (좌표, 사진, 리뷰수, 점수, 가격 등) 삽입
- 매칭 실패: Google Places API 수집 → DB 저장 (다음번 활용)
- 한국인 인기도 점수 계산 (인스타/유튜브/블로그)
- calculateFinalScore()로 가중치 기반 최종 점수 산출
- 슬롯별 최고 점수 장소 1개 확정 + 동선 최적화 (nearest-neighbor+2-opt)

#### AG4: Real-time Finalizer (실시간 완성)
- **소요**: 1~2초
- 구간별 교통비 + 일일 비용 합계
- 날씨 정보 (weatherCache)
- 위기 경보 (crisisAlerts)
- 환율 정보
- 실시간 이동 시간 (Google Directions 또는 직선거리 추정)
- 최종 JSON 검증 + 응답 반환

#### AG5: Video Prompt Expert (영상 프롬프트 전문가) — 온디맨드
- 일정 생성 시 **절대 실행 안 함** (속도 영향 0)
- 사용자 "영상 만들기" 버튼 시에만 작동
- DB에 저장된 완성 일정에서 장소별 정보 추출
- 각 장소의 분위기, 시간대, 동행 정보 기반 영상 프롬프트 생성
- 기존 scene-prompt-generator.ts 활용

#### AG4 비용 계산 헌법 (확정, 2026-02-08)

> **대원칙: 모든 비용은 실제/실시간 가격 최우선 (사용자 신뢰도)**
> **표시: EUR + KRW 병기 (€60 / ₩82,000), 일일/인당 기준**

##### 1. 교통비 매트릭스 (mobilityStyle × travelStyle)

```
가이드 기본 고객 (핵심 매출층):
  Premium (어떤 mobilityStyle이든) → 가이드 기본, Uber Comfort 비교
  Luxury (어떤 mobilityStyle이든)  → 가이드 기본, Uber Black 비교
  Minimal (어떤 travelStyle이든)   → 가이드 기본, Uber 비교

대중교통 기본 고객 (전환 유도):
  Economic + WalkMore  → 대중교통(카르네 최저가) + 가이드 추천 배너
  Economic + Moderate  → 대중교통 + UberX 비교 + 가이드 추천 배너
  Reasonable + WalkMore → 대중교통(최적패스) + 가이드 추천 배너
  Reasonable + Moderate → 대중교통 + UberX 비교 + 가이드 추천 배너
```

##### 2. 구간별 이동 판단

```
Google Routes API로 도보 시간 계산
  → 10분 이내: 도보 €0 (모든 mobilityStyle 공통)
  → 10분 초과: 위 매트릭스에 따라 교통수단 결정
  → Uber 횟수 = 도보 10분 초과 구간 수 (동선에서 자동 계산)
```

##### 3. 가이드 요금 (DB: guide_prices)

```
[시내/근교] 반일 기본 + 시간당 추가, 왕복 200km 기준
  세단(1-4명):    기본 4시간 €240 + 추가 시간당 €60
  밴(5-7명):      기본 4시간 €320 + 추가 시간당 €80
  미니버스(8+명):  기본 4시간 €400 + 추가 시간당 €100

[지방] 일일 고정 요금 (도시 간 이동 시 자동 적용)
  세단:    €720 (€480 + €240)
  밴:      €990 (€660 + €330)
  미니버스: €1,200 (€800 + €400)

인당 = 일일 요금 ÷ 인원수
판단: 같은 도시 내 → 시내, 다른 도시 이동 → 지방
```

##### 4. Uber 요금 (실시간, travelStyle별 등급)

```
Economic/Reasonable → UberX (base €2.50 + km×€1.05 + 분×€0.35, 최소 €7)
Premium             → Uber Comfort (base €4.00 + km×€1.45 + 분×€0.45, 최소 €10)
Luxury              → Uber Black (base €7.00 + km×€2.05 + 분×€0.55, 최소 €20)

차량: 4명이하 UberX/Comfort/Black, 5명+ UberXL(밴) 요금
Uber가 가이드보다 싸더라도 실제 가격 그대로 표시 (신뢰도)
가이드 장점으로 전환 유도: 한국어 소통, 대기시간 0, 짐 보관, 가이드 해설
```

##### 5. 대중교통 (Google Routes 실시간)

```
요금 소스: Google Routes API transitFare (실시간 실제 요금)
최적 패스 자동 선택:
  1일: 개별 vs 나비고 일일권 비교
  2~4일: 나비고 일일권
  5일+: 나비고 주간권
인당: 각자 티켓 (× 인원수)
```

##### 6. 식사비 (travelStyle별)

```
Economic:   €23/일 (점심 €8, 저녁 €15)
Reasonable: €60/일 (점심 €21, 저녁 €39)
Premium:    €110/일 (점심 €39, 저녁 €72)
Luxury:     €160/일 (점심 €56, 저녁 €104)

배분: 점심 35% / 저녁 65%
DB에 실제 가격(estimatedPriceEur) 있으면 실제 가격 우선
```

##### 7. 입장료/액티비티 (통합 필드: entranceFee)

```
데이터 소스 우선순위:
  1순위: DB 시딩 데이터 (공식 홈페이지)
  2순위: 마이리얼트립 가격
  3순위: 트립닷컴 가격
  4순위: 클룩 가격
  5순위: 타입별 기본값 (museum €15, landmark €12, park €0, church €5)

표시: 범위 → 최대값 (€15~25 → €25), 무료 → €0
포함: 입장료 + 전망대 + 크루즈 + 체험 = 모두 entranceFee
```

##### 8. 일일/총 합계

```
일일 총비용 = 식사비(점심+저녁) + 교통비(전 구간 합) + 입장료(전 장소 합)
인당 일일비용 = 일일 총비용 ÷ 인원수
총 여행비용 = Σ(일일 총비용)
인당 총비용 = 총 여행비용 ÷ 인원수
환율: EUR + KRW 병기 (exchange-rate.ts, 실시간 Frankfurter API)
```

#### 성능 비교

| 단계 | 현재 구조 | 4+1 에이전트 |
|------|-----------|-------------|
| 초기 설정 | 0.1초 | AG1: 0.3초 |
| Gemini 호출 | **39초** (27곳 전체) | AG2: **5~8초** (역할별 2~3곳명만) |
| DB 보강 | 0.6초 | AG3: 1~2초 (매칭+확정+동선) |
| 점수/정렬 | 0.6초 | AG3에 포함 |
| 비용/교통 | 0.3초 | AG4: 1~2초 (날씨/환율 추가) |
| **합계** | **~40초** | **~8~12초** |

#### 핵심 변경 파일 (구현 완료)
- `server/services/agents/` 디렉토리 신규 생성 (6개 파일)
  - `types.ts`: 공통 타입 + 상수 (PlaceResult, AG1Output, AG3Output, PACE_CONFIG 등)
  - `ag1-skeleton-builder.ts`: buildSkeleton() — 사용자 입력→뼈대 (0.2~0.5초)
  - `ag2-gemini-recommender.ts`: generateRecommendations() — 간소화 Gemini (5~8초)
  - `ag3-data-matcher.ts`: preloadCityData()+matchPlacesWithDB()+saveNewPlacesToDB()
  - `ag4-realtime-finalizer.ts`: finalizeItinerary() — 이동/비용/환율/검증 (1~2초)
  - `orchestrator.ts`: runPipeline() — AG1→AG2||AG3pre→AG3→AG4 순차/병렬
- `server/services/itinerary-generator.ts`: generateItinerary()→orchestrator 위임, `_enrichmentPipeline` 래퍼 노출

### 핵심 코드 구조 (후임 AI 필독)

**🔥 4+1 에이전트 파이프라인 (v2, 2026-02-08 구현)**
- **agents/orchestrator.ts**: 메인 파이프라인 (AG1→AG2||AG3pre→AG3→AG4)
- **agents/ag1-skeleton-builder.ts**: 뼈대 설계 (0.2~0.5초, AI 호출 없음)
  - 사용자 입력 파싱, 슬롯 계산, 한국 감성 로드
- **agents/ag2-gemini-recommender.ts**: Gemini 최소 추천 (5~8초)
  - 프롬프트 80% 축소 (2000자→500자), 장소명+이유만 요청
- **agents/ag3-data-matcher.ts**: 데이터 매칭/확정 (1~2초)
  - DB 사전 로드 (AG2와 병렬), 이름 매칭, Google Places API 좌표 확보
- **agents/ag4-realtime-finalizer.ts**: 실시간 완성 (1~2초)
  - 교통비, 환율(EUR↔KRW), 일일 비용 합계, 좌표 검증
- **agents/types.ts**: 공통 타입 (PlaceResult, AG1Output, AG3Output, 상수)

**레거시 (agents 파이프라인에서 활용)**
- **itinerary-generator.ts**: 기존 스코어링/enrichment 함수 보유, `_enrichmentPipeline` 래퍼로 AG3에 노출
  - `generateItinerary()` → orchestrator.runPipeline() 위임
  - `_enrichmentPipeline.runFullEnrichment()` → 한국인기도/TripAdvisor/포토스팟/점수/슬롯배분/동선최적화
- **route-optimizer.ts**: Google Routes API 연동, nearest-neighbor+2-opt, 경로 캐싱
- **transport-pricing-service.ts**: 교통비 산정 (WalkMore=대중교통, Moderate=대중교통+Uber, Minimal=가이드)
- **exchange-rate.ts**: Frankfurter API 환율 (KRW↔EUR 등), DB 캐싱
- **TripPlannerScreen.tsx**: 전체 프론트엔드 (입력폼 + 결과 + 로딩 + 숙소 설정/변경)
- **PlaceAutocomplete.tsx**: Google Places Autocomplete (서버 프록시, API 키 보호)
- **server/routes.ts**: `/api/places/autocomplete`, `/api/places/details` 프록시 API

### 알려진 이슈
- Seedance 영상 모델: ModelNotOpen 상태 (활성화 대기 중)
- 나머지 캐릭터 4명 미생성 (M5, M6, F4, F6)
- 사진 URL에 Google API 키 노출 (향후 개선)
- transport-pricing-service.ts에 파리 요금 하드코딩 (도시별 실시간 요금으로 교체 필요)

---

## 1. 프로젝트 현황 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 프론트엔드 (React Native Expo) | 운영 중 | 웹/iOS/Android |
| 백엔드 (Express + TypeScript) | 운영 중 | Koyeb 배포 |
| 데이터베이스 (Supabase PostgreSQL) | 운영 중 | 65개 도시 (시딩 진행 중) |
| 관리자 대시보드 | 운영 중 | 비밀번호 인증 + 모달 |
| 데이터 자동 수집 | 운영 중 | node-cron 스케줄러 |
| 장소 바이브 시딩 | 운영 중 | 6바이브 x 5타입, 우선순위 자동 수집 |
| 배포 URL | 운영 중 | https://legal-dannye-dbstour-4e6b86d5.koyeb.app |
| GitHub | 운영 중 | cursor-dev 브랜치 |

---

## 2. 데이터 자동 수집 스케줄

| 수집 대상 | 주기 | 상태 | 비고 |
|-----------|------|------|------|
| 날씨 (OpenWeather) | 매 시간 | 자동 | 전체 도시 |
| 환율 | 하루 3번 | 자동 | KRW 기준 |
| 위기 정보 (파업/시위) | 30분마다 | 자동 | 서버 시작 1분 후 즉시 수집 |
| YouTube 채널 | 하루 2번 | 자동 | 18개 채널 |
| 네이버 블로그 | 하루 2번 | 자동 | 7개 소스 |
| 티스토리 블로그 | 하루 2번 | 자동 | |
| 인스타그램 | 하루 2번 | 자동 | 해시태그 수집 |
| 미쉐린 가이드 | 하루 1번 | 자동 | |
| TripAdvisor | 하루 1번 | 자동 | |
| 가격 정보 | 하루 2번 | 자동 | |
| 한국 플랫폼 (마이리얼트립/클룩) | 하루 1번 | 자동 | 05:00 KST |
| 패키지 투어 검증 | 하루 1번 | 자동 | 05:30 KST |
| 포토스팟 점수 | 하루 1번 | 자동 | 06:00 KST |
| **장소 바이브 시딩** | **6시간마다** | **자동** | **서버 시작 2분 후 즉시 + 연쇄 실행** |

---

## 3. 일일 작업 기록

### 2026-02-08 (일) - 4+1 에이전트 파이프라인 구현 + 동선 최적화

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | **숙소 입력 UI** (Google Places Autocomplete + 서버 프록시) | 완료 | 프론트 | `PlaceAutocomplete.tsx` (신규), `TripPlannerScreen.tsx` |
| 2 | **목적지 입력 Autocomplete** (도시 검색 + 좌표 자동 확보) | 완료 | 프론트 | `TripPlannerScreen.tsx` |
| 3 | **TripFormData 숙소 필드 확장** (name/address/coords/placeId) | 완료 | 타입 | `client/types/trip.ts` |
| 4 | **서버 프록시 API** (`/api/places/autocomplete`, `/api/places/details`) | 완료 | 서버 | `server/routes.ts` |
| 5 | **동선 최적화** (숙소 기반 nearest-neighbor+2-opt 원형 경로) | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 6 | **Day별 재최적화** (숙소 변경 시 해당 Day 자동 재배열) | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 7 | **결과 화면 숙소 표시** (숙소 바 + 변경 + 재최적화 로딩 + 복귀 이동시간) | 완료 | 프론트 | `TripPlannerScreen.tsx` |
| 8 | **한국인 선호 최신 가중치 1.5x** (인스타/유튜브/블로그 6개월 이내 데이터) | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 9 | TASK.md 전체 정리 (완료/미완료 구분, 플랜 통합) | 완료 | 문서 | `docs/TASK.md` |
| 10 | .cursor/plans/ 임시 파일 57개 정리 | 완료 | 정리 | `.cursor/plans/` |
| 11 | **[핵심] AG1 뼈대 설계자 구현** (사용자 입력 파싱, 슬롯 계산, 감성 로드) | 완료 | 성능 | `agents/ag1-skeleton-builder.ts` (신규) |
| 12 | **[핵심] AG2 Gemini 최소 추천 구현** (프롬프트 80% 축소, 장소명+이유만) | 완료 | 성능 | `agents/ag2-gemini-recommender.ts` (신규) |
| 13 | **[핵심] AG3 데이터 매칭/확정 구현** (DB 사전로드, 이름매칭, Google Places 좌표확보) | 완료 | 성능 | `agents/ag3-data-matcher.ts` (신규) |
| 14 | **[핵심] AG4 실시간 완성 구현** (교통비, 환율, 비용합계, 좌표검증, JSON완성) | 완료 | 성능 | `agents/ag4-realtime-finalizer.ts` (신규) |
| 15 | **[핵심] 오케스트레이터 구현** (AG1→AG2+AG3pre 병렬→AG3→AG4 순차) | 완료 | 성능 | `agents/orchestrator.ts` (신규) |
| 16 | **공통 타입 정의** (PlaceResult, AG1Output, AG3Output, 상수 등) | 완료 | 타입 | `agents/types.ts` (신규) |
| 17 | **itinerary-generator.ts 리팩토링** (오케스트레이터 위임 + enrichment 래퍼 노출) | 완료 | 성능 | `itinerary-generator.ts` |
| 18 | **서버 빌드 검증** (esbuild 번들 721kb, 에러 0) | 완료 | 검증 | `server_dist/index.js` |

### 2026-02-07 (금) - 장소 시딩 시스템 + 알고리즘 Phase 1

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | **장소 시딩 시스템 신규** (6바이브 x 5타입 Google Places + Wikimedia + OpenTripMap) | 완료 | 시딩 | `place-seeder.ts` (신규) |
| 2 | 시딩 우선순위 적용 (유럽5 → 프랑스30 → 유럽30 → 나머지) | 완료 | 시딩 | `place-seeder.ts` |
| 3 | 프랑스 관광도시 26개 추가 (보르도,스트라스부르,콜마르,아비뇽,칸 등) | 완료 | 데이터 | `routes.ts` |
| 4 | 스톡홀름/헬싱키 추가 (유럽 도시 총 65개) | 완료 | 데이터 | `routes.ts` |
| 5 | 스케줄러에 place_seed_sync 추가 (6시간마다 + 서버시작 2분후) | 완료 | 스케줄 | `data-scheduler.ts` |
| 6 | 시딩 관리자 API 4개 추가 (city/batch/all/status) | 완료 | API | `admin-routes.ts` |
| 7 | admin 대시보드 Google Places 버튼 → 바이브 시딩으로 업그레이드 | 완료 | 대시보드 | `admin-dashboard.html` |
| 8 | 일정 생성 시 장소 자동 DB 저장 (백그라운드) | 완료 | 파이프라인 | `itinerary-generator.ts` |
| 9 | start-server.bat 경로 수정 (nubi-clean) | 완료 | 환경 | `start-server.bat` |
| 10 | **한국 플랫폼 크롤러 신규** (마이리얼트립/클룩/트립닷컴 가격+리뷰) | 완료 | 크롤러 | `korean-platform-crawler.ts` (신규) |
| 11 | **패키지 투어 검증 신규** (하나투어/모두투어/참좋은여행/노랑풍선) | 완료 | 크롤러 | `package-tour-validator.ts` (신규) |
| 12 | **포토스팟 점수 신규** (Instagram40%+Google30%+Gemini30%) | 완료 | 크롤러 | `photospot-scorer.ts` (신규) |
| 13 | **식당 선정 로직 강화** (리뷰수40%+한국리뷰25%+인스타15%+유튜브10%+블로그10%) | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 14 | **최종 6요소 정렬 공식** (한국인기30%+포토20%+유명세15%+분위기15%+가성비10%+실용10%) | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 15 | **바이브별 동적 가중치 매트릭스** (6바이브 × 6요소 가중치 자동 조정) | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 16 | **데이터 적응형 보정** (A/B/C/D 등급 자동 판단 → 가중치 재분배) | 완료 | 알고리즘 | `itinerary-generator.ts` |

### 2026-02-06 (목) - 관제탑 구축 Day 2

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | Koyeb 배포 - admin 500 에러 수정 | 완료 | 배포 | `Dockerfile`, `server/admin-routes.ts` |
| 2 | esbuild 포맷 ESM→CJS 변경 (__dirname 지원) | 완료 | 빌드 | `package.json` |
| 3 | Dockerfile에 templates/data 파일 복사 추가 | 완료 | 배포 | `Dockerfile` |
| 4 | CORS에 Koyeb 도메인 + 프로덕션 허용 추가 | 완료 | 서버 | `server/index.ts` |
| 5 | 관리자 대시보드 비밀번호 인증 추가 | 완료 | 프론트 | `client/screens/AdminScreen.tsx` |
| 6 | 관리자 대시보드 X 닫기 버튼 (모달 방식) | 완료 | 프론트 | `AdminScreen.tsx`, `RootStackNavigator.tsx` |
| 7 | 설정 탭 → 모달로 전환 (tabPress 리스너) | 완료 | 네비게이션 | `MainTabNavigator.tsx` |
| 8 | 웹에서 iframe으로 대시보드 직접 표시 | 완료 | 프론트 | `AdminScreen.tsx` |
| 9 | TASK.md 통합 관리 문서로 리팩토링 | 완료 | 문서 | `docs/TASK.md` |
| 10 | 관리자 대시보드 JS 에러 수정 (event.target/null) | 완료 | 대시보드 | `admin-dashboard.html` |
| 11 | **전체 대시보드 버튼-API 연결 감사** | 완료 | 관제탑 | 50+버튼, 60+API 교차점검 |
| 12 | Instagram: topPosts → instagramPhotos 저장 로직 | 완료 | 크롤러 | `instagram-crawler.ts` |
| 13 | YouTube: API키 동적 로드 (getter) | 완료 | 크롤러 | `youtube-crawler.ts` |
| 14 | syncGooglePlaces 경로 불일치 수정 | 완료 | 대시보드 | `admin-dashboard.html` |
| 15 | Replit 의존성 제거 (4개 크롤러) | 완료 | 크롤러 | `weather/tripadvisor/price/michelin-crawler.ts` |
| 16 | Gemini AI 동적 초기화 (5개 서비스) | 완료 | 크롤러 | `youtube/vibe/taste-verifier.ts` |
| 17 | **Gemini 3.0 모델 전체 통일** | 완료 | AI | 전체 서비스 `gemini-3-flash-preview` |
| 18 | **Replit/Neon 완전 제거** (12파일 삭제, 41파일 수정) | 완료 | 정리 | 전체 코드베이스 |
| 19 | **Instagram 크롤러 근본 수정** (HTML스크랩→Gemini웹검색) | 완료 | 크롤러 | `instagram-crawler.ts` |
| 20 | **YouTube isProcessed 로직 수정** (0건 추출시 재시도) | 완료 | 크롤러 | `youtube-crawler.ts` |
| 21 | YouTube 영상 재처리 리셋 API 추가 | 완료 | API | `admin-routes.ts` |
| 22 | Instagram 25개 해시태그 전체 데이터 수집 확인 | 완료 | 검증 | postCount 전부 수집됨 |
| 23 | YouTube 장소 추출 0→9건 확인 | 완료 | 검증 | placeMentions 작동 확인 |
| 24 | **TripAdvisor 데이터를 일정표 생성에 통합** | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 25 | **실제 가격 정보(placePrices) 일정표에 반영** | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 26 | 최종 정렬 공식 개선 (vibe35%+인기55%+TA10%) | 완료 | 알고리즘 | `itinerary-generator.ts` |
| 27 | Instagram DOM null 접근 콘솔 에러 수정 | 완료 | 대시보드 | `admin-dashboard.html` |

### 2026-02-02 (일)

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | 로컬 서버 실행 환경 구성 | 완료 | 서버 | `.env` |
| 2 | test-video-ui.ts 한글 문법 오류 수정 | 완료 | 서버 | `server/test-video-ui.ts` |
| 3 | Expo 웹 빌드 (dist/ 생성) | 완료 | 빌드 | `dist/` |
| 4 | Koyeb 배포 (Dockerfile 작성) | 완료 | 배포 | `Dockerfile`, `.dockerignore` |
| 5 | round2 함수 export 수정 | 완료 | 서버 | `transport-pricing-service.ts` |
| 6 | package.json "type":"module" 제거 | 완료 | 빌드 | `package.json` |
| 7 | @google/generative-ai 패키지 추가 | 완료 | 의존성 | `package.json` |
| 8 | getApiUrl() 프로덕션 상대경로 수정 | 완료 | 프론트 | `client/lib/query-client.ts` |

### 2026-01-27 (월) - Phase E 영상

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | Test Video UI 버그 수정 | 완료 | 서버 | `server/test-video-ui.ts` |
| 2 | 여행 일정 rawData JSONB 파싱 로직 | 완료 | 서버 | `server/routes.ts` |
| 3 | 지브리 스타일 프롬프트 최적화 | 완료 | AI | - |
| 4 | mobilityStyle 중복 코드 수정 | 완료 | 프론트 | `TripPlannerScreen.tsx` |

### 2026-01-26 (일) - Phase E 영상

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | 일정 저장 버튼 UI | 완료 | 프론트 | `TripPlannerScreen.tsx` |
| 2 | 프로필 - 나의 여정/영상 섹션 | 완료 | 프론트 | `ProfileScreen.tsx` |
| 3 | 일정 상세 화면 (영상 생성/재생) | 완료 | 프론트 | `SavedTripDetailScreen.tsx` |
| 4 | 영상 60초 강제 설정 | 완료 | 서버 | `server/routes.ts` |
| 5 | 로그인 우회 (admin 계정) | 완료 | 서버 | `server/routes.ts` |
| 6 | Expo 패키지 설치 (expo-av 등) | 완료 | 의존성 | `package.json` |

### 2026-01-25 (토) - Phase E 영상

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | Remotion 패키지/설정 | 완료 | 환경 | `package.json`, `remotion.config.ts` |
| 2 | 캐릭터 10명 이미지 생성 (지블리) | 완료 | 에셋 | `public/characters/` |
| 3 | TravelScene.tsx (Ken Burns 효과) | 완료 | 프론트 | `src/remotion/TravelScene.tsx` |
| 4 | Seedance API 연동 | 완료 | 서버 | `seedance-video-generator.ts` |
| 5 | 영상 생성 API 엔드포인트 | 완료 | 서버 | `server/routes.ts` |

### 2026-01-16 (목)

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | 하단 탭 5개 구성 | 완료 | 네비게이션 | `MainTabNavigator.tsx` |
| 2 | 지도 탭 토글 기능 | 완료 | 프론트 | `MapToggleContext.tsx` |
| 3 | 전문가 검증 CTA 하단탭 이동 | 완료 | 프론트 | `TripPlannerScreen.tsx` |
| 4 | 이동 거리/가격 백엔드 연결 | 완료 | 서버 | `itinerary-generator.ts` |
| 5 | cursor-dev 브랜치 생성 및 푸시 | 완료 | Git | - |

---

## 4. 미완료 / 진행 예정 작업

### 우선순위: 높음 (1차 목표 실행 플랜 연계)

| # | 작업 | 상태 | 카테고리 | 비고 |
|---|------|------|----------|------|
| 1 | **장소 시딩 1차 목표: 유럽 5개 도시** (파리,런던,로마,바르셀로나,프라하) | 진행 중 | 시딩 | 서버 배포 후 자동 실행 |
| 2 | **장소 시딩 2차: 프랑스 30개 관광도시** | 대기 | 시딩 | 1차 완료 후 자동 이어서 |
| 3 | **장소 시딩 3차: 유럽 30개 도시** | 대기 | 시딩 | 2차 완료 후 자동 이어서 |
| 4 | 실제 사용자 테스트 (60초 영상 생성) | 대기 | 영상 | Seedance 모델 활성화 필요 |
| 5 | 여정 생성 + 예산 병렬 처리 | 미착수 | 성능 | Promise.all 적용 |
| 6 | ~~식사 슬롯 필수 포함~~ | **완료** | AI | 점심1+저녁1 강제, 4대 원칙 적용 |
| 7 | 위기 경보 깜박이는 경고 | 미착수 | 프론트 | 상단 경고 아이콘 |

### 우선순위: 중간

| # | 작업 | 상태 | 카테고리 | 비고 |
|---|------|------|----------|------|
| 7 | 감성 데이터 표시 (AI 추천 대체) | 미착수 | 프론트 | 백종원 언급/네이버 인기/인스타 핫플 |
| 8 | 썸네일 이미지 필수 표시 | 미착수 | 프론트 | Google Places/Instagram |
| 9 | NUBI 추천 점수 (별표+소숫점) | 미착수 | 프론트 | NUBI 4.7 스타일 |
| 10 | 날씨/위기 경보 일정표 상단 표시 | 미착수 | 프론트 | OpenWeather 연동 |
| 11 | 나머지 캐릭터 4명 생성 (M5,M6,F4,F6) | 미착수 | 에셋 | 14명 중 10명 완료 |

### 우선순위: 낮음

| # | 작업 | 상태 | 카테고리 | 비고 |
|---|------|------|----------|------|
| 12 | 전문가 검증 마크 | 미착수 | 프론트 | 인증마크 UI |
| 13 | 저장 버튼 최종 구현 | 미착수 | 프론트 | 프로필에 저장 |
| 14 | 다중 씬 합성 (Remotion) | 미착수 | 영상 | 8클립 x 8초 합성 |
| 15 | TTS 음성 연동 | 미착수 | 영상 | 캐릭터 대사 |
| 16 | React Native 영상 재생 연동 | 미착수 | 프론트 | expo-video |

---

## 5. 도시 및 장소 시딩 현황

> **총 71개 도시 등록 완료** (2026-02-08). 장소 시딩은 배포 후 검증 완료 후 실행 예정.

| 분류 | 도시 수 | DB 상태 | 장소 데이터 |
|------|---------|---------|------------|
| **프랑스** | **30개** | ✅ 등록 완료 (nameEn/nameLocal) | 파리·니스만 기존 데이터, 28개 시딩 대기 |
| **유럽 (프랑스 제외)** | **32개** | ✅ 등록 완료 (nameEn/nameLocal) | 대부분 기존 데이터, 4개 시딩 대기 |
| 기타 (아시아/미주) | 9개 | ✅ 등록 완료 | 기존 데이터 |

### 프랑스 30개 도시 목록
파리, 니스, 마르세유, 리옹, 보르도, 툴루즈, 스트라스부르, 릴, 낭트, 몽펠리에, 렌, 디종, 아비뇽, 엑상프로방스, 칸, 생트로페, 에즈, 앙티브, 그라스, 생폴드방스, 콜마르, 루앙, 몽생미셸, 생말로, 에트르타, 베르사유, 지베르니, 안시, 샤모니, 카르카손

### 유럽 32개 도시 목록 (프랑스 제외)
로마, 밀라노, 베니스, 피렌체, 아말피(IT) / 바르셀로나, 마드리드, 세비야(ES) / 런던, 에든버러(GB) / 뮌헨, 베를린, 프랑크푸르트(DE) / 취리히, 인터라켄, 루체른(CH) / 비엔나, 잘츠부르크(AT) / 암스테르담(NL) / 프라하(CZ) / 부다페스트(HU) / 리스본, 포르투(PT) / 아테네, 산토리니(GR) / 브뤼셀(BE) / 코펜하겐(DK) / 스톡홀름(SE) / 오슬로(NO) / 더블린(IE) / 두브로브니크(HR) / 모나코(MC)

### 시딩 방식 (최적화 완료)
- **정렬**: `rankPreference: "POPULARITY"` (구글 리뷰 많은 순 = 유명세)
- **카테고리**: 4개 (관광지, 레스토랑, 카페, 호텔) — 기존 30회 → **4회 API 호출** (87% 절감)
- **도시당 결과**: ~50~60개 장소 (중복 제거 후, 인기순)
- **데이터 규약**: googlePlaceId + displayNameKo + aliases 자동 저장
- **보강**: Wikimedia 사진 + OpenTripMap 설명 (무료)
- **비용 예상**: 전체 ~$37 (Google $200/월 무료 크레딧 범위 내, 실제 청구 $0)
- **일일 제한**: 500회/일 → 약 5~6개 도시/일

---

## 6. 캐릭터 시스템 현황

| ID | 연령대 | 성별 | 상태 | 파일명 |
|----|--------|------|------|--------|
| M1 | 5-9세 | 남 | 완료 | `char_m1_boy_child_*.png` |
| F1 | 5-9세 | 여 | 완료 | `char_f1_girl_child_*.png` |
| M2 | 13-17세 | 남 | 완료 | `char_m2_teen_boy_*.png` |
| F2 | 13-17세 | 여 | 완료 | `char_f2_teen_girl_*.png` |
| M3 | 20대 | 남 | 완료 | `char_m3_20s_male_*.png` |
| F3 | 20대 | 여 | 완료 | `char_f3_20s_female_*.png` |
| M4 | 30대 | 남 | 완료 | `char_m4_stylish_30s_*.png` |
| F4 | 40대 | 여 | 미생성 | - |
| M5 | 40대 | 남 | 미생성 | - |
| F5 | 50대 | 여 | 완료 | `char_f5_elegant_40s_*.png` |
| M6 | 50대 | 남 | 미생성 | - |
| F6 | 50대 | 여 | 미생성 | - |
| M7 | 60대+ | 남 | 완료 | `char_m7_distinguished_60s_*.png` |
| F7 | 60대+ | 여 | 완료 | `char_f7_graceful_60s_*.png` |

> 총 생성: 10/14명 (71%)

---

## 7. 인원수 기준 확정

| companionType | 인원수 | 차량 |
|---------------|--------|------|
| Single | 1명 | - |
| Couple | 2명 | - |
| Family | 4명 | 승용차 |
| ExtendedFamily | 8명 | 밴 |
| Group | 10명 | 미니버스 |

---

## 8. API 키 관리 현황

| API 키 | 저장 위치 | 상태 |
|--------|-----------|------|
| GEMINI_API_KEY | Supabase DB (api_keys 테이블) | 활성 |
| GOOGLE_MAPS_API_KEY | Supabase DB | 활성 |
| OPENWEATHER_API_KEY | Supabase DB | 활성 |
| SEEDANCE_API_KEY | Supabase DB | 등록됨 |
| DATABASE_URL | Koyeb 환경변수 | 활성 |

> API 키는 관리자 대시보드에서 추가/수정/테스트 가능

---

## 9. 기술 스택 요약

| 구분 | 기술 | 용도 |
|------|------|------|
| 프론트엔드 | React Native (Expo) | 모바일/웹 앱 |
| 백엔드 | Express + TypeScript | API 서버 |
| 데이터베이스 | PostgreSQL (Supabase) | 데이터 저장 |
| ORM | Drizzle ORM | DB 쿼리 |
| AI | Gemini 3.0 Flash (gemini-3-flash-preview) | 일정 생성/분석 |
| 영상 | Seedance 1.5 Pro + Remotion | 감동 영상 |
| 빌드 | esbuild (CJS) | 서버 번들링 |
| 배포 | Koyeb (Docker) | 무료 호스팅 |
| 버전관리 | GitHub | cursor-dev 브랜치 |

---

## 10. 핵심 알고리즘 (참조용 - 상세는 NUBI_WHITEPAPER.md)

```
Final Score = (Vibe + Buzz + Taste) - Reality Penalty

Vibe Score (0-10)  : Gemini Vision 분석 (사진 구도, 색감, 감성)
Buzz Score (0-10)  : 다중 소스 인기도 (Google, TripAdvisor, 리뷰 수)
Taste Score (0-10) : 오리지널 맛 검증 (본고장 언어 리뷰 기반)
Reality Penalty (0-5) : 날씨, 안전, 혼잡도 패널티
```

---

## 11. 참조 문서 안내

| 문서 | 내용 | 수정 가능 |
|------|------|-----------|
| `docs/PRD.md` | 제품 요구사항 정의서 | 아니오 (고정) |
| `docs/TRD.md` | 기술 요구사항 정의서 | 아니오 (고정) |
| `docs/NUBI_WHITEPAPER.md` | 핵심 알고리즘 백서 | 아니오 (고정) |
| `docs/PHASE_E_ARCHITECTURE.md` | 영상 아키텍처 설계 | 아니오 (참조) |
| `docs/PHASE_E_VIDEO_MAPPING.md` | 영상 프롬프트 매핑 | 아니오 (참조) |
| `docs/PHASE_E_TASK.md` | Phase E 작업 기록 | 아니오 (이관 완료) |
| `docs/PHASE_E_WORKLOG.md` | Phase E 구현 기록 | 아니오 (이관 완료) |

---

## 변경 이력

| 날짜 | 변경 내용 | 작업자 |
|------|-----------|--------|
| 2026-02-08 야간 | **에이전트 통합 규약 + DB 확장 + 71개 도시 + 시더 최적화** (AGENT_PROTOCOL.md, nameEn/aliases 마이그레이션, 프랑스28+유럽4 추가, POPULARITY 정렬, 87% 비용 절감) | Cursor AI |
| 2026-02-08 | **4+1 에이전트 파이프라인 구현 완료** (AG1~AG4+오케스트레이터, Gemini 80% 축소, 환율/비용/검증 추가) | Cursor AI |
| 2026-02-08 | 성능 분석(Gemini 39초 병목 확인) + 4+1 에이전트 파이프라인 아키텍처 설계 | Cursor AI |
| 2026-02-08 | 동선최적화+숙소설정 완료, 한국인선호 1.5x, TASK.md 전체정리, 플랜 임시파일 정리 | Cursor AI |
| 2026-02-07 | 장소 시딩 시스템 구축 + 프랑스 30개 도시 추가 + 시딩 현황 섹션 추가 | Cursor AI |
| 2026-02-06 | TASK.md 통합 관리 문서로 리팩토링 | Cursor AI |
| 2026-01-27 | Phase E 영상 디버깅 기록 | Cursor AI |
| 2026-01-26 | Phase E 일정 저장/영상 생성 | Cursor AI |
| 2026-01-25 | Phase E 캐릭터/Remotion 생성 | Cursor AI |
| 2026-01-16 | 최초 작성 (탭 구성/지도 토글) | Cursor AI |
