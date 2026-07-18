# STANDARD PROMPT — 메인앱 여정 생성 (= 사장님 SSOT 2026-07-11 슬림본)

> ⚠️ 수정금지(승인필요) 2026-07-11 = 사장님 SSOT 확정본 (슬림 = 축약키 12필드 + 꾸밈글 18자 상한)
> = 코드 안 (= `pipeline-v3.ts:375-432`) + 본 파일 + 카탈로그 `docs/20260607PROMPTS_TOTAL_SSOT.md` #02 = **1 글자도 달라지면 안 됨 = 세 파일 동기 강제**
> = 변경 시 = 헌법 §1 + §3 + §11 = 사장님 명시 승인 후만

---

## 사용자 SSOT 본질 (= 본 prompt 가 존재하는 이유)

> "AI 는 언어를 알아듣지만 = 앱 자체는 코드/파일로만 진행되는 시스템.
> 코드/파일 = LLM 이 아님 = 한번 설정된 대로만 진행 = 그 안의 수정/변질 = 0.
> AI 가 사용자 프롬프트를 코드/파일에 옮길 때 = 변질 발생 = 영구화.
> Gemini 도 AI = 1 자라도 달라지면 반환값 다름 = 100 번 이상 입증."

= 본 파일 = **원본 보관소** = 코드 prompt 와 1:1 비교 검증용 = 변질 차단 SSOT.

---

## 적용 위치 (= 단일 진입점)

| Path | 파일 | 라인 | 호출 함수 |
|---|---|---|---|
| **MIX path** (= 미발굴 도시) | `server/services/agents/pipeline-v3.ts` | 375-432 (= inline) | `step1_geminiItinerary` |
| **DB-only path** (= ready=true 도시) | (= Gemini 호출 0) | — | — |

---

## 모델 + 호출 설정 (= `pipeline-v3.ts:437-451`)

| 항목 | 값 |
|---|---|
| `model` | `gemini-3-flash-preview` |
| `temperature` | `0.3` |
| `maxOutputTokens` | `8192` |
| `thinkingConfig.thinkingBudget` | `0` |
| `responseMimeType` | `"application/json"` (= JSON 강제, **tools 없음 = grounding OFF** — GROUNDING 문구는 프롬프트 지시로만. 환각 안전망 = saveNewPlacesToDB TS 재검증) |

## 수신부 복원 (= 축약키 → 원명, `pipeline-v3.ts` SLIM_KEYS)

`n→name / k→nameKo / l→nameLocal / a→address / t→type / c→seed_category / y→latitude / x→longitude / p→price_eur / d→distance_km_from_center / r→selection_reason_ko / s→shortform_ko`
= 파싱 직후 단일 지점 복원 = 하류(GeminiPlace·DB 컬럼) 불변.

---

## 표준 prompt 원본 (= 영어 raw = 1 글자 변경 금지)

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

[CATEGORY MATRIX — 전체 여정 카테고리별 곳수 (= 사용자 vibe 반영, 반드시 이 비율로 선정)]
${categoryMatrix}
- 각 place 의 c(카테고리)는 위 카테고리 중 하나로 정확히 지정 (heritage=문화/유산, healing=힐링/자연, hotspot=핫플, adventure=모험/액티비티, shopping=쇼핑, attraction=즐길거리/체험, restaurant=식당).
- 식사(lunch/dinner) = c="restaurant".

[동선 원칙]
- ⚠️ NO DUPLICATE PLACES: Each place must appear AT MOST ONCE across the ENTIRE itinerary (all days). 같은 장소(같은 건물·같은 구글맵 위치)를 여러 슬롯/여러 날에 중복 추천 금지 = 이름·주소를 다르게 써도 실제 같은 곳이면 한 번만. 슬롯이 남으면 다른 장소로 채운다.
- 매일 ${formData.destination} 도시 중심부에서 출발·귀환, 같은 날 = 같은 구역 묶기
- Array order within each day = visit order (= sorted by minimum travel distance from start)
- DAILY MEAL RULE (= AG1 has already assigned these slots — DO NOT modify count or position):
    * Each day MUST contain exactly 1 lunch (t="lunch") somewhere in the middle of the day.
    * The FINAL slot of each day MUST be dinner (t="dinner").
- 3 일+ 일정 시 = Day 2+ 한 날 = outskirt (= 도심에서 10-100km 외곽) day-trip 1-2 곳 포함 가능 (= 한국 여행객이 자주 찾는 외곽 명소/아울렛)

[가격 원칙]
- p = ${nowYear}년 실제 입장료 (1인, EUR). 무료=0
- 점심 1인 ~€${mealBudget.lunch}, 저녁 1인 ~€${mealBudget.dinner}
- 활동(activity) = 1인 입장료 / 식당(lunch/dinner) = 1인당 평균. 확실하지 않으면 0

For each place include (= ALL fields verified via Google Search grounding, 키는 아래 축약형 그대로 사용):
- n (English official name on Google Maps)
- k (한국어 = 한국 여행자가 부르는 이름)
- l (local language name = 예: 파리=Tour Eiffel) [= REQUIRED for ALL places INCLUDING restaurants (식당도 반드시). If the restaurant's official name is already in the local language (예: "Le Comptoir du Marché"), copy that same name into l — never leave l empty. = Text Search forwarding + matching key, final DB column]
- a (FULL street address with NUMBER + street + postal code + city) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search]
- t ("activity" | "lunch" | "dinner")
- c (= 위 CATEGORY MATRIX 중 하나 = heritage|healing|hotspot|adventure|shopping|attraction|restaurant. 식사=restaurant) [= final DB column, 카테고리 보존 필수]
- y (latitude = decimal 6 digits, e.g. 48.858370) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- x (longitude = decimal 6 digits, e.g. 2.294481) [= 위 y 와 동일 요건]
- p (1 인 EUR)
- d (= 도심 중심으로부터 직선거리 km = haversine = 소수 1 자리 = 동선 최적화 기본 필수)
- r (한국어 한 줄 = 최대 18자 = 선정 이유 = 한국 여행객 트렌드 = 인스타 성지/한국 vlog 등 사회적 검증)
- s (한국어 한 줄 = 최대 18자 = 장소에 대한 코믹/위트 = Claude 톤. 단순 정보 X = "프사각", "본전 뽑음" 같은 한국 슬랭)

OUTPUT (strict JSON, no markdown fences):
{"days":[{"day":1,"theme":"테마","places":[
  {"n":"Eiffel Tower","k":"에펠탑","l":"Tour Eiffel","a":"Champ de Mars, 5 Av. Anatole France, 75007 Paris","t":"activity","c":"attraction","y":48.858370,"x":2.294481,"p":29.4,"d":2.4,"r":"파리 인증샷 1순위 성지","s":"나 파리다 국룰"},
  {"n":"Le Comptoir du Marché","k":"르 콩투아 뒤 마르쉐","l":"Le Comptoir du Marché","a":"8 Rue de la Loge, 06300 Nice, France","t":"lunch","c":"restaurant","y":43.697415,"x":7.276451,"p":35,"d":0.8,"r":"시장 근처 가성비 미쉐린","s":"예약 없으면 자리 없음"}
]}]}
```

---

## 응답 schema = 12 필드 (= 본 prompt 강제, 축약키 = 수신부가 원명 복원)

| # | 키 | 원명(DB/하류) | 타입 | 용도 |
|---|---|---|---|---|
| 1 | `n` | name | string | Google Maps 영어 공식명 |
| 2 | `k` | nameKo | string | 한국 여행자 친숙 호칭 |
| 3 | `l` | nameLocal | string | 현지어 = TS 매칭 + DB 컬럼 |
| 4 | `a` | address | string | FULL 주소 = TS 매칭 + DB 컬럼 |
| 5 | `t` | type | "activity"\|"lunch"\|"dinner" | 슬롯 종류 |
| 6 | `c` | seed_category | string | 카테고리 보존 = DB 컬럼 |
| 7 | `y` | latitude | number (6 digit) | TS 매칭 + DB 컬럼 = 환각 금지 |
| 8 | `x` | longitude | number (6 digit) | TS 매칭 + DB 컬럼 = 환각 금지 |
| 9 | `p` | price_eur | number | 1인 EUR |
| 10 | `d` | distance_km_from_center | number | 도심거리 km = 동선 재료 |
| 11 | `r` | selection_reason_ko | string ≤18자 | 선정 이유 1줄 |
| 12 | `s` | shortform_ko | string ≤18자 | 코믹/위트 1줄 |

---

## 변경 이력 (= 변질 차단용)

| 날짜 | 변경 | 사용자 SSOT |
|---|---|---|
| 2026-05-20 | inline 위치 유지 + skill README 만 참조 | 옛 SSOT |
| 2026-05-24 | 표준 prompt 파일 보관 + MIX 단일 통일 + Google Search grounding 문구 | 옛 SSOT |
| 2026-07-05 | CATEGORY MATRIX + seed_category + distance_km_from_center 추가 (본 파일 미동기 = 드리프트였음) | 옛 SSOT |
| **2026-07-11** | **슬림본 = 12필드 축약키 + 꾸밈글 18자 상한 + 수신부 SLIM_KEYS 복원. A/B 실호출 실증 = 응답 25% 감축·시간 26% 단축(22.3→16.5초)·결손 0. 드리프트 해소 = 코드·본 파일·카탈로그 #02 3곳 동기** | **현 SSOT (= 본 파일)** |

---

## 변경 통제 (= 헌법 §1 + §3 + §11)

= 본 파일 + 코드 prompt + 카탈로그 #02 = **사장님 명시 승인 후만** 동기 갱신.
= 1 글자 변경 = Gemini 응답 변경 = 실호출 검증 후만 적용.
