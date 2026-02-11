# NUBI 프로젝트 태스크 관리

> **최종 업데이트: 2026-02-08**
> **완료된 작업 이력: `docs/TASK_ARCHIVE.md`**
> **AI 규칙: `.cursor/rules/*.mdc` (9개 파일, 항상 자동 적용)**

---

## 0. 현재 진행 상태 (AI 핸드오프용)

> 이 섹션은 `.cursor/rules/nubi-handoff.mdc`와 동기화. 상세 상태는 handoff 참조.

| 항목 | 내용 |
|------|------|
| **마지막 작업일** | 2026-02-08 |
| **마지막 작업** | 일정 이미지 우선순위(인스타>위키>구글) + Wikimedia/OpenTripMap 독립 동기화 + 대시보드 |
| **다음 할 일** | Wikimedia/OpenTripMap 연쇄 크롤러 통합 → 슬롯 필수정보 보강 → 배포 테스트 |
| **배포 상태** | Koyeb 정상 (200 OK). 커밋·푸시 시 자동 배포. 로컬 = 내부테스트용. |
| **브랜치** | cursor-dev |

---

## 오늘 할 일 (시딩·카테고리 정리)

### 시딩 원칙 (확정)
- **순서**: 파리 → 프랑스 29개 도시 → 유럽 30개 도시 (도시별 카테고리 30개씩 채우는 순서)
- **분류**: 비용 내고 가져온 모든 도시 데이터 → 5카테고리로 전부 분류 (제외 없음)
- **도시당**: 도심 반경 100km, **카테고리 5개별 구글 리뷰 상위 30곳** → 30×5 = 150장소
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
- **순서**: 인스타(가장 자연스러움) > 위키메디어+구글(photoUrls) > place.image > Google API
- **DB 컬럼**: `instagramPhotoUrls`(인스타), `photoUrls`(구글+위키메디어 append)
- **적용**: ag3 preload 시 `instagramPhotoUrls` 조회, `resolvePlaceImage()` 로 선택

### 구현·DB 정리
- place-seeder: SEARCH_CATEGORIES 5개(명소/맛집/힐링/모험/핫스팟), hotel 제거, 맛집 통합, 카테고리당 API 1회
- 1일 1카테고리 추적: dataSyncLog에 entity_sub_type(또는 place_seed_batch) 검토
- 프론트 1줄: nubiReason 생성에 필요한 크롤러·place-linker 순서 유지
- **seed_category 분류 완료 (2026-02)**: 전 도시 1,709건 **5카테고리 모두** 보정 완료 (attraction 38, adventure 1 포함). `npm run seed:reclassify`, `npm run seed:refine-adventure`, `npm run seed:report`

---

## 1. 오늘 작업 현황 (2026-02-08)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| 1 | 일정 이미지 우선순위 (인스타>위키>구글) | ✅ 완료 | ag3-data-matcher resolvePlaceImage, instagramPhotoUrls 조회 |
| 2 | Wikimedia/OpenTripMap 독립 동기화 | ✅ 완료 | wikimedia-enrichment, opentripmap-enrichment, 스케줄러·대시보드 |
| 3 | Wikimedia/OpenTripMap 연쇄 크롤러 통합 | ✅ 완료 | runChainedCrawlers 0그룹에 도시별·카테고리별 장소 대상 Wikimedia·OpenTripMap 추가 |
| 4 | 슬롯 필수정보 보강 (검증 단계) | ❌ 미완료 | 메인 에이전트에서 누락 시 재조회·저장 |

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

### 스트림 D: 데이터 확보 (1차 목표)

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| D-1 | **장소 시딩 1차: 파리** (5카테고리×30곳 완성 후 다음 도시) | 진행 | seedPriorityCityByCategory, place_seed_sync |
| D-2 | **장소 시딩 2차: 프랑스 30개 도시** | 대기 | 1차 완료 후 자동 (니스,리옹,마르세유,...) |
| D-3 | **장소 시딩 3차: 유럽 30개 도시** | 대기 | 2차 완료 후 자동 |

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
| 장소 | 1,669개 | 진행 중 (시딩 0/71) |
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

---

## 7. 배포·테스트·시뮬레이션 요약 (분산 문서 통합)

> **규칙**: 새 .md 생성 금지. 모든 배포/테스트/시뮬 결과는 본 절에만 요약 추가.

| 주제 | 요약 |
|------|------|
| **Places API 가격** | 일 33건 제한(DAILY_API_LIMIT), 무료 1,000 caps/월. reviews 제거·FieldMask 최소화 반영. 시딩 시 33건만 Place Details. |
| **파리 로우데이터** | 파리 153건(attraction 68, restaurant 59, cafe 26, hotel 0). Naver 28·인스타 121·가격 651 연결. cafe 4건 추가 시 30건. |
| **Place Seed 100km** | CITY_SEARCH_RADIUS_METERS=100000(place-seeder.ts) 전 도시 적용. 1차 목표 순서: 파리→프랑스30→유럽30. API 키 있으면 paris-daily 등으로 검증. |
| **AG2 반경 100km** | AG2 프롬프트에 "100km radius" 추가, Paris 예시 명시. AGENT_PROTOCOL 반영. 배포 후 파리 generate로 검증. |
| **일정 검증(Verifier)** | score≥90 통과, itinerary-verifier.ts. 잘린 JSON 복구(verdict 적합·score 50 미만→90), maxOutputTokens 1024. 내부 2회차 200/score 95. 배포본 외부 1회 500 → 재테스트 권장. |

- **배포**: 커밋·푸시 → Koyeb 자동 배포. 로컬 8082 = 내부테스트용, `.\dev\test-paris-a.ps1`.
- **실제테스트**: 배포 URL `POST /api/routes/generate` (Paris 3일 등) → 200·일정 데이터 확인.

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-02-08 | 1차 목표 순서 확정: 파리→프랑스30→유럽30 (place-seeder, TASK.md, getSeedingStatus) |
| 2026-02-08 | 일정 이미지: 인스타>위키>구글 우선순위 적용 (ag3), Wikimedia·OpenTripMap 무료 API 대시보드 연동 |
| 2026-02-10 | 문서 통합: PRICE_SIMULATION·PARIS_DATA·PLACE_SEED_100KM·AG2_100KM·ITINERARY_VERIFICATION_DEPLOY 5개 → TASK.md §6로 합침 후 해당 md 삭제 |
| 2026-02-10 | 문서 체계화: .cursor/rules/ 9개 .mdc + TASK.md 슬림화 + TASK_ARCHIVE.md 분리 |
| 2026-02-10 | API 비용 보호: ag3 Places apiCallTracker + route-optimizer routeCallTracker |
| 2026-02-09 | Pipeline V3 + 교통비 A/B + place-linker + 10개 크롤러 파이프라인 |
| 2026-02-08 | 4+1 에이전트 → Pipeline V3 전환, 71개 도시, place-seeder 최적화 |
| 2026-02-07 | 장소 시딩 시스템, 크롤러 3종 신규, 알고리즘 Phase 1 |
| 2026-02-06 | 관리자 대시보드, Gemini 3.0 통일, Replit 제거 |
