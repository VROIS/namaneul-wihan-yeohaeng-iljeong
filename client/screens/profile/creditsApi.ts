// ⚠️ 수정금지(승인필요) 2026-07-29 사장님 SSOT = 크레딧·결제 화면 API 헬퍼 (CLAUDE.md §9).
//   정본 문서 = docs/2026-07-29 결제·크레딧 구현.md. 백엔드 = server/payment-routes.ts (6라우트).
//   인증 방식 = client/screens/expert/expertApi.ts:27-44 를 **그대로 복제**(§16 재발명 금지) =
//   공유 apiRequest(쿠키) 대신 Bearer 토큰(getUserData().token)을 직접 붙인다(앱에서 유일하게 작동하는 인증).
import { getApiUrl } from "@/lib/query-client";
import { getUserData } from "@/lib/auth";

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

// 공용 fetch = Bearer 토큰 자동 첨부. 미로그인이면 토큰 없음(백엔드가 401 반환).
async function req(method: string, path: string): Promise<Response> {
  const user = await getUserData();
  const headers: Record<string, string> = {};
  if (user?.token && user.token.startsWith("simple_auth_token_v1_")) {
    headers["Authorization"] = `Bearer ${user.token}`;
  }
  return fetch(new URL(path, getApiUrl()).toString(), { method, headers });
}

// 잔액 = GET /api/credits/balance. 실패·미로그인 = null(화면이 "-" 로 표시).
export async function getBalance(): Promise<number | null> {
  try {
    const res = await req("GET", "/api/credits/balance");
    if (!res.ok) return null;
    const data = (await res.json()) as { balance: number };
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
    const res = await req("GET", `/api/credits/transactions?limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { transactions: CreditTransaction[] };
    return Array.isArray(data.transactions) ? data.transactions : [];
  } catch {
    return [];
  }
}

// 요금·단가표 = GET /api/credits/pricing (공개). 실패 = null.
export async function getPricing(): Promise<CreditPricing | null> {
  try {
    const res = await req("GET", "/api/credits/pricing");
    if (!res.ok) return null;
    return (await res.json()) as CreditPricing;
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
    const res = await req("POST", "/api/payments/checkout");
    if (!res.ok) return null;
    const data = (await res.json()) as { url: string; sessionId: string };
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
    const res = await req(
      "GET",
      `/api/payments/session/${encodeURIComponent(sessionId)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { paid?: unknown; fulfilled?: unknown };
    // ⚠️ 검증 없이 캐스트하면 서버가 다른 형태를 줄 때 undefined 가 "결제 안 됨"으로 읽힌다 = 돈 걸린 판단이라 엄격 비교(§22 지적).
    return { paid: data.paid === true, fulfilled: data.fulfilled === true };
  } catch {
    return null;
  }
}
