// ⚠️ 수정금지(승인필요) — 구글 "앱 로그인" 빌드설정 (2026-07-26 신설)
// 목적: 공식 @react-native-google-signin/google-signin config plugin 은 iosUrlScheme 을 app.json 에
//       문자열로 요구함. 이 레포는 공개(public) 라 환경변수(GitHub Secrets)에서 읽어 넘김.
// 하는 일: iOS Info.plist 의 URL 스킴에 "역순 iOS 클라이언트 ID" 등록
//       (없으면 구글 인증창에서 앱으로 못 돌아옴 = ios/RNGoogleSignin.mm 이 명시적으로 실패시킴)
// 안드로이드: 이 플러그인이 하는 일 없음(오토링킹만으로 동작) = iOS 클라이언트 ID 없어도 갤럭시는 정상.
// 크게 실패시키는 자리 = 앱 빌드 워크플로의 열쇠 사전검사 1곳(§0 = 조용한 실패 금지).

const withGoogleSignIn =
  require("@react-native-google-signin/google-signin/app.plugin.js").default;
// ⚠️ 빌드 때 쓰는 열쇠는 plugins/env-keys.js 한 곳에서만 읽는다(§16). 여기서 직접 process.env 를 읽지 말 것.
const { googleIosClientId } = require("./env-keys");

let warned = false; // Expo 가 설정을 여러 번 평가해도 안내는 1번만

module.exports = function withGoogleNative(config) {
  const iosClientId = googleIosClientId();

  if (!iosClientId) {
    if (!warned) {
      warned = true;
      console.warn(
        "[withGoogleNative] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID 없음 → iOS 구글 로그인 설정 생략(웹·안드로이드는 정상).",
      );
    }
    return config;
  }

  // 1234-abcd.apps.googleusercontent.com → com.googleusercontent.apps.1234-abcd
  const iosUrlScheme =
    "com.googleusercontent.apps." +
    iosClientId.replace(/\.apps\.googleusercontent\.com$/, "");

  return withGoogleSignIn(config, { iosUrlScheme });
};
