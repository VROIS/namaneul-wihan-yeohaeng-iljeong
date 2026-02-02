import { db } from "../db";
import { exchangeRates, apiServiceStatus } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY;
const FREE_API_BASE = "https://api.frankfurter.app";

interface FrankfurterResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export class ExchangeRateFetcher {
  private apiKey: string;

  constructor() {
    this.apiKey = EXCHANGE_RATE_API_KEY || "";
  }

  isConfigured(): boolean {
    return true;
  }

  private async updateApiStatus(success: boolean, errorMessage?: string) {
    try {
      await db
        .update(apiServiceStatus)
        .set({
          lastCallAt: new Date(),
          lastSuccessAt: success ? new Date() : undefined,
          lastErrorAt: success ? undefined : new Date(),
          lastErrorMessage: errorMessage || null,
          isConfigured: true,
        })
        .where(eq(apiServiceStatus.serviceName, "exchange_rate"));
    } catch (e) {
      console.error("Failed to update API status:", e);
    }
  }

  async fetchRates(baseCurrency: string = "KRW"): Promise<Record<string, number>> {
    try {
      const response = await fetch(`${FREE_API_BASE}/latest?from=${baseCurrency}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: FrankfurterResponse = await response.json();
      await this.updateApiStatus(true);
      
      const rates = { [baseCurrency]: 1, ...data.rates };
      return rates;
    } catch (error) {
      console.error("Failed to fetch exchange rates:", error);
      await this.updateApiStatus(false, String(error));
      throw error;
    }
  }

  async syncExchangeRates(baseCurrency: string = "KRW"): Promise<{ synced: number; baseCurrency: string }> {
    const rates = await this.fetchRates(baseCurrency);
    
    let synced = 0;
    const now = new Date();

    for (const [targetCurrency, rate] of Object.entries(rates)) {
      try {
        const existing = await db
          .select()
          .from(exchangeRates)
          .where(and(
            eq(exchangeRates.baseCurrency, baseCurrency),
            eq(exchangeRates.targetCurrency, targetCurrency)
          ))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(exchangeRates)
            .set({
              rate: rate,
              fetchedAt: now,
            })
            .where(eq(exchangeRates.id, existing[0].id));
        } else {
          await db.insert(exchangeRates).values({
            baseCurrency,
            targetCurrency,
            rate,
            fetchedAt: now,
          });
        }
        synced++;
      } catch (error) {
        console.error(`Failed to sync rate for ${targetCurrency}:`, error);
      }
    }

    return { synced, baseCurrency };
  }

  async convert(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    const baseCurrency = "KRW";
    
    const [fromRate] = await db
      .select()
      .from(exchangeRates)
      .where(and(
        eq(exchangeRates.baseCurrency, baseCurrency),
        eq(exchangeRates.targetCurrency, fromCurrency)
      ))
      .limit(1);

    const [toRate] = await db
      .select()
      .from(exchangeRates)
      .where(and(
        eq(exchangeRates.baseCurrency, baseCurrency),
        eq(exchangeRates.targetCurrency, toCurrency)
      ))
      .limit(1);

    if (!fromRate || !toRate) {
      throw new Error(`Exchange rate not found for ${fromCurrency} or ${toCurrency}`);
    }

    const amountInBase = amount / fromRate.rate;
    return amountInBase * toRate.rate;
  }

  async getRatesForDisplay(): Promise<Array<{ currency: string; name: string; rate: number }>> {
    const rates = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.baseCurrency, "KRW"));

    const currencyNames: Record<string, string> = {
      KRW: "대한민국 원",
      USD: "미국 달러",
      EUR: "유로",
      JPY: "일본 엔",
      GBP: "영국 파운드",
      CNY: "중국 위안",
      THB: "태국 바트",
      VND: "베트남 동",
      SGD: "싱가포르 달러",
      HKD: "홍콩 달러",
      AUD: "호주 달러",
      CAD: "캐나다 달러",
      CHF: "스위스 프랑",
      TWD: "대만 달러",
      MYR: "말레이시아 링깃",
      PHP: "필리핀 페소",
      IDR: "인도네시아 루피아",
      INR: "인도 루피",
    };

    return rates.map(r => ({
      currency: r.targetCurrency,
      name: currencyNames[r.targetCurrency] || r.targetCurrency,
      rate: r.rate,
    }));
  }
}

export const exchangeRateFetcher = new ExchangeRateFetcher();
