/**
 * ⚠️ 수정금지(승인필요) — 앱이 쓰는 열쇠는 **이 파일 한 곳에서만 읽는다** (2026-07-27 사장님 SSOT §16).
 *
 * ▸ 왜 한 곳인가
 *   같은 열쇠를 여러 파일에 적으면, 하나가 빠지거나 값이 바뀔 때 **전부 찾아 고쳐야 한다.**
 *   실제로 그래서 사고가 났다 — 카카오 열쇠 뒤에 줄바꿈 2개가 딸려 들어가 앱 로그인이 전면 실패했고,
 *   값이 흩어져 있어 사흘간 원인을 못 찾았다(docs/2026-07-25 로그인 인앱 팝업 전환.md 5-E).
 *   이제 열쇠를 쓰는 쪽은 전부 여기서 **가져다 쓰기만** 한다.
 *
 * ▸ 왜 "이름을 넘기는 함수"로 안 만들었나 (= 동적 접근 금지)
 *   Expo 공식 문서: `process.env.이름` 을 **점 표기법으로 글자 그대로** 쓸 때만 값이 앱에 박힌다.
 *   `process.env["이름"]` 이나 구조분해는 **박히지 않고 런타임에 빈 값**이 된다.
 *   그래서 이름을 변수로 받는 함수는 만들 수 없다. 대신 **글자 그대로 쓰는 줄을 이 파일에만** 두고,
 *   바깥에는 이름이 아니라 **값을 export** 한다. (빌드 때 쓰는 열쇠는 plugins/env-keys.js 가 담당)
 *
 * ▸ 값이 없을 때
 *   빈 문자열이 된다. 각 로그인의 `is...Configured()` 가 그걸 보고 버튼을 막는다(판정 1벌).
 */

/** 붙여넣기 때 딸려오는 앞뒤 줄바꿈·공백을 깎는다 = 눈에 안 보이는 글자로 인한 사고 차단. */
function clean(v: string | undefined): string {
  return (v || "").trim();
}

/** 구글 = 웹 클라이언트 ID (안드로이드도 이것 1개로 동작) */
export const GOOGLE_WEB_CLIENT_ID = clean(
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
);
/** 구글 = iOS 전용 클라이언트 ID (구글 규정상 별도) */
export const GOOGLE_IOS_CLIENT_ID = clean(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
);
/** 카카오 = 웹 로그인 시작용 JavaScript 키 */
export const KAKAO_JS_KEY = clean(process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY);
/** 카카오 = 웹에서 코드를 토큰으로 바꿀 때 쓰는 REST API 키 */
export const KAKAO_REST_KEY = clean(process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY);
/** 카카오 = 앱(iOS·Android) 네이티브 앱 키. plugins/env-keys.js 와 같은 환경변수 이름을 쓴다. */
export const KAKAO_NATIVE_APP_KEY = clean(
  process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,
);
/** WhatsApp OTP 사용 여부 (출시 전 꺼둠) */
export const WHATSAPP_OTP_ENABLED =
  clean(process.env.EXPO_PUBLIC_WHATSAPP_OTP_ENABLED) === "true";
