# fillCity 독립 폴더 이동 설계 (2026-06-23 사장님 SSOT)

## 목적
fillCity = 사장님 전용 백그라운드(메인앱 무관)를 **루트 `fillcity/` 한 곳**에 모음. BTS 미니앱처럼 앱 본체(client·server)와 분리. server/services 비대화 방지.

## 원칙
- **이동** = fillCity 전용 컴포넌트만 (다른 데서 안 쓰는 것).
- **참조만(이동 X)** = 메인앱도 쓰는 단일진입점(shared 관문·upsertPlace·#45가 쓰는 fill 헬퍼). = §16.
- **이력 보존** = git mv.
- **코드 동작 0바이트 변경** = 런타임 경로(ROOT 계산)만 깊이에 맞게 재계산. 로직·SQL·프롬프트 손대지 않음.

## 목표 구조
```
fillcity/                              (루트 1단계)
  fill-city.ts                         ← .claude/skills/raw-db-verify-and-complete/fill-city.ts
  cleanse.ts                           ← scripts/fillcity-step1b-fix-pollution.ts
  repair.ts                            ← scripts/fill45-defect-repair.ts
  steps/
    outskirt-ts-fill.ts                ← server/services/fill/outskirt-ts-fill.ts
    raw-bucket-sync.ts                 ← server/services/fill/raw-bucket-sync.ts
  prompts/
    01-discover-6cats/   (run·post·prompt.txt + 부속 md)
    03-downtown-restaurant/
    04-outskirt-restaurant/
    12-ts-discover-pool/ (run·post·destinations·manual-*·recover-by-name + README)
```

## 참조만 (이동 X = 메인앱 공유 / #45·랭킹 공유)
- `server/services/place-upsert.ts` (upsertPlace 단일진입 §14)
- `server/services/shared/*` (matcher·ts-client·geminiClient·gemini-curate·save-raw·raw-filename·issue-api-key·google-places-sku·place-image·gemini-city-meta)
- `server/services/fill/ts-backfill.ts·rc-rerank.ts·storage-image-relink.ts` (#45·autorank·#45가 import = 살아있음)

## ⚠️ 런타임 경로 재계산 (tsc 못 잡음 = DRY 실증 필수)
fillcity/ = 루트 1단계. 각 파일 새 ROOT:

| 파일 | 현재 ROOT 계산 | 이동 후 새 ROOT |
|---|---|---|
| fill-city.ts | `SKILL,'../../..'` | `__dirname,'..'` (+ P() 상대경로: cleanse·repair는 `./` 직속, steps는 `steps/`, prompts는 `prompts/`) |
| cleanse.ts | `__dirname,'..'` | `__dirname,'..'` (1단계 유지 = 변경 X) |
| repair.ts | `__dirname,'..'` | `__dirname,'..'` (변경 X) |
| steps/outskirt-ts-fill | `__dirname,'../../..'` | `__dirname,'../..'` |
| steps/raw-bucket-sync | `__dirname,'../../..'` | `__dirname,'../..'` |
| prompts/*/run.ts·post.ts | `__dirname,'../../../../..'` | `__dirname,'../../..'` |

fill-city.ts의 `run()` 호출 상대경로도 재계산:
- `'../../../scripts/fillcity-step1b-fix-pollution.ts'` → `'cleanse.ts'`
- `'../../../scripts/fill45-defect-repair.ts'` → `'repair.ts'`
- `'../../../server/services/fill/outskirt-ts-fill.ts'` → `'steps/outskirt-ts-fill.ts'`
- `'../../../server/services/fill/raw-bucket-sync.ts'` → `'steps/raw-bucket-sync.ts'`
- `'prompts/NN/...'` → 그대로 (fillcity/prompts/ = sibling 유지)

## 외부 호출처 정리 (이동 후 깨지는 곳)
이동 파일을 fill-city.ts 외에서 부르는 곳:
- cleanse·repair·outskirt-ts·raw-bucket = **fill-city.ts만 호출** (앞 매핑 확인). 깨질 외부 호출처 0.
- 단 PRD·카탈로그·WORKLOG·SKILL 문서가 옛 경로(scripts/·server/services/fill/) 언급 = 이동 후 경로 정정(문서).

## 실행 순서 (3게이트 §17)
1. `fillcity/`·`fillcity/steps/`·`fillcity/prompts/` 생성
2. git mv로 파일 이동 (이력 보존)
3. 런타임 경로 재계산 (위 표 = 6종)
4. tsc (정적 import 깨짐 확인 = 0)
5. **DRY 실증** (뮌헨 39 = ROOT·prompt.txt·docs/raw 경로 정상 출력)
6. 가드 (박제 0)
7. 빈 옛 폴더 정리 + 문서 경로 정정
8. 옛 스킬 폴더(.claude/skills/raw-db-verify-and-complete) = fillCity 미사용 부속(02·05·06·07·08·SKILL·checks)이 남으므로 별도 판단 (이번 이동 범위 외 = 보존)

## 검증 기준
- tsc 0 (이동·경로재계산 후)
- DRY = `--only=cleanse,restaurant,repair` 정본 순서 정상 출력 + ROOT 경로 정상
- 가드 0
- git log --follow = 이력 보존 확인
