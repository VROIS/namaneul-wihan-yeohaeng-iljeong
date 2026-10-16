import { GoogleGenAI } from "@google/genai";
import type { TravelStyle } from "./types";
import { MEAL_BUDGET } from "./types";

export function sanitizePriceEur(raw: any): number {
  if (raw == null) return 0;
  const n =
    typeof raw === "string" ? parseFloat(raw.replace(/,/g, ".")) : Number(raw);
  if (isNaN(n) || n < 0) return 0;
  if (n > 500) return 0; // 명백한 오류 (팡테옹 19500 등)
  return Math.round(n * 100) / 100;
}

/** ⚠️ 수정금지(승인필요) = price_eur 단일 SSOT = 최신최우선(Gemini > seed_raw > 매트릭스폴백) §14 */
export function resolvePrice(
  geminiPrice: number,
  isMeal: boolean = false,
  seedPriceEur: number = 0,
  mealType?: "lunch" | "dinner",
  travelStyle: TravelStyle = "Reasonable",
): number {
  const resolved = geminiPrice > 0 ? geminiPrice : seedPriceEur;
  if (resolved > 0) return resolved;
  if (isMeal && mealType) {
    return MEAL_BUDGET[travelStyle]?.[mealType] ?? 0;
  }
  return 0;
}

export function normalizeTravelStyle(style?: string): TravelStyle {
  if (!style) return "Reasonable";
  const map: Record<string, TravelStyle> = {
    luxury: "Luxury",
    premium: "Premium",
    reasonable: "Reasonable",
    economic: "Economic",
    Luxury: "Luxury",
    Premium: "Premium",
    Reasonable: "Reasonable",
    Economic: "Economic",
  };
  return map[style] || "Reasonable";
}

let ai: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey =
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      "";
    if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export interface GeminiPlace {
  name: string; // Google Maps 영어 공식명
  nameKo: string; // 사용자 선택 언어명
  nameLocal?: string; // 현지 원어명 (예: "Tour Eiffel", "Colosseo")
  address?: string; // ⚠️ 2026-05-14 v3 = AG3 통합 매칭 1 순위 (= 행정주소)
  type: "activity" | "lunch" | "dinner" | "cafe";
  // 🧠 2026-07-05 사장님 SSOT = Gemini 응답 전체 새덮어쓰기(§20 셀렉금지). 프롬프트가 이미 요구하는 값을 버리지 말고 살림(실호출 4/4 확인).
  seed_category?: string; // heritage/healing/hotspot/adventure/shopping/attraction/restaurant
  latitude?: number;
  longitude?: number;
  distance_km_from_center?: number;
  startTime: string;
  endTime: string;
  stayMin?: number;
  selection_reason_ko?: string; // ⚠️ 2026-05-14 v3 신규 = 인스타/FOMO = → summary_ko
  shortform_ko?: string; // ⚠️ 2026-05-14 v3 신규 = 코믹/위트 = → editorial_summary
  transitNote?: string; // 이전 장소에서 이 장소까지 이동 방법 (Gemini 생성)
  price_eur: number;
}

export interface GeminiDay {
  day: number;
  theme: string;
  places: GeminiPlace[];
}
