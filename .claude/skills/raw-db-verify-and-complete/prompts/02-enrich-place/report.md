# 02-enrich-place — 최종 결과 보고서 템플릿

## 도시 정보

| 항목 | 값 |
|---|---|
| city_id | `{19}` |
| 활성 행 수 (= 입력) | `{N}` |
| 호출 일자 | `{YYYY-MM-DD}` |

## Batch 호출 결과

| batch | offset | 사이즈 | finishReason | 응답 places | 누락 id | 비용 |
|---:|---:|---:|---|---:|---:|---:|
| 1 | 0 | 40 | STOP | 40 | 0 | $0.002 |
| 2 | 40 | 40 | STOP | 40 | 0 | $0.002 |
| ... | ... | ... | ... | ... | ... | ... |
| **합계** | - | - | - | `{N}` | `{0}` | `{$0.02}` |

## Adaptive fallback 발생

| batch | 1차 사이즈 | 1차 실패 사유 | 최종 사이즈 |
|---:|---:|---|---:|
| `{N}` | 40 | `{MAX_TOKENS / JSON 파싱 / id 누락}` | `{30}` |

## 응답 raw 보관

- 경로 = `docs/raw/{city_id}/02-enrich-batch-{0, 40, 80, ...}.json` (= 12 파일)

## DB UPDATE 결과

| 항목 | 수 |
|---|---:|
| UPDATE 성공 | `{N}` |
| skipped (= 응답 누락) | `{N}` |
| errors | `{N}` |

## 13 SSOT 채움률 변화

| 컬럼 | Before | After | Δ |
|---|---:|---:|---:|
| name_en | 100% | 100% | 0 |
| name_local | `{%}` | `{%}` | `{+%}` |
| name_ko | `{%}` | `{%}` | `{+%}` |
| address | `{%}` | `{%}` | `{+%}` |
| summary_ko | `{%}` | `{%}` | `{+%}` |
| editorial_summary | `{%}` | `{%}` | `{+%}` |
| price_eur | `{%}` | `{%}` | `{+%}` |

## 의심 행 (= 사용자 검수)

| id | name_en | 응답 | 의심 사유 |
|---|---|---|---|
| `{60296}` | `{Palermo Buenos Aires}` | `{도시 외 = name_ko = '팔레르모 부에노스 아이레스'}` | `{Brest 같은 가짜 = DELETE}` |
| `{60294}` | `{St. Roch New Orleans}` | `{Église Saint-Roch (Paris)}` | `{name_en 정정 = Église Saint-Roch}` |

## 다음 단계

- [ ] Step 3 = 의심 행 처리 (= DELETE / gemini-fix)
- [ ] Step 4 = 일괄 UPDATE (= 캐시 → DB)
- [ ] Step 5 = 5 단계 매칭 재실행 = 중복 통합