// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 필시티 v4 = 투표 용지 읽기·가까운 거점 판정·용지 표시·같은 종류로 알아보기 1벌(용지 만들기·발굴·선처리가 같이 쓴다) (정본 2026-11-14)
import fs from "fs";
import { latestReport } from "./common";
import { distanceKmFromCoords as km } from "../../worker/lib/services/shared/geo-distance";
import {
  recognizePlace,
  type RecognizeRow,
} from "../../worker/lib/services/shared/recognize-place";

export type BallotFile = {
  cityId: number;
  generatedAt: string;
  radiusKm: number;
  hubs: { id: number; name: string; lat: number; lng: number; cc?: string }[];
  dropped: {
    otherHub: number;
    noProduct: number;
    overMax: number;
    cityItself?: number;
  };
  localities?: string[]; // 반경 안 비아토르 도시 이름(알아보는 문이 이름 비교에서 빼는 동네 이름)
  ballot: {
    no: number;
    id: number;
    name: string;
    lat: number;
    lng: number;
    km: number;
    products: number;
    reviews: number;
  }[];
};

/** 그 도시 최신 용지(없으면 null) = 발굴·선처리가 같은 이 함수로 읽는다. */
export function readBallot(cityId: number, since?: string): BallotFile | null {
  const p = latestReport(
    cityId,
    "ballot",
    (f) => !since || f.slice(0, 17) >= since,
  );
  return p ? JSON.parse(fs.readFileSync(p, "utf-8")) : null;
}

// ⚠️ 수정금지(승인필요) 2026-11-21 사장님 결정 = 장소의 나라 = 주소 끝 토막의 나라 이름(여러 언어 · 우편번호 붙어도) · 나라 이름이 없고 우편번호가 다섯 자리이며 그 주소가 구글맵 페이지에서 읽은 것(도장 있는 행)이면 구글맵을 읽는 곳의 나라(구글은 읽는 사람 나라를 주소에서 뺀다 · 이 PC = 프랑스) · 제미니 주소는 나라를 안 넣으므로 이 추정을 하지 않는다 · 그 밖은 모름 (정본 2026-11-21)
const READER_COUNTRY = "FR";
const COUNTRY_BY_NAME = (() => {
  const m = new Map<string, string>();
  const old = /^(FX|EU|UN|EZ|DD|YU|CS|SU|ZR|BU|TP|NT|YD|AN|QO|ZZ)$/;
  for (const loc of ["en", "fr", "de", "it", "es", "pt", "nl", "ko"]) {
    const dn = new Intl.DisplayNames([loc], { type: "region" });
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const c = String.fromCharCode(a, b);
        if (old.test(c)) continue;
        try {
          const n = dn.of(c)?.toLowerCase();
          if (n && n !== c.toLowerCase() && !m.has(n)) m.set(n, c);
        } catch {}
      }
  }
  m.set("uk", "GB").set("usa", "US").set("vatican city", "VA");
  return m;
})();

/** 비아토르 장소의 나라 = 목적지 계층(lookupId "대륙.나라.…")의 둘째 토막 나라 목적지(실측 2026-11-21 = 3,405곳 전부 나라를 찾음) · 주 목적지가 장소에서 25km 넘게 떨어져 있으면(예: 샤모니 케이블카가 제네바 목적지에 묶임) 장소에서 가장 가까운 목적지의 나라 */
export function viatorCountryOf(destinations: any[]) {
  const byId = new Map<number, any>(
    destinations.map((d) => [Number(d.destinationId), d]),
  );
  const places = destinations.filter(
    (d) => d.center && !/^(COUNTRY|REGION|STATE|PROVINCE)$/.test(d.type),
  );
  const ccOf = (d: any): string | null => {
    const top = byId.get(Number(String(d?.lookupId ?? "").split(".")[1]));
    return top?.type === "COUNTRY"
      ? (COUNTRY_BY_NAME.get(String(top.name).toLowerCase()) ?? null)
      : null;
  };
  return (
    destId: number | null | undefined,
    lat?: number,
    lng?: number,
  ): string | null => {
    const d = byId.get(Number(destId));
    if (lat == null || lng == null || !d?.center) return ccOf(d);
    const far = km(lat, lng, d.center.latitude, d.center.longitude) > 25;
    if (!far) return ccOf(d);
    const near = places
      .map((p) => ({
        p,
        k: km(lat, lng, p.center.latitude, p.center.longitude),
      }))
      .sort((a, b) => a.k - b.k)[0]?.p;
    return ccOf(near ?? d);
  };
}

export function countryOfAddress(
  address: string | null | undefined,
  readFromGoogle = false,
) {
  const parts = String(address ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const words = parts[parts.length - 1]
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !/\d/.test(w));
  for (const k of [words.join(" "), words[0], words[words.length - 1]])
    if (k && COUNTRY_BY_NAME.has(k)) return COUNTRY_BY_NAME.get(k)!;
  return readFromGoogle && /(^|\s)\d{5}(\s|$)/.test(parts.slice(-2).join(" "))
    ? READER_COUNTRY
    : null;
}

// ⚠️ 수정금지(승인필요) 2026-11-21 사장님 결정 = 거점 목록 1벌 = 거점 깃발(cities.is_hub)이 꽂힌 도시 + 지금 다루는 도시(extra) · 완비 여부와 관계없다 (정본 2026-11-21)
export async function hubCities(
  c: { query: (q: string, v?: any[]) => Promise<{ rows: any[] }> },
  extra: number[] = [],
): Promise<BallotFile["hubs"]> {
  return (
    await c.query(
      "SELECT id, name, country_code cc, latitude::float8 lat, longitude::float8 lng FROM cities WHERE (is_hub OR id = ANY($1::int[])) AND latitude IS NOT NULL",
      [extra],
    )
  ).rows;
}

// ⚠️ 수정금지(승인필요) 2026-11-21 사장님 결정 = 한 장소가 붙을 거점 = 그 나라(cc · 창고 행은 주소 · 비아토르 명소는 목적지 계층)에 거점이 있으면(150km 안) 그 나라 거점 중 가장 가까운 곳 · 그 나라에 거점이 없거나(도시국가 등) 나라를 모르면 나라와 관계없이 가장 가까운 거점 (정본 2026-11-21)
export const SAME_COUNTRY_KM = 150;
export const nearestHub = (
  hubs: BallotFile["hubs"],
  lat: number,
  lng: number,
  cc?: string | null,
): number => {
  const near = (list: BallotFile["hubs"]) =>
    list
      .map((h) => ({ id: h.id, d: km(h.lat, h.lng, lat, lng) }))
      .sort((a, b) => a.d - b.d)[0];
  const same = cc ? hubs.filter((h) => h.cc === cc) : [];
  const s = same.length ? near(same) : null;
  return s && s.d <= SAME_COUNTRY_KM ? s.id : near(hubs).id;
};

// ⚠️ 수정금지(승인필요) 2026-11-21 사장님 결정 = 응답 한 건의 용지 표시 = 용지에 있는 볼거리면 상품 수와 번호 · 용지 밖인데 붙을 거점(주소의 나라로 nearestHub 1벌)이 다른 곳이면 버림(null) = 한 장소는 거점 하나 (정본 2026-11-21)
export function ballotMark(
  ballot: BallotFile | null,
  cityId: number,
  type: string,
  p: any,
): { products?: number; ballotNo?: number } | null {
  const on =
    type === "landmarks"
      ? ballot?.ballot.find((b) => b.no === (Number(p.ballot_no) || 0))
      : undefined;
  if (
    ballot &&
    !on &&
    Number(p.lat) &&
    Number(p.lng) &&
    nearestHub(
      ballot.hubs,
      Number(p.lat),
      Number(p.lng),
      countryOfAddress(p.address),
    ) !== cityId
  )
    return null;
  return on ? { products: on.products, ballotNo: on.no } : {};
}

export const sameKindRow = (cat: string | undefined, r: RecognizeRow) =>
  (r.seed_category === "restaurant") === (cat === "restaurant");

// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 알아보는 문이 식당↔볼거리 엇갈린 행을 주면 같은 종류 행만으로 한 번 더 찾는다(못 찾으면 신규 = 버리지 않는다) · 반경 안 도시 이름은 이름 비교에서 뺀다 (정본 2026-11-14)
export function doorSameKind(
  p: {
    name_en?: string;
    name_local?: string;
    name_ko?: string;
    address?: string;
    lat?: number;
    lng?: number;
    c?: string;
  },
  rows: RecognizeRow[],
  ballot: BallotFile | null,
) {
  const g = {
    cityNames: [
      ...(rows.find((r) => r.city_names)?.city_names ?? []),
      ...(ballot?.localities ?? []),
    ],
    name: p.name_en,
    nameLocal: p.name_local,
    nameKo: p.name_ko,
    address: p.address ?? null,
    lat: p.lat,
    lng: p.lng,
    isRestaurant: p.c === "restaurant",
  };
  const first = recognizePlace(g, rows);
  return first && !sameKindRow(p.c, first.row)
    ? recognizePlace(
        g,
        rows.filter((r) => sameKindRow(p.c, r)),
      )
    : first;
}

export interface RawPlace {
  type: "landmarks" | "restaurants";
  lang: string;
  name_en?: string;
  name_local?: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
  c?: string;
  price_eur?: number;
  distance_km_from_center?: number;
  address?: string;
  products?: number; // 투표 용지의 비아토르 상품 수(용지에 있는 볼거리만)
  ballotNo?: number; // 투표 용지 번호(같은 번호 = 같은 장소 = 한 묶음)
  rank?: number; // 그 언어 응답 안에서의 순위(1-20) = 리포트 참고값(best_rank 원천 아님 — 2026-08-27 사장님 확정 = best_rank 는 언어코드)
  summary?: string; // 원어 요약(그 언어) = B2 place_translations 선충전 원천
  editorial?: string; // 원어 후킹카피(그 언어)
}

// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 그룹 감사 = 병합된 raw 항목 1건의 원본 필드(raw 필드명 그대로) + 문지기 판정 tier.
export interface GroupMember {
  lang: string;
  type: "landmarks" | "restaurants";
  name_en?: string;
  name_local?: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
  address?: string;
  price_eur?: number;
  distance_km_from_center?: number;
  products?: number;
  raw?: RawPlace;
  tier: string; // 불변3 | 불변5 | 불변6 | 의심(영어명/한국어명) | 의심(영어명·유니크색인) | new
}
