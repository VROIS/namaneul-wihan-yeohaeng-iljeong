// 여정 관련 라우트 = Worker 이관본 (2026-09-06)
//
// 이 파일이 옮긴 것 = POST /api/routes/day-live 1벌.
//   원본 = server/city-place-routes.ts:349 (라우트) + server/services/shared/routes-client.ts (구현 2함수).
//   응답 모양·상태코드·에러문구는 원본과 같게 유지한다.
//
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ POST /api/routes/generate 는 **옮기지 않았다**. 실측 근거는 아래 3가지다.
//   (건드린 파일 = 이 파일 1벌뿐. server/** 는 읽기만 했다.)
//
// ① 이식 규모 = 64파일 / 10,091줄 = §16 재발명 금지에 정면으로 걸린다.
//    실측 = server/services/itinerary-generator.ts · server/itinerary-save.ts ·
//    server/services/shared/place-translation.ts 3개를 뿌리로 상대경로 import 를
//    전이 추적한 결과(스크립트 1회용, 남기지 않음) = 파일 64 / 줄 10,091.
//    핵심 대상만 꼽아도 ag2(417) · ag4(493) · pipeline-v3-day-builder(477) ·
//    ag3-save-new-places(439) · city-resolver(442) · pipeline-v3-step2-build(413) ·
//    place-upsert(350) · route-local(352) 이다.
//    이 중 상당수가 `// ⚠️ 수정금지(승인필요)` 보호 블록이라 재배선 = 보호코드 재작성이 된다.
//
// ② DB 연결 모델이 서로 맞지 않는다(= ①보다 더 근본적인 차단 사유).
//    Worker 의 계약 = src.ts:113 `openDb()` 가 요청마다 연결 1벌을 열고 반드시 `close()`.
//    (src.ts:110-112 주석 = "안 닫으면 요청마다 연결이 쌓여 간헐적으로 응답이 멈춘다
//     = 2026-09-06 실측: 6회 중 2회 정지".)
//    그런데 이 그래프의 13벌이 `server/db.ts` 의 **모듈 최상단 싱글턴 db** 를 직접 물고 있다:
//      ag2-gemini-recommender · ag3-seed-loader · ag3-save-new-places · ag4-db-finalize ·
//      city-resolver · exchange-rate · place-upsert · pool-radius · slot-duration ·
//      meal-budget-tiers · place-translation · transport/guide-pricing · city-match.
//    server/db.ts:23-27 은 모듈 최상단에서 `process.env.SUPABASE_DATABASE_URL` 을 읽고
//    :41 에서 pg Pool 을 만든다 = Worker 금지사항 2개(모듈 최상단 process.env 읽기,
//    요청 밖 I/O)에 동시에 걸린다. 13벌 전부를 openDb 주입식으로 고쳐야 하는데,
//    그건 원본 파일 13벌을 수정한다는 뜻이라 이 작업의 범위(worker/ 신규 1파일)를 벗어난다.
//
// ③ 시간·연결 한도가 위험하다(= 옮겨도 지금 형태로는 못 돈다).
//    · Hyperdrive gotchas.md "Worker connections | 6 | 6 | Max concurrent connections
//      per Worker invocation" = 요청 1건당 동시 연결 6개 상한.
//      DB-only 경로만 세어도 `await db` 지점이 ag2 4 · ag4 2 · seed-loader 1 ·
//      city-resolver 10 · pool-radius 1 · slot-duration 1 · meal-budget-tiers 1 ·
//      exchange-rate 8 · place-translation 2 = 30건이다. 싱글턴이면 전부 한 연결을
//      돌려쓰지만, openDb 로 옮기면 "누가 열고 누가 닫는가"를 30곳에서 새로 정해야 한다.
//    · Hyperdrive gotchas.md "Query duration max | 60s" + Workers gotchas.md
//      "CPU time (Paid) | 30s default / 5min max".
//      MIX 경로(③ ready=false)는 pipeline-v3.ts:118 에서 제미니 1콜과 DB 사전로드를
//      병렬로 돌린 뒤 step2 에서 미매칭 장소마다 TS(Google Places)를 추가 호출한다
//      (ag3-save-new-places.ts:236 `tsSearch`, 루프 안). 대기시간 자체는 CPU 시간에
//      안 잡히지만, 그 대기 동안 DB 연결을 쥐고 있으면 Hyperdrive gotchas.md
//      "don't hold connections during external calls" 에 정면으로 걸린다.
//      = 옮기려면 파이프라인의 "언제 DB 를 잡고 언제 놓는가"를 전면 재설계해야 한다.
//
// ⇒ 결론 = /api/routes/generate 는 이 관문(라우트 단순 이관)으로 옮길 대상이 아니다.
//    옮기려면 두 가지 선행작업이 먼저다:
//      (a) server/** 13벌의 db 싱글턴을 주입식으로 바꾸는 별도 승인 작업,
//      (b) MIX 경로(제미니+TS 다중호출)를 Cloudflare Workflows 로 빼는 설계.
//    Workflows 는 단계마다 상태를 저장하고 재개하므로 요청 1건의 시간·연결 한도에
//    묶이지 않는다(cloudflare/references/workflows). 지금은 Replit 원본이 계속 담당한다.
// ────────────────────────────────────────────────────────────────────────────

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
// 바인딩(R2) 접근 + waitUntil = routes-gemini.ts:31 과 같은 방식(그 파일 주석의 근거 그대로).
import { env, waitUntil } from "cloudflare:workers";
import * as schema from "../shared/schema";
import { saveRawToR2 } from "./raw-store";

type Db = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: Db; close: () => void };

const { apiKeys } = schema;

// 원본 routes-client.ts:5
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * 원본 keys.ts:35 = GOOGLE_MAPS_API_KEY → Google_maps_api_key 별칭.
 * 배선 방식 = routes-gemini.ts:85 readMapsKey 와 같은 1벌(그 파일과 같은 우선순위).
 */
async function readMapsKey(db: Db): Promise<string> {
  const cached =
    process.env.GOOGLE_MAPS_API_KEY || process.env.Google_maps_api_key;
  if (cached) return cached;
  const [row] = await db
    .select({ v: apiKeys.keyValue })
    .from(apiKeys)
    .where(eq(apiKeys.keyName, "GOOGLE_MAPS_API_KEY"));
  const v = row?.v?.trim();
  if (!v) return "";
  process.env.GOOGLE_MAPS_API_KEY = v;
  process.env.Google_maps_api_key = v;
  return v;
}

// ── 원본 routes-client.ts 의 두 함수 재배선 ─────────────────────────────────
//
// routes-client.ts 를 그대로 import 하지 못하는 이유(직접 확인) =
//   :3 `import { saveRaw } from "./save-raw"` → node:fs 쓰기
//   :4 `import { pool } from "../../db"`      → server/db.ts = pg Pool + 모듈최상단 process.env
// 둘 다 Worker 번들이 안 된다. routes-gemini.ts 가 ts-client.ts 를 같은 이유로
// 재배선한 것과 같은 처리다(그 파일 :1063-1071 주석).

export interface DayLiveStop {
  lat: number;
  lng: number;
}

export interface DayLiveResult {
  durationSec: number; // 당일 총 이동 실소요(초)
  distanceKm: number; // 당일 총 이동거리(km)
}

/** 원본 routes-client.ts:19 EnrichedStop. */
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

/**
 * 원본 routes-client.ts:27 enrichStopsWithPsr = 좌표로 PSR 조회(딥링크용 PID + 이름).
 * SQL 본문은 원본 :39-51 을 한 글자도 바꾸지 않았다.
 *   · 원본은 pg 의 `pool.query(text, [lats, lngs])` = $1/$2 위치 매개변수.
 *   · 여기서는 drizzle 의 `sql` 태그로 같은 문장을 보낸다(값은 태그가 매개변수로 바인딩).
 *     postgres.js 는 JS 배열을 Postgres 배열로 그대로 보내므로 `::float8[]` 캐스팅도 원본과 같다.
 * 응답 열 이름은 생 SQL 이라 snake_case 그대로 온다 = 원본이 읽던 이름과 동일.
 */
export async function enrichStopsWithPsr(
  db: Db,
  stops: DayLiveStop[],
): Promise<EnrichedStop[]> {
  // 원본 :28 = 연결이 없거나 정류장이 없으면 빈 값으로 채워 그대로 돌려준다.
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
  // 원본 :53-63 = idx(1-based) 로 되짚어 슬롯 순서를 유지한다.
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

/** 원본 routes-client.ts:66 RouteEndpoint = 좌표 또는 도시명 주소. */
export type RouteEndpoint = { lat: number; lng: number } | { address: string };

/**
 * 원본 routes-client.ts:69 computeDayRouteLive = Google Routes API 1콜.
 * 비용 = 원본 :2 주석 = TRAFFIC_AWARE = Compute Routes Pro SKU $10/1000콜.
 * 요청 본문·FieldMask·파싱식은 원본 :83-118 그대로다.
 *
 * §18 raw 저장은 `record` 콜백으로 밖에 넘긴다 = 이 함수가 R2 를 직접 만지지 않는다
 * (라우트가 외부호출이 끝난 뒤 waitUntil 로 넘긴다 = routes-gemini.ts:302 와 같은 형태).
 */
async function computeDayRouteLive(
  apiKey: string,
  slots: DayLiveStop[],
  endpoint: RouteEndpoint,
  record: (p: { request: unknown; raw: unknown }) => void,
): Promise<DayLiveResult> {
  if (!Array.isArray(slots) || slots.length < 1) {
    throw new Error("[routes-client] 경유지 1개 이상 필요");
  }
  if (!apiKey) throw new Error("[routes-client] GOOGLE_MAPS_API_KEY 없음");

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

  // 원본 :103-111 = 성공·실패를 가리지 않고 raw 를 먼저 남긴다(유료호출 = 자산).
  record({ request: body, raw });

  if (!res.ok) {
    throw new Error(
      `[routes-client] HTTP ${res.status} = ${JSON.stringify(raw)?.slice(0, 180)}`,
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
}

export function registerItineraryGenerateRoutes(
  app: Express,
  openDb: OpenDb,
): void {
  // 원본 server/city-place-routes.ts:349 POST /api/routes/day-live.
  //   ⚠️ 2026-07-24 사장님 승인 = 일별 [바로가기] = 출발지+경유지+도착지 왕복.
  //   크레딧 차감 없음 = 원본에도 precheck/charge 가 없다(§9 5지점에 포함되지 않는 호출).
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
      // 원본 :351-362 = 좌표가 숫자인 슬롯만 남긴다.
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
      // 원본 :366-373 = 숙소 좌표 > 도시명 주소 > 없음.
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

      // DB 로 하는 일은 여기서 전부 끝낸다(열쇠 + PSR 조회).
      // ⚠️ Hyperdrive gotchas.md "Failed to acquire a connection (Pool exhausted) …
      //    don't hold connections during external calls" = Google Routes 응답을
      //    기다리는 동안 DB 연결을 쥐고 있으면 안 된다.
      const enriched = await enrichStopsWithPsr(db, slots);
      const apiKey = endpoint ? await readMapsKey(db) : "";
      closeOnce();

      let live: DayLiveResult | null = null;
      if (endpoint) {
        try {
          live = await computeDayRouteLive(apiKey, slots, endpoint, (p) => {
            // §18 raw = 원본 routes-client.ts:104-111 과 같은 source/contextId/tag.
            //   원본은 localSkip:true = 사용자 클릭당 발생이라 로컬은 건너뛰고 스토리지에만 남긴다.
            //   Worker 에는 파일시스템이 없으므로 R2 1곳 = 원본의 localSkip 과 결과가 같다.
            // ⚠️ rules.md "A Promise that is not awaited … may be terminated" =
            //    그냥 던져두면 R2 PUT 이 끊길 수 있으므로 waitUntil 로 붙든다.
            waitUntil(
              saveRawToR2(env.RAW_BUCKET, {
                source: "routes",
                contextId: "runtime",
                tag: "day-live",
                request: p.request,
                raw: p.raw,
              }),
            );
          });
        } catch (e) {
          // 원본 :379-381 = ETA 가 실패해도 이름(stops)은 돌려준다(기능 불중단).
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
      // 원본 :389-391 = 502 + day_live_failed (FE = 딥링크만 오픈).
      console.error("[day-live] 실패:", (e as Error)?.message);
      res.status(502).json({ error: "day_live_failed" });
    } finally {
      closeOnce();
    }
  });
}

// ⚠️ 원본과 다를 수 있는 지점
//  ① §18 raw 는 R2 1곳에만 남는다(Worker 에 파일시스템 없음).
//     원본도 이 호출만은 localSkip:true 라 로컬을 안 쓴다 = 사실상 동일하다.
//  ② 원본 enrichStopsWithPsr 은 `pool` 이 없으면 조회를 건너뛰고 빈 값을 돌려준다.
//     Worker 는 openDb() 가 항상 연결을 주므로 그 분기가 없다(연결 실패는 catch → 502).
//  ③ 원본은 `pool.query` 로 결과를 `r.rows` 배열로 받는다. postgres.js 의 결과는
//     배열형 객체라 `Array.from` 으로 배열로 확정한 뒤 원본과 같은 idx 되짚기를 한다.
