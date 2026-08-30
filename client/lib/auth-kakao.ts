import { Platform } from "react-native";
import { initializeKakaoSDK } from "@react-native-kakao/core";
import {
  issueAccessTokenWithCodeWeb,
  login as kakaoNativeLogin,
  isKakaoTalkLoginAvailable,
} from "@react-native-kakao/user";
import { getApiUrl } from "./query-client";
import { KAKAO_JS_KEY, KAKAO_REST_KEY, KAKAO_NATIVE_APP_KEY } from "./app-keys";

const KAKAO_CALLBACK_STORAGE_KEY = "@nubi_kakao_birthDate";

export function isKakaoOAuthConfigured(): boolean {
  return Platform.OS === "web"
    ? !!(KAKAO_JS_KEY && KAKAO_REST_KEY)
    : !!KAKAO_NATIVE_APP_KEY;
}

export function getKakaoRedirectUri(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return getApiUrl();
}

let sdkInitialized = false;

function loadKakaoScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { Kakao?: unknown };
  if (w.Kakao) return Promise.resolve();
  const existing = document.querySelector('script[src*="kakao_js_sdk"]');
  if (existing) {
    return new Promise<void>((resolve) => {
      const check = () => (w.Kakao ? resolve() : setTimeout(check, 50));
      check();
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.9/kakao.min.js";
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Kakao script load failed"));
    document.head.appendChild(s);
  });
}

export async function ensureKakaoSDKInitialized(): Promise<boolean> {
  if (!isKakaoOAuthConfigured() || Platform.OS !== "web") return false;
  if (sdkInitialized) return true;
  try {
    await loadKakaoScript();
    await initializeKakaoSDK(KAKAO_JS_KEY, {
      web: {
        javascriptKey: KAKAO_JS_KEY,
        restApiKey: KAKAO_REST_KEY,
      },
    });
    sdkInitialized = true;
    return true;
  } catch (e) {
    console.warn("[Kakao] SDK init failed:", e);
    return false;
  }
}

// ⚠️ 수정금지(승인필요) 2026-07-28 사장님 결정 = 네이티브 SDK 고정 + 카카오톡 실패 시 카카오계정으로 이어감(공식 흐름, 폴백 아님) — 상세 경위는 정본문서
export async function loginKakaoApp(): Promise<string> {
  if (!sdkInitialized) {
    await initializeKakaoSDK(KAKAO_NATIVE_APP_KEY);
    sdkInitialized = true;
  }
  try {
    return (await kakaoNativeLogin()).accessToken;
  } catch (talkErr) {
    const viaKakaoTalk = await isKakaoTalkLoginAvailable().catch(() => false);
    if (!viaKakaoTalk) throw talkErr;
    console.warn(
      "[Kakao] 카카오톡 경로 실패 → 카카오계정 화면으로 이어감:",
      talkErr,
    );
    return (await kakaoNativeLogin({ useKakaoAccountLogin: true })).accessToken;
  }
}

export async function startKakaoLoginWeb(
  birthDate: string,
  language: string,
): Promise<void> {
  if (Platform.OS !== "web") {
    throw new Error("카카오 웹 로그인은 웹 환경에서만 지원됩니다.");
  }
  const ok = await ensureKakaoSDKInitialized();
  if (!ok) throw new Error("카카오 SDK 초기화 실패");

  const redirectUri = getKakaoRedirectUri();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(
      KAKAO_CALLBACK_STORAGE_KEY,
      JSON.stringify({ birthDate, language }),
    );
  }

  const Kakao = (
    window as unknown as {
      Kakao?: {
        Auth?: {
          authorize: (opts: {
            redirectUri: string;
            throughTalk?: boolean;
          }) => void;
        };
      };
    }
  ).Kakao;
  if (!Kakao?.Auth?.authorize)
    throw new Error("카카오 웹 SDK를 불러올 수 없습니다.");
  Kakao.Auth.authorize({ redirectUri, throughTalk: false });
}

export async function exchangeKakaoCodeForToken(code: string): Promise<string> {
  const ok = await ensureKakaoSDKInitialized();
  if (!ok) throw new Error("카카오 SDK 초기화 실패");

  const redirectUri = getKakaoRedirectUri();
  const result = await issueAccessTokenWithCodeWeb({
    code,
    redirectUri,
  });
  return result.accessToken;
}

export function getKakaoCallbackData(): {
  birthDate: string;
  language: string;
} | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KAKAO_CALLBACK_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { birthDate: string; language: string };
    sessionStorage.removeItem(KAKAO_CALLBACK_STORAGE_KEY);
    return data;
  } catch {
    return null;
  }
}
