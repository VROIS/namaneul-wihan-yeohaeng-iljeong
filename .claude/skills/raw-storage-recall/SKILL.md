---
name: raw-storage-recall
description: R2 창고(raw-responses/{cityId}) = 유료 외부호출 원재료 SSOT. 이 스킬로 언제든 ① 로컬 열람(pull) ② PSR 재입력(reinsert)을 외부호출 0으로 실행. 신규도시 생성(어느 경로든=운영·CromeDevTools) 후 raw 확인·복구·재과금0 재입력. 도시 단위 한 줄 호출(§16 영구 컴포넌트).
argument-hint: city-id (도시 ID 정수, 예 134 = Beaune) + 모드(--pull | --reinsert | --both)
---

# raw-storage-recall — 사장님 SSOT 영구 스킬 (2026-07-07, 창고 = R2 단독 2026-08-07)

> ⚠️ 최종 목표(사장님 SSOT) = **창고 = 원재료 SSOT.** Gemini·TS·이미지 raw 가 어느 경로(운영앱·Chrome DevTools·발굴)로 생성되든 R2(raw-responses/{cityId}) 에 모임.
> = 그 원재료로 **언제든** ① 로컬 즉시 열람(사장님 검수) ② PSR 재입력(재과금0 복구) = 이 스킬 하나로.
> = 창고 = **R2 단독**(2026-08-07 사장님 "비워" = SP 창고 철거 완료 1-5b. 옛 Supabase Storage·ANON RLS 전제 폐기 §19).

## 🎯 최종 목표 3가지

| # | 목표 | 방법 | 비고 |
|---|---|---|---|
| ① | **창고 저장** (어느 경로든) | `save-raw.ts`(§18)가 로컬 docs/raw + R2 2곳 자동 저장 | 서버 R2 열쇠 = 부팅 배너로 상시 검사 |
| ② | **로컬 요구시 즉시 생성** (열람) | `raw-local-pull.ts` = R2→docs/raw 다운로드 | 형식 보존 = 사장님 열람 |
| ③ | **PSR 재입력** (재과금0) | pull → reinsert (parsedPlaces 형식 포함) | upsertPlace §14 경유 |

## 🔴 실행 (도시 단위 한 줄, 외부호출 0)

| 모드 | 명령 | 하는 일 |
|---|---|---|
| **pull** | `npx tsx fillcity/steps/raw-local-pull.ts --city-id=134` | R2 raw-responses/{cityId} → 이 PC docs/raw/{cityId} (정해진 형식 그대로 = 사장님 열람) |
| **reinsert(dry)** | `npx tsx server/services/fill/reinsert-saved-raw.ts --city-id=134` | 로컬 raw → PSR 재입력 **대상 파악만**(DB 쓰기 0) |
| **reinsert(apply)** | `npx tsx server/services/fill/reinsert-saved-raw.ts --city-id=134 --apply` | 로컬 raw → PSR **실제 재입력**(upsertPlace §14, id/pid/name 앵커 = 중복0 갱신) |
| **both** | 위 pull → reinsert --apply 순차 | R2 → 로컬 → PSR (원재료 그대로 재입력) |

### 순서 = pull 먼저 (로컬 경유), 그 다음 reinsert
- pull = R2→로컬(열람 겸 reinsert 입력원). 로컬은 사장님 검수용 + reinsert 소스.
- reinsert = 로컬 docs/raw/{cityId} 전체를 6+1 형식 파싱 → upsertPlace(§14 5단계 매칭). 외부호출 0.

## 🔑 처리 형식 (reinsert-saved-raw.ts 가 읽는 raw 종류)

| 형식 | 최상위 키 | 저장 함수 | 앵커 |
|---|---|---|---|
| **모음(Gemini)** | `{meta, rawResponse, parsedPlaces}` | saveCollectedRaw (02-enrich·90-mix) | id 또는 name |
| **봉투(TS/Gemini)** | `{savedAt, source, contextId, request, raw}` | saveRaw (ts-ag3·ts-fill) | request+raw.places |
| **TS 모음** | `{meta, results[]}` | saveCollectedRaw (06-ts-pm·45-repair) | id, pid |
| **구형** | `{places}` / `{parsed}` / `{zones}` / `{raw_text}` | 발굴 01/03/04/12/13 | id, pid, cat |

## ⚠️ 원칙

- **R2 = SSOT** = 유료호출 원재료 영구창고. PC/DB 날아가도 R2 로 복구(§18).
- **외부호출 0** = 이 스킬은 R2 읽기 + DB 쓰기만. 유료 재호출 절대 없음.
- **재입력 = upsertPlace 경유**(§14 5단계 매칭) = id/pid/name 앵커로 기존 행 갱신(중복 INSERT 0).
- **로컬 자동 아님** = 운영 배포서버(≠이 PC)는 이 PC 로 못 밈 = 이 PC 에서 pull 로 당김(사장님 요구 시).

## 관련
- 저장 관문 = `save-raw.ts`(§18) · `save-collected-raw.ts`
- 역방향(로컬→R2 백업) = `fillcity/steps/raw-bucket-sync.ts`
- R2 단일 진입점 = `server/services/shared/r2-client.ts`
