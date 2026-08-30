// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT (= STANDARD_PROMPT_2026-05-26_route-only.md schema 1:1)
// = 헌법 §3 + §11 + §16 = 변경 시 양쪽 동기 + 사용자 명시 승인

export interface RouteInputJson {
  city_center: { lat: number; lng: number };
  trip_config: {
    day_count: number;
    start_time: string; // = formData.startTime
    end_time: string; // = formData.endTime
  };
  protagonist: {
    group_type: string; // "Single" | "Couple" | "Family" | ...
    group_label_ko: string; // 한국어 label = "1 인" / "커플" / ...
    headcount: number; // 1 / 2 / 4 / 8 / 10 = getCompanionCount()
    focus: string; // "child" | "parent" | "all" | "me" = FOCUS_KEY
    age_desc?: string; // companionAges
    vibes: { vibe: string; weight: number; priority: number }[];
    transport_mode: "public_transit" | "private_driver_guide";
  };
  meal_budget_eur_per_person: {
    daily_total: number; // = MEAL_BUDGET[travelStyle].dailyTotal (= Economic 40 / Reasonable 100 / Premium 300 / Luxury 300+)
    label: string; // = MEAL_BUDGET[travelStyle].label (= "€100/일")
  };
  /** ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT 3 번 명시 = 4 필수만 (= 5 키 = PLACE_INPUT_KEYS) */
  places: {
    id: string; // = "db-${PSR.id}" = echo 매칭 키
    name_local: string | null; // = PSR.name_local (= 없으면 null)
    address: string | null; // = PSR.address (= 없으면 null)
    lat: number;
    lng: number;
  }[];
}

/** ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT 3 번 명시 = inputJson.places 5 키 단일 SSOT */
export const PLACE_INPUT_KEYS = [
  "id",
  "name_local",
  "address",
  "lat",
  "lng",
] as const;

export interface RouteScene {
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
  price_eur?: number;
  distance_from_prev_km: number;
  transit_mode: "walk" | "metro" | "RER" | "bus" | "private_guide";
  transit_min: number;
  selection_reason_ko?: string;
  shortform_ko?: string;
  image?: string;
}

export interface RouteDay {
  day: number;
  total_distance_km: number;
  scenes: RouteScene[];
}

export interface RouteResponse {
  total_duration_sec: number;
  total_distance_km: number;
  days: RouteDay[];
}

export interface RouteHandlerResult {
  ok: boolean;
  response: RouteResponse | null;
  raw: string;
  finishReason: string;
  elapsedMs: number;
  parseError?: string;
}

export interface RouteBackfillResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}
