/**
 * i18n (다국어) 설정
 * - i18next + react-i18next + expo-localization
 * - AsyncStorage로 선택 언어 유지
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@nubi_language";

export const SUPPORTED_LANGS = [
  { code: "ko", flag: "🇰🇷", name: "Korean", nativeName: "한국어" },
  { code: "en", flag: "🇺🇸", name: "English", nativeName: "English" },
  { code: "ja", flag: "🇯🇵", name: "Japanese", nativeName: "日本語" },
  { code: "fr", flag: "🇫🇷", name: "French", nativeName: "Français" },
  { code: "zh", flag: "🇨🇳", name: "Chinese", nativeName: "中文" },
  { code: "es", flag: "🇪🇸", name: "Spanish", nativeName: "Español" },
  { code: "de", flag: "🇩🇪", name: "German", nativeName: "Deutsch" },
] as const;

export type SupportedLangCode = (typeof SUPPORTED_LANGS)[number]["code"];

async function getStoredLanguage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredLanguage(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch (e) {
    console.warn("[i18n] Failed to save language:", e);
  }
}

const resources = {
  ko: { translation: require("./locales/ko.json") },
  en: { translation: require("./locales/en.json") },
  ja: { translation: require("./locales/ja.json") },
  fr: { translation: require("./locales/fr.json") },
  zh: { translation: require("./locales/zh.json") },
  es: { translation: require("./locales/es.json") },
  de: { translation: require("./locales/de.json") },
};

const validCodes = Object.keys(resources);

// ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = 기본 빌드 로캘 = 영어(전세계 공식출시 대비).
//   기기 언어가 지원 7개국어 중 하나면 아래 initI18nLanguage()가 그 언어로 즉시 바꿔치기하므로
//   (한국 사용자는 그대로 한국어로 보임) 실사용 영향은 "지원 밖 언어 기기"·"초기 렌더 찰나"뿐.
function normalizeLang(code: string): string {
  const lower = code.toLowerCase().slice(0, 2);
  if (lower === "zh") return "zh";
  return validCodes.includes(lower) ? lower : "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  supportedLngs: validCodes,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/** 앱 시작 시 저장된 언어 또는 기기 언어로 초기화 (App.tsx useEffect에서 호출) */
export async function initI18nLanguage(): Promise<void> {
  const stored = await getStoredLanguage();
  if (stored && validCodes.includes(stored)) {
    await i18n.changeLanguage(stored);
    return;
  }
  // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = 기기 로캘 감지 실패(device=null) 시에도
  //   ko가 아닌 en으로 떨어져야 "기본 빌드 로캘=영어" 정책과 일치(판단3종 review가 지적한
  //   ko 우회경로 수정 = device||"ko"였으면 normalizeLang의 en 기본값이 무의미해짐).
  const device = Localization.getLocales()[0]?.languageCode;
  const normalized = normalizeLang(device || "en");
  if (validCodes.includes(normalized)) {
    await i18n.changeLanguage(normalized);
    await setStoredLanguage(normalized);
  }
}

/** 언어 변경 + 저장 + DB 동기화용 */
export async function changeLanguageAndPersist(code: string): Promise<void> {
  const lang = validCodes.includes(code) ? code : "ko";
  await i18n.changeLanguage(lang);
  await setStoredLanguage(lang);
}

export default i18n;
