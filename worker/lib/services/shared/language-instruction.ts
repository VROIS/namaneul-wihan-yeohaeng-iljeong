// ⚠️ 수정금지(승인필요) 2026-08-12 = 외부호출(Gemini) 프롬프트에 얹는 "이 언어로 답하라" 지시문 단일 진입점(§16).

// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 7개 언어 목록·순서 = 앱 전체 1벌(§16). 순서 자체가 뜻을 가진다 =
export const LANGS = ["ko", "en", "ja", "fr", "zh", "es", "de"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_INSTRUCTION: Record<Lang, string> = {
  ko: "반드시 한국어로만 답하세요.",
  en: "Answer entirely in English.",
  ja: "必ず日本語で答えてください。",
  fr: "Répondez entièrement en français.",
  zh: "请完全用中文回答。",
  es: "Responda completamente en español.",
  de: "Antworten Sie vollständig auf Deutsch.",
};

export function getLanguageInstruction(language?: string): string {
  return LANG_INSTRUCTION[(language || "ko") as Lang] || LANG_INSTRUCTION.ko;
}
