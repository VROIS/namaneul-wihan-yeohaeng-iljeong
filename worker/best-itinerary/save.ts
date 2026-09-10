// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 여정 행 저장 = 원본 server/itinerary-save.ts + server/storage.ts
//   1,777줄 한 덩어리에서 그대로 잘라낸 것(§0) = 계산·규칙 한 글자도 안 바꿈.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "../../shared/schema";

const { cities } = schema;

type Db = PostgresJsDatabase<typeof schema>;

// ── 여정 행 저장 (원본 server/itinerary-save.ts + server/storage.ts) ─────────

/** 원본 server/itinerary-save.ts:25 styleToPersonaType. */
export const STYLE_TO_PERSONA: Record<string, string> = {
  Luxury: "luxury",
  Premium: "comfort",
  Reasonable: "comfort",
  Economic: "comfort",
  luxury: "luxury",
  comfort: "comfort",
  reasonable: "comfort",
  economic: "comfort",
};

/** 원본 server/city-match.ts:8 matchCityIdByName. */
export async function matchCityIdByName(
  db: Db,
  destination: string | null | undefined,
): Promise<number | null> {
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

/** 여정 한 건을 저장할 모양으로 만든다. */
export async function buildItineraryData(db: Db, body: any) {
  const { verificationResult: _vr, ...rawData } = (body.rawData || {}) as any;
  const { cityId: _fromClient, ...bodyRest } = body || {};
  const matchedCityId = await matchCityIdByName(db, rawData?.destination);
  const perPersonEur = (rawData as any)?.totalCost?.perPersonEur;
  const totalCostEur =
    typeof perPersonEur === "number" && isFinite(perPersonEur)
      ? perPersonEur
      : undefined;
  const truthCols = Object.fromEntries(
    [
      "companionType",
      "companionCount",
      "companionAges",
      "curationFocus",
      "vibes",
      "travelPace",
    ]
      .map((k) => [k, (body as any)[k] ?? (rawData as any)[k]])
      .filter(([, v]) => v != null),
  );
  return {
    ...bodyRest,
    ...truthCols,
    ...(matchedCityId != null ? { cityId: matchedCityId } : {}),
    ...(totalCostEur != null ? { totalCost: totalCostEur } : {}),
    userId: body.userId || "admin",
    startDate: body.startDate ? new Date(body.startDate) : new Date(),
    endDate: body.endDate ? new Date(body.endDate) : new Date(),
    personaType: STYLE_TO_PERSONA[body.travelStyle] || "comfort",
    travelStyle: STYLE_TO_PERSONA[body.travelStyle] || "comfort",
    rawData,
  };
}
