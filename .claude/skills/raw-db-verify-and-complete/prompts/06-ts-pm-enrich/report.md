# 06-ts-pm-enrich — 최종 결과 보고서 템플릿

## 도시 정보

| 항목 | 값 |
|---|---|
| city_id | `{19}` |
| country_code | `{FR}` |
| 대상 행 (= image NULL OR pid NULL + restaurant/adventure OR rank 1-20) | `{N}` |
| 호출 일자 | `{YYYY-MM-DD}` |

## TS Enterprise textSearch 결과

| 항목 | 값 |
|---|---|
| FieldMask | Enterprise 12 필드 (= validateFieldMask 통과) |
| languageCode | 'ko' |
| 호출 횟수 | `{N}` |
| 평균 응답 시간 | `{N}` ms / 행 |

## 분류 통계

| status | 수 | % |
|---|---:|---:|
| ok (= 응답 1 등 매칭) | `{N}` | `{%}` |
| no_match (= 응답 0 행) | `{N}` | `{%}` |
| api_error (= status != 200) | `{N}` | `{%}` |
| no_name (= name_en NULL) | `{N}` | `{%}` |
| **합계** | `{N}` | 100% |

## 비용

| 항목 | 단가 | 호출 수 | 비용 |
|---|---:|---:|---:|
| TS Enterprise textSearch | $0.035 | `{N}` | `{$N}` |
| PhotoMedia (= --photo 시) | $0.007 | `{N}` | `{$N}` |
| Storage 업로드 | $0 | `{N}` | $0 |
| **합계** | - | - | `{$N}` |

= 무료 1K/월 한도 적용 시 = `{$N}` (= 신규 도시 < 1000 행 = $0)

## 사용자 cc2 검수 결과

| 단계 | 결정 |
|---|---|
| dry-run 보고 | `{YYYY-MM-DD HH:MM}` |
| 사용자 검수 | `{전체 ok 적용 / 일부 ids 적용}` |
| photo 다운 옵션 | `{Y/N}` |
| 트랜잭션 실행 | `{YYYY-MM-DD HH:MM}` |

## DB UPDATE 결과

| 항목 | 수 |
|---|---:|
| upsertPlace updated | `{N}` |
| upsertPlace inserted (= pid NULL → 신규 발견) | `{N}` |
| photo_ok (= Storage 업로드 성공) | `{N}` |
| errors | 0 |

## 13 SSOT 채움률 변화

| 컬럼 | Before | After | Δ |
|---|---:|---:|---:|
| name_ko | `{%}` | `{%}` | `{+%}` |
| google_place_id | `{%}` | `{%}` | `{+%}` |
| google_maps_uri | `{%}` | `{%}` | `{+%}` |
| google_review_count | `{%}` | `{%}` | `{+%}` |
| price_eur | `{%}` | `{%}` | `{+%}` |
| image_url | `{%}` | `{%}` | `{+%}` |

## 다음 단계

- [ ] 잔여 image NULL (= TS no_match 행) = 사용자 검수 = name 정정 후 재호출
- [ ] 메인앱 DB-only SELECT 검증 = google_place_id 보유율 = 80% 이상 권장