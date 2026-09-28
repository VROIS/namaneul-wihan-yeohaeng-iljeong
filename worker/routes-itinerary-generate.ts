// POST /api/routes/day-live 1벌.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
// 바인딩(R2) 접근 + waitUntil = routes-gemini.ts:31 과 같은 방식(그 파일 주석의 근거 그대로).
import { env, waitUntil } from "cloudflare:workers";
import * as schema from "../shared/schema";
import { saveRawToR2 } from "./raw-store";
import { itineraryContext } from "../shared/r2-paths";
import { readMapsKey } from "./keys";

type Db = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: Db; close: () => void };

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export interface DayLiveStop {
  lat: number;
  lng: number;
}

export interface DayLiveResult {
  durationSec: number; // 당일 총 이동 실소요(초)
  distanceKm: number; // 당일 총 이동거리(km)
}

export interface EnrichedStop {
  lat: number;
  lng: number;
  placeId: string | null;
  nameKo: string | null;
  nameLocal: string | null;
}

// drizzle 의 `db.execute<T>` 는 T 에 `Record<string, unknown>` 제약을 건다 = 색인 시그니처 필수.
interface EnrichRow extends Record<string, unknown> {
  idx: string | number;
  google_place_id: string | null;
  name_ko: string | null;
  name_local: string | null;
}

/** 좌표로 PSR 조회(딥링크용 PID + 이름). drizzle `sql` 태그 = 값은 매개변수로 바인딩, JS 배열은 Postgres 배열로 가서 `::float8[]` 캐스팅이 맞는다.
 *  응답 열 이름은 생 SQL 이라 snake_case 그대로 온다. */
export async function enrichStopsWithPsr(
  db: Db,
  stops: DayLiveStop[],
): Promise<EnrichedStop[]> {
  // 연결이 없거나 정류장이 없으면 빈 값으로 채워 그대로 돌려준다.
  if (!stops.length) {
    return stops.map((s) => ({
      ...s,
      placeId: null,
      nameKo: null,
      nameLocal: null,
    }));
  }
  const lats = stops.map((s) => s.lat);
  const lngs = stops.map((s) => s.lng);
  const rows = await db.execute<EnrichRow>(sql`
     SELECT q.idx, m.google_place_id, m.name_ko, m.name_local
     FROM unnest(${lats}::float8[], ${lngs}::float8[]) WITH ORDINALITY AS q(lat, lng, idx)
     LEFT JOIN LATERAL (
       SELECT google_place_id, name_ko, name_local FROM place_seed_raw p
       WHERE p.latitude BETWEEN q.lat - 0.0009 AND q.lat + 0.0009
         AND p.longitude BETWEEN q.lng - 0.0009 AND q.lng + 0.0009
       ORDER BY (p.latitude - q.lat) * (p.latitude - q.lat)
              + (p.longitude - q.lng) * (p.longitude - q.lng) ASC
       LIMIT 1
     ) m ON true
     ORDER BY q.idx`);
  // idx(1-based) 로 되짚어 슬롯 순서를 유지한다.
  const list = Array.from(rows as Iterable<EnrichRow>);
  return stops.map((s, i) => {
    const row = list.find((x) => Number(x.idx) === i + 1);
    return {
      lat: s.lat,
      lng: s.lng,
      placeId: row?.google_place_id ?? null,
      nameKo: row?.name_ko ?? null,
      nameLocal: row?.name_local ?? null,
    };
  });
}

/** RouteEndpoint = 좌표 또는 도시명 주소. */
export type RouteEndpoint = { lat: number; lng: number } | { address: string };

/** Google Routes API 1콜 = TRAFFIC_AWARE = Compute Routes Pro SKU $10/1000콜.
 *  §18 raw 저장은 `record` 콜백으로 밖에 넘긴다 = 이 함수는 R2 를 직접 만지지 않는다(라우트가 외부호출이 끝난 뒤 waitUntil 로 넘긴다). */
async function computeDayRouteLive(
  apiKey: string,
  slots: DayLiveStop[],
  endpoint: RouteEndpoint,
  record: (p: { request: unknown; raw: unknown }) => void,
): Promise<DayLiveResult> {
  if (!Array.isArray(slots) || slots.length < 1) {
    throw new Error("경유지 1개 이상 필요");
  }
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY 없음");

  const toWp = (s: DayLiveStop) => ({
    location: { latLng: { latitude: s.lat, longitude: s.lng } },
  });
  const ep =
    "address" in endpoint
      ? { address: endpoint.address }
      : {
          location: {
            latLng: { latitude: endpoint.lat, longitude: endpoint.lng },
          },
        };
  const body = {
    origin: ep,
    destination: ep,
    intermediates: slots.map(toWp),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
  };
  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify(body),
  });
  const raw = (await res.json().catch(() => null)) as {
    routes?: { duration?: string; distanceMeters?: number }[];
  } | null;

  // 성공·실패를 가리지 않고 raw 를 먼저 남긴다(유료호출 = 자산).
  record({ request: body, raw });

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} = ${JSON.stringify(raw)?.slice(0, 180)}`,
    );
  }
  const r = raw?.routes?.[0];
  const durationSec =
    parseInt(String(r?.duration || "0").replace("s", ""), 10) || 0;
  const distanceKm = (r?.distanceMeters || 0) / 1000;
  return { durationSec, distanceKm };
}

// ── 라우트 ─────────────────────────────────────────────────────────────────

interface DayLiveBody {
  slots?: unknown;
  accommodation?: { lat?: unknown; lng?: unknown } | null;
  cityName?: unknown;
  itineraryId?: unknown;
}

export function registerItineraryGenerateRoutes(
  app: Express,
  openDb: OpenDb,
): void {
  // POST /api/routes/day-live.
  //   ⚠️ 2026-07-24 사장님 승인 = 일별 [바로가기] = 출발지+경유지+도착지 왕복.
  //   크레딧 차감 없음(§9 5지점에 포함되지 않는 호출).
  app.post("/api/routes/day-live", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    let closed = false;
    const closeOnce = () => {
      if (!closed) {
        closed = true;
        close();
      }
    };
    try {
      // 좌표가 숫자인 슬롯만 남긴다.
      const body = (req.body || {}) as DayLiveBody;
      const slots: DayLiveStop[] = Array.isArray(body.slots)
        ? (body.slots as DayLiveStop[]).filter(
            (s) => typeof s?.lat === "number" && typeof s?.lng === "number",
          )
        : [];
      const accom = body.accommodation;
      const cityName =
        typeof body.cityName === "string" ? body.cityName.trim() : "";
      if (slots.length < 1) {
        return res.status(400).json({ error: "slots(lat,lng) 필요" });
      }
      // 숙소 좌표 > 도시명 주소 > 없음.
      const hasAccom =
        typeof accom?.lat === "number" && typeof accom?.lng === "number";
      const endpoint: RouteEndpoint | null = hasAccom
        ? { lat: accom!.lat as number, lng: accom!.lng as number }
        : cityName
          ? { address: cityName }
          : null;
      const startSrc = hasAccom ? "숙소" : cityName ? "도시명주소" : "없음";
      console.log(
        `[day-live] 슬롯 ${slots.length} | 출발/도착 기준=${startSrc}${cityName ? `(${cityName})` : ""}`,
      );

      // DB 로 하는 일은 여기서 전부 끝낸다(열쇠 + PSR + 여정 도시) = Google Routes 응답을
      //    기다리는 동안 DB 연결을 쥐고 있으면 안 된다(Hyperdrive 연결 고갈).
      const enriched = await enrichStopsWithPsr(db, slots);
      const apiKey = endpoint ? await readMapsKey(db) : "";
      // ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 동선 raw = 여정의 도시 번호 폴더(도시 없으면 itinerary-{번호}) (정본 K3)
      const itineraryId = Number(body.itineraryId);
      const hasItinerary = Number.isInteger(itineraryId) && itineraryId > 0;
      const [itin] = hasItinerary
        ? await db
            .select({ cityId: schema.itineraries.cityId })
            .from(schema.itineraries)
            .where(eq(schema.itineraries.id, itineraryId))
            .limit(1)
        : [];
      const rawContext = itineraryContext(
        itin?.cityId,
        hasItinerary ? itineraryId : null,
      );
      closeOnce();

      let live: DayLiveResult | null = null;
      if (endpoint) {
        try {
          live = await computeDayRouteLive(apiKey, slots, endpoint, (p) => {
            // §18 raw = R2 1곳에만 남긴다(사용자 클릭당 발생 = 로컬 파일 저장은 건너뜀, 워커에는 파일시스템도 없다).
            // ⚠️ 그냥 던져두면 R2 PUT 이 끊길 수 있으므로 waitUntil 로 붙든다.
            waitUntil(
              saveRawToR2(env.RAW_BUCKET, {
                source: "routes",
                contextId: rawContext,
                tag: "day-live",
                request: p.request,
                raw: p.raw,
              }),
            );
          });
        } catch (e) {
          // ETA 가 실패해도 이름(stops)은 돌려준다(기능 불중단).
          console.error(
            "[day-live] ETA 실패(이름은 반환):",
            (e as Error)?.message,
          );
        }
      }
      res.json({
        durationSec: live?.durationSec ?? null,
        distanceKm: live?.distanceKm ?? null,
        stops: enriched,
      });
    } catch (e) {
      // 502 + day_live_failed (FE = 딥링크만 오픈).
      console.error("[day-live] 실패:", (e as Error)?.message);
      res.status(502).json({ error: "day_live_failed" });
    } finally {
      closeOnce();
    }
  });
}
