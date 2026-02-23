/**
 * OAuth 로그인 (Google, Facebook/Meta)
 * expo-auth-session providers 사용
 */
import * as WebBrowser from "expo-web-browser";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";
import { useAuthRequest } from "expo-auth-session/providers/facebook";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";
const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || "";
// Google provider requires non-empty clientId; use placeholder to avoid crash when not configured
const GOOGLE_CLIENT_ID_OR_PLACEHOLDER = GOOGLE_CLIENT_ID || "000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com";

export function useGoogleAuthRequest() {
  return useIdTokenAuthRequest({
    webClientId: GOOGLE_CLIENT_ID_OR_PLACEHOLDER,
    iosClientId: GOOGLE_CLIENT_ID_OR_PLACEHOLDER,
    androidClientId: GOOGLE_CLIENT_ID_OR_PLACEHOLDER,
  });
}

const FACEBOOK_APP_ID_OR_PLACEHOLDER = FACEBOOK_APP_ID || "0000000000000000";

export function useFacebookAuthRequest() {
  return useAuthRequest({
    clientId: FACEBOOK_APP_ID_OR_PLACEHOLDER,
  });
}

export function isGoogleOAuthConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID;
}

export function isFacebookOAuthConfigured(): boolean {
  return !!FACEBOOK_APP_ID;
}

/** Google OAuth 응답에서 id_token 추출 */
export function getIdTokenFromGoogleResponse(response: { type: string; params?: { id_token?: string }; authentication?: { idToken?: string } } | null): string | null {
  if (!response || response.type !== "success") return null;
  return response.params?.id_token ?? response.authentication?.idToken ?? null;
}

/** Facebook OAuth 응답에서 code 추출 */
export function getCodeFromFacebookResponse(response: { type: string; params?: { code?: string } } | null): string | null {
  if (!response || response.type !== "success") return null;
  return response.params?.code ?? null;
}
