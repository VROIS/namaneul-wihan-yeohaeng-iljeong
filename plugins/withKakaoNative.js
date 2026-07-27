// ⚠️ 수정금지(승인필요) — 카카오 "앱 로그인" 빌드설정 (2026-07-26 신설)
// 목적: 공식 @react-native-kakao/core config plugin 은 nativeAppKey 를 app.json 에 문자열로 요구함.
//       이 레포는 공개(public) 라 app.json 에 키를 박으면 그대로 노출 → 환경변수(GitHub Secrets)에서 읽어 넘김.
//       런타임(client/lib/auth-kakao.ts)도 같은 EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 를 읽음 = 키 1벌(§0).
// 하는 일(공식 플러그인 위임):
//   - Android: kakao{네이티브앱키}://oauth 를 받는 AuthCodeHandlerActivity 등록 (카카오톡 → 우리 앱 복귀)
//   - iOS: 같은 스킴 URL 처리 + 카카오톡 실행 조회(LSApplicationQueriesSchemes)
// (Maven 저장소 등록은 이 플러그인이 안 해줌 = plugins/withKakaoMavenRepo.js 가 계속 담당 = 중복 아님)

const withKakaoCore = require("@react-native-kakao/core/app.plugin.js").default;
// ⚠️ 빌드 때 쓰는 열쇠는 plugins/env-keys.js 한 곳에서만 읽는다(§16). 여기서 직접 process.env 를 읽지 말 것.
const { kakaoNativeAppKey } = require("./env-keys");

let warned = false; // Expo 가 설정을 여러 번 평가해도 안내는 1번만

module.exports = function withKakaoNative(config) {
  const nativeAppKey = kakaoNativeAppKey();

  // 키가 없으면 이 설정만 건너뜀. (여기서 throw 하면 카카오 네이티브와 무관한
  //  웹 배포(Replit `expo export --platform web`)·로컬 `expo config` 까지 같이 죽음 = 실측 확인 2026-07-26)
  // "키 없이 앱이 조용히 나가는 것"은 .github/workflows/build-android-apk.yml 의 사전 검사 단계가 막음
  //  = 실패는 앱 빌드 한 곳에서만, 크게.
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
