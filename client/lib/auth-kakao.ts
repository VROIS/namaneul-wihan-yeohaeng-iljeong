/**
 * 카카오 OAuth 로그인 (웹 플랫폼)
 * @react-native-kakao/core (SDK 초기화) + @react-native-kakao/user (login) 사용
 */
import { Platform } from "react-native";
import { initializeKakaoSDK } from "@react-native-kakao/core";
import { issueAccessTokenWithCodeWeb } from "@react-native-kakao/user";
import { getApiUrl } from "./query-client";

const KAKAO_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || "";
const KAKAO_REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || process.env.KAKAO_REST_API_KEY || "";

const KAKAO_CALLBACK_STORAGE_KEY = "@nubi_kakao_birthDate";

export function isKakaoOAuthConfigured(): boolean {
  return !!(KAKAO_JS_KEY && KAKAO_REST_KEY);
}

/** 웹 리다이렉트 URI (카카오 콘솔에 등록된 값과 동일해야 함) */
export function getKakaoRedirectUri(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return getApiUrl();
}

let sdkInitialized = false;

/** 카카오 웹 SDK 스크립트 동적 로드 (index.html에 없을 때 대비) */
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

/** 웹에서 카카오 SDK 초기화 (앱 로드 시 1회) */
export async function ensureKakaoSDKInitialized(): Promise<boolean> {
  if (!isKakaoOAuthConfigured() || Platform.OS !== "web") return false;
  if (sdkInitialized) return true;
  try {
    await loadKakaoScript();
    // core 패키지 API: (appKey, { web: { javascriptKey, restApiKey } })
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

/**
 * 카카오 로그인 시작 (웹: 리다이렉트)
 * rnkakao login()은 intent 스킴을 시도해 웹에서 실패함 → Kakao.Auth.authorize 직접 사용
 */
export async function startKakaoLoginWeb(birthDate: string, language: string): Promise<void> {
  if (Platform.OS !== "web") {
    throw new Error("카카오 웹 로그인은 웹 환경에서만 지원됩니다.");
  }
  const ok = await ensureKakaoSDKInitialized();
  if (!ok) throw new Error("카카오 SDK 초기화 실패");

  const redirectUri = getKakaoRedirectUri();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(KAKAO_CALLBACK_STORAGE_KEY, JSON.stringify({ birthDate, language }));
  }

  const Kakao = (window as unknown as { Kakao?: { Auth?: { authorize: (opts: { redirectUri: string }) => void } } }).Kakao;
  if (!Kakao?.Auth?.authorize) throw new Error("카카오 웹 SDK를 불러올 수 없습니다.");
  Kakao.Auth.authorize({ redirectUri });
}

/**
 * URL에서 code 추출 후 accessToken 발급
 * 리다이렉트 복귀 시 호출
 */
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

/** 리다이렉트 복귀 시 저장해 둔 birthDate/language 조회 */
export function getKakaoCallbackData(): { birthDate: string; language: string } | null {
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
