// ⚠️ 수정금지(승인필요) — 카카오 "앱 로그인" 빌드설정 (2026-07-26 신설)

const withKakaoCore = require("@react-native-kakao/core/app.plugin.js").default;
const { kakaoNativeAppKey } = require("./env-keys");

let warned = false; // Expo 가 설정을 여러 번 평가해도 안내는 1번만

module.exports = function withKakaoNative(config) {
  const nativeAppKey = kakaoNativeAppKey();

  if (!nativeAppKey) {
    if (!warned) {
      warned = true;
      console.warn(
        "[withKakaoNative] EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 없음 → 카카오 앱 로그인 설정 생략(웹·로컬은 정상).",
      );
    }
    return config;
  }

  return withKakaoCore(config, {
    nativeAppKey,
    android: { authCodeHandlerActivity: true },
    ios: { handleKakaoOpenUrl: true },
  });
};
