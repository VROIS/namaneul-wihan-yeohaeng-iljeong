// ⚠️ 수정금지(승인필요) — 구글 로그인 "웹" 전용 경로 (2026-07-26 분리, 로직은 무변경 §2)
// 현재 운영 웹에서 실제로 작동 중인 expo-auth-session 리다이렉트 방식 그대로.
// 앱(iOS·Android)은 같은 폴더의 auth-google.ts(네이티브 SDK)가 자동 선택됨.
import * as WebBrowser from "expo-web-browser";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";
import type { GoogleAuthRequestTuple, GoogleAuthResponse } from "./auth-oauth";
// ⚠️ 열쇠는 client/lib/app-keys.ts 한 곳에서만 읽는다(§16).
import { GOOGLE_WEB_CLIENT_ID } from "./app-keys";

WebBrowser.maybeCompleteAuthSession();

/** 웹은 웹 클라이언트 ID 1개면 됨 */
export function isGoogleOAuthConfigured(): boolean {
  return !!GOOGLE_WEB_CLIENT_ID;
}

export function useGoogleAuthRequest(): GoogleAuthRequestTuple {
  const [request, response, promptAsync] = useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  return [request, response as unknown as GoogleAuthResponse, promptAsync];
}

/** 앱 전용 경로 = 웹에서는 호출되지 않음 */
export async function signInWithGoogle(): Promise<string | null> {
  throw new Error("웹은 useGoogleAuthRequest 리다이렉트를 사용합니다.");
}
