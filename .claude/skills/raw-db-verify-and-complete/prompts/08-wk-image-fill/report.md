# 08-wk-image-fill — 최종 결과 보고서 템플릿

## 도시 정보

| 항목 | 값 |
|---|---|
| city_id | `{19}` |
| 대상 행 (= image NULL + 식당/어드벤처 제외 + rank 21+/NULL) | `{N}` |
| 호출 일자 | `{YYYY-MM-DD}` |

## SPARQL 호출 결과

| 항목 | 값 |
|---|---|
| 호출 횟수 | `{N}` (= 대상 행 수) |
| 평균 응답 시간 | `{N}` ms / 행 |
| 비용 | $0 (= Wikidata 무료) |

## 분류 통계

| status | 수 | % |
|---|---:|---:|
| TRUST (= score ≥ 5) | `{N}` | `{%}` |
| VERIFY (= score 3-4) | `{N}` | `{%}` |
| reject (= score ≤ 2) | `{N}` | `{%}` |
| no_candidate (= 10m 내 0 행) | `{N}` | `{%}` |
| no_match (= 후보 없음) | `{N}` | `{%}` |
| no_coord (= 좌표 NULL) | `{N}` | `{%}` |
| **합계** | `{N}` | 100% |

## 사용자 cc2 검수 결과

| 단계 | 결정 |
|---|---|
| dry-run 보고 | `{YYYY-MM-DD HH:MM}` |
| 사용자 검수 = TRUST 일괄 적용 | `{Y/N}` |
| 사용자 검수 = VERIFY 행별 적용 | `{ids list}` |
| 트랜잭션 실행 | `{YYYY-MM-DD HH:MM}` |

## DB UPDATE 결과

| 항목 | 수 |
|---|---:|
| image_url UPDATE 성공 | `{N}` |
| skipped (= 이미 image 보유) | `{N}` |
| errors | 0 |

## 이미지 보유율 변화 (= 카테고리별)

| 카테고리 | Before | After | Δ |
|---|---:|---:|---:|
| heritage | `{%}` | `{%}` | `{+%}` |
| hotspot | `{%}` | `{%}` | `{+%}` |
| healing | `{%}` | `{%}` | `{+%}` |
| attraction | `{%}` | `{%}` | `{+%}` |
| shopping | `{%}` | `{%}` | `{+%}` |

## 본 세션 (= Paris 2026-05-19) 검증 비교

- 대상 = 84 행 (= image NULL + 식당/어드벤처 제외 + rank 21+/NULL)
- TRUST 30 / VERIFY 12 / reject 12 / no_candidate 30
- 사용자 cc2 검수 후 UPDATE = 28/30 TRUST (= 2 행 = AI 검증 오패칭 = SKIP)
- 결과 = heritage 91% / hotspot 100% / healing 87%

## 다음 단계

- [ ] VERIFY (= score 3-4) 행 = Gemini 추가 검증 prompt 호출 가능
- [ ] reject + no_candidate = TS Enterprise PhotoMedia 호출 (= 09-ts-photo-enrich = Phase C)
- [ ] 식당/어드벤처 = WK 오매칭 多 = 별도 prompt (= TS 만 사용)