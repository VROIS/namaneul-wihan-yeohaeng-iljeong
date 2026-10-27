// ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 도시 폴더 = 거점 100km 구조 = 출발점 좌표 100km 안 같은 나라 우선·가장 가까운 거점 · 없을 때만 고른 곳에서 잘라 낸 도시로 여정이 끝까지 성공한 뒤 잠금 안에서 1개 (정본 §2026-10-27)
import { and, sql } from "drizzle-orm";
import { cities, placeSeedRaw } from "@shared/schema";
import { poolWhereSql, readySql, servingGateSql } from "./pool-radius";
import { fetchCityMetaFromGemini } from "./gemini-city-meta";

const HUB_RADIUS_KM = 100;

interface HubCity {
  cityId: number;
  name: string;
  nameEn: string;
  nameLocal: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}
type Coords = { lat: number; lng: number };

const validCoords = (c: any): c is Coords =>
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

async function findNearestHub(
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

export async function findHubById(
  db: any,
  id: number,
): Promise<HubCity | null> {
  const rows = await db
    .select(COLS)
    .from(cities)
    .where(sql`${cities.id} = ${id}`)
    .limit(1);
  return rows[0] ? toHub(rows[0]) : null;
}

export async function findHub(
  db: any,
  a: { input: string; coords?: Coords | null; countryCode?: string | null },
): Promise<HubCity | null> {
  if (validCoords(a.coords)) return findNearestHub(db, a.coords, a.countryCode);
  return findHubByName(db, a.input);
}

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

// ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 새 도시 폴더 = 고른 곳에서 도시를 잘라 낸다 · 고른 곳이 도시(locality)면 그 이름·좌표 · 아니면 주소 조각의 도시(locality) → 우편 도시(postal_town) · 둘 다 없으면(우붓·서울 숙소처럼 구·도 단위만) 구글 전체 주소로 묻는다 · 나라 코드 = 구글 주소 조각 · 나라 코드가 없으면 null = 새 폴더 없음 (정본 §2026-10-27)
export interface CutCity {
  name: string | null;
  query: string;
  countryCode: string;
  center: Coords | null;
}
type PickedPlace = {
  types?: string[];
  components?: { longText: string; shortText: string; types: string[] }[];
};
// ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 나라 코드 한 벌 = 위젯이 준 구글 주소 조각의 나라(country) (정본 §2026-10-27)
export const pickedCountryCode = (
  place: PickedPlace | null | undefined,
): string =>
  String(
    (place?.components ?? []).find((c) => (c.types || []).includes("country"))
      ?.shortText || "",
  ).toUpperCase();
export function cutCity(
  place: PickedPlace | null | undefined,
  coords: Coords | null | undefined,
  address: string | null | undefined,
): CutCity | null {
  const comps = place?.components ?? [];
  const has = (t: string) => comps.find((c) => (c.types || []).includes(t));
  const cc = pickedCountryCode(place);
  const city = has("locality") ?? has("postal_town");
  if (cc.length !== 2 || (!city?.longText && !address)) return null;
  const selfIsCity =
    (place?.types || []).includes("locality") && validCoords(coords);
  return {
    name: city?.longText ?? null,
    query: `${city?.longText ?? address}, ${cc}`,
    countryCode: cc,
    center: selfIsCity ? coords : null,
  };
}

// ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 새 도시 확인 = 여정 시작 전 1번 · 제미니에게 "도시(또는 구글 주소), 나라 코드"로 묻고 나라가 다르거나 고른 곳에서 50km 넘게 떨어지면 null(= 시작 전 멈춤) · 폴더는 아직 만들지 않는다 (정본 §2026-10-27)
export type NewCity = CutCity & {
  center: Coords;
  meta: NonNullable<Awaited<ReturnType<typeof fetchCityMetaFromGemini>>>;
};
export async function verifyNewCity(
  city: CutCity,
  coords: Coords,
): Promise<NewCity | null> {
  if (!validCoords(coords)) return null;
  const cc = city.countryCode;
  const meta = await fetchCityMetaFromGemini(city.query).catch(() => null);
  if (
    !meta ||
    String(meta.countryCode).toUpperCase() !== cc ||
    distKm({ lat: meta.latitude, lng: meta.longitude }, coords) > 50
  ) {
    console.warn(
      `[CityHub] 새 도시 확인 실패 = 제미니가 "${city.query}" 를 확인 못 함 (${meta ? `${meta.countryCode} ${meta.latitude},${meta.longitude}` : "답 없음"})`,
    );
    return null;
  }
  return {
    ...city,
    center: city.center ?? { lat: meta.latitude, lng: meta.longitude },
    meta,
  };
}

// ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 새 폴더 = 여정이 끝까지 성공한 뒤에만 · 잠금 안에서 100km 다시 보고 있으면 그 폴더 · 없을 때만 확인된 도시로 1개 (정본 §2026-10-27)
export async function createHubAfterSuccess(
  db: any,
  city: NewCity,
): Promise<HubCity> {
  const cc = city.countryCode;
  const { meta } = city;
  const hub = await db.transaction(async (tx: any) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('city-hub-create'))`,
    );
    const exist = await findNearestHub(tx, city.center, cc);
    if (exist) return exist;
    const [row] = await tx
      .insert(cities)
      .values({
        name: meta.nameKo || meta.nameEn,
        nameEn: meta.nameEn,
        nameLocal: meta.nameLocal || meta.nameEn,
        country: meta.country || cc,
        countryCode: cc,
        latitude: city.center.lat,
        longitude: city.center.lng,
        timezone: meta.timezone,
        primaryLanguage: meta.primaryLanguage,
        aliases: [city.name ?? meta.nameEn],
        mcpPhases: ["auto-hub"],
      })
      .returning();
    return toHub(row);
  });
  console.log(
    `[CityHub] 거점 확보: ${hub.name} (id=${hub.cityId}, ${hub.countryCode}) 도시 "${city.query}"`,
  );
  return hub;
}
