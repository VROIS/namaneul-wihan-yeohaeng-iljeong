// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = 메인앱 동선 최적화 전용 표준 prompt
// = 헌법 §3 + §11 + §16 = 변경 시 양쪽 동기 + 사용자 명시 승인
// = SSOT 원본: .claude/skills/raw-db-verify-and-complete/prompts/10-main-app-route/STANDARD_PROMPT_2026-05-26_route-only.md
// = 1 글자라도 달라지면 안 됨 (= 양쪽 1:1 비교 검증)
//
// 본 파일 = 동선 + 식당 자동 발견 전용 (= 시나리오 카피 6 필드 완전 제거)
//   - 옛 = 시나리오 통합 = 11-main-app-scenario/ 폴더 = 추후 별도 작업
//
// 자동화 = 2 종 분리:
//   A. 결정적 매트릭스 = 본 파일 (= 함수 호출 = 하드코드 0)
//   B. 동선 + 식당 자동 발견 = Gemini

import type {
  AG1Output,
  TripFormData,
  CurationFocus,
  MobilityStyle,
  TravelStyle,
} from "../agents/types";
import { MEAL_BUDGET, getCompanionCount } from "../agents/types";
import type { PlaceResult } from "../agents/types";
// ⚠️ 수정금지(승인필요) 2026-05-25 = 헌법 §16 = shouldApplyGuidePrice 단일 SSOT (= transport-pricing-service)
// = 옛 로컬 정의 (= 같은 이름 다른 의미) = silent drift 위험 = 폐기
import { shouldApplyGuidePrice } from "../transport-pricing-service";
import type { RouteInputJson } from "./route-types";

/**
 * COMPANION_LABEL_KO = companionType → 한국어 label 1:1 (= 본 prompt 전용 카피)
 * = headcount = getCompanionCount() (= types.ts SSOT) 직접 호출 = 중복 차단
 */
const COMPANION_LABEL_KO: Record<string, string> = {
  Single: "1 인 (= 솔로)",
  Solo: "1 인 (= 솔로)",
  Couple: "커플 2 인",
  Family: "가족 4 인 (= 부모 + 자녀)",
  ExtendedFamily: "대가족 8 인",
  Group: "친구 10 인 그룹",
};

/**
 * ⚠️ 2026-05-26 = 사용자 SSOT = 동선 전용 = 시나리오 카피 매트릭스 폐기
 * = focus_key 만 = inputJson.protagonist.focus 채움 (= 동선 영향 = 아이/부모/솔로 시설 선호)
 * = camera_subject / sample_narration / tone_ko = 시나리오 카피 = 폐기
 */
const FOCUS_KEY: Record<CurationFocus, "child" | "parent" | "all" | "me"> = {
  Kids: "child",
  Parents: "parent",
  Everyone: "all",
  Self: "me",
};

/**
 * resolveTransportMode = transport-pricing-service.shouldApplyGuidePrice() → string 매핑
 * = boolean SSOT (= 단일 함수) + 본 prompt 양식 ("public_transit" | "private_driver_guide")
 */
function resolveTransportMode(
  mobilityStyle: MobilityStyle | undefined,
  travelStyle: TravelStyle | undefined,
): "public_transit" | "private_driver_guide" {
  return shouldApplyGuidePrice(
    (mobilityStyle || "Moderate") as MobilityStyle,
    (travelStyle || "Reasonable") as TravelStyle,
  )
    ? "private_driver_guide"
    : "public_transit";
}

/**
 * city_center 우선순위 = 표준 prompt 의 출발/귀환 anchor
 * 1. formData.accommodationCoords (= 사용자 입력 숙소)
 * 2. cityCoords (= DB cities 테이블 도시 중심)
 * 3. places[0] (= fallback)
 */
function resolveCityCenter(
  formData: TripFormData,
  cityCoords: { lat: number; lng: number } | undefined,
  places: PlaceResult[],
): { lat: number; lng: number } {
  if (formData.accommodationCoords?.lat && formData.accommodationCoords?.lng) {
    return formData.accommodationCoords;
  }
  if (cityCoords?.lat && cityCoords?.lng) {
    return cityCoords;
  }
  const first = places.find((p) => p.lat && p.lng);
  if (first) return { lat: first.lat, lng: first.lng };
  return { lat: 0, lng: 0 };
}

/**
 * AG1Output + places + cityCoords → RouteInputJson (= 결정적 매트릭스 변환)
 * = 표준 prompt 의 inputJson 자동 채움 = 하드코드 0
 */
export function buildRouteInputJson(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: { lat: number; lng: number } | undefined,
): RouteInputJson {
  const { formData, vibeWeights, paceConfig } = skeleton;

  const companionType = formData.companionType || "Solo";
  const groupLabelKo = COMPANION_LABEL_KO[companionType] || "1 인 (= 솔로)";
  const headcount = getCompanionCount(companionType);
  const focusKey = FOCUS_KEY[formData.curationFocus || "Everyone"];
  const transport_mode = resolveTransportMode(
    formData.mobilityStyle,
    formData.travelStyle,
  );
  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];

  return {
    city_center: resolveCityCenter(formData, cityCoords, places),
    // ⚠️ 2026-05-26 = 사용자 SSOT = 사용자 동적 입력만 = 시키지 않은 조건 X
    // = pace = inject 폐기 (= AG2 풀 수 결정 내부 코드만)
    trip_config: {
      day_count: skeleton.dayCount,
      start_time: formData.startTime || "09:00",
      end_time: formData.endTime || "21:00",
    },
    protagonist: {
      group_type: companionType,
      group_label_ko: groupLabelKo,
      headcount,
      focus: focusKey,
      age_desc: formData.companionAges || undefined,
      vibes: vibeWeights.map((v, i) => ({
        vibe: String(v.vibe),
        weight: v.weight,
        priority: i + 1,
      })),
      transport_mode,
    },
    // ⚠️ 2026-05-26 = 사용자 SSOT = 일한도만 = 점심:저녁 비율 강제 X
    meal_budget_eur_per_person: {
      daily_total: mealBudget.dailyTotal, // = 동적 = MEAL_BUDGET[travelStyle].dailyTotal
      label: mealBudget.label,
    },
    // ⚠️ 2026-05-26 = 사용자 SSOT = C = 식당 풀 제외 (= 제미니 자동 발견) + NULL 좌표 필터 제거 (= 카테고리 전체 풀)
    places: places
      .filter((p) => p.seedCategory !== "restaurant")
      .map((p) => ({
        id: p.id,
        name_en: p.name || "",
        name_ko: (p as any).nameKo || p.name || "",
        name_local: (p as any).nameLocal || p.name || "",
        address: (p as any).address || "",
        lat: p.lat,
        lng: p.lng,
        type: "activity" as const,
      })),
  };
}

/**
 * ⚠️ 2026-05-26 = 사용자 SSOT = 동선 전용 prompt (= 시나리오 카피 5 + 식당 풀 = 모두 제외)
 * = B = protagonist_summary_ko / theme_ko / transit_summary_ko / # Tone Sample / focus_tone_ko/camera_subject 모두 제외
 * = C = places.filter(seedCategory !== 'restaurant') (= 식당 풀 제외 = 제미니 자동 발견 + NULL 좌표 필터 제거)
 */
export function generateRoutePrompt(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: { lat: number; lng: number } | undefined,
): { prompt: string; inputJson: RouteInputJson } {
  const inputJson = buildRouteInputJson(skeleton, places, cityCoords);
  const { formData, paceConfig } = skeleton;
  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];
  const transportMode = inputJson.protagonist.transport_mode;
  const nonRestaurantCount = inputJson.places.length;
  const tc = inputJson.trip_config;

  // prettier-ignore
  const prompt = `# 역할
너는 한국인 여행자를 위한 ${formData.destination} 동선 최적화 전문가다.

# 너의 강점
- Google Maps grounding = 실 도로 거리 + 동선 인근 식당 발견 + 정확 좌표/주소.
- Google Search grounding = 한국 인스타/유튜브 트렌드 + 실 가격.

# 목표
입력 ${nonRestaurantCount} 비식당 + 일자별 점심 + 저녁 식당 자동 발견

# 시간 + 일자 (= 사용자 동적 입력)
- ${tc.day_count} 일 / 출발 ${tc.start_time} ~ 종료 ${tc.end_time}
- 일자별 슬롯 수 = 자유 (= 동선 효율 따라)
- 시각 분배 = 자유

# 식당 자동 발견 + DB 백필
- 점심 = 일자 중간 시각 + 좌표 인근.
- 저녁 = 일자 마지막 종착지 + 좌표 인근.
- 식비 = 일일 한도 €${mealBudget.dailyTotal} (= ${mealBudget.label}) 내 자유 분배 (= 동선 따른 식당 선택 자유 = 점심/저녁 비율 강제 X).
- ⚠️ Gemini 발견 식당 = 7 필드 반드시 (= name_local / address / lat / lng / **price_per_person_eur = 1 인 EUR 1 가지만** / **selection_reason_ko** / **shortform_ko**).
- ⚠️ **price_for_2_eur 같은 2 인 가격 요청 X** (= Gemini 가 2 인 가격을 1 인 필드에 입력 위험 = 사용자 SSOT 2026-05-25 = 단위 모호 결함).
- **selection_reason_ko** = 한국어 한 줄 = 인스타 성지/네이버 블로그/유튜브 vlog 사회적 검증 (→ DB summary_ko).
- **shortform_ko** = 한국어 한 줄 = 코믹/위트 후킹 = "프사각", "본전 뽑음" 한국 슬랭 (→ DB editorial_summary).
- 모두 Google Maps grounding 검증 = 환각 금지.

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
          "place_id": <입력 활동 = 입력 id / 식당 = "auto-lunch-dN" 또는 "auto-dinner-dN">,
          "name_en": "<...>", "name_ko": "<...>", "name_local": "<...>",
          "address": "<FULL = 식당 필수>",
          "lat": <number>, "lng": <number>,
          "price_per_person_eur": <식당만 = € 1인 EUR = 1 가지만 = 2 인 가격 X>,
          "distance_from_prev_km": <number>,
          "transit_mode": "${transportMode === 'private_driver_guide' ? 'private_guide' : 'walk|metro|RER|bus'}",
          "transit_min": <number>,
          "selection_reason_ko": <식당만 = 한국어 한 줄 = 사회적 검증 = → DB summary_ko>,
          "shortform_ko": <식당만 = 한국어 한 줄 = 코믹/위트 한국 슬랭 = → DB editorial_summary>
        }
      ]
    }
  ]
}

# 핵심 원칙
1. 입력 비식당 ${nonRestaurantCount} 곳 = 모두 응답 포함 (= 추가/제외 X).
2. 식당 = Google Maps grounding 발견 + 7 필드 + 예산 이내.
3. 동선 = city_center 출발/귀환 + 자연 cluster + 최적 순서.
4. 교통 = transport_mode="${transportMode}" = ${transportMode === 'private_driver_guide' ? '모든 hop 전용 차량 가이드' : '도보 + 메트로 + RER + 버스 조합'}.
5. 식당 = 마지막 종착지 (= 저녁) + 일자 중간 (= 점심).
6. 응답 = JSON 만 (= markdown X).`;

  return { prompt, inputJson };
}
