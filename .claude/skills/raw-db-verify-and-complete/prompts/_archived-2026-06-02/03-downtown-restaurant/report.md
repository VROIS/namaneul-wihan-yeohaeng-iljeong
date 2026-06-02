# 03-downtown-restaurant — 최종 결과 보고서 템플릿

## 도시 정보

| 항목 | 값 |
|---|---|
| city_id | `{19}` |
| 호출 일자 | `{YYYY-MM-DD}` |

## Gemini 호출 결과 (= 4 호출 분할)

| 호출 | tier | finishReason | 응답 수 | 토큰 | 비용 |
|---:|---|---|---:|---:|---:|
| 1 | ECONOMIC | STOP | 30 | ~5500 | $0.002 |
| 2 | REASONABLE | STOP | 30 | ~5500 | $0.003 |
| 3 | PREMIUM | STOP | 30 | ~5500 | $0.003 |
| 4 | LUXURY | STOP | 30 | ~5500 | $0.004 |
| **합계** | - | - | **120** | ~22000 | **$0.012** |

## 산출물 raw 보관

- 호출 1 = `docs/raw/{city_id}/03-downtown-restaurant-economic.json`
- 호출 2 = `docs/raw/{city_id}/03-downtown-restaurant-reasonable.json`
- 호출 3 = `docs/raw/{city_id}/03-downtown-restaurant-premium.json`
- 호출 4 = `docs/raw/{city_id}/03-downtown-restaurant-luxury.json`

## 중복 방지 검증

| 호출 | EXCLUDE 대비 중복 |
|---:|---|
| 1 → 2 (= reasonable) | `{0}` |
| 1,2 → 3 (= premium) | `{0}` |
| 1,2,3 → 4 (= luxury) | `{0}` |

## 지리 검증

| 항목 | 기준 | 결과 |
|---|---|---|
| distance_km_from_center <= 10 | 120/120 | `{N/120}` |
| day_zone == 'core' | 120/120 | `{N/120}` |

## MEAL_BUDGET 매트릭스 검증

| Tier | 기대 범위 | 실제 가격 분포 | 매트릭스 부합 |
|---|---|---|---|
| economic | ≤€24 | `{min N, max N}` | `{✓/✗}` |
| reasonable | €25-60 | `{min N, max N}` | `{✓/✗}` |
| premium | €61-180 | `{min N, max N}` | `{✓/✗}` |
| luxury | €181+ | `{min N, max N}` | `{✓/✗}` |

= MEAL_BUDGET 매트릭스 부합 시 = AG2 식당 풀 격리 = 자동 적용 가능

## DB INSERT 결과

| 항목 | 수 |
|---|---:|
| inserted | `{N}` |
| updated | `{N}` |
| skipped | `{N}` |
| errors | `{N}` |

## 다음 단계

- [ ] 03-downtown + 04-outskirt = 통합 식당 풀 검증
- [ ] AG2-DB budget WHERE 필터 = 4 tier 격리 검증 (= Paris 패턴 적용)