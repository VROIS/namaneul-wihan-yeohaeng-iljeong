// ⚠️ 수정금지(승인필요) — 구글 로그인 "앱(iOS·Android)" 전용 경로 (2026-07-26 신설)
// 웹은 같은 폴더의 auth-google.web.ts 가 Metro 플랫폼 확장자로 자동 선택됨
// = 한 플랫폼에 경로 1벌만 존재(§0). 네이티브 부품이 웹 번들에 섞이는 것도 원천 차단.
import { Platform } from "react-native";
import type { GoogleAuthRequestTuple } from "./auth-oauth";
// ⚠️ 열쇠는 client/lib/app-keys.ts 한 곳에서만 읽는다(§16).
import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
} from "./app-keys";

/** 이 플랫폼에서 실제로 쓸 webClientId. 안드로이드만 별도 프로젝트 값(2026-08-11, app-keys.ts 주석 참고) */
const webClientIdForPlatform =
  Platform.OS === "android" ? GOOGLE_ANDROID_CLIENT_ID : GOOGLE_WEB_CLIENT_ID;

/** iOS 는 별도 클라이언트 ID 필요(구글 규정) / 안드로이드는 웹 클라이언트 ID 1개로 동작 */
export function isGoogleOAuthConfigured(): boolean {
  return Platform.OS === "ios"
    ? !!(GOOGLE_WEB_CLIENT_ID && GOOGLE_IOS_CLIENT_ID)
    : !!webClientIdForPlatform;
}

// 앱에는 웹 리다이렉트 요청이 없음 = 훅을 호출하지 않는 자리표시(훅 규칙 위반 0)
const NOOP_PROMPT = async () => null;
export function useGoogleAuthRequest(): GoogleAuthRequestTuple {
  return [null, null, NOOP_PROMPT];
}

let configured = false;

/**
 * 앱 구글 로그인 → id_token 반환. **사용자가 취소하면 null**(실패 아님).
 * - webClientId 를 넣는 이유 = 발급되는 id_token 의 수신자(aud)가 그 webClientId 가 되어
 *   서버(server/auth.ts 의 aud/azp 검사)를 통과. 안드로이드는 이 값이 iOS·웹과 다르므로(위 주석)
 *   서버가 **두 값 중 하나**를 허용하도록 함께 바뀌어야 한다(2026-08-11).
 *   ('내손앱' server/nativeGoogleAuth.ts + mobile-app GoogleAuthHandler.js 와 동일 구조 = 검증된 방식 이식)
 * - 부품은 버튼을 누른 순간에만 불러옴 = 부품이 없는 Expo Go 에서도 앱 자체는 안 깨짐.
 * - ⚠️ v16 signIn() 은 취소 시 예외를 던지지 않고 { type:'cancelled' } 로 정상 반환한다
 *   (node_modules 소스 확인). 그래서 취소 판별은 여기서 한다.
 */
export async function signInWithGoogle(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require("@react-native-google-signin/google-signin");

  if (!configured) {
    GoogleSignin.configure({
      webClientId: webClientIdForPlatform,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      offlineAccess: false,
    });
    configured = true;
  }

  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices();
  }

  const result = await GoogleSignin.signIn();
  if (result?.type === "cancelled") return null; // 사용자가 창을 닫음

  const idToken: string | null = result?.data?.idToken ?? null;
  if (!idToken) throw new Error("구글에서 인증 정보를 받지 못했습니다.");
  return idToken;
}
