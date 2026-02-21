# 🏗️ NUBI 데이터베이스 원시 데이터(Raw DB) 대통합 마스터 계획서

> 작성일: 2026-02-21
> 문서 목적: 흩어져 있는 수집 데이터(가격, 인스타 이미지, 블로그 등)를 단 하나의 뷰어(View) 테이블 스키마인 `place_seed_raw`로 통합하여, 여정 생성(파이프라인 V3) 속도를 60초에서 15초로 단축시키는 아키텍처 및 작업 단계를 영구 보존합니다.

## 1. 아키텍처 배경 및 해결책 (ETL 도입)

### 🚨 현재의 문제점
1. **파이프라인 지연 (15~19초 병목)**: 제미나이가 짜준 최소 20~30개의 장소들에 대해 각각 가격(`place_prices`), 인스타 사진(`instagram_photos`), 네이버 블로그(`naver_blog_posts`)를 찾기 위해 V3 파이프라인에서 매번 다중 조인 쿼리가 발생합니다.
2. **MCP1 수집 한계 및 빈칸 발생**: MCP1(Gemini)에게 가격과 이미지를 수집하라고 명령했으나, 제미나이의 한계로 인해 현재 `place_seed_raw` 에 가격 데이터가 85%나 누락되어 구멍이 나 있습니다.
3. **인스타 최고 품질 이미지 누락 방지**: 무려 5만 3천 건에 달하는 인스타그램 원본 사진 데이터(`instagram_photos` 등)가 별도 테이블에 잠들어 있습니다. 여정 생성 시 이 퀄리티 높은 사진들을 100% 활용해 `place_seed_raw`에 즉시 띄워주어야 합니다.

### 💡 아키텍처 해결책: "창고"와 "전시 매장(ETL)"의 분리
전체 DB를 싹 다 부수고 하나로 합치는 것은 기존 수집기(MCP) 봇들을 모두 재개발해야 하는 리스크가 있습니다.
따라서, **ETL(추출-변환-적재) 아키텍처**를 도입합니다.
- **원본 창고 테이블들**: `place_prices`, `instagram_photos`, `naver_blog_posts` (MCP들이 매일 긁어와서 모아두는 곳)
- **초고속 전시 매장**: `place_seed_raw` (실제 앱에서 파이프라인이 0.001초 만에 읽어가는 단일 완제품 테이블)
- **물류 트럭 (징검다리 통합 스크립트)**: 원본 창고에 쌓인 진짜 트래픽(가격, 5만 건의 인스타 사진 등)을 뽑아내어 전시 매장(`place_seed_raw`)의 구멍 난 빈칸을 100% 채우는 자동화 스크립트.

---

## 2. 대통합 수술 4단계 세부 실행 계획 (Step-by-Step)

### 🛠️ Step 1. DB 스키마 검증 (완료)
- [x] 이미 `shared/schema.ts`의 `place_seed_raw` 테이블에는 `bestImageUrl`(인스타 사진 1순위용), `celebMention`, `naverBlogCount`, `vibeKeywords`, `priceEur` 컬럼이 생성되어 있어 진열대 세팅은 완료되었습니다.

### 🛠️ Step 2. 1차 물류 트럭 가동 (인스타 대표 이미지 및 메타데이터 통합) (완료)
- [x] `scripts/sync-master-place-seed.ts` 실행을 통해 **약 5만 3천 건의 `instagram_photos` 중 '좋아요'가 가장 높은 최고 품질의 인스타 사진**을 뽑아내어 `place_seed_raw.bestImageUrl`에 통합하는 작업을 세팅 및 완료했습니다. (사진 외 분위기, 셀럽, 블로그 개수 포함)

### 🛠️ Step 3. 2차 물류 트럭 가동 (🚨 최우선 과제: 가격(Price) 빈칸 100% 땜빵 스크립트) (완료)
- **목표**: 제미나이가 놓친 85%의 가격 빈칸을 `place_prices`의 확실한 평균 가격 데이터로 모두 채웁니다.
- **징검다리 매칭 로직**:
  1. `place_seed_raw` 에서 이름(`nameEn`/`nameKo`)을 읽어옵니다.
  2. 메인 `places` 테이블을 뒤져 완벽히 일치하는 고유 `placeId`를 찾습니다.
  3. 해당 `placeId`를 가진 `place_prices` 테이블에서 최적의 **평균 가격(priceAverage)**을 수확합니다.
  4. 다시 `place_seed_raw.priceEur` (빈칸)에 영구 기록합니다.
- **작업 파일**: `scripts/sync-prices-to-seed.ts` 생성 및 1회 실행

### 🛠️ Step 4. V3 파이프라인 초고속 엔진 장착 (완료)
- **목표**: 19초짜리 지연 원인이었던 다중 쿼리 로직을 영구 삭제합니다.
- **수정**: `server/services/agents/pipeline-v3.ts` 의 `generateNubiReasonV2` 함수 등을 뜯어고쳐, 기존처럼 `instagram_photos`나 `place_prices`를 매번 뒤지지 않고, 완벽하게 채워진 전시 매장(**`place_seed_raw`**) 값만 바로 꽂아 넣게 수정합니다.

### 🛠️ Step 5. 스케줄링(Cron) 자동화 (완료)
- Step 2, Step 3의 스크립트(물류 트럭)를 매일 새벽마다 자동(Cron job)으로 실행하게 만듭니다. "MCP 수집 -> 물류 트럭 업데이트 -> 빈칸 없는 완벽한 전시 매장 유지" 무한 동력 구조 완성.
- **구현**: `data-scheduler.ts`에 `sync_master_place_seed`(매일 04:00), `sync_prices_to_seed`(매일 04:30) 등록. `server/services/sync-place-seed-trucks.ts`에서 스크립트 spawn 실행.

### 🛠️ Step 5.5. 대통합 3차 물류 트럭 (place_id 전건 매칭 + 6경로 일괄 채우기) (2026-02-21 완료)
- **배경**: Step 3까지의 물류 트럭이 `priceEur` NULL인 건만 대상으로 하여, 5,250건 중 20건(0.4%)만 매칭됨. 근본 원인은 **`place_seed_raw`에 `place_id` FK가 거의 비어있었기 때문**.
- **구현**: `server/services/sync-consolidation-service.ts` 신규 생성
  - **Pass 1**: place-linker 5단계 정밀 매칭 (name, displayNameKo, aliases, 부분매칭, 한국어)
  - **Pass 2**: 토큰 기반 적극적 매칭 (불용어 제거 후 50%+ 토큰 일치 시 매칭)
  - **Step 2~6**: place_id 보유 건 대상 → 이미지(place_images/places) + 가격(place_prices) + 블로그(naver_blog_posts) + 셀럽(celebrity_place_evidence) + 분위기(places.vibeKeywords) + nubiReason 일괄 채우기
- **실행 결과**:
  | 항목 | 이전 | 이후 | 증가 |
  |------|------|------|------|
  | place_id | 20 (0.4%) | 362 (7%) | +342 |
  | bestImageUrl | 185 | 401 (8%) | +216 |
  | priceEur | 875 | 954 (18%) | +79 |
  | vibeKeywords | 0 | 299 (6%) | +299 |
  | naverBlogCount>0 | 71 | 128 | +57 |
- **한계**: place_id 매칭률 7% = **구조적 천장**. 원인은 아래 Step 6에서 진단.
- **실행 명령**: `npm run sync:consolidation`

---

## 3. 구조적 병목 진단 (2026-02-21)

### 🚨 왜 돈 들여 수집한 데이터를 93% 활용 못 하는가?

```
📦 원본 창고 (돈 들여 수집 완료)
├── place_prices:    27,169건 (1,718개 장소) ← 가격 데이터 풍부
├── place_images:    56,626건              ← 이미지 데이터 풍부
├── naver_blog_posts: 6,516건              ← 블로그 데이터 풍부
└── 모두 places.id (FK) 기반으로 연결됨

🏬 전시 매장 (place_seed_raw 5,250건)
└── place_id FK가 362건(7%)만 연결됨 ← 🚨 여기가 병목!

❌ "에펠탑" ≠ "Tour Eiffel" → 이름 매칭 한계 (최대 7%)
```

**근본 원인**: MCP Stage 1이 장소를 수집할 때 `googlePlaceId`(바코드)를 안 찍음.
- `place_seed_raw`: 이름(텍스트)만 보유 → 추측 매칭 의존
- `places`: `googlePlaceId` 보유 → 100% 정확한 연결 가능
- **해결**: place_seed_raw에 googlePlaceId를 부여하면 매칭률 7% → 80%+ 상승

### 🧪 무료 MCP 테스트 결과 (2026-02-21)

| 도구 | 결과 | Place ID 반환 |
|------|------|--------------|
| MCP `google_maps` ("Eiffel Tower Paris") | No results | ❌ |
| MCP `google_maps` ("Tour Eiffel Paris restaurant") | 이름/평점만 반환 | ❌ |
| MCP `visit_page` (Google Maps URL) | 쿠키 동의 화면 차단 | ❌ |
| MCP `google_search` (Place ID 검색) | URL만 반환, ID 없음 | ❌ |

**결론**: 무료 MCP로는 googlePlaceId 획득 불가. 유료 API 필요하나, 기존 비용 통제 장치 활용으로 안전하게 실행 가능.

---

## 4. Step 6: googlePlaceId 바코드 부여 작전 (2026-02-21~)

### 🛠️ Step 6. place_seed_raw에 googlePlaceId + 실제가격 + 보충이미지 (진행 중)

> **목표**: 5,250건의 place_seed_raw에 googlePlaceId를 부여하여, 27,169건 가격 + 56,626건 이미지에 100% 접근 가능하게 만든다.
> 1회 API 호출로 googlePlaceId + priceLevel + photos 3가지를 동시에 가져온다.

#### 6-1. 스키마 확장 (완료)
- `shared/schema.ts`의 `placeSeedRaw` 테이블에 `googlePlaceId` text 컬럼 추가
- `run-startup-migrations.ts`에 마이그레이션 등록

#### 6-2. 도시별 일괄 백필 서비스 (2026-02-21 v2 리팩토링)

> **전략 변경**: 건별 호출 → **1일 1도시 × 5카테고리 = API 5회** 방식으로 전환

- **방식**: 카테고리별 Text Search 1회 → 최대 20건 반환 → 기존 seed와 이름 매칭
- **사용 API**: Google Places Text Search **Advanced** ($0.035/건)
- **FieldMask**: `places.id, places.displayName, places.formattedAddress, places.location, places.priceLevel, places.photos`
- **1일 처리량**: 1도시 × 5카테고리 = API 5회 → ~100건 매칭 가능
- **도시 우선순위**: BTS2026(34도시, 3/26 첫공연) → France30 → Europe30
- **소요 기간**: ~95도시 ÷ 1도시/일 = **약 95일** (안전+정확)
- **예상 비용**: ~$16.6 (5회/일 × 95도시 × $0.035) ← 대폭 절감!
- **안전장치**: backfillTracker(1도시/일 강제) + 2초 딜레이 + 429시 10초 대기
- **작업 파일**: `server/services/sync-google-place-id-service.ts`

#### 6-3. 데이터 우선순위 원칙 (2026-02-21 확정)

**가격 우선순위** (높은 순):
| 순위 | 소스 | 설명 |
|------|------|------|
| 1 | `google_places_actual` | Google API priceLevel 실측값 (이번 백필에서 획득) |
| 2 | `google_places` | Google Places 기존 수집 |
| 3 | `klook` / `viator` | OTA 플랫폼 실제 판매가 |
| 4 | `myrealtrip` / `tripdotcom` | 한국 OTA 판매가 |
| 5 | `official_website` | 공식 사이트 |
| 9 | `gemini_search` | Gemini 추정/평균치 (최후순위) |

**이미지 우선순위** (높은 순):
| 순위 | 소스 | 설명 |
|------|------|------|
| 1 | 셀럽 인스타 사진 | `celebrity_place_evidence.imageUrl` — 인물 포함, 핵심 차별화 |
| 2 | 인스타 사진 | `place_images` / `places.instagramPhotoUrls` |
| 3 | 구글 사진 | `places.photoUrls` / Google API photos |
| 4 | MCP 수집 이미지 | 기존 백필로 가져온 보충 이미지 |

> **핵심**: 셀럽/인물 사진이 최우선 — 이것이 NUBI 앱의 차별화 포인트.
> Google API 사진은 셀럽/인스타 사진이 없을 때만 보충용으로 채운다.

#### 6-4. 백필 완료 후 대통합 재실행
- googlePlaceId → places 100% 매칭 → place_id 확보
- `sync:consolidation` 재실행 → 우선순위에 따라 가격/이미지/블로그/셀럽 대량 채우기
- **예상 결과**: place_id 7% → 80%+, 이미지/가격 채움률 대폭 상승

#### 6-5. 향후 MCP Stage 1 개선 (재발 방지)
- MCP Stage 1 수집 완료 후, 즉시 Google Places API로 googlePlaceId 조회
- `mcp-raw-service.ts`의 Stage 1 완료 콜백에 추가
- 이후 수집되는 모든 장소는 처음부터 바코드 보유

#### 비용 안전 보장
| 항목 | 수치 |
|------|------|
| 일일 최대 API 호출 | **5회** (1도시 × 5카테고리, backfillTracker 강제) |
| 예상 총 비용 | **~$16.6** ($0.035 × 5회 × 95도시) ← 기존 $171 대비 90% 절감 |
| Google 월 무료 크레딧 | $200 |
| 초과 시 동작 | `canProcessCity()` false → 다음날 자동 재시도 |
| 속도 제한 | 카테고리간 2초 대기 + HTTP 429시 10초 대기 후 재시도 |
| €1,200 사고 재발 가능성 | **0%** (1일 1도시 물리적 차단) |
