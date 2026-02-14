# NUBI 프로젝트 태스크 관리

> **최종 업데이트: 2026-02-14**
> **완료된 작업 이력: `docs/TASK_ARCHIVE.md`**
> **AI 규칙: `.cursor/rules/*.mdc` (10개 파일, 항상 자동 적용. 검증 헌법: nubi-verification-constitution.mdc)**

---

## 0. 현재 진행 상태 (AI 핸드오프용)

> 이 섹션은 `.cursor/rules/nubi-handoff.mdc`와 동기화. 상세 상태는 handoff 참조.

| 항목 | 내용 |
|------|------|
| **마지막 작업일** | 2026-02-14 |
| **마지막 작업** | MCP 워크플로우(start/resume/status/report) + data_sync_log 체크포인트 구현. 파리 파일럿 1차 150/150, 2차 148/150 확인. |
| **다음 할 일** | 파리 `adventure` 2건 누락 매칭 보완 후 2차 150/150 달성 및 PASS 보고 |
| **배포 상태** | Koyeb 정상 (200 OK). 커밋·푸시 시 자동 배포. 로컬 = 내부테스트용. |
| **브랜치** | cursor-dev |

---

## 오늘 할 일 (시딩·카테고리 정리)

### 시딩 원칙 (확정)
- **순서**: 파리 → 프랑스 29개 도시 → 유럽 30개 도시 (도시별 카테고리 30개씩 채우는 순서)
- **분류**: 비용 내고 가져온 모든 도시 데이터 → 5카테고리로 전부 분류 (제외 없음)
- **도시당**: 도심 반경 50km (Google API 최대), **카테고리 5개별 구글 리뷰 상위 30곳** → 30×5 = 150장소
- **1일 1카테고리**: 오늘의 카테고리(attraction→restaurant→healing→adventure→hotspot) 처리 → 시딩(필요 시) + **크롤러 자동 실행**(Wikimedia·OpenTripMap·장소매칭 등) → 프론트까지 데이터 완성
- **5카테고리 다 30개 달성** → 다음 도시로 전환 (파리 완료 → 프랑스29 → 유럽30)

### 시딩 카테고리 5개 (4+1, Vibe 매칭) — 반드시 5개 모두 DB에 존재
| 순서 | 시딩 카테고리 | seed_category | 포함 Vibe | 비고 |
|------|----------------|---------------|-----------|------|
| 1 | 명소 | attraction | Culture, Romantic | 기본값(나머지) |
| 2 | 맛집 | restaurant | Foodie | type=restaurant/cafe 포함 |
| 3 | 힐링 | healing | Healing | |
| 4 | 모험 | adventure | Adventure | editorialSummary/name에 zoo·놀이공원·hiking 등 있으면 추정 |
| 5 | 핫스팟 | hotspot | Hotspot | tourist_attraction |
- **호텔** 시딩 카테고리 제거 (불필요).

### reclassify 분류 규칙 (place-seeder derive)
1. vibeKeywords "Hotspot" → hotspot
2. vibeKeywords "Foodie" → restaurant
3. vibeKeywords "Healing" → healing
4. vibeKeywords "Adventure" → adventure
5. type=restaurant/cafe → restaurant
6. **추정**: type=attraction이고 editorialSummary 또는 name에 모험·zoo·놀이공원·테마파크·hiking·등산 등 포함 → adventure
7. 그 외 → attraction

### Vibe 6개 ↔ 시딩 카테고리
- Healing → 힐링(3) | Adventure → 모험(4) | Hotspot → 핫스팟(5) | Romantic, Culture → 명소(1) | Foodie → 맛집(2)

### Google Places API — 무료티어 내 가져올 필드 (2025.3월 기준)

> **참고**: 2025.3월부터 $200/월 크레딧 대신 **SKU별 무료 사용량** 적용. 요청 시 **가장 비싼 SKU** 기준 과금.

| SKU | 무료/월 | 비고 |
|-----|--------|------|
| Place Details Essentials | 10,000 | id, name, formattedAddress, location |
| Place Details Pro | 5,000 | displayName, businessStatus, primaryType, googleMapsUri |
| Place Details Enterprise | 1,000 | rating, userRatingCount, priceLevel, regularOpeningHours, internationalPhoneNumber |
| Place Details Enterprise + Atmosphere | 1,000 | editorialSummary, delivery, dineIn 등 — **가장 비쌈** |
| Nearby Search Pro | 5,000 | 검색 1회 = 1건 |

**NUBI에 꼭 필요한 필드** (DB 채우기)
- Essentials: id, name, formattedAddress, location
- Pro: displayName, businessStatus, primaryType, googleMapsUri, types, photos
- Enterprise: rating, userRatingCount, priceLevel, regularOpeningHours, internationalPhoneNumber, websiteUri

**요청하면 비용 급증·DB null 많은 필드**
- editorialSummary → Enterprise+Atmosphere (비쌈). OpenTripMap/Wikimedia로 대체 가능
- shortFormattedAddress → Pro (불필요 시 제거)
- primaryTypeDisplayName → Pro (primaryType만으로 충분)
- delivery, dineIn, takeout 등 Atmosphere → DB 대부분 null, 활용도 낮음

**권장**: editorialSummary 제거, Essentials+Pro+Enterprise(Atmosphere 제외)만 요청 → DB 핵심 컬럼 채우고 비용 절감

**적용 (google-places.ts)**: editorialSummary·shortFormattedAddress·primaryTypeDisplayName 제거. DAILY_API_LIMIT=33 (1,000/월÷30일)

### 일정 이미지 우선순위 (ag3-data-matcher)
- **순서**: 셀럽 인스타(1순위) > 인스타 > 위키메디어+구글(photoUrls) > place.image > Google API
- **DB 컬럼**: `celebrity_place_evidence.imageUrl`(20인 셀럽), `instagramPhotoUrls`(인스타), `photoUrls`(구글+위키메디어 append)
- **적용**: ag3 preload 시 `celebrityImageMap`·`instagramPhotoUrls` 조회, `resolvePlaceImage()` 로 선택

### 구현·DB 정리
- place-seeder: SEARCH_CATEGORIES 5개(명소/맛집/힐링/모험/핫스팟), hotel 제거, 맛집 통합, 카테고리당 API 1회
- 1일 1카테고리 추적: dataSyncLog에 entity_sub_type(또는 place_seed_batch) 검토
- 프론트 1줄: nubiReason 생성에 필요한 크롤러·place-linker 순서 유지
- **seed_category 분류 완료 (2026-02)**: 전 도시 1,713건 **5카테고리 모두** 보정 완료. 파리 183건: attraction 28, restaurant 80, healing 28, adventure 1, hotspot 44. `npx tsx dev/report-seed-category.ts`

---

## 1. 진행 중 작업

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| 1 | 슬롯 필수정보 보강 (검증 단계) | ❌ 미완료 | 메인 에이전트에서 누락 시 재조회·저장 |

---

## 2. 긴급 이슈

| # | 이슈 | 상태 | 해결 방법 |
|---|------|------|----------|
| 1 | **Google Maps/Places 대시보드 빨간불** | 미해결 | 건강체크가 Geocoding API 테스트 → Places API (New) 테스트로 변경 필요 |
| 2 | **Place Seed 0/71 도시** | 미해결 | Google Places API 활성 확인 후 파리부터 공식 시딩 |
| 3 | ~~API 비용 폭탄 (€1,171)~~ | **해결** | apiCallTracker, routeCallTracker 적용 완료 |

---

## 3. 진행 예정 작업 (우선순위순)

### 스트림 A: 백엔드 로직 완성

| # | 작업 | 상태 | 핵심 파일 |
|---|------|------|----------|
| A-1 | **city_transport_fares DB 테이블 생성** | 예정 | shared/schema.ts |
| A-2 | **60개 도시 교통 요금 수집** (우버블랙+대중교통) | 예정 | 크롤러/Gemini |
| A-3 | **transport-pricing 하드코딩→DB 조회 전환** | 예정 | transport-pricing-service.ts |
| A-4 | **주 1회 교통요금 자동 업데이트 스케줄러** | 예정 | data-scheduler.ts |
| A-5 | **미등록 도시: 실시간 API→DB 캐시** | 예정 | transport-pricing-service.ts |
| A-6 | 입장료 수집 강화 (실제 데이터 우선) | 예정 | price-crawler.ts |
| A-7 | 식사비 최대값 적용 (구글맵 추정치) | 예정 | pipeline-v3.ts |

### 스트림 B: 프론트엔드 UI/UX 개편

| # | 작업 | 상태 | 핵심 파일 |
|---|------|------|----------|
| B-1 | **nubiReason 표시** (크게/진하게, 절대 빈값 불가) | 예정 | TripPlannerScreen.tsx |
| B-2 | **교통비 A/B 분기 표시** (가이드 vs 대중교통) | 예정 | TripPlannerScreen.tsx |
| B-3 | **Pipeline V3 응답→프론트 데이터 매핑** | 예정 | TripPlannerScreen.tsx |
| B-4 | **긴 한 페이지 구조** (일별 탭 제거, 세로 나열) | 예정 | TripPlannerScreen.tsx |
| B-5 | **로딩 페이지 실시간 계산과정** (8-10단계 메시지) | 예정 | TripPlannerScreen.tsx |
| B-6 | 슬롯 색상 구분 (관광 파랑/점심 주황/저녁 빨강) | 예정 | TripPlannerScreen.tsx |
| B-7 | 상단 여행요약 (가중치 수식, 인당비용, 지도 토글) | 예정 | TripPlannerScreen.tsx |
| B-8 | 하단 5탭 개편 (일정/지도/전문가/프로필/설정) | 예정 | MainTabNavigator.tsx |
| B-9 | 썸네일 이미지 필수 (Google/인스타/Wikimedia) | 예정 | TripPlannerScreen.tsx |
| B-10 | 날씨/위기 경보 상단 표시 | 예정 | TripPlannerScreen.tsx |
| B-11 | NUBI 추천 점수 (별표+소수점) | 예정 | TripPlannerScreen.tsx |

### 스트림 C: 수익화

| # | 작업 | 상태 | 핵심 파일 |
|---|------|------|----------|
| C-1 | **가이드 예약 유도 폼** (업셀 클릭→장점+예약) | 예정 | 신규 |
| C-2 | Stripe/인앱결제 연동 | 예정 | 신규 |

### 스트림 D: 데이터 확보 — MCP 전환 (확정)

> **참조**: `docs/BACKEND_MCP_FINAL.md`

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| D-M1 | **place_seed_raw** 테이블 마이그레이션 | 진행 | Supabase 실제 스키마 제약(PK 누락) 보정 후 반영 |
| D-M2 | **mcp-raw-service** (1·2단계 MCP 호출) | 진행 | 워크플로우+체크포인트 구현, 운영 정책: 프랑스30 자동/유럽30 승인 후 수동 |
| D-M3 | **Admin API** mcp-raw/stage1, stage2 | 완료 | runBatchId 연동 완료 |
| D-M4 | **스케줄러** mcp_raw_stage1·2, place_seed_sync 비활성화 | 완료 | 비용 차단 정책 반영 완료 |
| D-M5 | **대시보드** MCP 섹션, 기존 시딩·크롤러 UI 축소 | 진행 | API는 준비 완료, UI 정리 잔여 |

### 스트림 D (구): 기존 place-seeder (MCP 전환 시 중단)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| D-1 | 장소 시딩 1차: 파리 | 진행 | MCP 전환 시 place_seed_sync 중단 |
| D-2 | 장소 시딩 2차: 프랑스 30개 | 대기 | |
| D-3 | 장소 시딩 3차: 유럽 30개 | 대기 | |

### 스트림 E: 영상 (우선순위 낮음)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| E-1 | Seedance 모델 활성화 대기 | 대기 | ModelNotOpen 상태 |
| E-2 | 나머지 캐릭터 4명 (F4,M5,M6,F6) | 미착수 | |
| E-3 | 다중 씬 합성 (Remotion) | 미착수 | |
| E-4 | TTS 음성 연동 | 미착수 | |

---

## 4. 수집 데이터 현황

| 데이터 | 수량 | 최근 동기화 |
|--------|------|------------|
| 도시 | 71개 | 2026-02-08 |
| 장소 | 1,713개 | 5카테고리 분류 완료 (파리 183건 등) |
| YouTube | 18채널, 54영상, 23언급 | 2026-02-09 |
| 네이버 블로그 | 1,239개 (14개 도시) | 2026-02-09 |
| 인스타그램 | 해시태그 3,327, 사진 4,280 | 2026-02-09 |
| 미슐랭 | 33개 (3스타2, 2스타3, 1스타1) | - |
| 웹 검색 캐시 | 6,703개 | - |
| 경로 캐시 | 199개 | - |
| 환율 | 60개 통화쌍 | 매일 자동 |
| 날씨 | 71개 도시 | 매시간 자동 |

---

## 5. 도시 현황 (71개)

| 분류 | 도시 수 | 시딩 상태 |
|------|---------|----------|
| 프랑스 | 30개 | 파리·니스만 기존 데이터, 28개 대기 |
| 유럽 (프랑스 제외) | 32개 | 대부분 기존 데이터, 시딩 대기 |
| 기타 (아시아/미주) | 9개 | 기존 데이터 |

---

## 6. 참조 문서

| 문서 | 용도 |
|------|------|
| `.cursor/rules/*.mdc` | AI 규칙 9개 (항상 자동 적용) |
| `docs/TASK_ARCHIVE.md` | 완료된 작업 이력 |
| `docs/PRD.md` | 제품 요구사항 (수정 금지) |
| `docs/TRD.md` | 기술 요구사항 (수정 금지) |
| `docs/NUBI_WHITEPAPER.md` | 핵심 알고리즘 백서 (수정 금지) |
| `docs/AGENT_PROTOCOL.md` | 에이전트 통신 규약 |
| `docs/MCP_RAW_DATA_PROMPTS.md` | MCP 로우데이터용 프롬프트: 1단계(기본 DB)·2단계(한국인 인지도), 도시별·카테고리별 템플릿 |
| `docs/MCP_AUTOMATION_DESIGN.md` | MCP 자동화 DB 설계 (place_seed_raw, 좌표 불필요) |
| `docs/BACKEND_MCP_FINAL.md` | **백그라운드 확정** — MCP 기반 아키텍처, 대시보드 수정 방향 |

---

## 7. 배포·테스트·시뮬레이션 요약 (분산 문서 통합)

> **규칙**: 새 .md 생성 금지. 모든 배포/테스트/시뮬 결과는 본 절에만 요약 추가.

| 주제 | 요약 |
|------|------|
| **Places API 가격** | 일 33건 제한(DAILY_API_LIMIT), 무료 1,000 caps/월. reviews 제거·FieldMask 최소화 반영. 시딩 시 33건만 Place Details. |
| **파리 로우데이터** | 파리 153건(attraction 68, restaurant 59, cafe 26, hotel 0). Naver 28·인스타 121·가격 651 연결. cafe 4건 추가 시 30건. |
| **Place Seed 반경** | CITY_SEARCH_RADIUS_METERS=50000(place-seeder.ts). Google Places API 최대 50km. 1차 목표 순서: 파리→프랑스30→유럽30. |
| **AG2 반경 100km** | AG2 프롬프트에 "100km radius" 추가, Paris 예시 명시. AGENT_PROTOCOL 반영. 배포 후 파리 generate로 검증. |
| **일정 검증(Verifier)** | score≥90 통과, itinerary-verifier.ts. 잘린 JSON 복구(verdict 적합·score 50 미만→90), maxOutputTokens 1024. 내부 2회차 200/score 95. 배포본 외부 1회 500 → 재테스트 권장. |
| **배포 콘솔 분석(2026-02-11)** | place_seed_sync failed: "Cannot convert undefined or null to object" + Invalid radius 100km(>50km). 수정: counts 무효 guard, openingHours guard, 반경 50km, 대시보드 failed 시 errorMessage 표시. |
| **셀럽 흔적 결과 확인** | `/admin` 대시보드 → 실시간 관제탑 "셀럽 흔적" 숫자. API: `GET /api/admin/celebrity-evidence/stats`. 터미널: `npm run report:celeb`. |
| **시딩 1차 (2026-02-08)** | reclassifyParisPlaces 연동, maxResultCount 30, 확정 도시 목록(FRANCE_29·EUROPE_30), `npm run seed:paris-phase1`. 반경 100km→50km(Google API 한도). 파리 181건(adventure 1부족). nubiReason 4단계 검증 미구현. |
| **nubiReason 배치 (2026-02-08)** | place_nubi_reasons 테이블, nubi-reason-batch-service.ts. 10곳/회 Gemini 호출, 4단계 검증(파싱→필드→URL→DB). API: `POST /api/admin/nubi-reason/collect` {cityId, category}. 카테고리별 30곳→10×3배치. |
| **nubiReason 배치 완료 (2026-02-13)** | DB 마이그레이션: `npx tsx dev/run-place-nubi-reasons-migration.ts` (Supabase places FK 이슈로 FK 제외 생성). 검증: `npx tsx dev/verify-place-nubi-reasons.ts`. 수집: `npx tsx dev/run-nubi-reason-collect.ts` (DB api_keys에서 Gemini 키 로드). Supabase Table Editor에서 place_nubi_reasons 확인 가능. 현재 0건(429 할당량 소진). |
| **파리 5카테고리 실측 (2026-02-08)** | `npx tsx dev/report-seed-category.ts` 실행. 파리: attraction 28, restaurant 80, healing 28, adventure 1, hotspot 44 → 총 183건. 전 도시 1,713건. |
| **place_seed 토글 기본값 (2026-02-08)** | DB에 place_seed_sync 행 없을 때 스케줄러·API 모두 **true**(기본 ON). data-scheduler.ts `isPlaceSeedSyncEnabled()`, admin-routes GET 일치. |
| **크롤러 일시 중단 (2026-02, 긴급)** | PAUSED_TASKS: 6개 비용 크롤러(`youtube_sync`,`instagram_sync`,`naver_blog_sync`,`tistory_sync`,`michelin_sync`,`tripadvisor_sync`) 즉시 중단. 유지: `wikimedia_sync`,`opentripmap_sync`, `weather_sync`, `exchange_rate_sync`, `crisis_sync` 및 일정 생성 연관 태스크. 수동 API 실행도 차단. |

- **배포**: 커밋·푸시 → Koyeb 자동 배포. 로컬 8082 = 내부테스트용, `.\dev\test-paris-a.ps1`.
- **실제테스트**: 배포 URL `POST /api/routes/generate` (Paris 3일 등) → 200·일정 데이터 확인.

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-02-14 | 운영정책 확정: `mcp_workflow_france_phase1`(프랑스30 자동) 활성, 유럽30은 대표 승인 후 수동 재개로 고정 |
| 2026-02-14 | MCP 워크플로우(start/resume/status/report) 구현, data_sync_log 체크포인트 강제 기록, 파리 파일럿 실행(1차 150/150, 2차 148/150) |
| 2026-02-08 | 파리 5카테고리 실측(report-seed-category.ts), place_seed 토글 버그 수정(행 없을 때 true). TASK §7·handoff 반영. |
| 2026-02-13 | nubiReason 배치: place_nubi_reasons 테이블 Supabase 반영, 마이그레이션·검증·수집 스크립트(dev/). DB api_keys 로드 적용. |
| 2026-02-13 | 긴급 비용 차단: 6개 비용 크롤러(youtube/instagram/naver/tistory/michelin/tripadvisor) 자동·수동 실행 동시 차단 및 DB 스케줄 OFF 동기화. |
| 2026-02-13 | 검증 헌법(nubi-verification-constitution.mdc) 신규: 5대 원칙, 매의 눈·초행여행자 시점 |
| 2026-02-13 | 문서 정리: SEED_PHASE1_RESULT → TASK.md §7 통합, 완료 항목 TASK_ARCHIVE.md 이동 |
| 2026-02-11 | place_seed_sync 수정: 반경 100km→50km(Google API 한도), counts/openingHours guard, 대시보드 errorMessage 표시 |
| 2026-02-08 | 1차 목표 순서 확정: 파리→프랑스30→유럽30 (place-seeder, TASK.md, getSeedingStatus) |
| 2026-02-08 | 일정 이미지: 인스타>위키>구글 우선순위 적용 (ag3), Wikimedia·OpenTripMap 무료 API 대시보드 연동 |
| 2026-02-10 | 문서 통합: PRICE_SIMULATION·PARIS_DATA·PLACE_SEED_100KM·AG2_100KM·ITINERARY_VERIFICATION_DEPLOY 5개 → TASK.md §6로 합침 후 해당 md 삭제 |
| 2026-02-10 | 문서 체계화: .cursor/rules/ 9개 .mdc + TASK.md 슬림화 + TASK_ARCHIVE.md 분리 |
| 2026-02-10 | API 비용 보호: ag3 Places apiCallTracker + route-optimizer routeCallTracker |
| 2026-02-09 | Pipeline V3 + 교통비 A/B + place-linker + 10개 크롤러 파이프라인 |
| 2026-02-08 | 4+1 에이전트 → Pipeline V3 전환, 71개 도시, place-seeder 최적화 |
| 2026-02-07 | 장소 시딩 시스템, 크롤러 3종 신규, 알고리즘 Phase 1 |
| 2026-02-06 | 관리자 대시보드, Gemini 3.0 통일, Replit 제거 |