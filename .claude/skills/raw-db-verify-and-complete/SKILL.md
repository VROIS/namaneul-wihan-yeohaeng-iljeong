---
name: raw-db-verify-and-complete
description: place_seed_raw 의 raw 시드 행 = 신규 도시 = 8 prompt 순차 + 1 참조 = 전체 RAW DB 완성 + 최적화 = 최종 목표 = DB-only 운영. 도시 단위 한 줄 호출 = 동일 결과 보장 (= 헌법 §16 영구 컴포넌트). 본 세션 (= 2026-05-17~20 Paris) 검증 완료.
argument-hint: city-id (도시 ID 정수, 예 19 = Paris)
---

# raw-db-verify-and-complete — 사용자 SSOT 영구 스킬

> ⚠️ 사용자 SSOT 2026-05-20 = 최종 목표 = **DB-only 운영** (= 외부 API 호출 0 = 메인앱 = `place_seed_raw` 직접 SELECT)
> ⚠️ 각 prompt = **7 필수 요소 완비** (= prompt + 호출 설정 + 산출물 raw + 실행 스크립트 + 필수 과정 + 후처리 + 보고서 + 교훈)

## 🎯 최종 목표 = DB-only 운영

= 신규 도시 = 본 skill 한 줄 호출 × 8 prompt 순차 실행 = `place_seed_raw` 완성 + 최적화
= 메인앱 = **외부 API 호출 0** = DB 직접 SELECT + budget WHERE 필터 + 5 단계 매칭 (= 헌법 §14)
= 06 (= 메인앱 prompt) = 옛 미발굴 도시 fallback only (= 발굴 완료 후 = 호출 X)

## 🔴 핵심 = 8 prompt 폴더 + 1 참조 (= 1 글자 변경 금지)

| Step | 폴더 | 용도 | 호출 횟수 | 출처 |
|---:|---|---|---:|---|
| **1** | [`prompts/01-discover-6cats/`](prompts/01-discover-6cats/) | 신규 도시 6 카테고리 TOP 20 발굴 (= 식당 제외) | 1 (Gemini) | 사용자 SSOT 2026-05-12 v3 |
| **2** | [`prompts/02-enrich-place/`](prompts/02-enrich-place/) | 기존 raw 행 보강 (= batch 40 + adaptive fallback) | N/40 (Gemini) | 사용자 SSOT 2026-05-18 |
| **3** | [`prompts/12-ts-discover-pool/`](prompts/12-ts-discover-pool/) | 🆕 **식당 발굴 = TS `--zone=downtown`** (= searchNearby POPULARITY + text + premium = 객관적 RC, 환각 X) | ~7 (TS) | 사용자 SSOT 2026-06-02 |
| **4** | [`prompts/12-ts-discover-pool/`](prompts/12-ts-discover-pool/) | 🆕 **식당 발굴 = TS `--zone=outskirt`** (= 명소별 circle) | N (TS) | 사용자 SSOT 2026-06-02 |
| **5** | [`prompts/05-text-recategorize/`](prompts/05-text-recategorize/) | 묘사 분석 = 카테고리 재분류 (= 본 세션 47 행 패턴) | N/100 (Gemini) | 사용자 SSOT 2026-05-19 |
| **6** | [`prompts/06-ts-pm-enrich/`](prompts/06-ts-pm-enrich/) | Google Places TS Enterprise + PhotoMedia = 식당/어드벤처 image NULL + pid NULL 보강 | N (TS+PM) | 사용자 SSOT 2026-05-20 (= 헌법 §15) |
| ~~7~~ | (삭제 2026-07-18 §19) | 중복 통합 = DB 트리거(place_seed_raw_prevent_dup) 단일 관문이 입력 시점에 전담 = 사후 병합 상시 불필요(§20). 코드 매칭(matcher.ts) 삭제. 기존 오염 청소가 필요하면 그때 트리거 기반 1회성 재작성 | — | — |
| **8** | [`prompts/08-wk-image-fill/`](prompts/08-wk-image-fill/) | Wikidata SPARQL 이미지 보강 (= 식당/어드벤처 제외) | N (WK 무료) | 사용자 SSOT 2026-05-19 검증 |
| (참조) | [`prompts/09-main-app-itinerary/`](prompts/09-main-app-itinerary/) | **메인앱 여정 생성** = `pipeline-v3.ts:367-448` inline 유지 (= DB-only 미발굴 fallback) | 사용자 요청 시 | 사용자 SSOT 2026-05-15 |

= **통일 호출 설정** = [`prompts/_call-config.md`](prompts/_call-config.md) (= 모델 gemini-3-flash-preview + tools googleSearch + temp 0.2/0.3 + maxToken 50000 + thinkingBudget 0)

## 7 필수 요소 (= 각 폴더 안)

| # | 요소 | 파일 |
|---|---|---|
| 1 | **프롬프트** (= 1 글자 변경 X) | `prompt.txt` |
| 2 | **호출 설정** | `../_call-config.md` (= 공유) |
| 3 | **산출물 원본** (= Gemini raw JSON) | `docs/raw/{city_id}/{prompt-id}-{tier}-{YYYY-MM-DD}.json` |
| 4 | **실행 스크립트** | `run.ts` |
| 5 | **필수 과정** | `process.md` |
| 6 | **후처리 + DB INSERT/UPDATE** | `post-process.ts` |
| 7 | **최종 보고서 템플릿** | `report.md` |
| + | **교훈** | `lessons.md` |
| + | **인덱스** | `README.md` |

## 신규 도시 = 한 줄 호출 순서

```bash
CITY_ID=<N>  # = 예 19 = Paris / TODO Tokyo Madrid Osaka 등

# Step 1. 신규 도시 6 카테고리 TOP 20 발굴 (= 1 호출)
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/01-discover-6cats/run.ts --city-id=$CITY_ID
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/01-discover-6cats/post-process.ts --city-id=$CITY_ID

# Step 2. 기존 raw 행 보강 (= batch 40 / id ASC)
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/02-enrich-place/run.ts --city-id=$CITY_ID --batch=40 --all
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/02-enrich-place/post-process.ts --city-id=$CITY_ID

# Step 3+4. 식당 발굴 = TS (= 12-ts-discover-pool 통합 = 객관적 RC)
#   = 시내(downtown) 3종 + 외곽(outskirt) 명소별 + 13 한국요약 + 이미지 = 전체 흐름 = prompts/12-ts-discover-pool/README.md
#   사전 = destinations.ts 에 도시 구역(downtown 원형 + outskirt 명소) 추가
npx tsx .../12-ts-discover-pool/run.ts --city-id=$CITY_ID --zone=downtown --method=nearby --label=nearby
npx tsx .../12-ts-discover-pool/run.ts --city-id=$CITY_ID --zone=downtown --method=text --pages=3 --label=text
npx tsx .../12-ts-discover-pool/run.ts --city-id=$CITY_ID --zone=downtown --method=text --pages=3 --price-levels=EXPENSIVE,VERY_EXPENSIVE --label=premium
npx tsx .../12-ts-discover-pool/post-process.ts --city-id=$CITY_ID --zone=downtown --date=<YYYY-MM-DD> --apply
#   (식당 카피·가격·이미지 = #45 결손보강 WF 가 통째로 = 2026-06-23 §19·§20)
npx tsx .../12-ts-discover-pool/image-pool.ts --city-id=$CITY_ID --zone=downtown --date=<YYYY-MM-DD> --apply
#   (외곽 = --zone=outskirt 동일 흐름 = README 참조)

# Step 5. 텍스트 분석 = 카테고리 재분류 (= 사용자 cc2 검수 필수)
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/05-text-recategorize/run.ts --city-id=$CITY_ID
# 사용자 검수 후
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/05-text-recategorize/post-process.ts --city-id=$CITY_ID --date=<YYYY-MM-DD> --apply

# Step 6. TS Enterprise + PhotoMedia (= 식당/어드벤처 image NULL + pid NULL + rank 1-20 보강)
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/06-ts-pm-enrich/run.ts --city-id=$CITY_ID
# 사용자 검수 후 (= --photo 옵션 = $0.007/행 추가 = 이미지 다운 + Storage 업로드)
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/06-ts-pm-enrich/post-process.ts \
  --city-id=$CITY_ID --date=<YYYY-MM-DD> --apply-status=ok --photo

# Step 7. (삭제 2026-07-18 §19) 중복 통합 = DB 트리거 단일 관문이 입력 시점 전담(§20) = 사후 병합 스크립트 불필요. 코드 매칭(matcher.ts) 삭제.

# Step 8. Wikidata 이미지 보강 (= 식당/어드벤처 제외 + rank 21+/NULL + image NULL)
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/08-wk-image-fill/run.ts --city-id=$CITY_ID
# 사용자 검수 후 = TRUST (= score ≥ 5) 일괄 적용
npx tsx .claude/skills/raw-db-verify-and-complete/prompts/08-wk-image-fill/post-process.ts \
  --city-id=$CITY_ID --date=<YYYY-MM-DD> --apply-status=trust
```

## 산출물 표준 위치 (= 사용자 SSOT 2026-05-20)

= 모든 도시 = `docs/raw/{city_id}/` 집결 (= `.gitignore` 로컬 보관)

= 파일명 규칙 = `{prompt-id}-{prompt-name}-{tier-or-offset}-{YYYY-MM-DD}.json`

= 예시: `docs/raw/19/02-enrich-place-batch-0-2026-05-17.json`

## checks/ — 정기 점검 + 감사 (= 2026-05-20 신규)

= `prompts/` 와 별개 = **호출 비용 0 (= DB SELECT only)** + 정기 데이터 품질 감사

| # | 파일 | 용도 | 시정 prompt |
|---|---|---|---|
| 01 | [`checks/01-coord-missing.ts`](checks/01-coord-missing.ts) | 좌표 NULL 검출 | 02-enrich-place |
| 02 | [`checks/02-price-outlier.ts`](checks/02-price-outlier.ts) | 가격 이상치 (= MEAL_BUDGET MAX + 카테고리 limit) | 02-enrich-place / 06-ts-pm-enrich |
| 03 | [`checks/03-outskirt-coverage.ts`](checks/03-outskirt-coverage.ts) | 외곽 식당 부족 진단 (= 도심 75xxx + 좌표 ≤10km) | 04-outskirt-restaurant |

```bash
# 단일 도시 점검
npx tsx .claude/skills/raw-db-verify-and-complete/checks/01-coord-missing.ts --city-id=19
# 모든 도시 점검
npx tsx .claude/skills/raw-db-verify-and-complete/checks/01-coord-missing.ts --all
```

= 산출물 = `docs/raw/{city_id}/_checks/{check-id}-{YYYY-MM-DD}.json`

## DB 정책 변경 (= 본 스킬 사전 요구)

본 스킬 사용 전 = **트리거 v2 적용 필수** (= 1 회만):

```bash
psql $SUPA_URL -f server/db/migrations/place-identity.sql
```

= [`db/upsert-place-v2-changes.md`](db/upsert-place-v2-changes.md) = 헌법 §14 v2 = 2026-05-18 사용자 SSOT.

## 본 세션 결과 (= 검증 사례)

- [`examples/paris-2026-05-18.md`](examples/paris-2026-05-18.md) = Paris 활성 426 → 456 (= Step 1-10 검증) + 외곽 식당 5 → 45
- [`examples/paris-2026-05-19.md`](examples/paris-2026-05-19.md) = Paris 활성 456 → 455 + 카테고리 47 재분류 (= Step 11) + MEAL_BUDGET 4:6 split (= Step 12) + BTS 마커 placeholder + 3 게이트 통과

## 의존성

- `server/services/place-upsert.ts` v2 = `upsertPlace()` 단일 진입점 (= 헌법 §14)
- `server/services/shared/geminiClient.ts` = Gemini 호출
- `server/services/shared/api-keys-loader.ts` = `api_keys` DB → process.env
- `server/services/seed/enrich-place.ts` = Step 2 batch 함수
- `cities` 테이블 = 도시 좌표 + city_id
- `place_seed_raw` 테이블 = 메인 SSOT
- `server/services/agents/types.ts:135-140` = MEAL_BUDGET 4 tier (= 03-downtown-restaurant 연동)
- `server/services/shared/google-places-sku.ts` = `validateFieldMask()` (= 06-ts-pm-enrich FieldMask 가드 §15)
- Supabase Storage `place-photos/` bucket (= 06-ts-pm-enrich PhotoMedia 업로드)

## 사용자 SSOT 잠금

= [`CLAUDE.md`](../../../CLAUDE.md) 헌법 = §1 (= 승인 없는 수정 X) + §14 (= upsertPlace 단일 진입점) + §15 (= Atmosphere 금지) + §16 (= 영구 컴포넌트) + §17 (= 3 게이트)

= [`docs/SEED_SSOT_2026-05-02.md`](../../../docs/SEED_SSOT_2026-05-02.md) = §1-§19 시드 발굴 헌법