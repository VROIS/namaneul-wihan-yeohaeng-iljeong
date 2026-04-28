---
description: BTS 시드 - 도시 × 카테고리 30 곳 자동 발굴 + DB INSERT (사용자 SSOT 워크플로우)
argument-hint: <도시명> <카테고리>
---

# BTS 시드 자동 발굴 슬래시 커맨드

**입력**: $ARGUMENTS (예: `El Paso shopping`, `Paris heritage`, `Tokyo restaurant`)

**참조 문서**: [docs/BTS_DISCOVER_WORKFLOW.md](../../docs/BTS_DISCOVER_WORKFLOW.md)

---

## 자동 워크플로우 (4 단계)

이 커맨드 호출 시 = 다음 단계를 자동 실행:

### 1단계 — 입력 파싱
- $ARGUMENTS 에서 도시명 (영문) 과 카테고리 추출
- 카테고리 화이트리스트: `attraction`, `restaurant`, `healing`, `adventure`, `hotspot`, `heritage`, `shopping`
- 카테고리가 화이트리스트에 없으면 = 즉시 거부 + 사용자에게 알림

### 2단계 — DB 검증 (Supabase MCP `execute_sql`)
```sql
SELECT 
  c.id AS city_id, c.name_en, c.country_code, c.latitude, c.longitude,
  COUNT(psr.id) FILTER (WHERE psr.seed_category = $2 AND psr.collection_phase = 'bts2026') AS existing
FROM cities c
LEFT JOIN place_seed_raw psr ON psr.city_id = c.id
WHERE c.name_en ILIKE $1
GROUP BY c.id;
```
- existing ≥ 25 → "이미 시드 보유. 발굴 skip" + 종료
- existing < 25 → 3단계 진행

### 3단계 — 서브 에이전트 발굴 (general-purpose + Google Search 강제, 7 카테고리 병렬 동시)

⚠️ 즉시 실행 모드. Plan mode 진입 X. ExitPlanMode 호출 X. 직접 작업 후 보고만.

서브 에이전트 호출 spec (v5 = 32 도시 × 7 카테고리 = 32 회 도시 호출 × 7 병렬 sub-agent):

**🔥 핵심 3 강제 (사용자 2026-04-28, 선임 누락분)**:
1. **Google Search 만 사용** — `WebSearch` 도구로 google.com 직접 호출 강제. Bing/DuckDuckGo/generic search 거부. Pass 1 + Pass 2 모두 Google.
2. **7 카테고리 병렬 동시** — 1 도시 처리 시 단일 메시지에 7 sub-agent 호출 (Promise.all 패턴). model = Sonnet 명시.
3. **Wikipedia = 데이터 소스 X** — 좌표 검증 시 T2 출처로만 사용. 시드 30곳 후보 발굴 = 100% Google Search.

서브 에이전트 호출 spec:
- 도구: `WebSearch` (Google 결과 페이지 직접 fetch 강제) + `WebFetch` (좌표 검증 보조) + Read + Write
- model: Sonnet (Haiku/Opus 아님, Agent tool 의 `model: "sonnet"` 인자 명시)
- 테마 = 한 단어만 (세부 분류 X = 사용자 SSOT)
- 반경 100km (도시 중심 좌표 = cities 테이블)
- 단일 호출 = Pass 1 (초기 발굴) + Pass 2 (자체 검증) 통합
- 1 도시 = 7 sub-agent 병렬 = 약 6분 (순차 42분 대비 7배)

**Pass 1 — Google Search 4 쿼리 + 좌표 검증** (다른 검색엔진 거부):
1. `"{테마영문} {도시영문} {국가}"` (예: "attractions El Paso TX USA") → Google
2. `"best {테마영문} {도시영문} TripAdvisor"` → Google
3. `"top {테마영문} {도시영문} Yelp"` → Google
4. `"popular {테마영문} {도시영문} reviews 2026"` → Google

후보 30 곳 사용자 SSOT 3 조건 정렬:
- ① Google 검색량/노출 (실제 결과 수)
- ② Google Maps 리뷰 수 (평점 X = 개수)
- ③ Google Images 결과 수 (인스타 X)

**좌표 강제 (미달 시 row 제외)**:
- WGS84 소수점 6자리 (예: 31.916370, -106.043444)
- 출처 우선순위:
  · T1 = NRHP / 문화재청 / UNESCO / 공식 등록부 (최고 권위)
  · T2 = Wikipedia infobox 좌표
  · T3 = Google Maps URL @lat,lng 추출
- LLM 추정 = **절대 거부**
- evidence_url = 출처 URL 1 이상
- source_type = "T1" / "T2" / "T3"

**3 조건 노트 (정성 평가 "매우 높음" 등 X = 실측 숫자만)**:
- google_search_note = "Google '키워드' = 약 N건"
- google_review_count = 정수 (예: 2400)
- google_review_count_note = "Google Maps 리뷰 N (확인 YYYY-MM-DD)"
- google_image_count_note = "Google Images '키워드' = 약 N건"

**Pass 2 — 응답 직전 자체 검증 (Google Search 3 쿼리, 다른 검색엔진 거부)**:
1. `"top {category영문} {city} 2026"` → Google
2. `"most popular {category영문} {city} reviews"` → Google
3. `"best {category영문} {city} TripAdvisor"` → Google

Pass 1 list (30 곳) vs Pass 2 결과 비교 → ranking 조정:
- Pass 2 빈번 + Pass 1 미포함 = added (rank 추가)
- Pass 1 상위인데 Pass 2 적음 = demoted (rank 하향)
- Pass 1 상위인데 Pass 2 부재 = removed
- 일치 = `confirmed_top10: true`

**출력 JSON (place_seed_raw 컬럼명 그대로 매핑 = DB 직접 UPSERT 가능)**:

저장 경로: `scripts/{city_lowercase_underscore}-{category}-30-v4.json`

```json
{
  "city": "El Paso",
  "city_id": 101,
  "seed_category": "attraction",
  "collection_phase": "bts2026",
  "passVersion": "v4",
  "discoveredAt": "2026-04-27",
  "rows": [
    {
      "rank": 1,
      "name_ko": "휴코 탱크스 주립 사적지",
      "name_en": "Hueco Tanks State Historic Site",
      "latitude": 31.916370,
      "longitude": -106.043444,
      "source_type": "T1",
      "evidence_url": "https://npgallery.nps.gov/AssetDetail/NRIS/71000930",
      "evidence_verified": true,
      "google_search_note": "Google 'Hueco Tanks El Paso' = 약 580,000건",
      "google_review_count": 2400,
      "google_review_count_note": "Google Maps 리뷰 2,400 (확인 2026-04-27)",
      "google_image_count_note": "Google Images 'Hueco Tanks' = 약 11,000건",
      "nubi_reason": null
    }
  ],
  "verification": {
    "queries": ["...4+3=7 쿼리..."],
    "added": [],
    "demoted": [],
    "removed": [],
    "confirmed_top10": true,
    "confirmedRanks": [1,2,3,4,5,6,7,8,9,10]
  },
  "shortage": null
}
```

**컬럼 매핑** (모두 기존 place_seed_raw 컬럼, 신규 X):
| JSON 필드 | DB 컬럼 |
|---|---|
| `name_ko`, `name_en`, `rank`, `latitude`, `longitude` | 동명 |
| `source_type` | `source_type` (T1/T2/T3) |
| `evidence_url`, `evidence_verified` | 동명 |
| `google_search_note`, `google_review_count`, `google_review_count_note`, `google_image_count_note` | 동명 |
| `nubi_reason` | 100km 외 메모 / 부족 사유 |
| `seed_category`, `collection_phase` | 동명 |
| (rows 그대로 INSERT 시) | `category_tags = [seed_category]`, `phase_tags = [collection_phase]` |

**강제 조건 미달 처리**:
- 30 미달 = `shortage.count` + `shortage.reason` + `shortage.rejected[]` 명시 (가짜 X)
- 좌표 6자리 미달 = row 제외
- evidence_url 없음 = row 제외
- source_type 없음 = row 제외
- LLM 추정 좌표 = 거부

**100km 외 처리**:
- 포함 + `nubi_reason: "100km 외 (Nkm)"` 명시
- 폴리라인 (미션 트레일 등) = `nubi_reason` 메모

**완료 보고 (200 단어 이내)**:
- v4 JSON 경로
- rows N/30, source_type 분포 (T1/T2/T3)
- verification: added/demoted/removed 개수, confirmed_top10
- 100km 외 개수
- shortage 사유 (있으면)

### 4단계 — DB UPSERT (v4 = 기존 컬럼 직매핑, multi-tag)

```sql
INSERT INTO place_seed_raw (
  city_id, seed_category, collection_phase, rank,
  name_ko, name_en,
  latitude, longitude,
  source_type, evidence_url, evidence_verified,
  google_search_note, google_review_count, google_review_count_note, google_image_count_note,
  nubi_reason,
  category_tags, phase_tags, created_at
) VALUES
  -- v4 JSON rows[] 매핑 그대로
  ...30 rows...
ON CONFLICT (city_id, (LOWER(TRIM(name_en))))
WHERE name_en IS NOT NULL AND TRIM(name_en) <> ''
DO UPDATE SET
  category_tags = ARRAY(SELECT DISTINCT UNNEST(COALESCE(place_seed_raw.category_tags, ARRAY[]::text[]) || EXCLUDED.category_tags)),
  phase_tags    = ARRAY(SELECT DISTINCT UNNEST(COALESCE(place_seed_raw.phase_tags, ARRAY[]::text[]) || EXCLUDED.phase_tags)),
  name_ko       = COALESCE(EXCLUDED.name_ko, place_seed_raw.name_ko),
  -- v4 좌표 6자리 = 항상 우선 (기존 4자리 덮어씀)
  latitude      = COALESCE(EXCLUDED.latitude, place_seed_raw.latitude),
  longitude     = COALESCE(EXCLUDED.longitude, place_seed_raw.longitude),
  source_type   = COALESCE(EXCLUDED.source_type, place_seed_raw.source_type),
  evidence_url  = COALESCE(EXCLUDED.evidence_url, place_seed_raw.evidence_url),
  evidence_verified = COALESCE(EXCLUDED.evidence_verified, place_seed_raw.evidence_verified),
  -- 3 조건 노트 = v4 우선
  google_search_note       = COALESCE(EXCLUDED.google_search_note, place_seed_raw.google_search_note),
  google_review_count      = COALESCE(EXCLUDED.google_review_count, place_seed_raw.google_review_count),
  google_review_count_note = COALESCE(EXCLUDED.google_review_count_note, place_seed_raw.google_review_count_note),
  google_image_count_note  = COALESCE(EXCLUDED.google_image_count_note, place_seed_raw.google_image_count_note),
  nubi_reason   = COALESCE(EXCLUDED.nubi_reason, place_seed_raw.nubi_reason),
  rank          = EXCLUDED.rank;  -- Pass 2 최신 순위
```

Supabase MCP `execute_sql` 호출 (project_id: `wxebceflvuythuodemro`).
= **DB schema 변경 X**. 모든 컬럼 = 기존 보유.

### 5단계 — 검증 SELECT

```sql
SELECT 
  COUNT(*) FILTER (WHERE seed_category = $2) AS as_main,
  COUNT(*) FILTER (WHERE $2 = ANY(category_tags)) AS total_with_tag,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND $2 = ANY(category_tags)) AS with_coord
FROM place_seed_raw
WHERE city_id = $1 AND collection_phase = 'bts2026';
```

기대값:
- total_with_tag ≥ 28 (multi-tag 충돌 일부 허용)
- with_coord ≥ 25 (좌표 검증 실패 일부 허용)

---

## 운영 제약 (CLAUDE.md)

- §1: 사용자 명시 승인 (이 커맨드 호출 자체가 승인)
- §3: ⚠️ 수정금지 코드 = 무관 (DB INSERT 만)
- §10: 커밋/푸시 X (사용자 명시 시에만)

---

## 사용 예시 (1 카테고리 단독)

```
사용자: /bts-discover Paris shopping
AI: [Step 1~5 자동 실행 — 1 sub-agent (Sonnet) Google Search 7 쿼리]
   소요 약 6 분
   결과: 30 row 발굴, scripts/paris-shopping-30-v4.json 저장, DB total_with_tag = 30
```

```
사용자: /bts-discover El Paso shopping
AI: Step 2 검증 → existing = 30 → "이미 시드 보유. 발굴 skip"
```

## 사용 예시 (1 도시 풀 = 7 카테고리 병렬)

```
사용자: /bts-discover Mexico City all
AI: [7 sub-agent (Sonnet) 동시 호출 = 단일 메시지에 7 Agent tool calls]
   - sub-agent 1: attraction (Google Search 7 쿼리)
   - sub-agent 2: restaurant (Google Search 7 쿼리)
   - sub-agent 3: healing (Google Search 7 쿼리)
   - sub-agent 4: adventure (Google Search 7 쿼리)
   - sub-agent 5: hotspot (Google Search 7 쿼리)
   - sub-agent 6: heritage (Google Search 7 쿼리)
   - sub-agent 7: shopping (Google Search 7 쿼리)
   소요 약 6 분 (병렬, 순차 42 분 대비 7배)
   결과: 7 JSON 저장 + consolidate-v3-best-rank.mjs → 161 unique row → DB UPSERT
```

---

## 향후 확장

- **32 도시 자동 routine** = Claude `schedule` 스킬 매일 KST 03:00 → 다음 도시 (cities.bts_concert_dates ASC) → 7 카테고리 병렬 sub-agent → consolidate → DB → /bts-image-fill 연쇄
- 부족분 도시 자동 선택: `/bts-discover-next` (cities 테이블 SELECT → 가장 부족한 도시 + 카테고리 자동)
- = 사용자 한 줄도 안 누르고 32 도시 × 7 카테고리 = 약 1 달 자동 완료