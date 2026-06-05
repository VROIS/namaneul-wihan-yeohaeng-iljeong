# BTS 자동화 Step E.5 + E (2026-04-27 v4)

> 목표: **사용자 개입 0** = 매일 1 도시 자동 시드 + 이미지 채움.
> 32 BTS 콘서트 도시 = 약 1 달 (도시당 1 일).

---

## 아키텍처 (실행 위치별)

```
[KST 03:00 매일] = Claude `schedule` 스킬 routine
    ├─ 1) DB 정렬: 다음 임박 도시 SELECT (cities.bts_concert_dates ASC + 미완료)
    ├─ 2) 발굴: 사용자 결정 옵션 A/B/C/D (아래) 중 1
    ├─ 3) consolidate-v3-best-rank.mjs: 7 카테고리 → 161 unique row SQL
    └─ 4) gh workflow run bts-bts2026-upsert.yml -f city={slug}

[KST 04:30 매일] = GitHub Actions schedule '30 19 * * *' UTC
    ├─ 5) bts-daily-reseed.yml: 자동 도시 선택 + Google Places searchText + Photo + Storage UPDATE
    └─ 6) DB UPDATE: image_url + place_id + userRatingCount

[KST 05:00 매일] = Claude routine (선택)
    └─ 7) gen-qa-html.mjs: 시각 QA HTML 생성 (사용자 수동 점검용)
```

---

## 발굴 옵션 (사용자 결정 필요)

### A. 풀 서브에이전트 (Sonnet) — 현재 El Paso 패턴
- 도시당 7 sub-agent 호출 (Pass 1+2 통합 단일)
- 토큰 비용 = ~$3-10/도시 = 31 도시 ~$93-310
- 품질 = 최고 (NRHP/Wikipedia/Google 검증)

### B. Wikidata SPARQL + cron — 토큰 0
- SPARQL 쿼리로 카테고리 매칭 + 좌표 (Wikidata = T1 권위)
- LLM 호출 X = $0
- 품질 = 좌표/이름 솔리드, 3 조건 정성평가 약화
- cron 의 `userRatingCount` 정수 = 사용자 SSOT 3 조건 중 가장 정확한 값

### C. 하이브리드 — 약점 보강
- Wikidata 6 카테고리 (heritage/attraction/healing/adventure/hotspot/restaurant) = $0
- Sub-agent 1 카테고리 (shopping = Wikidata 약점) = $0.5-1.5/도시
- 31 도시 합계 = ~$15-50

### D. Haiku 모드 — 저비용 sub-agent
- 7 sub-agent × Haiku 4.5 ($1/$5 per MTok)
- 도시당 ~$1-3 = 31 도시 ~$31-93
- 품질 = 좌표/이름 솔리드, 3 조건 메모 단순화

---

## Step E.5 — 후처리 자동화 (이미 작성)

### 1) Dedup
- `scripts/consolidate-v3-best-rank.mjs` = 7 v3 JSON → name_en dedupe → 최저 rank = primary
- 결과: 210 → 161 unique (49 중복 제거)
- 단일 트랜잭션 = DELETE (7 vibe 카테고리만, BTS 보존) + INSERT 161

### 2) QA HTML
- `scripts/gen-qa-html.mjs <slug> "<City Name>"`
- 출력: `scripts/{slug}-qa.html` (Google/OSM 지도 + 7 카테고리 카드 그리드)
- El Paso 결과: 122 KB / 210 핀 / 7 카테고리 섹션

### 3) DB UPSERT
- `scripts/p2-bts2026-upsert.mjs <slug>`
- 입력: `scripts/sql/{slug}-bts2026/elpaso-0[0-7]-*.sql` 8 파일
- 직접 pg (`SUPA_URL`) + BEGIN/COMMIT 트랜잭션
- GitHub Actions: `.github/workflows/bts-bts2026-upsert.yml` (workflow_dispatch -f city={slug})

---

## Step E — 자동화 인프라 (이미 구축)

### 1) GitHub Actions schedule 복원
- `.github/workflows/bts-daily-reseed.yml` → `cron: '30 19 * * *'` (UTC 19:30 = KST 04:30)
- Google Places API daily quota reset (PDT 00:00 = UTC 07:00) 후 = 안전

### 2) 일일 cron 동작
```yaml
schedule:
  - cron: '30 19 * * *'  # UTC 19:30 = KST 04:30
```
- 자동 도시 선택 = `scripts/p0-bts-daily-cron.mjs:312` (cities ASC bts_concert_dates + 미완료)
- 호출 = 50 search + 50 photo (2025 quota 50/day)

### 3) Schedule 스킬 routine (사용자 결정 후)
- 매일 KST 03:00 = 다음 도시 발굴 트리거
- 옵션 A/B/C/D 중 1 = 사용자 결정 후 routine 등록

---

## 검증 + 모니터링

```sql
-- 매일 진행도 확인
SELECT
  COUNT(DISTINCT city_id) AS cities_seeded,
  COUNT(*) FILTER (WHERE collection_phase='bts2026' AND evidence_verified=true) AS verified_rows,
  COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS with_image
FROM place_seed_raw
WHERE collection_phase='bts2026';

-- 32 BTS 도시 = 32 cities, 32 × 161 = 5152 verified rows 목표
```

---

## 사용자 결정 대기

| 결정 | 옵션 |
|---|---|
| 발굴 방식 | A (Sonnet $93-310) / **B (Wikidata $0)** / C ($15-50) / D (Haiku $31-93) |
| 시작 시점 | Mexico City (5/7) — 5월 5일까지 = 약 8 일 여유 |
| schedule routine | Claude `schedule` 스킬 등록 / 수동 매일 트리거 |

권장 = **B (Wikidata)** — 무료 + 사용자 SSOT 3 조건의 최정확값 (`userRatingCount`) = cron 이 채움.
