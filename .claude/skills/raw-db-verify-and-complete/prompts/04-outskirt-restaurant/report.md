# 04-outskirt-restaurant — 최종 결과 보고서 템플릿

## 도시 정보

| 항목 | 값 |
|---|---|
| city_id | `{19}` |
| OUTSKIRT_HINTS | `{Versailles / Disneyland Paris / ...}` |
| 호출 일자 | `{YYYY-MM-DD}` |
| year | `{2026}` |

## Gemini 호출 결과 (= 2 호출 분할)

| 호출 | tier | finishReason | 응답 수 | 토큰 | 비용 |
|---:|---|---|---:|---:|---:|
| 1 | LOW | STOP | 30 | ~5500 | $0.002 |
| 2 | MID | STOP | 30 | ~6500 | $0.003 |
| **합계** | - | - | **60** | ~12000 | **$0.005** |

## 산출물 raw 보관

- 호출 1 = `docs/raw/{city_id}/04-outskirt-restaurant-low.json`
- 호출 2 = `docs/raw/{city_id}/04-outskirt-restaurant-mid.json`

## 호출 2 중복 방지 검증

| 항목 | 결과 |
|---|---|
| 호출 2 응답 중 호출 1 name_en 중복 | `{0}` (= EXCLUDE_LIST 효과) |
| 호출 2 응답 중 호출 1 address 중복 | `{0}` |

## 지리 검증

| 항목 | 기준 | 결과 |
|---|---|---|
| distance_km_from_center > 10 | 60/60 | `{N/60}` |
| distance_km_from_center <= 100 | 60/60 | `{N/60}` |
| day_zone == 'outskirt' | 60/60 | `{N/60}` |

## DB INSERT 결과

| 항목 | 수 |
|---|---:|
| inserted (= 신규) | `{N}` |
| updated (= 기존 매칭) | `{N}` |
| skipped (= 5 단계 매칭 = 다른 행 충돌) | `{N}` |
| errors | `{N}` |

## 매칭 단계별 분포

| 매칭 단계 | 수 |
|---|---:|
| 0순위 PID | `{N}` |
| 1순위 주소+이름 9 조합 | `{N}` |
| 2순위 google_maps_uri | 0 (= 본 prompt 응답 X) |
| 3순위 좌표 10m | 0 (= 본 prompt 응답 X) |
| 4순위 이름 LOWER | `{N}` |
| 신규 INSERT | `{N}` |

## 외곽 식당 분포 변화

| 시점 | 활성 식당 (외곽 only) | Δ |
|---|---:|---:|
| Before | `{N}` | - |
| After | `{N}` | `{+N}` |

## 다음 단계

- [ ] 메인앱 AG2-DB = 식당 budget WHERE 격리 = 외곽 풀 사용 여부 검증
- [ ] 다음 도시 = 같은 prompt + OUTSKIRT_HINTS 변경 = 동일 결과 보장