# fillCity PRD — 도시명 1입력 → 자동 발굴·완성

> 사용자 SSOT 확정 2026-06-08. = fillCity 백그라운드 로직의 단일 기준 문서.
> 구현체 = `.claude/skills/raw-db-verify-and-complete/fill-city.ts` (오케스트레이터) + 아래 컴포넌트.
> 변경 = 사용자 명시 승인 (헌법 §14/§15/§16/§17 + 메모리 `reference_matcher_ranking_ssot` 정합).

---

## 0. 목적 / 범위

- **입력**: 도시명(또는 city_id) **1개**.
- **출력**: `place_seed_raw` 에 그 도시의 **카테고리별 TOP20 × "완비 요소"** = 외부호출 0(**db-only**)으로 동선/메인앱이 구동되는 핵심 재료.
- **최종 형태**: FE **관리자 대시보드**(독립 HTML, `/admin`)의 1버튼 → 백그라운드 실행. (현재 = CLI `fill-city.ts`)
- **비범위**: 메인앱 여정 생성(ag1~4), 숏폼 = 별개 시스템.

---

## 1. 산출물 정의 = "완비 게이트" (= db-only 자격)

- **단위** = `(city_id, seed_category)` 별 **RC순 TOP20**.
- **완비 = 두 소스의 합집합** (고정 "14개" 아님 = 매칭키 겹침 + 호출별 변동):

| 구분 | 요소 | 성격 |
|---|---|---|
| **TS 9 (무조건)** | PID · name_local · 풀주소 · 좌표 · RC · 가격 · 이미지 · mapsUri · 영업상태 | `ts-client.ts` 가 **코드로 강제**(FieldMask) = 결손 불가 |
| **Gemini 기여 (요약2 + 가격)** | summary_ko · editorial_summary · **price** | Gemini 전용 카피 2 + 가격(= **TS 결손 多 → Gemini 가 실질 공급**) |
| **매칭키 3** | 주소 · 좌표 · 로컬이름 | **양쪽 겹침** = 데이터 아닌 **병합 키**(7단계) = 완비 카운트 아님 |

> 평점(rating) = 미사용. RC(리뷰수)만 = 인기/랭킹 기준.

---

## 2. 🎯 Gemini vs TS 역할 (핵심)

| | **Gemini** = 주관적 "한국인 큐레이션" | **TS(Google Places)** = 객관적 "검증 데이터" |
|---|---|---|
| **역할** | 어느 장소가 한국인 인기인가(인스타·블로그·유튜브) = **선정 + 한국어 카피** | 실재하는가 + 객관 사실 = **9요소 검증** |
| **컬럼 기여** | summary_ko · editorial_summary · price | PID · name_local · 주소 · 좌표 · RC · 가격 · 이미지 · mapsUri · 영업상태 |
| **⚠️ 핵심** | **RC 없음 = 환각 방지**. Gemini rank = 입력순서(가랭킹)일 뿐 | 유료 €0.0299/콜 = 9요소 한 번에 = 최신검증 덮어씀 |
| **발굴 방식** | grounding(googleSearch) 한국선호 = TS 미발굴 보완 | searchText(관련성·우리정의 ≤60) + searchNearby(POPULARITY·식당 ≤20) |
| **단일 관문** | `shared/geminiClient.ts` | `shared/ts-client.ts` (9요소 강제 + Atmosphere 차단 §15) |

→ **Gemini = "무엇을(한국선호) + 어떤 카피로" / TS = "진짜인가 + 객관사실"**.
→ **병합** = 같은 장소면 `upsertPlace` 7단계가 **한 행**으로 (COALESCE 새우선 · 가격 COALESCE 새우선 · tags UNION).
→ **랭킹** = TS 의 **RC** = 유일 기준.

---

## 3. 표준 프로세스 (개념 = ⓪ #45 사전정제 + 발굴 + 이미지 게이트)

```
[⓪ #45 결손보강·보정(repair)]  →  발굴  →  보충  →  추출  →  07-merge dedup(필수)  →  최종 이미지(PM)
```

- **⓪ #45 결손보강·보정 (= fillCity 의 repair 단계 = 사장님 SSOT 2026-06-20)** = 발굴 전, 기존 PSR 의 **결손 행(12요소 중 하나라도 빔)을 행 전체 보강**(추출 band 30/90/30 → Gemini→TS→PM→2곳저장, §8.2 + 카탈로그 #45).
  - **두 용도 = 한 컴포넌트** = (a) fillCity 전체 WF 의 **⓪ 사전정제 단계**(발굴 전 자동 선행) / (b) **독립 1회용** = `fill-city.ts --only=repair`(완비 도시 재점검, 예 파리·마드리드).
  - **재발명 0** = 영구 컴포넌트 [`scripts/fill45-defect-repair.ts`](../scripts/fill45-defect-repair.ts) 연결만. 다시 돌려도 안전(완비 시 추출 0 = 외부호출 0).
  - ⚠️ 옛 ⓪ "가짜RC null·07-merge·폐업드롭·미스명복구" 개별 정제 = #45 안에서 행 전체 refresh 로 흡수(중복정리 07-merge 는 이미지 전 별도 게이트 유지). from-zero 도시 = 결손 0 = skip.
- ⚠️ **도시 실행 분기 (확정 2026-06-21 사장님 SSOT = §3-A)**: 실제 운영은 거의 다 **기존자료 도시**(6cat 이미 Gemini 시드발굴됨 = 식당만 적음) = **§3-A 의 3단계 흐름**(정제[AI 인위 삭제] → 식당발굴[`--only=restaurant` 자동] → #45 전체[결손보강]) 을 **반복**한다. **0(빈) 도시** = §3·§4 의 repair-맨앞 전체 1줄. (옛 "① 정제자동화 vs ② 완전삭제 = 둘 중 미정" 문구 = §19 삭제 = §3-A 로 확정.)
- **발굴** = 7카테고리 전부 TS ∥ Gemini. **식당도 발굴 단계** = 다른 카테고리처럼, 단 **최대풀**(§8 동선최적화).
- **보충** = Gemini 카피(요약2+가격) + TS backfill(PID/RC/좌표 = Gemini 환각 검증). **식당 카피(13) 자동 포함**.
- **추출** = **DB 내부 자동 RC DESC** → 카테고리별 **TOP20 부상** (= 인위 X, §7).
- **최종 이미지 삽입** = **비식당 = 카테고리별 RC TOP20** / **식당 = §8.2 도시상대 가격띠 quota** = 비용통제 자연 발생.
- **07-merge dedup = 이미지(PM) 직전 필수 게이트**(2026-06-09 사용자 SSOT) = 중복 그룹은 **keep 1행만 PM 대상** → **PM 호출 최소화**(같은 장소 이미지 중복 결제 방지). fill-city 가 **강제**(옵션 아님). ⚠️ BTS 좌표오탐 제외(⑧ stage5) 선행 필수.

---

## 3-A. 🔴🔴 기존자료 도시 운영 흐름 = 진입 분기 + 3단계 (= 반복 SSOT, 2026-06-23 사장님 확정·실증)

> **§3(표준 프로세스)은 "완전 0자료 신규도시" 기준이다. 그러나 실제 운영은 거의 다 "레거시(이미 Gemini 1차 시드발굴된) 도시"** = 이 변형 흐름이 **fillCity 의 메인동작**(0자료는 극히 드묾). 실증: 파리·마드리드·런던·브뤼셀·라스베거스·뮌헨 = 전부 4~5월 Gemini 발굴 흔적(생성일) 있음.

### 🔀 진입 분기 (= 메인앱 MIX↔db-only 처럼, 행수 120 기준 = 2026-06-23 실증)
- **비BTS 총 행수(식당 포함) ≥ 120 = [변형 갈래]** = 1차 발굴됨 = **정제 → 식당발굴 → #45** (= 메인). 실증: 런던452·뮌헨134·라스베거스151.
- **< 120 = [풀 갈래]** = 1차 발굴 불완전(일부 cat 0) = 6cat 부족분 발굴부터 → 변형 합류. 실증: 마르세유113(heritage·shop 0)·제네바45(5cat 0).
- 근거: Gemini 1차 발굴(TOP20 요청)이 제대로 되면 = 도시특성으로 일부 cat 적어도(뮌헨 adventure 6) 합계는 120 넘음. 안 넘으면 = 발굴 누락.

### 변형 갈래 3단계 (= 순서 = 사장님 SSOT 2026-06-23)

```
1. 정제 (cleanse) = ⚠️ 전체 시스템 (AI 인위 아님) = #45 이전 독립 단계 (섞지 말 것)
   → `fill-city.ts --only=cleanse --apply` (= scripts/fillcity-step1b-fix-pollution.ts)
   → 전체 행 → Gemini 에 힌트(name 3종·주소·좌표) 있는 대로 다 줌 → Gemini 가 (사람처럼) 판단:
       · 가격 오염(박물관 €13만 = 옛 gemini3 환각) → 정상값 교정
       · 이름 환각/칸 오입력(Magnificent Mile→Tate Modern, Atlanta→Manneken Pis) → 교정
       · 결손 가격도 채움
   → 전필드 새덮어쓰기(셀렉 X). shopping price = NULL 강제(§15). Gemini 만(TS·PM 0) = 도시당 1~2콜(120/콜).
   → 실증(2026-06-23): 런던28·브뤼셀16·뮌헨17곳 정정. 최대 €504,210(뮌헨 박물관)→€175. 비식당 price>200 오염 = 0.
   → ⚠️ 옛 "#1a 환각 행 AI 인위 삭제" = #1b 가 흡수 폐기(§19). 힌트 1개라도 있으면 Gemini 가 판단 = 삭제 불필요.

2. 식당 발굴 = ⚠️⚠️ AI 개입 0 자동화
   → `fill-city.ts --city-id=N --only=restaurant --apply`
   → 6cat 안 건드림. 도심(Gemini03+TS3종) ∥ 외곽(Gemini04+outskirt-ts-fill) → 병합 → 카피13 → 이미지
   → 식당 = Gemini·TS 둘 다 독자발굴(= TS nearby POPULARITY 가 Gemini 놓친 인기식당 잡음 = 최대풀 §8).

3. #45 도시 전체 = 결손보강·보정 (그대로, 섞지 말 것)
   → `fill-city.ts --city-id=N --only=repair --apply` (= scripts/fill45-defect-repair.ts)
   → 추출(6cat TOP20 + 식당 band 30/90/30 = 270) 결손행 → Gemini→TS→PM → 최종 270 결손0.
   → 정제 후라 결손률↓ + 가격오류·이상행 미리잡힘 = 이중체크.
```

### 한 줄 전체 자동 = `fill-city.ts --city-id=N --apply`
- `only` 기본값 = `[cleanse, repair, discover, curate, backfill, photo, restaurant, verify]` = **cleanse(정제)가 맨 앞** = 전체 자동.
- 단계 분리 실행 = `--only=cleanse` / `--only=restaurant` / `--only=repair` (= 사장님 단계별 집행 시).

### 07-merge(사후 중복병합) = 통일 지켜지면 불필요 (헌법 §20)
- 정제·발굴·#45 통일 양식이면 시스템이 중복을 안 만듦 = 07-merge 상시 X. (2026-06-22 런던 식당 21쌍 = 옛 발굴 잔존 1회용 정리뿐.)
- 07-merge 후처리 = 표준화 완료(meta name_en 추가 + 안전망 3칸 이름토큰 = run 매처 정합, 2026-06-23).

### 좌표 기준 = 무조건 10m (= 검색 앵커·매칭 동일, 2026-06-23 사장님 SSOT)
- 옛 검색 앵커 100m = AI 임의 = 폐기(§19). ANCHOR_M=10 전수 통일(ts-backfill·ts-photo·restaurant-image·fill45). 도심밀집 환각 차단.

### AI 가 지킬 것
- 정제·발굴·#45 = **시스템 믿고 한 줄** = 잘라쓰기·임시플래그·전체통째·#45에 발굴 섞기 금지(= 2026-06-20~23 반복 과실).
- 비가역 삭제(환각 행 등) = 삭제 전 사장님 보고(§1·§14). 옆도시·체인은 정상(= [[feedback_outskirt_daytrip_pool_intended]]).
- = [[feedback_unified_psr_pipeline]] · [[feedback_ai_writes_novels_not_systems]] · [[feedback_action_discipline]].

---

## 4. 구현 체인 (= `fill-city.ts`, 6단계 + ⓪)

| # | 단계 | 컴포넌트 | 소스 | 역할 |
|---|---|---|---|---|
| **⓪ repair** | **결손보강·보정 (#45)** | [`scripts/fill45-defect-repair.ts`](../scripts/fill45-defect-repair.ts) | Gemini+TS+PM | **발굴 전 사전정제 / 독립 1회용**(`--only=repair`). 결손행 추출(band 30/90/30)→Gemini카피→TS 9요소→PM이미지→2곳저장. 다시 돌려도 안전(완비=추출0). |
| ⓪ | city-meta | `shared/gemini-city-meta.ts` | Gemini | (신규도시) `cities` 좌표 행 생성 = downtown 발굴 전제 |
| ① | discover | `12-ts-discover-pool` ∥ `01-discover-6cats` | TS ∥ Gemini | 6cat 발굴 → `upsertPlace` 7단계 병합 / 신규 placeholder rank |
| ② | curate | `02-enrich-place --defects-only` | Gemini | 요약2 + 가격 결손행 보강 |
| ③ | backfill | `fill/ts-backfill` | TS | PID/RC/가격 결손행(= Gemini 환각 검증) |
| ④ | photo | `fill/ts-photo-fill --top=20` | TS | 카테고리별 RC TOP20 이미지(PhotoMedia→Storage) |
| ⑤ | restaurant | 도심[`12-pool` 3종 + `03`] ∥ 외곽[`12-pool` + `04`] → `13` 카피 | TS ∥ Gemini | 식당 최대풀 → 병합 → 카피 → **이미지 = §8.2 도시상대 가격띠 quota**(단일 TOP20 아님) |
| ⑥ | verify | `verifyReport()` | DB | TOP20 완비 리포트(비용 0) |

- **랭킹(추출)** = `fill/rc-rerank` = backfill 후 자동 = RC DESC NULLS LAST.
- **07-merge-dups** = **이미지(④⑤) 직전 필수 게이트**(강제) = 중복 keep 1행만 PM = 호출 최소화 + 검수. (옛 "필요시만" 폐기, 2026-06-09 사용자 SSOT)
- ⚠️ `06-ts-pm-enrich`(옛 PID+이미지 합본) = **③+④ 분리(ts-backfill / ts-photo-fill)로 대체** = 레거시.

---

## 5. 단일 관문 / SSOT (불변 = 우회 금지, §14/§16)

| 책임 | 단일 진입점 | 규칙 |
|---|---|---|
| 매칭(동일장소) | `shared/matcher.ts` `matchCandidate` | 7단계 (= DB 트리거 ≡ `upsertPlace` ≡ `07-merge` ≡ ag3 동일 1벌) |
| 쓰기(INSERT/UPDATE) | `place-upsert.ts` `upsertPlace` | COALESCE 새우선 / 가격 COALESCE 새우선 / UNION tags / **rank placeholder** |
| TS 호출 | `shared/ts-client.ts` `tsSearch`·`tsPhoto` | 9요소 FieldMask 강제 + Atmosphere 차단(§15) |
| Gemini 호출 | `shared/geminiClient.ts` | gemini-3-flash, grounding |
| SKU 가드 | `shared/google-places-sku.ts` `validateFieldMask` | Enterprise 한도, Atmosphere throw |
| 랭킹 | `fill/rc-rerank.ts` | 순수 RC DESC, 입력단 rank 무시 |
| DB 문지기 | 트리거 `place_seed_raw_prevent_dup` | BEFORE INSERT = 어떤 루트든 7단계 통과 강제 |

---

## 6. 7단계 매칭 (= 동일장소 판정)

- **불변(확정 = 병합)**: 1) PID 2) URI 3) 풀주소+로컬이름 4) 좌표10m 5) 로컬이름(name_local)
- **가변(의심 = 새저장 + `중복의심`+`의심대상-<id>` 메모)**: 6) 영어명(name_en) 7) 한국어명(name_ko)
- **samePlace veto**: URI(cid) 둘 다 있고 다르면 = 확정 다른 장소 = 보조매칭 제외. ⚠️ 2026-06-15 = PID 차이는 veto 아님(우리 PID 오류 가능 = TS 가 교정 = matcher.ts samePlace 와 동형). = 즉 PID 가 달라도 주소·좌표·로컬이름 일치 시 병합. <!-- ⚠️ 수정금지(승인필요) — matcher PID veto 제거 동기화(2026-06-15 SSOT) -->
- **cityId 강제**: 이름 단계(5~7) = 동명 다른도시 별개 행.

---

## 7. 랭킹 = DB 내부 자동 (인위 건건이 X)

- **입력단**(`upsertPlace`/문지기) = **rank 무시** = 신규는 placeholder(MAX+1 = 바닥). Gemini rank = 입력순서.
- **확정** = `rc-rerank`: `ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY google_review_count DESC NULLS LAST, id)`.
- RC 없으면 바닥 → **RC 오면(ts-backfill) 다음 rerank 에서 회복**.
- ⚠️ **RC 출처 = TS 단독**(TS는 RC를 PID와 함께 반환). **PID 없는데 RC 있음 = 비-TS 조작값** = 랭킹 신뢰 불가 → ⑧ 가드(rc-rerank 가 PID 없는 행 RC 무시). 레거시 wikipedia_api 가짜 RC = 마드리드 30행 NULL(2026-06-09).
- `bts_army_zone`/`bts_merch_store` = 제외(rank=1 고정 보존).
- 트랜잭션 원자성: `rank=-id` 임시 → 재계산 → COMMIT/ROLLBACK.

---

## 8. 식당 특수 (= 최대풀, 동선최적화)

- **최대풀** = TS 3종(searchNearby POPULARITY + searchText60 + premium 가격필터) + Gemini(03 도심 가격tier / 04 외곽 명소주변).
- **이유**: 동선최적화가 식당을 **이중 교차**(① 활동 근접[좌표] ② 예산 tier[가격])로 선택 → 각 끼니·예산대마다 가까운 식당 필요 → **풀이 클수록 동선 품질↑**.
- 식당 **카피(13)** = RC 후 = ②보충에 흡수(별도 단계 아님).

### 8.1 외곽 식당 = town 자동 시스템화 (= destinations.ts 폐기, 2026-06-08 확정)

> 도시별 수동 좌표 config(`DISCOVERY_ZONES`) = 1회성 = **폐기**. 도시명만으로 자동.

1. **Gemini 04** = 범용 타입힌트(`역사 구시가 / 궁전·성·유적 / 자연·국립공원 / 즐길거리(놀이공원·액티비티) / 쇼핑몰`, **도시명·지명 0**) → 외곽 식당 → **주소에서 town 추출 + town별 식당수(= 한국선호 강도)**.
2. **top 4-5 town**(식당수 상위) 선정.
3. **town명 → TS geocode** (`searchText "{town}, {country}"` → 중심좌표, 1콜).
4. **searchNearby POP** (중심좌표 ± ~5-10km, 20곳) = 객관 식당 풀.
5. `upsertPlace` 병합.

- **비용** = top5 × (geocode + searchNearby) ≈ **10 TS콜** (≈€0.3).
- **입증(2026-06-08)** = 마드리드 04 → Toledo 18 / Segovia 14 / Aranjuez 9 / Chinchón 7 / El Escorial 6 = town 추출 깔끔. (단 타입힌트 "쇼핑몰/즐길거리" 범용화는 B′ 시뮬에서 최종 확인.)
- ⚠️ **구현 = 1회성 스크립트 X = shared 컴포넌트**(12-pool 의 `destinations.ts` 의존 제거 → Gemini-town + geocode 입력) = §16/⑧ 정합. **POP 원칙 유지**(searchText 직접쿼리=RELEVANCE = 비채택).

### 8.2 식당 결손보강 추출 범위 = #45 WF 확정 (2026-06-20 사장님 SSOT)

<!-- ⚠️ 2026-06-20 §19 완전교체 = 옛 §8.2(도심80/백분위/외곽town quota·restaurant-image-targets.ts) 완전삭제 = #45 WF 실증확정 로직으로 1벌 통일. 옛 도심/외곽 구분·백분위 경계 = 폐기. -->

> 식당 추출 = **도심/외곽 구분 없음 = 그 도시 `restaurant` 카테고리 전체**가 대상.
> 가격대(band)별 풀 안 순위로 추출 (= #45 결손보강 WF `scripts/fill45-defect-repair.ts` 추출 SQL = 정본).

**① band(가격대) = 가격으로 SQL 분류 (PSR에 band 컬럼 없음 = 조건검색)**
- eco(경제적) = `price_eur ≤ 24` / reason(합리적) = `25~60` / premium·luxury = `60+`.
- SQL = `CASE WHEN price_eur<=24 THEN 'eco' WHEN price_eur<=60 THEN 'reason' ELSE 'premium' END`.

**② 추출 = band별 풀 안 RC순(=rank) 상위 N**
- eco 풀 **상위 30** / reason 풀 **상위 90** / premium·luxury 풀 **상위 30**.
- = `ROW_NUMBER() OVER (PARTITION BY band ORDER BY rank ASC)` ≤ 30/90/30. (rank = autorank 트리거가 RC DESC 자동 = §7).
- ⚠️ **band 풀 안 순위지 전체 rank 아님** = 전체 rank 188위도 reason 풀 안에선 90 안일 수 있음(정상).

**③ 6cat(비식당) = rank 1~20** (= §1 RC순 TOP20, 식당과 별개).

**④ 결손 판정 = 12요소 중 하나라도 빔** = 그 행 전체를 WF(Gemini→TS→PM)로 보강.
- 이미지 결손 = `image_url IS NULL OR NOT LIKE '%place-images%'`(구글 PM 외 = WK·외부 = 결손).

**⑤ 실시간 유지 = 업데이트마다 순위 변동 정상**: TS가 최신 RC 덮어씀 → autorank 트리거가 즉시 rank 재배치 → 다음 추출은 그 시점 실시간. "옛 rank/새 rank" 없음 = 매 시점이 실시간 현재.

**⑥ ⚠️ 동선 예산과 분리**: route `MEAL_BUDGET`(€40/100/300) = 사용자 지갑=절대값 = 그대로. 본 §8.2 = 결손보강 추출 전용.

**입증(2026-06-20)**: 파리·마드리드 #45 WF 실행 = 추출(band 30/90/30)→Gemini→TS→PM→2곳저장 정상. 다시 돌려도 안전 = 재실행 시 추출 0(결손 0=완비). PID 중복 6쌍 = 07-merge 인위병합 해소. = 두 도시 완비 입증.

---

## 9. BTS 보존 (1년 임시·미니앱 핵심)

- `bts_venue` / `bts_army_zone` / `bts_merch_store` = **07-merge 병합 X = 보존**. 콘서트 후 최후 통합 예정.
- rc-rerank = army_zone/merch_store 제외(rank=1 고정). bts_venue 는 실장소 RC 있어 일반 랭킹.

---

## 10. 컴포넌트 인벤토리 (재발명 0 = §16)

- **shared 관문**: matcher · place-upsert · ts-client · geminiClient · google-places-sku · gemini-city-meta · gemini-curate · place-image · api-keys-loader
- **fill**: ts-backfill · ts-photo-fill · rc-rerank
- **prompts(발굴/카피)**: 01-discover-6cats · 02-enrich-place · 12-ts-discover-pool · 13-restaurant-summary · 03-downtown-restaurant · 04-outskirt-restaurant (= 2026-06-08 un-archive = prompts/ 복귀, ROOT 근본해소)
- **fill/(영구 TS 컴포넌트)**: ts-backfill · ts-photo-fill · rc-rerank · **outskirt-ts-fill**(2026-06-08 = town 자동 시스템화, §8.1)
- **prompts(검수/정제)**: 05-text-recategorize · 05-restaurant-reverify · 07-merge-dups · 08-wk-image-fill · 06-ts-pm-enrich(레거시)

---

## 11. 실행 인터페이스

**현재 (CLI)**:
```
# 전체 WF (repair 사전정제 → 발굴 → ... → verify)
npx tsx .claude/skills/raw-db-verify-and-complete/fill-city.ts --city-id=N [--apply] \
  [--only=repair,discover,curate,backfill,photo,restaurant,verify] [--lang=fr] [--outskirt-hints="Toledo / Segovia"]

# 독립 1회용 = #45 결손보강·보정만 (완비 도시 재점검)
npx tsx .claude/skills/raw-db-verify-and-complete/fill-city.ts --city-id=N --only=repair --apply
# (또는 직접) npx tsx scripts/fill45-defect-repair.ts --city-id=N [--apply] [--only-id=ID]
```
- `--apply` 없으면 = **DRY**(비용추정 + 완비 리포트, API 0). repair(#45) 단독 DRY = `fill45-defect-repair.ts --city-id=N`(결손 분포 표시).

**다음 (FE 관리자 대시보드)**:
- `/admin` 독립 HTML → `POST /api/admin/fillcity {cityId, only?}` → 백그라운드 spawn → 진행률 + 완비 리포트 표시.
- 앱(RN)과 분리 = 대시보드는 독립 웹페이지.

---

## 12. 검증 기준 (= 확정 입증)

- matcher golden **11/0**.
- 같은 입력 재입력 = **중복 0 / 신규만 INSERT**.
- rc-rerank **RC역전 0** (파리 749 / 마드리드 317 검증).
- 07-merge = 진짜 병합만 + **BTS 보존**.
- TOP20 완비율(⑥ verify 리포트)로 도시별 완성도 추적.

---

## 13. 구현 단계 트래커 (= 컴팩팅 생존 SSOT)

> ⚠️ 각 단계 완료 = **이 표 + 메모리 `project_fillcity_prd` 갱신** = 컴팩팅돼도 이 문서로 재개.
> 상태: ✅실증 / 🔄부분 / ⬜대기 · 🩹땜빵(=⑧ 리팩토링이 흡수)

| # | 단계 | 컴포넌트 | 상태 | 검증 기준 |
|---|---|---|---|---|
| **⓪ repair** | **#45 결손보강·보정** | [`scripts/fill45-defect-repair.ts`](../scripts/fill45-defect-repair.ts) | ✅ **파리·마드리드 완비+다시돌려도 안전(2026-06-20)** | 추출(band 30/90/30)→Gemini→TS→PM→2곳저장. 재실행 추출0. fill-city ⓪ 연결+독립 1회용. 카탈로그 #45 등재 |
| 0 | city-meta (신규도시) | gemini-city-meta(#04) | ⬜ 미배선 | cities 행 자동 생성 |
| 1 | 발굴 6비식당 | TS #30 ∥ Gemini #06 | ✅ 마드리드(359) | 행수↑·중복0 |
| 2 | 발굴 식당 도심 | TS #32 합본 ∥ Gemini 03 | ✅ 마드리드 도심 242(Gemini 91 + TS 108, dedup) | 도심 식당 풀 |
| 3 | 발굴 식당 외곽 | Gemini 04(범용타입) → town추출 → **fill/outskirt-ts-fill** | ✅ 마드리드 219(RC 42→142, 신규75+백필25, geocode 5/5, config0) | town별 searchNearby POP |
| 4 | 보충 | **#45 가 흡수**(Gemini #02 + TS #28) | ✅ **#45 로 통합(2026-06-20)** | 결손행 행 전체 refresh |
| 5 | 추출/랭킹 | fill/rc-rerank + autorank 트리거 | ✅ 파리·마드리드 | RC DESC 역전0. 실시간(§8.2⑤) |
| 6 | 이미지 | **#45 PM**(무료재링크→남은 결손만, photo 1개) | ✅ **#45 로 통합(2026-06-20)** = 파리·마드리드 | photos[0] 대표 1장 |
| 7 | 중복정리 | 07-merge(#43) | ✅ **파리 PID중복 6쌍 병합(2026-06-20)** | 진짜병합+BTS보존 |
| **8** | **🔴 시스템화 리팩토링** | ⓐgeminiJson(#01=키받는 배관·무판단) ⓑshared/skill-runtime ⓒname_en 전면제거 ⓓmatcher name_local 토큰매칭 ⓔ12-pool 삭제후보 로직수정 ⓕ07-merge BTS제외 | 🔄 **출입증(#01배관·api-gate→issue-api-key)·#45통합 ✅(2026-06-20)** / matcher중복·ag3 ko제거 ⬜ | 보일러플레이트 0·게이트웨이 강제·영어 의존 0 |

### 버그로그 (= 재발견 방지 / 🩹 = ⑧이 근본 흡수)
| 버그 | 위치 | 상태 |
|---|---|---|
| grounding+responseMimeType=빈응답(INVALID_ARGUMENT) | 01/03/04 **raw fetch**(geminiJson 우회) | 🩹 3곳 개별패치 → ⑧ geminiJson 통일 시 영구소멸 |
| ROOT 5→6 (.env ENOENT) | _archived 03/04 run+post | 🩹 패치 → ⑧ skill-runtime 흡수 |
| pathToFileURL (Win ESM import) | 04 post, 01 post | 🩹 패치 → ⑧ skill-runtime 흡수 |
| matchedBy 구키(name→name_local 등) | 04 post | 🩹 패치(7단계 키 정합) |
| town 추출=주(Madrid) 오인(4세그먼트 주소) | fill/outskirt-ts-fill | ✅ DRY 에서 발견→우편번호 세그먼트 우선+도심명 제외 정밀화(비용0, 신규 컴포넌트라 땜빵 아님) |
| 12-pool "삭제후보"(TS-authority = non-ts downtown 삭제) | 12-pool post-process | ⚠️ **미해결 = 승인금지**(플래그만, 삭제 안 됨) = 상호보완(TS∥Gemini)과 충돌 = ⑧에서 삭제로직 수정 |
| _archived 03/04 ROOT/ESM/responseMimeType (4종) | 03/04 run·post | ✅ **근본해소 = un-archive(prompts/ 복귀)** = 03 라이브 검증 120/120 |
| 가짜 RC 랭킹오염 (PID없음+RC있음 = 비-TS 조작값) | 레거시 `wikipedia_api` 시드(2026-05-02) | ✅ 마드리드 30행 NULL(2026-06-09) = 규칙(RC=TS단독, §7). 타 도시 동일 가능 → ⑧ 랭킹가드로 영구화 |
| 🔴 07-merge 확정셋에 **BTS 오탐**(좌표10m) 혼입 = `--apply-tiers` 맹목 시 BTS DELETE | 07-merge(BTS 미제외) | ⚠️ **미해결 = ⑧ stage5 BTS제외 선행 필수**. 실증(2026-06-09 마드리드 07-merge dry): group 67795 = 스타디움+BTS3 좌표매칭. **자동병합 금지** |
| 07-merge 검증 = 두 도시 거의 깨끗 + ⑧ 실증 | 마드리드/파리 07-merge dry(2026-06-09) | ✅ 파리 확정1 / 마드리드 확정8(진짜6+BTS오탐1+경계1)·의심11. 의심 중 **실중복3**(로컬이름 접미사차=tier4 놓침→⑧4 토큰매칭이면 확정승격) + **name_en환각 오탐4**(→⑧8a면 소멸) = ⑧ 4·4'·5·8a 실데이터 입증 |
| (A) NULL-RC 외곽 채움 6곳 TS검증 = ⑧4·dedup 실증 | `ts-backfill --ids`(신규 추가형 필터, 사용자 승인) | ✅ 2026-06-09: 3 깨끗채움(Volapié1780·VIPS4557·Sibuya1874) / 1 폐업드롭(Café&Tapas) / **2 기존행 중복폭로**(Casa Duque 76837=기존76919 / Amura 76815→신규77178 중복의심). 원인=이름부분불일치 → **⑧4 토큰매칭 필요 + PM전 dedup 필수** 재확인. ⚠️ 77178 신규1행(중복의심 플래그=설계대로) |

### 🔴🔴 즉시재개점 (2026-06-21 = 최신 = 이것부터)

- **기존자료 도시 운영 흐름 = §3-A 신설·확정**(사장님 SSOT): 거의 모든 도시 = 6cat 이미 Gemini 시드발굴됨 = 식당만 적음 → **반복 3단계 = ① 정제(AI 인위 오염행 삭제, 삭제 전 보고) → ② 식당발굴(`fill-city --only=restaurant --apply` = AI 개입0 자동) → ③ #45 도시전체(`fill45-defect-repair --city-id=N --apply`) = 최소270 결손0**. 코드의 repair-맨앞 1줄 = "0자료 신규도시"용. = 컴포넌트 동일, 호출 조합만 다름(코드변경 아님).
- **미커밋 없음**(working tree clean) = 2026-06-21 브뤼셀·GREATEST·#45원복 = 커밋 `7f60f98` 에 들어감.

### 🔴🔴 즉시재개점 (2026-06-20 = 이력)

- **#45 결손보강·보정 WF 완성·커밋·푸시**(커밋 `c8543ef`): 추출(6cat TOP20 ∪ 식당 band 30/90/30)→Gemini(02-enrich)→TS(9요소 건건)→PM(무료재링크→남은결손)→2곳저장(TS 06형태 모음 1파일). 우리 id 직행 UPDATE(매칭X=빗나감0). 다시 돌려도 안전 = 재실행 추출0. **파리·마드리드 완비 실증**.
- **출입증 구조 확정**(사장님 SSOT = 사용자 env / 관리자 출입증): #01 geminiClient = 키 받는 무판단 배관(apiKey 인자=관리자 출입증 / 미전달=사용자 메인앱 env). gemini-curate·ts-client·save-raw = 관리자 백그라운드 전용 옵션(출입증·localSkip). 카탈로그 #01 모순문구("모든 단일진입점") 제거.
- **파리 PID 중복 6쌍 인위병합**(07-merge): 60341·61994·62024·62042·72286·62069 keep / 77595~77601 삭제. 원인 = 옛 ag3 languageCode:'ko'로 한국어가 name_local에 들어가 매칭 깨짐.
- **#45 ↔ fillCity 연결**: fill-city.ts `only` 맨 앞 'repair' = ⓪ 사전정제(발굴 전 자동) + 독립 1회용(`--only=repair`). 재발명0 = run() 틀에 한 줄.
- **문서 정합**: 카탈로그 #45 E섹션 verbatim 등재(Gemini프롬프트+TS+PM+SQL) / PRD §3·§4·§8.2·§11·§13 #45 반영.
- **미커밋**: fill-city.ts(repair 연결) + FILLCITY_PRD.md(이 갱신). = 커밋 대기.

### 🔴 다음 P0 (사장님 판단 대기)
1. **다음 도시 결손보강**(#45) = 6/30 전 Egress 여유 시(유료 전환 회피). 단 이미지 PM = Egress 무거움 = 신중.
2. **ag3 languageCode:'ko' 제거** = name_en 정합(한국어 오염 차단) = 라이브앱 = 사장님 예외승인됨, 별도 신중.
3. **matcher 중복**(트리거 ≡ matcher.ts 2벌) = §19 정합 = ⑧ 단계.
4. **city-meta(⓪) 미배선** = 신규도시 자동.

---

### 즉시재개점 (2026-06-09 = 이력)
- **완료 = 마드리드 발굴 + 보충**: 식당 **42→418**(도심 242=Gemini03+TS#32합본 / 외곽 176=Gemini04+outskirt-ts-fill, RC 264) + 6cat 313. **보충(②/④)** = 02(비식당)+13(식당)으로 추천·감성 빈곳 **325→4**(321 채움) + 식당가격 34 채움. **객관 검증 통과**(02 post:73-80 = 식별값 기존우선 = 좌표·주소·이름 무손상 / id 매칭 / 13 = TS 가격 보존). 내용 정확성 = Gemini 그라운딩 신뢰(AI 판단 X). 신규 `fill/outskirt-ts-fill.ts`. 03/04 un-archive. 04 범용표준화. 01/02/03/04/13 responseMimeType 빈응답버그 제거.
- **미커밋(대규모, working tree만 = "시스템화+실증 후 커밋" 원칙)**: 03/04 un-archive(이동+ROOT복귀+post수정) + 04표준화 + `fill/outskirt-ts-fill.ts`(신규) + 01/02/03/04/13 responseMimeType 제거 + fill-city/PRD/catalog 경로 + hotspot rooftop 동기화 + 메모리.
- ⚠️ **matcher.ts = 원본 그대로**(⑧ stage4 매처수정 = MatchedBy 1줄 시도 후 **즉시 원복** = 반쪽 안 남김. 설계는 §14 + plan `~/.claude/plans/serialized-spinning-frog.md` 에 대기).
- **추가 완료(2026-06-09)**: ⓐ **가짜 RC 정화** = 레거시 wikipedia_api 30행(PID없음+RC있음=조작) `google_review_count` NULL → 랭킹 오염 제거(adventure top20 PID결손 14→0, 진짜 TS행 부상). ⓑ **식당 이미지 규칙 §8.2 확정+구현** = 도시상대 가격띠(백분위) + quota(도심 20/40/20 · 외곽 자격town[≥6]×2/4/2) + Prem/Lux통합 + **신규 컴포넌트 `fill/restaurant-image-targets` 빌드+실증**. ⓒ **마드리드 PM 실증 = 165/165 이미지 채움**(식당 113 + 비식당 52[ts-photo-fill], 실패0, €6.28). ⚠️ dedup skip 0 = 접미사-차 중복쌍(Restaurante Coque/Coque 등 ~5) 둘 다 이미지 + 신규 플래그중복 2(Sacha·Amura 77178) = **⑧4 매처+dedup 게이트 정리 필요**(또 실증).
- **⓪-pre 정제 실행(마드리드, 수동 2026-06-09, 사용자 책임결정 a>c>E)**: A=순수쓰레기 4행 삭제(위키제목 adventure) + C=Tanatorio(장례식장) 1행 삭제 + **E=중복 14행 병합**(07-merge `--apply-groups` 명시키, BTS tier3 제외) = 검증통과(삭제대상0잔존·BTS4보존·keep14생존). 마드리드 = **715 비BTS + 3 BTS = 718 클린**. 접미사쌍(Coque·Sacha·La Bien Aparecida) 정리됨. 미병합=Amura(다른town)·Montia·Aventura Amazonia(지점)·승마(체인)·La Postal.
- **name_local 결손 23 복구(2026-06-09)**: 13=내부(`name_en→name_local`, upsertPlace, €0) + 10=TS실명(좌표 searchNearby→PID매칭, €0.30) = 결손 0(식당 408 전부 name_local). 신규 `fill/ts-name-recover.ts`(내부우선+TS폴백). **시스템 근본 = 옛 경로(pre-2026-06-04 ts-client)가 Google PID 붙이고 displayName 버림 + 산출물 미저장 = 결손 원인**(현재 경로는 9요소+name_local+JSON저장 = 정상, 검증). 교훈 [[feedback_internal_first_recover]].
- **+2026-06-09 PM 정비/이미지**: 이름복구 23(13 내부 name_en→local + 10 TS실명 €0.30)=name_local 결손0 / 추가 중복병합 Montia·La Postal / 마드리드 이미지 = **6cat 120/120 + 식당 115/120**(5결손). 신규 `restaurant-image-targets.ts`·`ts-name-recover.ts`(미커밋).
- **🔴 핵심 막힘(다음 세션 필독)**: no-PID Gemini 행(Lúa·Zalacaín·Gofio 미슐랭 = RC없어 prem tier 패딩) **PM 시 매처가 TS twin과 못합치고 새 행 INSERT = 중복 생성 = whack-a-mole** → 5결손 PM으로 못닫음. B단계서 Lúa·Zalacaín 옛 no-PID 2행 정리 필요. **⑧4 토큰매처가 진짜 해답**(verify=병합=중복0+이미지 상속). ⚠️ fill-city 한줄=미배선=**자동화 아직 없음(전부 수동)**, "이 셋이면 240/240"은 과소평가(실제 235).
- **다음 P0 (사용자 판단 대기)**: **⑧4 매처 토큰부분집합(§14 승인)** = 중복 사이클 근본 차단 → 그 후 5결손 자동완성 / + ⑧5 07 BTS제외 / fill-city 배선 / 커밋. 교훈 [[feedback_internal_first_recover]].
- **이번 세션 교훈(메모리화 완료)**: ⛔커밋=시스템화+실증완료만 / ⛔외부호출 무료없음(Gemini도 유료=토큰비용) / ⛔검증=객관·사실만(id매칭·무손상·교차대조, 내용품질 판단 X = Gemini 그라운딩 신뢰).

---

## 14. ⑧ 통합 시스템화 로드맵 (= ultracode audit+설계+적대검증, 2026-06-08)

> 8 에이전트 워크플로우(audit 6 병렬 → 통합설계 → 적대적 critic). 전체 설계 원문 = `tasks/w3h268kqt.output`(workflow). **critic 이 설계의 거짓주장 2건 + load-bearing 누락 4건 교정** = 아래는 교정 반영 확정본. **읽기전용 audit = 코드/DB 변경 0.**

### 아키텍처 = 게이트웨이 4 + 단일매처 + 오케스트레이터
- `shared/skill-runtime`(신규: env·ROOT·pg·Win-ESM·apiKey 1벌) / `geminiClient`(모든 Gemini) / `ts-client`(모든 TS) / `google-places-sku`.
- `matcher.ts` 1벌 ≡ DB트리거 ≡ 07 ≡ ag3. ⚠️ **단 critic 발견 = `12-pool/post-process.ts:184-189` 식당흐름이 inline `matchRow` = shared 매처 미사용 = 이중화** → 정합 필요(단계 4').
- **불변 유지·흡수**: 발굴완료(마드리드 418)·matcher SSOT(`975d55d`)·rc-rerank·ts-client·upsertPlace·un-archive 03/04 = 재발명 0.

### 로드맵 (게이트웨이·자동화 앞 → DB변경 뒤, 각 단계 3게이트§17)
> ⚠️ **커밋 원칙(사용자 SSOT 2026-06-08)**: 수정+실증+**시스템화 완료 단위만** 커밋. interim/미완/땜빵 커밋 금지 → **CP0(현 미커밋 즉시커밋) 폐기**. 커밋 = 체크포인트 A/B/C(각 단계군 시스템화+실증 후)에서만. 현 미커밋분(un-archive·outskirt-ts-fill·표준화)은 ⑧ 안에서 최종형태 정리·실증 후 A 에서 함께 커밋. 그동안 = working tree + PRD/메모리 기록으로 생존.
| # | 항목 | DB | 위험 | critic 교정 |
|---|---|---|---|---|
| 1 | `skill-runtime` (ⓑ) = .env·ROOT·pg·ESM·key 1벌 | X | 무 | 무위험 1개(rc-rerank)부터 |
| 2 | Gemini raw→`geminiJson` = **4곳**(02·05recat·05reverify·13) | X | 저중 | seed-gemini 제외(mime버그 無, 통일만) |
| 3 | TS마스크 정합: **cron 3요소**(addr+price+status) + 발굴2곳 | X(읽기) | 중 | addr 누락 추가 식별 |
| **A** | **커밋 = 게이트웨이 4벌 완결** | | | |
| 4 | `matcher` step3 단어-토큰 부분집합 (ⓓ) | X(읽기) | 중 | golden #8(substring 의존) 명시 회귀검증 |
| **4'** | **12-pool 식당 inline matchRow → shared matchCandidate** | X | 중 | 🔴 **critic 신규=필수**(안 하면 매처수정 식당 미전파) |
| 5 | 07-merge BTS제외 (ⓕ) + **keep/tier 모순 동시해소** | DELETE | 작업高 | selectKeep name tiebreaker + tier라벨(post≠run) 동기 |
| **B** | **커밋 = 매처·dedup 정합** | | | |
| 6 | fill-city 배선(⓪city-meta·rc-rerank자동·외곽 outskirt-ts-fill·**식당이미지=`restaurant-image-targets` §8.2**·**07-merge dedup 필수 게이트=이미지 전 강제**) | X | 중 | destinations.ts 의존 끊기 + 식당 이미지 도시상대 가격띠 + PM 최소화 |
| 7 | 12-pool 삭제후보 = "TS+Gemini 병합 후 RC탈락" 보고로 (ⓔ) | X(보고) | 저 | 쓰기 0 |
| **C** | **커밋 = 오케스트레이터·보고** | | | |
| 8a | name_en 매칭폐기 폴백 = **의존 5곳** | X | 중 | matcher132·upsert85·**upsert206-212 race retry**·트리거·**12pool294 UNIQUE skip** |
| 8b | 트리거 parity + UNIQUE `name_en`→`name_local` 전환 | **DDL** | **최고** | name_local 무제약=중복 多 예상 → 시뮬 SELECT(NULL행+중복행수)+**pg_dump 백업** 선행, 주소단계=plpgsql 재작성(단순미러 아님) |
| 8c | parity 검증(트리거≡matcher byte 동형) | X | 중 | golden 11/0 유지 |

### critic 핵심 교정 (= 채택)
1. **매처 이중화**(12-pool 식당 inline) = 단계4' 추가 = 안 하면 단계4·5·8 matcher 수정이 식당 dedup 에 **미전파**.
2. **07 keep/tier 모순**: `post selectKeep` name tiebreaker 누락(run 주석 불일치) + `--apply-tiers` 라벨 구체계(4=의심) vs run 신체계(4=불변) 드리프트 = 잘못 적용 시 위험.
3. name_en 의존 = **5곳**(race retry·12-pool UNIQUE skip 추가). cron 결손 = **3요소**(addr 추가).
4. **8b 구조적 위험**: 글로벌 UNIQUE 가 name_en 기준이라 name_local 중복이 DB 에 이미 다수 가능 = 전환 시 대량 충돌 高확률 = 시뮬·백업 없이 DDL 금지.

### 게이트
- 단계 1~4·4'·6·7 = 코드·읽기 = 무DB. 단계 5(물리DELETE)·8b(DDL) = **시뮬→사용자 명시 승인 후만**(§14·€860 비가역).
- 각 단계 = /simplify·/review·tsc + 커밋 체크포인트. DB변경 = 트랜잭션·백업.
