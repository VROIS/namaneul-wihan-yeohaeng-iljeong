/**
 * 소셜 로그인 공용 (플랫폼 무관)
 * - 구글 실제 구현·설정 판정 = auth-google.ts(앱) / auth-google.web.ts(웹) — Metro 가 플랫폼별로 자동 선택
 * - WhatsApp OTP: 별도 플로우 (auth.ts whatsappOtpSend/Verify)
 */

/** 구글 로그인 응답(웹 리다이렉트 복귀분). 앱 경로는 이 값을 쓰지 않음 */
export type GoogleAuthResponse = {
  type: string;
  params?: { id_token?: string };
  authentication?: { idToken?: string };
} | null;

/** [요청, 응답, 로그인창 띄우기] — 웹/앱 구현이 동일한 모양을 반환 */
export type GoogleAuthRequestTuple = [
  unknown,
  GoogleAuthResponse,
  () => Promise<unknown>,
];

/** WhatsApp OTP 활성화 여부 (출시 전 false, 일시정지) */
export function isWhatsAppOtpConfigured(): boolean {
  return process.env.EXPO_PUBLIC_WHATSAPP_OTP_ENABLED === "true";
}

/**
 * 사용자가 로그인 창을 그냥 닫았는지(취소) 판별 — 카카오 SDK 전용.
 * (구글 SDK 는 취소 시 예외를 던지지 않고 type:'cancelled' 로 정상 반환하므로
 *  auth-google.ts 가 그 자리에서 판별한다 = 여기 안 옴)
 * 취소는 실패가 아니므로 "로그인 실패" 안내를 띄우지 않기 위해 씀.
 */
export function isUserCancelled(err: unknown): boolean {
  const e = err as { code?: string | number; message?: string } | null;
  return /cancel|취소/i.test(`${e?.code ?? ""} ${e?.message ?? ""}`);
}

/** Google OAuth 응답에서 id_token 추출 (웹 리다이렉트 복귀 전용) */
export function getIdTokenFromGoogleResponse(
  response: GoogleAuthResponse,
): string | null {
  if (!response || response.type !== "success") return null;
  return response.params?.id_token ?? response.authentication?.idToken ?? null;
}
