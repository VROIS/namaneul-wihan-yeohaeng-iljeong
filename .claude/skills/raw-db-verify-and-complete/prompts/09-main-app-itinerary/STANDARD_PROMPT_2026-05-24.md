# STANDARD PROMPT — 메인앱 여정 생성 (= 사용자 SSOT 2026-05-24)

> ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT 확정본
> = 코드 안 (= `pipeline-v3.ts:419-459`) + 본 파일 = **1 글자도 달라지면 안 됨**
> = 변경 시 = 양쪽 동기 갱신 + 헌법 §1 + §3 + §11 = 사용자 명시 승인 후만

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
| **MIX path** (= 미발굴 도시) | `server/services/agents/pipeline-v3.ts` | 419-459 (= inline) | `step1_geminiItinerary` |
| **DB-only path** (= ready=true 도시) | (= Gemini 호출 0) | — | `ag2-gemini-recommender.ts` 의 옛 fallback prompt = 폐기 대상 |

= **MIX 경우 = 본 prompt 단일 통일** (= 사용자 SSOT 2026-05-24).

---

## 모델 + 호출 설정 (= `pipeline-v3.ts:467-475`)

| 항목 | 값 |
|---|---|
| `model` | `gemini-3-flash-preview` |
| `temperature` | `0.3` |
| `maxOutputTokens` | `8192` |
| `thinkingConfig.thinkingBudget` | `0` |
| `tools` | `[{ googleSearch: {} }]` (= 그라운딩 강제) |

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

[CATEGORY MATRIX — 전체 여정 카테고리별 곳수 (= 사용자 vibe 반영, 반드시 이 비율로 선정)] (2026-07-05 추가)
${categoryMatrix}
- 각 place 의 seed_category 는 위 카테고리 중 하나로 정확히 지정 (heritage=문화/유산, healing=힐링/자연, hotspot=핫플, adventure=모험/액티비티, shopping=쇼핑, attraction=즐길거리/체험, restaurant=식당). 식사=restaurant.

[동선 원칙]
- 매일 ${formData.destination} 도시 중심부에서 출발·귀환, 같은 날 = 같은 구역 묶기
- Array order within each day = visit order (= sorted by minimum travel distance from start)
- DAILY MEAL RULE (= AG1 has already assigned these slots — DO NOT modify count or position):
    * Each day MUST contain exactly 1 lunch (type="lunch") somewhere in the middle of the day.
    * The FINAL slot of each day MUST be dinner (type="dinner").
- 3 일+ 일정 시 = Day 2+ 한 날 = outskirt (= 도심에서 10-100km 외곽) day-trip 1-2 곳 포함 가능 (= 한국 여행객이 자주 찾는 외곽 명소/아울렛)

[가격 원칙]
- estimatedCostEur = ${nowYear}년 실제 입장료 (1인, EUR). 무료=0
- 점심 1인 ~€${mealBudget.lunch}, 저녁 1인 ~€${mealBudget.dinner}
- 활동(activity) = 1인 입장료 / 식당(lunch/dinner) = 1인당 평균. 확실하지 않으면 0

For each place include (= ALL fields verified via Google Search grounding):
- name (English official name on Google Maps)
- nameKo (한국어 = 한국 여행자가 부르는 이름)
- nameLocal (local language name = 예: 파리=Tour Eiffel) [= REQUIRED for ALL places INCLUDING restaurants (식당도 반드시). If the restaurant's official name is already in the local language (예: "Le Comptoir du Marché"), copy that same name into nameLocal — never leave nameLocal empty. = Text Search forwarding + matching key, final DB column] (2026-07-06 식당 강제 추가)
- address (FULL street address with NUMBER + street + postal code + city) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search]
- type ("activity" | "lunch" | "dinner")
- seed_category (= 위 CATEGORY MATRIX 중 하나 = heritage|healing|hotspot|adventure|shopping|attraction|restaurant. 식사=restaurant) [= final DB column, 카테고리 보존 필수] (2026-07-05 추가)
- latitude (= decimal 6 digits, e.g. 48.858370) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- longitude (= decimal 6 digits, e.g. 2.294481) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- estimatedCostEur (1 인 EUR)
- distance_km_from_center (= 도심 중심으로부터 직선거리 km = haversine = 소수 1 자리 = 동선 최적화 기본 필수) (2026-07-05 추가)
- selection_reason_ko (한국어 한 줄 = 한국 여행객 트렌드 = 인스타 성지/한국 vlog 등 사회적 검증)
- shortform_ko (한국어 한 줄 = 장소에 대한 코믹/위트 = Claude 톤. 단순 정보 X = "프사각", "본전 뽑음" 같은 한국 슬랭)

OUTPUT (strict JSON, no markdown fences):
{"days":[{"day":1,"theme":"테마","places":[
  {"name":"Eiffel Tower","nameKo":"에펠탑","nameLocal":"Tour Eiffel","address":"Champ de Mars, 5 Av. Anatole France, 75007 Paris","type":"activity","seed_category":"attraction","latitude":48.858370,"longitude":2.294481,"estimatedCostEur":29.4,"distance_km_from_center":2.4,"selection_reason_ko":"파리 인스타 인증샷 1순위 성지","shortform_ko":"파리 왔으면 외쳐줘야 국룰 '나 파리다!'"},
  {"name":"Le Comptoir du Marché","nameKo":"르 콩투아 뒤 마르쉐","nameLocal":"Le Comptoir du Marché","address":"8 Rue de la Loge, 06300 Nice, France","type":"lunch","seed_category":"restaurant","latitude":43.697415,"longitude":7.276451,"estimatedCostEur":35,"distance_km_from_center":0.8,"selection_reason_ko":"구시가지 시장 근처 가성비 미쉐린 맛집","shortform_ko":"예약 안 하면 자리 없음 주의"}
]}]}
```

---

## 응답 schema = 9 필드 (= 본 prompt 강제)

| # | 필드 | 타입 | 용도 |
|---|---|---|---|
| 1 | `name` | string | Google Maps 영어 공식명 |
| 2 | `nameKo` | string | 한국 여행자 친숙 호칭 |
| 3 | `nameLocal` | string | 현지어 = TS 매칭 + DB 컬럼 |
| 4 | `address` | string | FULL 주소 = TS 매칭 + DB 컬럼 |
| 5 | `type` | "activity"\|"lunch"\|"dinner" | 슬롯 종류 |
| 6 | `latitude` | number (6 digit) | TS 매칭 + DB 컬럼 = 환각 금지 |
| 7 | `longitude` | number (6 digit) | TS 매칭 + DB 컬럼 = 환각 금지 |
| 8 | `estimatedCostEur` | number | 1인 EUR (= PSR.price_eur null 시 fallback) |
| 9 | `selection_reason_ko` | string | 한국 여행객 트렌드 1줄 |
| 10 | `shortform_ko` | string | 코믹/위트 1줄 |

= 10 필드 (= startTime/endTime 폐기 + latitude/longitude 추가 + place_id 추가 안 함).

---

## 변경 이력 (= 변질 차단용)

| 날짜 | 변경 | 사용자 SSOT |
|---|---|---|
| 2026-05-20 | inline 위치 유지 + skill README 만 참조 | 옛 SSOT (= 본 파일로 갱신) |
| **2026-05-24** | **표준 prompt 파일 보관 + MIX 단일 통일 + 9 필드 + Google Search grounding 강제** | **현 SSOT (= 본 파일)** |

### 2026-05-24 변경 본질 (= 옛 → 신)

| 항목 | 옛 (= 변질 = 폐기) | 신 (= 사용자 SSOT) |
|---|---|---|
| `startTime, endTime` | "HH:MM" 응답 필드 | ❌ 삭제 (= 시스템 계산) |
| `latitude, longitude` | ❌ 누락 | ✅ 추가 (= TS 매칭 + DB 컬럼) |
| `place_id` | ❌ 누락 | ❌ 추가 안 함 (= Gemini 환각 입증) |
| GROUNDING | 호출 설정만 | ✅ prompt 명시 강제 (= 환각 차단) |
| TASK 라인 | ❌ 없음 | ✅ "slot matrix 채우기 + 최소이동거리 정렬" |
| 점심/저녁 시간 | "12:00~13:30 / 18:30~20:00" | ❌ 삭제 + ✅ "점심 1회 + 마지막 슬롯 저녁" (= AG1 SSOT 재강조) |
| `nameLocal, address` 메타 | 단순 설명 | ✅ "TS forwarding + matching key + DB column" 강조 |

---

## 변경 통제 (= 헌법 §1 + §3 + §11)

= 본 파일 + 코드 prompt 양쪽 = **사용자 명시 승인 후만** 동기 갱신.
= 1 글자 변경 = Gemini 응답 변경 = 검증 후만 적용.