// ⚠️ 수정금지(승인필요) 2026-07-29 사장님 SSOT = 크레딧·결제 화면 API 헬퍼 (CLAUDE.md §9).
import { apiRequest } from "@/lib/query-client";

export interface CreditTransaction {
  id: string;
  type: string; // 'purchase' | 'usage' | 'signup_bonus' | ...
  amount: number; // 양수=획득, 음수=사용
  description: string;
  referenceId: string | null;
  createdAt: string;
  balance: number; // 그 거래 직후 잔액(서버가 현재 잔액에서 역산)
}

export interface CreditPricing {
  currency: string;
  priceEur: number;
  purchaseCredits: number;
  signupBonus: number;
  costs: Record<string, number>;
  stripePublishableKey: string | null;
}

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

export async function getPricing(): Promise<CreditPricing | null> {
  try {
    return (await (
      await apiRequest("GET", "/api/credits/pricing")
    ).json()) as CreditPricing;
  } catch {
    return null;
  }
}

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

export async function createSheetIntent(): Promise<{
  clientSecret: string;
  intentId: string;
} | null> {
  try {
    const data = (await (
      await apiRequest("POST", "/api/payments/sheet-intent")
    ).json()) as { clientSecret?: unknown; intentId?: unknown };
    return typeof data.clientSecret === "string" &&
      typeof data.intentId === "string"
      ? { clientSecret: data.clientSecret, intentId: data.intentId }
      : null;
  } catch {
    return null;
  }
}

// 시트가 닫히는 순간 즉시 충전 반영 = POST /api/payments/confirm (2026-08-12 사장님 승인).
export async function confirmTopup(
  intentId: string,
): Promise<{ ok: boolean; balance?: number }> {
  try {
    const data = (await (
      await apiRequest("POST", "/api/payments/confirm", { intentId })
    ).json()) as { ok?: unknown; balance?: unknown };
    return {
      ok: data.ok === true,
      balance: typeof data.balance === "number" ? data.balance : undefined,
    };
  } catch {
    return { ok: false };
  }
}
