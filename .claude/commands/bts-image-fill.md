---
description: BTS 이미지 채우기 - city_id 기준 NULL row 에 Google + Wikidata + Wikipedia + Unsplash 풀 컨텍스트 폴백 + 좌표 6자리 보존 + orphan JPG 복구 (사용자 2026-04-28 검증 표준)
argument-hint: <city_id 또는 city_name>
---

# BTS 이미지 채우기 슬래시 커맨드

**입력**: $ARGUMENTS (예: `101` 또는 `El Paso`)

**참조**: 2026-04-28 엘파소 city_id=101 에서 검증 완료된 표준 워크플로 (163 row 100% 카드 ready 달성).

**필수 도구**: Supabase MCP (`mcp__claude_ai_Supabase__*`) + GHA (`gh` CLI)

---

## 자동 워크플로우 (5 단계)

이 커맨드 호출 시 = 다음 단계를 자동 실행. **각 단계 완료 후 사용자 OK 받음** (자동 모드 시 OK 생략).

⚠️ **즉시 실행 모드. Plan mode 진입 X. ExitPlanMode 호출 X.**

### 0단계 — 입력 파싱 + 도시 확인

```sql
SELECT id AS city_id, name_en, country_code 
FROM cities 
WHERE ($1::int IS NOT NULL AND id = $1) 
   OR LOWER(name_en) = LOWER($2)
LIMIT 1;
```
- 매개변수: `$1` = 숫자 city_id 시도, `$2` = name_en (예: 'El Paso')
- 미발견 = 즉시 거부

---

### 1단계 — 좌표 schema 검증 (numeric(9,6) 보장)

```sql
SELECT data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'place_seed_raw' AND column_name = 'latitude';
```

- **`numeric(9,6)` 이면** → 통과
- **`real` 또는 다른 타입이면** → Supabase MCP `apply_migration` 으로 ALTER:
```sql
-- migration name: enforce_6_digit_coordinates
ALTER TABLE place_seed_raw 
  ALTER COLUMN latitude  TYPE numeric(9,6) USING latitude::numeric(9,6),
  ALTER COLUMN longitude TYPE numeric(9,6) USING longitude::numeric(9,6);

ALTER TABLE cities
  ALTER COLUMN latitude  TYPE numeric(9,6) USING latitude::numeric(9,6),
  ALTER COLUMN longitude TYPE numeric(9,6) USING longitude::numeric(9,6);
```
- 무손실 변환 (4자리 → numeric(9,6) = 뒤 zeros), Google Photo 6자리 정확 보존 가능

---

### 2단계 — 현재 DB 상태 진단

```sql
SELECT 
  seed_category,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '') AS null_cnt,
  COUNT(*) FILTER (WHERE image_url LIKE '%storage/v1/object/public/place-images%') AS google_jpg,
  COUNT(*) FILTER (WHERE image_attribution LIKE 'Wikipedia%') AS wiki,
  COUNT(*) FILTER (WHERE image_attribution LIKE '%Unsplash%') AS unsplash
FROM place_seed_raw
WHERE city_id = $1 AND collection_phase = 'bts2026'
GROUP BY seed_category ORDER BY seed_category;
```

```sql
-- Storage orphan 검출 (storage 파일 있고 DB row 없음)
SELECT COUNT(*) AS orphan_count
FROM storage.objects o
LEFT JOIN place_seed_raw p ON p.id = split_part(split_part(o.name, '/', 3), '.', 1)::int
  AND p.city_id = $1 AND p.collection_phase = 'bts2026'
WHERE o.bucket_id = 'place-images' AND o.name LIKE $1 || '/%' AND o.name LIKE '%.jpg'
  AND p.id IS NULL;
```

- `null_cnt` = v2 폴백 처리 대상
- `orphan_count` ≥ 1 = 3단계 실행 / 0 = skip

---

### 3단계 — Orphan JPG 복구 (orphan_count ≥ 1 시)

GHA 워크플로 `BTS Orphan JPG Recovery (39 files, 04-27 cron)` 트리거:

```bash
# Dry-run 먼저 (매칭 결과 확인)
gh workflow run "BTS Orphan JPG Recovery (39 files, 04-27 cron)" -f commit=false
```

- 04-27/04-28 cron run 로그에서 textQuery → row_id 추출
- 살아있는 row 와 LOWER(TRIM(name_en)) 정확 매칭
- 매칭 N건 / 실패 (orphan-N)건 보고

**dry-run 결과 OK 시** (자동 모드면 OK 생략):
```bash
gh workflow run "BTS Orphan JPG Recovery (39 files, 04-27 cron)" -f commit=true
```

= Storage rename + DB image_url 백필 (`COALESCE` 보호로 NULL 만 채움).

⚠️ run_id 가 04-27 cron 외 다른 도시면 = `scripts/p4-orphan-jpg-recovery.mjs` 의 `RUN_IDS` 배열을 도시별 cron run 목록으로 갱신 필요.

---

### 4단계 — V2 풀 컨텍스트 폴백 (NULL 잔여 채우기)

GHA 워크플로 `BTS Image Fallback v2 (Wikidata + Wikipedia + Unsplash, full context)` 트리거:

```bash
gh workflow run "BTS Image Fallback v2 (Wikidata + Wikipedia + Unsplash, full context)" -f city_id=<city_id>
```

스크립트 `scripts/p3-wikipedia-unsplash-fill-v2.mjs` 가 자동 실행:
1. **Wikidata SPARQL** (P625 좌표 around 1km + P31 카테고리 + 영어 라벨) — 1순위
2. **Wikipedia opensearch 풀 컨텍스트** (`name + city + state + country` 6 조합) — 2순위
3. **Unsplash 풀 컨텍스트** (`name + city + state + category_kw` 3 조합) — 3순위
4. **COALESCE 보호** = NULL 만 채움. 기존 Google/Wiki/Unsplash 절대 덮어쓰기 X

dry-run 없음 = 즉시 commit (사용자 본질: 빈 카드 방지). 실패 row = NULL 유지 (다음 cron 또는 다음 v2 실행에서 채움).

---

### 5단계 — 최종 검증 + 프론트엔드 ready 보고

```sql
-- 카테고리별 최종 분포
SELECT 
  seed_category,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE image_url IS NULL) AS still_null,
  COUNT(*) FILTER (WHERE image_url LIKE '%storage/v1/object/public/place-images%') AS google_jpg,
  COUNT(*) FILTER (WHERE image_attribution LIKE 'Photo via Google Places (recovered%') AS recovered,
  COUNT(*) FILTER (WHERE image_attribution LIKE 'Wikipedia%') AS wiki,
  COUNT(*) FILTER (WHERE image_attribution LIKE '%Unsplash%') AS unsplash,
  ROUND(100.0 * COUNT(*) FILTER (WHERE image_url IS NOT NULL) / COUNT(*), 1) AS fill_pct
FROM place_seed_raw
WHERE city_id = $1 AND collection_phase = 'bts2026'
GROUP BY seed_category ORDER BY seed_category;
```

```sql
-- 카드 즉시 사용 가능 검증 (좌표 + 이름 + 이미지 모두)
SELECT 
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE 
    latitude IS NOT NULL AND longitude IS NOT NULL 
    AND name_en IS NOT NULL AND TRIM(name_en) <> ''
    AND image_url IS NOT NULL AND image_url <> ''
  ) AS card_ready
FROM place_seed_raw
WHERE city_id = $1 AND collection_phase = 'bts2026';
```

**보고 (200 단어 이내)**:
- 카테고리별 표 (Google + Recovered + Wiki + Unsplash + NULL + fill_pct)
- 카드 즉시 사용 가능 = N / total = X%
- 진정성 분포: Google + Recovered (진짜 사진) %, Wiki entity %, Unsplash stock %
- 프론트엔드 준비 = YES / 부족 (사유 명시)

---

## 표준 결과 (엘파소 city_id=101 검증 완료, 2026-04-28)

| 카테고리 | 합계 | Google | Recovered | Wiki | Unsplash | NULL | fill% |
|---|---|---|---|---|---|---|---|
| restaurant | 30 | 7 | 7 | 1 | 22 | 0 | 100 |
| shopping | 30 | 3 | 3 | 3 | 24 | 0 | 100 |
| heritage | 25 | 0 | 0 | 14 | 11 | 0 | 100 |
| adventure | 25 | 4 | 0 | 5 | 16 | 0 | 100 |
| healing | 24 | 8 | 3 | 2 | 14 | 0 | 100 |
| attraction | 14 | 5 | 0 | 7 | 2 | 0 | 100 |
| hotspot | 12 | 1 | 1 | 6 | 5 | 0 | 100 |
| BTS 3종 | 3 | 0 | 0 | 0 | 0 | 0 | 100 |
| **합계** | **163** | **28** | **14** | **38** | **94** | **0** | **100** |

= card_ready 163/163 = **프론트엔드 즉시 사용 가능**.

---

## 핵심 자산 (수정 금지)

- `scripts/p3-wikipedia-unsplash-fill-v2.mjs` — v2 풀 컨텍스트 폴백
- `scripts/p4-orphan-jpg-recovery.mjs` — orphan 복구
- `.github/workflows/bts-image-fallback-v2.yml` — v2 워크플로
- `.github/workflows/bts-orphan-jpg-recovery.yml` — orphan 워크플로
- `scripts/p0-bts-daily-cron.mjs` — Google cron (CLAUDE.md §3 보호)
- `scripts/p1-wikipedia-image-fill.mjs`, `p1-unsplash-image-fill.mjs` — 메모리 §2 보호

---

## 운영 제약 (CLAUDE.md)

- §1: 사용자 명시 승인 (이 커맨드 호출 자체가 승인)
- §3: ⚠️ 수정금지 코드 = 무관 (이미지 채우기만, 보호 파일 수정 X)
- §10: 커밋/푸시 X (사용자 명시 시에만)

---

## 사용 예시

```
사용자: /bts-image-fill 101
AI: [0~5단계 자동 실행]
   1단계 좌표 schema OK / orphan 0 / NULL 0
   2단계 진단: NULL 12, orphan 5
   3단계 orphan dry-run → commit (5 → 4 복구)
   4단계 v2 fallback (NULL 12 → 0)
   5단계 보고: 163/163 card_ready, 프론트엔드 YES
   소요 약 8 분
```

```
사용자: /bts-image-fill Paris
AI: city_id=502 (Paris) 자동 변환 → 동일 5단계 진행
```

```
사용자: /bts-image-fill 999
AI: city 미발견 → 즉시 거부
```

---

## 향후 확장

- 32 도시 일괄 = 별도 cron (워크플로 schedule 추가) 또는 = 사용자가 매일 1 줄 호출
- BTS 외 다른 collection_phase 지원 = `--phase` 인자 추가 (현재 `bts2026` 고정)
- 부족분 도시 자동 선택: `/bts-image-fill-next` (cities 테이블 SELECT → null_cnt 가장 큰 도시 자동)
