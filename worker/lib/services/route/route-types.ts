export interface RouteScene {
  slot: number;
  time: string; // "HH:MM"
  type: "activity" | "restaurant";
  meal_type?: "lunch" | "dinner"; // 식당 장면의 점심·저녁 이름표 = 만든 쪽(route-local)이 정한다
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
  slot_min: number;
  selection_reason_ko?: string;
  shortform_ko?: string;
  image?: string;
}

interface RouteDay {
  day: number;
  total_distance_km: number;
  scenes: RouteScene[];
  final_move_min?: number; // 마지막 슬롯에서 마지막 고정 슬롯(BTS 공연장)까지 이동 분 = 시각표 계산이 낸 값
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
