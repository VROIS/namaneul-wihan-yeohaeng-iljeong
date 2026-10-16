import { GoogleGenAI } from "@google/genai";
import type { TravelStyle } from "./types";

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 가격은 500 이상도 허용 = 무조건 실제 값 (정본 §)
export function sanitizePriceEur(raw: any): number {
  if (raw == null) return 0;
  const n =
    typeof raw === "string" ? parseFloat(raw.replace(/,/g, ".")) : Number(raw);
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = price_eur = 창고 검증값(페이지·TS·2차 제미니가 확정한 값, 0 = 확인된 무료) > 여정 제미니 추정(0 보다 클 때만) > 모름(null) (정본 §) */
export function resolvePrice(
  geminiPrice: number,
  seedPriceEur: number | null = null,
): number | null {
  if (seedPriceEur != null) return seedPriceEur;
  return geminiPrice > 0 ? geminiPrice : null;
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
  // ⚠️ 수정금지(승인필요) 2026-10-14 사장님 결정 = 분류 이름을 포토스팟으로 바꿈 (정본 §2026-10-14)
  seed_category?: string; // heritage/healing/photospot/adventure/shopping/attraction/restaurant
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
