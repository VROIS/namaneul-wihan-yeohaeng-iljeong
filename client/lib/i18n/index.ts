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

export async function initI18nLanguage(): Promise<void> {
  const stored = await getStoredLanguage();
  if (stored && validCodes.includes(stored)) {
    await i18n.changeLanguage(stored);
    return;
  }
  // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = 기기 로캘 감지 실패(device=null) 시에도
  const device = Localization.getLocales()[0]?.languageCode;
  const normalized = normalizeLang(device || "en");
  if (validCodes.includes(normalized)) {
    await i18n.changeLanguage(normalized);
    await setStoredLanguage(normalized);
  }
}

export async function changeLanguageAndPersist(code: string): Promise<void> {
  const lang = validCodes.includes(code) ? code : "ko";
  await i18n.changeLanguage(lang);
  await setStoredLanguage(lang);
}

export default i18n;
