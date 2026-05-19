---
name: raw-db-verify-and-complete
description: place_seed_raw 의 raw 시드 행 = 10 단계 = 검증 + Gemini 보강 + 5 단계 매칭 통합 + 외곽 보강 = 완성 행 생성. 도시 단위 = 한 줄 호출 = 동일 결과 보장 (= 헌법 §16 영구 컴포넌트). 본 세션 (= 2026-05-17/18 Paris) 검증 완료.
args:
  - city: 도시 영문명 (= 예 Paris / Tokyo / Madrid / Osaka)
---

# Step 1 = raw DB 검증 및 완성 과정 (= 10 단계)

## 🔴 핵심 = `prompts/` 3 종 = 1 글자 변경 금지

| # | 파일 | 용도 |
|---|---|---|
| 1 | [`prompts/enrich-place.txt`](prompts/enrich-place.txt) | Step 2 = 기존 raw 행 보강 (= 40 batch / id ASC) |
| 2 | [`prompts/outskirt-restaurant.txt`](prompts/outskirt-restaurant.txt) | Step 10 = 외곽 식당 시드 (= 30 LOW + 30 MID outskirt only) |
| 3 | [`prompts/discover-6cats.txt`](prompts/discover-6cats.txt) | (별도) 6 카테고리 신규 발굴 (= 식당 제외) |

= **통일 호출 설정** = [`prompts/_call-config.md`](prompts/_call-config.md) = 모델/tools/temp/maxToken/thinkingBudget = 모든 도시 동일.

## 10 단계 호출 순서 (= 한 줄씩)

```bash
# Step 1. 사전조사 = 5 단계 매칭 dry-run + 통계
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/01-presurvey.ts --city=<CITY>

# Step 2. batch dry-run = Gemini 호출 (= adaptive fallback 40→30→20→10)
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/02-enrich-batch.ts --city=<CITY> --batch=40 --all
# = tmp/<city>-enrich-batch-{0,40,80,...}.json 파일 저장 (= 사용자 검수)

# Step 3. 의심 행 처리 (= 사용자 검수 후 명시 입력)
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/03-suspicious-fix.ts --city=<CITY> \
  --delete=<id_list> --gemini-fix=<id_list> --city-change=<id:newCityId>

# Step 4. 일괄 UPDATE = Gemini 응답 최우선 덮어쓰기
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/04-bulk-update-cache.ts --city=<CITY>

# Step 5. 5 단계 매칭 재실행 + 의심 그룹 보고
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/05-dup-rerun.ts --city=<CITY>
# = tmp/<city>-dup-groups.json 파일 저장 (= 사용자 검수)

# Step 6. 명확 중복 통합 (= 사용자 명시 그룹 archive)
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/06-merge-clear-dups.ts --city=<CITY> --groups=<json_path>

# Step 7. 좌표 10m + cross-cat 의심 처리 (= 사용자 명시)
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/07-coord-10m-merge.ts --city=<CITY>

# Step 8. 분류 오류 정정 + archive name_en suffix (= UNIQUE 충돌 해제)
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/08-category-fix.ts --city=<CITY>

# Step 9. 외곽 부족 진단 (= 도심 좌표 + 우편번호 분포)
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/09-outskirt-diagnose.ts --city=<CITY>

# Step 10. 외곽 시드 발굴 + INSERT
npx tsx .claude/skills/raw-db-verify-and-complete/scripts/10-outskirt-seed-insert.ts --city=<CITY> --apply
```

## DB 정책 변경 (= 본 스킬 사전 요구)

본 스킬 사용 전 = **트리거 v2 적용 필수** (= 1 회만):

```bash
# place_seed_raw_prevent_dup 함수 = 주소 + 이름 9 조합 동시 매칭 (= v2)
psql $SUPA_URL -f .claude/skills/raw-db-verify-and-complete/db/trigger-v2.sql
```

= [`db/upsert-place-v2-changes.md`](db/upsert-place-v2-changes.md) = `server/services/place-upsert.ts` 정책 변경 가이드 (= 헌법 §14 v2 = 2026-05-18 사용자 SSOT).

## 본 세션 결과 (= 검증 사례)

= [`examples/paris-2026-05-18.md`](examples/paris-2026-05-18.md) = Paris 활성 426 → 456 (= 10 단계 검증 완료) + 외곽 식당 5 → 45 보강.

## 의존성 (= 본 프로젝트 의존)

- `server/services/place-upsert.ts` v2 (= 정책 변경 후) = `upsertPlace()` 단일 진입점 (= 헌법 §14)
- `server/services/shared/geminiClient.ts` = Gemini 호출 (= gemini-3-flash-preview + grounding)
- `server/services/shared/api-keys-loader.ts` = `api_keys` DB → process.env
- `server/services/seed/enrich-place.ts` = Step 2 batch enrichment 함수
- `cities` 테이블 = 도시 좌표 + city_id 조회
- `place_seed_raw` 테이블 = 메인 SSOT

## 다른 프로젝트 이식 시

본 스킬 = 본 프로젝트 (= my-handy-guide2 = Supabase + place_seed_raw 스키마) 의존. 다른 프로젝트 적용 시:
1. 위 의존성 (= upsertPlace + geminiClient + api-keys-loader + 스키마) 동일 작성
2. 트리거 v2 = DB 적용
3. `.env` 의 `SUPA_URL` + `api_keys` 테이블 = Gemini key 등록
