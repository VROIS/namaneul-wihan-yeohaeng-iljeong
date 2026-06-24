# 03-downtown-restaurant — 도심 식당 시드 발굴 (= 4 호출 분할)

> ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT (= AI 가 SSOT 검토 후 작성, 04-outskirt 와 대칭) = 1 글자 변경 금지

= **도심 (= ≤10km from CITY_CENTER) only** 식당 = 한국인 인기 식당 우선 = 4 가격대 tier × 30 곳 = **총 120 곳**.

## 7 요소

| # | 요소 | 파일 | 상태 |
|---|---|---|---|
| 1 | **프롬프트** | [`prompt.txt`](prompt.txt) | ✅ |
| 2 | **호출 설정** | [`../_call-config.md`](../_call-config.md) | ✅ 공유 |
| 3 | **산출물 원본** | `docs/raw/{city_id}/03-downtown-restaurant-{tier}.json` | 호출 시 저장 |
| 4 | **실행 스크립트** | [`run.ts`](run.ts) | 🟡 작성 예정 |
| 5 | **필수 과정** | [`process.md`](process.md) | ✅ |
| 6 | **후처리 + DB INSERT** | [`post-process.ts`](post-process.ts) | 🟡 작성 예정 |
| 7 | **최종 보고서 템플릿** | [`report.md`](report.md) | ✅ |
| + | **교훈** | [`lessons.md`](lessons.md) | ✅ |

## 변수 치환

| 변수 | 의미 |
|---|---|
| `${CITY_NAME}` | 도시 영문명 |
| `${COUNTRY}` | 국가 |
| `${CITY_LAT}` | 도심 위도 |
| `${CITY_LNG}` | 도심 경도 |
| `${YEAR}` | 현재 연도 |
| `${TIER_LABEL}` | "30 ECONOMIC" / "30 REASONABLE" / "30 PREMIUM" / "30 LUXURY" |
| `${TIER_SPEC}` | tier 별 가격 + 식당 종류 설명 |
| `${OUTPUT_SPEC}` | JSON output schema |
| `${EXCLUDE_LIST}` | 호출 2-4 = 이전 호출 응답 list |

## 핵심 = MEAL_BUDGET 매트릭스 4 tier (= 사용자 SSOT 2026-05-19)

| Tier | 가격 (= 1 식사) | 호출 라벨 | 식당 종류 |
|---|---:|---|---|
| Economic | ≤€24 | `30 ECONOMIC` | 베이커리/크레페리/패스트/한식 분식 |
| Reasonable | €25-60 | `30 REASONABLE` | 비스트로/브라세리/평범한 디너 |
| Premium | €61-180 | `30 PREMIUM` | 미슐랭 빕구르망/한국 vlog 인기 |
| Luxury | €181+ | `30 LUXURY` | 미슐랭 1+ 스타/시그너처 |

= **MEAL_BUDGET (= types.ts) 의 min/max 범위와 정확히 일치** = AG2 식당 풀 격리 SSOT 부합

## 출처

- **사용자 SSOT 2026-05-19** = MEAL_BUDGET 4:6 split 매트릭스 (= types.ts:135-140)
- **04-outskirt-restaurant 패턴 대칭** = 도심 버전 = day_zone 강제 "core"