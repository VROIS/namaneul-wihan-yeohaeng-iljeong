// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT = 메인앱 동선 최적화 전용 표준 prompt
// = 헌법 §3 + §11 + §16 = 변경 시 양쪽 동기 + 사용자 명시 승인

import type {
  AG1Output,
  TripFormData,
  CurationFocus,
  MobilityStyle,
  TravelStyle,
  PlaceResult,
} from "../agents/types";
import { MEAL_BUDGET, getCompanionCount } from "../agents/types";
import { normalizeTravelStyle } from "../agents/pipeline-v3-types";
// ⚠️ 수정금지(승인필요) 2026-05-25 = 헌법 §16 = shouldApplyGuidePrice 단일 SSOT (= transport-pricing-service)
import { shouldApplyGuidePrice } from "../transport-pricing-service";
import type { RouteInputJson } from "./route-types";

const COMPANION_LABEL_KO: Record<string, string> = {
  Single: "1 인 (= 솔로)",
  Solo: "1 인 (= 솔로)",
  Couple: "커플 2 인",
  Family: "가족 4 인 (= 부모 + 자녀)",
  ExtendedFamily: "대가족 8 인",
  Group: "친구 10 인 그룹",
};

const FOCUS_KEY: Record<CurationFocus, "child" | "parent" | "all" | "me"> = {
  Kids: "child",
  Parents: "parent",
  Everyone: "all",
  Self: "me",
};

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
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];

  return {
    city_center: resolveCityCenter(formData, cityCoords, places),
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
    meal_budget_eur_per_person: {
      daily_total: mealBudget.dailyTotal, // = 동적 = MEAL_BUDGET[travelStyle].dailyTotal
      label: mealBudget.label,
    },
    // ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT 3 번 명시 = 4 필수만 (= PLACE_INPUT_KEYS)
    places: places
      .filter((p) => p.seedCategory !== "restaurant")
      .map((p) => ({
        id: p.id, // = "db-${PSR.id}" = echo 매칭 키
        name_local: p.nameLocal || null, // = PSR.name_local (= 없으면 null = Gemini 채워줌)
        address: p.address || null, // = PSR.address (= 없으면 null = Gemini 채워줌)
        lat: p.lat,
        lng: p.lng,
      })),
  };
}

export function generateRoutePrompt(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: { lat: number; lng: number } | undefined,
): { prompt: string; inputJson: RouteInputJson } {
  const inputJson = buildRouteInputJson(skeleton, places, cityCoords);
  const { formData, paceConfig } = skeleton;
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];
  const transportMode = inputJson.protagonist.transport_mode;
  const nonRestaurantCount = inputJson.places.length;
  const tc = inputJson.trip_config;

  // prettier-ignore
  const prompt = `# 역할
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
- ⚠️ Gemini 발견 식당 = 7 필드 반드시 (= name_local / address / lat / lng / **price_eur = 1 인 EUR 1 가지만** / **selection_reason_ko** / **shortform_ko**).
- ⚠️ **price_for_2_eur 같은 2 인 가격 요청 X** (= Gemini 가 2 인 가격을 1 인 필드에 입력 위험 = 사용자 SSOT 2026-05-25 = 단위 모호 결함).
- **selection_reason_ko** = 한국어 한 줄 = 인스타 성지/네이버 블로그/유튜브 vlog 사회적 검증 (→ DB summary_ko).
- **shortform_ko** = 한국어 한 줄 = 코믹/위트 후킹 = "프사각", "본전 뽑음" 한국 슬랭 (→ DB editorial_summary).
- 모두 Google Search grounding 검증 = 환각 금지.

# 활동 응답 양식 (= 2026-05-28 사용자 SSOT 신규)
- 활동 = address + name_local + price_eur 응답 (= 입장료/체험비 1 인 EUR = PSR 오류 정정 base = R3 백필).
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
          "place_id": <입력 활동 = 입력 id "db-\${PSR.id}" / 식당 = "auto-lunch-dN" 또는 "auto-dinner-dN">,
          "name_local": <활동 = 입력 echo 또는 보강 / 식당 = Gemini 생성>,
          "address": "<FULL = 활동 + 식당 모두 필수>",
          "lat": <number>, "lng": <number>,
          "price_eur": <활동 + 식당 모두 = € 1인 EUR = 1 가지만 = 2 인 가격 X = 활동 = 입장료/체험비 / 식당 = 식사비 / 무료 = 0>,
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
7. ⚠️ **총 슬롯 = ${nonRestaurantCount + 2 * tc.day_count} 강제 + 슬롯 간 시각 연속 (= 갭 X)**.`;

  return { prompt, inputJson };
}
