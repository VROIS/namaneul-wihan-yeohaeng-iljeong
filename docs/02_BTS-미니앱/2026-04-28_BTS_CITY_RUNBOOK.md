# BTS 도시 처리 RUNBOOK (사용자 매뉴얼 + 후임 AI 인수인계)

> **목적**: 사용자가 채팅창에 "어떻게 입력하면 되는지" + AI가 "무엇을 자동 실행하는지" 한 페이지 요약.
> **작성일**: 2026-04-28 (스케줄러 폐기 후 manual trigger 표준 확정).
> **선행 자산**: [[BTS_MASTERPLAN_v3]] · [[bts-discover]] · [[bts-image-fill]] · [[bts-daily-reseed]]

---

## 사용자가 채팅창에 입력할 3 가지

### 옵션 A — 한 줄로 풀 사이클 (권장)

```
Mexico City 처리해라
```

또는

```
다음 도시 풀 처리해라
```

→ AI 가 [[#3-자산-순차-실행]] (Step 1+2+3) 자동 진행. 단계별 결과 보고. 사용자 OK 후 다음 단계.

---

### 옵션 B — 단계별 호출 (정밀 제어)

```
1. /bts-discover Mexico City all
2. /bts-image-fill 102
3. GHA 워크플로 실행: bts-daily-reseed.yml city=Mexico_City
```

→ 각 단계 사용자가 별도 trigger. AI 가 그 단계만 처리.

---

### 옵션 C — 부분 처리 (특정 카테고리만)

```
/bts-discover Mexico City shopping
```

→ 1 카테고리 30 곳만 발굴. 다른 단계 skip.

---

## 3 자산 순차 실행

### Step 1: `/bts-discover <city> all` (~6분)

**AI 가 자동 실행**:
1. 입력 도시 DB 검증 (existing ≥ 25 = skip)
2. 부족 카테고리 7 sub-agent 병렬 (Sonnet, Google Search 만)
3. dedupe → ~161 unique row
4. DB UPSERT (`place_seed_raw`)
5. 7 JSON 저장: `scripts/{city_slug}-{cat}-30-v4.json`

**핵심 강제**:
- Google Search 만 사용 (Bing/DuckDuckGo/generic 거부)
- 7 카테고리 = 7 sub-agent 동시 (Promise.all)
- model = Sonnet (Haiku/Opus X)
- Wikipedia = 좌표 검증 보조만 (데이터 소스 X)
- 좌표 6자리 강제 (T1=NRHP/UNESCO / T2=Wikipedia / T3=Google Maps)

**결과 확인**:
- MCP execute_sql 또는 Supabase Studio:
```sql
SELECT seed_category, COUNT(*) FROM place_seed_raw 
WHERE city_id = <city_id> AND collection_phase = 'bts2026'
GROUP BY seed_category;
```

---

### Step 2: `/bts-image-fill <city_id>` (~5분)

**AI 가 자동 실행** (5단계):
0. 입력 파싱 + 도시 확인
1. 좌표 schema (`numeric(9,6)`) 검증 (필요 시 ALTER)
2. DB 진단 + Storage orphan JPG 감지
3. Orphan 복구 (있으면 dry-run → commit, Storage rename + DB 백필)
4. v2 풀 컨텍스트 폴백 (Wikidata + Wikipedia + Unsplash)
5. 카드 ready 검증 + 보고

**핵심 강제**:
- COALESCE 보호 = NULL 만 채움 (기존 Google/Wiki/Unsplash 안 덮어씀)
- Unsplash = 마지막 폴백 (adventure/attraction 50%+ 일치, restaurant/shopping ~10%)
- 좌표 numeric(9,6) = Google Photo 응답 6자리 보존

**결과 확인**:
- 카테고리별 NULL/Google/Wiki/Unsplash 분포
- card_ready 비율 = 좌표 + 이름 + 이미지 모두 있는 row

---

### Step 3: GHA `bts-daily-reseed.yml` 수동 trigger (~10분)

**사용자 trigger**:
```bash
gh workflow run "BTS Daily Reseed (1 city/day, 6 categories)" -f city=<City_Name>
```

또는 GitHub UI:
- Actions 탭 → BTS Daily Reseed → Run workflow → city 입력

**AI 가 자동 실행** (`scripts/p0-bts-daily-cron.mjs`):
1. Google Text Search 50 + Photo 50 한도
2. top 40 (vibe 6×5 + restaurant 10) 만 처리
3. JPEG binary 다운로드 → Supabase Storage 업로드
4. DB UPDATE = `image_url` Google CDN URL **덮어쓰기** (Wiki/Unsplash 위에)
5. `google_place_id` + 좌표 6자리 + `image_attribution` 갱신

**핵심 강제**:
- Storage 경로 = `place-images/{city_id}/{seed_category}/{row_id}.jpg`
- Google 응답 받은 row 만 UPDATE (안 받은 = 기존 Wiki/Unsplash 보존)
- 선임 사고 방지: DELETE 절대 X (UPDATE만)

**결과 확인**:
- GHA Actions 로그 (run #...)
- Storage 버킷 `place-images/{city_id}/` 신규 .jpg
- DB image_attribution = `'Photo via Google Places (place_id)'`

---

## "어떤 도시 처리할까?" — 콘서트 임박순

```sql
SELECT id AS city_id, name_en, country_code, bts_concert_dates,
  COUNT(DISTINCT psr.seed_category) FILTER (WHERE psr.seed_category IN 
    ('attraction','restaurant','healing','adventure','hotspot','heritage','shopping')
  ) AS categories_done
FROM cities c
LEFT JOIN place_seed_raw psr ON psr.city_id = c.id AND psr.collection_phase = 'bts2026'
WHERE c.bts_rank IS NOT NULL
GROUP BY c.id, c.name_en, c.country_code, c.bts_concert_dates
ORDER BY c.bts_concert_dates ASC NULLS LAST;
```

**현재 (2026-04-28) 임박순**:
- ~~El Paso~~ (5/2) ✅ 완료
- **Mexico City** (5/7) ← 다음
- Stanford (5/16)
- Las Vegas (5/23)
- Busan (6/12)
- ...

---

## 작업 빈도 (Google quota 한계)

| 항목 | 한계 |
|---|---|
| Google Text Search | 50/일 |
| Google Photo Media | 50/일 |
| 1 도시 = 40 호출 (top 40) | = 1 도시/일 이론상 |
| 32 도시 전체 | 약 32 일 (사용자 manual trigger) |

= 사용자가 **하루에 1 도시만** 처리. 동시에 여러 도시 X (quota 초과).

---

## 현재 자산 (2026-04-28 검증 완료)

### 스킬 (`.claude/commands/`)
- [[bts-discover]] = Step 1 발굴 스킬 (7 병렬 Google Search Sonnet)
- [[bts-image-fill]] = Step 2 이미지 채움 스킬 (5단계 자동)

### GHA 워크플로 (`.github/workflows/`)
- `bts-daily-reseed.yml` = Step 3 Google cron (수동 trigger 만, schedule 제거됨)
- `bts-image-fallback-v2.yml` = Step 2 안에서 호출되는 GHA
- `bts-orphan-jpg-recovery.yml` = Step 2 안에서 orphan 있을 때 호출

### 스크립트 (`scripts/`)
- `p0-bts-daily-cron.mjs` (Step 3 본체, ⚠️ 수정금지)
- `p3-wikipedia-unsplash-fill-v2.mjs` (Step 2 본체)
- `p4-orphan-jpg-recovery.mjs` (Step 2 orphan 복구 본체)

### 검증된 도시 (1 케이스)
- El Paso (city_id=101) — 163 row, 100% card ready (2026-04-28 검증)

---

## 후임 AI 가 따라야 할 4 강제

1. **사용자 명시 승인 후 진행** (CLAUDE.md §1)
2. **DELETE 절대 X** — UPDATE-only (선임 39 orphan 사고 사유)
3. **MCP > 직접 pg** (사용자 명시)
4. **사용자 SSOT 절대 준수**:
   - 평점 X / 인스타 X / 세분류 X / LLM 좌표 추정 X
   - Google funnel (검색량 + 리뷰 수 + 이미지 수) 만 사용
   - 좌표 = T1/T2/T3 공식 등록부만

= 메모리 [[feedback_user_perspective_logic_ai_cannot_invent]] + [[feedback_google_search_only_7_parallel_sonnet]] 우선 읽기.

---

## 사용자 한 줄 → AI 흐름 표

| 사용자 입력 | AI 행동 |
|---|---|
| `Mexico City 처리해라` | Step 1+2+3 풀 사이클 (~25분, 단계별 OK 받음) |
| `/bts-discover Mexico City all` | Step 1 만 (~6분) |
| `/bts-image-fill 102` | Step 2 만 (~5분) |
| `gh workflow run ... -f city=Mexico_City` | Step 3 만 (~10분) |
| `Mexico City shopping 만 발굴` | Step 1 부분 (~6분, 1 카테고리) |
| `/bts-discover Stanford all` 후 stop | Step 1 만 진행 후 사용자 결정 대기 |

---

## 참고 문서

- [[BTS_MASTERPLAN_v3]] — 800줄 종합 plan (Screen 4~6 + 숏폼 + 동선 + cron)
- [[BTS_DISCOVER_WORKFLOW]] — Step 1 상세 spec
- [[MCP_RAW_DATA_PROMPTS]] — 사용자 SSOT 7 카테고리 프롬프트
- [[HANDOVER_2026-04-28]] — 어제 인수인계 (이번 세션 시작 시점 진실)
