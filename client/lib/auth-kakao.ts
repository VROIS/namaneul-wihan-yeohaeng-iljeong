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
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { initializeKakaoSDK } from "@react-native-kakao/core";
import { issueAccessTokenWithCodeWeb } from "@react-native-kakao/user";
import { getApiUrl } from "./query-client";

const KAKAO_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || "";
// ⚠️ 이름 1벌 = `EXPO_PUBLIC_` 붙은 것만. 옛 폴백(`process.env.KAKAO_REST_API_KEY`) 완전삭제 = 2026-07-26 §0·§19.
//   근거(실측) = 웹 번들에서 `EXPO_PUBLIC_` 키만 값으로 박히고 그 이름은 흔적조차 없음 = 항상 빈값이던 죽은 분기.
const KAKAO_REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || "";
/** 서버가 브라우저 창을 닫고 앱으로 값을 넘길 때 쓰는 주소.
 *  ⚠️ 같은 값이 `server/auth.ts` 의 `KAKAO_APP_RETURN_SCHEME` · `app.json` 의 `scheme` 에도 있음
 *     (앱↔서버 경계라 한 파일로 못 묶음). **셋을 항상 함께** 바꿀 것 — 한쪽만 바꾸면 조용히 로그인 실패. */
const KAKAO_APP_RETURN_SCHEME = "vibetrip://kakao-auth";

/**
 * ⚠️ 앱 카카오 로그인만은 **운영 주소 고정**(2026-07-26 §22 검증 지적).
 *   이유: 카카오 콘솔에 등록된 돌아올 주소가 이 주소 하나뿐이라, 카카오는 무조건 여기로 보낸다.
 *   그런데 로그인 시작·마무리를 빌드마다 달라지는 주소(`EXPO_PUBLIC_DOMAIN`)로 부르면
 *   **표를 봉한 서버와 여는 서버가 갈려** 401 만 뜨고 원인을 알 수 없게 된다. 그래서 세 다리를 한 주소로 묶는다.
 *   ⚠️ `server/auth.ts` 의 `KAKAO_APP_REDIRECT_URI` · 카카오 콘솔 등록값과 **항상 함께** 바꿀 것.
 *   (구글·이메일 등 다른 로그인은 그대로 `getApiUrl()` 사용 = 이 고정은 카카오 앱 경로 한정.)
 */
export const KAKAO_APP_API_ORIGIN = "https://my-guide.replit.app";

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
export type KakaoAppLoginResult = {
  /** 서버가 봉해서 넘겨준 표(안에 인가코드가 들어 있고, 앱은 열 수 없음) */
  ticket: string;
  /** 이 폰만 아는 무작위값 = 표를 쓸 수 있는 유일한 열쇠 */
  nonce: string;
};

export async function loginKakaoApp(): Promise<KakaoAppLoginResult | null> {
  // ⚠️ 2026-07-26 = 이번 로그인에만 쓰는 무작위값. **앱 밖으로 나가지 않고**, 지문(sha256)만 카카오를 왕복.
  //   마지막 교환 때 서버가 원본을 요구하므로, 결과 주소를 가로챈 나쁜 앱은 교환하지 못함(§22 보안 지적).
  const nonce = Array.from(Crypto.getRandomBytes(32))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const nonceHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce,
    { encoding: Crypto.CryptoEncoding.HEX },
  );

  const startUrl = `${KAKAO_APP_API_ORIGIN}/api/auth/kakao/start?nh=${nonceHash}`;
  const result = await WebBrowser.openAuthSessionAsync(
    startUrl,
    KAKAO_APP_RETURN_SCHEME,
  );

  if (result.type !== "success" || !result.url) {
    // 사용자가 창을 닫음 = 취소. 안내는 안 띄우되 진단용 흔적은 남김.
    console.log("[Kakao] 로그인 창이 닫힘:", result.type);
    return null;
  }

  const params = parseReturnUrl(result.url);
  if (params.error) {
    // 동의화면에서 '취소' = 실패가 아님 = 안내 없이 조용히 끝냄(창 X 버튼과 같은 취급)
    if (params.error === "access_denied") {
      console.log("[Kakao] 사용자가 동의화면에서 취소함");
      return null;
    }
    throw new Error(
      `카카오 로그인 거부: ${params.error}${params.detail ? ` (${params.detail})` : ""}`,
    );
  }
  if (!params.ticket) {
    throw new Error("카카오에서 인증 정보를 받지 못했습니다.");
  }
  return { ticket: params.ticket, nonce };
}

/** `vibetrip://kakao-auth?ticket=...` 에서 값 꺼내기 (커스텀 스킴이라 URL 클래스 대신 직접 파싱) */
function parseReturnUrl(url: string): Record<string, string> {
  const q = url.split("?")[1];
  if (!q) return {};
  const out: Record<string, string> = {};
  for (const pair of q.split("&")) {
    const [k, v] = pair.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return out;
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
