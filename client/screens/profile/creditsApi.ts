// ⚠️ 수정금지(승인필요) 2026-07-29 사장님 SSOT = 크레딧·결제 화면 API 헬퍼 (CLAUDE.md §9).
//   정본 문서 = docs/2026-07-29 결제·크레딧 구현.md. 백엔드 = server/payment-routes.ts (6라우트).
//   ⚠️ 2026-07-30 §16 = 자체 fetch 헬퍼 삭제 → 공용 apiRequest 1벌 사용.
//     apiRequest 가 주소 조립·로그인 토큰 첨부·오류 던지기를 모두 하므로 여기서 다시 만들 것이 없다.
//     이 파일은 "응답을 화면이 쓰기 쉬운 값으로 바꾸는 일"만 한다.
import { apiRequest } from "@/lib/query-client";

// 장부 1줄 = server/creditService.ts getTransactionHistory 응답 규약
export interface CreditTransaction {
  id: string;
  type: string; // 'purchase' | 'usage' | 'signup_bonus' | ...
  amount: number; // 양수=획득, 음수=사용
  description: string;
  referenceId: string | null;
  createdAt: string;
  balance: number; // 그 거래 직후 잔액(서버가 현재 잔액에서 역산)
}

// 단가표 = 서버가 정본(server/credit-charge.ts CREDIT_COSTS). 화면은 이 값을 읽어 표시한다(하드코딩 금지).
export interface CreditPricing {
  currency: string;
  priceEur: number;
  purchaseCredits: number;
  signupBonus: number;
  costs: Record<string, number>;
}

// 잔액 = GET /api/credits/balance. 실패·미로그인 = null(화면이 "-" 로 표시).
export async function getBalance(): Promise<number | null> {
  try {
    const data = (await (
      await apiRequest("GET", "/api/credits/balance")
    ).json()) as { balance: number };
    return typeof data.balance === "number" ? data.balance : null;
  } catch {
    return null;
  }
}

// 거래내역 = GET /api/credits/transactions?limit=N. 실패 = 빈 배열(화면이 "내역 없음").
export async function getTransactions(
  limit = 20,
): Promise<CreditTransaction[]> {
  try {
    const data = (await (
      await apiRequest("GET", `/api/credits/transactions?limit=${limit}`)
    ).json()) as { transactions: CreditTransaction[] };
    return Array.isArray(data.transactions) ? data.transactions : [];
  } catch {
    return [];
  }
}

// 요금·단가표 = GET /api/credits/pricing (공개). 실패 = null.
export async function getPricing(): Promise<CreditPricing | null> {
  try {
    return (await (
      await apiRequest("GET", "/api/credits/pricing")
    ).json()) as CreditPricing;
  } catch {
    return null;
  }
}

// 결제창 만들기 = POST /api/payments/checkout → { url, sessionId }.
//   ⚠️ 이 주소를 브라우저로 열기만 한다. 크레딧을 넣는 것은 스트라이프 직접 통보(웹훅) 1벌이므로,
//     사용자가 창을 닫아도·폰이 꺼져도 충전은 진행된다(딥링크·커스텀 스킴 불필요).
export async function createCheckout(): Promise<{
  url: string;
  sessionId: string;
} | null> {
  try {
    const data = (await (
      await apiRequest("POST", "/api/payments/checkout")
    ).json()) as { url: string; sessionId: string };
    return data.url ? data : null;
  } catch {
    return null;
  }
}

// 결제 상태 조회 = GET /api/payments/session/:id (읽기 전용).
//   paid = 스트라이프가 결제 완료로 보는가 / fulfilled = 우리 장부에 충전 줄이 들어왔는가.
export async function getSessionStatus(
  sessionId: string,
): Promise<{ paid: boolean; fulfilled: boolean } | null> {
  try {
    const data = (await (
      await apiRequest(
        "GET",
        `/api/payments/session/${encodeURIComponent(sessionId)}`,
      )
    ).json()) as { paid?: unknown; fulfilled?: unknown };
    // ⚠️ 검증 없이 캐스트하면 서버가 다른 형태를 줄 때 undefined 가 "결제 안 됨"으로 읽힌다 = 돈 걸린 판단이라 엄격 비교(§22 지적).
    return { paid: data.paid === true, fulfilled: data.fulfilled === true };
  } catch {
    return null;
  }
}
