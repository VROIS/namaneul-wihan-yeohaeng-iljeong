// ⚠️ 수정금지(승인필요) — **빌드 때** 쓰는 열쇠를 읽는 곳 = 여기 한 곳 (2026-07-27 사장님 SSOT §16).
//
// 왜 client/lib/app-keys.ts 와 따로 있나
//   = 이 파일은 앱이 아니라 **빌드 도구(Node)** 가 읽는다. 실행 시점·언어(CommonJS)가 달라 못 합친다.
//     대신 **같은 환경변수 이름**을 쓰므로 값은 여전히 1벌이다.
//   = 앱 쪽과 달리 Node 는 이름을 변수로 넘겨도 되므로, 여기서는 이름을 받는 함수로 만든다.
//
// 왜 깎는가(trim)
//   = 붙여넣기 때 딸려오는 줄바꿈·공백이 그대로 빌드에 박혀 카카오 로그인이 전면 실패한 적이 있다
//     (docs/2026-07-25 로그인 인앱 팝업 전환.md 5-E). 눈에 안 보이는 글자라 사람이 못 잡는다.

/** 환경변수 하나를 읽어 앞뒤 공백·줄바꿈을 깎아 준다. 없으면 빈 문자열. */
function readKey(name) {
  return (process.env[name] || "").trim();
}

module.exports = {
  /** 카카오 앱(iOS·Android) 네이티브 앱 키 */
  kakaoNativeAppKey: () => readKey("EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY"),
  /** 구글 iOS 전용 클라이언트 ID */
  googleIosClientId: () => readKey("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
};
