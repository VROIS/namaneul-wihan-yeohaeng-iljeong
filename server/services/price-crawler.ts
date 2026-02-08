import { db } from "../db";
import { placePrices, places, cities } from "../../shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { getSearchTools } from "./gemini-search-limiter";
import { safeParseJSON, safePrice, safeCurrency, safeConfidence, safeString, safeDbOperation } from "./crawler-utils";

const CACHE_DURATION_HOURS = 24;

interface PriceData {
  priceLow?: number;
  priceHigh?: number;
  priceAverage?: number;
  currency: string;
  priceLabel?: string;
  sourceUrl?: string;
  confidenceScore: number;
  rawData?: Record<string, any>;
}

const GEMINI_MODEL = "gemini-3-flash-preview";

async function extractPriceWithGemini(
  placeName: string,
  placeType: string,
  cityName: string,
  priceType: string
): Promise<PriceData | null> {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) { console.error("[Price] Gemini API 키 없음"); return null; }
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    
    let query = "";
    if (priceType === "entrance_fee") {
      query = `${placeName} ${cityName} 입장료 가격 티켓`;
    } else if (priceType === "meal_average") {
      query = `${placeName} ${cityName} 평균 식사 가격`;
    } else if (priceType === "activity") {
      query = `${placeName} ${cityName} 액티비티 투어 가격`;
    }
    
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Search the web and find the current price for: ${query}

Respond in JSON format:
{
  "found": true/false,
  "priceLow": number (in local currency),
  "priceHigh": number (optional, for ranges),
  "currency": "EUR"/"USD"/"KRW"/"JPY" etc,
  "priceLabel": "성인 기준"/"1인 기준" etc,
  "sourceUrl": "URL if found",
  "confidence": 0.0-1.0
}

If no price found, set found: false. Always use the local currency of the destination.`,
      config: {
        tools: getSearchTools("price-crawler"),
      },
    });

    const text = response.text || "";
    const parsed = safeParseJSON<any>(text, "PriceCrawler");
    if (parsed && parsed.found) {
      const priceLow = safePrice(parsed.priceLow);
      const priceHigh = safePrice(parsed.priceHigh);
      return {
        priceLow: priceLow,
        priceHigh: priceHigh,
        priceAverage: priceLow !== null && priceHigh !== null
          ? (priceLow + priceHigh) / 2
          : priceLow,
        currency: safeCurrency(parsed.currency, "KRW"),
        priceLabel: safeString(parsed.priceLabel),
        sourceUrl: safeString(parsed.sourceUrl),
        confidenceScore: safeConfidence(parsed.confidence, 0.5),
        rawData: { extractedText: text.slice(0, 500) },
      };
    }
  } catch (error) {
    console.error("[PriceCrawler] Gemini price extraction error:", error);
  }
  
  return null;
}

async function extractKlookViatorPrice(
  placeName: string,
  cityName: string,
  countryName: string = ""
): Promise<PriceData | null> {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) { console.error("[Price] Gemini API 키 없음"); return null; }
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Search for tour packages on Klook and Viator for: "${placeName}" in ${cityName} ${countryName}

Find:
1. Klook tour prices for this attraction/activity
2. Viator tour prices for this attraction/activity
3. GetYourGuide prices if available

Return JSON:
{
  "found": true/false,
  "klook": {
    "tourName": "투어 이름",
    "priceLow": number,
    "priceHigh": number,
    "currency": "KRW/USD/EUR",
    "url": "klook.com/..."
  },
  "viator": {
    "tourName": "투어 이름",
    "priceLow": number,
    "priceHigh": number,
    "currency": "KRW/USD/EUR",
    "url": "viator.com/..."
  },
  "bestPrice": {
    "source": "klook" or "viator",
    "price": number,
    "currency": "KRW/USD/EUR"
  },
  "confidence": 0.0-1.0
}

Return found: false if no tour packages exist for this place.`,
      config: {
        tools: getSearchTools("price-crawler"),
      },
    });

    const text = response.text || "";
    const parsed = safeParseJSON<any>(text, "PriceCrawler-KlookViator");
    if (parsed && parsed.found) {
      const klookPrice = safePrice(parsed.klook?.priceLow);
      const viatorPrice = safePrice(parsed.viator?.priceLow);
      const bestPrice = safePrice(parsed.bestPrice?.price);
      const finalPrice = klookPrice ?? viatorPrice ?? bestPrice;
      
      if (finalPrice !== null) {
        return {
          priceLow: finalPrice,
          priceHigh: safePrice(parsed.klook?.priceHigh) ?? safePrice(parsed.viator?.priceHigh) ?? finalPrice,
          priceAverage: bestPrice ?? finalPrice,
          currency: safeCurrency(parsed.bestPrice?.currency, "USD"),
          priceLabel: "투어 패키지 (Klook/Viator)",
          sourceUrl: safeString(parsed.klook?.url || parsed.viator?.url),
          confidenceScore: safeConfidence(parsed.confidence, 0.7),
          rawData: { 
            klook: parsed.klook,
            viator: parsed.viator,
            extractedText: text.slice(0, 500) 
          },
        };
      }
    }
  } catch (error) {
    console.error("[PriceCrawler] Klook/Viator extraction error:", error);
  }
  
  return null;
}

async function collectKlookViatorPrice(
  placeId: number,
  cityId: number,
  placeName: string,
  cityName: string,
  countryName: string = ""
): Promise<void> {
  const existingPrice = await db.select()
    .from(placePrices)
    .where(and(
      eq(placePrices.placeId, placeId),
      eq(placePrices.source, "klook_viator"),
      eq(placePrices.priceType, "tour_package"),
      gte(placePrices.fetchedAt, new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000))
    ))
    .limit(1);

  if (existingPrice.length > 0) {
    console.log(`[PriceCrawler] Klook/Viator cache hit for ${placeName}`);
    return;
  }

  const priceData = await extractKlookViatorPrice(placeName, cityName, countryName);
  
  if (priceData) {
    await safeDbOperation(
      () => db.insert(placePrices).values({
        placeId,
        cityId,
        priceType: "tour_package",
        source: "klook_viator",
        priceLow: priceData.priceLow,
        priceHigh: priceData.priceHigh,
        priceAverage: priceData.priceAverage,
        currency: priceData.currency,
        priceLabel: priceData.priceLabel,
        sourceUrl: priceData.sourceUrl,
        confidenceScore: priceData.confidenceScore,
        rawData: priceData.rawData,
        expiresAt: new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000),
      }),
      "PriceCrawler",
      `Klook/Viator ${placeName}`
    );
    
    console.log(`[PriceCrawler] Klook/Viator tour for ${placeName}: ${priceData.priceLow}-${priceData.priceHigh} ${priceData.currency}`);
  }
}

function convertGooglePriceLevel(
  priceLevel: number,
  currency: string = "KRW"
): PriceData {
  const priceRanges: Record<string, Record<number, [number, number]>> = {
    KRW: {
      1: [10000, 20000],
      2: [20000, 40000],
      3: [40000, 80000],
      4: [80000, 200000],
    },
    EUR: {
      1: [10, 20],
      2: [20, 40],
      3: [40, 80],
      4: [80, 200],
    },
    USD: {
      1: [10, 25],
      2: [25, 50],
      3: [50, 100],
      4: [100, 250],
    },
    JPY: {
      1: [1000, 2000],
      2: [2000, 4000],
      3: [4000, 8000],
      4: [8000, 20000],
    },
  };

  const ranges = priceRanges[currency] || priceRanges.KRW;
  const range = ranges[priceLevel] || ranges[2];

  return {
    priceLow: range[0],
    priceHigh: range[1],
    priceAverage: (range[0] + range[1]) / 2,
    currency,
    priceLabel: "1인 기준 식사비",
    confidenceScore: 0.6,
    rawData: { googlePriceLevel: priceLevel },
  };
}

async function collectPriceFromGoogle(
  placeId: number,
  cityId: number,
  priceLevel: number | null,
  currency: string
): Promise<void> {
  if (!priceLevel) return;

  const priceData = convertGooglePriceLevel(priceLevel, currency);
  
  const existingPrice = await db.select()
    .from(placePrices)
    .where(and(
      eq(placePrices.placeId, placeId),
      eq(placePrices.source, "google_places"),
      eq(placePrices.priceType, "meal_average"),
      gte(placePrices.fetchedAt, new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000))
    ))
    .limit(1);

  if (existingPrice.length === 0) {
    await db.insert(placePrices).values({
      placeId,
      cityId,
      priceType: "meal_average",
      source: "google_places",
      priceLow: priceData.priceLow,
      priceHigh: priceData.priceHigh,
      priceAverage: priceData.priceAverage,
      currency: priceData.currency,
      priceLabel: priceData.priceLabel,
      confidenceScore: priceData.confidenceScore,
      rawData: priceData.rawData,
      expiresAt: new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000),
    });
  }
}

async function collectPriceFromGemini(
  placeId: number,
  cityId: number,
  placeName: string,
  placeType: string,
  cityName: string,
  priceType: string
): Promise<void> {
  const existingPrice = await db.select()
    .from(placePrices)
    .where(and(
      eq(placePrices.placeId, placeId),
      eq(placePrices.source, "gemini_search"),
      eq(placePrices.priceType, priceType),
      gte(placePrices.fetchedAt, new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000))
    ))
    .limit(1);

  if (existingPrice.length > 0) {
    console.log(`[PriceCrawler] Cache hit for ${placeName} (${priceType})`);
    return;
  }

  const priceData = await extractPriceWithGemini(placeName, placeType, cityName, priceType);
  
  if (priceData) {
    await db.insert(placePrices).values({
      placeId,
      cityId,
      priceType,
      source: "gemini_search",
      priceLow: priceData.priceLow,
      priceHigh: priceData.priceHigh,
      priceAverage: priceData.priceAverage,
      currency: priceData.currency,
      priceLabel: priceData.priceLabel,
      sourceUrl: priceData.sourceUrl,
      confidenceScore: priceData.confidenceScore,
      rawData: priceData.rawData,
      expiresAt: new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000),
    });
    
    console.log(`[PriceCrawler] Collected ${priceType} for ${placeName}: ${priceData.priceLow}-${priceData.priceHigh} ${priceData.currency}`);
  }
}

export async function crawlPricesForCity(cityId: number): Promise<{ success: boolean; pricesCollected: number }> {
  console.log(`[PriceCrawler] Starting price crawl for city ID: ${cityId}`);
  
  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[PriceCrawler] City not found: ${cityId}`);
    return { success: false, pricesCollected: 0 };
  }

  const cityPlaces = await db.select().from(places).where(eq(places.cityId, cityId));
  let pricesCollected = 0;

  for (const place of cityPlaces) {
    try {
      if (place.priceLevel) {
        await collectPriceFromGoogle(place.id, cityId, place.priceLevel, "EUR");
        pricesCollected++;
      }

      if (place.type === "attraction" || place.type === "landmark") {
        await collectPriceFromGemini(
          place.id, cityId, place.name, place.type, city.name, "entrance_fee"
        );
        pricesCollected++;
        
        await collectKlookViatorPrice(
          place.id, cityId, place.name, city.name, city.country || ""
        );
        pricesCollected++;
      } else if (place.type === "restaurant" || place.type === "cafe") {
        await collectPriceFromGemini(
          place.id, cityId, place.name, place.type, city.name, "meal_average"
        );
        pricesCollected++;
      } else if (place.type === "activity" || place.type === "tour") {
        await collectKlookViatorPrice(
          place.id, cityId, place.name, city.name, city.country || ""
        );
        pricesCollected++;
      }

      await new Promise(r => setTimeout(r, 800));
    } catch (error) {
      console.error(`[PriceCrawler] Error collecting price for ${place.name}:`, error);
    }
  }

  console.log(`[PriceCrawler] Collected ${pricesCollected} prices for ${city.name}`);
  return { success: true, pricesCollected };
}

export async function crawlAllPrices(): Promise<{ success: boolean; totalPrices: number }> {
  console.log("[PriceCrawler] Starting full price crawl...");
  
  const allCities = await db.select().from(cities);
  let totalPrices = 0;

  for (const city of allCities) {
    const result = await crawlPricesForCity(city.id);
    totalPrices += result.pricesCollected;
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[PriceCrawler] Full crawl complete. Total prices: ${totalPrices}`);
  return { success: true, totalPrices };
}

export async function getPlacePrices(placeId: number): Promise<{
  prices: Array<{
    priceType: string;
    source: string;
    priceLow: number | null;
    priceHigh: number | null;
    priceAverage: number | null;
    currency: string;
    confidenceScore: number | null;
    fetchedAt: Date;
  }>;
  crossVerified: {
    entranceFee?: { average: number; currency: string; sources: number };
    mealAverage?: { average: number; currency: string; sources: number };
  };
}> {
  const prices = await db.select()
    .from(placePrices)
    .where(eq(placePrices.placeId, placeId))
    .orderBy(desc(placePrices.fetchedAt));

  const entranceFees = prices.filter(p => p.priceType === "entrance_fee" && p.priceAverage);
  const mealPrices = prices.filter(p => p.priceType === "meal_average" && p.priceAverage);

  const crossVerified: any = {};

  if (entranceFees.length > 0) {
    const avgPrice = entranceFees.reduce((sum, p) => sum + (p.priceAverage || 0), 0) / entranceFees.length;
    crossVerified.entranceFee = {
      average: Math.round(avgPrice * 100) / 100,
      currency: entranceFees[0].currency,
      sources: entranceFees.length,
    };
  }

  if (mealPrices.length > 0) {
    const avgPrice = mealPrices.reduce((sum, p) => sum + (p.priceAverage || 0), 0) / mealPrices.length;
    crossVerified.mealAverage = {
      average: Math.round(avgPrice * 100) / 100,
      currency: mealPrices[0].currency,
      sources: mealPrices.length,
    };
  }

  return {
    prices: prices.map(p => ({
      priceType: p.priceType,
      source: p.source,
      priceLow: p.priceLow,
      priceHigh: p.priceHigh,
      priceAverage: p.priceAverage,
      currency: p.currency,
      confidenceScore: p.confidenceScore,
      fetchedAt: p.fetchedAt,
    })),
    crossVerified,
  };
}

export async function getPriceStats(): Promise<{
  total: number;
  bySource: Record<string, number>;
  byType: Record<string, number>;
}> {
  const allPrices = await db.select().from(placePrices);
  
  const bySource: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const price of allPrices) {
    bySource[price.source] = (bySource[price.source] || 0) + 1;
    byType[price.priceType] = (byType[price.priceType] || 0) + 1;
  }

  return {
    total: allPrices.length,
    bySource,
    byType,
  };
}
