// ⚠️ 수정금지(승인필요) 2026-05-26 = 사용자 SSOT (= STANDARD_PROMPT_2026-05-26_route-only.md schema 1:1)
// = 헌법 §3 + §11 + §16 = 변경 시 양쪽 동기 + 사용자 명시 승인
// = 변경 시 = .claude/skills/raw-db-verify-and-complete/prompts/10-main-app-route/STANDARD_PROMPT_2026-05-26_route-only.md 함께 갱신
//
// 본 파일 = 동선 + 식당 자동 발견 전용 (= 시나리오 카피 6 필드 완전 제거)
//   - 제거: protagonist_summary_ko / theme_ko / transit_summary_ko / visual_cue_ko / narration_ko / subtitle_ko / focus_tone_ko / camera_subject

/**
 * Route 입력 양식 = `inputJson` 객체 (= 함수가 매트릭스로 채움)
 * = 표준 prompt schema 와 1 글자 일치 강제
 */
export interface RouteInputJson {
  city_center: { lat: number; lng: number };
  /**
   * ⚠️ 2026-05-26 = 사용자 SSOT = 사용자 동적 입력만 = 시키지 않은 조건 inject X
   * = pace = AG2 풀 수 결정 내부 코드만 = Gemini 무관 = inject 폐기
   * = Gemini = 시간 범위 + 풀 크기 + 동선 효율 = 자연 슬롯 수 자체 결정
   */
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
  /**
   * ⚠️ 2026-05-26 = 사용자 SSOT = 일한도 만 inject (= 점심:저녁 비율 강제 X)
   * = MEAL_BUDGET[travelStyle] = 함수 호출 동적
   * = Gemini = 일일 한도 내 = 동선 따른 식당 자유 선택
   */
  meal_budget_eur_per_person: {
    daily_total: number; // = MEAL_BUDGET[travelStyle].dailyTotal (= Economic 40 / Reasonable 100 / Premium 300 / Luxury 300+)
    label: string; // = MEAL_BUDGET[travelStyle].label (= "€100/일")
  };
  /**
   * ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT 3 번 명시 = 4 필수만 (= 5 키 = PLACE_INPUT_KEYS)
   * = name_en / name_ko / type / seed_category / day_zone / rank 제거 (= AI 임의 추가 폐기)
   * = PSR 3 필수 (name_local / address / lat+lng) 다 있으면 다 / 없으면 null
   * = Gemini 응답 규칙 = 빈 필드 채워서 반환 + 오류 정정 반환 = R3 백필 base
   * @see PLACE_INPUT_KEYS (= silent drift 방지)
   */
  places: {
    id: string; // = "db-${PSR.id}" = echo 매칭 키
    name_local: string | null; // = PSR.name_local (= 없으면 null)
    address: string | null; // = PSR.address (= 없으면 null)
    lat: number;
    lng: number;
  }[];
}

/**
 * ⚠️ 수정금지(승인필요) 2026-05-28 = 사용자 SSOT 3 번 명시 = inputJson.places 5 키 단일 SSOT
 * = buildRouteInputJson (= route-prompt.ts) + RouteInputJson.places 양식 + STANDARD_PROMPT.md 4 곳 = 동기 잠금
 * = 변경 시 = 4 곳 모두 동기 (= silent drift 차단)
 */
export const PLACE_INPUT_KEYS = [
  "id",
  "name_local",
  "address",
  "lat",
  "lng",
] as const;

/** 응답 = 1 씬 (= 동선 + 식당 자동 발견만 = 시나리오 카피 0) */
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
  /** ⚠️ 식당만 = 1 인 EUR = 1 가지만 (= 2 인 가격 X) */
  price_eur?: number;
  distance_from_prev_km: number;
  transit_mode: "walk" | "metro" | "RER" | "bus" | "private_guide";
  transit_min: number;
  /** ⚠️ 신규 식당 백필 = → DB summary_ko (= 09-main-app-itinerary 표준과 동일) */
  selection_reason_ko?: string;
  /** ⚠️ 신규 식당 백필 = → DB editorial_summary (= 09-main-app-itinerary 표준과 동일) */
  shortform_ko?: string;
  /** ⚠️ 2026-06-12 = 로컬 동선 빌더 전용 = PSR image_url 전달 (= 식당풀 픽은 inputPlaces 밖이라 이미지 단절 해소). Gemini 응답 스키마 아님(로컬 내부 필드). */
  image?: string;
}

/** 응답 = 1 일 */
export interface RouteDay {
  day: number;
  total_distance_km: number;
  scenes: RouteScene[];
}

/** 응답 = 전체 */
export interface RouteResponse {
  total_duration_sec: number;
  total_distance_km: number;
  days: RouteDay[];
}

/** Gemini 호출 결과 = handler 반환 */
export interface RouteHandlerResult {
  ok: boolean;
  response: RouteResponse | null;
  raw: string;
  finishReason: string;
  elapsedMs: number;
  parseError?: string;
}

/** Backfill 결과 (= upsertPlace × N = background) */
export interface RouteBackfillResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}
