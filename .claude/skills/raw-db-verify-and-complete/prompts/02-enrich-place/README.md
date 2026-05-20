# 02-enrich-place — 기존 raw 행 보강 (= batch 40)

> ⚠️ 수정금지(승인필요) 2026-05-18 = 사용자 SSOT = 1 글자 변경 금지

= 이미 INSERT 된 행 (= Step 1 또는 옛 발굴) = **누락 컬럼 보강** (= summary_ko / editorial_summary / name_ko / address / price_eur 등).

## 7 요소

| # | 요소 | 파일 | 상태 |
|---|---|---|---|
| 1 | **프롬프트** | [`prompt.txt`](prompt.txt) | ✅ 영구 |
| 2 | **호출 설정** | [`../_call-config.md`](../_call-config.md) | ✅ 공유 |
| 3 | **산출물 원본** | `docs/raw/{city_id}/02-enrich-batch-{offset}.json` | 호출 시 저장 |
| 4 | **실행 스크립트** | [`run.ts`](run.ts) (= `server/services/seed/enrich-place.ts` 호출) | 🟡 작성 예정 |
| 5 | **필수 과정** | [`process.md`](process.md) | ✅ |
| 6 | **후처리 + DB UPDATE** | [`post-process.ts`](post-process.ts) | 🟡 작성 예정 |
| 7 | **최종 보고서 템플릿** | [`report.md`](report.md) | ✅ |
| + | **교훈** | [`lessons.md`](lessons.md) | ✅ |

## 변수 치환

| 변수 | 의미 |
|---|---|
| `${CITY_ID}` | cityId 정수 |
| `${BATCH_LEN}` | 입력 곳수 (= 보통 40) |
| `${JSON_INPUT}` | 입력 곳 JSON 배열 |

## 핵심

- **Batch 40** / 1 호출 (= adaptive fallback 30/20/10)
- **id ASC** = 카테고리 무관 (= 사용자 SSOT = "우리 카테고리는 의미 없음")제미나이 장소 묘사 텍스트응답 기반(99%정확)으로 카테고리별 장소 재조정
- **응답 매칭 키** = 입력 `id` = `place_seed_raw.id`
- **누락 0** = 응답에 모든 입력 id 포함 강제

## 출처 + 검증

- **본 세션 (= 2026-05-17/18) 검증** = Paris 422 행 = 11 batch (= 40 × 10 + 22) = 100% 응답 / 누락 0 / $0.02
- **컴포넌트** = `server/services/seed/enrich-place.ts` (= 영구)
- **CLI** = `scripts/enrich-paris.ts` → `enrich-city.ts` 로 cityId 파라미터화 예정