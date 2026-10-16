// ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 도시 폴더 = 거점 100km 구조 = 출발점 좌표 100km 안 같은 나라 우선·가장 가까운 거점에 저장 · 새 거점은 일정 성공 후 잠금 안에서만 (정본 §)
import { and, sql } from "drizzle-orm";
import { cities, placeSeedRaw } from "@shared/schema";
import { poolWhereSql, readySql, servingGateSql } from "./pool-radius";
import { fetchCityMetaFromGemini } from "./gemini-city-meta";

export const HUB_RADIUS_KM = 100;

export interface HubCity {
  cityId: number;
  name: string;
  nameEn: string;
  nameLocal: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}
export type Coords = { lat: number; lng: number };

export const validCoords = (c: any): c is Coords =>
  !!c &&
  Number.isFinite(c.lat) &&
  Number.isFinite(c.lng) &&
  !(c.lat === 0 && c.lng === 0) &&
  Math.abs(c.lat) <= 90 &&
  Math.abs(c.lng) <= 180;

const toHub = (r: any): HubCity => ({
  cityId: r.id,
  name: r.name,
  nameEn: r.nameEn || r.name,
  nameLocal: r.nameLocal || r.name,
  countryCode: r.countryCode,
  latitude: Number(r.latitude),
  longitude: Number(r.longitude),
});
const COLS = {
  id: cities.id,
  name: cities.name,
  nameEn: cities.nameEn,
  nameLocal: cities.nameLocal,
  countryCode: cities.countryCode,
  latitude: cities.latitude,
  longitude: cities.longitude,
};

/** 좌표 100km 안 거점 = 같은 나라 우선, 그 안에서 가장 가까운 곳. 위·경도 사각형으로 먼저 거르고(날짜변경선·극지 처리) 거리 계산. */
export async function findNearestHub(
  db: any,
  pt: Coords,
  countryCode?: string | null,
): Promise<HubCity | null> {
  const dLat = HUB_RADIUS_KM / 111.32;
  const cosLat = Math.cos((pt.lat * Math.PI) / 180);
  const noLng = Math.abs(pt.lat) + dLat >= 89.5 || cosLat < 0.02;
  const dLng = noLng ? 360 : HUB_RADIUS_KM / (111.32 * cosLat);
  const lat = sql`${pt.lat}::float8`;
  const lng = sql`${pt.lng}::float8`;
  const km = sql<number>`(12742 * asin(sqrt(least(1, power(sin(radians(${cities.latitude} - ${lat}) / 2), 2) + cos(radians(${lat})) * cos(radians(${cities.latitude})) * power(sin(radians(${cities.longitude} - ${lng}) / 2), 2)))))`;
  const cc = String(countryCode || "").toUpperCase();
  const rows = await db
    .select({ ...COLS, km })
    .from(cities)
    .where(
      and(
        sql`${cities.latitude} BETWEEN ${pt.lat - dLat}::float8 AND ${pt.lat + dLat}::float8`,
        noLng
          ? sql`true`
          : sql`(abs(${cities.longitude} - ${lng}) <= ${dLng}::float8 OR abs(${cities.longitude} - ${lng}) >= ${360 - dLng}::float8)`,
        sql`${km} <= ${HUB_RADIUS_KM}`,
      ),
    )
    .orderBy(
      ...(cc.length === 2 ? [sql`(${cities.countryCode} = ${cc}) DESC`] : []),
      sql`${km} ASC`,
    )
    .limit(1);
  return rows[0] ? toHub(rows[0]) : null;
}

/** 좌표 없는 입력(도시 칩·BTS) = 이름·별칭 정확 일치만. 일치가 없으면 도시를 만들지 않고 없음. */
async function findHubByName(db: any, input: string): Promise<HubCity | null> {
  const key = String(input || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!key) return null;
  const rows = await db
    .select(COLS)
    .from(cities)
    .where(
      sql`LOWER(${cities.name}) = ${key}
        OR LOWER(COALESCE(${cities.nameEn}, '')) = ${key}
        OR LOWER(COALESCE(${cities.nameLocal}, '')) = ${key}
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(${cities.aliases}, '[]'::jsonb)) AS a WHERE LOWER(TRIM(a)) = ${key})`,
    )
    .orderBy(cities.id)
    .limit(1);
  return rows[0] ? toHub(rows[0]) : null;
}

/** 사용자 입력 → 저장 폴더(거점). 좌표가 있으면 좌표로만, 없으면 이름으로만. 여기서는 읽기만 하고 도시를 만들지 않는다. */
export async function findHub(
  db: any,
  a: { input: string; coords?: Coords | null; countryCode?: string | null },
): Promise<HubCity | null> {
  if (validCoords(a.coords)) return findNearestHub(db, a.coords, a.countryCode);
  return findHubByName(db, a.input);
}

/** 준비됨 판정 = 출발점(없으면 거점 중심) 반경 100km 풀 기준 손님상 120곳 이상 + 베스트(소속 도시 무관, 서빙 풀과 같은 기준). */
export async function hubReadiness(
  db: any,
  hub: HubCity,
  startCoords?: Coords | null,
): Promise<{ ready: boolean; count: number }> {
  const center = validCoords(startCoords)
    ? startCoords
    : { lat: hub.latitude, lng: hub.longitude };
  const rows = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      ready: sql<boolean>`${readySql()}`,
    })
    .from(placeSeedRaw)
    .where(and(poolWhereSql(hub.cityId, center), servingGateSql()));
  return {
    ready: !!rows[0]?.ready,
    count: Number(rows[0]?.count || 0),
  };
}

const distKm = (a: Coords, b: Coords) => {
  const p = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * p) / 2) ** 2 +
    Math.cos(a.lat * p) *
      Math.cos(b.lat * p) *
      Math.sin(((b.lng - a.lng) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** 새 거점 = 100km 안에 없을 때만 · 일정 성공 후 · 잠금 안 재확인(설명 = 정본 ④-4). */
export async function createHubAfterSuccess(
  db: any,
  a: { input: string; coords: Coords; countryCode?: string | null },
): Promise<HubCity | null> {
  if (!validCoords(a.coords)) return null;
  const meta = await fetchCityMetaFromGemini(a.input).catch(() => null);
  const cc = String(meta?.countryCode || a.countryCode || "").toUpperCase();
  if (cc.length !== 2) {
    console.warn(
      `[CityHub] 새 거점 생성 보류 = 나라 코드를 알 수 없음: "${a.input}"`,
    );
    return null;
  }
  const useMeta =
    !!meta &&
    distKm({ lat: meta.latitude, lng: meta.longitude }, a.coords) <= 50;
  const center = useMeta
    ? { lat: meta!.latitude, lng: meta!.longitude }
    : a.coords;
  const nameEn = meta?.nameEn || a.input;
  const hub = await db.transaction(async (tx: any) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('city-hub-create'))`,
    );
    const exist = await findNearestHub(tx, a.coords, cc);
    if (exist) return exist;
    const [row] = await tx
      .insert(cities)
      .values({
        name: meta?.nameKo || a.input,
        nameEn,
        nameLocal: meta?.nameLocal || nameEn,
        country: meta?.country || cc,
        countryCode: cc,
        latitude: center.lat,
        longitude: center.lng,
        timezone: meta?.timezone || "UTC",
        primaryLanguage: meta?.primaryLanguage || "en",
        aliases: [a.input],
        mcpPhases: ["auto-hub"],
      })
      .returning();
    return toHub(row);
  });
  console.log(
    `[CityHub] 거점 확보: ${hub.name} (id=${hub.cityId}, ${hub.countryCode}) 입력 "${a.input}"`,
  );
  return hub;
}
