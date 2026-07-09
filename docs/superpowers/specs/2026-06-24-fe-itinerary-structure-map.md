# 메인앱 FE 구조도 (현재 상태 SSOT) — 2026-07-04

> 현재 화면 = AI가 아이폰12(390px) Chrome DevTools로 직접 본 실측 + 완료분 반영. 현재 구도 + 남은 것만.
> **범위**: 메인 5탭 + 여정흐름(입력/로딩/결과) + 프로필 나의여정 + AI 의견 오버레이. (BTS·온보딩·로그인 제외)
> **검증방식**: 배포 후 Chrome DevTools 모바일에뮬(아이폰12/삼성폰) 직접 시각검증(CLAUDE.md §21). iOS 앱 전용동작=사장님 실기기.

---

## A. 화면 지도 (메인 5탭 = 하단 탭바)

```
   ✏️일정      🧠AI 의견     ✅전문가     👤프로필      ⚙️설정(모달)
   TripPlanner  오버레이호출   검증요청     ProfileScreen  AdminModal
   Input/        (여정있을때    일정있을때만  아바타·나의여정  비번인증
   Loading/       =활성화)                  ·스타일·설정
   Result ★
```

| 탭 | 화면 | 파일 | 상태 |
|---|---|---|---|
| ①일정 | TripPlannerScreen | `client/screens/TripPlannerScreen.tsx` | Input/Loading/Result |
| ②AI 의견 | 버튼(preventDefault→오버레이) | `MainTabNavigator.tsx` | 결과화면(screen==="Result")일 때만 활성. brain 아이콘 |
| ③전문가 | VerificationRequestScreen | `VerificationRequestScreen.tsx` | 일정 있을때만 |
| ④프로필 | ProfileScreen | `ProfileScreen.tsx` | 게스트/로그인 분기 |
| ⑤설정 | AdminModal | `AdminScreen.tsx` | 비번(preventDefault→모달) |

> **②탭 = AI 의견 (2026-07-04 확정)**: 지도 토글 더미탭 폐기 = 2026-07-04(지도가 B-D 고정섹션이 되며 불필요). Lucide `brain` 아이콘(이모지 금지). 활성 조건 = "이 화면에 지도 섹션(필수요소)이 있는가" = `screen==="Result"`(지도 렌더 조건과 동일). 신호 배관 = `MapToggleContext`(새 Context 아님, 기존 확장).

---

## B. ①일정 — 결과화면 (Result) ★ [아이폰12 390px 실측 2026-07-03]

```
╔══════════════════════════════════════════════╗
║  ←            Paris              💾/⟳/✓        ║  B-A 헤더바(뒤로/저장버튼)
╠══════════════════════════════════════════════╣
║  26년 07-03 ~ 07-05   📍12개장소   💳1인 €211   ║  B-B 요약섹션1 (날짜아이콘 제거·연도축약)
║  가족(4명)의 모두를 위한 힐링 & 쇼핑 여행         ║  B-C 요약섹션2 (동행·대상·vibe / 이모지 없음)
╠══════════════════════════════════════════════╣
║  🗺️ 지도 고정섹션 (BTSPlaceMap 패턴, 항상표시)  ║  B-D 지도(마커=슬롯, 깃발=숙소/도심, 마커클릭→슬롯스크롤)
╠══════════════════════════════════════════════╣
║  Day 1  Paris            [🏠 숙소설정/변경]     ║  B-E Day헤더 (숙소 있으면 "변경")
║  🏠 출발: Paris 도심 기준 (또는 숙소명)          ║  B-F 출발바
║  ①[썸네일] 갤러리 라파예트 오스만               ║  B-G 슬롯카드
║     ⭐구글리뷰 95,188  🕐09:00-11:30            ║   (썸네일터치=외부맵 / 본문터치=지도마커)
║     쇼핑 안 해도 가야하는 이유?... (한줄요약)     ║   (이모지 정리·한줄요약 editorial_summary)
║     무료                                       ║
║   ↗ 메트로 3분·1.2km                           ║  B-H 이동구간바 (교통비 금액 표시 삭제=거리·시간만)
║  ...슬롯 반복...                                ║
║  1일차 합계(1인) 입장료€0 식사€90 교통€10(예상)  ║  B-I 일별합계 (교통비=구간수×€2.5, "(예상)" 필수)
║          1인 일 합계 €100                       ║
╚══════════════════════════════════════════════╝
```

| 코드 | 섹션 | 상태 |
|---|---|---|
| B-A | 헤더바(←/저장💾) | ✅ 저장버튼 = ⟳스피너(저장중=네트워크 실시간 동기화)→✓초록체크(완료순간 0.5초)→💾복귀. Alert팝업 없음. 복원여정/한화면 재저장=같은 id 덮어쓰기(PUT), 신규=새 카드(POST) |
| B-B | 요약섹션1(기간·장소·예산) | ✅ 날짜아이콘제거·연도축약("26년 07-03") |
| B-C | 요약섹션2(요약문장) | ✅ 이모지 제거·오타 수정 |
| B-D | 지도 고정섹션 | ✅ ItineraryMap(BTS패턴)·마커클릭↔슬롯·숙소깃발·동선라인폐기 |
| B-E | Day헤더+숙소버튼 | ✅ "숙소설정"↔"숙소변경"(설정시) |
| B-F | 출발바 | ✅ 숙소명/도심 표시 |
| B-G | 슬롯카드 | ✅ 이모지정리·한줄요약·썸네일↔본문 터치분리 |
| B-H | 이동구간바 | ✅ 교통비 금액 표시 삭제 + **교통수단 2가지 통일**(대중교통/드라이빙 가이드). metro·도보·bus·RER 세부수단 → 전부 "대중교통". 예: "대중교통 3분·1.2km" |
| B-I | 일별합계 | ✅ 대중교통 = 구간당 €2.5 균일(metro/bus/RER 구분 폐기). 일별합계 = 구간수×€2.5. **"(예상)" 라벨 필수**. 드라이빙 가이드 = 실가격 로직 유지(안 건드림) |

> **교통비 재산정(2026-07-04)**: `ag4-db-finalize.ts estimateTransitCost()` = metro/bus/RER 전부 `return 2.5`(구간당 정액). 근거 = 전 도시 대중교통 실시간 요금 반영 불가 → 최선의 균일 추정. 드라이빙 가이드(양쪽 경로)·MIX경로(transport-pricing-service 정교계산)는 안 건드림.

---

## C. ①일정 — 입력화면 (Input) [현재]

```
TRIPIS  [BTS콘서트투어]
목적지 [Paris]
숙소(선택) [구글위젯]  ← 선택하면 이 섹션 완전히 사라짐(안내문 "나중입력OK")
날짜 [26-07-03][26-07-05] 시간[09][21]
누구랑 / 누구를위한 / 무엇을(vibe 최대3, 기본 힐링+쇼핑)
밀도 / 예산 / 이동
[일정 생성]
```
- ✅ 숙소 = 구글 공식 위젯(PlaceAutocompleteElement) WebView. 선택시 섹션 사라짐(키보드 자동닫힘).
- ✅ iOS 여정속 숙소위젯 = 전체화면 Modal(키보드 가림 해결). AOS/웹=인라인.
- ✅ vibe 기본값 = 힐링+쇼핑 (Foodie 폐기).

### 🔴 C-계획: 목적지 입력창 = 숙소와 동일한 구글 위젯 1개로 통일 (전면개편 시)

> **문제(실측 입증 = 라이브 DB)**: 현재 목적지는 **자유 텍스트**(`TripPlannerScreen.tsx:1214`), `destinationCoords`는 매 입력마다 `undefined`로 리셋(:1219). → city-resolver 4단계 텍스트 부분매칭(`city-resolver.ts:286-291`)이 **부분열 겹침을 도시 유사어로 오인** = 재앙.
> - 한글: 니스→**베니스**(니스⊂베니스), 본→**리스본**, 본머스→본. 칸↔캉(다른도시)·본↔본느(같은도시) 텍스트로 구분 불가.
> - 알파벳(더 심각): **Nice(정확철자)→Venice**(Ve*nice*), Nce→**Florence**(Flore*nce*), 오탈자 Beune·Venise→**null→MIX 재발굴=재과금**.
> - = 텍스트로는 도시 식별 근본 불가. **좌표만이 유일한 근본해결**(실측: 니스 좌표→정확히 Nice, 본→Beaune, 오매칭 0).

**개편 방향 = 목적지도 숙소와 동일하게 구글 위젯 1개** (사장님 SSOT 2026-07-09):
- 사용자가 "본"·"Nice"·"Nce"·"Venise" 무엇을 쳐도 → **구글 위젯 유사어 드롭다운**이 정확한 도시 제시(Beaune/Bournemouth 구분) → 선택 → **도시중심 좌표** 확보.
- 그 좌표로 city-resolver **0단계 좌표매칭**(`:155-174`, 10m) = 도시무관 정확 구분. 4단계 텍스트매칭(오매칭 진원지) **도달 전 확정**.
- **위젯 2개(도시+숙소)는 UX 나쁨**(사장님) = 안 늘림. 숙소 위젯은 **여정 결과화면 안**으로(B-E "숙소설정/변경" 버튼, 이미 존재). 즉 입력화면 위젯 = 목적지 1개.
- 목적지 위젯 = 숙소 위젯(`PlaceAutocompleteWidget`) **재사용**(§16 재발명0). `includedPrimaryTypes=['(cities)']`로 도시만 필터, `onSelect`에서 `destination`+`destinationCoords` 동시 세팅.

**서버 = 이미 완비 = 입력화면만 좌표 공급하면 전 체인 활성화**:
- `isCityReady`(`ag2:46`)·`preloadCityData`(`ag3:152`)·`findCityUnified`(`city-resolver:138`) = 전부 `destinationCoords` 받도록 배선 완료. 병목 = 입력화면이 좌표 안 줌(:1219) 하나.
- DB-only/MIX 분기(`pipeline-v3:124`)의 실축 = cityId. 좌표로 cityId 정확확정 = **엉뚱도시 DB-only·못찾음 MIX재발굴 원천차단**.

**주의**: city-resolver 4단계 텍스트매칭은 개편 전까지 **현행 유지**(좌표 오면 0단계가 우회하므로 안 건드림). 개편 시 좌표 확보되면 4단계는 좌표 없을 때 폴백으로만.
= 설계근거 `docs/superpowers/specs/2026-07-08-city-match-by-coords-design.md` · 메모리 [[project_city_input_coords_needed_planner_revamp]].

---

## D. ④프로필 — 나의 여정 [2026-07-03 신규 = 저장여정 복원]

```
👤 아바타 (로그인 이름/이메일 or "로그인 필요")
[여행 N][방문 N][저장 N]  ← 통계 3칸 (레이아웃 재구현시 정리)
─────────────────────────
나의 여정  ← 가로스크롤 카드
┌────────────[X]┐  ← 우측상단 X 항상표시, 터치 즉시삭제(확인없음)
│ Paris         │  ← 1.도시 (Fonts.bold 16)
│ 26년 07-03~07-05│  ← 2.기간 (Fonts.semiBold 12)
│ 1인 €211      │  ← 3.예산 (Brand.primary bold 13)
│ 가족(4명)의    │  ← 4.요약 (Fonts.medium 12)
│ 모두를위한 힐링&쇼핑│
└──────────────┘
  탭 → 여정 생성화면(Home) 그대로 재현 ★
나의 영상 (영상있을때만, SavedTripDetail 유지=별개)
여행 스타일 / 설정 (재구현시 정리)
```

### 저장→복원→재저장→삭제 파이프라인 (✅ 2026-07-03)
```
[신규 저장] 결과화면 💾 → ⟳스피너(네트워크 실시간) → ✓체크(완료순간) → 💾복귀
  → POST /api/itineraries (userId 서버가 'admin' 고정, rawData=여정통째+숙소병합)
  → DB 새 행 INSERT → currentItineraryId=id 기억 → 프로필 카드 등장

[복원] 카드 탭 → navigate("Main",{screen:"Home",params:{itineraryId}})
  → GET /api/itineraries/{id} → setItinerary(rawData) → renderResult 그대로
     + 숙소깃발(days[].accommodation) + formData(스칼라) + currentItineraryId=id

[재저장] 복원/저장된 화면서 💾 (숙소·동선 변경 후) 
  → currentItineraryId 있음 → PUT /api/itineraries/{id} = 같은 행 전체 새덮어쓰기(셀렉X, updated_at NOW)
  → 카드 안 늘어남(중복0). 신규생성(일정생성 버튼)은 currentItineraryId=null → 새 카드.

[삭제] 카드 X 터치 → 즉시(확인없음) → FE 먼저 목록제거(레이턴시0) → DELETE /api/itineraries/{id} 백그라운드 → 실패 시 복원
```

**DB itineraries (단일테이블, Pooler 직접접속 실측)**: id(PK)·user_id(='admin' 서버 강제)·city_id(=1고정 TODO)·title·start/end_date·raw_data(jsonb=여정통째)·updated_at·조건컬럼들. **숙소 전용컬럼 없음** → raw_data.days[].accommodation에 저장.
- **중복 원인(실측)**: 옛 코드 = 저장마다 무조건 POST(새 행) = 같은 파리 일정 여러 카드 누적. 새 코드 = 현재 id 있으면 PUT 덮어쓰기 / 신규만 POST. **자동 매칭 안 함**(사장님 SSOT="여정 id에 다 들어있음"). 쌓인 옛 중복 = 사용자가 X로 직접 정리.

### 🔴 프로필 과설계 진단 [2026-07-04, 배포앱 legacy-guide/public/profile.html 대조] = 재구현 SSOT

> 배포앱(구글·애플 배포중) 프로필 = **크레딧 경제가 핵심**(잔액·충전10EUR·거래내역·요금제·캐시백·계정삭제). 현재앱 프로필 = 배포앱에 없는 껍데기 다수 + 정작 크레딧 UI 통째 없음. **재구현 시 배포앱 최소구성이 기준.**

| 현재앱 요소 | 진단 | 조치 |
|---|---|---|
| 나의 여정(저장 카드) | ✅ 동작(조회·삭제·복원) | 유지 |
| 로그인/로그아웃·언어모달·관리자 | ✅ 동작 | 유지(언어모달은 배포앱=구글번역쿠키라 무게 재검토) |
| 여행 스타일(persona 럭셔리/편안함) | ❌ 죽은코드 = 아바타 색만 바꿈, 여정(formData.travelStyle)과 무연결 | **삭제** |
| 통계 3칸(여행/방문/저장) | ⚠️ "저장"=여행 중복값, "방문"=동행자수(엉뚱) | 재구현 시 정리 |
| 나의 영상 | ⚠️ 영상 없으면 영구 숨김 | 영상 기능 확정 시까지 보류 |
| 설정 죽은버튼 4개(결제=더미alert·알림·개인정보·도움말=onPress없음) | ❌ 미동작 | **삭제 또는 실동작 연결** |
| **크레딧 잔액·충전·거래내역·요금제·캐시백** | ❌ **통째 없음** | 병합 시 배포앱서 이식(수익구조 필수) |

= 프로필 재구현 = 배포앱 최소구성 [프로필+크레딧잔액] · [충전/캐시백] · [내 여정=저장물] · [크레딧내역] · [요금제] · [계정삭제]. 군더더기 삭제 + 크레딧 UI 이식.

---

## E. ②AI 의견 — 결과화면 인앱 오버레이 [2026-07-04 신규 = 핵심 마케팅]

> **목적(사장님 SSOT)**: 생성된 여정을 Gemini에 통째로 보내 **구글 그라운딩 기반 비평적 재평가**. "실현 가능한가·동선 최적인가·실제 가격은·주의할 건?" = 가장 비평적·적대적 톤 → 사용자 신뢰↑ → 현지 전문가 퍼널.
> **가장 민감한 핵심 = 1인당 (대중교통+식비+입장료)의 일일 합산** = 교통비를 Gemini에게 그라운딩으로 실요금 조회시키는 것.

```
[하단 ②AI 의견 버튼 터치] (screen==="Result"일 때만 활성)
   ↓ 즉시 오버레이 전환(Modal transparent fade)
┌──────────── AI 의견 ────────[✕]┐
│                                │
│      ≈≈≈ 흐름 바(brand) ≈≈≈    │  E-로딩: 부정형 흐름 바(퍼센트 없음)
│   실제 이동·요금 정보를 확인하는 중 │   + 시간기반 단계문구(2.5초 간격 4단계)
│   AI가 구글에서 실제 정보를        │   + 대기 정당화 힌트
│   확인하고 있어요                 │   (실측 8~9초, 마지막 단계는 응답 늦어도 유지)
└────────────────────────────────┘
   ↓ 응답 도착(같은 오버레이서 fade)
┌──────────── AI 의견 ────────[✕]┐
│ 실현 가능성   [가능/주의/무리]    │  E-1 feasibility (verdict 배지+이유)
│ ─────────────────────────      │
│ 동선 점검   issues·최적화제안     │  E-2 route_review
│ ─────────────────────────      │
│ 예상 비용   일별(교통·식비·입장료) │  E-3 price_check (daily+total, "(예상)" 고지)
│ ─────────────────────────      │
│ 주의사항   cautions             │  E-4 cautions
│ ─────────────────────────      │
│ (현지 전문가에게 물어보세요 톤)    │  E-5 expert_hint (버튼 아닌 자연문장=퍼널)
│ 이 검토에 5크레딧을 사용했어요     │  E-6 크레딧 고지(조용히, textTertiary)
└────────────────────────────────┘
```

| 코드 | 요소 | 상태 |
|---|---|---|
| E-로딩 | 오버레이 로딩 UX | ✅ `AiOpinionLoading` = 흐름 바(Animated, onLayout 폭측정 후 px이동, 측정전 숨김) + 단계문구(loadingStep1~4) + 힌트(loadingHint). 이모지·퍼센트숫자 없음 |
| E-1~5 | 리포트 4섹션 + 전문가 힌트 | ✅ 상세페이지형(카드나열 아님). 언어중립 필드(feasibility/route_review/price_check/cautions/expert_hint). 전문가유도 = 클릭버튼 아닌 마지막 문단 |
| E-6 | 크레딧 고지 | ✅ 5크레딧(`AI_OPINION_CREDIT_COST`) = 로딩 중엔 감춤, 결과 하단에만 조용히. 차감 로직 자체는 추후 크레딧 시스템 |

### 호출 파이프라인 (BE)
```
[②버튼] → requestAiOpinion() (MapToggleContext, Date.now 신호)
  → TripPlanner useEffect: 오버레이 열고 POST /api/itineraries/ai-opinion
     body={itineraryId, itinerary, language(=현재앱언어)}
  → routes.ts: 여정지문(fp)+language 캐시키 → rawData.verification 캐시 히트면 $0 반환
     미스면 handleAiOpinionRequest → geminiJson(gemini-3-flash-preview, googleSearch:true,
     maxOutputTokens:50000, rawTag:'ai-opinion') → 결과 rawData.verification 병합 저장
  → FE: 같은 오버레이서 로딩→리포트 fade
```
- **다국어**: language 전달 → Gemini가 그 언어로 직접 작문(번역기 아님, pipeline-v3 langMap 패턴). 필드명은 언어중립(FE 렌더 안정).
- **비용/크레딧**: 호출당 ≈$0.002(flash+그라운딩). 사용자 차감 = **5크레딧**(10유로 충전=20회). 캐시 히트=$0·무차감. 수동+여정있을때만 = 남발 없음.
- **새 파일**: `server/services/verify/ai-opinion-handler.ts`·`ai-opinion-prompt.ts`(route-handler/route-prompt 복제, geminiClient 재사용). 프롬프트 = ag4/파이프라인 동적요소(vibeWeights JSON 직렬화, 하드코딩 번역맵 금지) 재활용.

---

## F. ③전문가 / ⑤설정
- ③전문가 = 일정 있을때만. Lucide 정상. (AI 의견 E-5에서 자연스럽게 유도되는 퍼널 종착지)
- ⑤설정 = AdminModal(비번). Lucide 정상.

---

## G. 🔴 남은 작업

| # | 작업 | 위치 | 상태 |
|---|---|---|---|
| 1 | ✅ **저장여정 복원**(카드→여정 재현) + 프로필노출버그(admin 통일) + 저장버튼 동기화 + 재저장 덮어쓰기 | ProfileScreen·TripPlanner·MainTabNav·routes·storage | **2026-07-03 완료** (커밋됨) |
| 1-b | ✅ **카드 삭제**(X 즉시삭제) = 중복 사용자 직접정리 | ProfileScreen·routes·storage | **2026-07-03 완료** (커밋됨) |
| 2 | ✅ **교통비 재산정+가이드 분기** = 구간당 €3·슬롯금액삭제·일별합계"(예상)" + 드라이빙가이드 4가지분기(shouldApplyGuidePrice)·슬롯 3분기 | ag4·route-local·transport-pricing·TripPlanner·i18n7 | **2026-07-04 구현완료·미커밋** = 배포후 실증 |
| 3 | 🔶 **AI 의견**(핵심 마케팅) = 오버레이 로딩UX+리포트4섹션+크레딧고지+다국어 | verify/·routes·MapToggleContext·MainTabNav·TripPlanner·i18n7 | **2026-07-04 구현완료·미커밋** = 배포후 실증(§21) |
| 4 | 프로필 재구현 = 군더더기삭제(persona·죽은설정)+**크레딧 UI 이식**(배포앱 profile.html 기준) | ProfileScreen | 별도(병합 연계) |
| 5 | cityId=1 고정 동적매핑 | routes.ts·TripPlanner | 별도 |
| 5-b | **목적지 입력창 = 구글 위젯 1개 통일**(텍스트 부분열 오매칭 근본해결=좌표확보). 숙소위젯은 결과화면 안으로. 서버 좌표인프라 완비=입력화면만 공급 | TripPlanner(C-계획)·PlaceAutocompleteWidget재사용 | **전면개편 시**(§C-계획, 실측입증완료) |
| 6 | 크레딧 차감 = **설계확정·구현보류**(creditService.useCredits 재사용, 앵커=routes.ts TODO). 실차감=병합·로그인정식화 시점 | creditService·routes | 보류(설계완료) |
| 7 | 두 앱 병합(공유 크레딧) = legacy-guide/public(배포앱)의 크레딧·결제·프로필을 현재앱에 통합 | 전역 | 별도(대형) |

## H. 이미 해결된 옛 문제 (2026-06~07)
- ✅ 이모지 깨짐·아이콘 중복 → Lucide 정리
- ✅ 한줄요약 누락 → editorial_summary 노출
- ✅ 숙소전문가 CTA → 삭제(§19)
- ✅ 지도 웹폴백·동선라인·마커클릭 → ItineraryMap(BTS패턴) 교체
- ✅ 헤더 "나을"→"나를" 오타, 요약헤더 이모지 → 제거
- ✅ 숙소위젯 = 구글 공식위젯 전면교체·iOS Modal·첫화면 섹션사라짐
- ✅ vibe Foodie→Shopping, 날짜축약·아이콘제거(가격잘림), 숙소 전Day유지·변경
- ✅ 하단 ②탭 "지도 토글(죽은 더미탭)" → "AI 의견"(brain) 교체

## I. 검증
- 각 작업: 배포 후 Chrome DevTools 아이폰12 에뮬 시각검증(§21) + 5단계검증(tsc·§19가드·빌드·simplify·review).
- iOS 앱 전용동작(WebView 키보드 등) = 사장님 실기기 최종.
