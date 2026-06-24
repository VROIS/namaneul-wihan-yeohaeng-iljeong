# 01-discover-6cats — 최종 결과 보고서 템플릿

> 호출 완료 후 = 이 템플릿 채워서 `docs/raw/{city_id}/01-discover-6cats-report.md` 저장.

---

## 도시 정보

| 항목 | 값 |
|---|---|
| city_id | `{N}` |
| name_en | `{Paris}` |
| country | `{France}` |
| center (lat,lng) | `{48.8566, 2.3522}` |
| 호출 일자 | `{YYYY-MM-DD}` |

## Gemini 호출 결과

| 항목 | 값 |
|---|---|
| 호출 횟수 | `{1}` |
| 입력 토큰 | `{~500}` |
| 응답 토큰 | `{~7800}` |
| finishReason | `{STOP / MAX_TOKENS}` |
| 소요 시간 | `{Ns}` |
| 비용 추정 | `{$0.002}` |
| 잘림 복구 사용 | `{Y/N}` |
| 산출물 raw 경로 | `docs/raw/{city_id}/01-discover-6cats.json` |

## 응답 통계

| 카테고리 | 응답 수 | 기대 | 누락 |
|---|---:|---:|---:|
| heritage | `{N}` | 20 | `{0}` |
| hotspot | `{N}` | 20 | `{0}` |
| attraction | `{N}` | 20 | `{0}` |
| adventure | `{N}` | 20 | `{0}` |
| healing | `{N}` | 20 | `{0}` |
| shopping | `{N}` | 20 | `{0}` |
| **합계** | `{N}` | **120** | `{0}` |

## DB INSERT 결과

| 항목 | 수 |
|---|---:|
| inserted (= 신규) | `{N}` |
| updated (= 기존 매칭) | `{N}` |
| skipped (= 매칭 실패) | `{N}` |
| errors | `{N}` |

매칭 단계별 분포:
| 매칭 단계 | 수 |
|---|---:|
| 0순위 PID | `{N}` |
| 1순위 주소+이름 9 조합 | `{N}` |
| 2순위 google_maps_uri | `{N}` |
| 3순위 좌표 10m | `{N}` |
| 4순위 이름 LOWER (= 보조) | `{N}` |
| 신규 INSERT | `{N}` |

## 13 SSOT 채움률 (= INSERT 직후)

| 컬럼 | 채움 | % |
|---|---:|---:|
| name_en | `{N}` | `{100%}` |
| name_local | `{N}` | `{%}` |
| name_ko | `{N}` | `{%}` |
| address | `{N}` | `{%}` |
| latitude/longitude | `{N}` | `{%}` |
| google_place_id | 0 | 0% (= 본 prompt 응답 X = Step 2 enrich 보강) |
| image_url | 0 | 0% (= 본 prompt 응답 X = WK 또는 TS 보강) |
| summary_ko | `{N}` | `{%}` |
| editorial_summary | `{N}` | `{%}` |
| price_eur | `{N}` | `{%}` (= shopping 제외) |
| google_review_count | 0 | 0% (= 본 prompt 응답 X) |
| google_maps_uri | 0 | 0% (= 본 prompt 응답 X) |
| distance_km_from_center | `{N}` | `{%}` |

## 카테고리 분포 검증 (= core vs outskirt)

| 카테고리 | core (≤10km) | outskirt (10-100km) | 합계 |
|---|---:|---:|---:|
| heritage | `{N}` | `{N}` | 20 |
| hotspot | `{N}` | `{N}` | 20 |
| attraction | `{N}` | `{N}` | 20 |
| adventure | `{N}` | `{N}` | 20 |
| healing | `{N}` | `{N}` | 20 |
| shopping | `{N}` | `{N}` | 20 |

## 다음 단계 (= Step 2-5)

- [ ] Step 2 = `02-enrich-place` 호출 (= 본 응답의 누락 컬럼 = google_place_id / image_url / google_review_count / google_maps_uri 보강)
- [ ] Step 4-A = `03-downtown-restaurant` 호출 (= 도심 식당 발굴)
- [ ] Step 4-B = `04-outskirt-restaurant` 호출 (= 외곽 식당 발굴)
- [ ] Step 5 = 매칭 5 단계 재실행 = 중복 통합

## 의심 행 (= 사용자 검수 필요)

| id | name | 의심 사유 |
|---|---|---|
| `{60296}` | `{Palermo Buenos Aires}` | `{도시 외 = DELETE 권장}` |

## 발견된 사고

- `{사고 내용 + 시정}`