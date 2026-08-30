// ⚠️ 수정금지(승인필요) — **빌드 때** 쓰는 열쇠를 읽는 곳 = 여기 한 곳 (2026-07-27 사장님 SSOT §16).

function readKey(name) {
  return (process.env[name] || "").trim();
}

module.exports = {
  kakaoNativeAppKey: () => readKey("EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY"),
  googleIosClientId: () => readKey("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
};
