# 2026-05-06 — BTS SC4 (Screen 4) 최적화 = 카트 캐러셀 → 인앱 지도 (RN + Web)

> **상태**: ✅ 완료. 안드로이드 / iOS / Web 모두 정상 동작 확인 (= Replit 배포 후 사용자 시각 검수).
> **commit**: `2ed74c1` + `a64adce` (= origin/main push 완료)
> **이전 작업**: ← `docs/2026-05-06 — BTS 모델 메인앱 발명 (= Gemini 폐기 + place_seed_raw 단일 SSOT).md`

---

## Context (= 왜 이 작업)

- 어제 (2026-05-06 자정) 메인앱 BTS 모델 발명 = `place_seed_raw` 단일 SSOT + 4.9 초 + 0 외부 API 검증 완료
- 사용자 통찰: **BTS 자식앱 = 메인앱 BTS 모델의 축소판** = 검증 빠름. 공연 진행 중 = 시급 우선
- v3 마스터플랜 Step 4 (= `docs/BTS_MASTERPLAN_v3.md`) = 4/27 작성 후 미진행

### 의도된 결과
사용자 SSOT (= `docs/BTS_MASTERPLAN_v3.md` Step 4) 그대로:
- 카트 캐러셀 (76×100 가로 스크롤 썸네일) **만** WebView 지도 (= QA HTML 클론) 로 교체
- HERO 궤도 + 상세 섹션 + 카드 떼기/복귀 = **절대 유지**
- 마커 클릭 → 인앱 ScrollView 의 해당 카드 상세 섹션 scrollTo (= 모달 X)

---

## 사용자 명시 룰 (= 절대 준수)

| # | 룰 | 적용 |
|---|---|---|
| 1 | **인앱 처리** = ScrollView 안 자식. RN + Web 모두 동일 | 별도 모달 / Modal / 별도 화면 = **금지** |
| 2 | **lucide 마커 그대로** | QA HTML (`docs/qa/index.html`) 의 현재 마커 코드 그대로 클론. 신규 마커 디자인 X |
| 3 | **카드 제거 동작 = 현재 그대로** | 상세 섹션 제거 버튼 → HERO 재등장 + 지도 마커 자동 사라짐 |
| 4 | HERO 궤도 카드 8 장 (라인 518-565) | 절대 유지 + 카드 채워지는 로직 = v3 SSOT 일치 검증 |
| 5 | 상세 섹션 4:3 큰 이미지 (라인 600-628) | 절대 유지 |
| 6 | 카드 떼기 → 카트 추가 (Track 4a + togglePlace) | 절대 유지 |
| 7 | CTA = **카드 ≥ 3 부터 활성화 (= 일정 생성 시작)** | 임계 라인 387 `>= 2` → `>= 3` |
| 8 | venue 마커 = **2 중 상태 (idle → active)** | 처음 = 별 아이콘만 / **첫 카드 떼면 → 별 + "BTS" 라벨** = 사용자 직관 = "이 별 = 공연장" |
| 9 | 한꺼번에 사이즈/색상 결정 X | 단계별 시각 검수 + 사용자 ㅇㅋ 후 다음 (= RALPH LOOP) |
| 10 | **1 주일 노하우 (Track 1g~1j) 절대 보존** | Wikimedia UA + 버킷 스냅 + onError X + 자해 timeout X |
| 11 | **DB 정규화 = 시드 발굴 단계 표준** | 클라이언트 변환 X. 서버 1 곳에서 정규화 (= 새 패턴 발견 시 1 곳만 수정) |

---

## 단계별 진행 (= 사용자 명시 시각 검수 사이클)

### 단계 0 — 코드 ↔ v3 SSOT 일치 검증
**검증 결과**:
- ✅ 카드 8 풀 = vibe 5 + 식사 2 + 공연장 1 = `bts-routes.ts:209-218` 정확 일치
- ✅ 캐릭터 ↔ 카테고리 1:1 매핑 = `shared/bts-character-mapping.ts` = collector→heritage / romanticist→hotspot / explorer→attraction / challenger→adventure / recharger→healing / chiller→shopping / companion→5 혼합
- ✅ MAX_PLACES = 8
- ✅ 카드 N = 자유 조합 3~7 = CTA `>= 3` 일치
- ⚠ HERO 궤도에 venue 카드 노출 vs 메모리 v3 = "venue = anchor (카드 X)" = 사용자 결정 = "공연장은 1번 카드 고정 + 다른 카드와 동일 동작" = 코드 그대로 OK

### 단계 1 — WebView 지도만 띄우기 (인앱)
- 백엔드 = `/api/bts/top-places` 응답 lat/lng 추가 + `/api/bts/map-config` 신규
- BTSPlace 타입 = lat/lng 추가
- 신규 = `client/components/bts/BTSPlaceMap.tsx` + `bts-map-html.ts`
- BTSPlaceCartScreen 통합 = 카트 캐러셀 → BTSPlaceMap

**Web 환경 사고 + 해결 흐름** (= 4 회 진단 끝 발견):
1. `react-native-webview` = web 미지원 → iframe 분기
2. `srcDoc` (about:srcdoc) = Google Maps tile referrer 거부 → blob URL → 같은 문제
3. = **iframe 자체 폐기** → 직접 div + Google Maps SDK 직접 로드
4. ScrollView 안 mapSection 이 viewport 밖일 때 = init 시 container 0x0 = tile load X → **IntersectionObserver 으로 visible 진입 시 trigger resize**

✅ 검증 = venue ⭐ 56px 마커 정상 + 도시 zoom + 마커 클릭 → 인앱 스크롤

### 단계 2 — 마커 클릭 → 상세 섹션 인앱 스크롤
- `scrollRef = useRef<ScrollView>` + `cardRefs = useRef<Record<number, View>>`
- `handleMarkerPress(id)` = `node.measureLayout(scrollRef, (_x, y) => scrollRef.scrollTo({ y: y - 16, animated: true }))`

✅ 검증 = 마커 클릭 → 해당 카드 정확히 스크롤

### 단계 3 — 사이즈 / 위치 / 색상 미세 조정 (= 사용자 시각 검수 다회)
- 카드 8 = 너무 빽빽 ("누더기" 사용자 표현)
- 1 차: CARD 100×178 → 88×156 + radius cap 130/180 → 145/210 = 살짝 개선
- 2 차: CARD 88×156 → **80×140** + radius cap 145/210 → **155/240** = ✅ 사용자 OK

### 단계 4 — fallback 정리 (= 보류 = 사용자 결정)
**의미**: `mapApiKey == null` 일 때 = ActivityIndicator + "지도 로딩" 텍스트 안내
**현황**: API key 정상 fetch (= Express 시작 시 DB 11 keys 자동 주입). 트리거 0 회.
**결정**: 보류. ROI 낮음.

---

## 핵심 사고 + 해결 흐름 (= 결정성 SSOT 적중 과정)

### 사고 1: HERO 영구 spinner 무한루프
**원인 누적**:
1. `id=null` slot (= 카테고리 부족 시) = readyIds 1 회만 → 멈춤
2. **id 중복** (= lunch + dinner = 같은 식당 row, vibe + restaurant 다중 tag row 충돌) = readyIds 같은 id 1 회만 → 멈춤
3. storage URL 깨짐 = onLoad 미발화 = readyIds 도달 X → 멈춤

**해결 누적**:
1. **frontend topPlaces filter** = `arr.filter(p => p.id && !seen.has(p.id))` = id null + 중복 제거
2. **backend 누적 exclude** = `usedIds = Set` (venue → vibe5 → lunch → dinner) = 1 row 1 카드 보장
3. **vibe 슬롯 restaurant tag 명시 제외** = `byCategoryTag` 가 = `tag !== 'restaurant'` 시 = `NOT (categoryTags && ARRAY['restaurant'])` 추가 → 식당 자리만 식당, vibe 자리 = 박물관/문화 등
4. **storage HEAD 검증** (= 한때 추가) → **Replit 외부 fetch 차단 환경에서 = 모든 alive=false 사고** → fail-open (= `commit a64adce`) = 첫 eligible 반환

### 사고 2: Stanford / Madrid venue 큰 화면 빈 이미지
**원인**: `toCardThumbUrl` / `toFullUrl` 클라이언트 변환 = `/wikipedia/commons/thumb/` 패턴만 처리. Stanford venue = `/wikipedia/commons/f/fe/Stanford_Stadium_new.jpg` 원본 URL = 변환 미적용 → 큰 원본 이미지 (= 6000×4000+) → 상세 섹션 fail.

**해결 = 단일 SSOT 통합**:
1. **server normalize 함수** 신규 = `shared/lib/normalize-image-url.ts` (= server + client + 메인앱 공용 = 새 패턴 발견 시 1 곳만 수정)
2. **DB SQL UPDATE 1 회** = `scripts/sql-normalize-wiki-image-url.mjs` = **891 rows** Wikipedia 원본 URL → `/thumb/.../1280px-` 형식 (= regex 변환만, fetch X, Storage X, 출처 보존)
3. = 새 도시 / 새 row 추가 시 = **시드 발굴 시점에 normalize** → 영원히 표준

### 사고 3: 사용자 1 주일 노하우 위반 위험
**위험**: 단편 fix 누적 = case-by-case = AI 식 발상.

**사용자 명시 진단**:
> "이게 정말 조심스러운게 안드로이드 앱 apk 테스트시 이미지가 안떠서 1주일만 답 찾아 만든 해답이 깃 커밋에 있다 찾아봐 수정하지 말고"

**해결 = 1 주일 노하우 100% 복원**:
- `WIKIMEDIA_BUCKETS` / `toCardThumbUrl` (330px) / `toFullUrl` (1280px) / `WIKIMEDIA_UA` / 카드용·상세용 분리 / `onError` X / 자해 timeout X
- web 환경 = `Platform.OS === 'web'` 분기 = User-Agent forbidden header → native 만 헤더 부착
- = native (AOS Glide) = 1 주일 노하우 그대로 + web 만 추가 분기

---

## 변경 파일 (= commit 2ed74c1 + a64adce 통합)

```
신규:
  client/components/bts/BTSPlaceMap.tsx          (= Web 직접 div + Google Maps SDK / Native WebView)
  client/components/bts/bts-map-html.ts          (= Native WebView HTML 템플릿)
  shared/lib/normalize-image-url.ts              (= server + client + 메인앱 공용 정규화)

수정:
  server/bts-routes.ts                           (= /api/bts/top-places 누적 exclude + restaurant 분리 + map-config 신규)
  server/services/agents/ag2-gemini-recommender.ts (= 어제 발명 = AG2 BTS 모델)
  server/services/agents/ag3-data-matcher.ts     (= 어제 발명 = AG3 단일 SSOT)
  shared/schema.ts                                (= placeSeedRaw 6 필드 추가)
  client/contexts/BTSContext.tsx                 (= BTSPlace 타입 lat/lng)
  client/lib/query-client.ts                     (= web dev port 19006/8081 → 8082 redirect)
  client/screens/bts/BTSPlaceCartScreen.tsx     (= BTSPlaceMap 통합 + 1 주일 노하우 복원 + ScrollView ref)

DB 1 회 마이그레이션:
  scripts/sql-normalize-wiki-image-url.mjs        (= 891 rows Wikipedia 원본 URL → /thumb/ 1280px)

.gitignore:
  + 임시 SQL chunk / _tmp_ 스크립트 / docs 임시 텍스트 / 검수용 baseline·qa 폴더 (12 패턴)
```

---

## 결정성 안전장치 (= 사용자 SSOT "같은 입력 → 같은 결과")

1. **누적 exclude** = venue → vibe5 → lunch → dinner unique id 보장
2. **vibe 슬롯 restaurant tag 분리** = 식당 자리만 식당
3. **rank ASC + reviewCount DESC 정렬** = 결정성
4. **HEAD 검증 fail-open** (= Replit 외부 fetch 차단 환경 대응) = DB 정규화 후 깨진 URL 거의 0
5. **DB 정규화 891 rows** = `/thumb/.../1280px-` 표준
6. **클라이언트 1 주일 노하우** (= Track 1g~1j) 100% 보존

= 9 도시 × 7 캐릭터 = **63/63 매트릭스 모두 8/8 unique 슬롯**

---

## 검증 결과 (= 사용자 시각 검수)

| 환경 | 결과 |
|---|---|
| Chrome web (= localhost:19006) | ✅ HERO 8 카드 + 지도 + 마커 + 상세 섹션 + 인앱 스크롤 |
| 안드로이드 APK | ✅ 정상 (= 사용자 보고) |
| iPhone Web | ✅ 정상 (= 사용자 보고) |
| Replit 개발본 | ✅ 정상 (= commit a64adce 후 fail-open 적용) |

### 미세 UX 관찰 (= 사용자 보고 = "보존")
- 지도 = 즉시 노출 (= apiKey fetch + init 200ms)
- HERO = 1 초 후 노출 (= 1 주일 노하우 8/8 ready 대기)
- = 사용자 평가 = "지금이 최적임"

---

## 다음 작업 (= 인수인계)

### 우선순위 1 = 사용자 정립 알고리즘 검증
어제 인수인계 문서의 미해결 항목:
- ❌ curationFocus 가중치 (= 아이/부모님/모두/나 별 차이)
- ❌ vibe 우선순위 50/30/20 가중치 적용
- ❌ 시간대 친화도 (= Lunch = Foodie 우선 등)
- ❌ companion bonus / Reality penalty / Final Score 공식

= AG3 / AG4 코드 검증 + 백서 일치 부분 확인 후 보강.

### 우선순위 2 = Claude 큐레이션 자동화
- 비용: ~$0.005/일정
- 효과: 한국 톤 10 배 ↑ (= 사용자 검증)
- 구현: AG3 또는 AG4 마지막 = 21 곳 일괄 호출 → summary_ko 갱신

### 우선순위 3 = 미발굴 도시 정책
- (a) 발굴 도시만 노출 = "이 도시 = 발굴 후 사용 가능" 안내
- (b) Google fallback + auto-learn (= 현재)

### 우선순위 4 = 시드 발굴 스크립트 normalize 적용
- `seed-gemini.mjs` / `bts-discover` = INSERT 시점에 = `normalizeImageUrl(url, 1280)` 호출
- = 새 도시 추가 시 = 처음부터 표준 = 영원히 SQL UPDATE 불필요

### 우선순위 5 = mapSection fallback 정리 (= 보류 결정)
- mapApiKey null 시 = "지도 로딩" 텍스트 안내
- 현황 = 트리거 0 회 = ROI 낮음 = 추후 결정

### 우선순위 6 = Google Maps API key referrer 제한
- `/api/bts/map-config` = key 노출 = Google Cloud Console 도메인/패키지 referrer 제한 추가 필요 (= 운영 합의)

---

## 사용자 SSOT 인용 (= 핵심 통찰)

```
"이게 정말 조심스러운게 안드로이드 앱 apk 테스트시 이미지가 안떠서
 1주일만 답 찾아 만든 해답이 깃 커밋에 있다 찾아봐 수정하지 말고"
   = 사용자 1 주일 디버깅 노하우 = SSOT, AI 임의 수정 절대 X

"이게 벙말 조심스러운게 ... 패턴별 정규화 할것이 한두곳이 아닐텐데 ???"
   = AI 의 단편 fix 누적 = case-by-case = 잘못. DB 정규화 = 진짜 SSOT.

"방대해지는 스토리지와 가져온 구글이미지,wk 이미지는 썻여서
 출처도 모르고 변환된 우리만의 url로 찾자고 ?? 완전 ai식 발상 ?"
   = Storage 통합 = 출처 손실 = 거부. URL 형식 정규화 + 출처 보존 = 진짜 SSOT.

"이전에 100번도 넘게 나개입없이 성공한 이력이 있슴 나 터미널 모름"
   = 사용자 = 비개발자. AI 가 자동 push + EAS Update + 폰 검수까지 책임.

"지금이 최적임 보전하고"
   = 현재 코드 + DB 정규화 = SSOT 보존. 이후 변경 = 사용자 명시 후만.
```

---

**작성**: 2026-05-07 (= 자동 컴팩트 직전 정리)
**상태**: ✅ Screen 4 카트→지도 = 완료. 폰/Web 모두 정상. 다음 작업 = 사용자 알고리즘 백서 검증 + Claude 큐레이션 자동화.

= 휴식 후 재개. 화이팅.
