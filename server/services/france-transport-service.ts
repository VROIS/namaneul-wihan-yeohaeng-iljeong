import * as fs from "fs";
import * as path from "path";

interface TransportPrice {
  id: string;
  name: string;
  vehicle: string | null;
  priceLow: number;
  priceHigh: number;
  currency?: string;
  unit: string;
  features: string[];
  guideVerified: boolean;
}

interface RideshareComparison {
  id: string;
  category: string;
  service: string;
  guideService: {
    priceLow: number;
    priceHigh: number;
    priceType: string;
    vehicle?: string;
    features?: string[];
  };
  rideshare: {
    priceLow: number | null;
    priceHigh: number | null;
    priceType: string;
    apps?: string[];
    surgeMultiplier?: number;
  };
  comparison: string;
  guideRecommendation: string;
}

interface FranceTransportData {
  version: string;
  lastUpdated: string;
  validUntil: string;
  currency: string;
  source: string;
  notes: Record<string, string>;
  guideServices: {
    airportTransfer: TransportPrice[];
    vehicleCharter: TransportPrice[];
    busCharter: TransportPrice[];
    longDistance: TransportPrice[];
    guideServices: TransportPrice[];
  };
  rideshareComparison: RideshareComparison[];
}

let cachedData: FranceTransportData | null = null;

function loadTransportData(): FranceTransportData {
  if (cachedData) return cachedData;

  const dataPath = path.join(__dirname, "../data/france-transport-prices-2026.json");
  const rawData = fs.readFileSync(dataPath, "utf-8");
  cachedData = JSON.parse(rawData);
  return cachedData!;
}

export function getTransportPrices(): FranceTransportData {
  return loadTransportData();
}

export function getAirportTransferPrices(): TransportPrice[] {
  return loadTransportData().guideServices.airportTransfer;
}

export function getVehicleCharterPrices(): TransportPrice[] {
  return loadTransportData().guideServices.vehicleCharter;
}

export function getBusCharterPrices(): TransportPrice[] {
  return loadTransportData().guideServices.busCharter;
}

export function getLongDistancePrices(): TransportPrice[] {
  return loadTransportData().guideServices.longDistance;
}

export function getGuideServicePrices(): TransportPrice[] {
  return loadTransportData().guideServices.guideServices;
}

export function getRideshareComparison(): RideshareComparison[] {
  return loadTransportData().rideshareComparison;
}

export function getPriceById(priceId: string): TransportPrice | null {
  const data = loadTransportData();
  const allPrices = [
    ...data.guideServices.airportTransfer,
    ...data.guideServices.vehicleCharter,
    ...data.guideServices.busCharter,
    ...data.guideServices.longDistance,
    ...data.guideServices.guideServices,
  ];
  return allPrices.find(p => p.id === priceId) || null;
}

export function getComparisonByCategory(category: string): RideshareComparison | null {
  const comparisons = loadTransportData().rideshareComparison;
  return comparisons.find(c => c.category === category || c.id === category) || null;
}

export function calculateTransportCost(options: {
  serviceType: "airport" | "charter" | "bus" | "longDistance" | "guide";
  serviceId: string;
  passengers?: number;
  days?: number;
  premium?: boolean;
}): {
  guideServiceCost: { low: number; high: number };
  rideshareCost?: { low: number; high: number; warning?: string };
  recommendation: string;
  currency: string;
} {
  const price = getPriceById(options.serviceId);
  if (!price) {
    return {
      guideServiceCost: { low: 0, high: 0 },
      recommendation: "서비스를 찾을 수 없습니다",
      currency: "EUR",
    };
  }

  const multiplier = options.days || 1;
  const guideServiceCost = {
    low: price.priceLow * multiplier,
    high: price.priceHigh * multiplier,
  };

  const comparison = loadTransportData().rideshareComparison.find(c => 
    c.guideService.priceLow === price.priceLow || 
    c.service.includes(price.name.split(" - ")[0])
  );

  let rideshareCost;
  if (comparison && comparison.rideshare.priceLow !== null) {
    rideshareCost = {
      low: comparison.rideshare.priceLow * multiplier,
      high: (comparison.rideshare.priceHigh || comparison.rideshare.priceLow) * multiplier,
      warning: comparison.rideshare.surgeMultiplier 
        ? `피크타임 ${comparison.rideshare.surgeMultiplier}배 폭등 가능`
        : undefined,
    };
  }

  return {
    guideServiceCost,
    rideshareCost,
    recommendation: comparison?.guideRecommendation || "가이드 검증 서비스",
    currency: price.currency || "EUR",
  };
}

export function getItineraryTransportSuggestion(params: {
  fromType: "airport" | "hotel" | "attraction";
  toType: "airport" | "hotel" | "attraction";
  passengers: number;
  budget: "economy" | "standard" | "premium" | "luxury";
  timeMinutes?: number;
}): {
  recommended: TransportPrice;
  alternatives: TransportPrice[];
  comparison: RideshareComparison | null;
  estimatedCost: { low: number; high: number };
} {
  const data = loadTransportData();
  let recommended: TransportPrice;
  let alternatives: TransportPrice[] = [];

  if (params.fromType === "airport" || params.toType === "airport") {
    const airportOptions = data.guideServices.airportTransfer;
    
    if (params.budget === "luxury") {
      recommended = airportOptions.find(p => p.id === "cdg_luxury_sedan")!;
      alternatives = airportOptions.filter(p => p.id.includes("business"));
    } else if (params.budget === "premium") {
      recommended = airportOptions.find(p => p.id === "cdg_business_sedan")!;
      alternatives = [
        airportOptions.find(p => p.id === "cdg_luxury_sedan")!,
        airportOptions.find(p => p.id === "cdg_private_van")!,
      ].filter(Boolean);
    } else if (params.passengers > 4) {
      recommended = airportOptions.find(p => p.id === "cdg_private_van")!;
      alternatives = airportOptions.filter(p => p.id.includes("business"));
    } else {
      recommended = airportOptions.find(p => p.id === "cdg_taxi")!;
      alternatives = airportOptions.filter(p => p.id.includes("business") || p.id.includes("shuttle"));
    }
  } else {
    const charterOptions = data.guideServices.vehicleCharter;
    
    if (params.budget === "luxury") {
      recommended = charterOptions.find(p => p.id === "full_day_luxury_van")!;
    } else if (params.budget === "premium") {
      recommended = charterOptions.find(p => p.id === "full_day_premium")!;
    } else {
      recommended = charterOptions.find(p => p.id === "half_day_sedan")!;
    }
    
    alternatives = charterOptions.filter(p => p.id !== recommended?.id).slice(0, 3);
  }

  const comparison = data.rideshareComparison.find(c => 
    (params.fromType === "airport" && c.category === "공항 이동") ||
    c.category === "단거리 투어"
  ) || null;

  return {
    recommended: recommended!,
    alternatives,
    comparison,
    estimatedCost: {
      low: recommended?.priceLow || 0,
      high: recommended?.priceHigh || 0,
    },
  };
}

export function getDataVersion(): {
  version: string;
  lastUpdated: string;
  validUntil: string;
  source: string;
} {
  const data = loadTransportData();
  return {
    version: data.version,
    lastUpdated: data.lastUpdated,
    validUntil: data.validUntil,
    source: data.source,
  };
}

export function clearCache(): void {
  cachedData = null;
}
