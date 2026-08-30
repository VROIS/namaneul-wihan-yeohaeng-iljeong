/** ⚠️ 수정금지(승인필요) — 앱이 쓰는 열쇠는 **이 파일 한 곳에서만 읽는다** (2026-07-27 사장님 SSOT §16). */

function clean(v: string | undefined): string {
  return (v || "").trim();
}

export const GOOGLE_WEB_CLIENT_ID = clean(
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
);
export const GOOGLE_IOS_CLIENT_ID = clean(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
);
export const GOOGLE_ANDROID_CLIENT_ID =
  clean(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) ||
  GOOGLE_WEB_CLIENT_ID;
export const KAKAO_JS_KEY = clean(process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY);
export const KAKAO_REST_KEY = clean(process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY);
export const KAKAO_NATIVE_APP_KEY = clean(
  process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,
);
export const WHATSAPP_OTP_ENABLED =
  clean(process.env.EXPO_PUBLIC_WHATSAPP_OTP_ENABLED) === "true";
