---
name: raw-storage-recall
description: Storage(raw-responses/{cityId}) = 유료 외부호출 원재료 SSOT. 이 스킬로 언제든 ① 로컬 열람(pull) ② PSR 재입력(reinsert)을 외부호출 0으로 실행. 신규도시 생성(어느 경로든=운영·CromeDevTools) 후 raw 확인·복구·재과금0 재입력. 도시 단위 한 줄 호출(§16 영구 컴포넌트).
argument-hint: city-id (도시 ID 정수, 예 134 = Beaune) + 모드(--pull | --reinsert | --both)
---

# raw-storage-recall — 사장님 SSOT 영구 스킬 (2026-07-07)

> ⚠️ 최종 목표(사장님 SSOT) = **Storage = 원재료 SSOT.** Gemini·TS·이미지 raw 가 어느 경로(운영앱·Chrome DevTools·발굴)로 생성되든 Storage(raw-responses/{cityId}) 에 모임.
> = 그 원재료로 **언제든** ① 로컬 즉시 열람(사장님 검수) ② PSR 재입력(재과금0 복구) = 이 스킬 하나로.

## 🎯 최종 목표 3가지 (전부 실증 완료 2026-07-07)

| # | 목표 | 방법 | 실증 |
|---|---|---|---|
| ① | **Storage 저장** (어느 경로든) | raw-responses ANON RLS 정책(place-images 복제) | ANON PUT 403→200 |
| ② | **로컬 요구시 즉시 생성** (열람) | `raw-local-pull.ts` = Storage→docs/raw 다운로드 | 77777 시뮬 로컬 생성 |
| ③ | **PSR 재입력** (재과금0, A안=Storage 직접) | pull → reinsert (parsedPlaces 형식 포함) | 본느 78657 마커 PSR 반영 |

## 🔴 실행 (도시 단위 한 줄, 외부호출 0)

| 모드 | 명령 | 하는 일 |
|---|---|---|
| **pull** | `npx tsx fillcity/steps/raw-local-pull.ts --city-id=134` | Storage raw-responses/{cityId} → 이 PC docs/raw/{cityId} (정해진 형식 그대로 = 사장님 열람) |
| **reinsert(dry)** | `npx tsx server/services/fill/reinsert-saved-raw.ts --city-id=134` | 로컬 raw → PSR 재입력 **대상 파악만**(DB 쓰기 0) |
| **reinsert(apply)** | `npx tsx server/services/fill/reinsert-saved-raw.ts --city-id=134 --apply` | 로컬 raw → PSR **실제 재입력**(upsertPlace §14, id/pid/name 앵커 = 중복0 갱신) |
| **both** | 위 pull → reinsert --apply 순차 | Storage → 로컬 → PSR (A안 = Storage 원재료 그대로 재입력) |

### 순서 = pull 먼저 (로컬 경유), 그 다음 reinsert
- pull = Storage→로컬(열람 겸 reinsert 입력원). 로컬은 사장님 검수용 + reinsert 소스.
- reinsert = 로컬 docs/raw/{cityId} 전체를 6+1 형식 파싱 → upsertPlace(§14 5단계 매칭). 외부호출 0.

## 🔑 처리 형식 (reinsert-saved-raw.ts 가 읽는 raw 종류)

| 형식 | 최상위 키 | 저장 함수 | 앵커 |
|---|---|---|---|
| **모음(Gemini)** | `{meta, rawResponse, parsedPlaces}` | saveCollectedRaw (02-enrich·90-mix) | id 또는 name |
| **봉투(TS/Gemini)** | `{savedAt, source, contextId, request, raw}` | saveRaw (ts-ag3·ts-fill) | request+raw.places |
| **TS 모음** | `{meta, results[]}` | saveCollectedRaw (06-ts-pm·45-repair) | id, pid |
| **구형** | `{places}` / `{parsed}` / `{zones}` / `{raw_text}` | 발굴 01/03/04/12/13 | id, pid, cat |

## ⚠️ 원칙

- **Storage = SSOT** = 유료호출 원재료 영구창고. PC/DB 날아가도 Storage 로 복구(§18).
- **외부호출 0** = 이 스킬은 Storage 읽기 + DB 쓰기만. 유료 재호출 절대 없음.
- **재입력 = upsertPlace 경유**(§14 5단계 매칭) = id/pid/name 앵커로 기존 행 갱신(중복 INSERT 0).
- **로컬 자동 아님** = 운영 배포서버(≠이 PC)는 이 PC 로 못 밈 = 이 PC 에서 pull 로 당김(사장님 요구 시).

## 관련
- Storage RLS 정책 = `server/db/migrations/2026-07-07_raw-responses-anon-policy.sql`
- 저장 관문 = `save-raw.ts`(§18) · `save-collected-raw.ts`
- 역방향(로컬→Storage 백업) = `fillcity/steps/raw-bucket-sync.ts`
