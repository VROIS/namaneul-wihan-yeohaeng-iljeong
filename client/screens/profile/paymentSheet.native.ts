// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = 폰 결제 시트 1벌(구글 로그인과 같은 급의 네이티브 시트).
//   흐름 = 열기 → 카드입력·결제 → **자동 닫힘**. 브라우저·복귀 주소·안내 화면 없음(사장님 SSOT = 화면·클릭 최소).
//   충전 확정은 여기가 아니라 서버 웹훅 1경로(§9) = 이 파일은 시트를 여닫기만 한다.
//   웹 번들은 이 파일 대신 paymentSheet.ts(스텁)를 집는다(.native 확장자 = RN 플랫폼 분기 표준).
import {
  initStripe,
  initPaymentSheet,
  presentPaymentSheet,
} from "@stripe/stripe-react-native";

export type SheetResult =
  | { status: "done" }
  | { status: "canceled" } // 사용자가 시트를 접음 = 오류 아님 = 침묵
  | { status: "failed"; message: string };

// 공개 키 초기화는 키가 바뀔 때만 1회(관리자 화면에서 키 교체 시 재빌드 없이 따라감).
let initializedKey: string | null = null;

export async function paySheet(
  publishableKey: string,
  clientSecret: string,
): Promise<SheetResult> {
  if (initializedKey !== publishableKey) {
    await initStripe({ publishableKey });
    initializedKey = publishableKey;
  }

  const init = await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: "Tripis",
  });
  if (init.error) {
    return { status: "failed", message: init.error.message };
  }

  const result = await presentPaymentSheet();
  if (result.error) {
    if (result.error.code === "Canceled") return { status: "canceled" };
    // 서버·Stripe 가 준 실패 사유를 그대로 = "다시 시도해 주세요"로 뭉개지 않는다(2026-07-31 사장님 지시).
    return { status: "failed", message: result.error.message };
  }
  return { status: "done" };
}
