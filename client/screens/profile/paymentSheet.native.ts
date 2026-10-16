// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = 폰 결제 시트 1벌(구글 로그인과 같은 급의 네이티브 시트).
import {
  initStripe,
  initPaymentSheet,
  presentPaymentSheet,
} from "@stripe/stripe-react-native";

export type SheetResult =
  | { status: "done" }
  | { status: "canceled" } // 사용자가 시트를 접음 = 오류 아님 = 침묵
  | { status: "failed"; message: string };

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
