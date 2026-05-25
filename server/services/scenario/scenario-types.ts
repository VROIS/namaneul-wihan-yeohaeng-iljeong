// ⚠️ 수정금지(승인필요) 2026-05-25 = 사용자 SSOT (= STANDARD_PROMPT_2026-05-25.md schema 1:1)
// = 헌법 §3 + §11 + §16 = 변경 시 양쪽 동기 + 사용자 명시 승인
// = 변경 시 = .claude/skills/raw-db-verify-and-complete/prompts/10-main-app-route-scenario/STANDARD_PROMPT_2026-05-25.md 함께 갱신

/**
 * Scenario 입력 양식 = `inputJson` 객체 (= 함수가 매트릭스로 채움)
 * = 표준 prompt schema 와 1 글자 일치 강제
 */
export interface ScenarioInputJson {
  city_center: { lat: number; lng: number };
  day_slots_config: Array<{
    day: number;
    slots: number;
    start_time: string;
    end_time: string;
  }>;
  protagonist: {
    group_type: string; // "Single" | "Couple" | "Family" | ...
    group_label_ko: string; // 한국어 label = "1 인" / "커플" / ...
    headcount: number; // 1 / 2 / 4 / 8 / 10
    focus: string; // "child" | "parent" | "all" | "me"
    focus_tone_ko: string; // 시나리오 톤
    camera_subject: string; // 카메라 주인공
    age_desc?: string; // "10세 딸 + 40대 아빠"
    vibes: Array<{ vibe: string; weight: number; priority: number }>;
    transport_mode: "public_transit" | "private_driver_guide";
    pace_label: string; // "90분/슬롯 × 8슬롯/일"
  };
  meal_budget_eur_per_person: {
    lunch: number;
    dinner: number;
    label: string; // "€100/일"
    lunchLabel: string; // "€40 이내"
    dinnerLabel: string; // "€60 이내"
  };
  places: Array<{
    id: string;
    name_en: string;
    name_ko: string;
    name_local: string;
    address: string;
    lat: number;
    lng: number;
    type: "activity"; // = 식당은 Gemini 자동 발견
  }>;
}

/** 응답 = 1 씬 (= 표준 prompt 출력 양식 1:1) */
export interface ScenarioScene {
  slot: number;
  time: string; // "HH:MM"
  type: "activity" | "restaurant";
  place_id: string; // 입력 활동 id / "auto-lunch-dN" / "auto-dinner-dN"
  name_en: string;
  name_ko: string;
  name_local: string;
  address: string;
  lat: number;
  lng: number;
  /** ⚠️ 식당만 = 1 인 EUR = 1 가지만 (= 2 인 가격 X = 단위 모호 결함 차단 2026-05-25) */
  price_per_person_eur?: number;
  distance_from_prev_km: number;
  transit_mode: "walk" | "metro" | "RER" | "bus" | "private_guide";
  transit_min: number;
  visual_cue_ko: string;
  narration_ko: string;
  subtitle_ko: string;
}

/** 응답 = 1 일 */
export interface ScenarioDay {
  day: number;
  theme_ko: string;
  total_distance_km: number;
  transit_summary_ko: string;
  scenes: ScenarioScene[];
}

/** 응답 = 전체 */
export interface ScenarioResponse {
  total_duration_sec: number;
  total_distance_km: number;
  protagonist_summary_ko: string;
  days: ScenarioDay[];
}

/** Gemini 호출 결과 = handler 반환 */
export interface ScenarioHandlerResult {
  ok: boolean;
  response: ScenarioResponse | null;
  raw: string;
  finishReason: string;
  elapsedMs: number;
  parseError?: string;
}

/** Backfill 결과 (= upsertPlace × N) */
export interface ScenarioBackfillResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}
