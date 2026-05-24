# 09-main-app-itinerary — 메인앱 자동 여정 생성

> ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT 갱신 = **표준 prompt 파일 보관 + MIX 단일 통일**
> (= 옛 SSOT 2026-05-20 "inline 유지 + skill 참조만" = **폐기** = 본 폴더에 원본 보관 SSOT 로 갱신)

## 표준 prompt (= SSOT)

📄 **원본 파일** = [`STANDARD_PROMPT_2026-05-24.md`](STANDARD_PROMPT_2026-05-24.md)
= 본 파일 + 코드 prompt 양쪽 1:1 일치 강제 (= 1 글자 변경 = Gemini 응답 변경 = 검증 후만).

## 위치

| 항목 | 위치 |
|---|---|
| **표준 prompt 원본** | [`STANDARD_PROMPT_2026-05-24.md`](STANDARD_PROMPT_2026-05-24.md) (= 본 폴더) |
| **코드 inline** (= MIX path) | [`server/services/agents/pipeline-v3.ts:419-466`](../../../../../server/services/agents/pipeline-v3.ts#L419-L466) |
| **호출 설정** | `pipeline-v3.ts:467-475` (= temp 0.3 + maxToken 8192 + thinkingBudget 0 + googleSearch) |
| **응답 schema** | 9 필드 = name/nameKo/nameLocal/address/type/latitude/longitude/estimatedCostEur/selection_reason_ko/shortform_ko |

## 사용자 SSOT 결정 (= 2026-05-24)

> "원본을 반드시 스킬에 표준 프롬프트로 오늘 날짜 기재하여 보관 + 파이프라인 MIX 경우 단일 프롬프트로 통일"

= 본 폴더 = 원본 보관 SSOT / 코드 inline = 동기 사본 / MIX path = 본 prompt 단일 사용.
= `ag2-gemini-recommender.ts` 의 별도 prompt = **폐기 대상** (= P0-1 단계 처리).

## 모델 + 설정 (= pipeline-v3.ts:460-463 동일)

| 항목 | 값 |
|---|---|
| 모델 | `gemini-3-flash-preview` |
| temperature | `0.3` (= 다른 prompt 0.2 보다 약간 높음 = 창의성) |
| maxOutputTokens | `8192` |
| thinkingConfig.thinkingBudget | `0` |
| tools | `[{ googleSearch: {} }]` |
| responseMimeType | `application/json` |

## 입력 (= 사용자 폼 형식)

- `destination` (= 도시명)
- `dayCount` (= 1-30)
- `travelPace` (= Packed/Normal/Relaxed)
- `travelStyle` (= Economic/Reasonable/Premium/Luxury) → MEAL_BUDGET 매트릭스 적용
- `vibeWeights` (= 6 vibe 가중치)
- `dayAccommodations` (= 일자별 숙소)
- `koreanSentiment` (= 한국인 감정 분석)

## 응답 schema (= pipeline-v3.ts:434-443)

```ts
{
  days: [{
    day: 1,
    theme: "...",
    activities: [{
      name, nameKo, nameLocal, address, type,
      startTime, endTime, estimatedCostEur,
      selection_reason_ko, shortform_ko
    }]
  }]
}
```

## 핵심 동선 원칙 (= 본 prompt 안 명시 = pipeline-v3.ts:427)

- **3 일+ 일정 = Day 2+ outskirt day-trip 1-2 곳 포함 가능** (= 2026-05-15 추가)
- core (= ≤10km) = Day 1 + main 도심 walkable
- outskirt (= 10-100km) = Day 2+ day-trip slot

## 호출 흐름 (= pipeline-v3.ts 안)

```
AG1 (= 기본 계산 = dayCount/pace/vibes)
   ↓
AG2 = place_seed_raw 매칭 (= DB-only path 시도)
  ├─ ready 도시 = DB SELECT + budget WHERE 필터
  └─ 미발굴 도시 = 본 prompt (= 06) Gemini 호출 + auto-learn 저장
   ↓
AG3 = DB 보강 (= photo/review/score) + 5 단계 매칭 + seedCategory 보존
   ↓
AG4 = 동선 최적화 + 비용 계산 (= 실제 priceEur 합계)
   ↓
[출력] 사용자 화면
```

## 산출물 보관 = 본 prompt 는 **메인앱 런타임 호출** = docs/raw 보관 X

= 본 prompt = 사용자 요청 시 = 실시간 호출 = DB 저장 (= places + place_seed_raw) = 별도 raw JSON 보관 안 함.

## 사용자 SSOT 부합 (= 2026-05-20)

- [✓] inline 위치 유지 (= 사용자 결정)
- [✓] 본 README = 참조 메타데이터만
- [✓] skill 안 다른 5 prompt (= 01-05) 와 1 폴더 1 prompt 구조 일관
- [✓] AG2-DB budget WHERE = 본 세션 작업으로 = 발굴 도시 = DB SELECT 격리

## 변경하려면?

= 헌법 §1 + §12 잠금 = **사용자 명시 승인 후만** = pipeline-v3.ts 안 prompt 수정.
변경 시 = 본 README 도 동기 갱신 필수.