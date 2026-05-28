# STANDARD PROMPT — 메인앱 동선 최적화 전용 (= 사용자 SSOT 2026-05-26)

> ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT 확정본 (= 시나리오 카피 완전 제외 = 동선 + 식당 자동 발견만)
> = 코드 함수 (= `generateRoutePrompt`) + 본 파일 = **1 글자도 달라지면 안 됨**
> = 변경 시 = 양쪽 동기 갱신 + 헌법 §1 + §3 + §11 = 사용자 명시 승인 후만

---

## 사용자 SSOT 본질 (= 본 prompt 가 존재하는 이유)

> 옛 표준 prompt (= STANDARD_PROMPT_2026-05-25.md = 시나리오 통합) = 40 초 소요 = 너무 느림.
> 시나리오 카피 (= narration / visual_cue / subtitle / theme / transit_summary / protagonist_summary) = 출력 토큰 약 1500 = 약 -10 초 단축.
> 본 prompt = **동선 + 식당 자동 발견만** = 시간 단축 + FE 우선 노출 + 백필 background.

= 시나리오 영역 = `11-main-app-scenario/` 별도 폴더 = 추후 별도 prompt 진행.

---

## 적용 위치 (= 단일 진입점)

| Path | 파일 | 호출 함수 |
|---|---|---|
| **DB-only path** (= ready=true 도시) | `server/services/route/route-prompt.ts` | `generateRoutePrompt(formData, places)` |
| **MIX path** (= 미발굴 도시) | 동일 (= 양 path 공용 = 추후 통합) | 동일 |
| **호출 단계** | AG4 (= ag4-db-finalize.ts 안) |
| **백필** | `route-backfill.ts` = upsertPlace × N = **background fire-and-forget** (= FE 응답 후) |

---

## 모델 + 호출 설정

| 항목 | 값 |
|---|---|
| `model` | **`gemini-2.5-flash-lite`** (= 사용자 SSOT 2026-05-26 = 가성비 최고) |
| `temperature` | `0.3` |
| `maxOutputTokens` | `50000` |
| `thinkingConfig.thinkingBudget` | `0` |
| `tools` | `[{ googleSearch: {} }]` (= 그라운딩 강제 + Google Maps 자동) |
| `timeout` | `420000 ms` (= 7 분) |

### 모델 선택 근거 (= 2026-05-26 공식 pricing)

| 모델 | 입력 $/1M | 출력 $/1M | Search 무료 | Maps 무료 | 상태 |
|---|---|---|---|---|---|
| ~~gemini-3-flash-preview~~ (= 옛) | $0.50 | $3.00 | 월 5,000 공유 | 동일 | preview |
| gemini-3.5-flash | $1.50 | $9.00 | 월 5,000 공유 | 동일 | GA |
| **gemini-2.5-flash-lite** (= 본) | **$0.10** | **$0.40** | **일 1,500 RPD** | **일 1,500 RPD** | **GA** |
| gemini-2.5-flash | $0.30 | $2.50 | 일 1,500 RPD | 일 1,500 RPD | GA |

= **gemini-2.5-flash-lite 선택**:
- 입력 1/5 (= -80%) / 출력 1/7.5 (= -87%) = 옛 gemini-3-flash-preview 대비 비용 절감
- grounding 무료 한도 일 1,500 RPD = 월 약 45,000 = gemini-3 family 월 5,000 공유보다 9 배 풍부
- GA = production 안정
- 옛 preview 모델 = grounding 한도 초과 시 $14/1K 추가 비용 = 본 lite = 같은 한도 + 더 저렴한 base

---

## 자동화 = 2 종 분리 (= 사용자 SSOT 핵심)

### A. 결정적 매트릭스 = 코드 함수 (= 하드코드 0)

| FE 입력 | 함수 호출 | 출력 |
|---|---|---|
| `travelPace` | `PACE_CONFIG[travelPace]` | 90/120/150 분 × 8/6/4 슬롯 |
| `travelStyle` | `MEAL_BUDGET[travelStyle]` | lunch / dinner / 매트릭스 |
| `companionType` | `getCompanionCount(companionType)` | 1/2/4/8/10 인원 |
| `companionType` | `COMPANION_LABEL_KO` | 한국어 label |
| `curationFocus` | `FOCUS_KEY` | child / parent / all / me |
| `mobilityStyle + travelStyle` | `shouldApplyGuidePrice()` | `public_transit` 또는 `private_driver_guide` |
| `vibes 우선순위` | `PRIORITY_WEIGHTS[vibes.length]` | [1.0] / [0.60, 0.40] / [0.50, 0.30, 0.20] |

### B. 동선 + 식당 자동 발견 = LLM (= Gemini 전담)

| 책임 | Gemini |
|---|---|
| **동선 정렬** | nearest-neighbor + Google Maps 실측 + 자연 cluster |
| **점심 식당 자동 발견** | 일자 중간 + 좌표 인근 + 예산 이내 + Google Maps grounding |
| **저녁 식당 자동 발견** | 일자 마지막 + 좌표 인근 + 예산 이내 + Google Maps grounding |
| **신규 식당 5 필드** | name_local + address + lat/lng + 1인 가격 + transit |

= **결정적 (= 함수) + 비결정적 (= LLM = 동선 + 식당)** = 시나리오 카피 0 = 시간 단축.

---

## 표준 prompt 원본 (= 함수 inject 양식 = 1 글자 변경 금지)

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
- ⚠️ Gemini 발견 식당 = 7 필드 반드시 (= name_local / address / lat / lng / **price_per_person_eur = 1 인 EUR 1 가지만** / **selection_reason_ko** / **shortform_ko**).
- ⚠️ **price_for_2_eur 같은 2 인 가격 요청 X** (= Gemini 가 2 인 가격을 1 인 필드에 입력 위험 = 사용자 SSOT 2026-05-25 = 단위 모호 결함).
- **selection_reason_ko** = 한국어 한 줄 = 인스타 성지/네이버 블로그/유튜브 vlog 사회적 검증 (→ DB summary_ko).
- **shortform_ko** = 한국어 한 줄 = 코믹/위트 후킹 = "프사각", "본전 뽑음" 한국 슬랭 (→ DB editorial_summary).
- 모두 Google Search grounding 검증 = 환각 금지.

# 활동 응답 양식 (= 2026-05-28 사용자 SSOT 신규)
- 활동 = `address` + `name_local` + `price_per_person_eur` 응답 (= 입장료/체험비 1 인 EUR = PSR 오류 정정 base = R3 백필).
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
          "price_per_person_eur": <활동 + 식당 모두 = € 1인 EUR = 1 가지만 = 2 인 가격 X = 활동 = 입장료/체험비 / 식당 = 식사비 / 무료 = 0>,
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

= 옛 prompt 와 차이 (= 제거 영역):
- `# Tone Sample` 섹션 (= 3 줄)
- `protagonist_summary_ko`
- `theme_ko` (= day)
- `transit_summary_ko` (= day)
- `visual_cue_ko` / `narration_ko` / `subtitle_ko` (= scene)
- 핵심 원칙 6 (= 시나리오 톤)

---

## 입력 양식 = `inputJson` 객체 (= 함수가 매트릭스로 채움)

```ts
{
  city_center: { lat, lng },                                   // 출발 + 귀환 anchor
  // ⚠️ 2026-05-26 = 사용자 SSOT = 사용자 동적 입력만 = 시키지 않은 조건 inject X
  // = pace = AG2 풀 수 결정 내부 코드만 = Gemini 무관 = 자유
  trip_config: {
    day_count,         // = 일자 수
    start_time,        // = formData.startTime
    end_time,          // = formData.endTime
  },
  protagonist: {
    group_type,        // "Single" | "Couple" | "Family" | ...
    group_label_ko,    // 한국어 label
    headcount,         // getCompanionCount()
    focus,             // "child" | "parent" | "all" | "me" = FOCUS_KEY
    age_desc,          // companionAges
    vibes: [{ vibe, weight, priority }],   // PRIORITY_WEIGHTS
    transport_mode,    // public_transit | private_driver_guide
  },
  // ⚠️ 2026-05-26 = 사용자 SSOT = 일한도만 = 점심:저녁 비율 강제 X = 동선 따른 식당 자유
  meal_budget_eur_per_person: { daily_total, label },   // = MEAL_BUDGET[travelStyle] 동적
  places: [{                                                    // = 비식당 만 (= 사용자 SSOT C = restaurant 제외)
    id, name_en, name_ko, name_local, address,
    lat, lng, type='activity'                                  // = 식당은 Gemini 자동 발견
  }]
}
```

---

## 응답 schema (= 본 prompt 강제 = 동선 + 식당만)

| 필드 | 출처 | 비고 |
|---|---|---|
| `total_duration_sec` | Gemini 계산 | scenes × 6 |
| `total_distance_km` | Gemini (= Google Maps) | 일자 합계 |
| `days[].day` | Gemini | 1, 2, ... |
| `days[].total_distance_km` | Gemini (= Google Maps) | |
| `days[].scenes[].slot` | Gemini | 1, 2, 3, ... |
| `days[].scenes[].time` | Gemini | HH:MM |
| `days[].scenes[].type` | Gemini | activity \| restaurant |
| `days[].scenes[].place_id` | 입력 그대로 / `auto-lunch-dN` | 활동 = id / 신규 식당 = auto-* |
| `days[].scenes[].name_en/ko/local` | 입력 그대로 (활동) / Gemini (식당) | |
| `days[].scenes[].address` | 입력 그대로 / Gemini grounding | 식당 = FULL 필수 |
| `days[].scenes[].lat/lng` | 입력 그대로 / Gemini grounding | 6 자리 |
| `days[].scenes[].price_per_person_eur` | Gemini (= 식당만) | **1 인 EUR = 1 가지만** |
| `days[].scenes[].distance_from_prev_km` | Gemini (= Google Maps) | hop |
| `days[].scenes[].transit_mode` | Gemini (= transport_mode 분기) | walk/metro/RER/bus / private_guide |
| `days[].scenes[].transit_min` | Gemini (= Google Maps) | |

= **시나리오 카피 필드 (= visual_cue_ko / narration_ko / subtitle_ko / theme_ko / transit_summary_ko / protagonist_summary_ko) 완전 제외**.

---

## 후처리 = backfillFromRoute (= 사용자 SSOT 2026-05-26 = background)

```
응답 scenes 중 place_id="auto-*" = 신규 식당 추출
       ↓ (= background = fire-and-forget = FE 응답 후)
for each newRestaurant:
  upsertPlace({
    cityId, seedCategory: 'restaurant',
    nameEn, nameLocal, address, latitude, longitude,
    priceEur: price_per_person_eur,
  })
       ↓
  5 단계 매칭 자동 (= 헌법 §14 단일 진입점)
       ↓
  매칭 → UPDATE (= COALESCE 옛 우선 + GREATEST 가격)
  매칭 0 → INSERT (= day_zone 자동)
```

= **헌법 §14 = `db.insert(placeSeedRaw)` 직접 호출 금지** = `upsertPlace()` 단일 진입점 강제
= **사용자 명시 2026-05-26 = background** = FE 우선 노출 + 백필 = 동시 사용자 새 요청 = race 안전 (= upsertPlace race handling 보유)

---

## 호출 흐름

```
사용자 FE 입력
       ↓
AG1 buildSkeleton (= 매트릭스 변환)
       ↓
AG2-DB fetchFromPlaceSeedRaw (= 비식당 + 식당 풀)
       ↓
AG3-DB + 슬롯 분배 (= 옛 = 추후 단계 4 폐기 검토)
       ↓
AG4-DB finalize:
   ⭐ generateRoutePrompt(skeleton, places, cityCoords)  ← 비식당만 + 식당 풀 제외
       ↓
   Gemini 1 회 호출 (= 본 prompt = 동선 전용)
       ↓
   응답 = 동선 정렬 + 식당 자동 발견
       ↓
   ┌────────────┬────────────────────────┐
   ↓                                      ↓
FE 응답 (= 우선)              backfillFromRoute (= background)
   = transit/cost                = upsertPlace × N
                                      ↓
                                 PSR 자동 백필 = 다음 trip cascade
```

---

## 시간 단축 추정 (= 옛 시나리오 통합 prompt 대비)

| 영역 | 단축 |
|---|---|
| 시나리오 카피 6 필드 제거 (= 출력 토큰 -1500 추정) | **-10 초** |
| 백필 비동기 (= FE 응답 시점) | **-4 초** |
| (= 추후) `gemini-3.5-flash` 교체 (= 4x faster) | **-15 ~ -20 초** |

= 옛 42 초 → 본 prompt = **약 28 초** → Lite 모델 = **약 10 초** 예상.

---

## 변경 통제 (= 헌법 §1 + §3 + §11)

= 본 파일 + 코드 함수 양쪽 = **사용자 명시 승인 후만** 동기 갱신.
= 1 글자 변경 = Gemini 응답 변경 = 검증 후만 적용.
= 변경 시 = README 도 동기 (= 추후 신규 작성).

---

## 옛 SSOT 보존 위치

| 옛 파일 | 신규 위치 (= 보존) |
|---|---|
| `10-main-app-route-scenario/STANDARD_PROMPT_2026-05-25.md` (= 시나리오 통합) | **`11-main-app-scenario/STANDARD_PROMPT_2026-05-25.md`** (= 추후 시나리오 작업 시 = 참조) |
| `10-main-app-route-scenario/README.md` | `11-main-app-scenario/README.md` |