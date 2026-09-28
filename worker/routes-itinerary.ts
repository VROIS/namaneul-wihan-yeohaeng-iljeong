import type { Express } from "express";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../shared/schema";
import { getRoleFromDb, getUserIdFromReq } from "./auth-user";
import { buildItineraryData, matchCityIdByName } from "./best-itinerary/save";
import { applyItineraryTranslations } from "./best-itinerary/translate";
import { LANGS } from "./lib/services/shared/language-instruction";
import { computeItineraryFingerprint } from "./itinerary-fingerprint";

export type WorkerDb = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: WorkerDb; close: () => void };

type WithCityId = Record<string, unknown>;

async function attachCityNameEnMany<T extends WithCityId>(
  db: WorkerDb,
  list: T[],
): Promise<T[]> {
  if (!Array.isArray(list) || list.length === 0) return list;

  const cityIds = Array.from(
    new Set(
      list
        .map((it) => Number(it?.cityId))
        .filter((n): n is number => Number.isFinite(n) && n > 0),
    ),
  );
  if (cityIds.length === 0) return list;

  const rows = await db
    .select({ id: schema.cities.id, nameEn: schema.cities.nameEn })
    .from(schema.cities)
    .where(inArray(schema.cities.id, cityIds));
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

async function attachCityNameEn<T extends WithCityId>(
  db: WorkerDb,
  itinerary: T | null | undefined,
): Promise<T | null | undefined> {
  if (!itinerary) return itinerary;
  const [one] = await attachCityNameEnMany(db, [itinerary]);
  return one;
}

type ItineraryBody = Record<string, unknown>;
// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 여정 행 변환 = best-itinerary/save.ts buildItineraryData 1벌, AI 의견 결과 박제만 이 라우트가 먼저 한다 (정본 9-28)
function withVerification(body: ItineraryBody): ItineraryBody {
  const { verificationResult: vr, ...rawData } = (body.rawData ||
    {}) as ItineraryBody & {
    verificationResult?: { result?: unknown; language?: string };
  };
  if (vr?.result) {
    const fp = `${computeItineraryFingerprint(rawData)}:${vr.language || "ko"}`;
    rawData.verification = {
      fp,
      result: vr.result,
      generatedAt: new Date().toISOString(),
    };
  }
  return { ...body, rawData };
}

// ⚠️ 화면 목록에서 빼는 상태 1벌(두 목록이 같은 기준).
const HIDDEN_STATUSES = ["inquiry", "generating", "failed"];

function errMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function registerItineraryRoutes(app: Express, openDb: OpenDb): void {
  // PATCH /api/users/:userId/preferred-language
  app.patch("/api/users/:userId/preferred-language", async (req, res) => {
    const { db, close } = openDb();
    try {
      const userId = String(req.params.userId);
      const { preferredLanguage } = req.body;
      if (
        !userId ||
        !preferredLanguage ||
        typeof preferredLanguage !== "string"
      ) {
        return res
          .status(400)
          .json({ error: "userId and preferredLanguage required" });
      }
      if (!(LANGS as readonly string[]).includes(preferredLanguage)) {
        return res.status(400).json({ error: "Invalid preferredLanguage" });
      }
      const [updated] = await db
        .update(schema.users)
        .set({ preferredLanguage })
        .where(eq(schema.users.id, userId))
        .returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({ success: true, preferredLanguage: updated.preferredLanguage });
    } catch (error) {
      console.error("Error updating preferred language:", error);
      res.status(500).json({ error: "Failed to update language" });
    } finally {
      close();
    }
  });

  // GET /api/users/:userId/itineraries
  //   ⚠️ 관리자(Bearer 토큰 role) = 전체 상황판 = 전 사용자 저장 여정.
  app.get("/api/users/:userId/itineraries", async (req, res) => {
    const { db, close } = openDb();
    try {
      const authId = getUserIdFromReq(req);
      const isAdmin = authId
        ? (await getRoleFromDb(db, authId)) === "admin"
        : false;
      const rows = isAdmin
        ? await db
            .select()
            .from(schema.itineraries)
            .where(notInArray(schema.itineraries.status, HIDDEN_STATUSES))
            .orderBy(desc(schema.itineraries.createdAt))
        : await db
            .select()
            .from(schema.itineraries)
            .where(
              and(
                eq(schema.itineraries.userId, String(req.params.userId)),
                notInArray(schema.itineraries.status, HIDDEN_STATUSES),
              ),
            )
            .orderBy(desc(schema.itineraries.createdAt));
      res.json(await attachCityNameEnMany(db, rows));
    } catch (error) {
      console.error("Error fetching itineraries:", error);
      res.status(500).json({ error: "Failed to fetch itineraries" });
    } finally {
      close();
    }
  });

  // GET /api/itineraries/:id
  app.get("/api/itineraries/:id", async (req, res) => {
    const { db, close } = openDb();
    try {
      const [itinerary] = await db
        .select()
        .from(schema.itineraries)
        .where(eq(schema.itineraries.id, parseInt(String(req.params.id))));
      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      const out = await attachCityNameEn(db, itinerary);
      // ⚠️ 화면 언어(?lang=)로 슬롯 해설을 place_translations 캐시에서 이어붙임.
      const lang = String(req.query.lang || "ko");
      const rawData = out?.rawData as Record<string, unknown> | undefined;
      if (rawData?.days && out) {
        out.rawData = await applyItineraryTranslations(db, rawData, lang);
      }
      res.json(out);
    } catch (error) {
      console.error("Error fetching itinerary:", error);
      res.status(500).json({ error: "Failed to fetch itinerary" });
    } finally {
      close();
    }
  });

  // POST /api/itineraries
  app.post("/api/itineraries", async (req, res) => {
    const { db, close } = openDb();
    try {
      const itineraryData = await buildItineraryData(
        db,
        withVerification(req.body),
      );
      console.log(
        `[Itinerary] Creating itinerary for user=${itineraryData.userId}...`,
      );
      const [itinerary] = await db
        .insert(schema.itineraries)
        .values(itineraryData)
        .returning();
      console.log(`[Itinerary] Created successfully: id=${itinerary.id}`);
      res.status(201).json(itinerary);
    } catch (error) {
      console.error("Error creating itinerary:", errMessage(error) || error);
      console.error("Stack:", (error as Error)?.stack);
      res.status(500).json({
        error: "Failed to create itinerary",
        details: errMessage(error),
      });
    } finally {
      close();
    }
  });

  // PUT /api/itineraries/:id
  app.put("/api/itineraries/:id", async (req, res) => {
    const { db, close } = openDb();
    try {
      const id = parseInt(String(req.params.id));
      const itineraryData = await buildItineraryData(
        db,
        withVerification(req.body),
      );

      console.log(`[Itinerary] Updating id=${id} (재저장 덮어쓰기)...`);
      const [updated] = await db
        .update(schema.itineraries)
        .set({ ...itineraryData, updatedAt: new Date() })
        .where(eq(schema.itineraries.id, id))
        .returning();
      if (!updated) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      console.log(`[Itinerary] Updated successfully: id=${updated.id}`);
      res.json(updated);
    } catch (error) {
      console.error("Error updating itinerary:", errMessage(error) || error);
      res.status(500).json({
        error: "Failed to update itinerary",
        details: errMessage(error),
      });
    } finally {
      close();
    }
  });

  // POST /api/itineraries/:id/representative
  app.post("/api/itineraries/:id/representative", async (req, res) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      const role = userId ? await getRoleFromDb(db, userId) : "user";
      if (role !== "admin") {
        return res.status(403).json({ error: "관리자만 대표 지정 가능" });
      }

      const id = parseInt(String(req.params.id));
      if (Number.isNaN(id)) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      const [itinerary] = await db
        .select()
        .from(schema.itineraries)
        .where(eq(schema.itineraries.id, id));
      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }

      const cityId = await matchCityIdByName(
        db,
        (itinerary.rawData as { destination?: string } | null)?.destination,
      );
      if (cityId == null) {
        return res.status(400).json({ error: "도시 매칭 실패" });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(schema.itineraries)
          .set({ status: "saved", updatedAt: new Date() })
          .where(
            and(
              eq(schema.itineraries.cityId, cityId),
              eq(schema.itineraries.status, "representative"),
            ),
          );
        await tx
          .update(schema.itineraries)
          .set({
            status: "representative",
            cityId,
            updatedAt: new Date(),
          })
          .where(eq(schema.itineraries.id, id));
      });

      console.log(`[Representative] 대표 지정: itinerary=${id} city=${cityId}`);
      res.json({ itineraryId: id, cityId });
    } catch (error) {
      console.error(
        "[Representative] 대표 지정 실패:",
        errMessage(error) || error,
      );
      res.status(500).json({ error: "Failed to set representative" });
    } finally {
      close();
    }
  });
}
