// ⚠️ 수정금지(승인필요) 2026-08-12 = 외부호출(Gemini) 프롬프트에 얹는 "이 언어로 답하라" 지시문 단일 진입점(§16).
// = 프롬프트 본문은 그대로 두고 이 한 줄만 얹는 방식(AI 의견에서 검증된 패턴, server/services/verify/ai-opinion-prompt.ts 원본).
//   옛 pipeline-v3.ts langMap(프롬프트 미삽입 죽은코드, §19 폐기)과는 다름 = 이건 실제로 프롬프트에 삽입돼 동작 확인됨.
// = 7개 언어 = i18n SUPPORTED_LANGS와 동일 세트. 언어코드 컨벤션 = 'zh'(zh-CN 아님, ai-opinion-prompt.ts 원본 컨벤션 유지).

// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 7개 언어 목록·순서 = 앱 전체 1벌(§16). 순서 자체가 뜻을 가진다 =
//   best_rank 언어코드(best-rank.ts)의 자릿수 번호(1=ko 2=en 3=ja 4=fr 5=zh 6=es 7=de) = 이 배열 index+1. 순서 변경 금지.
//   쓰는 곳 = itinerary-routes(언어설정 검증)·discovery-merge-diff/verify-and-insert(B1·B2)·best-rank·place-translation.
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

/** 언어 코드 → 지시문 1줄. 미지정·미지원 언어 = 한국어로 폴백. */
export function getLanguageInstruction(language?: string): string {
  return LANG_INSTRUCTION[(language || "ko") as Lang] || LANG_INSTRUCTION.ko;
}
