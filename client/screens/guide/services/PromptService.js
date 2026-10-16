// ⚠️ 수정금지(승인필요): 프롬프트 서비스 — 기존 geminiService.js의 fetchPromptFromServer 클론
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CONFIG } from "../config/constants";
// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 dev 실증 = 앱 공용 i18n 'zh' vs 이 파일 원래 'zh-CN' 키 불일치가
import { normalizeLang } from "../i18n/translations";
const BASE_URL = CONFIG.API.SERVER_URL;
const CACHE_PREFIX = "prompt_";
const SUPPORTED_LANGS = ["ko", "en", "zh-CN", "ja", "fr", "de", "es"];

// ⚠️ 수정금지(승인필요): 메모리 캐시 (기존 geminiService.js:76 promptCache 동일)
const memoryCache = {};

// ⚠️ 수정금지(승인필요): 서버에서 프롬프트 가져오기 + 캐시
export async function fetchPrompt(language, type) {
  const normalized = normalizeLang(language);
  const lang = SUPPORTED_LANGS.includes(normalized) ? normalized : "en";
  const cacheKey = `${lang}_${type}`;

  if (memoryCache[cacheKey]) {
    return memoryCache[cacheKey];
  }

  try {
    const stored = await AsyncStorage.getItem(CACHE_PREFIX + cacheKey);
    if (stored) {
      memoryCache[cacheKey] = stored;
      refreshFromServer(lang, type, cacheKey);
      return stored;
    }
  } catch {
  }

  return await refreshFromServer(lang, type, cacheKey);
}

// ⚠️ 수정금지(승인필요): 서버 fetch + 캐시 업데이트
async function refreshFromServer(language, type, cacheKey) {
  try {
    const response = await fetch(`${BASE_URL}/api/prompts/${language}/${type}`);
    if (!response.ok) throw new Error(`${response.status}`);
    const data = await response.json();
    const content = data.content || data.prompt?.content || "";

    if (content) {
      memoryCache[cacheKey] = content;
      await AsyncStorage.setItem(CACHE_PREFIX + cacheKey, content);
    }
    return content;
  } catch (e) {
    console.warn(
      `[PromptService] 서버 fetch 실패 (${language}/${type}):`,
      e.message,
    );
    return memoryCache[cacheKey] || getFallbackPrompt(language, type);
  }
}

// ⚠️ 수정금지(승인필요): 오프라인 폴백 프롬프트 (서버 불가 시)
function getFallbackPrompt(language, type) {
  if (type === "image") {
    return `You are a professional travel guide. Describe what you see in the camera/image in ${language}. Include history, culture, and fun facts. Be friendly and detailed.`;
  }
  return `You are a local travel assistant. Help with translation, currency, transport, and emergencies. Respond in ${language}. Be practical and friendly.`;
}

const TTS_LANGUAGE_MAP = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  "zh-CN": "zh-CN",
  fr: "fr-FR",
  de: "de-DE",
  es: "es-ES",
};

export function getTTSLanguage(language) {
  return TTS_LANGUAGE_MAP[normalizeLang(language)] || "en-US";
}

