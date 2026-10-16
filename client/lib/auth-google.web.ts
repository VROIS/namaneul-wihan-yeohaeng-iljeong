// ⚠️ 수정금지(승인필요) — 구글 로그인 "웹" 전용 경로 (2026-07-26 분리, 로직은 무변경 §2)
import * as WebBrowser from "expo-web-browser";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";
import type { GoogleAuthRequestTuple, GoogleAuthResponse } from "./auth-oauth";
import { GOOGLE_WEB_CLIENT_ID } from "./app-keys";

WebBrowser.maybeCompleteAuthSession();

export function isGoogleOAuthConfigured(): boolean {
  return !!GOOGLE_WEB_CLIENT_ID;
}

export function useGoogleAuthRequest(): GoogleAuthRequestTuple {
  const [request, response, promptAsync] = useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  return [request, response as unknown as GoogleAuthResponse, promptAsync];
}

export async function signInWithGoogle(): Promise<string | null> {
  throw new Error("웹은 useGoogleAuthRequest 리다이렉트를 사용합니다.");
}
