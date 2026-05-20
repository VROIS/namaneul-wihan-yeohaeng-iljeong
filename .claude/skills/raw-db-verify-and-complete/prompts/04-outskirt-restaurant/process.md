# 04-outskirt-restaurant — 필수 과정

## 호출 흐름 (= 2 호출 분할)

```
[입력] city_id, year, OUTSKIRT_HINTS (= 도시별 day-trip 명소 list)
   ↓
1. cities = name_en, country, lat, lng 조회
   ↓
2. 호출 1 = 30 LOW
   - ${TIER_LABEL} = "30 LOW"
   - ${TIER_SPEC} = "30 LOW (= 1인당 평균 ~30 EUR 이하 = 저렴)"
   - ${OUTPUT_SPEC} = '{ "results": { "low": [ ...30 ] } }'
   - ${EXCLUDE_LIST} = "" (= 첫 호출)
   ↓
3. 응답 raw JSON = docs/raw/{city_id}/04-outskirt-restaurant-low.json 저장
   ↓
4. 호출 2 = 30 MID + EXCLUDE_LIST 안 호출 1 응답 명시
   - ${TIER_LABEL} = "30 MID"
   - ${TIER_SPEC} = "30 MID (= 30-80 EUR = 합리적)"
   - ${OUTPUT_SPEC} = '{ "results": { "mid": [ ...30 ] } }'
   - ${EXCLUDE_LIST} = "\n  이미 추천된 LOW 30 곳 (= 아래) 와 중복 X:\n  - {name} ({address})\n  ..."
   ↓
5. 응답 raw JSON = docs/raw/{city_id}/04-outskirt-restaurant-mid.json 저장
   ↓
6. post-process.ts = upsertPlace() 통해 INSERT
   = phaseTags = ['outskirt-restaurant-${YYYY-MM-DD}']
```

## 호출 2 분할 = 중복 방지 강제

= 호출 2 prompt 안 `${EXCLUDE_LIST}` = 호출 1 응답 (= 30 LOW) 의 name + address list 명시
= Gemini 가 호출 2 시 = 위 list 와 중복 X = 새로운 30 MID 만 응답

## 데이터 흐름 (= 응답 → DB)

| 응답 필드 | upsertPlace 필드 | DB 컬럼 | 정책 |
|---|---|---|---|
| `name_en` | `nameEn` | `name_en` | 입력 그대로 |
| `name_local` | `nameLocal` | `name_local` | - |
| `name_ko` | `nameKo` | `name_ko` | - |
| `address` | `address` | `address` | - |
| `price_eur_max` | `priceEur` | `price_eur` | **GREATEST 비싼 쪽** (= §14) |
| `selection_reason_ko` | `selectionReasonKo` | `summary_ko` | - |
| `shortform_ko` | `shortformKo` | `editorial_summary` | - |
| `day_zone` | `dayZone` | `day_zone` | (= 강제 "outskirt") |
| `distance_km_from_center` | `distanceKmFromCenter` | `distance_km_from_center` | - |
| (메타) | `seedCategory` | `'restaurant'` | - |
| (메타) | `phaseTags` | `['outskirt-restaurant-${YYYY-MM-DD}']` | - |

## 매칭 (= upsertPlace 5 단계 자동)

= 신규 외곽 식당 = 대부분 새 행 = INSERT. 단 매칭 시:
- 1순위 = 주소 + 이름 9 조합 → 같은 식당 검출 = UPDATE
- 트리거 v2 = `place_seed_raw_prevent_dup` 강제

## 검증 조건

| 항목 | 기준 |
|---|---|
| 호출 1 응답 low 길이 | 30 |
| 호출 2 응답 mid 길이 | 30 |
| 합계 | 60 |
| 호출 2 응답 중 호출 1 중복 | 0 (= EXCLUDE_LIST 효과) |
| distance_km_from_center > 10 | 60/60 (= 외곽 강제) |
| day_zone == 'outskirt' | 60/60 |
| INSERT 결과 | inserted + updated 합 = 60 |
| errors | 0 |

## 비용 = 약 $0.005 (= 2 호출 × 평균 토큰)