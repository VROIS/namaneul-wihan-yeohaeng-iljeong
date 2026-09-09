// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 알아보는 문 1벌 = 제미니가 준 값(한국어명·영어명·현지어명·좌표)만으로 창고에 이미 있는 행을 찾는다. 시드 ③ 과 MIX 1단계가 같은 문을 쓴다(§16).
//   규칙(리마 추출본 74묶음 = 73/74 · MIX 38곳 = 28/28 실증): 식당 ↔ 비식당은 갈라 본다 → ① 한국어명 같음 → ② 영어명/현지어명 같음 → ③ 한국어명 포함 + 1km 안 → ④ 500m 안 + 일반명사 뺀 고유명사 같음(한국어명이 양쪽에 있는데 다르면 제외). 하나만 맞아도 "있음". 문지기(트리거)는 그 뒤 최후 방어선.
import { sql } from "drizzle-orm";
import { distanceMetersFromCoords } from "./geo-distance";

export type RecognizeRow = {
  id: number;
  name_en: string | null;
  name_local: string | null;
  name_ko: string | null;
  seed_category: string | null;
  lat: number | null;
  lng: number | null;
};
export type GeminiPlace = {
  name?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
  lat?: number | null;
  lng?: number | null;
  isRestaurant: boolean;
};

const RECOGNIZE_ROWS_HEAD = `SELECT id, name_en, name_local, name_ko, seed_category, latitude::float AS lat, longitude::float AS lng FROM place_seed_raw WHERE status = 'active' AND city_id = `;
/** 창고 행 읽는 문장 1벌 = pg 클라이언트용($1 자리표). */
export const RECOGNIZE_ROWS_SQL = `${RECOGNIZE_ROWS_HEAD}$1`;
/** 같은 문장 = drizzle 용. 도시 번호는 글자로 붙이지 않고 매개변수로 넘긴다. */
export const recognizeRowsQuery = (cityId: number) =>
  sql`${sql.raw(RECOGNIZE_ROWS_HEAD)}${sql.param(cityId)}`;

const GENERIC = new Set([
  "plaza",
  "parque",
  "park",
  "square",
  "museo",
  "museum",
  "basilica",
  "iglesia",
  "church",
  "cathedral",
  "catedral",
  "restaurante",
  "restaurant",
  "sangucheria",
  "taberna",
  "cafe",
  "bar",
  "mercado",
  "market",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "the",
  "of",
  "y",
  "and",
  "peruana",
  "wildlife",
  "refuge",
  "site",
  "sanctuary",
  "santuario",
  "arqueologico",
  "fortaleza",
  "fortress",
  "circuito",
  "circuit",
  "puente",
  "bridge",
  "main",
  "monumental",
  "turismo",
  "historico",
  "national",
  "nacional",
  "convent",
  "convento",
  "archaeological",
  "anthropology",
  "history",
  "huaca",
  "cerro",
  "hill",
  "islas",
  "islands",
  "cevicheria",
  "chifa",
  "anticucheria",
  "criolla",
  "in",
  "distrito",
  "district",
]);
const latin = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const hangul = (s: unknown) =>
  String(s ?? "")
    .replace(/[^가-힣a-z0-9]/gi, "")
    .toLowerCase();
const properKey = (s: unknown) =>
  latin(s)
    .split(" ")
    .filter((w) => w && !GENERIC.has(w))
    .sort()
    .join(" ");
const meters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) => distanceMetersFromCoords(a.lat, a.lng, b.lat, b.lng);
const keyOverlap = (a: string, b: string) => !!a && !!b && a === b;

export function recognizePlace(
  g: GeminiPlace,
  rows: RecognizeRow[],
): { row: RecognizeRow; why: string; meters: number | null } | null {
  const gKo = hangul(g.nameKo);
  const gNames = [latin(g.name), latin(g.nameLocal)].filter(Boolean);
  const gKeys = [properKey(g.name), properKey(g.nameLocal)].filter(Boolean);
  const hasCoord = g.lat != null && g.lng != null && g.lat !== 0;
  let best: {
    row: RecognizeRow;
    why: string;
    meters: number | null;
    rank: number;
  } | null = null;
  for (const r of rows) {
    if ((r.seed_category === "restaurant") !== g.isRestaurant) continue;
    const d =
      hasCoord && r.lat != null && r.lng != null
        ? meters({ lat: g.lat!, lng: g.lng! }, { lat: r.lat, lng: r.lng })
        : null;
    const rKo = hangul(r.name_ko);
    let why = "";
    let rank = 9;
    if (gKo && gKo === rKo) {
      why = "한국어명 같음";
      rank = 1;
    } else if (
      gNames.some((n) => n === latin(r.name_en) || n === latin(r.name_local))
    ) {
      why = "영어명/현지어명 같음";
      rank = 2;
    } else if (
      gKo &&
      rKo &&
      d != null &&
      d <= 1000 &&
      (rKo.includes(gKo) || gKo.includes(rKo))
    ) {
      why = `한국어명 포함 + 1km 안(${d}m)`;
      rank = 3;
    } else if (d != null && d <= 500 && !(gKo && rKo && gKo !== rKo)) {
      // 한국어명이 양쪽에 있는데 서로 다르면(바랑코 광장 ↔ 바랑코 지구) 고유명사 규칙은 쓰지 않는다.
      const rKeys = [properKey(r.name_en), properKey(r.name_local)].filter(
        Boolean,
      );
      if (gKeys.some((k) => rKeys.some((x) => keyOverlap(k, x)))) {
        why = `500m 안 + 고유명사 같음(${d}m)`;
        rank = 4;
      }
    }
    if (!why) continue;
    if (
      !best ||
      rank < best.rank ||
      (rank === best.rank && (d ?? 1e9) < (best.meters ?? 1e9))
    )
      best = { row: r, why, meters: d, rank };
  }
  return best ? { row: best.row, why: best.why, meters: best.meters } : null;
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = TS 가 돌려준 이름이 제미니 이름(현지어·영어)과 전혀 다르면 오배송으로 보고 붙이지 않는다(MATE→Pedro de Osma 실측).
//   "전혀 다르다" = 일반명사를 뺀 고유명사 조각이 하나도 안 겹칠 때(앞 5글자 같으면 같은 조각으로 봄 = Exposición/Exposition · Reserva/Reserve 표기 차 흡수). 오늘 6판 TS 64건 실측 = 진짜 오배송 2건만 거부.
export function namesAgree(
  tsName: string | null | undefined,
  geminiNames: (string | null | undefined)[],
): boolean {
  // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 라틴 글자가 아닌 이름(경복궁·東京タワー·Кремль)은 라틴 정규화하면 빈 글자가 된다 = 그 자체로는 판정 불가.
  //   판정 불가일 때는 거부하지 않는다(거부하면 서울·도쿄 같은 도시의 새 장소가 전멸하고 유료 TS 응답이 통째로 버려진다). 대신 글자 그대로 견줘 같으면 통과.
  const raw = (x: unknown) =>
    String(x ?? "")
      .replace(/\s+/g, "")
      .toLowerCase();
  const tRaw = raw(tsName);
  if (
    tRaw &&
    geminiNames.some((g) => {
      const gr = raw(g);
      return gr && (gr === tRaw || gr.includes(tRaw) || tRaw.includes(gr));
    })
  )
    return true;
  const t = latin(tsName);
  if (!t) return !geminiNames.some((g) => latin(g));
  const tTok = properKey(tsName)
    .split(" ")
    .filter((w) => w.length >= 3);
  for (const g of geminiNames) {
    const gl = latin(g);
    if (!gl) continue;
    if (gl === t || t.includes(gl) || gl.includes(t)) return true;
    const gTok = properKey(g)
      .split(" ")
      .filter((w) => w.length >= 3);
    for (const a of gTok)
      for (const b of tTok)
        if (
          a === b ||
          (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5))
        )
          return true;
  }
  return false;
}
