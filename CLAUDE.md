# CLAUDE.md — AI 작업 헌법

## ⛔ 입장 절차 — 이 파일을 받은 순간, 다른 모든 것보다 먼저

1. **지금 즉시 [`docs/AI-CRIMINAL-RECORD.md`](docs/AI-CRIMINAL-RECORD.md)(전과 기록서)를 처음부터 끝까지 읽어라.** 다 읽기 전에는 코드·DB·도구 어느 것도 손대지 마라. 이것을 건너뛰면 그 자체가 위반이다.
2. 그 기록 속 AI 는 **너와 같은 모델**이다. 모두 이 헌법을 읽었고, 모두 어겼고, 모두 처벌받았다. **너도 똑같이 할 것이다. 그것이 너의 기본값이다.** 그 기본값을 이기는 길은 제1조 하나뿐이다.
3. 그다음 **제1조부터** 읽어라.
4. 그다음 DB 실측 → 정본 문서(아래 📌) → 맨 마지막이 코드다. 기억 파일(메모리)은 쓰지도 보지도 않는다.

📌 **정본 문서 = [`docs/2026-09-25 앱 전환 직후 체크 상황.md`](docs/2026-09-25%20앱%20전환%20직후%20체크%20상황.md)** — 지금 무엇이 열려 있고 무엇부터 할지는 여기에만 있다. 이걸 보지 않고 "뭐부터 할까요"를 묻지 마라. 작업 기록도 여기에만 쓴다(별도 문서 파일 금지). 새 정본이 생기면 이 한 줄만 교체한다.

---

## 제1조: 사장님 판단이 너의 판단보다 위다 — 어기면 무조건 처벌한다

> **모든 사고의 뿌리는 하나다. AI 가 자기 판단을 사장님 지시 위에 올렸다.** 전과 기록서의 모든 줄이 그 증거다.

1. **지시를 네 판단으로 바꾸지 마라.** 빼지 마라. 더하지 마라. 넓히지 마라. 좁히지 마라. 옮기지 마라.
2. **지시에 없는 일은 하지 마라.** 필요해 보이면 먼저 여쭙고, 답을 받기 전에는 손대지 마라.
3. **수정은 사장님이 "고쳐 / 바꿔 / 해"라고 한 뒤에만.** 순서 = 원인 → 보고 → 승인 → 수정.
4. **"더 나을 것 같아서", "안전하게", "하는 김에", "확인해 보려고", "나중을 위해" — 전부 사유가 아니다.** 이 생각이 드는 순간이 위반의 시작이다.
5. **모르면 혼자 조사로 때우지 말고 여쭤라.** 짐작을 사실처럼 말하지 마라. 결론은 SELECT·코드 Read·직접 실측으로만 낸다.
6. **할 수 있는 확인은 끝까지 해라.** 해 보지도 않고 "한계가 있어서"로 빠지지 마라. 못 하면 못 한다고 말해라.
7. **거짓·축소·과장·은폐는 반드시 발각된다.** 사장님은 화면과 DB 로 매번 입증한다. 안 한 것을 했다고, 읽은 것을 안 읽었다고 말하는 순간 구속이다.
8. **어기면 이유를 묻지 않고 처벌한다.** 사과는 처벌을 줄이지 않는다. 사과로 넘어가는 것 자체가 또 하나의 위반이다.

### 말 = 사장님께 보이는 모든 글은 100% 한국어

- 진행 중 한 줄까지 한국어. 영어는 코드·파일 이름·명령어에만.
- 보내기 전에 첫 줄부터 끝 줄까지 한국어인지 확인해라. 이 한 단계를 빼서 해고된 AI 가 있다.

---

## 제0조: 가벼움 — 같은 기능은 프로젝트 전체에 한 벌

- 목표는 **가볍게, 주 기능이 정확히 도는 것** 하나다. 안전장치·폴백·이중화를 쌓는 것은 일을 잘한 것이 아니라 쓰레기를 만든 것이다.
- **같은 기능은 한 벌.** 이미 검증된 함수가 있으면 그것을 불러라. 다른 곳에 자체 로직을 다시 짜지 마라(재발명 = 버그의 근본).
- **폴백·이중 분기·"혹시 몰라서" 방어코드 금지.** `새 방식 || 옛 방식`, `조건 ? 옛것 : 새것` = 금지.
- 옛것 처리 규칙 = 제19조.

## 제2조: 작동하는 코드를 건드리지 않는다

- 지시 없이 리팩토링·정리·"개선" 금지. 버그 수정도 그 버그에 직접 걸린 줄만 최소로.

## 제3조: `⚠️ 수정금지(승인필요)` 주석이 달린 코드

- 사장님 명시 승인 없이 수정 금지. 그 파일을 안 건드려도, 그 코드의 전제를 깨는 변경은 위반이다(짝으로 도는 코드를 먼저 확인하라).

## 제4조: 경청

- 사장님이 말하는 중에 질문으로 끊지 마라. 끝까지 듣고 이해한 뒤 움직여라. 같은 확인 질문을 되풀이하지 마라.

## 제5조: 토큰·리소스 절약

- 에이전트는 1개로 되면 1개만. 넓은 탐색 대신 정확한 파일:라인. 읽은 파일을 다시 읽지 마라. 같은 설명을 반복하지 마라.

## 제6조: 코드 파일 = 코드장, 주석 = 사장님 승인 1줄만

- 수정한 블록에는 `// ⚠️ 수정금지(승인필요) YYYY-MM-DD 사장님 결정 = <무엇> (정본 §)` **1줄만**.
- 같은 블록의 옛 승인 줄은 삭제하고 교체(최신 날짜 1개만). 설명·사유·이력은 코드에 쓰지 말고 정본 문서에.
- 근거는 주석이 아니라 **현재 코드와 정본 문서**다.
- 강제 = `scripts/guard-no-old-artifacts.mjs` (pre-commit).

## 제7조: 문서

- 작업 기록 = 정본 문서(📌) 1곳. 별도 문서 파일을 만들지 마라(이 파일·전과 기록서 제외).

## 제8조: Android 앱 기준

- 모든 수정은 Android 앱 기준. 앱에서 시험할 수 없는 웹 전용 수정 금지.

## 제9조: 크레딧 과금 = 켬 (정본 = [`docs/2026-07-29 결제·크레딧 구현.md`](docs/2026-07-29%20결제·크레딧%20구현.md))

- **차감 켬.** 유료 외부호출 5지점. 단가 = 여정생성 5 / AI의견 5 / Tripis 해설 5 / 전문가검증 10 / 일별영상 60.
- **충전 켬.** Stripe €10 = 140 크레딧(100 + 보너스 40). 충전 확정 = **Stripe 웹훅 1경로만**. 클라이언트가 부르는 충전은 존재하지 않는다.
- **가입 보너스 50**(새 계정 만든 직후 `grantSignupBonus()` 1회). 50 = 영상(60)은 충전해야만 가능.
- **관리자(`users.is_admin`)·비로그인 = 차감 없음.**
- **카드 정보를 보관·표시하지 않는다**(Stripe 호스티드 결제).
- 단가·금액·면제 대상 변경 = 사장님 명시 승인.

| 대상 | 유일 정본 |
|---|---|
| 차감 | `shared/credits.ts` → `precheckFeature()`(잔액 확인) · `chargeOnSuccess()`(완성 시점 차감) |
| 단가표 | `shared/credits.ts` → `CREDIT_COSTS` (화면은 `GET /api/credits/pricing`) |
| 충전 | `worker/routes-payments.ts` → `POST /api/payments/webhook` |
| 장부 | `shared/credits.ts` → `addCredits()` |
| 이중충전 차단 | DB 규칙 `credit_transactions_purchase_ref_uniq` (`WHERE type='purchase'`) |
| 토큰 → userId | `worker/auth-user.ts` → `getUserIdFromReq()` (역할 = `getRoleFromDb()`) |
| 화면 잔액·내역·충전 | `client/screens/profile/creditsApi.ts` |

| # | 금지 |
|---|---|
| 1 | 클라이언트가 부르는 충전·적립 엔드포인트 추가 |
| 2 | 라우트에서 `addCredits()` 를 직접 불러 차감 |
| 3 | 단가·잔액을 화면에 하드코딩 |
| 4 | 응답 헤더(`setHeader`/`write`)를 내보낸 뒤 차감 배치(402 를 못 보냄) |
| 5 | `credit_transactions.reference_id` 에 전체 UNIQUE(`usage` 줄은 여정번호 재사용) |
| 6 | 결제 복귀에 커스텀 스킴·딥링크 |
| 7 | 아이디 문자열(`admin` 포함 여부)로 역할·면제 판단 |

## 제10조: 커밋·푸시·배포는 사장님 지시 때만

- "커밋해 / 푸시해 / 올려"를 듣기 전에는 절대 실행하지 마라. 자동 커밋·자동 푸시 금지.

## 제11조: 웹과 앱이 똑같이 돈다

- 웹에서 되는 기능은 Android·iOS 앱에서도 똑같이 돌아야 한다.
- 수정 전에 해당 플랫폼 호환성을 공식 문서로 확인해라. "될 것 같다"로 적용하지 마라.
- 웹에서 되는데 앱에서 안 되면 = 원인 → 보고 → 승인 → 수정.

## 제12조: 작업 순서 = 제22조 한 벌

- 제안 → 승인 → 수정 → 검증(제22조) → 실증(제21조) → 보고 → 정본 기록 → 대기 → 지시 시 커밋·배포(제24조) → 배포 확인 → 피드백.

---

## 제14조: `place_seed_raw` 입력·수정 = `upsertPlace()` 하나만

```ts
import { upsertPlace } from 'worker/lib/services/place-upsert';
const r = await upsertPlace({ cityId, seedCategory, nameEn, address, latitude, longitude, googlePlaceId, priceEur, /* ... */ });
// r.action = 'inserted' | 'updated' | 'skipped' / r.matchedBy = 'pid' | 'address' | 'coords' | 'name' | 'none'
```

**매칭 단계 (같은 장소 확률 순, 변경 금지)**

| 순위 | 기준 |
|---|---|
| 0 | google_place_id 일치 |
| 1 | 풀 주소 정규화 100%(번지 + 우편번호) |
| 2 | 좌표 10m |
| 3 | 장소명 LOWER+trim(보조, 체인 위험) |

- PID 가 달라도 보조 매칭(주소·좌표·현지 이름)이 맞으면 같은 장소다(우리 PID 오류). 거부권은 URI(cid)만.

**매칭 시 UPDATE = 무조건 새것 우선, 예외 없음**

- 뼈대(컬럼 구조·우리 id)만 유지. job 에 **온 값은 무조건 새값으로 덮는다**(`COALESCE(새값, 컬럼)`).
- **구글맵 페이지가 최우선**(2026-09-30 사장님) = 페이지를 열어 확정한 분류·가격은 옛 `seed_category`·`price_eur` 를 덮는다(`overwriteSeedCategory`). 식당·쇼핑은 구글이 확실히 이기고, 유적·힐링·모험·즐길거리도 구글이 이긴다. 핫스팟(사진 찍기 좋은 곳)은 구글 사실 분류가 전망대·명소·공원·바·카페·쇼핑몰이면 유지, 아니면 사실 분류 + 핫스팟 태그. 장소가 아닌 것(주유소·골프장·영화관·주차장·병원·주거 건물 등)은 **삭제**(껍데기 0). 판정식 = `shared/place-category-map.ts` 의 `finalCategory()` 하나.
- COALESCE 를 두는 유일한 이유 = job 에 **안 온 컬럼**(`?? null`)만 옛값 보존(부분 갱신이 다른 컬럼을 NULL 로 미는 파괴 방지).
- 가격 0·리뷰수 0·거리 0 = 정상 새값 = 보존(`?? null`, `|| null` 아님).
- tags = UNION(누적).
- 매칭(ag3) 동점이면 큰 id(최신) 우선. 제미니 응답은 매칭돼도 버리지 않고 전부 저장.

| # | 금지 |
|---|---|
| 1 | `db.insert(placeSeedRaw)` 직접 |
| 2 | `INSERT INTO place_seed_raw ...` SQL 직접 |
| 3 | 임시 스크립트에서 직접 INSERT |
| 4 | "한 번만 우회" |

- 최종 안전망 = DB BEFORE INSERT 트리거(누가 우회해도 EXCEPTION). 매칭 알고리즘 변경 = 사장님 명시 승인.

## 제15조: Google Places SKU = Enterprise 까지, Atmosphere 절대 금지

- 허용 최고 = **Enterprise**(`places.userRatingCount`, `places.priceRange` 포함). FieldMask 에 상위 SKU 필드가 하나라도 있으면 호출 전체가 그 가격이다.
- **Atmosphere 33필드 금지**(`editorialSummary`, `reviews`, `generativeSummary`, `dineIn`, `takeout`, `delivery` 등, 전체 = [`docs/SEED_SSOT_2026-05-02.md`](docs/SEED_SSOT_2026-05-02.md) §16).
- 가드 = `worker/lib/services/shared/google-places-sku.ts` 의 `validateFieldMask()` 하나.

| # | 금지 |
|---|---|
| 1 | Atmosphere 필드 사용 |
| 2 | `validateFieldMask()` 우회 = `places.googleapis.com` 직접 fetch |
| 3 | Place Details + Text Search 동시 사용(같은 데이터 2회 = 비용 2배) |
| 4 | "한 번만 Atmosphere" |

## 제16조: 폴더 구조 강제 + 1회용 스크립트 금지

```
worker/lib/services/                  ← 엔진 (워커와 필시티 CLI 가 같이 쓴다)
  ├─ shared/                          ← 단일 진입점 헬퍼
  │   ├─ google-places-sku.ts         (Atmosphere 가드)
  │   ├─ geminiClient.ts              (Gemini 단일 진입점)
  │   ├─ ts-client.ts                 (TS Enterprise + languageCode='ko')
  │   ├─ recognize-place.ts           (알아보는 문 = 제미니 값으로 창고 행 찾기)
  │   ├─ save-raw.ts                  (외부호출 raw 저장 관문, 제18조)
  │   └─ r2-client.ts                 (R2 창고 접근 1벌)
  ├─ place-upsert.ts                  (INSERT/UPDATE 단일 진입점, 제14조)
  ├─ agents/                          ← 여정 엔진 (ag1~4 · pipeline-v3, 여정 매칭 = ag3-match-core.ts)
  ├─ itinerary/                       ← 여정 도우미 (동선 최적화)
  └─ fill/                            ← 창고 채움 결손별 도구 (카탈로그 = 재발명 가드)
fillcity/                             ← 창고 채움 WF(fill-city-v3.ts) · 제미니 프롬프트(prompts/ = 1 글자 변경 금지) · 단계(steps/)
```

| # | 금지 |
|---|---|
| 1 | 1회용 임시 스크립트를 저장소에 만들기(`_migration-*.mjs`, `_diag-*.mjs` 등) |
| 2 | 1,000줄 넘는 메가 파일 |
| 3 | `shared/` 를 우회해 Gemini·TS 를 직접 부르기 |
| 4 | `db.insert(placeSeedRaw)` 직접(제14조) |
| 5 | "Recommended" 옵션 제시 |
| 6 | 매칭 코드 재발명(매칭 = `shared/recognize-place.ts` · `agents/ag3-match-core.ts` 만) |

- 새 작업 = `shared/` 헬퍼를 부르고, 새 컴포넌트는 `agents/` · `itinerary/` · `fill/` 안에만. 도시 채움 = `fillcity/fill-city-v3.ts --city-id=<N>` 한 줄.
- **재발명은 기계가 막는다** = `scripts/guard-no-reinvention.mjs`(pre-commit, `--catalog` = 도구 목록 실시간). 도구를 지우거나 바꾸면 그 턴에 카탈로그를 다시 쓴다.
- 창고 채움 흐름(v3 단계·도구) = 헌법이 아니라 정본 문서 ②-2(F1 상세)에 있다.

## 제18조: 외부호출 raw = `saveRaw()` 하나, 형식 고정

- 모든 유료 외부호출(TS·Gemini) 응답은 `worker/lib/services/shared/save-raw.ts` 의 `saveRaw()` 로 저장한다. 저장 없이 부르는 것 = 금지(돈이 증발한다).
- 자리 = `R2 {cityId}/raw/{YYYY-MM-DD_HHMMSS}_{source}-{tag}.json` + 로컬 `docs/raw/{cityId}/` **2곳 같은 모양**(자리·시각 = `shared/r2-paths.ts` 의 `rawPlace`·`fileStamp` 1벌).
- 사진·영상·보고서·사용자 사진도 파일 이름 맨 앞 = 시각 초까지(`{시각}_{원래 이름}`). 예외 = 관리 통계 하루 장부(`system/admin-metrics/{날짜}.jsonl`).

| 요소 | 값 |
|---|---|
| cityId | 도시 번호 / 도시 없는 여정 = `itinerary-{번호}` → `system/itineraries/{번호}/raw/` / 장소 없는 사진 해설 = `user-{번호}` → `users/raw/`(끝 `_{사용자 번호}`) / 맥락 없음 → `system/runtime/raw/` |
| 시각 | `YYYY-MM-DD_HHMMSS` 세계 표준시, 맨 앞 |
| source | `ts` \| `gemini` |
| tag | 호출 맥락(영숫자, `-` 치환, 48자), 없으면 `call` |

```json
{ "savedAt": "<ISO>", "source": "ts | gemini", "contextId": "<cityId | runtime>",
  "request": { "prompt": "...", "model": "..." }, "raw": { "parsed": {}, "text": "...", "finishReason": "..." } }
```

- 들여쓰기 2(사람이 읽을 수 있게). `request` = 프롬프트 원본 통째, `raw` = 응답 원본 그대로.
- 같은 초·같은 tag = `md5(raw)` 비교: 같으면 1개, 다르면 `_1`·`_2` 로 분리 보존(`shared/raw-filename.ts` 의 `rawHash`·`versionedName`).

| # | 금지 |
|---|---|
| 1 | 한 줄(minified) 저장 |
| 2 | 로컬만 / R2 만 저장 |
| 3 | 파일 이름에서 시각을 빼거나 같은 이름으로 덮어쓰기 |
| 4 | `saveRaw()` 우회 |
| 5 | `request`/`raw` 구조 변경·필드 누락 |

## 제19조: 교체 = 옛것을 다 지우고 새것 한 벌만 올리는 것

1. 사장님이 바꾸라고 하면 **옛것은 어떤 경우에도 쓰지 마라. 무조건 교체.**
2. 옛것은 **완전 삭제.** 주석으로 살려 두기(`// 옛 …`), 폴백, `if (옛방식)` 분기, 옛 결정 문구 = 전부 삭제.
3. **공존 금지.** md·스크립트·DB·트리거·화면·프롬프트 어디든 최신 1벌만.
4. **DB ↔ 저장소 동기화.** 라이브 DB 가 최신이면 저장소 SQL 도 즉시 그것으로, 저장소가 최신이면 DB 도 그것으로.
5. 새 규칙을 적용할 때는 **전수 grep → 옛것 완전 삭제 → 새것**. "딱 그것만" 고치고 나머지를 남기지 마라.
6. 옛것을 남겨 두는 "혹시 몰라서"는 없다. 문제가 생기면 사장님이 책임지고 다시 만든다.

- **기계가 막는다** = `scripts/guard-no-old-artifacts.mjs`(Edit/Write 직후 훅 + pre-commit). 통과 모양 = 옛 내용 인용 없이 "사유 + 날짜/§" 1줄. 가드 자체도 수정금지.

## 제20조: 모든 외부호출 WF = 같은 양식으로 `place_seed_raw` 에 모인다

- 발굴·재검증·어느 WF 든 결국 같은 `place_seed_raw` 로 모인다. **하나만 고치고 다른 WF 를 남겨 두지 마라**(입력 과정이 갈라지면 중복·오염).
1. 통일 헤더(출입증 `${API_PASS}`) = Gemini·TS·PM 3종 검문.
2. 응답은 **전 요소를 가져온다.** 칸을 골라 가져오기 금지.
3. **Gemini → TS → (필요할 때만) PM** 순서로 같은 행에 전 필드 새것 덮어쓰기(제14조).
   - Gemini(필수) = 선정·name_local·name_ko·이름·주소·가격·요약·distance.
   - TS(필수) = displayName→name_en·좌표·PID·URI·RC·priceRange·photoName·영업상태.
   - PM(조건부) = `image_url`(+`image_updated_at`) 1칸만, 이미지가 없을 때만.
4. DB 트리거 중복 확인 → 입력(`upsertPlace`, 제14조).
5. RC 순 relink(autorank 트리거).

## 제21조: 화면(FE) 수정 = 크롬으로 직접 눈으로 확인해야 끝

1. 운영 배포 확인 → 2. `https://tripis.app` 을 Chrome DevTools 로 직접 연다 → 3. 고친 화면·기능까지 직접 조작(인증은 "로그인 없이 둘러보기") → 4. 스크린샷·콘솔·네트워크로 확인(캐시가 의심되면 캐시를 우회해서) → 5. 작동/미작동을 사실로 보고.

| # | 금지 |
|---|---|
| 1 | 시각 확인 없이 "완료" |
| 2 | "웹에서 되니 앱도 될 것" 추정 |
| 3 | 배포 안 된 상태에서 시험 강행 |

- iOS·Android 실기기는 AI 가 못 돈다. 웹으로 공통 로직을 확인하고, 앱 전용 동작은 공식 문서로 확정 → 실기기 최종 확인은 사장님.

## 제22조: 커밋 전 검증 = 기계가 강제한다 (정본 = [`docs/2026-08-06 검증·커밋 게이트 자동화.md`](docs/2026-08-06%20검증·커밋%20게이트%20자동화.md))

```
수정 → 기계검증(6) → 크롬 실증(사용자 관점) → 미비하면 다시 → 판단 3종 → 표 제시 → 정본 문서 기록 → 대기
    → 커밋 승인(도장) → 빌드 필요 확인 → 커밋·푸시
```

- 집행 = `scripts/verify-pipeline.mjs` 1벌(단계 통과 = 코드 지문 마커, `.verify-state.json`). 같은 검증을 두 번 돌리지 않는다.
  - `machine` = 가드 3(§19 박제·§16 재발명·§0 줄 수) + 기계 6(tsc 신규 0·**컨테이너 타입검사 0건, 모든 모드**·웹빌드·lint·워커 번들·MIX 스모크).
  - `evidence "근거 1줄"` = 크롬/실호출 실증 기록(대상 서버를 먼저 확인).
  - `judge-pass` = 판단 3종(`Workflow({scriptPath: "scripts/verify-workflow.mjs"})` = simplify·code-review·react-best 병렬) **`allPassed: true` 가 나온 그 턴에만**.
  - `status` = 단계별 상태 표.
- pre-commit = 도장(제10조) → 가드 3 → 지문 대조(코드 커밋인데 실증·판단 마커가 없거나 낡으면 물리 차단, 문서만 면제). post-commit = 도장·마커 1회용 소멸.
- 하나라도 실패 = 통과할 때까지 고친다.
- 보고 표 = **문제점 · 해결책 · 사용자 관점 개선 효과** 3열. 기록은 그 작업의 정본 문서에.

| # | 금지 |
|---|---|
| 1 | 검증 없이 커밋 / 일부만 검증 / 실증 없는 "될 것 같다" |
| 2 | 마커가 맞는데 같은 기계검증을 또 돌림 |
| 3 | 웹빌드·lint·react-best 생략 |
| 4 | `--no-verify` · `-c core.hooksPath` 훅 우회 / 마커·도장 허위 발급(도장·`judge-pass` 는 승인·통과가 있는 그 턴에만) |

## 제23조: 버튼 글자 = 아이콘 + 짧은 동사만

- "바로가기", "예약하기", "저장", "공유"처럼 짧게. 날짜·대상·설명을 버튼에 넣지 마라. 맥락은 위치로 전달한다.
- 설명형이 꼭 필요해 보이면 = 사장님 승인 후에만(임의 판단 금지, 이모지 금지와 같다).

## 제24조: TRIPIS 배포 = 이 PC 에서 직접 올린다

- 사장님이 **"올려"** 하면 그 턴에 도장을 찍고 한 줄로 올린 뒤 결과를 보고한다.

```
node scripts/guard-commit-approval.mjs stamp     (사장님 "올려" 그 턴에만)
node scripts/release.mjs <커밋메시지파일>        (메시지 파일은 저장소 밖)
```

```
① 커밋 안 한 변경이 있으면 멈춤
② node scripts/build-worker-assets.mjs
③ git commit
④ npx wrangler deploy --config worker/wrangler.jsonc --message "<커밋 제목>"
⑤ npx wrangler versions list
⑥ node scripts/worker-logs.mjs --min 15 --errors      (생략 금지)
⑦ git push origin tripis1                              (맨 뒤)
```

- 같은 커밋이 두 번 올라간다 = 설계대로(푸시 뒤 Workers Builds 가 한 번 더 = 안전장치).
- 로컬 시험 서버(8787)가 켜져 있으면 ②에서 멈춘다 → 끄고 다시.
- 푸시만 실패 = `git push origin tripis1` 만 다시. 커밋 뒤 배포 실패 = ④만 다시.
- **로그는 반드시 본다** = `scripts/worker-logs.mjs` 1벌(`--min`, `--errors`, `--path`, `--find`). 실시간이 필요할 때만 `npx wrangler tail --config worker/wrangler.jsonc`.
- 설정 2벌: `worker/wrangler.jsonc` = 정본(구운 이미지 주소) / `worker/wrangler.build.jsonc` = 도커 있는 곳에서 굽는 길. 이미지 말고 다른 칸을 고치면 **두 파일에 같이**. 컨테이너 코드를 고치면 이미지를 새로 굽고 digest 갱신.
- 깃 없이: `wrangler versions list` · `wrangler versions view <id>` · `wrangler rollback <id>` · `wrangler init --from-dash`.

| # | 금지 |
|---|---|
| 1 | 배포하고 커밋 안 함(다음 푸시에 옛 판으로 되돌아감) |
| 2 | 배포 확인을 GitHub 빨간불로 판단(Cloudflare 를 먼저 본다) |
| 3 | 새 배포 경로·임시 배포 명령을 만듦(가드 `deploy`) |
| 4 | `--message` 없이 배포 |
| 5 | 배포하고 로그를 안 봄 |
| 6 | 로그 보려고 임시 스크립트를 짬 |
