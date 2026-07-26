/**
 * 카카오 OAuth 로그인
 * - 웹 = Kakao.Auth.authorize 리다이렉트 → code → accessToken (운영 작동 중, §2 무변경)
 * - 앱(iOS·Android) = @react-native-kakao/user login() → accessToken (2026-07-26 신설)
 * 둘 다 최종 산출물이 accessToken 이라 서버(/api/auth/kakao)는 무변경.
 */
import { Platform } from "react-native";
import { initializeKakaoSDK } from "@react-native-kakao/core";
import {
  issueAccessTokenWithCodeWeb,
  login as kakaoNativeLogin,
  isKakaoTalkLoginAvailable,
} from "@react-native-kakao/user";
import { getApiUrl } from "./query-client";

const KAKAO_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || "";
const KAKAO_REST_KEY =
  process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY ||
  process.env.KAKAO_REST_API_KEY ||
  "";
// ⚠️ 앱 전용 = 카카오 콘솔 "네이티브 앱 키". plugins/withKakaoNative.js(빌드설정)와 같은 환경변수를 읽음 = 값 1벌(§0).
const KAKAO_NATIVE_APP_KEY = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY || "";

const KAKAO_CALLBACK_STORAGE_KEY = "@nubi_kakao_birthDate";

export function isKakaoOAuthConfigured(): boolean {
  // 웹 = JS키(로그인 시작) + REST키(code→accessToken 교환) / 앱 = 네이티브 앱 키 1개
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
 * ⚠️ 수정금지(승인필요) — 사용자가 카카오 로그인 창을 직접 닫았는지 판별 (2026-07-26).
 *   rnkakao 안드로이드는 reject(e.reason.name, ...) 로 넘김 = code 가 카카오 SDK 의 사유 이름.
 *   취소 = ClientErrorCause.Cancelled → code "Cancelled" **정확 비교**(사유 이름 전체 일치).
 *   글자 포함 검사(정규식) 방식 폐기 = 2026-07-26 §19 — 실패 사유에 그 글자가 있으면
 *   진짜 실패까지 조용히 삼켜 원인을 볼 수 없게 만들었음(사장님 앱 테스트에서 실증).
 *   대소문자만 무시 = iOS 카카오 SDK enum 표기를 이 PC 에서 확인할 수 없어(Pods 없음) 양쪽 다 커버.
 */
export function isKakaoUserCancelled(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === "string" && code.toLowerCase() === "cancelled";
}

/**
 * 앱(iOS·Android) 카카오 로그인 → accessToken 반환.
 * 반환한 accessToken 은 웹과 똑같이 서버 /api/auth/kakao 로 보냄 = 서버 무변경.
 *
 * ⚠️ 카카오는 로그인 경로가 2개(카카오톡 앱 / 카카오계정 화면)이고 **둘 다 정상 경로**다.
 *   rnkakao 의 login() 은 카카오톡이 깔려 있으면 카카오톡만 시도하고, 거부당해도 계정 화면으로
 *   넘어가지 않고 그대로 끝낸다(RNCKakaoUserModule.kt 직접 확인). 카카오 공식은 이때 계정 화면으로
 *   이어가라고 안내한다 → 그 이어가기를 여기서 한다.
 *   이어가는 조건 = **1차가 카카오톡 경로였을 때만**(SDK 에 직접 물어봄). 카카오톡이 없으면 1차가
 *   이미 계정 화면이라 이어갈 곳이 없다(그대로 두면 같은 화면이 두 번 뜸).
 *   ⚠️ 취소(code "Cancelled")로 와도 이어간다 — 카카오톡 인증 화면이 결과 없이 닫힐 때도 SDK 가
 *   Cancelled 로 보고하는 경우가 있어(사장님 삼성 실기기 = 상태바만 깜박 후 무반응) 여기서 끊으면
 *   안내도 없고 로그인도 못 하는 상태가 된다. 계정 화면에서 사용자가 닫으면 그 취소는 위(useLogin)에서
 *   조용히 종료된다 = 진짜 취소도 정상 처리.
 */
export async function loginKakaoNative(): Promise<string> {
  if (!KAKAO_NATIVE_APP_KEY) {
    throw new Error("카카오 네이티브 앱 키가 설정되지 않았습니다.");
  }
  if (!sdkInitialized) {
    await initializeKakaoSDK(KAKAO_NATIVE_APP_KEY);
    sdkInitialized = true;
  }

  try {
    return pickAccessToken(await kakaoNativeLogin());
  } catch (talkErr) {
    // 카카오톡 경로였는지 = 실패했을 때만 SDK 에 물어봄(성공 경로에 불필요한 왕복 0).
    //   이 조회가 실패해도 원래 사유(talkErr)를 잃지 않게 false 로 떨어뜨림.
    const viaKakaoTalk = await isKakaoTalkLoginAvailable().catch(() => false);
    if (!viaKakaoTalk) throw talkErr;
    console.warn(
      "[Kakao] 카카오톡 경로 실패 → 카카오계정 화면으로 이어감:",
      talkErr,
    );
    try {
      return pickAccessToken(
        await kakaoNativeLogin({ useKakaoAccountLogin: true }),
      );
    } catch (accountErr) {
      // 둘 다 실패 = 두 단계 사유를 한 번에 보여줘야 1회 테스트로 원인이 확정됨(§11)
      throw mergeKakaoErrors(accountErr, talkErr);
    }
  }
}

/** 2차(계정 화면) 사유에 1차(카카오톡) 사유를 덧붙임. code 는 2차 것을 유지 */
function mergeKakaoErrors(second: unknown, first: unknown): Error {
  const s = second as { code?: string; message?: string } | null;
  const f = first as { code?: string; message?: string } | null;
  const firstDesc = [f?.code, f?.message].filter(Boolean).join(" ");
  const merged = new Error(
    [s?.message, firstDesc && `(카카오톡 단계: ${firstDesc})`]
      .filter(Boolean)
      .join(" "),
  ) as Error & { code?: string };
  merged.code = s?.code;
  return merged;
}

function pickAccessToken(token: { accessToken?: string } | null): string {
  if (!token?.accessToken) {
    throw new Error("카카오에서 인증 정보를 받지 못했습니다.");
  }
  return token.accessToken;
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
