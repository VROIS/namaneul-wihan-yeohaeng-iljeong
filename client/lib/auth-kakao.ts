/**
 * 카카오 로그인
 * - 웹 = Kakao.Auth.authorize 리다이렉트 → code → 브라우저가 accessToken 교환 → 서버 /api/auth/kakao
 *        (운영 작동 중, §2 무변경)
 * - 앱(iOS·Android) = 네이티브 SDK → accessToken → 서버 /api/auth/kakao (웹과 같은 관문)
 *
 * 비밀값 위치(정확히) = **클라이언트 시크릿은 서버에만**. 아래 JS키·REST키는 웹 로그인에 필요해
 * 예전부터 웹 번들에 값으로 박히며(실측 확인), 앱 경로는 이 둘을 쓰지 않는다.
 */
import { Platform } from "react-native";
import { initializeKakaoSDK } from "@react-native-kakao/core";
import {
  issueAccessTokenWithCodeWeb,
  login as kakaoNativeLogin,
} from "@react-native-kakao/user";
import { getApiUrl } from "./query-client";
// ⚠️ 열쇠는 client/lib/app-keys.ts 한 곳에서만 읽는다(§16). 여기서 직접 process.env 를 읽지 말 것.
import { KAKAO_JS_KEY, KAKAO_REST_KEY, KAKAO_NATIVE_APP_KEY } from "./app-keys";

const KAKAO_CALLBACK_STORAGE_KEY = "@nubi_kakao_birthDate";

/** 카카오 버튼을 쓸 수 있는지 = **판정 1벌**(§0). 호출자(useLogin)가 누르기 전에 이걸로 막는다. */
export function isKakaoOAuthConfigured(): boolean {
  // 웹 = JS키(로그인 시작) + REST키(code→accessToken 교환)
  // 앱 = 네이티브 SDK 가 카카오와 직접 대화 = **네이티브 앱 키**가 있어야 함 (2026-07-27 §19)
  return Platform.OS === "web"
    ? !!(KAKAO_JS_KEY && KAKAO_REST_KEY)
    : !!KAKAO_NATIVE_APP_KEY;
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
 * ⚠️ 수정금지(승인필요) — 앱(iOS·Android) 카카오 로그인 = **네이티브 SDK** (2026-07-27 사장님 결정).
 *
 *   브라우저 창 방식 완전삭제 §19. 사유(사장님 실기기):
 *   ① 인증 후에도 웹 창이 백그라운드에 남고 자동으로 안 닫힘(안드로이드는 창을 닫는 기능 자체가 없음)
 *   ② 탭 수가 많고(3~4탭) 아이폰은 애플 확인창이 1탭 더 붙음
 *   → 네이티브면 카카오톡으로 **2탭**에 끝나고 창이 아예 안 뜬다(구글 로그인과 같은 방식).
 *
 *   ⚠️ 경로는 **1 벌만**(§0 = 폴백·이중 분기 금지). 카카오톡 경로가 실패하면 대체 경로로 몰래
 *   넘어가지 않는다. 사유(2026-07-27 실기기) = 넘어가던 갈래가 실패를 삼키고 카카오 웹 오류
 *   페이지만 띄워, 사장님도 AI 도 원인을 볼 수 없었다.
 *
 *   반환 = accessToken. 웹과 똑같이 서버 /api/auth/kakao 로 보냄. 실패는 **그대로 올려보낸다.**
 *
 *   ⚠️ 옛 "취소(Cancelled·AccessDenied)면 조용히 null" 갈래 삭제 = 2026-07-28 §19.
 *   사유(사장님 실기기): 카카오톡이 **즉시 실패**할 때도 같은 이름으로 오는데 그걸 취소로 오인해
 *   삼키는 바람에, 버튼을 눌러도 "로그인 중" 만 잠깐 뜨고 아무 말 없이 되돌아왔다 = 버튼이 죽은 것처럼 보임.
 *   실패를 삼키면 사장님도 AI 도 원인을 볼 수 없다(§11) = 삼키지 않는다.
 */
export async function loginKakaoApp(): Promise<string> {
  if (!sdkInitialized) {
    await initializeKakaoSDK(KAKAO_NATIVE_APP_KEY);
    sdkInitialized = true;
  }
  return (await kakaoNativeLogin()).accessToken;
}

/**
 * 카카오 로그인 시작 (웹: 리다이렉트)
 * rnkakao login()은 intent 스킴을 시도해 웹에서 실패함 → Kakao.Auth.authorize 직접 사용
 */
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
  // throughTalk: false → 카카오톡 앱(intent) 대신 웹 로그인 페이지로 리다이렉트
  Kakao.Auth.authorize({ redirectUri, throughTalk: false });
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
