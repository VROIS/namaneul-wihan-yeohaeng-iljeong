// ⚠️ 수정금지(승인필요) 2026-08-02 사장님 SSOT = **도시 id 잇기 단일 관문**(§16 재발명 금지).

import { db } from "./db";
import { cities } from "../shared/schema";
import { sql } from "drizzle-orm";

/** ⚠️ 2026-08-02 사장님 승인 = 사용자가 "파리, 프랑스" 처럼 **나라를 붙여 입력**한 경우도 도시로 잡는다. */
export async function matchCityIdByName(
  destination: string | null | undefined,
): Promise<number | null> {
  if (!db) return null;
  const dest = String(destination || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!dest) return null;
  const rows = await db
    .select({ id: cities.id })
    .from(cities)
    .where(
      sql`LOWER(TRIM(${cities.nameEn})) = ${dest}
          OR LOWER(TRIM(${cities.name})) = ${dest}
          OR LOWER(TRIM(${cities.nameLocal})) = ${dest}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${cities.aliases}) AS alias
            WHERE LOWER(TRIM(alias)) = ${dest}
          )`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function nearestCityIdByCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Promise<number | null> {
  if (!db) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rows = await db
    .select({ id: cities.id })
    .from(cities)
    .orderBy(
      sql`6371 * acos(LEAST(1, cos(radians(${lat})) * cos(radians(${cities.latitude}))
            * cos(radians(${cities.longitude}) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(${cities.latitude}))))`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}
