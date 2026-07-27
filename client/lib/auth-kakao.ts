/**
 * 카카오 로그인
 * - 웹 = Kakao.Auth.authorize 리다이렉트 → code → 브라우저가 accessToken 교환 → 서버 /api/auth/kakao
 *        (운영 작동 중, §2 무변경)
 * - 앱(iOS·Android) = 브라우저 인증 세션 → 서버가 code 를 accessToken 으로 교환 → 서버 /api/auth/kakao/code
 *        ('내손앱'과 같은 웹 로그인 방식. 앱은 서버 주소만 알면 됨)
 *
 * 비밀값 위치(정확히) = **클라이언트 시크릿은 서버에만**. 아래 JS키·REST키는 웹 로그인에 필요해
 * 예전부터 웹 번들에 값으로 박히며(실측 확인), 앱 경로는 이 둘을 쓰지 않는다.
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
// ⚠️ 이름 1벌 = `EXPO_PUBLIC_` 붙은 것만. 옛 폴백(`process.env.KAKAO_REST_API_KEY`) 완전삭제 = 2026-07-26 §0·§19.
//   근거(실측) = 웹 번들에서 `EXPO_PUBLIC_` 키만 값으로 박히고 그 이름은 흔적조차 없음 = 항상 빈값이던 죽은 분기.
const KAKAO_REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || "";
// ⚠️ 앱 전용 = 카카오 콘솔 "네이티브 앱 키". plugins/withKakaoNative.js(빌드설정)와 같은 환경변수 = 값 1벌(§0).
const KAKAO_NATIVE_APP_KEY = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY || "";
const KAKAO_CALLBACK_STORAGE_KEY = "@nubi_kakao_birthDate";

export function isKakaoOAuthConfigured(): boolean {
  // 웹 = JS키(로그인 시작) + REST키(code→accessToken 교환)
  // 앱 = 서버가 카카오와 대화 = 앱 번들에 카카오 키가 필요 없음(항상 사용 가능)
  return Platform.OS === "web" ? !!(KAKAO_JS_KEY && KAKAO_REST_KEY) : true;
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
 * ⚠️ 수정금지(승인필요) — 앱(iOS·Android) 카카오 로그인 = '내손앱'과 같은 웹 로그인 방식 (2026-07-26).
 *
 *   앱 전용 카카오 부품(네이티브 SDK) 방식 폐기 = 2026-07-26 §19.
 *   사유: 카카오 서버가 네이티브 앱 키를 인가 요청에서 거부(KOE101 = 앱 관리자 설정 오류).
 *   같은 폰에서 '내손앱'(웹 로그인 방식)은 정상 작동 = 실증된 방식으로 통일.
 *
 *   흐름 = 앱이 브라우저 창으로 서버 주소를 열면 → 서버가 카카오로 보냄 → 로그인 →
 *          카카오가 서버로 돌려보냄 → 서버가 인가코드를 **봉해서** `vibetrip://kakao-auth?ticket=` 로 넘김 →
 *          브라우저 창 자동으로 닫히고 표 확보 → 서버가 표를 열어 토큰으로 바꿔 로그인.
 *   구글 로그인이 쓰는 방식과 같아 앱이 꺼지지 않고 입력값도 유지됨.
 *
 *   반환 = 봉한 표 + 이 폰만 아는 무작위값. 사용자가 창을 닫거나 동의화면에서 취소하면 null.
 */
/**
 * ⚠️ 수정금지(승인필요) — 앱(iOS·Android) 카카오 로그인 = **네이티브 SDK** (2026-07-27 사장님 결정).
 *
 *   브라우저 창 방식 완전삭제 §19. 사유(사장님 실기기):
 *   ① 인증 후에도 웹 창이 백그라운드에 남고 자동으로 안 닫힘(안드로이드는 창을 닫는 기능 자체가 없음)
 *   ② 탭 수가 많고(3~4탭) 아이폰은 애플 확인창이 1탭 더 붙음
 *   → 네이티브면 카카오톡으로 **2탭**에 끝나고 창이 아예 안 뜬다(구글 로그인과 같은 방식).
 *
 *   ⚠️ 옛 KOE101 판정 무효화 = 2026-07-27 실측. 공식 문서(트러블슈팅)상 KOE101 은
 *   "client_id 가 없거나 잘못됨"이고 안드로이드 SDK 는 **네이티브 앱 키를 client_id 로 보냄**.
 *   그 키로 실제 인가 요청을 넣어보니 **정상(로그인 화면)** = 이전에 막히던 조건이 콘솔 정비로 해소됨.
 *
 *   카카오톡 경로가 실패하면 카카오계정 화면으로 이어감(카카오 공식 안내. rnkakao 는 자동으로 안 넘어감).
 *   반환 = accessToken. 웹과 똑같이 서버 /api/auth/kakao 로 보냄.
 */
export async function loginKakaoApp(): Promise<string> {
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
    const viaKakaoTalk = await isKakaoTalkLoginAvailable().catch(() => false);
    if (!viaKakaoTalk) throw talkErr;
    console.warn(
      "[Kakao] 카카오톡 경로 실패 → 카카오계정 화면으로 이어감:",
      talkErr,
    );
    return pickAccessToken(
      await kakaoNativeLogin({ useKakaoAccountLogin: true }),
    );
  }
}

/** SDK 응답에서 accessToken 꺼내기(버전별 필드명 차이 흡수) */
function pickAccessToken(r: any): string {
  const t = r?.accessToken ?? r?.access_token;
  if (!t) throw new Error("카카오에서 인증 정보를 받지 못했습니다.");
  return t;
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
