# 07-merge-dups — 5 단계 매칭 dry-run + 중복 통합

> ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT (= Paris 5-18 Step 5-7 검증 = 27 그룹 / 38 행 흡수) = 1 글자 변경 금지

= 기존 활성 행 = 5 단계 매칭 dry-run → 의심 중복 그룹 보고 → 사용자 cc2 검수 후 archive (= keep PID 우선).

## 7 요소

| # | 요소 | 파일 | 상태 |
|---|---|---|---|
| 1 | **알고리즘 / Gemini prompt** (= 옵션 = AI 의심 그룹 분석용) | [`prompt.txt`](prompt.txt) | ✅ |
| 2 | **호출 설정** | [`../_call-config.md`](../_call-config.md) | ✅ 공유 (= prompt 사용 시) |
| 3 | **산출물 원본** | `docs/raw/{city_id}/07-merge-dups-groups-{YYYY-MM-DD}.json` | ✅ |
| 4 | **실행 스크립트** (= dry-run) | [`run.ts`](run.ts) | ✅ |
| 5 | **필수 과정** | [`process.md`](process.md) | ✅ |
| 6 | **후처리 + DB archive** | [`post-process.ts`](post-process.ts) | ✅ |
| 7 | **최종 보고서 템플릿** | [`report.md`](report.md) | ✅ |
| + | **교훈** | [`lessons.md`](lessons.md) | ✅ |

## 핵심 = Gemini 호출 X (= 알고리즘 = upsertPlace v2 + 트리거 v2)

= 본 prompt = **Gemini 호출 X** (= 5 단계 매칭 = `server/services/place-upsert.ts` v2 + DB 트리거 v2 = 결정론적 알고리즘)
= 단 = **의심 그룹 판단** (= 0순위 PID 가 명확히 같은 그룹 vs 4순위 이름 같지만 다른 행) 시 = Gemini 보조 가능 (= 옵션)

## 5 단계 매칭 (= 사용자 SSOT 2026-05-15 v2)

| 순위 | 기준 | 확률 |
|---:|---|---:|
| 0 | google_place_id 일치 | ~100% |
| 1 | **풀 주소 + 이름 9 조합 동시** | ~99% |
| 2 | google_maps_uri 일치 | ~95% |
| 3 | 좌표 10m | ~95% |
| 4 | 이름 LOWER+trim (= 9 조합) | ~30-50% (= 체인 위험) |

## 출처 + 검증

- **본 세션 (= 5-18) Paris Step 5-7 검증** = 27 그룹 / 38 행 흡수 가능
- **사용자 검수 후 archive** = Paris 16 행 (= 5-18) + 2 좌표 10m (= 5-18) = 활성 426 → 407 → 405
- **알고리즘 위치** = `server/services/place-upsert.ts:73-251` (= upsertPlace v2)
- **트리거** = `place_seed_raw_prevent_dup` v2 (= [`../../db/trigger-v2.sql`](../../db/trigger-v2.sql))

## 변경하려면?

= 헌법 §14 (= upsertPlace v2 단일 진입점) + §17 (= 3 게이트) + 사용자 명시 승인 후만.