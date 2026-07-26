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
 * ⚠️ 수정금지(승인필요) — 로그인 실패 사유를 화면에 그대로 보여주기 위한 상세문구 (2026-07-26 신설).
 *   사유: 실패를 조용히 삼켜 사장님도 AI도 원인을 볼 수 없던 상태를 해소(§11 = 추측 금지, 사실을 보게).
 *   카카오 SDK 는 code 에 사유 이름(Misconfigured·NotSupported·AccessDenied 등)을 넣어 줌
 *   = 그 코드를 그대로 노출해야 원인 판별이 됨. 반환값은 알림창의 "본문"으로 씀(제목과 분리 = 앱에서 잘림 방지).
 */
export function authErrorDetail(err: unknown): string | undefined {
  const e = err as { code?: string | number; message?: string } | null;
  const code = e?.code != null && e.code !== "" ? String(e.code) : "";
  const msg = e?.message ? String(e.message) : "";
  return [code && `(${code})`, msg].filter(Boolean).join(" ") || undefined;
}

/** Google OAuth 응답에서 id_token 추출 (웹 리다이렉트 복귀 전용) */
export function getIdTokenFromGoogleResponse(
  response: GoogleAuthResponse,
): string | null {
  if (!response || response.type !== "success") return null;
  return response.params?.id_token ?? response.authentication?.idToken ?? null;
}
