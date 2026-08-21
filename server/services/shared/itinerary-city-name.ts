// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 저장된 여정을 **읽을 때** 도시 영문명을 붙이는 1벌(§16).
//
// 왜 저장이 아니라 조회인가(어제 슬롯 지명과 같은 원칙):
//   슬롯 지명은 저장된 값 3개(nameEn/nameLocal/name) 중 **화면이 표시 순간에 고르는** 구조라
//   8/19 에 만든 옛 여정도 다시 열면 바로 영어로 나온다(#339 실측).
//   도시명은 여정 안에 영문명이 저장돼 있지 않아 그대로는 고를 수가 없다 — 대신 여정 행에
//   city_id 가 있고(#339 = 114) cities.name_en 이 121개 도시 전부 있으므로(결측 0),
//   **읽을 때 이어붙이면** 이미 저장된 여정 307건(그중 한국어 109건)도 전부 영어가 된다.
//   생성 시점에 찍어 넣는 방식은 신규만 고쳐지고 옛 여정은 영원히 한국어로 남아 폐기 = 2026-08-21 §19.
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { cities, itineraries } from "@shared/schema";

/** 여정 1건에 rawData.destinationEn(도시 영문명)을 이어붙여 돌려준다. */
export async function attachCityNameEn<T extends Record<string, any>>(
  itinerary: T | null | undefined,
): Promise<T | null | undefined> {
  if (!itinerary) return itinerary;
  const [one] = await attachCityNameEnMany([itinerary]);
  return one;
}

/**
 * 전문가 문의 목록 = itinerary_data 스냅샷 안의 destination 을 도시 영문명으로 갈아끼운다.
 *   스냅샷에는 city_id 가 없지만 문의 행에 itinerary_id(FK)가 있어 여정 → city_id → cities.name_en 으로 잇는다.
 *   저장값은 건드리지 않고 **읽을 때만** 조립 = 이미 쌓인 문의(실측 17건 중 5건이 한국어)도 즉시 영어 표기.
 */
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

/** 여정 여러 건 = 도시 조회 1번으로 한꺼번에(목록 라우트가 N+1 이 되지 않게). */
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
    // rawData 가 없거나 이미 값이 있으면 그대로 둔다(덮어쓰지 않음).
    if (!nameEn || !it?.rawData || typeof it.rawData !== "object") return it;
    return {
      ...it,
      rawData: { ...(it.rawData as object), destinationEn: nameEn },
    };
  });
}
