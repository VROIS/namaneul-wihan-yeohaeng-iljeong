import { WHATSAPP_OTP_ENABLED } from "./app-keys";

export type GoogleAuthResponse = {
  type: string;
  params?: { id_token?: string };
  authentication?: { idToken?: string };
} | null;

export type GoogleAuthRequestTuple = [
  unknown,
  GoogleAuthResponse,
  () => Promise<unknown>,
];

export function isWhatsAppOtpConfigured(): boolean {
  return WHATSAPP_OTP_ENABLED;
}

export function getIdTokenFromGoogleResponse(
  response: GoogleAuthResponse,
): string | null {
  if (!response || response.type !== "success") return null;
  return response.params?.id_token ?? response.authentication?.idToken ?? null;
}
