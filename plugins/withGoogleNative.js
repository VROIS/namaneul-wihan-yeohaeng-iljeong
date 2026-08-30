// ⚠️ 수정금지(승인필요) — 구글 "앱 로그인" 빌드설정 (2026-07-26 신설)

const withGoogleSignIn =
  require("@react-native-google-signin/google-signin/app.plugin.js").default;
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

  const iosUrlScheme =
    "com.googleusercontent.apps." +
    iosClientId.replace(/\.apps\.googleusercontent\.com$/, "");

  return withGoogleSignIn(config, { iosUrlScheme });
};
