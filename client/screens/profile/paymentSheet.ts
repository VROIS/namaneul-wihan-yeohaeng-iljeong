// ⚠️ 수정금지(승인필요) 2026-08-12 = 웹용 스텁. 웹 결제는 Stripe 결제창(checkout)이 정답이라 시트를 쓰지 않는다.
//   이 파일이 있어야 웹 번들이 네이티브 부품(@stripe/stripe-react-native)을 붙잡지 않는다(.native 분기 표준).
//   호출되는 일 없음(useProfile 이 웹 분기에서 먼저 갈라짐) = 방어용 canceled 반환뿐.
import type { SheetResult } from "./paymentSheet.native";

export type { SheetResult };

export async function paySheet(
  _publishableKey: string,
  _clientSecret: string,
): Promise<SheetResult> {
  return { status: "canceled" };
}
