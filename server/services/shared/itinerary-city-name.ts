// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 저장된 여정을 **읽을 때** 도시 영문명을 붙이는 1벌(§16).
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { cities, itineraries } from "@shared/schema";

export async function attachCityNameEn<T extends Record<string, any>>(
  itinerary: T | null | undefined,
): Promise<T | null | undefined> {
  if (!itinerary) return itinerary;
  const [one] = await attachCityNameEnMany([itinerary]);
  return one;
}

export async function attachInquiryCityNameEn<T extends Record<string, any>>(
  rows: T[],
): Promise<T[]> {
  if (!db || !Array.isArray(rows) || rows.length === 0) return rows;

  const itinIds = Array.from(
    new Set(
      rows
        .map((r) => Number(r?.itineraryId))
        .filter((n): n is number => Number.isFinite(n) && n > 0),
    ),
  );
  if (itinIds.length === 0) return rows;

  const joined = await db
    .select({ itinId: itineraries.id, nameEn: cities.nameEn })
    .from(itineraries)
    .leftJoin(cities, eq(cities.id, itineraries.cityId))
    .where(inArray(itineraries.id, itinIds));
  const nameByItin = new Map(joined.map((r) => [r.itinId, r.nameEn]));

  return rows.map((r) => {
    const nameEn = nameByItin.get(Number(r?.itineraryId));
    if (!nameEn || !r?.itineraryData || typeof r.itineraryData !== "object")
      return r;
    return {
      ...r,
      itineraryData: { ...(r.itineraryData as object), destination: nameEn },
    };
  });
}

export async function attachCityNameEnMany<T extends Record<string, any>>(
  list: T[],
): Promise<T[]> {
  if (!db || !Array.isArray(list) || list.length === 0) return list;

  const cityIds = Array.from(
    new Set(
      list
        .map((it) => Number(it?.cityId))
        .filter((n): n is number => Number.isFinite(n) && n > 0),
    ),
  );
  if (cityIds.length === 0) return list;

  const rows = await db
    .select({ id: cities.id, nameEn: cities.nameEn })
    .from(cities)
    .where(inArray(cities.id, cityIds));
  const nameById = new Map(rows.map((r) => [r.id, r.nameEn]));

  return list.map((it) => {
    const nameEn = nameById.get(Number(it?.cityId));
    if (!nameEn || !it?.rawData || typeof it.rawData !== "object") return it;
    return {
      ...it,
      rawData: { ...(it.rawData as object), destinationEn: nameEn },
    };
  });
}
