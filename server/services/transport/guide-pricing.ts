import { db } from "../../db";
import { guidePrices } from "../../../shared/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_PRICES, COMPANION_TO_TRANSPORT } from "./constants";
import type {
  TransportType,
  MobilityStyle,
  TravelStyle,
  CompanionType,
} from "./constants";

export function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/** ⚠️ 2026-07-04 사장님 SSOT = 드라이빙 가이드 판별 = 아래 4가지 중 하나라도 = 무조건 가이드(사장님 본업 퍼널). */
export function shouldApplyGuidePrice(
  mobilityStyle: MobilityStyle,
  travelStyle: TravelStyle,
): boolean {
  const ms = (mobilityStyle || "").toLowerCase();
  const ts = (travelStyle || "").toLowerCase();
  return (
    ms === "minimal" || ms === "moderate" || ts === "premium" || ts === "luxury"
  );
}

async function getGuidePriceFromDB(serviceType: TransportType): Promise<{
  basePrice4h: number;
  pricePerHour: number;
} | null> {
  try {
    const [priceData] = await db
      .select()
      .from(guidePrices)
      .where(eq(guidePrices.serviceType, serviceType))
      .limit(1);
    if (!priceData) return null;
    return {
      basePrice4h:
        priceData.basePrice4h || DEFAULT_PRICES[serviceType].basePrice4h,
      pricePerHour:
        priceData.pricePerHour || DEFAULT_PRICES[serviceType].pricePerHour,
    };
  } catch (error) {
    console.warn(
      `[Transport] DB 조회 실패, 기본값 사용: ${serviceType}`,
      error,
    );
    return null;
  }
}

export async function calculateGuideDailyPrice(
  transportType: TransportType,
  availableHours: number = 8,
  isRegionalTravel: boolean = false,
): Promise<{
  dailyVehiclePrice: number;
  priceConfig: { basePrice4h: number; pricePerHour: number };
}> {
  const dbPrice = await getGuidePriceFromDB(transportType);
  const priceConfig = dbPrice || DEFAULT_PRICES[transportType];

  const effectiveHours = Math.max(availableHours, 4);
  const additionalHours = Math.max(0, effectiveHours - 4);

  let dailyVehiclePrice = round2(
    priceConfig.basePrice4h + additionalHours * priceConfig.pricePerHour,
  );

  if (isRegionalTravel) {
    dailyVehiclePrice = round2(dailyVehiclePrice * 1.5);
  }

  return { dailyVehiclePrice, priceConfig };
}

export async function getGuidePerPersonPerDay(
  companionType: CompanionType,
  companionCount: number,
  availableHours: number = 8,
  isRegionalTravel: boolean = false,
): Promise<{
  perPersonPerDay: number;
  dailyVehiclePrice: number;
  vehicleType: TransportType;
  vehicleDescription: string;
}> {
  const config = COMPANION_TO_TRANSPORT[companionType];
  const transportType = config.transportType;

  const { dailyVehiclePrice } = await calculateGuideDailyPrice(
    transportType,
    availableHours,
    isRegionalTravel,
  );
  const perPersonPerDay = round2(dailyVehiclePrice / companionCount);

  const vehicleDescription =
    transportType === "sedan"
      ? "전용 세단 (1-4인)"
      : transportType === "van"
        ? "전용 밴 (5-7인)"
        : transportType === "minibus"
          ? "전용 미니버스 (8인+)"
          : "가이드 서비스";

  return {
    perPersonPerDay,
    dailyVehiclePrice,
    vehicleType: transportType,
    vehicleDescription,
  };
}
