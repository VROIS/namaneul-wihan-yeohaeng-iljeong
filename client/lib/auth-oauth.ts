/**
 * OAuth 로그인 (Google)
 * expo-auth-session providers 사용
 * WhatsApp OTP: 별도 플로우 (auth.ts whatsappOtpSend/Verify)
 */
import * as WebBrowser from "expo-web-browser";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";
// Google provider requires non-empty clientId; use placeholder to avoid crash when not configured
const GOOGLE_CLIENT_ID_OR_PLACEHOLDER =
  GOOGLE_CLIENT_ID ||
  "000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com";

export function useGoogleAuthRequest() {
  return useIdTokenAuthRequest({
    webClientId: GOOGLE_CLIENT_ID_OR_PLACEHOLDER,
    iosClientId: GOOGLE_CLIENT_ID_OR_PLACEHOLDER,
    androidClientId: GOOGLE_CLIENT_ID_OR_PLACEHOLDER,
  });
}

export function isGoogleOAuthConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID;
}

/** WhatsApp OTP 활성화 여부 (출시 전 false, 일시정지) */
export function isWhatsAppOtpConfigured(): boolean {
  return process.env.EXPO_PUBLIC_WHATSAPP_OTP_ENABLED === "true";
}

/** Google OAuth 응답에서 id_token 추출 */
export function getIdTokenFromGoogleResponse(
  response: {
    type: string;
    params?: { id_token?: string };
    authentication?: { idToken?: string };
  } | null,
): string | null {
  if (!response || response.type !== "success") return null;
  return response.params?.id_token ?? response.authentication?.idToken ?? null;
}
