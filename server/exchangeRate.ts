interface MultiCurrencyRates {
  KRW: number;
  USD: number;
  CNY: number;
  JPY: number;
}

interface ExchangeRateCache {
  rates: MultiCurrencyRates;
  timestamp: number;
}

let cache: ExchangeRateCache | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1시간 캐시

const DEFAULT_RATES: MultiCurrencyRates = {
  KRW: 1500,
  USD: 1.05,
  CNY: 7.6,
  JPY: 163,
};

export async function getAllRates(): Promise<MultiCurrencyRates> {
  const now = Date.now();

  if (cache && now - cache.timestamp < CACHE_DURATION) {
    return cache.rates;
  }

  try {
    const response = await fetch(
      "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=KRW,USD,CNY,JPY",
    );

    if (!response.ok) {
      throw new Error(`Exchange rate API error: ${response.status}`);
    }

    const data = await response.json();
    const rates: MultiCurrencyRates = {
      KRW: data.rates.KRW,
      USD: data.rates.USD,
      CNY: data.rates.CNY,
      JPY: data.rates.JPY,
    };

    cache = { rates, timestamp: now };

    console.log(
      `📈 Exchange rates updated: EUR → KRW:${rates.KRW} USD:${rates.USD} CNY:${rates.CNY} JPY:${rates.JPY}`,
    );
    return rates;
  } catch (error) {
    console.error("Exchange rate fetch error:", error);
    return cache?.rates || DEFAULT_RATES;
  }
}

export async function getEURtoKRW(): Promise<number> {
  const rates = await getAllRates();
  return rates.KRW;
}

export async function convertEURtoKRW(eurAmount: number): Promise<number> {
  const rate = await getEURtoKRW();
  return Math.round(eurAmount * rate);
}

export async function formatKRW(eurAmount: number): Promise<string> {
  const krwAmount = await convertEURtoKRW(eurAmount);
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(krwAmount);
}
