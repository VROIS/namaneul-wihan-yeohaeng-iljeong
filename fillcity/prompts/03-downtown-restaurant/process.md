# 03-downtown-restaurant — 필수 과정

## 호출 흐름 (= 4 호출 분할 = MEAL_BUDGET 4 tier)

```
[입력] city_id, year
   ↓
1. cities = name_en, country, lat, lng 조회
   ↓
2. 호출 1 = 30 ECONOMIC (= ≤€24)
   - ${TIER_LABEL} = "30 ECONOMIC"
   - ${TIER_SPEC} = "30 ECONOMIC (= 1인당 평균 ~€24 이하 = 베이커리/크레페리/패스트/한식)"
   - ${OUTPUT_SPEC} = '{ "results": { "economic": [ ...30 ] } }'
   ↓ docs/raw/{city_id}/03-downtown-restaurant-economic.json
3. 호출 2 = 30 REASONABLE (= €25-60)
   - EXCLUDE_LIST = 호출 1 응답 list
   ↓ docs/raw/{city_id}/03-downtown-restaurant-reasonable.json
4. 호출 3 = 30 PREMIUM (= €61-180)
   - EXCLUDE_LIST = 호출 1+2 응답 list
   ↓ docs/raw/{city_id}/03-downtown-restaurant-premium.json
5. 호출 4 = 30 LUXURY (= €181+)
   - EXCLUDE_LIST = 호출 1+2+3 응답 list
   ↓ docs/raw/{city_id}/03-downtown-restaurant-luxury.json
6. post-process.ts = upsertPlace() 통해 INSERT
```

## TIER_SPEC (= MEAL_BUDGET 매트릭스 부합)

| Tier | Label | Spec |
|---|---|---|
| economic | `30 ECONOMIC` | `30 ECONOMIC (= 1인당 평균 ~€24 이하 = 베이커리/크레페리/패스트/한식 분식)` |
| reasonable | `30 REASONABLE` | `30 REASONABLE (= 1인당 평균 €25-60 = 비스트로/브라세리/평범한 디너)` |
| premium | `30 PREMIUM` | `30 PREMIUM (= 1인당 평균 €61-180 = 미슐랭 빕구르망/한국 vlog 인기 다이닝)` |
| luxury | `30 LUXURY` | `30 LUXURY (= 1인당 평균 €181+ = 미슐랭 1+ 스타/시그너처)` |

## 응답 한계

- 1 호출 = 30 곳 = ~5000-6500 토큰 = 안전 (= 8192 한계 이하)
- 4 호출 = 약 $0.012 (= 4 × $0.003)

## 데이터 흐름 (= 응답 → DB)

| 응답 필드 | upsertPlace 필드 | 정책 |
|---|---|---|
| `name_en`/`name_local`/`name_ko` | `nameEn`/`nameLocal`/`nameKo` | 표준 |
| `address` | `address` | - |
| `price_eur_max` | `priceEur` | **COALESCE 새 우선** (= 최신최우선 §14) |
| `distance_km_from_center` | `distanceKmFromCenter` | <= 10 (= 도심 강제) |
| `day_zone` | `dayZone` | "core" (= 강제) |
| `selection_reason_ko` | `selectionReasonKo` | → summary_ko |
| `shortform_ko` | `shortformKo` | → editorial_summary |
| (메타) | `seedCategory` | "restaurant" |
| (메타) | `phaseTags` | `['downtown-restaurant-${YYYY-MM-DD}']` |

## 매칭 (= upsertPlace 5 단계 자동)

= 트리거 v2 = `place_seed_raw_prevent_dup` 함수 = 주소 + 이름 9 조합 동시 자동
= 중복 자동 검출 = UPDATE (= COALESCE) / 신규 INSERT

## 검증 조건

| 항목 | 기준 |
|---|---|
| 호출 4 응답 총합 | 120 |
| distance_km_from_center <= 10 | 120/120 (= 도심 강제) |
| day_zone == 'core' | 120/120 |
| 호출 N 응답 중 호출 N-1 중복 | 0 (= EXCLUDE_LIST 효과) |
| INSERT 결과 | inserted + updated = 120 |
| errors | 0 |