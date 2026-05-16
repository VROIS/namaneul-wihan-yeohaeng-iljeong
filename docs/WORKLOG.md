# WORKLOG — 단일 통합 작업 일지

> **정책 (= 사용자 SSOT 2026-05-14)**:
> - 모든 작업 일지 = 이 1 파일에 = **날짜 역순** 누적
> - 옛 일지 파일 = `_archive/` 이동
> - 영구 SSOT = `docs/SEED_SSOT_2026-05-02.md` (= 헌법 = 잠금)
> - 메모리 [[feedback_latest_is_truth_delete_old]] = 최신이 정답

---

## 📚 영구 참조 (= 잠금 SSOT)

| 문서 | 역할 |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | AI 작업 헌법 (= 위반 시 퇴출) |
| [`docs/SEED_SSOT_2026-05-02.md`](SEED_SSOT_2026-05-02.md) | 시드 발굴 + 통합 매칭 SSOT v3 (= 잠금) |
| [`.claude/commands/seed-city.md`](../.claude/commands/seed-city.md) | 시드 발굴 스킬 (= 잠금 명령) |

---

## 🔥 2026-05-15 PM — €860 자산 보존 + 13 SSOT + 5 단계 매칭 + 중복 통합 + 아키텍처 §18/§19

### ✅ 완료 작업 (= 영구 적용, 다음 세션에서 = 그대로 시작)

**🔴 1) priceLevel/priceSource 영구 폐기 (= price_eur 단일 SSOT §14)**
- 코드 정리 = 18+ 파일 (= types/pipeline/itinerary/ag4/mcp-raw/sync 3/google-places/scoring/price-crawler/michelin/storage 등)
- DB DROP = `place_seed_raw.price_source` + `price_fetched_at` + `places.price_level` + `place_data_sources.price_level`
- startup migration 0004 = `price_eur` 단일 (= 옛 추가 제거 = 부팅 재추가 차단)
- 오염 정제 = shopping 21 + €500+ 161 + 1/1000 88 = **270 행 NULL**
- shopping 카테고리 = price_eur 강제 NULL 가드 (= seed-gemini.mjs)

**🔴 2) Google Places SKU §16 + Atmosphere 33 필드 차단**
- 신규 `server/services/shared/google-places-sku.ts` = `validateFieldMask()` 단일 진입점
- ag3-data-matcher.ts + itinerary-generator.ts FieldMask 가드 추가
- TS Enterprise 허용 ($35/1K) + Atmosphere 절대 금지 ($40/1K)
- 실측 단가 = €0.0299/호출 (= GCP 청구서)

**🔴 3) PD `getPlaceDetailsById()` 함수 + 2 호출처 완전 삭제 (= TS 와 중복)**
- ag3-data-matcher.ts:261-308 + line 487-497 + line 644-654 = 모두 삭제
- 이미지 fallback = Wikipedia 만 (= 2 차 PD photo 폐기)

**🔴 4) TS languageCode='ko' 추가 (= 5 위치)**
- ag3-data-matcher.ts:725 (saveNewPlacesToDB) + scripts/seed-gemini.mjs + scripts/p0-bts-daily-cron.mjs + itinerary-generator.ts (Nearby) + google-places.ts (class 3 메서드)
- 효과 = displayName.text 한국어 + Gemini 한국어 ↔ TS 한국어 검증 가능

**🔴 5) 13 요소 SSOT §17 + `google_maps_uri` 신규 컬럼**
- ALTER TABLE place_seed_raw ADD COLUMN google_maps_uri text
- schema.ts + run-startup-migrations.ts 0015 + upsertPlace + seed-gemini SQL + ag3 매핑
- 1,779 행 즉시 보유 (= places 마이그)

**🔴 6) places → place_seed_raw 마이그 (= €860 자산 보존)**
- 1,881 places → 1,266 UPDATE 보강 + 615 신규 INSERT
- 매핑 테이블 = `_places_to_seedraw_mapping` (= 1,881 행 = 보조 테이블 재연결 키)
- COALESCE 옛 우선 = 검증 데이터 (PID/주소/좌표/이미지)
- 결과: place_seed_raw 11,005 → **11,620**

**🔴 7) 보조 6 테이블 → place_seed_raw 보강 (= 4,613 행)**
- place_images → image_url 927 행 채움 (= place_seed_raw_id 이미 98.9% 연결)
- place_prices → price_eur GREATEST 1,083 행
- place_data_sources google → google_rating + google_review_count 1,502 행
- gemini_web_search_cache photospot+verified → category_tags 'hotspot' 971 행
- place_nubi_reasons → nubi_reason 15 행
- naver_blog_posts COUNT → naver_blog_count 115 행

**🔴 8) 5 단계 매칭 + 9 조합 이름 매칭 (= place-upsert.ts + seed-gemini.mjs)**
- 0순위 PID > 1순위 풀주소 > **2순위 google_maps_uri 신규** > 3순위 좌표 10m > 4순위 이름 9 조합
- 이름 9 조합 = name_en/name_local/name_ko 3×3 = 셋 중 한 쌍 일치 = 매칭
- ag3-data-matcher.ts = upsertPlace() 자동 의존 = 9 조합 자동 적용

**🔴 9) 중복 1,054 쌍 통합 = 459 행 archive + 1,460 이미지 재연결**
- 5 단계 매칭으로 1,042 쌍 검출 → Union-Find 274 그룹 → 450 merge
- keep 우선순위 = PID > 상세 이름 > 풍부도 (= [[feedback_dedup_keep_priority]])
- archive = `phase_tags ||= 'archived-merge-2026-05-15'` (= 데이터 보존)
- place_images.place_seed_raw_id = merge → keep 재연결
- 최종 = 활성 행 **9,901** + 잔존 중복 **0**

**🔴 10) 헌법 §17 (13 요소) + §18 (외부 호출 흐름) + §19 (컴포넌트 분리 + 폴더 구조)**
- 사용자 SSOT 잠금 = `docs/SEED_SSOT_2026-05-02.md`

**🔴 11) 메모리 신규 추가**
- `feedback_db_860eur_cost_no_proposals.md` = €860 자산 비가역 + AI 제안 금지
- `feedback_name_match_9_combinations.md` = 9 조합 매칭 강제
- `reference_external_call_infra_v3.md` = 외부 호출 인프라 SSOT

### 📊 현 DB 상태 (= 다음 세션 인수인계)

| 항목 | 값 |
|---|---|
| place_seed_raw 총 | 11,620 |
| archive-merge-2026-05-15 | 459 |
| **활성 행** | **9,901** |
| 잔존 중복 쌍 (5 단계 매칭) | **0** |
| Paris 활성 | **276** (= 13 SSOT 완성 56 / 부분 채움 220) |
| PID 보유 | 4,271 (37%) |
| google_maps_uri 보유 | 1,779 (16%) |
| image 보유 | 9,922 (85%) |
| _places_to_seedraw_mapping | 1,881 행 (= 보조 재연결 키) |

### 🔜 **다음 세션 P0/P1/P2** (= 사용자 명시 SSOT = 이상적 아키텍처 §19)

#### P0 = `server/services/shared/` 폴더 신규 작성 (= 단일 헬퍼 = AI 재발명 차단)

```
server/services/shared/
  ├─ prompts/
  │   ├─ seed-restaurant.ts       ← Gemini 식당 prompt 함수 (1 글자 변경 금지)
  │   ├─ seed-discover.ts         ← Gemini 6 카테고리 prompt 함수
  │   └─ main-itinerary.ts        ← 메인앱 여정 prompt
  ├─ google-places-sku.ts         ✅ 작성됨
  ├─ geminiClient.ts              ← Gemini 단일 진입점 (= gemini-3-flash-preview 고정)
  ├─ ts-client.ts                 ← TS Enterprise 단일 진입점 (+Atmosphere 가드 + languageCode='ko' 자동)
  ├─ matcher.ts                   ← 5 단계 + 9 조합 매칭 유일한 코드
  ├─ image-pipeline.ts            ← PhotoMedia → Supabase Storage 업로드
  └─ types.ts
```

= AI 가 매번 새로 만들지 못하게 = 진입점 강제.

#### P1 = `server/services/seed/` 시드 발굴 컴포넌트

```
server/services/seed/
  ├─ restaurant.ts    ← seedRestaurantsForCity(cityId) = 식당 50 → 45 (LOW 30 + MID 15 + HIGH 5)
  └─ discover.ts      ← seedDiscover(cityName) = 6 카테고리 120 → 110

scripts/
  ├─ seed-restaurant.mjs    ← CLI = node scripts/seed-restaurant.mjs --city=Paris --commit
  └─ seed-discover.mjs      ← CLI 한 줄
```

= 다른 도시 (= 도쿄/마드리드/방콕) 도 = 한 줄 호출 = 동일 결과 보장.

#### P2 = `server/services/itinerary/` 메인앱 여정 분리 + Lazy Fill

```
server/services/itinerary/
  ├─ index.ts             ← generateItinerary(formData) 단일 진입점
  ├─ ag1-skeleton.ts      ← 뼈대 빌더
  ├─ ag2-gemini.ts        ← Gemini 추천 (= 한국어 displayName)
  ├─ ag3-matcher.ts       ← 매칭 + Lazy Fill (= PID NULL → TS 호출 → 보강)
  └─ ag4-finalizer.ts     ← 최종 조립
```

= **Lazy Fill 패턴** (= 사용자 명시 2026-05-15)
- 매칭 + PID 있음 → DB 그대로 (= 외부 호출 0)
- 매칭 + PID NULL → TS 호출 → PID + 이미지 받기 → upsertPlace → 화면 표시
- 미매칭 → TS+PM 신규 INSERT

#### P3 = legacy/ 폴더 + 1 회용 스크립트 정리

- `legacy/pipeline-v3.ts.bak` + `itinerary-generator.ts.bak` (= 메가 파일 백업)
- `_diag-*` `_migration-*` 1 회용 25 개 = `scripts/_archive/2026-05-15/` 이동
- 표준 영구 컴포넌트만 = scripts/ 직속 유지

#### P4 (= 별도) = 숏폼 컴포넌트 (= 예정)

### ⚠️ 다음 AI 가 절대 위반하면 안 되는 규칙 (= CLAUDE.md + 메모리)

1. **AI 제안 금지** = "Recommended" 라벨로 옵션 제시 X = [[feedback_db_860eur_cost_no_proposals]]
2. **1 회용 스크립트 금지** = 영구 컴포넌트만 작성 = [[feedback_latest_is_truth_delete_old]]
3. **upsertPlace() 단일 진입점** = CLAUDE.md 제14조 + DB 트리거
4. **9 조합 이름 매칭** = name_en/name_local/name_ko = [[feedback_name_match_9_combinations]]
5. **shared/ 폴더 = AI 가 새 헬퍼 추가 X** = 표준만 사용
6. **존댓말** = 반말 금지 = [[feedback_use_polite_korean]]
7. **€860 자산 비가역** = DROP/DELETE 작업 = 사용자 명시 후

### 🔄 리팩토링 작업 원칙 (= CLAUDE.md 제17조 + [[feedback_refactor_workflow_3gate]])

**3 게이트 절대 종료 조건**:

| 단계 종료 | 명령 |
|---|---|
| ① 재사용/품질/효율 검증 | `/simplify` |
| ② 정확성/보안/컨벤션 검증 | `/review` |
| ③ React 베스트 프랙티스 | `/vercel:react-best-practices` |

3 종 통과 = 단계 완료 표시. 미비 = `/ralph-loop:ralph-loop` 자동 반복.

**자율 모드**: 단계 N 종료 → 다음 N+1 = AI 자율 시작 (= "다음 진행할까요?" 묻기 X).

**단계 세분화**: 1 단계 = 1 컴포넌트 (= 작은 책임).

---

## 2026-05-15 (= 오늘) — 가격 SSOT + 시스템 강제 + 식당 정립 + Paris 시범 완성

### 🎯 핵심 결정

1. **가격 SSOT 전면 정비** = `price_eur` 단일 컬럼 (= 옛 `price_source`/`price_fetched_at` DROP) + **GREATEST 비싼 쪽** + TS `priceRange.endPrice` + Gemini `estimated_price_eur`
2. **upsertPlace() 단일 진입점** = 모든 INSERT/UPDATE 통과 강제 (= [[CLAUDE.md 제14조]])
3. **DB 트리거** = `place_seed_raw_prevent_dup_trigger` = BEFORE INSERT = 4 단계 매칭 자동 강제
4. **AG3 매칭 4 단계** = **0순위 PID > 1순위 풀주소 > 2순위 좌표 10m > 3순위 이름** (= 메인앱 + 시드 + upsertPlace 모두 일관)
5. **메인앱 prompt 동선 원칙** = "3 일+ 일정 시 Day 2+ outskirt day-trip 1-2 곳 포함" 추가 (= Versailles/Disneyland 등 외곽 누락 정정)
6. **식당 정책 = price_eur 만 SSOT** (= category_tags 가격대 태그 폐기 = AG2 동적 필터)
7. **헌법 §12-14 신설** = 메인앱 호출 잠금 + 단일 INSERT 시스템 + 가격 정책 명시
8. **메모리 신규** = `feedback_price_max_always` + `feedback_dedup_keep_priority` (= keep 우선순위 PID > 상세 이름 > 풍부도)

### 🔧 코드 변경

| 파일 | 변경 |
|---|---|
| `server/services/place-upsert.ts` **(신규)** | 단일 함수 `upsertPlace()` / `upsertPlaces()` = 4 단계 매칭 + COALESCE 옛 우선 + GREATEST 가격 + tags UNION |
| `scripts/_migration-price-cols-2026-05-15.mjs` (신규) | 옛 가격 컬럼 2 DROP migration |
| `scripts/_migration-place-upsert-trigger-2026-05-15.mjs` (신규) | DB 트리거 설치 |
| `server/services/agents/ag3-data-matcher.ts` | (1) `priceEur` SELECT 추가 (= preloadCityData) / (2) FieldMask 2 곳 = `priceRange` 추가 / (3) `saveNewPlacesToDB` = `upsertPlace()` 호출 교체 / (4) 4 단계 매칭 = 0순위 PID 추가 + 좌표/이름 순서 정정 |
| `server/services/agents/pipeline-v3.ts` | (1) prompt = `estimatedCostEur` 가격 원칙 강화 / (2) [동선 원칙] = "Day 2+ outskirt" 1 줄 추가 |
| `scripts/seed-gemini.mjs` | (1) prompt = `estimated_price_eur` 응답 필드 1 줄 추가 / (2) STEP 2 FieldMask = `places.priceRange` 추가 / (3) UPDATE/INSERT = `price_eur = GREATEST(...)` 6 곳 추가 |
| `server/services/itinerary-generator.ts` | 옛 `priceSource` 컬럼 참조 제거 (= DROP 후 SQL 에러 방지) |
| `docs/SEED_SSOT_2026-05-02.md` | **§12 메인앱 잠금 + §13 단일 INSERT 시스템 + §14 가격 정책** 신설 |
| `CLAUDE.md` | **제14조** = upsertPlace() 통과 강제 |

### 🗄️ DB 변경 (= 이미 COMMIT, 비가역)

| 작업 | 영향 |
|---|---|
| `price_fetched_at` / `price_source` 컬럼 DROP | 가격 컬럼 = `price_eur` 단일 SSOT |
| 옛 오염 가격 NULL (= price_eur ≥ 500) | 170 행 정정 / 정상 1,187 보존 |
| DB 트리거 설치 | INSERT 직접 시도 = 자동 차단 |
| Paris 누락 109 곳 = upsertPlace() INSERT | 49 신규 + 60 UPDATE = 0 누락 |
| Paris 중복 = 9 쌍 통합 + B 6 행 + C 2 행 archived | 활성 234 |
| **Paris 식당 시드 신규** = Gemini 2 회 호출 (30 LOW + 15 MID + 5 HIGH) = 50 곳 발굴 → **upsertPlace 통과 = 23 INSERT + 21 UPDATE = 활성 73** | 사용자님 시범 식당 정립 ✅ |

### 📊 Paris 시범 결과 (= 2026-05-15 종료)

| 카테고리 | 활성 |
|---|---|
| restaurant | **73** ✅ |
| adventure | 44 |
| attraction | 45 |
| heritage | 32 |
| healing | 32 |
| shopping | 33 |
| hotspot | 13 (= BAD 15 archived 후) |
| **합계 활성** | **약 272** |

= 사용자님 SSOT 임계 (= 150) **초과 달성** = Paris = DB-only 모드 가능 영역.

### 🔬 식당 발굴 SSOT (= 신규 정립)

**프롬프트 (= 2 회 호출, gemini-3-flash-preview)**:
- 호출 1 = 30 LOW (€10-30/person, 도시 상대)
- 호출 2 = 15 MID + 5 HIGH

**응답 필드 (= 10)**:
`price_tier` / `rank` / `name_en` / `name_local` / `name_ko` / `address` / `price_eur_max` / `distance_km_from_center` / `day_zone` / `selection_reason_ko` / `shortform_ko`

**DB 매핑**:
- `category_tags = ["restaurant"]` 단일 (= 가격대 태그 X)
- `price_eur` = 1 인 평균 가격 (= GREATEST 비싼 쪽)
- `summary_ko` ← selection_reason_ko / `editorial_summary` ← shortform_ko

### 🚨 발견 + 사용자 SSOT 인간 로직

| 발견 | 메모리 |
|---|---|
| 옛 AI 누락 INSERT (= JSON 응답 있는데 미반영) | 사용자님 의심 = 100% 정확 |
| 가격 = 항상 비싼 쪽 (= 신뢰 보호 + 물가 항상 오름) | `feedback_price_max_always` |
| 중복 통합 keep 우선 = PID > 상세 이름 > 풍부도 | `feedback_dedup_keep_priority` |
| 단순 시스템 ≠ AI 언어 이해 (= 컴포넌트화 vs 문서) | 향후 분리 작업 SSOT |

### 🔜 다음 세션 핵심 작업 (= 사용자 SSOT 2026-05-15)

1. **🔴 P0 = 식당 시드 컴포넌트화 (= 사용자 SSOT "기계식 = 한 줄 호출 = 동일 결과")**
   ```
   server/services/shared/prompts/seed-restaurant.ts  ← 고정 prompt 함수 (1 글자 변경 금지)
   server/services/seed/restaurant.ts                 ← seedRestaurantsForCity(cityId)
       책임:
       1. cities 조회 = name/country/lat/lng 확보
       2. prompt buildPrompt(city) 빌드
       3. Gemini 2 회 호출 (30 LOW + 20 MID/HIGH, gemini-3-flash-preview)
       4. JSON 파싱 + 50 곳 검증
       5. LOW vs MID 중복 제거 (= 풀 주소 norm 기준)
       6. upsertPlaces() 호출 = 4 단계 매칭 + UPDATE/INSERT
       7. 결과 반환 = {inserted, updated, skipped, total}
   scripts/seed-restaurant.mjs                        ← CLI 한 줄 = node scripts/seed-restaurant.mjs --city-name=Paris --commit
   docs/SEED_SSOT_2026-05-02.md §15 추가              ← 식당 시드 컴포넌트 잠금 명령
   ```
   = **다른 도시 (= 도쿄/마드리드/방콕) 도 한 줄 호출 = 동일 결과 보장**.
   = 임시 _tmp_*.ts 폐기 = 정식 영구 파일.
   = Paris 식당 73 곳 = 이미 INSERT 완료 = 다른 도시 호출 시 동작 검증.

2. **백엔드 컴포넌트 분리** (= 한 파일 X = 책임별):
   ```
   server/services/seed/discover.ts         ← seedDiscover(cityName) = 6 카테고리
   server/services/itinerary/index.ts       ← generateItinerary(formData) = 메인앱 일정
   server/services/shared/                  ← geminiClient/matcher/priceResolver/place-upsert
       └─ prompts/main-itinerary.txt        ← 고정 prompt 파일
       └─ prompts/seed.txt
   ```
3. **DB-only 자동 전환** = 도시 ≥ 150 행 시 = Gemini 호출 X / TS+PM 호출 X (= 비용 0)
4. **AG2 가격 기준 동적 필터** = travelStyle (Economic/Reasonable/Premium/Luxury) + `price_eur` 범위
5. **다른 도시 = 임계 150 까지 시드 발굴** (= Geneva / Porto / 외 cities 등록 도시)

---

## 2026-05-14 — DB 통합 + 메인앱 v3 적용

### 🎯 핵심 결정

1. **매칭 SSOT 통합** = 시드 + 메인앱 AG3 = **동일 알고리즘** (= 행정주소 > 이름 > 좌표 10m > TS+PM)
2. **좌표 매칭 = 10m** (= 도심 밀집 = 100m 너무 넓음 = 잘못 매칭 원인)
3. **WK 이미지 보존 SSOT** = 87% 자산 = COALESCE 기존 우선 = 자동 덮어쓰기 X
4. **메인앱 v3 prompt** = `gemini-3-flash-preview` + googleSearch grounding (= 시드와 통일)
5. **신규 필드** = `selection_reason_ko` (= 인스타/FOMO) + `shortform_ko` (= 코믹/위트)
6. **컬럼 매핑** = `summary_ko` ← selection_reason_ko / `editorial_summary` ← shortform_ko
7. **백그라운드 saveNewPlacesToDB** = `await` 제거 = 응답 속도 ↑ + DB 자동 캐싱
8. **BAD_NAME 자동 감지** = 분류명/도시명/일반명 archive (= 옛 시드 오류 정정)
9. **단일 WORKLOG.md** = 매일 새 일지 X (= 사용자 검색 용이)

### 🔧 코드 변경 (= 미커밋, 대기)

| 파일 | 변경 |
|---|---|
| `server/services/agents/pipeline-v3.ts` | v3 prompt + 모델 `gemini-3-flash-preview` + grounding + GeminiPlace 인터페이스 (= `address`/`selection_reason_ko`/`shortform_ko`) + `saveNewPlacesToDB` 백그라운드 + GeminiPlace→PlaceResult 매핑 + 추적 메타 (`_matching`/`_backgroundSave`) |
| `server/services/agents/ag3-data-matcher.ts` | 통합 매칭 = 행정주소 > 이름 > 좌표 10m / INSERT 컬럼 매핑 = `editorialSummary` ← description / `summaryKo` ← personaFitReason |
| `scripts/seed-gemini.mjs` | v3 prompt + STEP 2 TextSearch + 좌표 10m + 컬럼 매핑 |
| `docs/SEED_SSOT_2026-05-02.md` | 헌법 v3 = 잠금 명령 + 통합 매칭 + WK 보존 |
| `.claude/commands/seed-city.md` | 스킬 = 잠금 명령 |
| (= 어제 2026-05-12 변경) `client/components/PlaceDetailModal.tsx` | Google Maps Embed iframe (= 우리 모달 폐기) |
| (= 어제) `client/screens/TripPlannerScreen.tsx` | WK 이미지 helper 적용 |
| (= 어제 신규) `client/lib/wikimedia-image.ts` | BTS 1주일 SSOT helper |

### 🗄️ DB 변경 (= 이미 COMMIT 됨, 비가역)

| 작업 | 영향 | phase_tag |
|---|---|---|
| **39 그룹 병합** | 42 행 archived | `archived-merge-2026-05-14` |
| **616 BAD_NAME 정리** | 616 행 archived | `archived-bad-name-2026-05-14` |
| **브뤼셀 시드 재시뮬** | 84 UPDATE + 36 INSERT | `gemini3-2026-05` |

### 📦 정리 작업 (= 비가역)

| 작업 | 영향 |
|---|---|
| 1 차 cleanup (= step*/_tmp/_diag/elpaso 등) | ~127 파일 삭제 |
| 2 차 cleanup (= db_investigate/check-/test-/일회용) | ~50 파일 삭제 |
| 옛 docs 정리 | ~19 파일 삭제 |
| **합계** | **~196 파일 정리** |

### 📊 검증 결과 (= Paris 18 곳 = 메인앱 v3 시뮬)

| 항목 | 값 |
|---|---|
| 매칭률 | **11/18 = 61%** (= 정직, 잘못 매칭 0) |
| 1 순위 행정주소 | 7 |
| 2 순위 이름 | 4 |
| 단어 단위 | 2 |
| 좌표 10m | 0 |
| 미매칭 (= TS+PM) | 7 |
| Gemini 응답 | 15.7s / $0.0012 |
| **사용자 응답 (예상)** | **~15s** (= TS+PM 백그라운드 분리) |

### 🔍 추적 도구

| 도구 | 사용 |
|---|---|
| **DB 직접 추적** | `node scripts/_diag-bg-verification.mjs baseline` / `diff` |
| **API 응답 metadata** | 클라이언트 DevTools = `response.metadata._matching` / `._backgroundSave` |
| **DB 매칭 검증** | `node scripts/_diag-mainapp-paris-match-rate.mjs` |
| **audit 파일** | `backups/merge-audit-commit-2026-05-14.json` 등 |

### ⚠️ Replit 서버 콘솔 = 사용자 접근 X
= 백엔드 로그 추적 = API 응답 metadata 우회 = 사용자 클라이언트 DevTools 확인.

### 🔜 후속 작업 = 12 개 (= /simplify + /review + react best 발견)

| # | 우선 | 작업 |
|---|---|---|
| 1 | P1 | haversine 중복 (3 곳) → `server/utils/geo-utils.ts` 추출 |
| 2 | P1 | O(N×M) 매칭 효율 → 도시 반경 사전 필터 + bounding box |
| 3 | P1 | saveNewPlacesToDB silent 실패 → APM 모니터링 |
| 4 | P2 | magic strings 8 곳 → `constants/phase-tags.ts` |
| 5 | P2 | seed-gemini.mjs ↔ ag3 매칭 중복 → 공통 lib |
| 6 | P2 | matchPlacesWithDB 반환 = `{places, stats}` → 매칭 통계 정확 추적 |
| 7 | P2 | PlaceDetailModal waterfall fetch → SWR/React Query |
| 8 | P2 | PlaceDetailModal null state → enum/객체 |
| 9 | P2 | PlaceDetailModal URL 빌더 → 헬퍼 추출 |
| 10 | P3 | 주석 "WHAT" → "WHY" 압축 |
| 11 | P3 | GeminiPlace 인터페이스 = 옛 `reason` 필드 제거 |
| 12 | P3 | AG3 매칭 4+ 중첩 → `matchByAddress()` 추출 |

### 🎯 다음 세션 핵심 작업 = **BTS 지도 패턴 = 메인앱 여정 지도 적용** (사용자 SSOT 2026-05-14)

| # | 작업 | 영향 |
|---|---|---|
| A | **`BTSPlaceMap` 공통화** → `client/components/RouteMap.tsx` 추출 | 컴포넌트 통합 |
| B | **`InteractiveMap` 폐기** = `RouteMap` 으로 교체 (= 메인앱 = BTS 패턴) | 웹/앱 모두 작동 |
| C | **마커 터치 = scrollTo 핸들러** (= TripPlannerScreen) | UX = BTS 와 동일 |
| D | **`PlaceResult.seedCategory` 매핑** (= ag3-data-matcher.ts:432, 1 줄) | 마커 카테고리 색상/아이콘 |
| E | **슬롯 카드 좌상단 = 카테고리 lucide 아이콘** (= 사용자 명시) | UI 통일 |

= 추정 소요 = ~1 시간 + EAS Update 배포.
= 사용자 SSOT = "BTS 지도 = 표준" + "마커 터치 = 카드 scrollTo" + "분류 아이콘 = 슬롯 좌상단".

### 📋 핫픽스 이력 (= 2026-05-14)

| 커밋 | 내용 |
|---|---|
| `68addf8` | feat = 메인앱 v3 + DB 통합 + WORKLOG |
| `96c5921` | hotfix 1 = sourceType 'Gemini V3' → 'Gemini AI (New)' (= saveNewPlacesToDB 필터 호환) |
| (= Replit) | Migration 0015 = `celeb_mention` 컬럼 추가 (= schema vs DB 불일치) |
| `dd99018` | hotfix 2 = ag3 googlePlaceId/userRatingCount/editorialSummary 매핑 + WebView Android 옵션 + Icon 10 추가 |

= 운영 1 회 호출 = **4 핫픽스 발견 + 적용** = 추적 인프라 가치 증명.

### 📝 다음 단계 = 커밋/푸시 (= 사용자 명시 시)

1. baseline 캡처 = `node scripts/_diag-bg-verification.mjs baseline`
2. `git commit` + `git push`
3. Replit Republish (= 백엔드)
4. EAS Update OR Expo Go 재시작 (= 클라이언트 모달 + WK 이미지)
5. 운영 검증 = Paris 일정 생성 → 응답 metadata 확인 + DB diff

---

## 2026-05-12 — Pipeline v3 사용자 SSOT 정비

### 🎯 핵심 결정

- **DB DROP 43 데드 컬럼** = 90 → 47 (= 28 Atmosphere SKU + 10 legacy + 5 unused)
- **`resolvePrice` 매트릭스 폴백** = `MEAL_BUDGET[travelStyle]?.[mealType]` 추가
- **`PlaceDetailModal` 통째 재작성** = Google Maps Embed iframe (= 사진/평점/리뷰 자동)
- **WK 이미지 helper** = BTS 1주일 SSOT (= UA + bucket + Platform 분기)
- **`saveNewPlacesToDB` 복원** = DB 자동 캐싱 SSOT (= 사용자 명시 정정)

### 🔧 변경

| 파일 | 변경 |
|---|---|
| `scripts/migrate-drop-43-dead-cols.mjs` (신규) | 트랜잭션 DROP COLUMN |
| `scripts/backup-place-seed-raw-43-cols.mjs` (신규) | 백업 (= 59 KB) |
| `server/services/agents/pipeline-v3.ts:72-99` | `resolvePrice` + matrix fallback |
| `server/services/sync-place-seed-trucks.ts` | `runBackfillGooglePlaceId` 폐기 (= Enterprise SKU) |
| `server/routes.ts` + `server/admin-routes.ts` | 2 routes 410 Deprecated |
| `client/components/PlaceDetailModal.tsx` | Google Embed iframe |
| `client/screens/TripPlannerScreen.tsx` | description 우선순위 (= description \|\| geminiReason \|\| personaFitReason) |
| `client/lib/wikimedia-image.ts` (신규) | WK helper |

### 📊 검증

- DB: 10,836 행 보존 + 43 컬럼 정확 DROP
- 코드: TypeScript 0 추가 에러 (= 기존 `nameKo` 오류 5 곳만 = 별개)

---

## 이전 일지 = `_archive/` 이동

| 파일 | 날짜 | 주제 |
|---|---|---|
| `2026-05-05 — gemini3 데이터 정리 + HTML 재작성 plan.md` | 2026-05-05 | gemini3 데이터 정리 + HTML 재작성 (= 완료) |
| `2026-05-08 앱 1차 제미나이 프롬프트 버젼1.md` | 2026-05-08 | AG2 v2 prompt 명세 (= 본 일지에 흡수) |
| `2026-05-09 여정숓폼 생성 과정.md` | 2026-05-09 | 5 에이전트 분리 + 영상 차별화 (= 완료) |
| `2026-05-09 운영 백엔드 데이터 흐름 추적.md` | 2026-05-09 | 운영 16 슬롯 추적 (= 완료) |
| `2026-05-09 운영 버튼 전수 현미경 검증.md` | 2026-05-09 | 운영 버튼 검증 (= 완료) |
| `2026-05-10 DB 효율극대화.md` | 2026-05-10 | 9 컬럼 SSOT + 메인앱 v3 분석 (= 본 일지 흡수) |

= 위 파일들 = `docs/_archive/` 이동 후 = 본 WORKLOG.md 가 단일 진입점.

---

## 변경 통제

- 이 파일 = **단일 일지 = 누적**.
- 새 작업 = 최상단에 새 섹션 (날짜 역순).
- 옛 일지 파일 = 절대 새로 만들지 X (= 사용자 SSOT 2026-05-14).
- 핵심 SSOT 변경 = `docs/SEED_SSOT_2026-05-02.md` (= 헌법) 갱신.
