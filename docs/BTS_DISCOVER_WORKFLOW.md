# BTS 시드 발굴 자동화 워크플로우

> **용도**: 도시 × 카테고리 30 곳 발굴 + DB INSERT 반복 자동화. 매번 사용자 요구 X.
> **사용자 SSOT**: `docs/MCP_RAW_DATA_PROMPTS.md` 1-1 ~ 1-7 prompt 그대로.
> **호출 방법**: 사용자가 한 줄 → `"BTS 시드 발굴: {도시명} {카테고리}"` → AI 가 이 워크플로우 자동 따름.

---

## 1. 입력 spec (사용자 한 줄)

```
"BTS 시드 발굴: El Paso shopping"
"BTS 시드 발굴: Paris heritage"
"BTS 시드 발굴: Tokyo restaurant"
```

= 도시명(영문) + 카테고리 = 두 인자만.

---

## 2. AI 자동 워크플로우 (4 단계)

### Step A — DB 검증 (SELECT)
```sql
SELECT seed_category, COUNT(*) FROM place_seed_raw
WHERE city_id = $1 AND collection_phase = 'bts2026'
  AND seed_category = $2
GROUP BY seed_category;
```
- 결과 ≥ 25 row → "이미 시드 보유. 발굴 skip" + 종료
- 결과 < 25 row → Step B 진행

### Step B — 서브 에이전트 발굴 (WebSearch + 좌표 + 멀티태그)

**서브 에이전트 호출 spec** (단일 general-purpose, 2026-04-27 강화 = 제미나이식 강제):

```
프로젝트: BTS 여행 가이드 앱.
사용자 SSOT prompt (docs/MCP_RAW_DATA_PROMPTS.md 1-{N}):

"{도시}({도시영문})의 {테마} 테마로, 도시 중심 반경 100km 내외에서
다음 세 조건만으로 상위 30곳을 찾아줘.
1) 구글 검색(검색량·노출)이 많은 순
2) 구글 리뷰 수가 많은 순 (평점 아님, 리뷰 개수)
3) 구글 이미지 검색 결과 수가 많은 순 (인스타 아님, 순수 구글 이미지 기준)

각 장소에 대해 다음을 표로 정리:
- 장소명 (한국어 · 영문 정식 명칭)
- 정확한 위도/경도 = WGS84 기준 소수점 6자리 (예: 31.916370, -106.043444)
  · 구글 지도 API 및 공식 역사/관광 등록부 (미국 NRHP / 한국 문화재청 / UNESCO 등) 의
    실제 등록 좌표를 활용 (LLM 추정 X = 거부)
  · 정밀도 = 약 0.1m 오차 = 앱 매핑 직접 사용 가능 수준
- 출처 URL (evidenceUrl) = 공식 등록부 / Wikipedia / 관광청 .gov 우선
- 출처 Tier (coordSource) = T1 (공식 등록부) / T2 (Wikipedia infobox) / T3 (Google Maps URL)
- 위 세 조건 근거 (검색량 / 리뷰 수 / 이미지 수) 메모

추가 조건 (참고용 메타):
- 100km 외 위치라도 행정 경계 밖 가까운 곳은 포함 + '100km 외' 표시
- 미션 트레일·하이킹 코스 등 그룹화 가능 항목 = 폴리라인/경로 제안 메모
- 30 곳 미달 시 = 부족분 명시 (가짜 row 채우기 X)"

규칙 (강화):
1. 테마 = 한 단어만 (세부 분류 X = 사용자 SSOT)
2. 반경 100km (도시 중심 좌표는 cities 테이블에서 SELECT)
3. 3 조건만 (평점/인스타/매체순위 X)
4. WebSearch + WebFetch 도구 필수 사용
5. 좌표 = NRHP / 문화재청 / UNESCO / Wikipedia 등 공식 등록부 검증 = 6자리 정밀도 강제
6. 강제 미달 row = JSON 출력 제외 (가짜 받지 않음)

도구: WebSearch + WebFetch
출력 (JSON 배열, 최대 30 row, 강제 조건 충족만):
[
  {
    "rank": 1,
    "nameKo": "휴코 탱크스 주립 사적지",
    "nameEn": "Hueco Tanks State Historic Site",
    "latitude": 31.916370,                    // 6자리 강제
    "longitude": -106.043444,                  // 6자리 강제
    "coordSource": "T1",                       // T1/T2/T3 강제
    "evidenceUrl": "https://npgallery.nps.gov/AssetDetail/NRIS/71000946",  // 강제
    "googleSearchNote": "TPWD/Wikipedia 1페이지, 매우 높음",
    "googleReviewCountNote": "Google Maps 2,400+",
    "googleImageCountNote": "수만 단위 (TPWD 공식+민간)"
  }, ...
]

저장: scripts/{city}-{category}-30-v2.json (v2 = 2026-04-27 제미나이식 강제 적용)
시간: 4~6 분 안에 완료.
```

**좌표 검증 의무 (서브 에이전트, 강화)**:
- 각 row 의 좌표 = NRHP / 문화재청 / UNESCO 등 공식 등록부 우선 (T1)
- T1 미발견 시 = Wikipedia infobox (T2)
- T2 미발견 시 = Google Maps URL `@lat,lng` 추출 (T3)
- 6자리 정밀도 미달 = row 제외
- 출처 URL 미보유 = row 제외
- LLM 추정 좌표 = 거부 (메모리 `feedback_llm_hallucination_metadata.md`)
- 30 미달 = `shortage.count` + `shortage.reason` + `shortage.rejected` 명시 (가짜 X)

**3 조건 검증 의무 (사용자 SSOT 진정성, 2026-04-27 추가)**:
- WebSearch = Google 검색 직접 호출 (LLM 일반 지식만 X)
- googleSearchNote = "Google '키워드' = 약 N건" 형식 (정성 평가 "매우 높음" X)
- googleReviewCountNote = "Google Maps 리뷰 N개 (확인 YYYY-MM-DD)" 형식
- googleImageCountNote = "Google Images '키워드' = 약 N건" ("수만" X)

**2-pass 자체 검증 (응답 직전 의무, 2026-04-27 추가)**:
- Pass 1 = WebSearch 로 30 후보 발굴 + 좌표/출처 검증 + 3 조건 메모
- Pass 2 = 응답 직전 추가 Google Search 로 ranking 정확성 재확인:
  · 검증 쿼리: "top {category} {city} 2026", "most popular {category} {city} reviews", "best {category} {city} TripAdvisor"
  · Pass 1 list 와 Pass 2 결과 비교
  · Pass 2 신규 = 추가 / Pass 1 에 있었으나 Pass 2 누락 = 강등 또는 제거
- JSON 에 `verification` 필드:
  ```json
  "verification": {
    "queries": ["top {cat} {city} 2026", "most popular {cat} {city} reviews"],
    "added": [{"name": "Place A", "rank": 12, "reason": "Pass 2 에서 새로 발견"}],
    "demoted": [{"name": "Place B", "from": 8, "to": 24, "reason": "Pass 2 검증 미흡"}],
    "confirmed_top10": true
  }
  ```
- = ranking 진정성 = 서브에이전트 내부 자체 검증 = SSOT 시작점

### Step C — DB INSERT (multi-tag UPSERT)

`scripts/p1-elpaso-180-seed.mjs` 패턴 그대로 활용:
1. JSON 읽기 (`scripts/{city}-{category}-30.json`)
2. SQL 빌드 (UPSERT with ON CONFLICT DO UPDATE multi-tag 누적)
3. Supabase MCP `execute_sql` 실행

**SQL 패턴**:
```sql
INSERT INTO place_seed_raw (
  city_id, seed_category, collection_phase, rank,
  name_ko, name_en,
  google_search_note, google_review_count_note, google_image_count_note,
  evidence_url, source,
  latitude, longitude,
  category_tags, phase_tags, created_at
) VALUES
  (city_id, '{category}', 'bts2026', rank, ...) ...
ON CONFLICT (city_id, (LOWER(TRIM(name_en))))
WHERE name_en IS NOT NULL AND TRIM(name_en) <> ''
DO UPDATE SET
  category_tags = ARRAY(SELECT DISTINCT UNNEST(...)),  -- multi-tag 누적
  phase_tags    = ARRAY(SELECT DISTINCT UNNEST(...)),
  ...
```

**multi-tag 의 의미**:
- 동일 장소 (예: "Cielo Vista Mall") 가 여러 카테고리 (shopping + attraction) 에 속할 수 있음
- ON CONFLICT 발생 = `category_tags` 배열에 추가 카테고리 누적
- 1 장소 = 1 row (글로벌 UNIQUE INDEX) + 다중 분류

### Step D — 검증 (SELECT)

```sql
-- 카테고리 row 수 확인
SELECT COUNT(*) AS as_main, 
       COUNT(*) FILTER (WHERE '{category}' = ANY(category_tags)) AS total_tag
FROM place_seed_raw 
WHERE city_id = $1 AND collection_phase = 'bts2026' AND seed_category = '{category}';

-- 좌표 채움률
SELECT COUNT(*) FILTER (WHERE latitude IS NOT NULL) AS with_coord,
       COUNT(*) AS total
FROM place_seed_raw 
WHERE city_id = $1 AND seed_category = '{category}';
```

**기대값**:
- as_main + multi-tag = 30 (UNIQUE 충돌 시 multi-tag 로 통합)
- with_coord ≥ 25 (LLM 추정 거부 시 일부 NULL 허용)

---

## 3. 32 도시 × 7 카테고리 = 224 회 반복 일정

### Phase 1 (이미 보유 시드 = 6 카테고리 + 일부 도시)
- 엘파소 = 178 row (heritage 15 + restaurant 30 + ...) ✅
- 다른 31 도시 = 일부 보유 / 일부 0
- 점검 SQL 로 부족분 확인 후 = 워크플로우 자동 호출

### Phase 2 (shopping 신규 카테고리)
- 32 도시 × shopping 30 = 960 row 신규 발굴
- 도시당 약 4~6 분 (서브 에이전트)
- 32 도시 = 약 2.5 시간 소요 (단일 직렬)
- 또는 = 병렬 5 도시 = 30 분

### Phase 3 (Step 2 cron 이미지 + 좌표 채움)
- 발굴 완료된 row 의 image_url + google_place_id 채움
- 일일 30 quota 분할 = 32 도시 × 38 일 (약 5.5 주)

---

## 4. 향후 발전 (스킬 / 스크립트 / cron 변환)

### 옵션 A — Claude Code 슬래시 커맨드
파일: `.claude/commands/bts-discover.md`
호출: `/bts-discover El Paso shopping`
= 이 워크플로우 markdown 그대로 박아넣기 + 변수 치환

### 옵션 B — Node 스크립트 + 사용자 명령
파일: `scripts/bts-discover.mjs --city=Paris --category=shopping`
= Claude API 직접 호출 (비용 + 복잡성)

### 옵션 C — GitHub Actions cron
파일: `.github/workflows/bts-discover-cron.yml`
= 매일 1 도시 × 1 카테고리 자동 발굴
= 단 = WebSearch (Claude 능력) → API 호출 어려움 → 별도 LLM (Gemini) 필요

---

## 5. 운영 제약

- 발굴 시점에 좌표 + 멀티태그 (category_tags) 모두 받기
- LLM 추정 메타 거부 (좌표 검증 필수)
- multi-tag UPSERT (시드 통째 교체 X)
- 사용자 SSOT prompt 그대로 (세부 분류 X)
- DB INSERT 후 = 검증 SELECT 1 회 의무

---

## 6. 처음 사용 사례 (2026-04-27 엘파소 shopping)

```
사용자: "BTS 시드 발굴: El Paso shopping"

AI:
[Step A] DB 검증 → shopping 0 row → 발굴 진행
[Step B] 서브 에이전트 (general-purpose) + WebSearch
   → 4 분 소요 → scripts/elpaso-shopping-30.json (30 row, 좌표 X)
[Step C] SQL 빌드 (UPSERT) → Supabase MCP execute_sql
[Step D] SELECT 검증 → 30 row (28 main + 2 multi-tag)

소요 시간: 약 6 분.
다음 도시: 같은 한 줄로 호출.
```
