# 07-merge-dups — 필수 과정

## 호출 흐름

```
[입력] city_id
   ↓
1. 활성 행 SELECT (= 카테고리 무관)
   ↓
2. 5 단계 매칭 dry-run = 모든 활성 행 × 모든 활성 행 비교
   ├─ 0순위 = google_place_id 같음 → 같은 그룹
   ├─ 1순위 = 풀 주소 norm + 이름 9 조합 동시 → 같은 그룹
   ├─ 2순위 = google_maps_uri 같음 → 같은 그룹
   ├─ 3순위 = 좌표 10m → 같은 그룹
   └─ 4순위 = 이름 LOWER+trim 9 조합 → 보조 그룹 (= 체인 위험)
   ↓
3. 그룹 분류:
   - 명확 그룹 (= 0/1/2/3 순위) = 자동 archive 후보
   - 의심 그룹 (= 4순위 only) = Gemini prompt 호출 또는 사용자 cc2 검수
   ↓
4. 산출물 raw 저장 = docs/raw/{city_id}/07-merge-dups-groups-{YYYY-MM-DD}.json
   ↓
5. (옵션) Gemini prompt 호출 = 의심 그룹 분석 (= prompt.txt)
   = docs/raw/{city_id}/07-merge-dups-decisions-{YYYY-MM-DD}.json
   ↓
6. 사용자 cc2 검수 (= 필수)
   ↓
7. post-process.ts = 사용자 명시 후 archive 트랜잭션
```

## keep 우선순위 (= 사용자 SSOT [[feedback_dedup_keep_priority]])

```
1. google_place_id 보유 행 (= 가장 신뢰)
2. 더 상세한 이름 (= "L'Ami Jean" > "Ami Jean")
3. 풍부도 (= summary_ko + editorial_summary + image_url + lat/lng 모두 채워진 행)
4. rank 낮은 행 (= 인기 순위 우선)
```

## archive 정책 (= 헌법 §14 v2)

- 통합 시 = 옛 행 = `phase_tags` 에 `archived-merge-{YYYY-MM-DD}` 추가
- 식별 데이터 = COALESCE 옛 우선 (= 보존 = name_en/주소/좌표)
- 가격 = COALESCE 새 우선 (= 최신최우선 = §14, 옛 GREATEST 폐기 2026-06-10)
- 카피 = 새 우선 (= Gemini 큐레이션 갱신)
- tags = UNION (= 누적)

## 검증 조건

| 항목 | 기준 |
|---|---|
| dry-run 그룹 수 | 0 이상 (= 0 OK = 중복 없음) |
| 명확 그룹 (= 0/1/2/3 순위) | 사용자 검수 후 자동 archive 가능 |
| 의심 그룹 (= 4순위 only) | Gemini 또는 사용자 검수 후만 archive |
| 트랜잭션 = BEGIN/COMMIT | 원자성 |
| archive 시 keep 선정 = 4 우선순위 부합 | 100% |

## 본 세션 검증 (= Paris 5-18)

- 활성 422 행 dry-run = **27 그룹 / 38 행 흡수 가능**
- 매칭 단계별 = PID 0 / 1 순위 (= 주소+이름) 33 / URI 0 / 좌표 1 / 이름 4
- 사용자 cc2 검수 후 archive = **15 그룹 / 16 행** (= 활성 422 → 407)
- 좌표 10m + cross-category = **2 그룹** (= Palais Royal 72732 / Concorde Retro Tour 62047) = 활성 407 → 405