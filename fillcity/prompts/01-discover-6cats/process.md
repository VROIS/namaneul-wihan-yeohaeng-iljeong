# 01-discover-6cats — 필수 과정

## 호출 흐름

```
[입력] city_id
   ↓
1. cities 테이블 = name_en, country, latitude, longitude 조회
   ↓
2. prompt.txt 의 ${CITY_NAME}/${COUNTRY}/${CITY_LAT}/${CITY_LNG} 치환
   ↓
3. _call-config.md 의 표준 호출 (= gemini-3-flash-preview + googleSearch + temp 0.2 + maxToken 50000 + thinkingBudget 0)
   ↓
4. 응답 raw JSON = docs/raw/{city_id}/01-discover-6cats.json 저장 (= 산출물 원본 보관)
   ↓
5. 잘림 복구 (= 8192 한계 = 120 곳 × 70 토큰 = 약 8400 토큰 = 위험)
   ↓
6. post-process.ts = upsertPlace() 단일 진입점 통해 INSERT
```

## 응답 한계 + 위험

- **응답 토큰 한계** = **8192** (= grounding 활성 시 Google API 자체 제약)
- 120 곳 × 평균 70 토큰 = **약 8400 토큰** = **잘림 위험 있음**
- 잘림 시 = `_call-config.md` 의 표준 `parse()` 함수 = 끝에서부터 `}` 찾기 + 카테고리 닫기 시도
- finishReason = `MAX_TOKENS` 시 = 잘림 = 재호출 또는 잘림 복구

## 데이터 흐름 (= 응답 → DB)

| 응답 필드 | upsertPlace 필드 | DB 컬럼 |
|---|---|---|
| `name_en` | `nameEn` | `name_en` (= 변경 X = 매칭 키) |
| `name_local` | `nameLocal` | `name_local` |
| `name_ko` | `nameKo` | `name_ko` |
| `lat`/`lng` | `latitude`/`longitude` | `latitude`/`longitude` |
| `address` | `address` | `address` |
| `selection_reason_ko` | `selectionReasonKo` | `summary_ko` |
| `shortform_ko` | `shortformKo` | `editorial_summary` |
| `estimated_price_eur` | `priceEur` | `price_eur` (= shopping 강제 null) |
| `day_zone` | `dayZone` | `day_zone` |
| `distance_km_from_center` | `distanceKmFromCenter` | `distance_km_from_center` |
| (메타) | `seedCategory` | `seed_category` (= category 키별 매핑) |
| (메타) | `rank` | `rank` |
| (메타) | `collectionPhase` | `'gemini3-2026-05'` |
| (메타) | `phaseTags` | `['gemini3', 'gemini3-2026-05']` |

## 매칭 (= upsertPlace 5 단계 자동)

= INSERT 시 = 트리거 `place_seed_raw_prevent_dup` + upsertPlace v2 = 자동 중복 검출:
- 0순위 = google_place_id (= 본 prompt 응답 X = 무관)
- 1순위 = **주소 + 이름 9 조합 동시 일치**
- 2순위 = google_maps_uri (= 본 prompt 응답 X)
- 3순위 = 좌표 10m
- 4순위 = 이름 LOWER+trim (= 보조)

## 검증 조건 (= 성공 기준)

| 항목 | 기준 |
|---|---|
| 응답 카테고리 수 | 6 (= heritage/hotspot/attraction/adventure/healing/shopping) |
| 카테고리별 곳 수 | 각 20 (= 누락 0) |
| 합계 곳 수 | 120 (= 누락 0) |
| name_en 누락 | 0 |
| latitude/longitude 누락 | 0 |
| address 누락 | 0 |
| INSERT 결과 | inserted + updated 합 = 120 |
| errors | 0 |