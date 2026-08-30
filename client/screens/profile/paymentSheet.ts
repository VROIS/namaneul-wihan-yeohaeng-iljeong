// ⚠️ 수정금지(승인필요) 2026-08-12 = 웹용 스텁. 웹 결제는 Stripe 결제창(checkout)이 정답이라 시트를 쓰지 않는다.
import type { SheetResult } from "./paymentSheet.native";

export type { SheetResult };

export async function paySheet(
  _publishableKey: string,
  _clientSecret: string,
): Promise<SheetResult> {
  return { status: "canceled" };
}
