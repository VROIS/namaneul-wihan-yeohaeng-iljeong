# 05-text-recategorize — Gemini 묘사 분석 = 카테고리 정정 (= 본 세션 47 행 패턴)

> ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT (= 본 세션 검증 = "Gemini 묘사 99% 정확") = 1 글자 변경 금지

= 기존 place_seed_raw 행 = **summary_ko + editorial_summary 묘사** 분석 → 현재 카테고리 vs 적정 카테고리 비교 → 정정 후보 list 응답.

= 본 세션 (= 2026-05-19) Paris 검증 = 455 행 분석 = 47 행 오분류 발견 + 사용자 검수 후 트랜잭션 적용 = 활성 카테고리 분포 = restaurant 169 → 205 (= +36) 등.

## 7 요소

| # | 요소 | 파일 | 상태 |
|---|---|---|---|
| 1 | **프롬프트** | [`prompt.txt`](prompt.txt) | ✅ |
| 2 | **호출 설정** | [`../_call-config.md`](../_call-config.md) | ✅ 공유 |
| 3 | **산출물 원본** | `docs/raw/{city_id}/05-text-recategorize.json` | 호출 시 저장 |
| 4 | **실행 스크립트** | [`run.ts`](run.ts) | 🟡 작성 예정 |
| 5 | **필수 과정** | [`process.md`](process.md) | ✅ |
| 6 | **후처리 + DB UPDATE 트랜잭션** | [`post-process.ts`](post-process.ts) | 🟡 작성 예정 |
| 7 | **최종 보고서 템플릿** | [`report.md`](report.md) | ✅ |
| + | **교훈** | [`lessons.md`](lessons.md) | ✅ |

## 변수 치환

| 변수 | 의미 |
|---|---|
| `${CITY_NAME}` | 도시 영문명 |
| `${CITY_ID}` | cityId 정수 |
| `${BATCH_LEN}` | 입력 곳수 (= 보통 100) |
| `${JSON_INPUT}` | 활성 행 list (= id, current_cat, name, summary_ko, editorial_summary) |

## 핵심 = "Gemini 묘사 99% 정확" SSOT

- 입력 = 각 행 = id + 현재 seed_category + summary_ko + editorial_summary
- 응답 = 각 행 = id + suggested_category + reason (= 묘사 인용)
- 카테고리 동일 (= OK) = 응답 안 포함 또는 명시 OK
- 카테고리 다름 (= 정정 후보) = 응답에 포함

## 본 세션 검증 패턴 (= Paris 2026-05-19)

- 입력 = Paris 활성 455 행 = `tmp/paris-reclassify-input.json`
- AI (= Claude) 직접 분석 (= Gemini API X) = 47 행 오분류 검출
  - attraction → restaurant = 28 (= Bistrot Benoit, Le Cinq, ...)
  - hotspot → restaurant = 6 (= Kabul, Boot Café, ...)
  - 외 13 행
- 사용자 cc2 검수 후 = `scripts/_migration-paris-recategorize-2026-05-19.mjs` 트랜잭션 = 47 UPDATE

= 본 prompt = **Gemini 자동화 = 다른 도시 = 동일 패턴 적용**.

## 출처

- **본 세션 (= 2026-05-19) 검증** = Paris 47 행 재분류 = `examples/paris-2026-05-19.md` Step 11
- **사용자 SSOT** = "제미니 묘사 99% 정확 = 이것을 기준으로 카테고리 이동 및 정렬"