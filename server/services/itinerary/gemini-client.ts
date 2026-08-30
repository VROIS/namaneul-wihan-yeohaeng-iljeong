import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

export function getGeminiApiKey(): string {
  return (
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  );
}

export function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.error("[Itinerary] ❌ Gemini API 키가 설정되지 않았습니다!");
      throw new Error(
        "Gemini API 키가 없습니다. 관리자 대시보드에서 API 키를 설정해주세요.",
      );
    }
    ai = new GoogleGenAI({ apiKey });
    console.log(
      `[Itinerary] ✅ Gemini AI 초기화 완료 (키 길이: ${apiKey.length}자)`,
    );
  }
  return ai;
}
