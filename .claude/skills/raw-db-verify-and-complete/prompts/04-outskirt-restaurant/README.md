# 04-outskirt-restaurant — 외곽 식당 시드 발굴 (= 2 호출 분할)

> ⚠️ 수정금지(승인필요) 2026-05-18 = 사용자 SSOT = 1 글자 변경 금지

= **외곽 (= 10-100km from CITY_CENTER) only** 식당 = 한국인 day-trip 명소 우선 = 신규 INSERT.

## 7 요소

| # | 요소 | 파일 | 상태 |
|---|---|---|---|
| 1 | **프롬프트** | [`prompt.txt`](prompt.txt) | ✅ 영구 |
| 2 | **호출 설정** | [`../_call-config.md`](../_call-config.md) | ✅ 공유 |
| 3 | **산출물 원본** | `docs/raw/{city_id}/04-outskirt-restaurant-{low,mid}.json` | 호출 시 저장 |
| 4 | **실행 스크립트** | [`run.ts`](run.ts) | 🟡 작성 예정 |
| 5 | **필수 과정** | [`process.md`](process.md) | ✅ |
| 6 | **후처리 + DB INSERT** | [`post-process.ts`](post-process.ts) | 🟡 작성 예정 |
| 7 | **최종 보고서 템플릿** | [`report.md`](report.md) | ✅ |
| + | **교훈** | [`lessons.md`](lessons.md) | ✅ |

## 변수 치환

| 변수 | 의미 |
|---|---|
| `${CITY_NAME}` | 도시 영문명 (= Paris) |
| `${COUNTRY}` | 국가 |
| `${CITY_LAT}` | 도심 위도 |
| `${CITY_LNG}` | 도심 경도 |
| `${YEAR}` | 현재 연도 |
| `${OUTSKIRT_HINTS}` | 도시별 day-trip 명소 list |
| `${TIER_LABEL}` | "30 LOW" 또는 "30 MID" |
| `${TIER_SPEC}` | tier 가격 설명 |
| `${OUTPUT_SPEC}` | JSON output schema |
| `${EXCLUDE_LIST}` | 호출 2 만 = 호출 1 응답 list (= 중복 방지) |

## 핵심 = 2 호출 분할

- 응답 한계 8192 = 50 곳 = 위험 → **2 호출 분할**
- **호출 1** = 30 LOW (= ≤€30 = 저렴)
- **호출 2** = 30 MID (= €30-80 = 합리적) + `${EXCLUDE_LIST}` 에 호출 1 응답 명시

## 출처 + 검증

- **본 세션 (= 2026-05-18) 검증** = Paris 외곽 식당 5 → 45 보강 (= 60 호출 + 12 INSERT 결과 = 트리거 v2 적용 후 매칭)