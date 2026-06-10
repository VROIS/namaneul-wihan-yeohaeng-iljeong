# 10-main-app-route-scenario — 메인앱 동선 + 숏폼 시나리오 통합

> ⚠️ 수정금지(승인필요) 2026-05-25 = 사용자 SSOT = **v6 검증 통과 = 표준 prompt 보관**
> (= v1~v5 = 본 세션 진화 = v6 = 완성형)

## 표준 prompt (= SSOT)

📄 **원본 파일** = [`STANDARD_PROMPT_2026-05-25.md`](STANDARD_PROMPT_2026-05-25.md)
= 본 파일 + 코드 함수 (= `generateScenarioPrompt`) 양쪽 1:1 일치 강제.

## 위치

| 항목 | 위치 |
|---|---|
| **표준 prompt 원본** | [`STANDARD_PROMPT_2026-05-25.md`](STANDARD_PROMPT_2026-05-25.md) (= 본 폴더) |
| **코드 함수** (= 예정) | `server/services/agents/scenario-prompt.ts` (= `generateScenarioPrompt`) |
| **호출 endpoint** | `/api/itineraries/:id/video/prompts` (= 현재 봉쇄 = 해제 후 본 prompt 호출) |
| **호출 단계** | AG2-DB 직후 (= 속도) 또는 AG4 (= 동선 단계) = 사용자 결정 |

## 사용자 SSOT 결정 (= 2026-05-25)

> "오늘 너의 걸작 v6 응답을 도출한 프롬프트를 표준화 시켜야해 스킬에 원문을 넣고 이게 곧 코드이기도 함"

= 본 폴더 = 원본 보관 SSOT / 코드 함수 = 동기 사본 / DB-only + MIX 양 path 공용.

## 핵심 원칙 = **자동화 2 종 분리**

| 영역 | 도구 | 우리 역할 |
|---|---|---|
| **결정적 매트릭스 변환** | 코드 함수 (= PACE_CONFIG / MEAL_BUDGET / COMPANION_GROUP / PROTAGONIST_FOCUS / shouldApplyGuidePrice / PRIORITY_WEIGHTS) | 우리가 만듦 (= 헌법 §14 §17) |
| **자연어 카피라이팅** | Gemini LLM (= protagonist_summary_ko / theme_ko / narration_ko / visual_cue_ko / subtitle_ko) | 양식 + 힌트만 제공 |
| **장소 발견 + grounding** | Gemini + Google Maps/Search | 호출 조건 + 검증 정의 |

= **하드코드 0 + AI 임의 0 = 함수 결정 + LLM 카피 = 완전 자동화**

## 모델 + 설정

| 항목 | 값 |
|---|---|
| 모델 | `gemini-3-flash-preview` |
| temperature | `0.3` (= 시나리오 카피 창의성) |
| maxOutputTokens | `50000` |
| thinkingConfig.thinkingBudget | `0` |
| tools | `[{ googleSearch: {} }]` |
| timeout | `420000 ms` |

= `_call-config.md` 와 동일 설정 (= 9 종 prompt 공통).

## 입력 양식 (= 함수 inject)

```ts
{
  city_center: { lat, lng },
  day_slots_config: [{ day, slots, start_time, end_time }],
  protagonist: {
    group_type, group_label_ko, headcount,    // 누구랑
    focus, focus_tone_ko, camera_subject,      // 누구를 위한
    age_desc, vibes, transport_mode, pace_label,
  },
  meal_budget_eur_per_person: { lunch, dinner, label },
  places: [{ id, name_en, name_ko, name_local, address, lat, lng, type }],
}
```

= **최소 필수 4 종** = name_local + lat/lng + address + protagonist (= 4 정보 = Gemini grounding 완비)

## 응답 schema (= 양 path 공용)

```ts
{
  total_duration_sec, total_distance_km, protagonist_summary_ko,
  days: [{
    day, theme_ko, total_distance_km, transit_summary_ko,
    scenes: [{
      slot, time, type, place_id, name_en, name_ko, name_local,
      address, lat, lng,
      price_eur,    // ⚠️ 식당만 = 1 인 EUR 1 가지만 (= 2 인 가격 X = 단위 모호 결함 차단 2026-05-25)
      distance_from_prev_km, transit_mode, transit_min,
      visual_cue_ko, narration_ko, subtitle_ko,
    }]
  }]
}
```

= 신규 식당 (= `place_id="auto-*"`) = upsertPlace 5 단계 매칭 후 PSR 백필 = 다음 trip 재활용 cascade.

## 호출 흐름

```
사용자 FE 5 입력 (= 누구랑/누구를 위한/vibes/pace/style/mobility)
       ↓
AG1 buildSkeleton (= 6 매트릭스 함수 호출)
       ↓
AG2-DB SELECT (= catSlots × day_zone)
       ↓
generateScenarioPrompt(formData, places)
       ↓
Gemini 1 회 호출 (= 본 prompt)
       ↓
응답 = 동선 정렬 + 24 씬 시나리오 + 신규 식당 5 필드
       ↓
upsertPlace × N (= 신규 식당 = 헌법 §14)
       ↓
FE 표시 + DB 재활용 cascade
```

## v6 검증 결과 (= 본 prompt 입증)

| 검증 항목 | 결과 |
|---|---|
| AG1 매트릭스 자동 변환 | ✅ 5 함수 호출 (= 하드코드 0) |
| AG2-DB SELECT | ✅ catSlots 15/18 = 자연 fallback |
| 마지막 슬롯 = restaurant | ✅ 3/3 = 100% (= 자연) |
| transport_mode 분기 | ✅ public_transit = walk/metro/RER 정확 |
| 솔로 톤 | ✅ "혼행러", "갓생" 등 정확 |
| 경제적 식당 | ✅ €14-24 = MEAL_BUDGET.Economic |
| 한국 인기 식당 | ✅ 라스 뒤 팔라펠 / 부용 샤르티에 / 핑크 마마 |
| 식당 5 필드 (= upsertPlace 호환) | ✅ 6/6 완비 |
| Prompt 길이 / 시간 / 비용 | 7,320자 / 20.1초 / $0.0028 |

= **v6 = 본 prompt 정확 작동 입증** = 사용자 SSOT 부합

## 호출 비용 (= 1 trip 기준)

| 비교 | 비용 |
|---|---|
| **본 prompt** (= Gemini 1 회) | **$0.0028** |
| Google Maps API (= geocoding + directions + places 5+ 호출) | ~$0.005 |
| OpenAI GPT-4 (= 같은 prompt) | ~$0.054 |
| Claude Sonnet (= 같은 prompt) | ~$0.054 |

= **Gemini = 1.7x ~ 19x 저렴** + Google Search/Maps grounding 자동 = 본 use case 최적.

## 후처리 = upsertPlace (= 헌법 §14)

```ts
for (const scene of response.scenes) {
  if (scene.place_id?.startsWith('auto-')) {
    await upsertPlace({
      cityId, seedCategory: 'restaurant',
      nameEn: scene.name_en, nameLocal: scene.name_local,
      address: scene.address, latitude: scene.lat, longitude: scene.lng,
      priceEur: scene.price_eur,  // ⚠️ PSR 단위 = 1인
    });
    // = 5 단계 매칭 자동 (= PID/주소/좌표/이름 9조합)
    // = 매칭 → UPDATE (= COALESCE 옛 우선 + GREATEST 가격)
    // = 매칭 0 → INSERT (= day_zone 자동)
  }
}
```

= **`db.insert()` 직접 호출 금지** = `upsertPlace()` 단일 진입점 = 중복 행 차단

## 변경하려면?

= 헌법 §1 + §3 + §11 잠금 = **사용자 명시 승인 후만**.
변경 시 = `STANDARD_PROMPT_2026-05-25.md` + 코드 함수 + 본 README 동기 갱신 필수.

## 9 vs 10 prompt 비교

| | 09-main-app-itinerary | **10-main-app-route-scenario** |
|---|---|---|
| 단계 | AG2 (= place 발굴) | **AG2 직후 또는 AG4 (= 동선 + 시나리오)** |
| 입력 | 도시 + 슬롯 매트릭스 (= 빈손) | **확정 places + 매트릭스 (= 비식당 풀)** |
| Gemini 책임 | 장소 발굴 + 좌표 + 주소 + 동선 + 시나리오 | **동선 정렬 + 시나리오 + 식당 발견** |
| 적용 path | MIX (= 미발굴 도시) | **DB-only + MIX 양 path 공용** |
| 응답 필드 | 9 종 (= name/lat/lng/address/cost/...) | **20+ 종 (= 동선 + 시나리오 통합)** |
| 호출 빈도 | 미발굴 도시 시 (= 드뭄) | **매 trip 마다 (= 메인 use case)** |