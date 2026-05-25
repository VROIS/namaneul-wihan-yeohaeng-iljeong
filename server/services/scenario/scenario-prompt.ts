// ⚠️ 수정금지(승인필요) 2026-05-25 = 사용자 SSOT = 메인앱 동선 + 숏폼 시나리오 통합 표준 prompt
// = 헌법 §3 + §11 + §16 = 변경 시 양쪽 동기 + 사용자 명시 승인
// = SSOT 원본: .claude/skills/raw-db-verify-and-complete/prompts/10-main-app-route-scenario/STANDARD_PROMPT_2026-05-25.md
// = 1 글자라도 달라지면 안 됨 (= 양쪽 1:1 비교 검증)
//
// 자동화 = 2 종 분리:
//   A. 결정적 매트릭스 = 본 파일 (= 함수 호출 = 하드코드 0)
//   B. 자연어 카피라이팅 = Gemini (= 양식 + 힌트만 제공)

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
import type { ScenarioInputJson } from "./scenario-types";

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
 * PROTAGONIST_FOCUS = curationFocus → 시나리오 톤/카메라/내레이션 샘플 1:1
 * = 표준 prompt 의 protagonist.focus_tone_ko + camera_subject + sample_narration 자동 채움
 * = CurationFocus ("Kids" | "Parents" | "Everyone" | "Self") → focus key ("child" | "parent" | "all" | "me") 매핑
 */
const PROTAGONIST_FOCUS: Record<
  CurationFocus,
  {
    focus_key: "child" | "parent" | "all" | "me";
    tone_ko: string;
    camera_subject: string;
    sample_narration: string;
  }
> = {
  Kids: {
    focus_key: "child",
    tone_ko: "아이 시선 + 부모 가이드 톤",
    camera_subject: "아이 표정 + 아이 손에 잡힌 디테일",
    sample_narration: "여기 봐, 진짜 신기하지? 아빠도 처음 보는 거야!",
  },
  Parents: {
    focus_key: "parent",
    tone_ko: "효도 여행 + 정중한 안내 톤",
    camera_subject: "부모님 미소 + 풍경 + 함께하는 손",
    sample_narration: "엄마 아빠, 여기 인생샷 명소래요. 잠깐 앉아서 쉬셔요.",
  },
  Everyone: {
    focus_key: "all",
    tone_ko: "함께 즐기는 + 친근한 톤",
    camera_subject: "일행 표정 + 풍경 + 분위기",
    sample_narration: "우리 다 같이 여기 와봤어! 진짜 분위기 미쳤다",
  },
  Self: {
    focus_key: "me",
    tone_ko: "혼행러 갓생 + 자기 만족 톤",
    camera_subject: "셀카 + POV + 발끝 + 손에 든 컵",
    sample_narration: "혼자라서 더 자유로워. 갓생 사는 기분",
  },
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
 * AG1Output + places + cityCoords → ScenarioInputJson (= 결정적 매트릭스 변환)
 * = 표준 prompt 의 inputJson 자동 채움 = 하드코드 0
 */
export function buildScenarioInputJson(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: { lat: number; lng: number } | undefined,
): ScenarioInputJson {
  const { formData, vibeWeights, paceConfig, daySlotsConfig } = skeleton;

  const companionType = formData.companionType || "Solo";
  const groupLabelKo = COMPANION_LABEL_KO[companionType] || "1 인 (= 솔로)";
  const headcount = getCompanionCount(companionType);
  const focus = PROTAGONIST_FOCUS[formData.curationFocus || "Everyone"];
  const transport_mode = resolveTransportMode(
    formData.mobilityStyle,
    formData.travelStyle,
  );
  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];
  const slotsPerDay = daySlotsConfig[0]?.slots || paceConfig.maxSlotsPerDay;

  return {
    city_center: resolveCityCenter(formData, cityCoords, places),
    day_slots_config: daySlotsConfig.map((d) => ({
      day: d.day,
      slots: d.slots,
      start_time: d.startTime,
      end_time: d.endTime,
    })),
    protagonist: {
      group_type: companionType,
      group_label_ko: groupLabelKo,
      headcount,
      focus: focus.focus_key,
      focus_tone_ko: focus.tone_ko,
      camera_subject: focus.camera_subject,
      age_desc: formData.companionAges || undefined,
      vibes: vibeWeights.map((v, i) => ({
        vibe: String(v.vibe),
        weight: v.weight,
        priority: i + 1,
      })),
      transport_mode,
      pace_label: `${paceConfig.slotDurationMinutes}분/슬롯 × ${slotsPerDay}슬롯/일`,
    },
    meal_budget_eur_per_person: {
      lunch: mealBudget.lunch,
      dinner: mealBudget.dinner,
      label: mealBudget.label,
      lunchLabel: mealBudget.lunchLabel,
      dinnerLabel: mealBudget.dinnerLabel,
    },
    places: places
      .filter((p) => p.lat && p.lng)
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
 * 표준 prompt 문자열 생성 (= STANDARD_PROMPT_2026-05-25.md 와 1 글자 일치 강제)
 */
export function generateScenarioPrompt(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: { lat: number; lng: number } | undefined,
): { prompt: string; inputJson: ScenarioInputJson } {
  const inputJson = buildScenarioInputJson(skeleton, places, cityCoords);
  const { formData, paceConfig, daySlotsConfig } = skeleton;
  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];
  const groupLabelKo = inputJson.protagonist.group_label_ko;
  const focus = PROTAGONIST_FOCUS[formData.curationFocus || "Everyone"];
  const transportMode = inputJson.protagonist.transport_mode;
  const slotsPerDay = daySlotsConfig[0]?.slots || paceConfig.maxSlotsPerDay;

  // ⚠️ 본 텍스트 = STANDARD_PROMPT_2026-05-25.md "표준 prompt 원본" 섹션과 1 글자 일치 강제
  const prompt = `# 역할
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

# Tone Sample (= forWhom="${focus.focus_key}" = ${focus.tone_ko})
${focus.sample_narration}
카메라 = ${focus.camera_subject}

# 출력 양식 (= JSON 만, no markdown wrappers)
{
  "total_duration_sec": <number>,
  "total_distance_km": <number>,
  "protagonist_summary_ko": "<주인공 한 줄 = ${groupLabelKo} ${formData.companionAges || ""} 반영>",
  "days": [
    {
      "day": <number>, "theme_ko": "<10-15자>", "total_distance_km": <number>,
      "transit_summary_ko": "<${transportMode === "private_driver_guide" ? "'전용 차량 가이드 N hop = N분'" : "'도보 N hop + 메트로/RER N분'"}>",
      "scenes": [
        {
          "slot": <number>, "time": "HH:MM", "type": "activity|restaurant",
          "place_id": <입력 활동 = 입력 id / 식당 = "auto-lunch-dN" 또는 "auto-dinner-dN">,
          "name_en": "<...>", "name_ko": "<...>", "name_local": "<...>",
          "address": "<FULL = 식당 필수>",
          "lat": <number>, "lng": <number>,
          "price_per_person_eur": <식당만 = € 1인 EUR = 1 가지만 = 2 인 가격 X>,
          "distance_from_prev_km": <number>,
          "transit_mode": "${transportMode === "private_driver_guide" ? "private_guide" : "walk|metro|RER|bus"}",
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
4. 교통 = transport_mode="${transportMode}" = ${transportMode === "private_driver_guide" ? "모든 hop 전용 차량 가이드" : "도보 + 메트로 + RER + 버스 조합"}.
5. 페이스 = ${paceConfig.slotDurationMinutes}분/슬롯 × ${slotsPerDay}슬롯/일 = ${formData.travelPace}.
6. 시나리오 톤 = ${focus.tone_ko} + age "${formData.companionAges || ""}" + 슬랭 OK.
7. 응답 = JSON 만 (= markdown X).`;

  return { prompt, inputJson };
}
