// ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 최근 일정 = 누가·어디서·몇 곳·어떤 상태인지(상태 필터 없음 = 만드는 중·실패 포함) (정본 §)
import type { Express } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../shared/schema";

const { cities, itineraries, users } = schema;
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

export async function recentItinerariesSummary(db: Db) {
  const rows = await db
    .select({
      id: itineraries.id,
      status: itineraries.status,
      title: itineraries.title,
      createdAt: itineraries.createdAt,
      userEmail: users.email,
      userDisplayName: users.displayName,
      cityName: cities.nameEn,
      places: sql<number>`COALESCE((SELECT SUM(jsonb_array_length(COALESCE(d->'places', '[]'::jsonb)))::int FROM jsonb_array_elements(COALESCE(${itineraries.rawData}->'days', '[]'::jsonb)) d), 0)`,
    })
    .from(itineraries)
    .leftJoin(users, eq(users.id, itineraries.userId))
    .leftJoin(cities, eq(cities.id, itineraries.cityId))
    .orderBy(sql`${itineraries.createdAt} DESC`)
    .limit(30);
  return rows.map((i) => ({
    id: i.id,
    status: i.status,
    title: i.title,
    createdAt: i.createdAt,
    city: i.cityName || "(도시 없음)",
    places: Number(i.places) || 0,
    user: i.userEmail || i.userDisplayName || "(탈퇴/미확인)",
  }));
}

export function registerAdminItineraryRoutes(app: Express, openDb: OpenDb) {
  app.get("/api/admin/recent-itineraries", async (_req, res) => {
    const { db, close } = openDb();
    try {
      res.json({ items: await recentItinerariesSummary(db) });
    } catch (e) {
      res.status(500).json({ error: (e as Error)?.message || "failed" });
    } finally {
      close();
    }
  });
}
