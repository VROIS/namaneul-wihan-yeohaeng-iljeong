# STANDARD PROMPT — 메인앱 동선 + 숏폼 시나리오 통합 (= 사용자 SSOT 2026-05-25)

> ⚠️ 수정금지(승인필요) 2026-05-25 = 사용자 SSOT 확정본 (= v6 검증 통과)
> = 코드 함수 (= `generateScenarioPrompt`) + 본 파일 = **1 글자도 달라지면 안 됨**
> = 변경 시 = 양쪽 동기 갱신 + 헌법 §1 + §3 + §11 = 사용자 명시 승인 후만

---

## 사용자 SSOT 본질 (= 본 prompt 가 존재하는 이유)

> "프롬프트가 코드이기도 함" = 자연어 생성 = LLM 만이 할 수 있음 / 결정적 매트릭스 = 코드 함수.
> = 두 영역 분리 = 자동화 100% (= 하드코드 0).
> = 옛 AI 들 = "자연어도 알고리즘으로" = 변질 + 1849 줄 dead code 누적.

= 본 파일 = **원본 보관소** = 함수 prompt 와 1:1 비교 검증용 = 변질 차단 SSOT.

---

## 적용 위치 (= 단일 진입점)

| Path | 파일 | 호출 함수 |
|---|---|---|
| **DB-only path** (= ready=true 도시) | (예정) `server/services/agents/scenario-prompt.ts` | `generateScenarioPrompt(formData, places)` |
| **MIX path** (= 미발굴 도시) | 동일 (= 양 path 공용) | 동일 |
| **호출 단계** | AG2-DB 직후 (= 속도) 또는 AG4 (= 동선 단계) = 사용자 결정 |
| **숏폼 영상 생성** | `/api/itineraries/:id/video/prompts` (= 현재 봉쇄 = 해제 후 본 prompt 호출) |

= **양 path 공용 = 같은 입력 양식 (= 비식당 + 매트릭스) = 같은 응답 양식 (= 24 씬)**

---

## 모델 + 호출 설정

| 항목 | 값 |
|---|---|
| `model` | `gemini-3-flash-preview` |
| `temperature` | `0.3` (= 약간의 창의성 = 시나리오 카피라이팅) |
| `maxOutputTokens` | `50000` |
| `thinkingConfig.thinkingBudget` | `0` |
| `tools` | `[{ googleSearch: {} }]` (= 그라운딩 강제 + Google Maps 자동) |
| `timeout` | `420000 ms` (= 7 분) |

= `_call-config.md` (= 시드 발굴 prompt) 와 동일 설정.

---

## 자동화 = 2 종 분리 (= 사용자 SSOT 핵심)

### A. 결정적 매트릭스 = 코드 함수 (= 하드코드 0 = 함수 호출만)

| FE 입력 | 함수 호출 | 출력 |
|---|---|---|
| `travelPace` | `PACE_CONFIG[travelPace]` | 90/120/150 분 × 8/6/4 슬롯 |
| `travelStyle` | `MEAL_BUDGET[travelStyle]` | lunch / dinner / 매트릭스 |
| `companionType` | `COMPANION_GROUP[companionType]` | 1/2/4/8/10 인원 + 한국어 label |
| `forWhom` | `PROTAGONIST_FOCUS[forWhom]` | tone_ko + camera_subject + sample_narration |
| `mobilityStyle + travelStyle` | `shouldApplyGuidePrice()` | `public_transit` 또는 `private_driver_guide` |
| `vibes 우선순위` | `PRIORITY_WEIGHTS[vibes.length]` | [1.0] / [0.60, 0.40] / [0.50, 0.30, 0.20] |
| `vibes × catSlots` | `VIBE_PRIMARY_CATEGORY` + AG2-DB SELECT | catSlots × day_zone 분리 풀 |

### B. 자연어 카피라이팅 = LLM (= Gemini 전담)

| 필드 | Gemini 책임 |
|---|---|
| `protagonist_summary_ko` | 주인공 한 줄 (= 입력 힌트 기반 카피) |
| `theme_ko` | 일자 테마 (= 일자 cluster 분석 후) |
| `transit_summary_ko` | 일자 교통 요약 (= transport_mode 분기) |
| `visual_cue_ko` | 영상 시각 묘사 (= 카메라 + 분위기) |
| `narration_ko` | 6초 내레이션 (= 한국 슬랭 + protagonist 톤) |
| `subtitle_ko` | 화면 자막 (= 짧음 + 이모지 1) |
| **신규 식당 발견** | name_local + address + lat/lng + 1인/2인 가격 (= Google Maps grounding) |
| **동선 정렬** | nearest-neighbor + Google Maps 실측 |

= **결정적 (= 함수) + 비결정적 (= LLM) 분리 = 자동화 100%**

---

## 표준 prompt 원본 (= 함수 inject 양식 = 1 글자 변경 금지)

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
- ⚠️ Gemini 발견 식당 = 4 필드 반드시 (= name_local / address / lat / lng / **price_per_person_eur = 1 인 EUR 1 가지만**).
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
          "price_per_person_eur": <식당만 = € 1인 EUR = 1 가지만 = 2 인 가격 X>,
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

---

## 입력 양식 = `inputJson` 객체 (= 함수가 매트릭스로 채움)

```ts
{
  city_center: { lat, lng },                             // 출발 + 귀환 anchor
  day_slots_config: [{ day, slots, start_time, end_time }],  // AG1 동적 (= pace 별)
  protagonist: {
    group_type,        // "누구랑" = Single/Couple/Family/...
    group_label_ko,    // 한국어 label
    headcount,         // 인원
    focus,             // "누구를 위한" = child/parent/all/me
    focus_tone_ko,     // 시나리오 톤
    camera_subject,    // 카메라 주인공
    age_desc,          // 옵션 = "10세 딸 + 40대 아빠"
    vibes: [{ vibe, weight, priority }],   // PRIORITY_WEIGHTS
    transport_mode,    // public_transit | private_driver_guide
    pace_label,        // "90분/슬롯 × 8슬롯/일"
  },
  meal_budget_eur_per_person: { lunch, dinner, label },  // MEAL_BUDGET[travelStyle]
  places: [{
    id, name_en, name_ko, name_local, address,
    lat, lng, type,    // type=activity (= 식당은 Gemini 자동 발견)
  }]
}
```

---

## 응답 schema (= 본 prompt 강제)

| 필드 | 출처 | 비고 |
|---|---|---|
| `total_duration_sec` | Gemini 계산 | scenes × 6 |
| `total_distance_km` | Gemini (= Google Maps) | 일자 합계 |
| `protagonist_summary_ko` | Gemini 카피 | 주인공 한 줄 |
| `days[].theme_ko` | Gemini 카피 | 일자 테마 10-15자 |
| `days[].total_distance_km` | Gemini (= Google Maps) | |
| `days[].transit_summary_ko` | Gemini 카피 | transport_mode 분기 |
| `days[].scenes[].slot` | Gemini | 1, 2, 3, ... |
| `days[].scenes[].time` | Gemini | HH:MM |
| `days[].scenes[].type` | Gemini | activity \| restaurant |
| `days[].scenes[].place_id` | 입력 그대로 / `auto-lunch-dN` | 우리 활동 = id / 신규 식당 = auto-* |
| `days[].scenes[].name_en/ko/local` | 입력 그대로 (활동) / Gemini (식당) | |
| `days[].scenes[].address` | 입력 그대로 / Gemini grounding | 식당 = FULL 필수 |
| `days[].scenes[].lat/lng` | 입력 그대로 / Gemini grounding | 6 자리 |
| `days[].scenes[].price_per_person_eur` | Gemini (= 식당만) | **1 인 EUR = 1 가지만** (= 2 인 가격 요청 X = 단위 모호 결함 차단) |
| `days[].scenes[].distance_from_prev_km` | Gemini (= Google Maps) | hop |
| `days[].scenes[].transit_mode` | Gemini (= transport_mode 분기) | walk/metro/RER/bus / private_guide |
| `days[].scenes[].transit_min` | Gemini (= Google Maps) | |
| `days[].scenes[].visual_cue_ko` | **Gemini 카피** | 10-15자 |
| `days[].scenes[].narration_ko` | **Gemini 카피** | 6초 18-25 음절 |
| `days[].scenes[].subtitle_ko` | **Gemini 카피** | 10-15자 + 이모지 1 |

---

## 후처리 = upsertPlace 5 단계 매칭 (= 헌법 §14 강제)

```
응답 scenes 중 place_id="auto-*" = 신규 식당 추출
       ↓
for each newRestaurant:
  upsertPlace({
    cityId, seedCategory: 'restaurant',
    nameEn, nameLocal, address, latitude, longitude,
    priceEur: price_per_person_eur,  // ⚠️ PSR 단위 = 1인
    ...
  })
       ↓
  5 단계 매칭 자동:
    0. google_place_id (= Gemini 안 줌 = skip)
    1. 풀주소 정규화 100%
    2. 좌표 10m
    3. 이름 9 조합 (= name_en/local/ko × LOWER+trim, noAccent, no spaces)
       ↓
  매칭 → UPDATE (= COALESCE 옛 우선 + GREATEST 가격)
  매칭 0 → INSERT (= day_zone 자동 = core/outskirt 거리 기준)
```

= **헌법 §14 = `db.insert(placeSeedRaw)` 직접 호출 금지** = `upsertPlace()` 단일 진입점 강제

---

## 호출 흐름 (= 양 path 공용)

```
[DB-only path]                         [MIX path]
사용자 FE 입력                          사용자 FE 입력
       ↓                                       ↓
AG1 buildSkeleton (= 매트릭스 변환)      AG1 (= 동일)
       ↓                                       ↓
AG2-DB fetchFromPlaceSeedRaw             AG2-MIX = step1_geminiItinerary
  = catSlots × day_zone SELECT             = Gemini 발견 (= 신규 도시)
  = 비식당 풀 확정                          = 비식당 풀 확정
       ↓                                       ↓
       └──────────┬───────────────────────────┘
                  ↓
          ⭐ generateScenarioPrompt(formData, places)
                  ↓
          Gemini 1 회 호출 (= 본 prompt)
                  ↓
          응답 = 동선 정렬 + 24 씬 시나리오 + 신규 식당 5 필드
                  ↓
          ┌───────┴────────┐
          ↓                ↓
   upsertPlace × N      AG3/AG4 (= 비용/시간)
   (= 신규 식당)               ↓
          ↓                FE 표시
   PSR 자동 백필 = 다음 trip 재활용 cascade
```

---

## v6 검증 결과 (= 솔로 백패커 case = 본 prompt 입증)

| 검증 항목 | 결과 |
|---|---|
| AG1 매트릭스 자동 변환 | ✅ 5 함수 호출 (= 하드코드 0) |
| AG2-DB SELECT | ✅ catSlots 15/18 = 자연 fallback |
| 마지막 슬롯 = restaurant | ✅ 3/3 = 100% (= 강제 X = 자연) |
| transport_mode 분기 | ✅ public_transit = walk/metro/RER 정확 |
| 솔로 톤 | ✅ "혼행러", "갓생", "혼자라 더 짜릿" 등 |
| 경제적 식당 | ✅ €14-24 = MEAL_BUDGET.Economic 정확 |
| 한국 인기 식당 | ✅ 라스 뒤 팔라펠 / 부용 샤르티에 / 핑크 마마 등 |
| 식당 5 필드 (= DB 백필) | ✅ 6/6 완비 = upsertPlace 호환 |
| Prompt 길이 / 시간 / 비용 | 7,320자 / 20.1초 / $0.0028 |

= **v6 = 본 prompt 정확 작동 입증** = 사용자 SSOT 부합

---

## 변경 이력 (= 변질 차단용)

| 날짜 | 변경 | 사용자 SSOT |
|---|---|---|
| **2026-05-25** | **신규 = v6 검증 완료 + 표준화** | 현 SSOT (= 본 파일) |

### v1 → v6 진화 (= 본 세션)

| 버전 | 결함 | 교훈 |
|---|---|---|
| v1 | 식당 입력 그대로 + type 환각 | type 필드 추가 필요 |
| v2 | 체크리스트 과다 + 시간 정각 강제 | AI 규칙 과다 = 역효과 |
| v3 | 규칙 최소화 + Gemini 자유 | 마지막 슬롯 restaurant 위반 |
| v4 | 식당 자동 발견 + 0km hop | 식당 좌표 = 직전 활동 좌표 = 부정확 |
| v5 | 식당 5 필드 (1인/2인/풀주소) | travelStyle 임의 = 매트릭스 누락 |
| **v6** | **AG1/AG2 매트릭스 함수 자동 + Gemini 카피라이팅 분리** | ✅ 완성형 |

---

## 변경 통제 (= 헌법 §1 + §3 + §11)

= 본 파일 + 코드 함수 양쪽 = **사용자 명시 승인 후만** 동기 갱신.
= 1 글자 변경 = Gemini 응답 변경 = 검증 후만 적용.
= 변경 시 = README 도 동기.