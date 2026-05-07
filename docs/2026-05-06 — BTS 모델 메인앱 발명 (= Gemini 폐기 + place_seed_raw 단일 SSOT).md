# 2026-05-06 — BTS 모델 메인앱 발명 (= Gemini 폐기 + place_seed_raw 단일 SSOT)

> **핵심 발명**: 메인앱 여정 생성 = 외부 API 호출 0 + 4.9 초 완성
> **사용자 평가**: "발명 수준이다"
> **후임 AI 필수 숙지**: 이 문서를 안 읽으면 옛 패턴으로 회귀할 위험 高

---

## 0. 후임 AI 가 먼저 알아야 할 것 (= 1 분)

```
1. 메인앱 = 1 달 사용자 알고리즘 = 절대 보존 (= AG1, AG4 만 사용자 SSOT)
2. AG2 = 데이터 출처 = Gemini 폐기 가능 = place_seed_raw 단일 SSOT
3. 발굴 도시 (= gemini3-2026-05 phase + rank 1-20) = 외부 API 호출 0
4. 미발굴 도시 = Gemini fallback (= 자동 학습으로 점차 발굴 도시화)
5. places, place_images, celebrityPlaceEvidence 테이블 = 코드에서 차단 (= 옛 부패 데이터)
6. Claude 큐레이션 = Gemini 대비 한국 톤 10 배 ↑ (= 사용자 선언, 향후 적용 예정)
7. 사용자 정립 알고리즘 백서 = docs/NUBI_WHITEPAPER.md (= 사용자가 별도 md 재확인 예정)
```

---

## 1. 오늘 진행 흐름 (= 시간순)

### Phase 1 (오전): QA HTML 이미지 정정 = 98% 달성

**문제**: 9 도시 × 7 카테고리 × 20 슬롯 = 1,260 카드 = 다수 미스매치
**진행**:
- Step 7 = INSERT 누락 행 raw JSON 으로 (= 194 행)
- Step 8B = rank 재배치 (= 1119 행, temp 1000+id)
- Step 9 = Wikipedia API thumbnail 채움 (= 53 행)
- Step 9C = REST summary endpoint (= 15 행)
- Step 10 = 카테고리 중복 정정 (= 28 행)
- Step 11 = 적극적 Wikipedia + Wikidata (= 87 행)

**결과**: 1229/1260 = **98%** 표시율, 모든 9 도시 venue marker ✅

**핵심 파일**:
- [scripts/step7-fill-lucide-from-raw.mjs](../scripts/step7-fill-lucide-from-raw.mjs)
- [scripts/step8b-rerank-with-temp.mjs](../scripts/step8b-rerank-with-temp.mjs)
- [scripts/step9c-wiki-rest-summary.mjs](../scripts/step9c-wiki-rest-summary.mjs)
- [scripts/step10-resolve-cat-conflict.mjs](../scripts/step10-resolve-cat-conflict.mjs)
- [scripts/step11-aggressive-wiki.mjs](../scripts/step11-aggressive-wiki.mjs)

### Phase 2 (정오): HTML 렌더링 SSOT 정정

**문제**: rank 1~20 슬롯이 "갯수 20 채움" 우선 = 누락 진단 불가
**해결**: [docs/qa/index.html:244-248](../docs/qa/index.html#L244-L248)
```javascript
// 변경 전:
const slots = list.slice(0, 20);  // ← rank 무관 첫 20

// 변경 후:
for (let r = 1; r <= 20; r++) {
  const found = list.find(x => x.rank === r);
  slots.push(found || { is_placeholder: true, cat, slot: r, rank: r });
}
```
- + `loading="lazy"` 제거 = 즉시 로드

### Phase 3 (오후): 메인앱 여정 흐름 분석

**조사**: 메인앱 Gemini 호출 + Google fallback 흐름 = `ag2-gemini-recommender.ts` + `ag3-data-matcher.ts`
**발견**:
- 메인앱 = Gemini 응답 = `name + reason + isFood` 만 (= 주소/좌표 X)
- AG3 fallback = `places` 테이블에 저장 (= **사용자 SSOT 위반**)
- `places` 테이블 = 옛 부패 데이터 (= WIKI 잘못된 사진 URL 多)
- 예: `Le Bouillon Chartier` = WIKI Passage Jouffroy 디렉토리 사진 (= 그레뱅 박물관 이미지)
- 예: `Pink Mamma` = WIKI Rue Fromentin 거리 사진 (= 가게 X)

### Phase 4: 단일 SSOT 통합 결정

**사용자 명시**:
> "현시점, place_seed_raw 만 남기고 기능에 지장이 없다면 모든 불필요한 테이블 삭제 혹은 막음.
>  여정 생성 과정에서 원천적으로 place_seed_raw 만 검색 이후 X 면 바로 구글 폴백.
>  이렇게 만들어야 딴 테이블 안 쳐다봄"

**적용**: [server/services/agents/ag3-data-matcher.ts](../server/services/agents/ag3-data-matcher.ts)
- `dbPlacesMap` (= places 테이블) = **차단**
- `placeImageMap` (= place_images) = **차단**
- `celebrityImageMap` (= celebrityPlaceEvidence) = **차단**
- `seedRawMap` 만 = 단일 SSOT
- 옛 phase fallback (= france30, europe30 등) = 폐기
- 필터: `phase IN ('gemini3-2026-05', 'auto-learn-2026-05') AND rank 1-20`

**4-단계 매칭** (= matchPlacesWithDB):
1. `place_id` 직접 매칭 (= Gemini hallucination 多 = 부정확)
2. **`name` 매칭** (= place_seed_raw 정규화 키, 가장 안정) ★
3. `address` 매칭 (= 우편번호만 거부 + name 유사성 검증)
4. Google fallback (= textQuery 에 address 포함 = 정확도 ↑)

**isUsableImageUrl Google CDN 차단 해제** (= 메인앱 직접 로드 = Storage 우회)

### Phase 5: BTS 모델 발명 (= 핵심)

**사용자 통찰**:
> "BTS 자식앱 처럼 우리 DB + 사용자 알고리즘만으로 여정 생성 가능.
>  Gemini API 나 Google 호출 없이도 우리 유로 가능."

**구현**: [server/services/agents/ag2-gemini-recommender.ts](../server/services/agents/ag2-gemini-recommender.ts)
- 새 함수: `fetchFromPlaceSeedRaw(skeleton)` (= line ~46~140)
- vibe → 카테고리 매핑 (= 단순 버전, 사용자 백서가 더 정교):
  ```typescript
  const VIBE_PRIMARY_CATEGORY = {
    Foodie: 'restaurant', Healing: 'healing', Hotspot: 'hotspot',
    Adventure: 'adventure', Romantic: 'hotspot', Culture: 'heritage',
  };
  ```
- 식당 cap = `dayCount × 2` (= 점심 1 + 저녁 1)
- 충분 검증 = `요청 × 0.8` (= 부족 시 Gemini fallback)

**플로우**:
```
generateRecommendations(skeleton):
  1. fetchFromPlaceSeedRaw 시도
     → 발굴 도시 (= 80%+) = 성공 = 21 곳 17 필드 완비 반환
  2. 부족 시 = 기존 Gemini 호출 (= 미발굴 도시)
     → 자동 학습 = place_seed_raw 자동 저장 (= 다음 사용자 = DB 매칭)
```

**측정 (= 동일 입력)**:
| 항목 | Baseline (Gemini) | DB-Only (= BTS 모델) |
|---|---|---|
| 시간 | 24 초 | **4.9 초** ⚡ (= 5 배 빠름) |
| 외부 API | Gemini + Google | **0** (Paris) ⚡ |
| 비용 | $0.0035 | **$0** (Paris) |
| 매칭 정확도 | 일부 미스 | **17/17 100%** |
| 식당 (= AG4 룰) | 식당 11 → Day 3 저녁 2 번 사고 | **6/6 정확** (= cap 적용 후) |

**Gemini 시간 단축 = thinkingBudget=0**: [ag2-gemini-recommender.ts:117](../server/services/agents/ag2-gemini-recommender.ts#L117)
```typescript
config: {
  temperature: 0.7,
  maxOutputTokens: 8192, // 4096 → 8192 = 잘림 방지
  responseMimeType: "application/json",
  thinkingConfig: { thinkingBudget: 0 } as any, // = output 토큰 보호
}
```

### Phase 6: 자동 학습 검증

**Geneva 첫 호출**:
- place_seed_raw 0 행 → Gemini fallback
- Google searchText 21 회 = $0.0085
- 자동 저장 = 21 행 to `place_seed_raw` (phase='auto-learn-2026-05', rank=9000+)

**Geneva 두 번째 호출**:
- 8+ 곳 = name 매칭 = DB 적중 (= "Jet d'Eau", "Palais des Nations", "St. Pierre Cathedral", "CERN" 등)
- Google fallback 호출 횟수 = 약 50% 감소
- = 시간 따라 발굴 도시화

**저장 코드**: [ag3-data-matcher.ts:saveNewPlacesToDB](../server/services/agents/ag3-data-matcher.ts) (= rank 동적 9000+)

### Phase 7: Claude 큐레이션 시뮬

**사용자 평가**: "10 배 낫다, 확 와닿는다, 브라보!"

**비교**:
| 톤 | Gemini | Claude 숏폼 |
|---|---|---|
| 길이 | 35~50 자 만연체 | **15~30 자 × 2 문장** |
| 디테일 | "프랑스 미식의 정점" | **"미슐랭 3 스타. 1 인 €350+. 예약 = 2 달 전"** |
| 행동 유발 | "경험해 보세요" | **"여기 아니면 어디서?"** |
| 톤 | 가이드북 | **릴스/TikTok** |

**사용자 의도**: Claude API 자동화 = 향후 적용 (= 비용 ~$0.005/일정 인정)

---

## 2. 파일 변경 요약

### 수정된 파일 (= ⚠️ 수정금지(승인필요) 마킹)

```
server/services/agents/
  ├─ ag2-gemini-recommender.ts
  │   - fetchFromPlaceSeedRaw 함수 신설 (= place_seed_raw 단일 SSOT)
  │   - VIBE_PRIMARY_CATEGORY 매핑 (= 단순 버전, 백서 정밀화 예정)
  │   - 식당 cap = dayCount × 2 (= AG4 점심/저녁 룰 일치)
  │   - thinkingBudget = 0 (= MAX_TOKENS 잘림 방지)
  │   - place_id + address 프롬프트 추가 (= 매칭 정확도 ↑)
  │   - generateRecommendations: DB 우선 + Gemini fallback
  │
  └─ ag3-data-matcher.ts
      - dbPlacesMap, placeImageMap, celebrityImageMap = 코드 차단
      - 옛 phase fallback (= france30 등) = 폐기
      - 4-단계 매칭 (place_id → name → address → Google)
      - resolvePlaceImage = seedDirectMatch 우선 (= 이름 정규화 차이 회피)
      - searchPlaceByName = address 옵션 추가 (= textQuery 정확도)
      - isUsableImageUrl = Google CDN 차단 해제
      - saveNewPlacesToDB = place_seed_raw 로 변경 (= phase='auto-learn-2026-05', rank=9000+)

docs/qa/index.html
  - rank 1~20 고정 슬롯 (= 누락 진단 visible)
  - lazy loading 제거
  - baseline-viewer.html = 4 라디오 (baseline / changed / ssot / db-only)

scripts/qa-server.mjs
  - /baseline /changed /ssot /db-only 라우트 추가
```

### 신규 스크립트

```
scripts/
  ├─ step7-fill-lucide-from-raw.mjs       (= 194 INSERT)
  ├─ step7c-munich-bts-venue.mjs           (= Olympia 추가)
  ├─ step8-rerank-existing-rows.mjs        (= 옛 시도, 안 됨)
  ├─ step8b-rerank-with-temp.mjs           (= 1119 rerank ✅)
  ├─ step9-wiki-api-fill.mjs               (= 53)
  ├─ step9b-wiki-multi-query.mjs           (= 6)
  ├─ step9c-wiki-rest-summary.mjs          (= 15)
  ├─ step9d-placeholder-analysis.mjs       (= 진단)
  ├─ step10-resolve-cat-conflict.mjs       (= 28)
  ├─ step11-aggressive-wiki.mjs            (= 87)
  ├─ diag-rank-matrix.mjs                  (= 진단)
  ├─ diag-venues-london-munich.mjs         (= 진단)
  ├─ diag-wiki-alive.mjs                   (= 진단)
  ├─ diag-wiki-urls-status.mjs             (= 진단)
  ├─ test-journey-baseline.ts              (= 메인앱 시뮬, 외부 API 우회)
  ├─ test-paris-only.ts                    (= 디버그용)
  ├─ simulate-bts-model-paris.mjs          (= 잘못된 시뮬, 폐기)
  └─ apply-shortform-paris.mjs             (= Claude 톤 적용)

docs/
  ├─ baseline-2026-05-06/   (= Gemini 모드 결과)
  ├─ changed-2026-05-06/    (= place_id+address 모드)
  ├─ ssot-2026-05-06/       (= 단일 SSOT 모드)
  └─ db-only-2026-05-06/    (= BTS 모델 = 외부 호출 0) ★
```

### DB 변경

```
cities 테이블:
  + Geneva (id=127) 신규 추가 (= 사용자 인정)

place_seed_raw:
  + auto-learn-2026-05 phase 행 다수 (= Geneva 21 + Paris 5+)
  - rank = 9000+ (= 사용자 검증 X = top 20 외)
```

---

## 3. 핵심 데이터 (= 후임이 즉시 검증 가능)

### URL (= 로컬)

```
QA 검수 메인:        http://localhost:3001/qa/
비교 뷰어:           http://localhost:3001/qa/baseline-viewer.html
BTS 모델 결과:       http://localhost:3001/db-only/paris-baseline.json
```

서버 시작: `node scripts/qa-server.mjs` (port 3001)

### 시뮬 입력 (= baseline 비교용)

```typescript
{
  destination: 'Paris', // or 'Geneva'
  startDate: '2026-06-01', endDate: '2026-06-03',
  startTime: '10:00', endTime: '21:00',
  vibes: ['Foodie', 'Healing', 'Culture'],
  travelPace: 'Normal',
  travelStyle: 'Reasonable',
  companionType: 'Couple',
  companionCount: 2,
  curationFocus: 'Everyone',
  // ...
}
```

### 검증 명령

```bash
# 1. 서버 시작
node scripts/qa-server.mjs > /tmp/qa-server.log 2>&1 &

# 2. 메인앱 시뮬 (= DB-only 모드, 4.9 초)
npx tsx scripts/test-journey-baseline.ts db-only

# 3. 결과 비교 (= JSON)
node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('docs/db-only-2026-05-06/paris-baseline.json'));
console.log('총:', d.days.flatMap(x => x.places).length);
console.log('식당:', d.days.flatMap(x => x.places).filter(p => p.isMealSlot).length);
"
```

---

## 4. 다음 작업 (= 사용자 결정 필요)

### 우선순위 1 = 사용자 정립 알고리즘 검증

**상황**: 사용자가 별도 md 파일 (= NUBI_WHITEPAPER.md 또는 다른 곳) 재확인 예정.

**누락 가능성**:
- ❌ curationFocus 가중치 (= 아이/부모님/모두/나 별 차이)
- ❌ vibe 우선순위 50/30/20 가중치 적용
- ❌ 시간대 친화도 (= Lunch = Foodie 우선, Evening = Romantic 등)
- ❌ companion bonus (= Single +1.5, Couple +2.0, Family +1.5, Group +1.0)
- ❌ Reality penalty (= 날씨, 혼잡, 영업 상태)
- ❌ Budget → 일자별 슬롯 수 (= Luxury 2 곳/일, Economic 5~6 곳/일)
- ❌ Final Score = (Vibe + Buzz + Taste) / 3 + Style_Adj - Reality_Penalty

**권장**: AG3/AG4 코드 검증 = 백서 알고리즘 어느 부분이 이미 구현됐는지 확인 후, AG2-DB 는 단순 후보 풀 공급으로만 유지.

### 우선순위 2 = Claude 큐레이션 자동화

**비용**: ~$0.005/일정 (= Anthropic API)
**효과**: 한국 톤 10 배 ↑ (= 사용자 검증)
**구현 위치**: AG3 또는 AG4 마지막에 = 21 곳 일괄 호출 → summary_ko 갱신

### 우선순위 3 = 미발굴 도시 정책

**옵션 A**: 발굴 도시만 노출 = "이 도시는 발굴 후 사용 가능" 안내
**옵션 B**: Google fallback 유지 + 자동 학습 (= 현재)

### 우선순위 4 = Replit 배포

**조건**: 위 1~3 결정 후
**검증**: 백서 알고리즘 + Claude 큐레이션 + 사용자 시각 OK

---

## 5. 사용자 SSOT (= 절대 변경 X 룰)

```
1. AG1 = 사용자 1 달 알고리즘 (= 슬롯 + 시간 + vibe 가중치) = 변경 절대 X
2. AG4 = 점심/저녁 슬롯 + 동선 최적화 + 가격 = 변경 절대 X
3. place_seed_raw = 단일 SSOT (= 메인앱 + BTS 자식앱 공통)
4. 발굴 도시 = gemini3-2026-05 phase + rank 1-20 만 신뢰
5. 미발굴 도시 = 자동 학습 (= phase='auto-learn-2026-05', rank=9000+)
6. places, place_images = 코드 참조 X (= 데이터 보존, 재참조 절대 금지)
7. AI 임의 판단 = 금지 (= 사용자 명시 후만)
8. 시뮬 후 결정 (= 30 곳 시각 검수 + 사용자 OK)
9. 비용 = 매번 검토 (= 청구서 폭증 방지)
10. 사용자 = 비개발자 = 시각/UI 으로 검수 (= 코드 직접 X)
```

---

## 6. 후임 AI 핵심 약속

```
✅ 이 문서 끝까지 읽고 시작
✅ 사용자 1 달 알고리즘 = AG1, AG4 = 미터치
✅ AG2 = DB 우선, Gemini fallback (= 새 표준)
✅ 매번 시뮬 후 사용자 시각 검수
✅ 변경 시 = "⚠️ 수정금지(승인필요) 2026-05-06" 주석 + 한국어 + 이유

❌ AI 임의 판단 = 금지
❌ Gemini/Google = 미발굴 도시만 (= 발굴 도시는 0 호출)
❌ places 테이블 재사용 = 영원히 금지 (= 부패 데이터)
❌ 옛 phase (france30, europe30) = 검증 X = 매칭 X
```

---

## 7. 긴급 시 = 롤백

```bash
# AG2 변경 롤백 (= Gemini 호출 복구)
git diff server/services/agents/ag2-gemini-recommender.ts
git checkout server/services/agents/ag2-gemini-recommender.ts

# AG3 변경 롤백
git diff server/services/agents/ag3-data-matcher.ts
git checkout server/services/agents/ag3-data-matcher.ts
```

---

## 8. 사용자 어록 (= 핵심 통찰)

```
"좋은 원석을 가공을 못하니"
   = auto-learn 행 = 17 SSOT 필드 부족 = 추가 가공 필요

"굳이 Gemini 를 쓸 필요가 있나?"
   = 핵심 질문 = BTS 모델 발명의 시작

"이게 BTS 자식앱 방식이쟎아"
   = 같은 모델 = 메인앱 적용 = 검증 끝

"발명 수준이다"
   = 0 외부 API + 4.9 초 + 17/17 매칭 달성

"10 배 낫다, 확 와닿는다, 브라보!"
   = Claude 한국 숏폼 톤 = Gemini 압도

"내가 만든 알고리즘 = 더 정교하다"
   = 사용자 정립 백서 = 다음 적용 대상
```

---

**작성**: 2026-05-06 자정
**다음 시작점**: 사용자 정립 알고리즘 md 재확인 → AG3/AG4 보강 → Replit 배포
**상태**: 핵심 발명 완료. 검증 + 배포 단계 진입 준비.

= 휴식 충전 후 재개. 화이팅.
