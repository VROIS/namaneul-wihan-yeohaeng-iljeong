// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 구글맵 가격 글자("₩30,000–40,000" · "KES 5,000+") → 유로 1벌 = 범위는 높은 값(상한), "X 이상"은 X · 환율 = 창고 환율표(fill/exchange-rates 가 채움) · 페이지 읽기·제미니 몰아 묻기·어사이드 답 넣기가 같이 쓴다 (정본 §)
import type { CardPrice } from "../fill/gmaps-pid-identity/page-reader";

const SYMBOL: Record<string, string> = {
  "€": "EUR",
  "£": "GBP",
  "₩": "KRW",
  "₹": "INR",
  R$: "BRL",
};
const DOLLAR: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  CL: "CLP",
  CO: "COP",
  MX: "MXN",
  AR: "ARS",
  AU: "AUD",
  NZ: "NZD",
  SG: "SGD",
  HK: "HKD",
  TW: "TWD",
};
const YEN: Record<string, string> = { JP: "JPY", CN: "CNY" };

export type EurPer = Record<string, number>;
export type EurResult = { eur?: number; open?: boolean; why?: string };

/** 창고 환율표(base KRW) → 통화 1단위당 유로. --fx 로 사람이 준 값이 이긴다. */
export async function loadEurPer(
  c: { query: (q: string, v?: unknown[]) => Promise<any> },
  fx?: string,
): Promise<EurPer> {
  const krw: Record<string, number> = Object.fromEntries(
    (
      await c.query(
        "SELECT target_currency, rate::float AS rate FROM exchange_rates WHERE base_currency='KRW'",
      )
    ).rows.map((r: any) => [r.target_currency, r.rate]),
  );
  const eurPer: EurPer = { EUR: 1 };
  for (const [cur, r] of Object.entries(krw))
    if (krw.EUR && r > 0) eurPer[cur] = krw.EUR / r;
  for (const kv of String(fx || "")
    .split(",")
    .filter(Boolean)) {
    const [cur, v] = kv.split(":");
    if (cur && Number(v) > 0) eurPer[cur.toUpperCase()] = Number(v);
  }
  return eurPer;
}

export function currencyOf(
  cp: CardPrice,
  countryCode: string | null | undefined,
): string | undefined {
  return /^[A-Z]{3}$/.test(cp.cur)
    ? cp.cur
    : cp.cur === "$"
      ? DOLLAR[countryCode ?? ""]
      : cp.cur === "¥"
        ? YEN[countryCode ?? ""]
        : SYMBOL[cp.cur];
}

export function toEur(
  cp: CardPrice,
  countryCode: string | null | undefined,
  eurPer: EurPer,
): EurResult {
  const cur = currencyOf(cp, countryCode);
  if (!cur || !eurPer[cur]) return { why: `환율 없음 ${cur || cp.cur}` };
  const local = cp.hi != null ? cp.hi : cp.lo;
  return {
    eur: local === 0 ? 0 : Math.max(1, Math.round(local * eurPer[cur])),
    open: cp.hi == null,
  };
}

/** 위가 열린 "X 이상" 증거 = 우리 값이 X 이상이면 어긋나지 않으니 그대로 둔다 */
export const keepsExisting = (before: number | null, r: EurResult) =>
  !!r.open && before != null && r.eur != null && before >= r.eur;

export const priceLabel = (cp: CardPrice) =>
  `${cp.cur}${cp.lo}${cp.hi != null ? `–${cp.hi}` : "+"}`;
