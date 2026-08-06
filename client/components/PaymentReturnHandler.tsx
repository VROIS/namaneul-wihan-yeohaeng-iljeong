// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **결제하고 돌아왔을 때의 뒷정리 1벌.**
//
// 화면 이동은 여기서 하지 않는다.
//   사장님 지적(2026-08-06): "결제의 출발이 프로필인데 돌아오는 곳을 프로필로 설정하지 않고
//   여정플래너(앱 시작 화면)를 부모로 잡으니 리디렉션이 실패한다."
//   → 그래서 **첫 화면 자체를 프로필로** 연다(MainTabNavigator 의 initialRouteName).
//     이 파일이 하는 일은 **주소창 청소**와 **폰 전용 안내** 둘뿐이다(이동은 한 곳에서만 = §0).
//
// 로그인 상태에서는 아무 말도 하지 않는다.
//   사장님 지시: "제대로 구현된다면 이 메시지가 왜 필요하지? 출발이 프로필 충전 화면인데
//   **반영된 것만 보여주면 끝**." → 돌아온 화면이 곧 충전소이고 거기 잔액이 있다. 옛 성공 팝업 = 삭제(§19).
//
// ⚠️ 비로그인일 때만 한 줄 알린다(§22 판단검증이 잡은 돈 걸린 함정).
//   폰에서는 결제창이 **앱 안 브라우저**로 뜨고(useProfile 의 WebBrowser) 복귀도 그 브라우저로 온다.
//   그 브라우저는 앱과 저장소를 공유하지 않아 **비로그인**으로 켜지므로 보여 줄 잔액이 없다.
//   아무 말도 안 하면 방금 €10 을 낸 사람이 실패로 오해해 **또 결제**할 수 있다.
//   (폰 앱 쪽 충전 확인·잔액 갱신은 브라우저를 닫는 순간 useProfile 이 이미 한다.)
//
// ⚠️ 딥링크로 앱에 되돌리는 방식은 2026-07-27 안드로이드 창닫기 함정이라 쓰지 않는다(§9 금지 6).
import { useEffect, useRef } from "react";

import { useMapToggle } from "@/contexts/MapToggleContext";
import { readPaymentReturn } from "@/lib/paymentReturn";

export default function PaymentReturnHandler() {
  // 로그인 여부 판정 = 앱 전체 1곳(§0). authReady 전에는 판정하지 않는다.
  const { isAuthed, authReady } = useMapToggle();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current || !authReady) return;
    const payment = readPaymentReturn();
    if (!payment) return; // 폰·비결제 진입은 여기서 끝(그 판별 1벌이 막는다)
    handledRef.current = true;

    // 주소창에서 결제 흔적을 지운다 = 새로고침해도 프로필로 다시 튀지 않는다.
    //   ⚠️ 판별값은 앱이 켜질 때 이미 붙잡아 뒀으므로(paymentReturn.ts) 언제 지워도 안전하다.
    window.history.replaceState({}, "", window.location.pathname);

    if (payment === "success" && !isAuthed) {
      window.alert("결제가 접수되었습니다.\n\n앱으로 돌아가 주세요.");
    }
  }, [isAuthed, authReady]);

  return null;
}
