// 여정 라우트 (Cloudflare Worker) — 2026-09-06
// 원본 = server/itinerary-routes.ts. 동작·응답·상태코드·에러문구를 그대로 옮긴다.
// 원본이 쓰는 storage/db 헬퍼는 server/db.ts(pg 드라이버)를 물고 있어 Worker 번들이 안 된다
//   = 그 DB 조회 부분만 Hyperdrive drizzle 로 다시 배선하고, 쿼리(정렬·필터)는 원본과 같은 식으로 쓴다.
import { createHash } from "node:crypto";
import type { Express, Request } from "express";
import { and, desc, eq, inArray, notInArray, sql as dsql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../shared/schema";

export type WorkerDb = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: WorkerDb; close: () => void };

// ⚠️ 원본 server/services/shared/language-instruction.ts:4 = 7개 언어 목록 1벌.
const LANGS = ["ko", "en", "ja", "fr", "zh", "es", "de"] as const;

// ── 원본 server/auth-user.ts:9 getUserIdFromReq = Bearer 토큰 → userId.
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

// ── 원본 server/auth-user.ts:16 getRoleFromDb = creditService.getUserProfile(server/creditService.ts:30) 의 role.
async function getRoleFromDb(db: WorkerDb, userId: string): Promise<string> {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.role || "user";
}

// ── 원본 server/city-match.ts:7 matchCityIdByName = 도시 id 잇기 1벌(쿼리 그대로).
async function matchCityIdByName(
  db: WorkerDb,
  destination: string | null | undefined,
): Promise<number | null> {
  const dest = String(destination || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!dest) return null;
  const rows = await db
    .select({ id: schema.cities.id })
    .from(schema.cities)
    .where(
      dsql`LOWER(TRIM(${schema.cities.nameEn})) = ${dest}
          OR LOWER(TRIM(${schema.cities.name})) = ${dest}
          OR LOWER(TRIM(${schema.cities.nameLocal})) = ${dest}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${schema.cities.aliases}) AS alias
            WHERE LOWER(TRIM(alias)) = ${dest}
          )`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

// ── 원본 server/services/shared/itinerary-city-name.ts:44 attachCityNameEnMany.
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

// ── 원본 server/services/shared/itinerary-city-name.ts:5 attachCityNameEn.
async function attachCityNameEn<T extends WithCityId>(
  db: WorkerDb,
  itinerary: T | null | undefined,
): Promise<T | null | undefined> {
  if (!itinerary) return itinerary;
  const [one] = await attachCityNameEnMany(db, [itinerary]);
  return one;
}

// ── 원본 server/services/shared/place-translation.ts:55 readCachedPlaceTranslations.
interface PlaceTranslationResult {
  summary: string | null;
  editorialSummary: string | null;
}

async function readCachedPlaceTranslations(
  db: WorkerDb,
  ids: number[],
  language: string,
): Promise<Map<number, PlaceTranslationResult>> {
  const result = new Map<number, PlaceTranslationResult>();
  if (ids.length === 0) return result;
  const cached = await db
    .select()
    .from(schema.placeTranslations)
    .where(
      and(
        inArray(schema.placeTranslations.placeId, ids),
        eq(schema.placeTranslations.language, language),
      ),
    );
  for (const c of cached) {
    result.set(c.placeId, {
      summary: c.summary,
      editorialSummary: c.editorialSummary,
    });
  }
  return result;
}

// ── 원본 server/services/shared/place-translation.ts:78 applyItineraryTranslations.
//    원본 주석 그대로 = 여기서 제미니 번역 호출 없음(사장님 2026-08-27 = 끔) = 캐시 읽기 2회뿐 = 외부호출 0.
type ItinerarySlot = Record<string, unknown>;
type ItineraryDay = Record<string, unknown>;

async function applyItineraryTranslations<T extends Record<string, unknown>>(
  db: WorkerDb,
  itinerary: T,
  language: string,
): Promise<T> {
  if (
    !itinerary ||
    language === "ko" ||
    !(LANGS as readonly string[]).includes(language)
  )
    return itinerary;
  const days: ItineraryDay[] = Array.isArray(itinerary.days)
    ? (itinerary.days as ItineraryDay[])
    : [];
  const psrIdOf = (slot: ItinerarySlot): number | null => {
    const m = /^db-(\d+)$/.exec(String(slot?.id ?? ""));
    return m ? Number(m[1]) : null;
  };
  const ids = new Set<number>();
  for (const d of days)
    for (const s of Array.isArray(d?.places)
      ? (d.places as ItinerarySlot[])
      : []) {
      const id = psrIdOf(s);
      if (id != null) ids.add(id);
    }
  if (ids.size === 0) return itinerary;

  // ① 요청 언어 1회 읽기.
  const primary = await readCachedPlaceTranslations(db, [...ids], language);
  // ② 영어(en) 1회 읽기 = language!=="en" 이고 ①에서 두 필드가 다 안 채워진 id 만.
  const enIds =
    language === "en"
      ? []
      : [...ids].filter((id) => {
          const t = primary.get(id);
          return !t || !t.editorialSummary || !t.summary;
        });
  const fallbackEn =
    enIds.length > 0
      ? await readCachedPlaceTranslations(db, enIds, "en")
      : new Map<number, PlaceTranslationResult>();
  if (primary.size === 0 && fallbackEn.size === 0) return itinerary;

  return {
    ...itinerary,
    days: days.map((d) => {
      if (!Array.isArray(d?.places)) return d;
      return {
        ...d,
        places: (d.places as ItinerarySlot[]).map((s) => {
          const id = psrIdOf(s);
          const t = id != null ? primary.get(id) : undefined;
          const e = id != null ? fallbackEn.get(id) : undefined;
          if (!t && !e) return s;
          // 필드마다 ① 요청 언어 → ② en → ③ 슬롯 원문 유지(빈 값은 다음 단계로).
          const editorialSummary = t?.editorialSummary || e?.editorialSummary;
          const summary = t?.summary || e?.summary;
          return {
            ...s,
            ...(editorialSummary ? { editorialSummary } : {}),
            ...(summary ? { summaryKo: summary } : {}),
          };
        }),
      };
    }),
  } as T;
}

// ── 원본 server/itinerary-save.ts:6 computeItineraryFingerprint = AI 의견 캐싱용 여정 지문.
//    node:crypto = wrangler.jsonc 의 nodejs_compat 로 Worker 에서 그대로 쓴다.
type ItineraryBody = Record<string, unknown>;
type FpDay = { day?: unknown; places?: unknown };
type FpPlace = {
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
  startTime?: unknown;
};

function computeItineraryFingerprint(itinerary: ItineraryBody): string {
  const material = {
    destination: itinerary.destination,
    startDate: itinerary.startDate,
    endDate: itinerary.endDate,
    days: ((itinerary.days || []) as FpDay[]).map((d) => ({
      day: d.day,
      places: ((d.places || []) as FpPlace[]).map((p) => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        startTime: p.startTime,
      })),
    })),
  };
  return createHash("sha1").update(JSON.stringify(material)).digest("hex");
}

// ── 원본 server/itinerary-save.ts:24 buildItineraryData = 여정을 DB 행으로 만드는 변환기. 로직 그대로.

const STYLE_TO_PERSONA_TYPE: Record<string, string> = {
  Luxury: "luxury",
  Premium: "comfort",
  Reasonable: "comfort",
  Economic: "comfort",
  luxury: "luxury",
  comfort: "comfort",
  reasonable: "comfort",
  economic: "comfort",
};

async function buildItineraryData(db: WorkerDb, body: ItineraryBody) {
  // 🧠 AI 의견 결과 박제. FE 가 rawData.verificationResult(본문+언어)를 실으면 fp 와 함께 rawData.verification 에 굳힌다.
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
  // 🏙️ 도시 id 는 서버가 목적지 문자열로 매칭해 채운다.
  const { cityId: _fromClient, ...bodyRest } = body || {};
  const matchedCityId = await matchCityIdByName(
    db,
    rawData?.destination as string | null | undefined,
  );
  // ⚠️ total_cost 칸 = 1인 유로(€).
  const perPersonEur = (rawData?.totalCost as { perPersonEur?: unknown } | null)
    ?.perPersonEur;
  const totalCostEur =
    typeof perPersonEur === "number" && isFinite(perPersonEur)
      ? perPersonEur
      : undefined;
  // ⚠️ 인원·바이브·밀도·초점 컬럼 = body 직접값 ?? rawData(생성 산출물=진실).
  const truthCols = Object.fromEntries(
    [
      "companionType",
      "companionCount",
      "companionAges",
      "curationFocus",
      "vibes",
      "travelPace",
    ]
      .map((k) => [k, body[k] ?? rawData[k]])
      .filter(([, v]) => v != null),
  );
  return {
    ...bodyRest,
    ...truthCols,
    ...(matchedCityId != null ? { cityId: matchedCityId } : {}),
    ...(totalCostEur != null ? { totalCost: totalCostEur } : {}),
    userId: (body.userId as string) || "admin",
    startDate: body.startDate ? new Date(body.startDate as string) : new Date(),
    endDate: body.endDate ? new Date(body.endDate as string) : new Date(),
    personaType: STYLE_TO_PERSONA_TYPE[body.travelStyle as string] || "comfort",
    travelStyle: STYLE_TO_PERSONA_TYPE[body.travelStyle as string] || "comfort",
    rawData,
  } as typeof schema.itineraries.$inferInsert;
}

// ⚠️ 원본 server/storage.ts:234 = 화면 목록에서 빼는 상태 1벌(두 목록이 같은 기준).
const HIDDEN_STATUSES = ["inquiry", "generating", "failed"];

function errMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function registerItineraryRoutes(app: Express, openDb: OpenDb): void {
  // [원본 server/itinerary-routes.ts:24] PATCH /api/users/:userId/preferred-language
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
      // 원본 storage.updateUserLogin(server/storage.ts:167) = users 행 갱신 후 returning.
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

  // [원본 server/itinerary-routes.ts:52] GET /api/users/:userId/itineraries
  //   ⚠️ 관리자(Bearer 토큰 role) = 전체 상황판 = 전 사용자 저장 여정.
  app.get("/api/users/:userId/itineraries", async (req, res) => {
    const { db, close } = openDb();
    try {
      const authId = getUserIdFromReq(req);
      const isAdmin = authId
        ? (await getRoleFromDb(db, authId)) === "admin"
        : false;
      // 정렬·필터 = 원본 storage.getAllItineraries()(server/storage.ts:250)
      //            · storage.getUserItineraries()(server/storage.ts:236) 와 동일.
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

  // [원본 server/itinerary-routes.ts:68] GET /api/itineraries/:id
  app.get("/api/itineraries/:id", async (req, res) => {
    const { db, close } = openDb();
    try {
      // 원본 storage.getItinerary(id)(server/storage.ts:258) = itineraries 단일 행.
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

  // [원본 server/itinerary-routes.ts:120] POST /api/itineraries
  app.post("/api/itineraries", async (req, res) => {
    const { db, close } = openDb();
    try {
      const itineraryData = await buildItineraryData(db, req.body);
      console.log(
        `[Itinerary] Creating itinerary for user=${itineraryData.userId}...`,
      );
      // 원본 storage.createItinerary(server/storage.ts:266).
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

  // [원본 server/itinerary-routes.ts:138] PUT /api/itineraries/:id
  app.put("/api/itineraries/:id", async (req, res) => {
    const { db, close } = openDb();
    try {
      const id = parseInt(String(req.params.id));
      const itineraryData = await buildItineraryData(db, req.body);

      console.log(`[Itinerary] Updating id=${id} (재저장 덮어쓰기)...`);
      // 원본 storage.updateItinerary(server/storage.ts:275) = 같은 행 전체 새덮어쓰기 + updated_at.
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

  // [원본 server/itinerary-routes.ts:160] POST /api/itineraries/:id/representative
  app.post("/api/itineraries/:id/representative", async (req, res) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      // 원본 storage.getUser(server/storage.ts:61).
      const [user] = userId
        ? await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, userId))
        : [undefined];
      if (user?.role !== "admin") {
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
