// ⚠️ 수정금지(승인필요): 프롬프트 서비스 — 기존 geminiService.js의 fetchPromptFromServer 클론
// 서버에서 언어별/타입별 페르소나 프롬프트를 가져와 캐시
// 관리자 대시보드에서 설정한 14개 프롬프트 (7언어 × 2타입)가 자동 반영됨
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CONFIG } from '../config/constants';
const BASE_URL = CONFIG.API.SERVER_URL;
const CACHE_PREFIX = 'prompt_';
const SUPPORTED_LANGS = ['ko', 'en', 'zh-CN', 'ja', 'fr', 'de', 'es'];

// ⚠️ 수정금지(승인필요): 메모리 캐시 (기존 geminiService.js:76 promptCache 동일)
const memoryCache = {};

// ⚠️ 수정금지(승인필요): 서버에서 프롬프트 가져오기 + 캐시
// 기존 geminiService.js:75-100 fetchPromptFromServer 클론
export async function fetchPrompt(language, type) {
  const lang = SUPPORTED_LANGS.includes(language) ? language : 'en';
  const cacheKey = `${lang}_${type}`;

  // 1. 메모리 캐시 (앱 실행 중 즉시 반환)
  if (memoryCache[cacheKey]) {
    return memoryCache[cacheKey];
  }

  // 2. AsyncStorage 캐시 (오프라인 대비)
  try {
    const stored = await AsyncStorage.getItem(CACHE_PREFIX + cacheKey);
    if (stored) {
      memoryCache[cacheKey] = stored;
      // 백그라운드에서 서버 업데이트 (stale-while-revalidate)
      refreshFromServer(lang, type, cacheKey);
      return stored;
    }
  } catch { /* 캐시 없으면 서버에서 */ }

  // 3. 서버에서 가져오기
  return await refreshFromServer(lang, type, cacheKey);
}

// ⚠️ 수정금지(승인필요): 서버 fetch + 캐시 업데이트
async function refreshFromServer(language, type, cacheKey) {
  try {
    const response = await fetch(`${BASE_URL}/api/prompts/${language}/${type}`);
    if (!response.ok) throw new Error(`${response.status}`);
    const data = await response.json();
    const content = data.content || data.prompt?.content || '';

    if (content) {
      memoryCache[cacheKey] = content;
      await AsyncStorage.setItem(CACHE_PREFIX + cacheKey, content);
    }
    return content;
  } catch (e) {
    console.warn(`[PromptService] 서버 fetch 실패 (${language}/${type}):`, e.message);
    return memoryCache[cacheKey] || getFallbackPrompt(language, type);
  }
}

// ⚠️ 수정금지(승인필요): 앱 시작 시 현재 언어의 프롬프트 미리 로딩
// 기존 geminiService.js:225-231 preloadPrompts 클론
export async function preloadPrompts(language) {
  const lang = SUPPORTED_LANGS.includes(language) ? language : 'en';
  await Promise.all([
    fetchPrompt(lang, 'image'),
    fetchPrompt(lang, 'text'),
  ]);
  console.log(`[PromptService] ${lang} 프롬프트 프리로드 완료`);
}

// ⚠️ 수정금지(승인필요): 오프라인 폴백 프롬프트 (서버 불가 시)
function getFallbackPrompt(language, type) {
  if (type === 'image') {
    return `You are a professional travel guide. Describe what you see in the camera/image in ${language}. Include history, culture, and fun facts. Be friendly and detailed.`;
  }
  return `You are a local travel assistant. Help with translation, currency, transport, and emergencies. Respond in ${language}. Be practical and friendly.`;
}

// ⚠️ 수정금지(승인필요): TTS 언어 코드 매핑 (store.language → Speech.speak language)
export const TTS_LANGUAGE_MAP = {
  'ko': 'ko-KR',
  'en': 'en-US',
  'ja': 'ja-JP',
  'zh-CN': 'zh-CN',
  'fr': 'fr-FR',
  'de': 'de-DE',
  'es': 'es-ES',
};

export function getTTSLanguage(language) {
  return TTS_LANGUAGE_MAP[language] || 'en-US';
}
