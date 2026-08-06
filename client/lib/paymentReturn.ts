// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **결제하고 돌아왔는지**를 판별하는 곳 1벌(§0·§16).
//
// 사장님 지적(2026-08-06):
//   "결제의 출발이 프로필인데, 돌아오는 곳을 프로필로 설정하지 않고
//    여정플래너(앱 시작 화면)를 부모로 잡으니 생기는 리디렉션 실패다."
//   → 맞다. 서버가 Stripe 에 주는 복귀 주소는 앱 루트(`/?payment=...`, payment-routes.ts)라
//     앱이 **홈부터** 뜬 뒤에 프로필로 밀어 넣는 구조였다. 밀어 넣기 = 언제든 어긋날 수 있는 보정이다.
//   → 그래서 **처음부터 프로필로 뜨게** 한다: 탭 화면의 부모(첫 화면)를 이 값으로 정한다
//     (MainTabNavigator 의 initialRouteName). 홈을 거치지 않으므로 어긋날 자리가 없다.
//
// ⚠️ 값을 **앱이 켜질 때 딱 한 번** 붙잡아 둔다(그 뒤로는 이 값만 돌려준다).
//   왜: 주소창 청소(PaymentReturnHandler)와 첫 화면 결정(MainTabNavigator) 중 **무엇이 먼저 도는지**는
//   로그인 확인이 끝나는 시점에 따라 달라진다. 그때그때 주소를 읽으면 순서가 뒤집힐 때 프로필로 못 간다.
//   붙잡아 두면 **주소를 언제 지우든 결과가 같다** = 순서에 기대지 않는다(§22 판단검증 지적).
//   이 파일은 화면보다 먼저 읽히므로(임포트), 어떤 화면이 그려지기 전에 값이 정해진다.
//
// ⚠️ **폰에서는 곧바로 없음이다.**
//   폰(React Native)은 `window` 를 전역 자기 자신으로 만들어 두지만(setUpGlobals.js:18) **주소창(location)은 없다.**
//   그래서 `window` 만 확인하고 주소를 읽으면 폰에서 그 자리에서 앱이 죽는다
//   (= 이 값은 앱 첫 화면을 정할 때 쓰이므로 **앱이 아예 안 뜬다**, §8·§11).
//   저장소의 기존 관례와 같게 막는다(query-client.ts · useTripPlanner.ts).
import { Platform } from "react-native";

export type PaymentReturn = "success" | "cancel" | null;

function readOnce(): PaymentReturn {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined" || !window.location) return null;
  const v = new URLSearchParams(window.location.search).get("payment");
  return v === "success" || v === "cancel" ? v : null;
}

// 앱이 켜질 때 1회 확정 = 이후 주소창이 어떻게 바뀌어도 이 값은 그대로.
const snapshot: PaymentReturn = readOnce();

export function readPaymentReturn(): PaymentReturn {
  return snapshot;
}
