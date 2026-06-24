# 전체 앱 Gemini + TS 호출 프롬프트 총 SSOT (2026-06-07)

> **목적**: 전체 앱의 **Gemini 프롬프트 원본 전부 + TS 호출(헤더·설정·조건) 전부**를 한 곳에 추출 = 3개월 실증으로 최적화된 코드급 근본 자산. Gemini→TS 전환·스킬 정리의 기준.
> **추출 방법**: 코드베이스 전수 grep + 영역별 병렬 추출(워크플로 `prompt-inventory-extract`, 8 에이전트) + 누락 비평. 총 **46 호출지점**(Gemini 26 + TS 18 + archived 2).
> **표기 규칙**:
> - **인라인 프롬프트**(코드 안 템플릿) = verbatim 그대로 수록 (1글자도 안 바꿈). 검증 = `file:line` 대조.
> - **외부 잠긴 프롬프트**(`prompt.txt` / `STANDARD_PROMPT*.md`) = 원본 파일이 진본 = **링크로 가리킴**(중복 truth 방지). 클릭해 직접 열람.
> - 삭제/중복 정리 = 사용자 직접 (이 파일은 추출 카탈로그).

---

## 0. 한눈 요약 = "가져오는 값은 비슷한데 헤더가 전부 다름"

### Gemini (26곳) 차이 축
| 축 | 실제 차이 |
|---|---|
| **단일관문(`geminiClient.geminiJson`) 통과** | 큐레이션·도시메타·동선·seed enrich **4곳만** / **22곳 우회** (server/gemini.ts 8·bts-gemini·스킬 raw fetch·scripts) |
| **모델** | `gemini-3-flash-preview`(주력) / `gemini-2.5-flash`(admin 테스트) / `gemini-2.5-flash-preview-tts`(TTS) / `gemini-2.0-flash`(BTS 동선) / `gemini-1.5-flash`(test-crisis) |
| **grounding(googleSearch)** | ON = 큐레이션·도시메타·동선·01·02·05·13·seed·seed-gemini / OFF = MIX step1 여정(`STEP1_USE_GROUNDING=false`)·드림스튜디오·BTS·테스트 |
| **temperature** | 0.2(관문기본·스킬) / 0.3(MIX step1·동선 override) / 미설정(드림·BTS·테스트) |
| **JSON 강제** | responseMimeType(관문·step1) / responseSchema 객체(드림스튜디오) / grounding 시 mime 제거 / 평문(공유설명·스크립트최적화) |
| **maxOutputTokens** | 50000(관문·스킬·동선) / 8192(MIX step1) / 4000(vibetrip 원본) / 미설정(드림·BTS) |
| **thinkingBudget** | 0(거의 전부) / 1500(vibetrip 원본만) |

### TS (18곳) 차이 축
| 축 | 실제 차이 |
|---|---|
| **단일관문(`ts-client` tsSearch/tsPhoto) 통과** | ts-backfill·ts-photo·06 / **우회 raw fetch** = ag3(라이브)·12-discover·recover·seed-gemini·p0-cron |
| **FieldMask** | 9요소 STANDARD 통일(관문·12·06·ag3) / **레거시 상이** = seed-gemini(+types/primaryType, §15 가드 없음)·p0-cron(6필드 다른 마스크+자체 가드) |
| **검색방식** | searchText(관련성 ≤60) / searchNearby(POPULARITY ≤20) |
| **범위** | rectangle(발굴 사각형) / locationBias circle(검증 앵커) / circle(인근) |
| **languageCode** | 'ko'(대부분) / 발굴만 `--lang`(파리=fr) |

### 9요소 STANDARD FieldMask (= `google-places-sku.ts`, 모든 관문 공통, Atmosphere 0)
```
places.id,places.displayName,places.formattedAddress,places.location,places.userRatingCount,places.priceRange,places.photos,places.googleMapsUri,places.businessStatus
```
(= PID·로컬명·풀주소·좌표·리뷰수·가격·사진·mapsUri·영업상태. **rating 평점 제외**.)

---

## 🔐 출입증(API-PASS) 검문소 = 외부호출 키 단일 관문 (2026-06-18 사장님 SSOT)

> **모든 외부호출 스크립트(발굴·채움·레거시)는 키를 받을 때 검문소를 통과해야 한다.** = AI 가 표준 안 거치고 임의 호출하는 것 차단.

### 두 짝
| 짝 | 무엇 | 적용 = Gemini·TS·PM 전부 |
|---|---|---|
| **① 키 발급 검문 (= 진짜 차단)** | Gemini·TS·PM **3종 모두** 키 받을 때 = 헬퍼 `issueApiKey()` 1줄 → DB 검문소 통과. 미달=키 없음=외부호출 불가. | TS 헬퍼 [`server/services/shared/issue-api-key.ts`](../server/services/shared/issue-api-key.ts) · DB 함수 [`server/db/migrations/2026-06-18_apipass-issue-key.sql`](../server/db/migrations/2026-06-18_apipass-issue-key.sql) |
| **② 출입증 헤더 (= 증거 표식)** | `${API_PASS}` = `[API-PASS] 도시=이름(id) / 행=있음/없음 / 날짜=오늘`. **Gemini 만** = 자연어 프롬프트 있어 본문 최상단에 박음. **TS·PM = 자연어 프롬프트 없음(FieldMask 조립)** = 헤더 박을 곳 없음 → ①키 발급 검문으로 차단. | Gemini = 각 `prompt.txt` / TS·PM = 헤더 없음(①로 차단) |

> ⚠️ **TS·PM 도 ①키 발급 검문은 100% 거친다** (= 키 못 받으면 외부호출 불가). 헤더(②)만 Gemini 전용(자연어라 박을 자리 있음). = 차단 = 3종 전부.

### 검문 (= DB 함수가 함) = 출입증 3요소 다 "있나/없나"
- **키이름** = api_keys 미존재 자동 차단 (화이트리스트 X = 무제한)
- **날짜** = YYYY-MM-DD 형식 / **도시** = 있음(cities 검증)·없음(신규 면제) / **행** = 채움(확인)·발굴(면제)
- 통과 → 키 발급 / 미달 → 차단(외부호출 불가)

### 적용 (= 스크립트 21곳, AI 가 도는 발굴·채움·레거시) — `await issueApiKey(c, 키이름, cityId, today, 채움여부)`
| 묶음 | 호출 | 채움/발굴 |
|---|---|---|
| 발굴 | #06(01)·#30~33(12run)·#34(recover)·#21·#41(seed-gemini)·#42(cron)·#08↔03·04 식당발굴 | 발굴 false |
| 채움 | #07(02)·#08(05reverify)·#09(05text)·#28(ts-backfill)·#29(ts-photo)·#37·#38(06)·12 image·post·**#45(결손보강 WF = Gemini+TS+PM 3종)** | 채움 true |  <!-- #10(13) 삭제 2026-06-23 §19·§20 = #45 흡수 -->

### ⛔ 안 막음 (= 사장님 결정)
라이브앱(#02·#03·#04·#39) = 그대로(db·cityId 없어 구조 위험) / 부팅로더 = 그대로(메인앱 키) / 드림스튜디오(#11~18)·BTS(#19)·테스트(#22~25).

### ⚠️ 한계 (정직)
부팅로더 살아있으니 AI 가 process.env 직독 우회 가능. 단 AI 는 해커 아님 = 사장님 요구로만 움직임 → 표준 스크립트가 검문소 경유 = 정상 작업은 다 출입증 거침.

---

# 📑 마스터 목차 (= 고유번호로 호칭 = "#41 삭제" / "#30 사용")

> 모든 프롬프트 = **고유 일련번호 #01~#44**. 본문 섹션 제목도 같은 번호. 이 번호로 명령하세요.

> 🔗 **원본 직링크** = "파일" 칼럼 클릭 → 진본 소스 즉시 열람. (인라인=섹션 본문 verbatim / 파일기반=prompt.txt·STANDARD 링크.)

| # | 이름 | 엔진 | 모델/방식 | 상태 | 원본(클릭) |
|---|---|---|---|---|---|
| **#01** | geminiJson() 단일 게이트웨이 | Gemini | gemini-3-flash-preview | live | [geminiClient.ts:52](../server/services/shared/geminiClient.ts) |
| **#02** | MIX step1 여정 생성 (미발굴 도시) | Gemini | gemini-3-flash-preview / grounding OFF | live | [pipeline-v3.ts:485](../server/services/agents/pipeline-v3.ts) |
| **#03** | 동선 최적화 handleRouteRequest | Gemini | gemini-3-flash-preview / grounding ON | live | [route-prompt.ts](../server/services/route/route-prompt.ts) |
| **#04** | 도시 메타 백필 fetchCityMetaFromGemini | Gemini | gemini-3-flash-preview / grounding ON | live | [gemini-city-meta.ts:22](../server/services/shared/gemini-city-meta.ts) |
| **#05** | 숏폼 시나리오 통합 (11) | Gemini | gemini-3-flash-preview | ⚠️봉쇄(호출0) | [11/STANDARD_PROMPT](../fillcity/prompts/11-main-app-scenario/STANDARD_PROMPT_2026-05-25.md) |
| **#06** | 01 비식당 6카테고리 발굴 | Gemini | gemini-3-flash-preview / grounding ON | live(12로 대체) | [01/prompt.txt](../fillcity/prompts/01-discover-6cats/prompt.txt) |
| **#07** | 02 장소 보강 큐레이션 (라이브 게이트웨이) | Gemini | gemini-3-flash-preview / grounding ON | live | [02/prompt.txt](../fillcity/prompts/02-enrich-place/prompt.txt) · [gemini-curate.ts](../server/services/shared/gemini-curate.ts) |
| **#08** | 05 식당 재검증 | Gemini | gemini-3-flash-preview / grounding ON | live | [05-reverify/prompt.txt](../fillcity/prompts/05-restaurant-reverify/prompt.txt) |
| **#09** | 05 텍스트 재분류 (⚠️05 번호충돌) | Gemini | gemini-3-flash-preview / grounding ON | live | [05-text/prompt.txt](../fillcity/prompts/05-text-recategorize/prompt.txt) |
| **#11** | 드림스튜디오 페르소나 스크립트 | Gemini | gemini-3-flash-preview | live | [gemini.ts:13](../server/gemini.ts) |
| **#12** | 드림스튜디오 페르소나 TTS | Gemini | gemini-2.5-flash-preview-tts | live | [gemini.ts:128](../server/gemini.ts) |
| **#13** | 위치기반 가이드 콘텐츠 | Gemini | gemini-3-flash-preview / systemInstruction | live | [gemini.ts:203](../server/gemini.ts) |
| **#14** | 공유링크 설명 | Gemini | gemini-3-flash-preview / 평문 | live | [gemini.ts:304](../server/gemini.ts) |
| **#15** | 드림샷 영화급 프롬프트 | Gemini | gemini-3-flash-preview / enum schema | live | [gemini.ts:343](../server/gemini.ts) |
| **#16** | 음성 스크립트 최적화 | Gemini | gemini-3-flash-preview / 평문 | live | [gemini.ts:425](../server/gemini.ts) |
| **#17** | 텍스트 분석+대사 | Gemini | gemini-3-flash-preview | live | [gemini.ts:472](../server/gemini.ts) |
| **#18** | 이미지 분석+대사 | Gemini | gemini-3-flash-preview | live | [gemini.ts:585](../server/gemini.ts) |
| **#19** | BTS 동선 최적화 | Gemini | gemini-2.0-flash | legacy | [bts-gemini.ts:79](../server/services/bts-gemini.ts) |
| **#20** | seed enrich (파리 DB-only Step1) | Gemini | gemini-3-flash-preview / grounding ON | live | [enrich-place.ts:174](../server/services/seed/enrich-place.ts) |
| **#21** | SEED v3 6카테고리 (mjs) | Gemini | gemini-3-flash-preview / grounding ON | legacy | [seed-gemini.mjs:209](../scripts/seed-gemini.mjs) |
| **#22** | admin API 키 테스트 | Gemini | gemini-2.5-flash | tool(헬스체크) | [admin-routes.ts:648](../server/admin-routes.ts) |
| **#23** | 파리 일정 테스트 (test_gemini+test_trip) | Gemini | gemini-2.5-flash | reference | [test_gemini.ts](../scripts/test_gemini.ts) |
| **#24** | Gemini 연결 테스트 (NUBI) | Gemini | gemini-1.5-flash (옛SDK) | reference | [test-crisis.js:70](../scripts/test-crisis.js) |
| **#25** | VibeTrip 원본 일정 생성 | Gemini | gemini-3-flash-preview / thinkingBudget 1500 | reference | [geminiService.ts:32](../reference/vibetrip-original/services/geminiService.ts) |
| **#26** | tsSearch 단일 게이트웨이 | TS | searchText/searchNearby | live | [ts-client.ts:81](../server/services/shared/ts-client.ts) |
| **#27** | tsPhoto 단일 게이트웨이 | TS | PhotoMedia→Storage | live | [ts-client.ts:129](../server/services/shared/ts-client.ts) |
| **#28** | ts-backfill (PID 없는 행 보강) | TS | searchText | live | [ts-backfill.ts:60](../server/services/fill/ts-backfill.ts) |
| #29 | ts-photo-fill = **삭제(2026-06-23 §19·§20)** | — | — | deleted | 이미지 = #45 흡수 = 파일 완전삭제 |
| **#30** | 발굴레시피① 인기도 카테고리 TOP20 | TS | searchText catMode + 사각형 | tool | [12/run.ts](../fillcity/prompts/12-ts-discover-pool/run.ts) |
| **#31** | 발굴레시피② 외곽 식당 지역별 TOP20 | TS | searchText zone=outskirt circle | tool | [12/run.ts](../fillcity/prompts/12-ts-discover-pool/run.ts) |
| **#32** | 발굴레시피③ 도심 신규식당 60 합본 | TS | nearby POPULARITY + text60 + premium | tool | [12/run.ts](../fillcity/prompts/12-ts-discover-pool/run.ts) |
| **#33** | 12 run.ts 발굴 엔진 (③ 공통구현) | TS | searchText/searchNearby raw | tool · ⚠️관문우회 | [12/run.ts:127](../fillcity/prompts/12-ts-discover-pool/run.ts) |
| **#34** | 12 recover-by-name (이름직접) | TS | searchText raw | tool · ⚠️관문우회 | [recover-by-name.ts:57](../fillcity/prompts/12-ts-discover-pool/recover-by-name.ts) |
| #35 | 12 image-pool = **삭제(2026-06-23 §19·§20)** | — | — | deleted | 이미지 = #45 흡수 = 파일 완전삭제 |
| **#36** | 12 post-process (PM+upsert, TS검색0) | TS | PhotoMedia | tool | [12/post-process.ts:265](../fillcity/prompts/12-ts-discover-pool/post-process.ts) |
| **#37** | 06 ts-pm-enrich 발굴/검증 (관문) | TS | tsSearch searchText | tool | [06/run.ts:77](../fillcity/prompts/06-ts-pm-enrich/run.ts) |
| **#38** | 06 post-process (tsPhoto 관문) | TS | tsPhoto | tool | [06/post-process.ts:75](../fillcity/prompts/06-ts-pm-enrich/post-process.ts) |
| **#39** | ag3 saveNewPlacesToDB (신규/bare) | TS | searchText raw | ⚠️live·관문우회 | [ag3-data-matcher.ts:719](../server/services/agents/ag3-data-matcher.ts) |
| **#40** | ag3 matchCandidate 5단계 (외부0) | TS | DB 매칭 | live | [ag3-data-matcher.ts:354](../server/services/agents/ag3-data-matcher.ts) |
| **#41** | seed-gemini STEP2 TextSearch+PM | TS | searchText raw (types/primaryType+가드없음) | legacy | [seed-gemini.mjs:327](../scripts/seed-gemini.mjs) |
| **#42** | p0-bts-daily-cron searchText+PM | TS | searchText raw (6필드 자체마스크) | legacy | [p0-bts-daily-cron.mjs:123](../scripts/p0-bts-daily-cron.mjs) |
| **#43** | 07 중복통합 (결정론, 프롬프트 예비) | 비-LLM | 5단계 매칭 (Gemini 미사용) | live | [07/run.ts:80](../fillcity/prompts/07-merge-dups/run.ts) |
| **#44** | 08 Wikidata 이미지 (SPARQL) | 비-LLM | SPARQL (Gemini 미사용) | live | [08/run.ts:68](../fillcity/prompts/08-wk-image-fill/run.ts) |
| **#45** | 결손보강·보정 WF (1행 1결손→행 전체 Gemini→TS→PM 보강) | 복합(Gemini+TS+PM) | 추출(6cat TOP20+식당 band 30/90/30 또는 `--all-restaurants`=식당전부)→Gemini 전11필드 새우선→TS 전필드 새우선→PM이미지→2곳저장 | live(실증완료) | [fill45-defect-repair.ts](../fillcity/repair.ts) |
| **#46** | #1b 정제(cleanse) = 전체 행 재검증 (#07 프롬프트 재사용 = 새 프롬프트 아님) | Gemini | 전체행(BTS제외)→geminiCurate(=02-enrich/prompt.txt)→가격오염·이름환각·칸오입력 교정→id직행 전필드 새덮어쓰기(shopping price=NULL) = TS·PM 0 | live(실증완료) | [fillcity-step1b-fix-pollution.ts](../fillcity/cleanse.ts) · 본문 = **#07** (같은 prompt.txt) |

> **단일관문 우회(정리 후보)**: Gemini = #11~#18(드림스튜디오)·#19·#21·#06·#08·#09 / TS = #33·#34·#39·#41·#42.  <!-- #10 삭제(2026-06-23) -->
> **명백한 폐기 후보**: #19·#21·#41·#42(legacy) / #22(헬스체크) / #23·#24·#25(reference).

## 🧬 원본 유형 = "어디서 왔나 + 편집/삭제 시 진본 위치" (= 매번 안 찾아도 됨)

> 프롬프트를 고치거나 지울 때 = 아래 "진본"만 건드리면 됨. (목차 `파일:라인` = 위치 / 아래 = 원본 종류)

| 유형 | 진본(여기만 편집) | 해당 # |
|---|---|---|
| **① 코드 인라인** (코드 파일 = 유일 진본) | 그 코드 파일의 해당 라인 | #04·#11~#18·#19·#20·#21·#22·#23·#24·#25·#44(SPARQL) |
| **② 외부 prompt.txt** (.txt = 진본, 코드는 `readFileSync` split) | 스킬 `prompts/<폴더>/prompt.txt` | #06·#07·#08·#09·#43 |  <!-- #10 삭제(2026-06-23) -->
| **③ 코드 인라인 + SSOT .md 미러** (⚠️ 양쪽 1:1 동기 = 둘 다 갱신) | 코드(=실행) + `STANDARD_PROMPT*.md`(=원본보관) | #02(↔09.md)·#03(↔10.md) |
| **④ SSOT .md 만** (라이브 코드 없음 = 봉쇄) | `11-main-app-scenario/STANDARD_PROMPT_2026-05-25.md` | #05 |
| **⑤ raw fetch / 설정만** (LLM 프롬프트 텍스트 없음 = FieldMask·textQuery 조립) | 해당 코드 파일 | #01(게이트웨이)·#26~#42 |

**유형별 핵심 메모**:
- **②가 진본 패턴 = 가장 안전**: #06~#09 = 코드가 .txt를 읽음 → **.txt 1글자만 바꾸면 반영**(코드 무수정). #07(02-enrich)은 CLI(run.ts) + 라이브(gemini-curate.ts) **둘 다** 같은 .txt를 읽음 = 1곳 수정 = 양쪽 적용. (#10=13 삭제 2026-06-23)
- **③은 위험 = 2곳 동기 필수**: #02·#03은 프롬프트가 코드에 인라인이고 .md는 "원본 보관용 복사본". 코드를 고치면 .md도 같이 고쳐야 1:1 유지(헌법 §3). ⚠️ #03은 모델까지 코드≠.md 불일치 상태(본문 #03 참조).
- **①은 코드가 곧 프롬프트**: #11~#25 = 그 함수 안 템플릿 문자열이 전부 = 그 파일만 편집.
- **⑤는 프롬프트가 없음**: TS 호출(#26~#42)·SPARQL(#44) = 자연어 프롬프트 아님 = FieldMask/검색방식/조건 = 코드 편집.

> ⚠️ **이 문서는 2026-06-07 스냅샷**: `파일:라인`의 라인번호는 코드 수정 시 밀릴 수 있음(파일경로·함수명은 안정). 라인이 어긋나면 함수명으로 찾으면 됨.

---

# A. GEMINI 호출 (26곳)

## Gemini 게이트웨이 (#01)

### #01 · `geminiJson()` — 사용자 메인앱(라이브) Gemini 진입점 (= process.env 직독)
<!-- ⚠️ 2026-06-20 §19 모순제거 = 옛 "모든 Gemini 호출 단일 진입점" 문구 삭제. process.env 직독 = FE 사용자 입력 경로 전용(메인앱 동선·도시메타·seed). 관리자 백그라운드(#07·#45 결손보강·발굴) = 출입증 직독이라 이 함수 안 거침 = "모든"이 아님. -->
- **파일**: `server/services/shared/geminiClient.ts:52` · **상태**: live · **모델**: `gemini-3-flash-preview` (MODEL_ID)
- **호출 주체**: **사용자(FE 입력)** = 메인앱 동선·도시메타·seed = **process.env 직독**(출입증 불필요). ⚠️ 관리자 백그라운드(#07·#45)는 출입증 직독이라 **이 함수 안 거침**.
- **프롬프트**: 없음 (호출자 인자 전달만 = 게이트웨이/배관, 프롬프트는 각 호출 #가 보관).
- **설정 (verbatim)**: `config = { temperature: opts?.temperature ?? 0.2, maxOutputTokens: opts?.maxOutputTokens ?? 50000, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } }`. `opts.googleSearch=true` 시 → `config.tools = [{ googleSearch: {} }]` 추가 + `delete config.responseMimeType` (= tools+JSON mime 동시불가 INVALID_ARGUMENT 우회). `contents = [{ role:"user", parts:[{ text: prompt }] }]`. responseSchema 없음. API key = `AI_INTEGRATIONS_GEMINI_API_KEY || GEMINI_API_KEY`(process.env). 파싱 = `raw.match(/\{[\s\S]*\}/)` 첫 JSON. SDK = `@google/genai`.
- **조건**: 사용자 메인앱 Gemini 호출(#02·#03·#04·#20 = 동선·도시메타·seed)이 이 함수 통과. ⚠️ 수정금지(승인필요). 상수 MODEL_ID/TEMPERATURE=0.2/MAX_OUTPUT_TOKENS=50000. **관리자 백그라운드(#07·#45)는 별도 = 출입증 직독.**

## Gemini 메인앱 라이브 — 여정/동선 (#02~#05)

### #02 · MIX step1 여정 생성 (ready=false 경로)
- **파일**: `server/services/agents/pipeline-v3.ts:485` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **프롬프트 원본**: 인라인 lines 415-464 (SSOT 원본 = [`09-main-app-itinerary/STANDARD_PROMPT_2026-05-24.md`](../fillcity/prompts/09-main-app-itinerary/STANDARD_PROMPT_2026-05-24.md), 1:1 동기 강제)
- **설정 (verbatim)**: temperature=0.3 / maxOutputTokens=8192 / thinkingBudget=0 / **`STEP1_USE_GROUNDING=false`**(라인 470) → responseMimeType="application/json"(JSON 강제, tools 없음 = **grounding OFF**). 토글 true 시 = tools=[{googleSearch:{}}] + mime 제거. 파싱 = parts(text && !thought) → ```json fence 제거 → `/\{[\s\S]*\}/` → JSON.parse, 실패 시 repairTruncatedJSON.
- **조건**: `runPipelineV3` → `isCityReady(destination).ready=false`(미발굴 도시) → runPipelineMix. 입력 = TripFormData → AG1 평문화(koreanTravelerStyle/seasonNote/dayRequirements 슬롯매트릭스). ready=true 면 호출 안 됨(pipeline-db-only). 환각 안전망 = saveNewPlacesToDB TS 재검증.
- **verbatim 프롬프트**:
```
You are a travel data assistant for KOREAN TRAVELERS (${nowYear}년 기준 최신 정보).
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

⚠️ GROUNDING REQUIREMENT (= Gemini 3 + Google Search 강제):
- All facts (place names, addresses, coordinates, prices, opening hours) MUST be verified via Google Search grounding.
- No hallucinations. No made-up coordinates. No fabricated addresses.
- If you cannot verify a fact via Google Search, SKIP that place — do NOT guess.

TASK: Fill the provided slot matrix (categories + counts) and sort places within each day by minimum travel distance to generate the itinerary.

CITY: ${formData.destination}
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

[USER CONTEXT — AG1 보강]
${koreanTravelerStyle}
계절: ${seasonNote} / 큐레이션: ${focusDesc}

[SLOT MATRIX — AG1 결정]
${dayRequirements}

[동선 원칙]
- 매일 ${formData.destination} 도시 중심부에서 출발·귀환, 같은 날 = 같은 구역 묶기
- Array order within each day = visit order (= sorted by minimum travel distance from start)
- DAILY MEAL RULE (= AG1 has already assigned these slots — DO NOT modify count or position):
    * Each day MUST contain exactly 1 lunch (type="lunch") somewhere in the middle of the day.
    * The FINAL slot of each day MUST be dinner (type="dinner").
- 3 일+ 일정 시 = Day 2+ 한 날 = outskirt (= 도심에서 10-100km 외곽) day-trip 1-2 곳 포함 가능 (= 한국 여행객이 자주 찾는 외곽 명소/아울렛)

[가격 원칙]
- price_eur = ${nowYear}년 실제 입장료 (1인, EUR). 무료=0
- 점심 1인 ~€${mealBudget.lunch}, 저녁 1인 ~€${mealBudget.dinner}
- 활동(activity) = 1인 입장료 / 식당(lunch/dinner) = 1인당 평균. 확실하지 않으면 0

For each place include (= ALL fields verified via Google Search grounding):
- name (English official name on Google Maps)
- nameKo (한국어 = 한국 여행자가 부르는 이름)
- nameLocal (local language name = 예: 파리=Tour Eiffel) [= REQUIRED for Text Search forwarding + matching key, final DB column]
- address (FULL street address with NUMBER + street + postal code + city) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search]
- type ("activity" | "lunch" | "dinner")
- latitude (= decimal 6 digits, e.g. 48.858370) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- longitude (= decimal 6 digits, e.g. 2.294481) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- price_eur (1 인 EUR)
- selection_reason_ko (한국어 한 줄 = 한국 여행객 트렌드 = 인스타 성지/한국 vlog 등 사회적 검증)
- shortform_ko (한국어 한 줄 = 장소에 대한 코믹/위트 = Claude 톤. 단순 정보 X = "프사각", "본전 뽑음" 같은 한국 슬랭)

OUTPUT (strict JSON, no markdown fences):
{"days":[{"day":1,"theme":"테마","places":[
  {"name":"Eiffel Tower","nameKo":"에펠탑","nameLocal":"Tour Eiffel","address":"Champ de Mars, 5 Av. Anatole France, 75007 Paris","type":"activity","latitude":48.858370,"longitude":2.294481,"price_eur":29.4,"selection_reason_ko":"파리 인스타 인증샷 1순위 성지","shortform_ko":"파리 왔으면 외쳐줘야 국룰 '나 파리다!'"}
]}]}
```

### #03 · 동선 최적화 `handleRouteRequest` (geminiClient 경유)
- **파일**: `server/services/route/route-handler.ts:36` (프롬프트 정의 = `server/services/route/route-prompt.ts:172-239` `generateRoutePrompt`) · **상태**: live · **모델**: `gemini-3-flash-preview`
- **프롬프트 원본**: 인라인 (SSOT 원본 = [`10-main-app-route/STANDARD_PROMPT_2026-05-26_route-only.md`](../fillcity/prompts/10-main-app-route/STANDARD_PROMPT_2026-05-26_route-only.md), 1:1 동기) · ⚠️ route-prompt.ts/route-types.ts = §3 수정금지
- ⚠️ **모델 불일치 (= 코드≠SSOT)**: 이 SSOT `.md`(2026-05-26)는 모델 `gemini-2.5-flash-lite` 지정(입력 1/5·출력 1/7.5 비용근거)인데 **라이브 코드(route-handler.ts)는 `gemini-3-flash-preview` 사용** = 코드가 SSOT 미반영. (정리 시 판단 필요)
- **설정 (verbatim)**: `geminiJson<RouteResponse>(prompt, { model:"gemini-3-flash-preview", temperature:0.3, maxOutputTokens:50000, googleSearch:true })` → 게이트웨이 내부 = tools=[{googleSearch:{}}] + responseMimeType 삭제 = **grounding ON + JSON mime 없음**. 입력 inputJson = places.filter(seedCategory!=='restaurant') 4~5필드만 + trip_config + protagonist(transport_mode public_transit|private_driver_guide) + meal_budget + city_center.
- **조건**: DB-only path 동선 생성(표준 prompt 직접). 식당은 제외 = Gemini 가 점심/저녁 자동 발견. 출발/귀환 anchor = accommodationCoords > cityCoords > places[0]. ⚠️ 단 라이브 동선은 현재 route-local(코드) 1차 + 이건 fallback (= WORKLOG 2026-06-06).
- **verbatim 프롬프트**:
```
# 역할
너는 한국인 여행자를 위한 ${formData.destination} 동선 최적화 전문가다.

# 너의 강점
- Google Search grounding = 한국 인스타/유튜브 트렌드 + 실 가격 + 실 주소 + 실 좌표 + 실 도로 거리.
   ※ 옛 "Google Maps grounding" 표현 폐기 (= 2026-05-28 사용자 SSOT = Maps + Search 동시 작동 X 입증)

# 목표
입력 ${nonRestaurantCount} 비식당 + 일자별 점심 + 저녁 식당 자동 발견
= 총 ${nonRestaurantCount + 2 * tc.day_count} 슬롯 = **빠짐없이** 모두 채워라 (= 활동 누락 X)

# 시간 + 일자 (= 사용자 동적 입력)
- ${tc.day_count} 일 / 출발 ${tc.start_time} ~ 종료 ${tc.end_time}
- 총 슬롯 수 = ${nonRestaurantCount + 2 * tc.day_count} (= **반드시 응답**)
- 일자별 슬롯 수 = 자유 (= 동선 효율 따라 = Gemini 자율)
- 시각 분배 = 자유 (= 단, 슬롯 간 시각 연속 = 갭 X)

# 식당 자동 발견 + DB 백필
- 점심 = 일자 중간 시각 + 좌표 인근.
- 저녁 = 일자 마지막 종착지 + 좌표 인근.
- 식비 = 일일 한도 €${mealBudget.dailyTotal} (= ${mealBudget.label}) 내 자유 분배 (= 동선 따른 식당 선택 자유 = 점심/저녁 비율 강제 X).
- ⚠️ Gemini 발견 식당 = 7 필드 반드시 (= name_local / address / lat / lng / **price_eur = 1 인 EUR 1 가지만** / **selection_reason_ko** / **shortform_ko**).
- ⚠️ **price_for_2_eur 같은 2 인 가격 요청 X** (= Gemini 가 2 인 가격을 1 인 필드에 입력 위험 = 사용자 SSOT 2026-05-25 = 단위 모호 결함).
- **selection_reason_ko** = 한국어 한 줄 = 인스타 성지/네이버 블로그/유튜브 vlog 사회적 검증 (→ DB summary_ko).
- **shortform_ko** = 한국어 한 줄 = 코믹/위트 후킹 = "프사각", "본전 뽑음" 한국 슬랭 (→ DB editorial_summary).
- 모두 Google Search grounding 검증 = 환각 금지.

# 활동 응답 양식 (= 2026-05-28 사용자 SSOT 신규)
- 활동 = address + name_local + price_eur 응답 (= 입장료/체험비 1 인 EUR = PSR 오류 정정 base = R3 백필).
- 활동 = 카피 (selection_reason_ko / shortform_ko) 응답 X (= PSR 기존 데이터 사용).

# 입력
${JSON.stringify(inputJson, null, 2)}

# 출력 양식 (= JSON 만, no markdown wrappers)
{
  "total_duration_sec": <number>,
  "total_distance_km": <number>,
  "days": [
    {
      "day": <number>, "total_distance_km": <number>,
      "scenes": [
        {
          "slot": <number>, "time": "HH:MM", "type": "activity|restaurant",
          "place_id": <입력 활동 = 입력 id "db-${PSR.id}" / 식당 = "auto-lunch-dN" 또는 "auto-dinner-dN">,
          "name_local": <활동 = 입력 echo 또는 보강 / 식당 = Gemini 생성>,
          "address": "<FULL = 활동 + 식당 모두 필수>",
          "lat": <number>, "lng": <number>,
          "price_eur": <활동 + 식당 모두 = € 1인 EUR = 1 가지만 = 2 인 가격 X = 활동 = 입장료/체험비 / 식당 = 식사비 / 무료 = 0>,
          "distance_from_prev_km": <number>,
          "transit_mode": "${transportMode}",
          "transit_min": <number>,
          "selection_reason_ko": <식당만 = 한국어 한 줄 = 사회적 검증 = → DB summary_ko>,
          "shortform_ko": <식당만 = 한국어 한 줄 = 코믹/위트 한국 슬랭 = → DB editorial_summary>
        }
      ]
    }
  ]
}

# 핵심 원칙
1. 입력 비식당 ${nonRestaurantCount} 곳 = 모두 응답 포함 (= 추가/제외 X). ⚠️ **예외 없음**.
2. 식당 = Google Search grounding 발견 + 7 필드 + 예산 이내.
3. 동선 = city_center 출발/귀환 + 자연 cluster + 최적 순서.
4. 교통 = transport_mode="${transportMode}" (= 2 분기 = public_transit / private_driver_guide 중 하나).
5. 식당 = 마지막 종착지 (= 저녁) + 일자 중간 (= 점심).
6. 응답 = JSON 만 (= markdown X).
7. ⚠️ **총 슬롯 = ${nonRestaurantCount + 2 * tc.day_count} 강제 + 슬롯 간 시각 연속 (= 갭 X)**.
```

### #04 · 도시 메타 백필 `fetchCityMetaFromGemini()`
- **파일**: `server/services/shared/gemini-city-meta.ts:22` · **상태**: live · **모델**: `gemini-3-flash-preview` (게이트웨이 경유)
- **프롬프트 원본**: 인라인 lines 23-46
- **설정 (verbatim)**: `geminiJson<any>(prompt, { googleSearch: true })` = grounding ON, mime 제거, temp 0.2, maxOut 50000, thinkingBudget 0. 검증 = `data.exists!==false && nameEn && latitude && longitude && countryCode` 모두 있어야 반환.
- **조건**: 신규 도시 자동 백필(city-resolver 5단계 = cities INSERT 직전). 입력 = 사용자가 친 도시명. ⚠️ 수정금지(승인필요) 2026-05-23.
- **verbatim 프롬프트**:
```
역할: 너는 도시 메타데이터 전문가야.

⚠️ 응답 근거 = **Google Search 그라운딩 기반** = 검증된 사실만 사용 = 추정/환각 금지.

목적: 사용자 입력 "${input}" 가 실제 존재하는 도시인지 판별 + 메타데이터 반환.

응답 (= JSON, 설명 X):
{
  "exists": true,
  "nameKo": "<한국 여행자 친숙 호칭 = 예 '피사'>",
  "nameEn": "<공식 영어명 = 예 'Pisa'>",
  "nameLocal": "<현지 원어명 = 예 'Pisa'>",
  "countryCode": "<ISO 2 문자 = 예 'IT'>",
  "country": "<국가 한국어 = 예 '이탈리아'>",
  "latitude": <도심 위도 6 자리 = 예 43.722840>,
  "longitude": <도심 경도 6 자리 = 예 10.401690>,
  "timezone": "<IANA = 예 'Europe/Rome'>",
  "primaryLanguage": "<ISO 2 문자 = 예 'it'>"
}

존재하지 않는 도시 = { "exists": false }

입력: "${input}"
```

### #05 · 메인앱 숏폼 시나리오 통합 (11-main-app-scenario, ⚠️ 현재 봉쇄=라이브 호출 0)
- **파일(SSOT)**: [`11-main-app-scenario/STANDARD_PROMPT_2026-05-25.md`](../fillcity/prompts/11-main-app-scenario/STANDARD_PROMPT_2026-05-25.md) · **상태**: reserved (= `/api/itineraries/:id/video/prompts` 봉쇄 = `generateScenarioPrompt` 예정 = 라이브 호출지점 0, grep 미발견) · **모델**: `gemini-3-flash-preview`
- **설정 (.md SSOT)**: temperature 0.3 / maxOutputTokens 50000 / thinkingBudget 0 / tools=[{googleSearch:{}}] / timeout 420000. (= 10-route가 이 시나리오에서 동선만 분리한 경량판 = 시나리오 카피 6필드는 여기 잔존)
- **조건**: 동선 + 숏폼 영상 24씬(1장소=1씬=6초) 통합 = 시나리오 카피(narration/visual_cue/subtitle/theme/transit_summary/protagonist_summary) 포함. 10-route는 이 6필드를 제거해 속도 단축한 분리판.
- **프롬프트 본문 (verbatim, ⚠️수정금지 2026-05-25)**:
```
# 역할
너는 한국인 여행자를 위한 ${formData.destination} 동선 + 숏폼 영상 시나리오 전문가다.

# 너의 강점
- Google Maps grounding = 실 도로 거리 + 동선 인근 식당 발견 + 정확 좌표/주소.
- Google Search grounding = 한국 인스타/유튜브 트렌드 + 실 가격.

# 목표
입력 ${places.length} 비식당 + 일자별 점심 + 저녁 식당 자동 발견 = 동선 + 1 장소 = 1 씬 = 6초 한국어 시나리오.

# 식당 자동 발견 + DB 백필
- 점심 = 일자 중간 + 그 시각 전후 활동 좌표 인근 + 1인 €${mealBudget.lunch} 이내 (= ${mealBudget.lunchLabel}).
- 저녁 = 일자 마지막 슬롯 = 일자 마지막 활동 좌표 인근 + 1인 €${mealBudget.dinner} 이내 (= ${mealBudget.dinnerLabel}).
- ⚠️ Gemini 발견 식당 = 4 필드 반드시 (= name_local / address / lat / lng / **price_eur = 1 인 EUR 1 가지만**).
- ⚠️ **price_for_2_eur 같은 2 인 가격 요청 X** (= Gemini 가 2 인 가격을 1 인 필드에 입력 위험 = 사용자 SSOT 2026-05-25 = 단위 모호 결함).
- 모두 Google Maps grounding 검증 = 환각 금지.

# 입력
${JSON.stringify(inputJson, null, 2)}

# Tone Sample (= forWhom="${formData.forWhom}" = ${focus.tone_ko})
${focus.sample_narration}
카메라 = ${focus.camera_subject}

# 출력 양식 (= JSON 만, no markdown wrappers)
{
  "total_duration_sec": <number>,
  "total_distance_km": <number>,
  "protagonist_summary_ko": "<주인공 한 줄 = ${companionGroup.label_ko} ${formData.ageDesc} 반영>",
  "days": [
    {
      "day": <number>, "theme_ko": "<10-15자>", "total_distance_km": <number>,
      "transit_summary_ko": "<${transportMode === 'private_driver_guide' ? "'전용 차량 가이드 N hop = N분'" : "'도보 N hop + 메트로/RER N분'"}>",
      "scenes": [
        {
          "slot": <number>, "time": "HH:MM", "type": "activity|restaurant",
          "place_id": <입력 활동 = 입력 id / 식당 = "auto-lunch-dN" 또는 "auto-dinner-dN">,
          "name_en": "<...>", "name_ko": "<...>", "name_local": "<...>",
          "address": "<FULL = 식당 필수>",
          "lat": <number>, "lng": <number>,
          "price_eur": <식당만 = € 1인 EUR = 1 가지만 = 2 인 가격 X>,
          "distance_from_prev_km": <number>,
          "transit_mode": "${transportMode === 'private_driver_guide' ? 'private_guide' : 'walk|metro|RER|bus'}",
          "transit_min": <number>,
          "visual_cue_ko": "<10-15자 = 카메라 + 분위기 = ${focus.camera_subject} 반영>",
          "narration_ko": "<6초 = 18-25 음절 + ${focus.tone_ko} + 슬랭 OK>",
          "subtitle_ko": "<10-15자 + 이모지 1>"
        }
      ]
    }
  ]
}

# 핵심 원칙
1. 입력 비식당 ${places.length} 곳 = 모두 응답 포함 (= 추가/제외 X).
2. 식당 = Google Maps grounding 발견 + 5 필드 + 예산 이내.
3. 동선 = city_center 출발/귀환 + 자연 cluster.
4. 교통 = transport_mode="${transportMode}" = ${transportMode === 'private_driver_guide' ? '모든 hop 전용 차량 가이드' : '도보 + 메트로 + RER + 버스 조합'}.
5. 페이스 = ${paceConfig.slotDurationMinutes}분/슬롯 × ${slotsPerDay}슬롯/일 = ${formData.travelPace}.
6. 시나리오 톤 = ${focus.tone_ko} + age "${formData.ageDesc}" + 슬랭 OK.
7. 응답 = JSON 만 (= markdown X).
```

## Gemini 스킬 발굴/큐레이션 도구 (#06~#09, prompt.txt 본문 verbatim 인라인) <!-- #10=13 삭제 2026-06-23 §19·§20 -->

> 공통 raw fetch: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}` / `tools=[{googleSearch:{}}]` (**grounding ON**) / `generationConfig={ temperature:0.2, maxOutputTokens:50000, responseMimeType:'application/json', thinkingConfig:{thinkingBudget:0} }` / `AbortSignal.timeout(420000)` / responseSchema 없음(prompt.txt 내부 JSON 계약). ⚠️ **단일관문 미통과(직접 fetch)**.

### #06 · 01 비식당 6카테고리 발굴 (discover-6cats)
- **파일**: `.claude/skills/.../01-discover-6cats/run.ts:73-90` · **상태**: live(but fillCity 미사용 = 12 TS 발굴로 대체) · **모델**: `gemini-3-flash-preview`
- **프롬프트 원본**: [`01-discover-6cats/prompt.txt`](../fillcity/prompts/01-discover-6cats/prompt.txt) (split('════')[2] 본문 / 치환 ${CITY_NAME} ${COUNTRY} ${CITY_LAT} ${CITY_LNG})
- **프롬프트 본문 (verbatim, ⚠️수정금지 v3 = 1글자 변경 금지)**:
```
You are a travel data assistant for KOREAN TRAVELERS.
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

CITY: ${CITY_NAME}
COUNTRY: ${COUNTRY}
CITY_CENTER: { lat: ${CITY_LAT}, lng: ${CITY_LNG} }
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

For each of the 6 categories below, return TOP 20 most famous places
ordered by KOREAN TRAVELERS' popularity (= 인스타 성지, 한국 블로그 빈도,
유튜브 vlog 등장 빈도 우선 = NOT Western tourist ranking).
(Note: restaurant category is intentionally excluded — separate prompt with price-tier classification.)

Categories:
1. heritage    — historical sites and museums
2. hotspot     — photogenic viewpoints, panoramic photo spots, rooftop and terraces
3. attraction  — tourist attractions (theme parks, zoos, aquariums)
4. adventure   — adventure places and activity spots
5. healing     — parks, gardens, peaceful nature spots
6. shopping    — shopping places and markets

For each place include:
- rank (1-20, Korean traveler popularity order)
- name_en (English official name)
- name_local (local language name, if different — for TS matching)
- name_ko (Korean name commonly used by Korean travelers)
- lat, lng (decimal degrees)
- address (FULL street address with NUMBER + street + postal code + city)
- selection_reason_ko (한국어 한 줄 = 한국 여행객 사이 트렌드 = 인스타 성지/최근 핫한 지역/한국 vlog 노출 빈도 등 사회적 검증 근거)
- shortform_ko (한국어 한 줄 = 장소에 대한 코믹/위트 있는 설명 = 감성/재미 후킹 카피 = Claude 톤. 단순 정보 X, 짧고 강하게)
- distance_km_from_center (haversine from CITY_CENTER, 1 decimal)
- day_zone: "core" if distance_km_from_center <= 10 (day 1 walkable from city center)
         OR "outskirt" if 10 < distance_km_from_center <= 100 (day 2+ day-trip required)
- price_eur (입장료 1인 EUR. 식당이면 1인당 평균. 무료=0. 확실하지 않으면 null. ⚠️ shopping 카테고리는 항상 null = 쇼핑은 1인당 가격 개념 없음)

OUTPUT (strict JSON, no markdown fences):
{
  "city": "${CITY_NAME}",
  "country": "${COUNTRY}",
  "center": { "lat": ${CITY_LAT}, "lng": ${CITY_LNG} },
  "radius_km": 100,
  "results": {
    "heritage":   [ ...20 items ],
    "hotspot":    [ ...20 items ],
    "attraction": [ ...20 items ],
    "adventure":  [ ...20 items ],
    "healing":    [ ...20 items ],
    "shopping":   [ ...20 items ]
  }
}
```
- **설정**: 위 공통 + batch 없음(도시 1콜) + 잘림복구 parse(). 기대 = results.{6cats} 각 20개=120.
- **조건**: CLI `--city-id=N [--dry]`. 입력 = cities(name_en/country/lat/lng). 산출 = docs/raw/{id}/01-*.json → post-process upsert.

### #07 · 02 장소 보강 큐레이션 (enrich-place) ⭐ 라이브 게이트웨이도 사용
- **파일(CLI)**: `.claude/skills/.../02-enrich-place/run.ts:68-93` · **파일(라이브)**: `server/services/shared/gemini-curate.ts:51` (`geminiCurate()`) · **상태**: live · **모델**: `gemini-3-flash-preview`
- **프롬프트 원본**: [`02-enrich-place/prompt.txt`](../fillcity/prompts/02-enrich-place/prompt.txt) (split(/═{30,}/)[2] 3번째 청크 / 치환 ${CITY_NAME} ${CITY_ID} ${YEAR} ${BATCH_LEN} ${JSON_INPUT})
- **프롬프트 본문 (verbatim, ⚠️수정금지 2026-05-18 + 2026-06-12 distance 추가 + 2026-06-16 6변경 + 2026-06-18 API_PASS = 1글자 변경 금지 = 실제 prompt.txt 와 동기화 2026-06-20)**:
```
${API_PASS}

역할: 너는 한국인 여행자를 위한 [CITY_NAME] 장소 정보 보강 전문가야.

⚠️ 응답 근거 = Google Search 그라운딩 기반 = ${YEAR}년 ${MONTH}월 현재 시점의 최신/검증된 사실 (= 가격/주소/한국어 호칭) 만 사용 = 추정/환각 금지.

목적: [CITY_NAME] (city_id=${CITY_ID}) 의 기존 장소 ${BATCH_LEN} 곳 = 누락 정보를 채우고 + 한국 관점 큐레이션을 작성한다.

입력 = 각 장소 = JSON (= id 는 우리 place_seed_raw.id = 응답 매칭 키)
  - id: number (= place_seed_raw.id = 응답에 정확히 매칭 필수)
  - name_local: string | null (= 현지 원어명 = 변경 X)
  - name_en: string | null
  - name_ko: string | null
  - address: string | null
  - latitude: number | null
  - longitude: number | null
  - google_place_id: string | null

응답 (= JSON 배열, 설명 텍스트 X):
{
  "places": [
    {
      "id": <입력 id 그대로 = place_seed_raw.id>,
      "name_local": "<현지 원어명 = 예 'Tour Eiffel' / 입력 있으면 검증 / 없으면 채움 = 변경 X>",
      "name_en": "<영어명 = 예 'Eiffel Tower' / 입력 있으면 검증 / 없으면 채움>",
      "name_ko": "<한국 여행자 친숙 호칭 = 예 '에펠탑' / 입력 있으면 검증 / 없으면 채움>",
      "address": "<번지 + 거리 + 우편번호 + 도시 + 국가 = 예 '5 Avenue Anatole France, 75007 Paris, France'>",
      "latitude": <위도 6 자리 = 예 48.858370>,
      "longitude": <경도 6 자리 = 예 2.294481>,
      "summary_ko": "<한 줄 숏폼 대사 = 인스타/FOMO 사회적 검증 = 한국어 25 자 이내>",
      "editorial_summary": "<한 줄 한국인 관점 선정 이유 = 코믹/위트 후킹 카피 = 한국어 35 자 이내>",
      "price_eur": <식당=1인 식대 / 그 외=실제 입장료 EUR 숫자 = 무료·입장료 없는 곳(광장·핫스팟 등) = 0>,
      "distance_km_from_center": <도심 중심으로부터 직선거리 km = haversine = 소수 1 자리 = 예 2.4>
    }
  ]
}

규칙:
1. 모든 입력 id = 응답에 정확히 포함 (= 누락 0) ← id = 우리 place_seed_raw.id = 매칭 키
2. name_local = 입력 그대로 유지 (= 변경 절대 X = 우리 매칭 키 = 원어명 보존) / name_en·name_ko = Google 기준 정확히 검증·보강 (= 추정 X)
3. 좌표 = 6 자리 소수 (= 예 48.858370, 2.294481)
4. address = 번지부터 국가까지 완전 (= 부분 주소 X)
5. summary_ko / editorial_summary = 한국어만 (= 영어 단어 혼용 X)
6. price_eur = 식당이면 1인 식대, 그 외 장소는 실제 입장료 = EUR 정수 (= 추정 생성 X). 무료·입장료 없는 장소(광장·거리·핫스팟 등) = 0.
7. distance_km_from_center = 도심 중심으로부터 직선거리 km (= haversine, 소수 1 자리, 필수)
8. 응답 = 위 JSON 만 (= 설명/주석/마크다운 X)

입력 ${BATCH_LEN} 장소:
${JSON_INPUT}
```
- **설정 (verbatim, ⚠️ 동기화 2026-06-23 = 선별 폐기 = 응답 전 필드 반환)**: `geminiJson(prompt, { googleSearch:true, apiKey })` = grounding ON. 배치 = FALLBACK `[120,60,40,20,10]` adaptive (size=120 시작 = 1콜 우선, `places.length===0 || missing>5` 시 축소 재시도. ⚠️ 옛 `[40,30,20,10]` = 처음부터 40씩 = 콜 多 폐기 §19 = gemini-curate.ts:15 정합). 입력 필드 = `{id, name_en, name_local, name_ko, address, latitude, longitude}` (**PID/URI·seed_category 미전달 = 환각 방지·가격 오염 방지**). **출력 = 응답 전 필드 11요소 = `{id, name_local, name_en, name_ko, address, latitude, longitude, summary_ko, editorial_summary, price_eur, distance_km_from_center}`** (= 옛 "출력 4요소" 선별 폐기 2026-06-20 = name_local·distance·address·좌표 누락 사고 = §19. Gemini만 주는 요소 name_local·distance·price 가 여기 다 실려 #45 가 새우선 덮어쓰기로 필수컬럼 자동완비). `${API_PASS}`·`${MONTH}` 동적 치환. 잘림복구 parsePlaces().
- **조건**: raw-db enrich 단계. CLI `--defects-only` = 4요소 결손행만. 라이브 = place_seed_raw 행 + cityName/cityId → upsertPlace 융합. ⚠️ 수정금지(승인필요) 2026-06-05 = tsSearch 대칭 관문.

#### 🔴 #07 의 두 번째 용도 = #1b 정제(cleanse) = "전체 행 재검증" (2026-06-23 사장님 SSOT)
> ⚠️ **#1b 정제는 새 프롬프트가 아니다 = 위 #07(02-enrich) prompt.txt 를 그대로 재사용**(§19 = 옛것 공존 안 만듦 = 프롬프트 1벌). **차이는 "어떤 행을 주느냐"뿐**:
- **#07 보충(curate)** = 결손행(빈칸 있는 행)만 추려 줌 → 빈칸 채움.
- **#1b 정제(cleanse)** = **그 도시 전체 행(BTS 제외)을 통째로** 줌 → Gemini 가 **행 전체를 보고** 재검증:
  - **가격 오염** 교정(박물관 €13만 = 옛 gemini3 환각 → 정상 입장료). = 위 prompt.txt 규칙 6(price_eur = 입장료/식대 EUR) 이 환각값을 정상값으로 덮음.
  - **이름 환각/칸 오입력** 교정(Magnificent Mile→Tate Modern, Atlanta→Manneken Pis). = 규칙 2(name_en·name_ko 정확 검증) + name_local 보존.
  - **결손 가격**도 채움. shopping price = 우리 저장단계 NULL 강제(§15).
- **= AI 가 "이 행이 오염인가" 패턴(price>200 등)으로 추리지 않음** = Gemini 가 행 전체 보고 판단(그라운딩 ON = 정확). 어떤 게 오염인지 SQL 로 거르는 것 = AI 임의 = 폐기(§19).
- **호출**: `geminiCurate(cityName, cityId, 전체행, { apiKey })` = 위와 같은 함수·같은 prompt.txt. 배치 = FALLBACK `[120,60,40,20,10]` = 도시당 1~2콜(120/콜). TS·PM 0(= Gemini 만).
- **구현체**: [`fillcity/cleanse.ts`](../fillcity/cleanse.ts) (전체행 SELECT → geminiCurate → id 직행 전필드 새덮어쓰기). fill-city `--only=cleanse`.
- **실증(2026-06-23)**: 런던 28·브뤼셀 16·뮌헨 17곳 정정. 최대 €504,210(뮌헨 박물관)→€175. 비식당 price>200 오염 = 0. = PRD §3-A 1단계.

### #08 · 05 식당 재검증 (restaurant-reverify)
- **파일**: `.claude/skills/.../05-restaurant-reverify/run.ts:59-92` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **프롬프트 원본**: [`05-restaurant-reverify/prompt.txt`](../fillcity/prompts/05-restaurant-reverify/prompt.txt) (split 78자 ══ [2] / 치환 ${YEAR} ${COUNT} ${INPUT_JSON})
- **프롬프트 본문 (verbatim, ⚠️수정금지 2026-06-01 = 1글자 변경 금지)**:
```
You are a restaurant data verifier for KOREAN TRAVELERS. ⚠️ AS OF ${YEAR} (현재 시점) — verify CURRENT status via Google Search grounding (Google Maps).
⚠️ 핵심: 각 식당이 ${YEAR}년 현재 **정상 영업 중**인지 Google Maps 에서 확인. 추정/환각 금지 = 검증된 사실만.
Return STRICT JSON array only (no markdown wrappers). Per restaurant, ONLY these fields:
- id (echo the given id)
- closure_status: 정확히 4 값 중 하나 (= Google Maps 현 상태):
    · "operating"           = ${YEAR} 현재 정상 영업 중
    · "temporarily_closed"  = 일시 휴업 (= 재개업 예정) = Google Maps "임시 휴업 / Temporarily closed"
    · "permanently_gone"    = 영구 폐업 + 같은 주소에 후속 식당 없음 = "폐업 / Permanently closed" + 빈 자리/타용도
    · "renamed"             = 폐업했으나 같은 주소에 **다른 이름의 새 식당**으로 바뀜 (= 리브랜드, 예: Hardware Société → BON JO)
  ⚠️ 불확실하거나 Google Maps 확인 불가 = "permanently_gone" (보수적).
- renamed_to: closure_status="renamed" 일 때만 = 같은 주소의 **새 식당 공식명** (예: "BON JO"); 그 외 = null
- name_local (Google Maps 공식 현지명. renamed 면 = 새 식당명 기준)
- address (FULL Google Maps address: number + street + postal code + city)
- lat, lng (Google Maps 좌표, decimal 6 자리; 못 찾으면 null)
- price_eur (1인당 평균 식사가 EUR, grounded; operating/renamed = 현(새) 식당 기준; 모르면 null)
INPUT (${COUNT} restaurants): ${INPUT_JSON}
OUTPUT (JSON array): [{"id":<n>,"closure_status":"operating|temporarily_closed|permanently_gone|renamed","renamed_to":<str|null>,"name_local":"..","address":"..","lat":<n|null>,"lng":<n|null>,"price_eur":<n|null>}]
```
- **설정**: 공통 + 재시도 attempt 1~3(3000ms 대기) + batch 40. parseArr 배열|{results:[]} / `closure_status` 필드(operating 외=폐업후보).
- **조건**: CLI `--city-id=N [--year] [--batch] [--ids]`. 입력 = seed_category='restaurant' AND NOT(PID+URI 보유) = TS 미검증 식당. --ids = 폐업후보 재분류.

### #09 · 05 텍스트 기반 재분류 (text-recategorize) ⚠️ 원본 폴더 05 번호충돌
- **파일**: `.claude/skills/.../05-text-recategorize/run.ts:60-115` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **프롬프트 원본**: [`05-text-recategorize/prompt.txt`](../fillcity/prompts/05-text-recategorize/prompt.txt) (split('════')[2] / 치환 ${CITY_NAME} ${CITY_ID} ${BATCH_LEN} ${JSON_INPUT})
- **프롬프트 본문 (verbatim, ⚠️수정금지 2026-05-23 = 01 카테고리 정의와 1글자 일치 강제)**:
```
역할: 너는 한국인 여행자 장소 DB 의 카테고리 정정 전문가야.

⚠️ 응답 근거 = **입력 묘사 텍스트 (summary_ko + editorial_summary)** 만 사용 = 외부 검색/추정 금지.

목적: ${CITY_NAME} (city_id=${CITY_ID}) 의 활성 장소 ${BATCH_LEN} 곳 = 각 행의 묘사 분석 후 = **현재 seed_category vs 적정 카테고리** 비교 → 정정 후보 list 응답.

카테고리 정의 (= 시드 발굴 SSOT 01-discover-6cats/prompt.txt:22-27 와 동일 = 7 종):
- heritage: 역사 건축 + 박물관 / 미술관 (= historical sites AND museums) = 궁/성/교회/대성당/수도원/모뉴먼트 + 모든 박물관/미술관
- hotspot: 사진 명소 + 뷰포인트 + 루프탑·테라스 + 광장 + 다리 + 힙한 거리 + 카페 (= 카페가 명소 의미일 때)
- attraction: 놀이공원 + 동물원 + 수족관 + 타워 + 명소 (= theme parks/zoos/aquariums)
- adventure: 액티비티 + 스릴 + 모험 + 영화관 + 스포츠
- healing: 공원 + 정원 + 온천 + 스파 + 숲 + 자연 휴양 + 숙소 (= 호텔)
- shopping: 매장 + 마켓 + 백화점 + 콘셉트 스토어
- restaurant: 식당 + 카페 + 베이커리 + 파티세리 + 디저트가게 + 바

⚠️ 판단 원칙 (= 사용자 SSOT):
1. **묘사 99% 정확** = summary_ko + editorial_summary 의 단어 = 가장 신뢰
2. **이름** (= name_en) = 보조 단서 (= "Café"/"Restaurant" 단어 우선 restaurant)
3. **현재 카테고리** = 옛 분류 = 의심 가능 (= 묘사와 다르면 정정)
4. **호텔** (= healing 안 호텔) = 사용자 SSOT B2 = healing 유지 (= 별도 accommodation 카테고리 X)

입력 = 각 행 = JSON (= id 는 매칭 키):
  - id: number
  - current_category: string (= 현재 seed_category)
  - name_en: string
  - name_local: string | null
  - summary_ko: string | null
  - editorial_summary: string | null
  - address: string | null

응답 (= JSON 배열, 설명 텍스트 X):
{
  "recategorize": [
    {
      "id": <id>,
      "current_category": "<옛 카테고리>",
      "suggested_category": "<적정 카테고리 = 7 종 중 1>",
      "confidence": <0.0 ~ 1.0>,
      "reason_ko": "<한국어 한 줄 = 묘사 인용 + 판단 근거>"
    }
  ]
}

규칙:
1. **정정 후보만 응답** = current == suggested = 응답 안 포함 (= 변경 없음)
2. confidence < 0.7 = 응답 안 포함 (= 명확한 경우만)
3. 모든 입력 id 분석 = 정정 후보만 응답 = 사용자 검수 후 트랜잭션 적용

입력 ${BATCH_LEN} 장소:
${JSON_INPUT}
```
- **설정**: 공통 + batch **100** + parseRecat `{recategorize:[...]}`.
- **조건**: CLI `--city-id=N [--batch=100]`. 입력 = (summary_ko OR editorial_summary 있는 행) = 묘사로 카테고리 오분류 정정. ⚠️ AI 자율 트랜잭션 X = 사용자 cc2 검수 후 post-process --apply.

> #10(13 식당 요약+가격) = 삭제됨 (2026-06-23 §19·§20 = #45 결손보강 WF 가 흡수 = 중복).

## Gemini 드림스튜디오 (#11~#18, `server/gemini.ts`) — 단일관문 미통과 (독자 GoogleGenAI, apiKey 직접)

### #11 · 페르소나 스크립트 `generatePersonaScript()`
- **파일**: `server/gemini.ts:13` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **설정 (verbatim)**: `config = { responseMimeType:"application/json", responseSchema:{ type:"object", properties:{ text, persona, mood (string) }, required:["text","persona","mood"] } }`. temperature 미지정. tools 없음. contents = [inlineData(imageBase64, image/jpeg), instruction+persona]. voiceName ko:Kore/en:Puck/ja:Aoede/zh:Charon.
- **조건**: 이미지 base64 + language(기본 ko) + persona? → 이미지 주인공 1인칭 대사.
- **verbatim 프롬프트** (언어별 instruction):
```
[ko.instruction]
당신은 이 이미지 속 주인공(음식, 건물, 예술품, 풍경 등)입니다.
1인칭 시점으로 자신을 소개하고 이야기를 들려주세요.
15-30초 분량(한국어 80-120자)으로 감정이 담긴 대사를 작성하세요.

예시:
- 와인: "안녕, 나는 1892년 보르도에서 태어났어. 130년 동안 이 지하 저장고에서..."
- 에펠탑: "파리의 밤하늘 아래, 나는 매일 수백만 개의 불빛으로 반짝이지..."
- 초밥: "나는 오늘 아침 츠키지 시장에서 갓 잡힌 참치야..."

JSON 형식으로 응답:
{
  "text": "1인칭 대사",
  "persona": "피사체 정체 (와인병, 에펠탑 등)",
  "mood": "분위기 (nostalgic, proud, mysterious, cheerful 등)"
}

[en.instruction]
You are the subject in this image (food, building, artwork, landmark, etc).
Introduce yourself in first person and tell your story.
Write an emotional 15-30 second monologue (80-120 words).

Examples:
- Wine: "Hello, I was born in Bordeaux in 1892. For 130 years in this cellar..."
- Eiffel Tower: "Under the Paris night sky, I sparkle with millions of lights..."
- Sushi: "I'm the freshest tuna from Tsukiji market this morning..."

Respond in JSON:
{
  "text": "first person monologue",
  "persona": "identity (wine bottle, Eiffel Tower, etc)",
  "mood": "mood (nostalgic, proud, mysterious, cheerful, etc)"
}

[ja.instruction]
あなたはこの画像の主人公です（食べ物、建物、芸術品、風景など）。
一人称で自己紹介し、物語を語ってください。
15-30秒分（80-120文字）の感情的なモノローグを書いてください。

JSON形式で回答:
{
  "text": "一人称のセリフ",
  "persona": "被写体の正体",
  "mood": "雰囲気"
}

[zh.instruction]
你是这张图片中的主角（食物、建筑、艺术品、风景等）。
用第一人称介绍自己并讲述你的故事。
写一段15-30秒的独白（80-120字）。

以JSON格式回复:
{
  "text": "第一人称独白",
  "persona": "主体身份",
  "mood": "氛围"
}

[contents 두번째 part]
langConfig.instruction + (persona ? `\n지정된 페르소나: ${persona}` : '')
```

### #12 · 페르소나 TTS `generatePersonaVoice()`
- **파일**: `server/gemini.ts:128` · **상태**: live · **모델**: `gemini-2.5-flash-preview-tts` (유일 비 flash-preview)
- **설정 (verbatim)**: `config = { responseModalities:[Modality.AUDIO], speechConfig:{ voiceConfig:{ prebuiltVoiceConfig:{ voiceName } } } }`. voiceName 기본 'Kore'. mood 기본 'cheerful'. 응답 = parts[0].inlineData → {audioBase64, mimeType}.
- **조건**: text + voiceName + mood → TTS. generatePersonaScript 대사 변환.
- **verbatim 프롬프트**:
```
[moodInstructions]
nostalgic: 'Speak with a warm, nostalgic tone, as if reminiscing about cherished memories.'
proud: 'Speak with pride and confidence, celebrating your history and significance.'
mysterious: 'Speak with an enigmatic, intriguing tone that draws listeners in.'
cheerful: 'Speak with a bright, welcoming tone full of enthusiasm.'
peaceful: 'Speak with a calm, serene voice that brings tranquility.'
dramatic: 'Speak with theatrical intensity and emotional depth.'

[fullPrompt]
${moodPrompt}

Say the following:
"${text}"
```

### #13 · 위치기반 가이드 콘텐츠 `generateLocationBasedContent()`
- **파일**: `server/gemini.ts:203` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **설정 (verbatim)**: `config = { systemInstruction: systemPrompt, responseMimeType:"application/json", responseSchema:{ properties:{ title, description, tips(array), culturalNotes, bestTimeToVisit, accessibility }, required:["title","description","tips"] } }`. **systemInstruction 사용 유일 호출**. contents = [inlineData(image), user텍스트].
- **조건**: 이미지 + locationInfo + language → 가이드 콘텐츠.
- **verbatim 프롬프트**:
```
[systemPrompt]
You are a professional travel guide content creator. 
Analyze the provided image and location information to create detailed, accurate guide content.
Location: ${locationInfo.locationName || `${locationInfo.latitude}, ${locationInfo.longitude}`}
Respond in ${targetLanguage} with JSON format:
{
  "title": "string - catchy, descriptive title",
  "description": "string - detailed description of the place",
  "tips": ["string array - practical tips for visitors"],
  "culturalNotes": "string - cultural significance or background",
  "bestTimeToVisit": "string - optimal visiting times",
  "accessibility": "string - accessibility information"
}

[user contents 두번째 part]
Create a comprehensive travel guide for this location. 
Location coordinates: ${locationInfo.latitude}, ${locationInfo.longitude}
${locationInfo.locationName ? `Location name: ${locationInfo.locationName}` : ''}

Please provide accurate, helpful information that would be valuable for travelers visiting this place.
```

### #14 · 공유링크 설명 `generateShareLinkDescription()`
- **파일**: `server/gemini.ts:304` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **설정**: config 없음 = **평문 텍스트 응답**(mime/schema 미지정). contents=prompt. 반환 = response.text || 폴백.
- **verbatim 프롬프트**:
```
Create an engaging description for a shared travel guide collection in ${targetLanguage}.
Collection name: ${linkName}
Included locations:
${guideDescriptions}

Create a compelling description that would entice people to explore these locations.
```

### #15 · 드림샷 영화급 프롬프트 `generateCinematicPrompt()`
- **파일**: `server/gemini.ts:343` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **설정 (verbatim)**: `config = { responseMimeType:"application/json", responseSchema:{ properties:{ imagePrompt, audioScript, mood(enum:["cinematic","commercial","documentary","artistic"]), lighting(enum:["golden-hour","natural","studio","dramatic"]), angle(enum:["close-up","medium-shot","wide-shot","aerial"]) }, required:[5] } }`. **enum 제약 사용**.
- **verbatim 프롬프트**:
```
당신은 세계적인 여행 사진작가이자 영화감독입니다.

원본 여행 정보:
- 장소: ${originalGuide.locationName || originalGuide.title}
- 설명: ${originalGuide.description}
- 위도/경도: ${originalGuide.latitude}, ${originalGuide.longitude}

다음 조건으로 영화급 이미지를 위한 상세한 프롬프트를 생성해주세요:
- 분위기: ${userPreferences.mood || 'adventure'}
- 스타일: ${userPreferences.style || 'movie'}
- 시간대: ${userPreferences.timeOfDay || 'golden-hour'}

출력 형식 (JSON):
{
  "imagePrompt": "상세한 이미지 생성 프롬프트 (영문, 200자 이상)",
  "audioScript": "감정적이고 매력적인 한국어 내레이션 스크립트 (50-100자)",
  "mood": "cinematic/commercial/documentary/artistic 중 하나",
  "lighting": "golden-hour/natural/studio/dramatic 중 하나", 
  "angle": "close-up/medium-shot/wide-shot/aerial 중 하나"
}

핵심 요구사항:
1. 사용자가 주인공이 되어 그 장소에 있는 것처럼 자연스럽게
2. 영화나 광고 같은 프로페셔널한 구도와 조명
3. 해당 여행지의 특색과 문화가 드러나게
4. 감정적으로 몰입할 수 있는 스토리텔링
```

### #16 · 음성 스크립트 최적화 `optimizeAudioScript()`
- **파일**: `server/gemini.ts:425` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **설정**: config 없음 = **평문 텍스트**. targetEmotion 기본 'inspiring'(enum excited|peaceful|inspiring|nostalgic). 반환 = text.trim() || originalScript.
- **verbatim 프롬프트**:
```
당신은 전문 성우이자 여행 콘텐츠 전문가입니다.

원본 스크립트: "${originalScript}"
목표 감정: ${targetEmotion}

다음 조건으로 음성 녹음에 최적화된 스크립트로 개선해주세요:
1. 자연스러운 한국어 발음과 리듬감
2. ${targetEmotion} 감정이 잘 드러나는 톤
3. 15-30초 분량 (80-120자)
4. 여행의 감동과 스토리가 담긴 내용
5. 사용자가 직접 말하기 쉬운 문장 구조

개선된 스크립트만 출력해주세요:
```

### #17 · 텍스트 분석+대사 `analyzeTextAndGenerateScript()`
- **파일**: `server/gemini.ts:472` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **설정 (verbatim)**: `config = { responseMimeType:"application/json", responseSchema:{ properties:{ category, categoryKo, persona, protagonist, mood, script, keywords(array), videoPrompt, useOriginalImage(boolean) }, required:[9] } }`. charCount = duration<=8?'40-60':duration<=15?'80-100':'100-120'. contents=prompt(텍스트만). description 최대 1000자 truncate.
- **verbatim 프롬프트**:
```
당신은 콘텐츠 분석 및 AI 영상 제작 전문가입니다.
다음 설명을 분석하고 1인칭 시점의 ${duration}초 분량(${charCount}자) 한국어 대사를 작성하세요.

[분석할 설명]
"${description.substring(0, 1000)}"

═══════════════════════════════════════
📌 카테고리 분류 기준 (반드시 준수):
═══════════════════════════════════════
- artwork: 그림, 회화, 조각상, 예술작품, 박물관 전시품, 미술관 작품, 동상, 석상, 스핑크스, 피라미드 벽화
  → 🎯 주인공: 작품 자체 또는 작품 속 인물/피사체 (원본 이미지 사용)
  → 예: 스핑크스 → "스핑크스 석상", 모나리자 → "모나리자", 다비드상 → "다비드 석상"
  
- landmark: 건물, 유적지, 자연명소, 도시풍경, 관광지, 거리
  → 🎯 주인공: 여행 가이드 (아바타가 배경 앞에서 설명)

- food_drink: 음식, 와인, 술, 카페, 레스토랑, 요리
  → 🎯 주인공: 여행 가이드 (아바타가 배경 앞에서 설명)

═══════════════════════════════════════
📌 작업 순서:
═══════════════════════════════════════
1. 위 기준으로 카테고리 분류
2. 핵심 키워드 3-5개 추출
3. 페르소나 정의 (예: 모나리자, 에펠탑, 100년 된 와인 등)
4. 🎯 주인공(protagonist) 명시: artwork면 피사체 명칭, 그 외면 "여행 가이드"
5. 분위기 선정 (nostalgic, proud, mysterious, cheerful, peaceful, dramatic)
6. 1인칭 한국어 대사 작성 - 주인공이 직접 말하는 형식
7. 영상 제작 프롬프트 작성 (영어로)

⚠️ 중요: 대사는 반드시 한국어로 작성하세요!
⚠️ 금지 단어 (AI 정책 위반): 혁명, 전쟁, 폭력, 무기, 총, 칼, 피, 죽음, 살인, 시위, 폭동, 테러

JSON 형식으로 응답:
{
  "category": "artwork 또는 landmark 또는 food_drink",
  "categoryKo": "작품/유적지/음식및술",
  "persona": "피사체 정체 (한국어)",
  "protagonist": "영상에서 말하는 주인공 - artwork면 피사체명(예: 스핑크스 석상), 그 외면 여행 가이드",
  "mood": "분위기",
  "script": "한국어 1인칭 대사 (${charCount}자)",
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "videoPrompt": "영어 영상 프롬프트: artwork면 'The [persona] speaks with gentle expression, subtle movements' / 그 외면 'Tour guide explains with friendly gestures in front of the background'",
  "useOriginalImage": true/false (artwork면 true, 그 외면 false)
}
```

### #18 · 이미지 분석+대사 `analyzeImageAndGenerateScript()`
- **파일**: `server/gemini.ts:585` · **상태**: live · **모델**: `gemini-3-flash-preview`
- **설정**: A4-7과 동일 schema. contents = [inlineData(image), prompt]. (텍스트 차이: '초상화','다리','디저트' 추가)
- **verbatim 프롬프트**:
```
당신은 이미지 분석 및 AI 영상 제작 전문가입니다.
이 이미지를 분석하고 1인칭 시점의 ${duration}초 분량(${charCount}자) 한국어 대사를 작성하세요.

═══════════════════════════════════════
📌 카테고리 분류 기준 (반드시 준수):
═══════════════════════════════════════
- artwork: 그림, 회화, 조각상, 예술작품, 박물관 전시품, 미술관 작품, 초상화, 동상, 석상, 스핑크스
  → 🎯 주인공: 작품 자체 또는 작품 속 인물/피사체 (원본 이미지 사용)
  → 예: 스핑크스 → "스핑크스 석상", 모나리자 → "모나리자", 다비드상 → "다비드 석상"
  
- landmark: 건물, 유적지, 자연명소, 도시풍경, 관광지, 거리, 다리
  → 🎯 주인공: 여행 가이드 (아바타가 배경 앞에서 설명)

- food_drink: 음식, 와인, 술, 카페, 레스토랑, 요리, 디저트
  → 🎯 주인공: 여행 가이드 (아바타가 배경 앞에서 설명)

═══════════════════════════════════════
📌 작업 순서:
═══════════════════════════════════════
1. 이미지를 보고 위 기준으로 카테고리 분류
2. 핵심 키워드 3-5개 추출
3. 페르소나 정의 (이미지 속 주인공)
4. 🎯 주인공(protagonist) 명시: artwork면 피사체 명칭, 그 외면 "여행 가이드"
5. 분위기 선정 (nostalgic, proud, mysterious, cheerful, peaceful, dramatic)
6. 1인칭 한국어 대사 작성 - 주인공이 직접 말하는 형식
7. 영상 제작 프롬프트 작성 (영어로)

⚠️ 중요: 대사는 반드시 한국어로 작성하세요!
⚠️ 금지 단어 (AI 정책 위반): 혁명, 전쟁, 폭력, 무기, 총, 칼, 피, 죽음, 살인, 시위, 폭동, 테러

JSON 형식으로 응답:
{
  "category": "artwork 또는 landmark 또는 food_drink",
  "categoryKo": "작품/유적지/음식및술",
  "persona": "피사체 정체 (한국어)",
  "protagonist": "영상에서 말하는 주인공 - artwork면 피사체명(예: 스핑크스 석상), 그 외면 여행 가이드",
  "mood": "분위기",
  "script": "한국어 1인칭 대사 (${charCount}자)",
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "videoPrompt": "영어 영상 프롬프트: artwork면 'The [persona] speaks with gentle expression, subtle movements' / 그 외면 'Tour guide explains with friendly gestures in front of the background'",
  "useOriginalImage": true/false (artwork면 true, 그 외면 false)
}
```

## Gemini BTS / seed / 레거시 / 테스트 (#19~#25)

### #19 · BTS 동선 최적화 `optimizeBTSRoute()`
- **파일**: `server/services/bts-gemini.ts:79` · **상태**: legacy · **모델**: `gemini-2.0-flash`
- **설정**: `gemini.models.generateContent({ model, contents:prompt })` — generationConfig/temperature/responseSchema/tools 없음. JSON 배열 계약(text.match(/\[[\s\S]*\]/)). 독자 getAI. API키 없으면 fallbackOptimization(09:30~21:30 고정).
- **verbatim 프롬프트**:
```
You are a travel route optimizer for ${cityName}.
A "${characterName}" style traveler selected these places:

${placeList}

Optimize the visit order for:
1. Minimal travel time between places
2. Appropriate meal timing (lunch around 12:00-13:00, dinner around 18:00-19:00)
3. Opening hours consideration (museums usually 10-18, restaurants 11-22)

Respond in JSON array format only, no explanation:
[{
  "id": <place id>,
  "suggestedOrder": <1-based order>,
  "startTime": "<HH:MM>",
  "endTime": "<HH:MM>",
  "estimatedDuration": "<e.g. 1.5h>",
  "travelTip": "<one short tip in Korean, max 30 chars>"
}]
```

### #20 · seed enrich `enrichPlaceByGemini` (파리 DB-only Step1)
- **파일**: `server/services/seed/enrich-place.ts:174` · **상태**: live · **모델**: `gemini-3-flash-preview` (게이트웨이 경유)
- **설정 (verbatim)**: `geminiJson(prompt, { googleSearch:true })` = grounding ON, 기본값(temp 0.2/maxOut 50000/thinkingBudget 0). 응답 = {places:[{id, name_en, name_local, name_ko, address, lat, lng, summary_ko, editorial_summary, price_eur}]}. dryRun 기본 true. 주석상 adaptive 40→30→20→10.
- **조건**: cityId(19=Paris) 활성 행 batch(40) → upsertPlace 1차 덮어쓰기(shopping=price null). 헌법 §14/§16 준수.
- **verbatim 프롬프트**:
```
역할: 너는 한국인 여행자를 위한 파리 장소 정보 보강 전문가야.

⚠️ 응답 근거 = **Google Search 그라운딩 기반** = 최신/검증된 사실 (= 가격/주소/한국어 호칭) 만 사용 = 추정/환각 금지.

목적: 파리 (city_id=19) 의 기존 장소 ${input.length} 곳 = 누락 정보를 채우고 + 한국 관점 큐레이션을 작성한다.

입력 = 각 장소 = JSON (= id 는 우리 place_seed_raw.id = 응답 매칭 키)
  - id: number (= place_seed_raw.id = 응답에 정확히 매칭 필수)
  - name_en: string (= 공식 영어명 = 변경 X)
  - name_local: string | null
  - name_ko: string | null
  - address: string | null
  - latitude: number | null
  - longitude: number | null
  - google_place_id: string | null
  - seed_category: 'restaurant'|'attraction'|'healing'|'adventure'|'hotspot'|'heritage'|'shopping'

응답 (= JSON 배열, 설명 텍스트 X):
{
  "places": [
    {
      "id": <입력 id 그대로 = place_seed_raw.id>,
      "name_en": "<입력 그대로 = 변경 X>",
      "name_local": "<현지 원어명 = 예 'Tour Eiffel' / 입력 있으면 검증 / 없으면 채움>",
      "name_ko": "<한국 여행자 친숙 호칭 = 예 '에펠탑' / 입력 있으면 검증 / 없으면 채움>",
      "address": "<번지 + 거리 + 우편번호 + 도시 + 국가 = 예 '5 Avenue Anatole France, 75007 Paris, France'>",
      "latitude": <위도 6 자리 = 예 48.858370>,
      "longitude": <경도 6 자리 = 예 2.294481>,
      "summary_ko": "<한 줄 숏폼 대사 = 인스타/FOMO 사회적 검증 = 한국어 25 자 이내>",
      "editorial_summary": "<한 줄 한국인 관점 선정 이유 = 코믹/위트 후킹 카피 = 한국어 35 자 이내>",
      "price_eur": <1인 입장료 또는 평균 식대 EUR 숫자 = shopping 은 null>
    }
  ]
}

규칙:
1. 모든 입력 id = 응답에 정확히 포함 (= 누락 0) ← id = 우리 place_seed_raw.id = 매칭 키
2. name_en = 입력 그대로 (= 변경 절대 X = 매칭 키)
3. 좌표 = 6 자리 소수 (= 예 48.858370, 2.294481)
4. address = 번지부터 국가까지 완전 (= 부분 주소 X)
5. summary_ko / editorial_summary = 한국어만 (= 영어 단어 혼용 X)
6. price_eur = shopping 카테고리 = null 강제 / 그 외 = 합리적 EUR 정수
7. 응답 = 위 JSON 만 (= 설명/주석/마크다운 X)

입력 ${input.length} 장소:
${JSON.stringify(input, null, 2)}
```

### #21 · SEED v3 6카테고리 (scripts/seed-gemini.mjs STEP1)
- **파일**: `scripts/seed-gemini.mjs:209` · **상태**: legacy (§16 위반 1회용 mjs) · **모델**: `gemini-3-flash-preview`
- **설정**: REST 직접 fetch + tools=[{googleSearch:{}}] + generationConfig{temp 0.2, maxOut 50000, thinkingBudget 0}. AbortSignal.timeout(420000). 비용식 promptToken*0.075/1e6 + candidatesToken*0.30/1e6.
- **verbatim 프롬프트**:
```
You are a travel data assistant for KOREAN TRAVELERS.
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

CITY: ${CITY_NAME}
COUNTRY: ${COUNTRY}
CITY_CENTER: { lat: ${CITY.lat}, lng: ${CITY.lng} }
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

For each of the 6 categories below, return TOP 20 most famous places
ordered by KOREAN TRAVELERS' popularity (= 인스타 성지, 한국 블로그 빈도,
유튜브 vlog 등장 빈도 우선 = NOT Western tourist ranking).
(Note: restaurant category is intentionally excluded — separate prompt with price-tier classification.)

Categories:
1. heritage    — historical sites and museums
2. hotspot     — photogenic viewpoints, panoramic photo spots, rooftop and terraces
3. attraction  — tourist attractions (theme parks, zoos, aquariums)
4. adventure   — adventure places and activity spots
5. healing     — parks, gardens, peaceful nature spots
6. shopping    — shopping places and markets

For each place include:
- rank (1-20, Korean traveler popularity order)
- name_en (English official name)
- name_local (local language name, if different — for TS matching)
- name_ko (Korean name commonly used by Korean travelers)
- lat, lng (decimal degrees)
- address (FULL street address with NUMBER + street + postal code + city)
- selection_reason_ko (한국어 한 줄 = 한국 여행객 사이 트렌드 = 인스타 성지/최근 핫한 지역/한국 vlog 노출 빈도 등 사회적 검증 근거)
- shortform_ko (한국어 한 줄 = 장소에 대한 코믹/위트 있는 설명 = 감성/재미 후킹 카피 = Claude 톤. 단순 정보 X, 짧고 강하게)
- distance_km_from_center (haversine from CITY_CENTER, 1 decimal)
- day_zone: "core" if distance_km_from_center <= 10 (day 1 walkable from city center)
         OR "outskirt" if 10 < distance_km_from_center <= 100 (day 2+ day-trip required)
- price_eur (입장료 1인 EUR. 식당이면 1인당 평균. 무료=0. 확실하지 않으면 null. ⚠️ shopping 카테고리는 항상 null = 쇼핑은 1인당 가격 개념 없음)

OUTPUT (strict JSON, no markdown fences):
{
  "city": "${CITY_NAME}",
  "country": "${COUNTRY}",
  "center": { "lat": ${CITY.lat}, "lng": ${CITY.lng} },
  "radius_km": 100,
  "results": {
    "heritage":   [ ...20 items ],
    "hotspot":    [ ...20 items ],
    "attraction": [ ...20 items ],
    "adventure":  [ ...20 items ],
    "healing":    [ ...20 items ],
    "shopping":   [ ...20 items ]
  }
}
```

### #22 · admin API 키 테스트 — **모델**: `gemini-2.5-flash` · `server/admin-routes.ts:648` · status=tool
- 프롬프트 = `Say 'API test successful' in Korean` (헬스체크). generationConfig 없음.

### #23 · test_gemini.ts / test_trip.ts — **모델**: `gemini-2.5-flash` · status=reference (1회용 테스트)
- 동일 고정 프롬프트: `2026 2월25일 오전10시부터 2026 2월27일 16시까지 프랑스 파리. 아이들 2명을 위한 모험적인 곳과 명소 (구글 리뷰 상위순). 식사는 한국인 입맛에 맞는 합리적 비용의 프랑스 현지식. 소요시간/이동시간/예상비용(EUR) 포함` (출력만 파일 vs console 차이)

### #24 · test-crisis.js — **모델**: `gemini-1.5-flash` (옛 SDK @google/generative-ai) · status=reference
- 프롬프트 = `Say "Hello, NUBI!" in Korean.` (헬스체크)

### #25 · vibetrip 원본 `generateItinerary` — `reference/vibetrip-original/services/geminiService.ts:32` · status=reference · **모델**: `gemini-3-flash-preview`
- **설정 (verbatim)**: `config = { systemInstruction:"당신은 한국어만 사용하는 고정밀 여행 스케줄러입니다.", responseMimeType:"application/json", tools:[{googleSearch:{}}], maxOutputTokens:4000, thinkingConfig:{thinkingBudget:1500} }`. **thinkingBudget=1500(유일 비0), maxOut=4000.**
- **verbatim 프롬프트**:
```
당신은 세계 최고의 고정밀 여행 에이전트입니다.
  **중요: 반드시 모든 응답(summary 포함)은 한국어로만 작성하세요.**

  [미션]
  ${destination} 여행을 위한 렌터카식 정밀 시간표를 작성하세요.
  - 시작일: ${startDate}, 종료일: ${endDate}
  - 동행: ${companion.type} (${companion.detail.ages.join(',')}세 포함)
  - 가중치: ${priority}, 감성: ${vibes.join(', ')}

  [데이터 무결성 규칙]
  1. 각 장소의 'startTime', 'endTime'은 HH:mm 형식으로 촘촘하게 배치하세요.
  2. 'lat', 'lng' 좌표는 구글 맵 마커 생성을 위해 실제 위치와 일치해야 합니다.
  3. 'summary'는 해당 날짜의 전체 흐름을 한국어로 3문장 이내 요약하세요.
  4. 'realityCheck'는 googleSearch를 통해 실제 해당 날씨와 운영 여부를 확인한 결과여야 합니다.
```

---

# B. TS (Google Places) 호출 (18곳)

## TS 게이트웨이 + 융합 백필 (#26~#29, `ts-client.ts` = 진본 관문)

### #26 · `tsSearch()` — 모든 Places 검색 단일 진입점
- **파일**: `server/services/shared/ts-client.ts:81` · **상태**: live
- **엔드포인트**: `isNearby ? places:searchNearby : places:searchText`. method = req.method.
- **헤더 (verbatim)**: `'Content-Type':'application/json', 'X-Goog-Api-Key':req.apiKey, 'X-Goog-FieldMask': STANDARD_TS_FIELD_MASK`(= 9요소, 모듈로드 시 REQUIRED_9 결손검사 + validateFieldMask Atmosphere throw).
- **body (verbatim)**:
  - searchText: `{ textQuery, pageSize:cap, languageCode, [regionCode], [priceLevels], ...loc }`. cap=`min(maxResults ?? 20, 60)`.
  - searchNearby: `{ includedTypes:req.includedTypes||['restaurant'], maxResultCount:cap, rankPreference:'POPULARITY', languageCode, [regionCode], ...loc }`. cap=`min(maxResults ?? 20, 20)`. **rankPreference 고정 POPULARITY**.
  - textQuery = `req.textQuery ?? (hasCoord ? (nameLocal||'') : [nameLocal,address].filter(Boolean).join(' '))`.
  - languageCode = `req.languageCode || 'ko'`.
  - **범위(loc) 우선순위**: (1) rectangleKm+좌표 → locationRestriction.rectangle (latD=km/111, lngD=km/(111·cos)); (2) nearby+circleRadiusM → locationRestriction.circle radius=min(50000,m); (3) anchorRadiusM → locationBias.circle radius=anchorRadiusM(동명 차단); (4) circleRadiusM → locationBias.circle min(50000,m).
- **응답 매핑**: 9요소 → TsPlace (PID/nameLocal/address/lat/lng/RC/priceEur(=priceRange.endPrice.units)/photoName/mapsUri/businessStatus). **rating 제외**.
- **조건**: 앱 전체 모든 Places 검색 유일 진입점. 호출자 = ts-backfill, ts-photo-fill, 06, gemini-curate(아님 — gemini), ag3(아님 — 우회). timeout 30000.

### #27 · `tsPhoto()` — PhotoMedia → Supabase Storage 단일 진입점
- **파일**: `server/services/shared/ts-client.ts:129` · **상태**: live
- **호출1 (verbatim)**: `GET https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx ?? 800}&key=${apiKey}`. timeout 30000. FieldMask 없음(미디어).
- **호출2 (verbatim)**: `PUT ${supaPublicUrl}/storage/v1/object/${bucket}/${pathKey}.jpg` (bucket 기본 'place-images'), headers `{ Authorization: Bearer ${storageKey}, 'Content-Type':'image/jpeg', 'x-upsert':'true' }`. 반환 = public URL.
- **조건**: 모든 사진 다운+저장 유일 진입점. 호출자 = ts-photo-fill, 06 post-process.

### #28 · `ts-backfill.ts` — PID 없는 행 TS 재검증·보강
- **파일**: `server/services/fill/ts-backfill.ts:60` · **상태**: live (관문 경유)
- **호출 (verbatim)**: `tsSearch({ method:'searchText', regionCode:city.country_code||'FR', languageCode:lang, nameLocal:row.name_local||row.name_en, address:row.address, latitude/longitude, anchorRadiusM:(lat!=null?100:undefined), maxResults:1 })`. ANCHOR_M=100m.
- **후처리**: no_match skip / businessStatus!=='OPERATIONAL' skip / dist>2km suspicious. upsertPlace(nameEn=매칭키 고정, priceOverwrite=false=COALESCE 새우선).
- **조건**: CLI `--city-id [--apply] [--lang] [--category]`. 대상 = 6 비식당 카테고리 AND google_place_id IS NULL. 행당 1콜 €0.0299.

### #29 · `ts-photo-fill.ts` — TOP20 이미지 없는 행 (이미지 채움)
- **파일**: `server/services/fill/ts-photo-fill.ts:67` · **상태**: live (tsSearch→tsPhoto 2단 관문)
- **호출 (verbatim)**: `tsSearch({ method:'searchText', regionCode, languageCode:lang, nameLocal:row.name_local||row.name_en, lat/lng, anchorRadiusM:100, maxResults:1 })` (address 미전달=이름+앵커) → `tsPhoto({ photoName:top1.photoName, pathKey:`${cityId}/${seed_category}/${pid||id}`, maxWidthPx:800 })`.
- **조건**: CLI `--city-id [--apply] [--top=20]`. 대상 = 6 비식당 RC DESC TOP20 중 image_url/best_image_url/photo_urls 전부 NULL. 행당 €0.037.

## TS 스킬 발굴/검증 도구 (#30~#38)

### 발굴 3대 레시피 = #30·#31·#32 (12 ts-discover-pool, verbatim, 최근 파리 생성분) ⭐
> 같은 `run.ts` 엔진이지만 **인자 조합 = 3가지 별개 레시피**. 출처 = [`12-ts-discover-pool/README.md`](../fillcity/prompts/12-ts-discover-pool/README.md)(잠금 표준) + run.ts:107-125 body. **공통**: 정렬 = RC(userRatingCount) DESC, FieldMask = 9요소 STANDARD + `,places.primaryType`(잡음판정), regionCode = `country_code||'FR'`, timeout 30000, 결과 = `docs/raw/{cityId}/12-ts-discover-{zone}{-label}-{date}.json`.
>
> **검색방식 SSOT (입증됨)**: 인기/리뷰 발굴 = **searchNearby POPULARITY(≤20, 페이지네이션 없음)** = 리뷰 5만 챔피언(Bouillon Pigalle)을 searchText(관련성)는 놓침. 넓이 = **searchText(≤60 = 20×3 페이지 nextPageToken)**. 가격필터(`priceLevels`) = **searchText 전용**(searchNearby엔 없음). → 못 합쳐서 합본.

#### #30 · 인기도 카테고리별 TOP20 (비식당 6카테고리, searchText catMode + 강제 사각형)
- **CLI**: `npx tsx .../12-ts-discover-pool/run.ts --city-id=N --category=<heritage|hotspot|attraction|adventure|healing|shopping> --zone=downtown --lang=fr --per=20 --pages=1`
- **textQuery (verbatim CATEGORY_QUERIES, 1글자 변경 금지)**:
```
heritage:   'historical sites and museums'
hotspot:    'photogenic viewpoints, panoramic photo spots, rooftop and terraces'
attraction: 'theme parks, zoos, aquariums'
adventure:  'adventure places and activity spots'
healing:    'parks, gardens, peaceful nature'
shopping:   'shopping places and markets'
```
- **body (verbatim, catMode)**: `{ textQuery: CATEGORY_QUERIES[category], locationRestriction: { rectangle: rectFromCenter(d.lat, d.lng, 100) }, pageSize: per(=20), languageCode: lang, regionCode }` — ⚠️ catMode = `includedType` 강제 **안 함**(Google 자율 해석) + 범위 = **강제 사각형(rectangle, 범위 밖 안 줌)** + radiusOverride 기본 = **100000(100km)** = PSR day-trip 스코프. RC DESC → TOP20.

#### #31 · 외곽 식당 지역별 TOP20 (zone=outskirt, 명소별 circle)
- **CLI**: `npx tsx .../12-ts-discover-pool/run.ts --city-id=N --zone=outskirt` (method=text 기본, 명소당 1콜)
- **입력 = 지역 리스트**: `destinations.ts` `DISCOVERY_ZONES[cityId].outskirt` = `[{ name:'<명소>', lat, lng, radius }, ...]` (= day-trip 명소별).
- **body (verbatim, 식당모드)**: `{ textQuery: `${d.name} restaurant`, includedType: 'restaurant', locationBias: { circle: { center:{ latitude:d.lat, longitude:d.lng }, radius: Math.min(50000, d.radius) } }, pageSize: per(=20), languageCode: lang, regionCode }` — 명소별 circle(locationBias=선호) + RC DESC TOP20.

#### #32 · 도심 신규식당 60 합본 (zone=downtown, 3종 = nearby + text60 + premium)
- **CLI 3콜 (verbatim, README 표준)**:
```bash
# 1. nearby = 인기 챔피언 (POPULARITY 20)
run.ts --city-id=N --zone=downtown --method=nearby --label=nearby
# 2. text = 관련성 넓이 (60 = 20×3 페이지)
run.ts --city-id=N --zone=downtown --method=text --pages=3 --label=text
# 3. premium = 고급 가격필터 (searchText 전용)
run.ts --city-id=N --zone=downtown --method=text --pages=3 --price-levels=EXPENSIVE,VERY_EXPENSIVE --label=premium
# → post-process.ts 병합(잡음필터+name-dedup+tier×RC) → upsert
```
- **body ①nearby (verbatim)**: `{ includedTypes: ['restaurant'], maxResultCount: Math.min(per,20), rankPreference: 'POPULARITY', locationRestriction: { circle: { center, radius: Math.min(50000, d.radius) } }, languageCode, regionCode }` (검색어 없음 = 구글 인기순).
- **body ②text (verbatim)**: `{ textQuery: `${d.name} restaurant`, includedType: 'restaurant', locationBias: { circle: { center, radius: Math.min(50000, d.radius) } }, pageSize: per, languageCode, regionCode }` + `pageToken`(maxPages=3=60) + FieldMask에 `,nextPageToken` 추가.
- **body ③premium (verbatim)**: ②text + `priceLevels: ['PRICE_LEVEL_EXPENSIVE','PRICE_LEVEL_VERY_EXPENSIVE']`.
- **downtown 입력**: `destinations.ts` `DISCOVERY_ZONES[cityId].downtown` = `[{ name:'<City>', lat:<중심>, lng:<중심>, radius:10000 }]`(도심 단일 원형). 가격 = COALESCE 새우선(최신최우선).

### #33 · 12 run.ts 발굴 엔진 (위 #30~#32 공통 구현)
- **파일**: `.claude/skills/.../12-ts-discover-pool/run.ts:127` · **상태**: tool · ⚠️ **raw fetch(관문 우회)**
- **엔드포인트**: `places:searchText`(method='text' 기본) | `places:searchNearby`(method='nearby').
- **FieldMask (verbatim)**: `STANDARD_TS_FIELD_MASK + ',places.primaryType'`(=baseMask, 잡음판정용) + 페이지네이션 시 `,nextPageToken`.
- **body (verbatim)**:
  - searchNearby: `{ includedTypes(--included-types 기본 ['restaurant']), maxResultCount:min(per,20), rankPreference:'POPULARITY', locationRestriction:{circle:{center,radius:min(50000, radiusOverride??d.radius)}}, languageCode:lang, regionCode:country_code||'FR' }`.
  - searchText: `{ textQuery: catMode? effQuery : `${d.name} restaurant`, (식당)includedType:'restaurant', (catMode)locationRestriction.rectangle(rectFromCenter) else locationBias.circle, pageSize:per(20), languageCode, regionCode, [priceLevels] }`.
  - radiusOverride = `--radius || (catMode?100000:null)`. 페이지네이션 nextPageToken `--pages`(기본 1), 토큰 대기 2000ms.
- **textQuery 정의 (verbatim, 1글자 변경 금지)**:
```
const CATEGORY_QUERIES: Record<string, string> = {
  heritage: 'historical sites and museums',
  hotspot: 'photogenic viewpoints, panoramic photo spots, rooftop and terraces',
  attraction: 'theme parks, zoos, aquariums',
  adventure: 'adventure places and activity spots',
  healing: 'parks, gardens, peaceful nature',
  shopping: 'shopping places and markets',
};
// 식당 모드: `${d.name} restaurant`
```
- **조건**: CLI 발굴 진입점. 입력 = destinations.ts DISCOVERY_ZONES. dry → docs/raw/{id}/12-*.json. 행당 €0.0299.

### #34 · 12 recover-by-name (이름직접 보강)
- **파일**: `.claude/skills/.../12-ts-discover-pool/recover-by-name.ts:57` · **상태**: tool · ⚠️ raw fetch
- **body (verbatim)**: `{ textQuery:name, (restaurant)includedType:'restaurant', languageCode:lang, regionCode:country_code||'FR', pageSize:1 }`. FieldMask = STANDARD + `,places.businessStatus`(중복명시). top1만. businessStatus!=='OPERATIONAL' skip. `--apply` 시 upsertPlace(priceOverwrite:true).
- **조건**: 발굴 놓친 명소 이름 직접 복구. 입력 = MANUAL_ADD[cityId] 또는 `--names`.

### #35 · 12 image-pool (PhotoMedia, TS검색 0)
- **파일**: `.claude/skills/.../12-ts-discover-pool/image-pool.ts:111` · **상태**: tool
- **설정**: TS searchText 호출 0 = 발굴 raw의 photo_name 재사용. PhotoMedia GET `maxHeightPx=800&maxWidthPx=1200` → Storage PUT place-images. 동시 CONC=10. 선정 = downtown(가격대 quota eco20/reason40/premium20) | outskirt(명소별 fill-to-10). PM €0.007/곳.

### #36 · 12 post-process (PhotoMedia + upsert, TS검색 0)
- **파일**: `.claude/skills/.../12-ts-discover-pool/post-process.ts:265` · **상태**: tool
- **설정**: run.ts raw 후처리. PhotoMedia(--photo, place-photos 버킷, Date.now() 파일명). 식당흐름 = 거리필터 hkm≤radius×1.5 + OPERATIONAL + NON_FOOD 블랙리스트 + 수동가격 + dedup(place_id,name_norm) + tier QUOTA{Eco4,Reason4,Premium2,unknown2} → upsertPlace. 카테고리모드 = 공용 matchCandidate(서버 matcher.ts) 미리보기 → upsertPlace.

### #37 · 06 ts-pm-enrich 발굴/검증 (관문 경유)
- **파일**: `.claude/skills/.../06-ts-pm-enrich/run.ts:77` · **상태**: tool (✅ 2026-06-05 tsSearch 관문 일원화)
- **호출 (verbatim)**: `tsSearch({ method:'searchText', nameLocal:name, address:addr, regionCode:country_code, languageCode:'ko', maxResults:5 })`. textQuery=이름+주소(좌표없음). top1 → JSON.ts 9요소. €0.035/행.
- **조건**: CLI `--city-id`. 대상 = (image_url NULL OR PID NULL) AND (seed_category IN ('restaurant','adventure') OR rank<=20).

### #38 · 06 ts-pm-enrich post-process (tsPhoto 관문)
- **파일**: `.claude/skills/.../06-ts-pm-enrich/post-process.ts:75` · **상태**: tool
- **호출 (verbatim)**: `tsPhoto({ photoName, pathKey:`${cityId}/${rowId}-${Date.now()}`, bucket:'place-photos', maxWidthPx:800 })` → upsertPlace(imageUrl 새우선). €0.007/행.
- **조건**: CLI `--apply-status=ok [--photo] [--apply-ids]`.

## TS 라이브 매처 ag3 (#39~#40, 메인앱 핫패스)

### #39 · ag3 `saveNewPlacesToDB` searchText (신규/bare 보강) ⚠️ 라이브 raw fetch
- **파일**: `server/services/agents/ag3-data-matcher.ts:719` · **상태**: live · ⚠️ **관문 미경유 = 자체 fetch**
- **FieldMask**: `SEARCH_TEXT_FIELD_MASK = STANDARD_TS_FIELD_MASK`(9요소, validateFieldMask 강제).
- **body (verbatim)**: `{ textQuery: addr ? `${name} ${addr}` : `${name} ${cityName}`(=도시명 textQuery 안에), maxResultCount:1, languageCode:'ko' }`. timeout 20000. businessStatus==='CLOSED_PERMANENTLY' → 마커+제외. PhotoMedia GET maxHeight800/Width1200 → place-images PUT(Bearer SUPABASE_ANON_KEY). 가격 = max(TS,Gemini). Promise.all 병렬. upsertPlaces(deferPersist background).
- **조건**: 라이브 여정 생성 중 자동. 트리거 = matchPlacesWithDB 후 toSave(신규 'Gemini AI (New)'|'+Google Places'|bareMatch 결손, ENRICH_BARE_MATCHES=true). 완전매칭 행 = 호출 0(비용 절감).
- **verbatim 코드**:
```ts
async function searchText(name: string, addr: string | undefined): Promise<any | null> {
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": SEARCH_TEXT_FIELD_MASK,
      },
      // ⚠️ 수정금지(승인필요) 2026-05-15 = languageCode: 'ko'
      body: JSON.stringify({
        textQuery: addr ? `${name} ${addr}` : `${name} ${cityName}`,
        maxResultCount: 1,
        languageCode: "ko",
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as any;
    return d.places?.[0] || null;
  } catch { return null; }
}
```

### #40 · ag3 `matchCandidate` 5단계 (raw fetch 0 = DB 매칭)
- **파일**: `server/services/agents/ag3-data-matcher.ts:354` · **상태**: live (외부 호출 0)
- **설정**: 공용 matchCandidate(`server/services/shared/matcher.ts`, §16 단일 매처) = 5단계: PID > URI > 풀주소+이름9조합 > 좌표10m > 로컬네임9조합(URI veto, PID veto 제거 2026-06-15). 후보 = preloadCityData seedRawMap(name norm + noAccent 9조합). SQL = `SELECT ... WHERE city_id=$1 AND (seed_category='restaurant' OR rank BETWEEN 1 AND 20)`.
- **조건**: 매칭 성공 = 좌표/이미지/PID/리뷰/카피 즉시 주입(Google 회피) / 실패 = needsGoogle → B3-1.

## TS 레거시 / cron (#41~#42)

### #41 · seed-gemini STEP2 TextSearch + PhotoMedia
- **파일**: `scripts/seed-gemini.mjs:327`(검색) `:284`(사진) · **상태**: legacy · ⚠️ raw fetch
- **FieldMask (verbatim)**: `'places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.userRatingCount,places.types,places.primaryType,places.priceRange,places.googleMapsUri'` (= **types/primaryType 추가 + §15 validateFieldMask 가드 미적용**).
- **body**: `{ textQuery, pageSize:1, languageCode:'ko' }`. textQuery = `[name_en, address||(CITY,COUNTRY)].join(' ')` (좌표 X). rate sleep(6000)=분당10. ts_price=priceRange.endPrice.units. PhotoMedia GET maxHeight800/Width1200 → place-images PUT(Bearer SUPA_ANON).
- **조건**: STEP1 Gemini 결과 검증(가짜 place_id 폐기 후 AG3 매칭).

### #42 · p0-bts-daily-cron searchText + PhotoMedia
- **파일**: `scripts/p0-bts-daily-cron.mjs:123`(검색) `:166`(사진) · **상태**: legacy · ⚠️ raw fetch + **자체 마스크/가드**
- **FieldMask (verbatim)**: `'places.id,places.displayName,places.location,places.photos,places.userRatingCount,places.googleMapsUri'` (6필드) + 자체 validateFieldMask(ALLOWED 화이트리스트 + ATMOSPHERE 33 차단).
- **body**: `{ textQuery, pageSize:1, languageCode:'ko' }` + locationBias(city.lat/lng → circle radius 50000).
- **textQuery 조립 (verbatim, 2026-04-29 SSOT)**: `[name_en, CATEGORY_KEYWORDS[seed_category], coordStr(`${lat},${lng}` 6자리), locStr(city,state(US),country)].filter(Boolean).join(' ')`.
- **CATEGORY_KEYWORDS (verbatim)**: `{ restaurant:'restaurant', shopping:'shopping mall', attraction:'tourist attraction landmark', healing:'park spa wellness', adventure:'adventure activities outdoor', hotspot:'popular tourist spot, rooftop and terraces', heritage:'historical site heritage' }`.
- **cap**: SEARCH_DAILY_LIMIT=40 / PHOTOS_DAILY_LIMIT=40. 429 → 60초 retry. PhotoMedia GET maxHeight1200/Width1600 → place-images PUT(Bearer SUPABASE_ANON_KEY).
- **조건**: BTS 일일 이미지 cron(2026-04-27 SSOT). 입력 = collection_phase='bts2026' VIBE 6cat×5 + restaurant×10. **searchNearby 호출 X(안전장치#2)**.

---

# C. 비-LLM 결정론 (프롬프트 없음, 참고)

### #43 · 07 중복 통합 (merge-dups) — `.claude/skills/.../07-merge-dups/run.ts:80` · 외부 API 0 (결정론)
- 순수 TS 결정론 5단계 매칭(upsertPlace v2 알고리즘 inline). prompt.txt 존재하나 run.ts 미사용. normName(NFD+결합문자제거) / haversine R=6371000.
- **프롬프트 원본 (= 예비 = 의심 그룹 4순위 매칭 시 호출용, 현 run.ts 미사용)**: [`07-merge-dups/prompt.txt`](../fillcity/prompts/07-merge-dups/prompt.txt) (⚠️수정금지 2026-05-20). **verbatim**:
```
역할: 너는 한국인 여행자 장소 DB 의 중복 행 판단 전문가야.

⚠️ 응답 근거 = **입력 행 묘사 + 주소** 만 사용 = 외부 검색/추정 금지.

목적: ${CITY_NAME} (city_id=${CITY_ID}) 의 의심 중복 그룹 ${GROUP_LEN} 개 = 각 그룹 = 같은 장소 vs 다른 장소 (= 체인 지점) 판단.

판단 원칙 (= 사용자 SSOT):
1. **같은 이름 + 다른 주소** = 체인 지점 = **모두 보존** (= 식당의 경우)
2. **같은 이름 + 같은 주소** = 같은 장소 = 통합 후보
3. **같은 PID** = 항상 같은 장소 = 통합 (= 본 단계 X = 0순위 자동 처리됨)
4. **광역 주소 + 다른 이름** = 별도 행 (= Disney Village = 각 매장 별도)

입력 = 의심 그룹 list (= 각 그룹 = 같은 4순위 매칭 = 이름 LOWER+trim 동일):
  [
    {
      "group_key": "<이름 normalized>",
      "rows": [
        { "id": <id>, "name_en": "...", "name_local": "...", "address": "...", "summary_ko": "...", "editorial_summary": "..." }
      ]
    }
  ]

응답 (= JSON 배열):
{
  "decisions": [
    {
      "group_key": "<입력 그대로>",
      "verdict": "<merge | keep_all | partial_merge>",
      "merge_rows": [<archive 대상 id list>],
      "keep_row": <보존 id>,
      "reason_ko": "<한국어 한 줄 = 판단 근거>"
    }
  ]
}

규칙:
1. verdict = "merge" = 모든 행 같은 장소 = keep_row 외 모두 archive
2. verdict = "keep_all" = 모두 다른 장소 (= 체인) = 변경 X
3. verdict = "partial_merge" = 일부만 같은 장소 = merge_rows 명시
4. keep_row = PID 보유 우선 → 상세 이름 → 풍부도 (= 사용자 SSOT [[feedback_dedup_keep_priority]])
5. confidence < 0.8 = "keep_all" 권장 (= 의심 시 보존)

입력 ${GROUP_LEN} 그룹:
${GROUPS_JSON}
```

### #44 · 08 Wikidata 이미지 (wk-image-fill) — `.claude/skills/.../08-wk-image-fill/run.ts:68` · Gemini 0 (SPARQL)
- Wikidata SPARQL (around 10m, LIMIT 15). 채점 = 거리+이름매칭+카테고리+이미지 → trust/verify/reject.
- **SPARQL (verbatim)**:
```
SELECT ?place ?placeLabel ?placeDescription ?image ?coord ?instanceLabel WHERE {
  SERVICE wikibase:around {
    ?place wdt:P625 ?coord.
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^<http://www.opengis.net/ont/geosparql#wktLiteral>.
    bd:serviceParam wikibase:radius "${RADIUS_KM}".
  }
  OPTIONAL { ?place wdt:P18 ?image }
  OPTIONAL { ?place wdt:P31 ?instance. ?instance rdfs:label ?instanceLabel. FILTER(LANG(?instanceLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,ko". }
} LIMIT 15
```

---

# E. 복합 워크플로우 (Gemini+TS+PM 조합 오케스트레이터)

## #45 · 결손보강·보정 WF (관리자 백그라운드 = 출입증 필수)

- **파일**: `fillcity/repair.ts` · **상태**: live(실증완료 2026-06-20 파리·마드리드) · **호출 주체**: **관리자(사장님)가 요구할 때만** = 백그라운드 = process.env 우회 0 = **출입증 직독 필수**(FE 사용자 입력 아님).
- **용도**: 이미 발굴된 도시의 **결손 행(12요소 중 하나라도 빔)을 행 전체 보강** = "1결손이라도 → Gemini→TS→PM 통째 1번 더 가져와 덮어쓰기". 다시 돌려도 안전(완비된 도시 = 추출 0 = 외부호출 0).
- **호출 명령**: `npx tsx fillcity/repair.ts --city-id=N` (DRY=무료) / `--apply`(외부호출) / `--only-id=ID`(단일 행 격리) / `--all-restaurants`(식당 풀 작은 도시=식당 전부, 2026-06-20).

### [2] Gemini 카피 = 02-enrich/prompt.txt (= #07 과 동일 진본, 새 프롬프트 0)
- **호출**: `geminiCurate(city.name_en, cityId, rows, { apiKey: geminiKey })` (geminiKey = `issueApiKey(c,'GEMINI_API_KEY',cityId,날짜,true)` 출입증 직독).
- **프롬프트 원본**: [`02-enrich-place/prompt.txt`](../fillcity/prompts/02-enrich-place/prompt.txt) (split(/═{30,}/)[2] / 치환 ${API_PASS} ${CITY_NAME} ${CITY_ID} ${YEAR} ${MONTH} ${BATCH_LEN} ${JSON_INPUT}).
- **프롬프트 본문 (verbatim, ⚠️수정금지 2026-05-18 = 1글자 변경 금지)**:
```
${API_PASS}

역할: 너는 한국인 여행자를 위한 [CITY_NAME] 장소 정보 보강 전문가야.

⚠️ 응답 근거 = Google Search 그라운딩 기반 = ${YEAR}년 ${MONTH}월 현재 시점의 최신/검증된 사실 (= 가격/주소/한국어 호칭) 만 사용 = 추정/환각 금지.

목적: [CITY_NAME] (city_id=${CITY_ID}) 의 기존 장소 ${BATCH_LEN} 곳 = 누락 정보를 채우고 + 한국 관점 큐레이션을 작성한다.

입력 = 각 장소 = JSON (= id 는 우리 place_seed_raw.id = 응답 매칭 키)
  - id: number (= place_seed_raw.id = 응답에 정확히 매칭 필수)
  - name_local: string | null (= 현지 원어명 = 변경 X)
  - name_en: string | null
  - name_ko: string | null
  - address: string | null
  - latitude: number | null
  - longitude: number | null
  - google_place_id: string | null

응답 (= JSON 배열, 설명 텍스트 X):
{
  "places": [
    {
      "id": <입력 id 그대로 = place_seed_raw.id>,
      "name_local": "<현지 원어명 = 예 'Tour Eiffel' / 입력 있으면 검증 / 없으면 채움 = 변경 X>",
      "name_en": "<영어명 = 예 'Eiffel Tower' / 입력 있으면 검증 / 없으면 채움>",
      "name_ko": "<한국 여행자 친숙 호칭 = 예 '에펠탑' / 입력 있으면 검증 / 없으면 채움>",
      "address": "<번지 + 거리 + 우편번호 + 도시 + 국가 = 예 '5 Avenue Anatole France, 75007 Paris, France'>",
      "latitude": <위도 6 자리 = 예 48.858370>,
      "longitude": <경도 6 자리 = 예 2.294481>,
      "summary_ko": "<한 줄 숏폼 대사 = 인스타/FOMO 사회적 검증 = 한국어 25 자 이내>",
      "editorial_summary": "<한 줄 한국인 관점 선정 이유 = 코믹/위트 후킹 카피 = 한국어 35 자 이내>",
      "price_eur": <식당=1인 식대 / 그 외=실제 입장료 EUR 숫자 = 무료·입장료 없는 곳(광장·핫스팟 등) = 0>,
      "distance_km_from_center": <도심 중심으로부터 직선거리 km = haversine = 소수 1 자리 = 예 2.4>
    }
  ]
}

규칙:
1. 모든 입력 id = 응답에 정확히 포함 (= 누락 0) ← id = 우리 place_seed_raw.id = 매칭 키
2. name_local = 입력 그대로 유지 (= 변경 절대 X = 우리 매칭 키 = 원어명 보존) / name_en·name_ko = Google 기준 정확히 검증·보강 (= 추정 X)
3. 좌표 = 6 자리 소수 (= 예 48.858370, 2.294481)
4. address = 번지부터 국가까지 완전 (= 부분 주소 X)
5. summary_ko / editorial_summary = 한국어만 (= 영어 단어 혼용 X)
6. price_eur = 식당이면 1인 식대, 그 외 장소는 실제 입장료 = EUR 정수 (= 추정 생성 X). 무료·입장료 없는 장소(광장·거리·핫스팟 등) = 0.
7. distance_km_from_center = 도심 중심으로부터 직선거리 km (= haversine, 소수 1 자리, 필수)
8. 응답 = 위 JSON 만 (= 설명/주석/마크다운 X)

입력 ${BATCH_LEN} 장소:
${JSON_INPUT}
```
- 출입증 헤더 `${API_PASS}` = `[API-PASS] 도시=${cityName}(${cityId}) / 행=있음(채움) / 날짜=${오늘}` 동적치환(gemini-curate.ts:79).
- **설정(verbatim)**: gemini-3-flash-preview / grounding ON(googleSearch) / temperature 0.2 / maxOutputTokens 50000 / batch 적응형(40→30→20→10) / contextId=cityId rawTag='enrich-curate'.
- **출력 = 응답 전 11필드 (선별 폐기 2026-06-20)**: `geminiCurate()` 가 `{id, nameLocal, nameEn, nameKo, address, latitude, longitude, summaryKo, editorialSummary, priceEur, distanceKmFromCenter}` 반환(gemini-curate.ts:25-31·94-102). 옛 "4필드만 추출(nameKo/summary/editorial/price)" = AI 선별 = name_local·distance·address·좌표 버려짐 사고 = §19 완전삭제.
- **후처리 = 우리 id 직행 UPDATE (verbatim, ⚠️수정금지 = Gemini 응답 전 필드 새우선, 선별 폐기 2026-06-20)**:
```sql
UPDATE place_seed_raw SET
  name_local = COALESCE(NULLIF($2,''), name_local),   -- Gemini만 주는 요소(원어명)
  name_en = COALESCE(NULLIF($3,''), name_en),         -- 1차(뒤 TS displayName 이 최종 덮음)
  name_ko = COALESCE(NULLIF($4,''), name_ko),
  address = COALESCE(NULLIF($5,''), address),
  latitude = COALESCE($6::real, latitude),
  longitude = COALESCE($7::real, longitude),
  summary_ko = COALESCE(NULLIF($8,''), summary_ko),
  editorial_summary = COALESCE(NULLIF($9,''), editorial_summary),
  price_eur = COALESCE($10::real, price_eur),         -- shopping=null 강제(호출자)
  distance_km_from_center = COALESCE($11::numeric, distance_km_from_center),  -- Gemini만 주는 요소(도심거리=동선 재료)
  updated_at = NOW()
WHERE id=$1   -- 우리 id 직행(매칭 X = 빗나감 0). 신규 INSERT 없음.
```
- 파라미터 = `[r.id, g.nameLocal, g.nameEn, g.nameKo, g.address, g.latitude, g.longitude, g.summaryKo, g.editorialSummary, (shopping?null:g.priceEur), g.distanceKmFromCenter]`.

### [3] TS 9요소 검증·교정 = #26 게이트웨이 경유 (건건, 결손행마다 1콜)
- **호출 (verbatim, ⚠️수정금지)**:
```js
const cur = (await c.query('SELECT name_local, name_en, address, latitude::float8 AS lat, longitude::float8 AS lng FROM place_seed_raw WHERE id=$1', [r.id])).rows[0] || r;
const hint = cur.name_local || cur.name_en || r.name_local || r.name_en;
const tsKey = await issueApiKey(c, 'GOOGLE_MAPS_API_KEY', cityId, inputDate, true); // 출입증 직독(채움 hasRow=true)
const ts = await tsSearch({
  apiKey: tsKey, method: 'searchText', regionCode: city.country_code || 'FR',
  cityId, ourId: r.id, rawTag: `fill-${hint || r.id}`,
  nameLocal: hint, address: cur.address ?? r.address,
  latitude: cur.lat ?? r.lat ?? null, longitude: cur.lng ?? r.lng ?? null,
  anchorRadiusM: (cur.lat ?? r.lat) != null ? 100 : undefined, maxResults: 1,
  localSkipRaw: true,  // 건건 raw 로컬 skip = 스토리지만(끝에 모음 1파일)
});
const t1 = ts[0]; // top1 = 9요소 매핑형 TsPlace
```
- **FieldMask**: `ts-client.ts` STANDARD_TS_FIELD_MASK 9요소 (= #26). hint = name_local||name_en. anchorRadiusM=100m(동명 차단). maxResults=1.
- **후처리 = 우리 id 직행 UPDATE (verbatim, ⚠️수정금지 = 매칭 X = 빗나감 0 = TS 응답 전 필드 새우선, 선별 폐기 2026-06-20)**:
```sql
UPDATE place_seed_raw SET
  name_en = COALESCE($2, name_en),          -- TS displayName(영어)→name_en (2026-06-17, name_local은 Gemini전용)
  address = COALESCE($3, address),
  latitude = COALESCE($4::real, latitude),
  longitude = COALESCE($5::real, longitude),
  google_place_id = COALESCE($6, google_place_id),   -- TS가 준 PID = 우리 PID 오류 교정(matcher veto 제거)
  google_maps_uri = COALESCE($7, google_maps_uri),
  google_review_count = COALESCE($8::integer, google_review_count),
  price_eur = COALESCE($9::real, price_eur),  -- TS price(거의 null)=새우선(최신최우선). null이면 Gemini값 보존. shopping=null. 2026-06-20 추가.
  updated_at = NOW()
WHERE id=$1   -- 우리 id 직행 = 목적지 정해진 단순 삽입(빗나감 0). UPDATE라 트리거 미발동(신규 INSERT 아님).
```
- 파라미터 = `[r.id, t1.nameEn, t1.address, t1.latitude, t1.longitude, t1.googlePlaceId, t1.googleMapsUri, t1.googleReviewCount, (seed_category==='shopping'?null:t1.priceEur)]`. no_match = skip + tsResults에 status='no_match' 기록.
- ⚠️ TS는 `nameLocal=null`·distance 없음(= Gemini 담당) = 안 건드림. **중복요소(name_en·address·좌표·price)는 Gemini 1차 → TS가 뒤에 덮어 최종 = TS 값**(= 순서가 처리, [[reference_gemini_ts_field_overwrite_order]]).

### [4] PM 이미지 = #27 tsPhoto 경유 + 무료재링크 우선 (결손분만)
- **무료재링크 우선 (verbatim) = 결제분 재활용 = PM 누수 차단**:
```js
const relink = await relinkStorageImages({ cityId, apply, client: c, categories: [...SIXCAT, 'restaurant'] });
// relink.matchedIds 에 든 행 = 무료로 채워짐 = PM 제외(continue).
```
- **PM 호출 (verbatim, ⚠️수정금지) = 무료재링크 안 된 + place-images 없는 행만**:
```js
const cur = (await c.query('SELECT image_url, google_place_id, seed_category FROM place_seed_raw WHERE id=$1', [r.id])).rows[0];
if (cur && cur.image_url && cur.image_url.includes('place-images')) continue; // 이미 있음 = PM 불필요
const t1 = tsByOurId.get(r.id);
if (!t1 || !t1.photoName) { imgNoPhoto++; continue; } // 사진 없음 = skip
const pid = t1.googlePlaceId || cur?.google_place_id;
const pmKey = await issueApiKey(c, 'GOOGLE_MAPS_API_KEY', cityId, inputDate, true); // 출입증 직독
const imageUrl = await tsPhoto({ apiKey: pmKey, photoName: t1.photoName, storageKey, supaPublicUrl,
  pathKey: `${cityId}/${cur?.seed_category||r.seed_category}/${pid}`, maxWidthPx: 800 });
// → 우리 id 직행 UPDATE: image_url=$2, image_updated_at=NOW() WHERE id=$1
```
- **호출 = #27 그대로**: PhotoMedia GET → Storage PUT place-images. photo = `t1.photoName`(photos[0] = 대표 1장). maxWidthPx=800. 무료재링크(`storage-image-relink.ts`) 우선이라 실제 PM = 최종 소수만(결손분 필터 4중: 무료재링크∉ + place-images없음 + photoName있음).

### 저장 = §18 (TS 모음 1파일 = 06형태)
- TS raw = 건건 로컬 skip(`localSkipRaw:true`) + 끝에 06형태 모음 1파일 `{date}_45-ts-defect-repair_candidates.json`(results 배열, photo_name 1개). Gemini raw = 로컬+스토리지 2곳. 이미지 = Storage place-images 1곳.
- **매칭 = X = id 직행 UPDATE**(`WHERE id=$1`) = 목적지 정해진 단순 삽입(빗나감 0).

### #45 고유 = 추출 SQL (verbatim = 이것만 #45 진본 = 재발명 금지 = 코드 동기화 2026-06-20)
- 풀 = **6cat TOP20(rank 1~20) ∪ 식당** (도심/외곽 구분 없음 = 도시 전체 restaurant). BTS 제외.
- **식당 분기 (`--all-restaurants` 플래그 = $4, 2026-06-20 사장님 SSOT)**: `$4=true`(풀 작은 도시 브뤼셀·런던·뮌헨 등) = **식당 전부**(price 결손 포함, band 미적용 = #45 후 보정·채워짐) / `$4=false`(파리·마드리드 식당 400+) = **band 30/90/30**(price 있는 식당, eco≤24/reason≤60/premium = 가격분류) 유지 = 불변.
```sql
WITH base AS (
  SELECT id, name_local, name_en, address,
         latitude::float8 AS lat, longitude::float8 AS lng,
         price_eur::float8 AS price_eur, google_review_count AS rc,
         google_place_id, google_maps_uri, seed_category, rank, image_url,
         distance_km_from_center, summary_ko, editorial_summary,
         CASE WHEN price_eur <= 24 THEN 'eco' WHEN price_eur <= 60 THEN 'reason' ELSE 'premium' END AS band
  FROM place_seed_raw WHERE city_id=$1
    AND seed_category NOT IN ('bts_army_zone','bts_merch_store','bts_venue')
    AND ($3::bigint IS NULL OR id=$3::bigint)
),
sixcat AS (
  SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
         image_url, distance_km_from_center, summary_ko, editorial_summary
  FROM base WHERE seed_category = ANY($2::text[]) AND rank BETWEEN 1 AND 20
),
rest_ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY band ORDER BY rank ASC) AS band_rn
  FROM base WHERE seed_category='restaurant' AND price_eur IS NOT NULL
),
-- 식당 분기: $4(--all-restaurants)=true → 식당 전부(price NULL 포함) / =false → band 30/90/30 (불변)
rest AS (
  SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
         image_url, distance_km_from_center, summary_ko, editorial_summary
  FROM base WHERE seed_category='restaurant' AND $4::boolean = true
  UNION
  SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
         image_url, distance_km_from_center, summary_ko, editorial_summary
  FROM rest_ranked WHERE $4::boolean = false AND band_rn <= CASE band WHEN 'eco' THEN 30 WHEN 'reason' THEN 90 ELSE 30 END
),
pool AS (SELECT * FROM sixcat UNION SELECT * FROM rest)
SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
       image_url, distance_km_from_center, summary_ko, editorial_summary,
       ARRAY_REMOVE(ARRAY[
         CASE WHEN google_place_id IS NULL THEN 'pid' END,
         CASE WHEN rc IS NULL THEN 'rc' END,
         CASE WHEN image_url IS NULL OR image_url='' OR image_url NOT LIKE '%place-images%' THEN 'image' END,
         CASE WHEN google_maps_uri IS NULL OR google_maps_uri='' THEN 'uri' END,
         CASE WHEN lat IS NULL OR lng IS NULL THEN 'coords' END,
         CASE WHEN address IS NULL OR address='' THEN 'addr' END,
         CASE WHEN price_eur IS NULL AND seed_category <> 'shopping' THEN 'price' END,
         CASE WHEN name_local IS NULL OR name_local='' THEN 'name_local' END,
         CASE WHEN distance_km_from_center IS NULL THEN 'distance' END,
         CASE WHEN summary_ko IS NULL OR summary_ko='' THEN 'summary_ko' END,
         CASE WHEN editorial_summary IS NULL OR editorial_summary='' THEN 'editorial' END
       ], NULL) AS missing
FROM pool
WHERE (
     google_place_id IS NULL OR rc IS NULL
  OR image_url IS NULL OR image_url='' OR image_url NOT LIKE '%place-images%'
  OR google_maps_uri IS NULL OR google_maps_uri=''
  OR lat IS NULL OR lng IS NULL OR address IS NULL OR address=''
  OR (price_eur IS NULL AND seed_category <> 'shopping')
  OR name_local IS NULL OR name_local=''
  OR distance_km_from_center IS NULL
  OR summary_ko IS NULL OR summary_ko='' OR editorial_summary IS NULL OR editorial_summary=''
)
ORDER BY seed_category, rc DESC NULLS LAST
ORDER BY seed_category, rc DESC NULLS LAST
```
- **결손 12요소**: pid·rc·image(place-images 외=결손)·uri·coords·addr·price(shopping 제외)·name_local·distance·summary_ko·editorial.
- **순서**: Gemini(1콜 배치) → TS(건건, RC·PID 교정) → PM(무료재링크→남은 결손만). 출입증 3단계(Gemini·TS·PM 각 `issueApiKey(c,키,cityId,날짜,hasRow=true)`).
- **실시간 랭킹**: TS가 RC 덮어씀 → autorank 트리거가 rank 즉시 재배치(§7) = 추출 시점 실시간(옛/새 rank 없음).

---

# D. 누락검증 결과 (= 전수성 보장)

### D-1. 03/04 식당 발굴 (= 2026-06-08 un-archive = prompts/ 라이브 복귀)
- `03-downtown-restaurant/run.ts` + `prompt.txt` = callGemini raw fetch + prompt.txt 진본. **도심 식당 = Gemini 가격tier ∥ 12-pool #32 합본(searchNearby20+text60+premium)** 상호보완.
- `04-outskirt-restaurant/run.ts` + `prompt.txt` = 동일 패턴 + **범용 타입힌트 표준화**(2026-06-08, 도시명 0). **외곽 식당 = Gemini ∥ fill/outskirt-ts-fill**(town 자동추출→geocode→searchNearby POP).
- (= 2026-06-08 = _archived-2026-06-02 → prompts/ 복귀 = ROOT 버그 근본해소 + 상호보완 발굴 라이브. 옛 "폐기" 프레이밍 철회.)

### D-2. 거짓양성 (= 실제 호출 아님, 제외 확인)
- `server/services/itinerary-generator.ts` = GoogleGenAI import + getAI() 정의하나 **호출 0**(runPipelineV3 위임만) = 죽은 scaffolding.
- `server/run-startup-migrations.ts` = `places.googleapis.com`이 SQL LIKE 필터 안에만 = API 호출 0.
- `apify-import.ts` / `fill-city.ts`(spawn 오케스트레이터) / `manual-additions.ts` / `manual-prices.ts` / `destinations.ts` = 주석·데이터·spawn뿐.
- `09/10/11 STANDARD_PROMPT_*.md` = .md 문서(= 라이브 코드 등가물은 A2-1/A2-2에 인라인 수록).
- `route-local.ts` / `route-backfill.ts` = 결정론·upsert 코드 = Gemini/TS 호출 0.

---

> **추출 출처**: 워크플로 `prompt-inventory-extract`(run `wf_a3e79845-48c`, 8 에이전트, 697K 토큰, 82 tool use). 인라인 verbatim = 에이전트가 소스 파일에서 그대로 추출(검증 = file:line 대조). 외부 prompt.txt/.md = 링크(진본). **삭제·중복 정리 = 사용자 직접.**
