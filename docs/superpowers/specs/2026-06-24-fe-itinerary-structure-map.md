# 메인앱 FE 구조도 (현재 상태 SSOT) — 2026-07-03

> 현재 화면 = AI가 아이폰12(390px) Chrome DevTools로 직접 본 실측 + 완료분 반영. 현재 구도 + 남은 것(교통비)만.
> **범위**: 메인 5탭 + 여정흐름(입력/로딩/결과) + 프로필 나의여정. (BTS·온보딩·로그인 제외)
> **검증방식**: 배포 후 Chrome DevTools 모바일에뮬(아이폰12/삼성폰) 직접 시각검증(CLAUDE.md §21). iOS 앱 전용동작=사장님 실기기.

---

## A. 화면 지도 (메인 5탭 = 하단 탭바)

```
   ✏️일정      🗺️지도(토글)   ✅전문가     👤프로필      ⚙️설정(모달)
   TripPlanner  결과화면        검증요청     ProfileScreen  AdminModal
   Input/        지도표시토글    일정있을때만  아바타·나의여정  비번인증
   Loading/      (더미탭)                    ·스타일·설정
   Result ★
```

| 탭 | 화면 | 파일 | 상태 |
|---|---|---|---|
| ①일정 | TripPlannerScreen | `client/screens/TripPlannerScreen.tsx` | Input/Loading/Result |
| ②지도 | 더미탭=토글(preventDefault) | `MainTabNavigator.tsx:133` | 결과화면 지도 표시 |
| ③전문가 | VerificationRequestScreen | `VerificationRequestScreen.tsx` | 일정 있을때만 |
| ④프로필 | ProfileScreen | `ProfileScreen.tsx` | 게스트/로그인 분기 |
| ⑤설정 | AdminModal | `AdminScreen.tsx` | 비번(preventDefault→모달) |

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
║   ↗ 메트로 3분·1.2km·€2.10                     ║  B-H 이동구간바 (🔴교통비 €2.10 고정=미해결)
║  ...슬롯 반복...                                ║
║  1일차 합계(1인) 입장료€0 식사€90 교통€4.2       ║  B-I 일별합계 (🔴교통비 값 미해결)
║          1인 일 합계 €94.2                      ║
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
| B-H | 이동구간바 | 🔴 교통비 €2.10 고정(2번 작업) |
| B-I | 일별합계 | 🔴 교통비 값(2번 작업) |

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

---

## E. ②지도 / ③전문가 / ⑤설정
- ②지도 = 결과화면 B-D 지도 고정섹션과 동일(탭=토글). ✅ InteractiveMap→ItineraryMap 교체 완료.
- ③전문가 = 일정 있을때만. Lucide 정상.
- ⑤설정 = AdminModal(비번). Lucide 정상.

---

## F. 🔴 남은 작업

| # | 작업 | 위치 | 상태 |
|---|---|---|---|
| 1 | ✅ **저장여정 복원**(카드→여정 재현) + 프로필노출버그(admin 통일) + 저장버튼 동기화 + 재저장 덮어쓰기 | ProfileScreen·TripPlanner·MainTabNav·routes·storage | **2026-07-03 완료** (75dc8cc 커밋) |
| 1-b | 🔶 **카드 삭제**(X 즉시삭제) = 중복 사용자 직접정리 | ProfileScreen·routes·storage | **구현완료·미커밋** = 배포후 실증(X 전파차단·즉시삭제·DB삭제) |
| 2 | 🔴 **교통비 산정** = €2.10 고정·공식 3개 분산(§19·§20 위반) | ag4-db-finalize·transport-pricing·route-local | 요금철학 결정후 착수 |
| 3 | 프로필 전체 레이아웃 재구현(통계·영상·스타일·설정) | ProfileScreen | 별도 |
| 4 | cityId=1 고정 동적매핑 | routes.ts·TripPlanner | 별도 |

## G. 이미 해결된 옛 문제 (2026-06~07)
- ✅ 이모지 깨짐·아이콘 중복 → Lucide 정리
- ✅ 한줄요약 누락 → editorial_summary 노출
- ✅ 숙소전문가 CTA → 삭제(§19)
- ✅ 지도 웹폴백·동선라인·마커클릭 → ItineraryMap(BTS패턴) 교체
- ✅ 헤더 "나을"→"나를" 오타, 요약헤더 이모지 → 제거
- ✅ 숙소위젯 = 구글 공식위젯 전면교체·iOS Modal·첫화면 섹션사라짐
- ✅ vibe Foodie→Shopping, 날짜축약·아이콘제거(가격잘림), 숙소 전Day유지·변경

## H. 검증
- 각 작업: 배포 후 Chrome DevTools 아이폰12 에뮬 시각검증(§21) + 5단계검증(tsc·§19가드·빌드·simplify·review).
- iOS 앱 전용동작(WebView 키보드 등) = 사장님 실기기 최종.
