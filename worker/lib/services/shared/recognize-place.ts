// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 알아보는 문 = 제미니 값(영어명·현지명·한국어명·주소·좌표)만으로 창고 행을 먼저 찾아 유료호출 0. 판정식 = 76회 MIX raw 1,500곳 전수 대입으로 고른 1등 식(적중 1,419 · 놓침 8 · 오판 ≤8). 분류는 식당/비식당 구분만 층별로 쓰고 나머지는 태그로만 (정본 §)
import { sql } from "drizzle-orm";
import { distanceMetersFromCoords } from "./geo-distance";

export type RecognizeRow = {
  id: number;
  name_en: string | null;
  name_local: string | null;
  name_ko: string | null;
  address: string | null;
  seed_category: string | null;
  lat: number | null;
  lng: number | null;
  city_names?: (string | null)[] | null;
  image_url?: string | null;
  google_place_id?: string | null;
  google_maps_uri?: string | null;
  google_review_count?: number | null;
};
export type GeminiPlace = {
  name?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  isRestaurant: boolean;
  cityNames?: (string | null | undefined)[];
};

// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 문이 찾은 행의 손님상 재료(사진·PID·지도주소·리뷰수)를 같은 조회로 가져온다 = 창고 쓰기 성패와 무관하게 슬롯에 먼저 붙이기 위함 (정본 §)
const RECOGNIZE_ROWS_HEAD = `SELECT p.id, p.name_en, p.name_local, p.name_ko, p.address, p.seed_category, p.latitude::float AS lat, p.longitude::float AS lng, p.image_url, p.google_place_id, p.google_maps_uri, p.google_review_count, (SELECT ARRAY[c.name, c.name_en, c.name_local] || COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.aliases) = 'array' THEN c.aliases ELSE '[]'::jsonb END) x), '{}') FROM cities c WHERE c.id = p.city_id) AS city_names FROM place_seed_raw p WHERE p.status = 'active' AND p.city_id = `;
/** 창고 행 읽는 문장 1벌 = pg 클라이언트용($1 자리표). */
export const RECOGNIZE_ROWS_SQL = `${RECOGNIZE_ROWS_HEAD}$1`;
/** 같은 문장 = drizzle 용. 도시 번호는 글자로 붙이지 않고 매개변수로 넘긴다. */
export const recognizeRowsQuery = (cityId: number) =>
  sql`${sql.raw(RECOGNIZE_ROWS_HEAD)}${sql.param(cityId)}`;
const RECOGNIZE_CITY_HEAD = `SELECT name, name_en, name_local, aliases FROM cities WHERE id = `;
export const recognizeCityQuery = (cityId: number) =>
  sql`${sql.raw(RECOGNIZE_CITY_HEAD)}${sql.param(cityId)}`;
export const cityNamesOf = (
  c:
    | {
        name?: unknown;
        name_en?: unknown;
        name_local?: unknown;
        aliases?: unknown;
      }
    | null
    | undefined,
): string[] =>
  c
    ? [
        c.name,
        c.name_en,
        c.name_local,
        ...(Array.isArray(c.aliases) ? c.aliases : []),
      ]
        .map((x) => String(x ?? ""))
        .filter(Boolean)
    : [];

// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 일반명사 목록 2벌 = 쓰는 곳이 다르다. 섞으면 한쪽 승인이 다른 쪽 동작을 바꾼다(판정식 교체가 TS 오배송 판정까지 바꾼 것을 parity 검수가 잡음).
//   DOOR_GENERIC = 알아보는 문 판정식 전용(1등 식과 함께 확정). GENERIC = TS 오배송 판정(namesAgree→properKey) 전용 = 운영 recognize-place.ts 와 **같은 65단어 그대로**.
const DOOR_GENERIC = new Set(
  "restaurant restaurante brasserie bistro bistrot cafe bar hotel auberge taverne taberna pub pizzeria trattoria museum musee museo gallery galerie galeries theatre theater teatro opera cinema cinemas palais palacio chateau castle castillo manor villa domaine maison house casa abbaye abbey couvent monastere monastery basilique basilica cathedrale cathedral catedral eglise church iglesia chapelle chapel capilla temple templo mosquee synagogue parc park parque jardin garden square place plaza forest foret bois bosque tour tower torre pont bridge puente porte gate puerta phare lighthouse faro fontaine fountain fuente statue monument monumento avenue rue street calle boulevard allee chemin route promenade quai magasin store boutique tienda marche market mercado halles centre center centro mall cerro hill mirador viewpoint national nacional trail beach playa lake lago laguna river rio island isla islands islas old town city ville village de del la el los las y the of and a en le les des du au aux da do dos das di della delle dei degli il lo gli un una une e et al st san santa santo saint sainte reserve reserva natural nature shop winery cave caves vignoble vineyard vineyards estate farm resort spa lodge camp tea coffee home main branch champagne sangucheria cevicheria chifa anticucheria criolla peruana wildlife refuge site sanctuary santuario arqueologico fortaleza fortress circuito circuit monumental turismo historico convent convento archaeological anthropology history huaca in distrito district".split(
    /\s+/,
  ),
);
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
const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9가-힣 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const toks = (s: unknown, cityTok: Set<string>) =>
  new Set(
    norm(s)
      .split(" ")
      .filter(
        (t) =>
          t &&
          t.length >= 2 &&
          !DOOR_GENERIC.has(t) &&
          !/^\d+$/.test(t) &&
          !cityTok.has(t),
      ),
  );
const addrNorm = (s: unknown) =>
  norm(s)
    .replace(/\b\d{5,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const houseNo = (s: unknown) => {
  const m = /\b(\d{1,5})\b/.exec(norm(s));
  return m ? m[1] : null;
};
const shared = (A: Set<string>, B: Set<string>) => {
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return n;
};
const contains = (A: Set<string>, B: Set<string>) => {
  if (!A.size || !B.size) return false;
  const [s, l] = A.size <= B.size ? [A, B] : [B, A];
  for (const t of s) if (!l.has(t)) return false;
  return true;
};
const jaro = (s1: string, s2: string) => {
  if (s1 === s2) return 1;
  const l1 = s1.length,
    l2 = s2.length;
  if (!l1 || !l2) return 0;
  const md = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const m1 = new Array<boolean>(l1).fill(false),
    m2 = new Array<boolean>(l2).fill(false);
  let m = 0;
  for (let i = 0; i < l1; i++) {
    const lo = Math.max(0, i - md),
      hi = Math.min(i + md + 1, l2);
    for (let j = lo; j < hi; j++)
      if (!m2[j] && s1[i] === s2[j]) {
        m1[i] = m2[j] = true;
        m++;
        break;
      }
  }
  if (!m) return 0;
  let t = 0,
    k = 0;
  for (let i = 0; i < l1; i++)
    if (m1[i]) {
      while (!m2[k]) k++;
      if (s1[i] !== s2[k]) t++;
      k++;
    }
  t /= 2;
  return (m / l1 + m / l2 + (m - t) / m) / 3;
};
const jaroWinkler = (a: string, b: string) => {
  const j = jaro(a, b);
  let p = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) p++;
    else break;
  }
  return j + p * 0.1 * (1 - j);
};
const levRatio = (a: string, b: string) => {
  const m = a.length,
    n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j),
    cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
};

type Feat = {
  exact: boolean;
  exactKo: boolean;
  cont: boolean;
  contMin: number;
  sh: number;
  jac: number;
  jw: number;
  lev: number;
  jwc: number;
  addrNum: boolean;
  d: number;
  restSame: boolean;
};
function feat(g: GeminiPlace, r: RecognizeRow, cityTok: Set<string>): Feat {
  const gl = [g.name, g.nameLocal].map(norm).filter(Boolean);
  const rl = [r.name_en, r.name_local].map(norm).filter(Boolean);
  const gt = gl.map((s) => toks(s, cityTok)),
    rt = rl.map((s) => toks(s, cityTok));
  let exact = false,
    cont = false,
    contMin = 0,
    sh = 0,
    jac = 0,
    jw = 0,
    lev = 0,
    jwc = 0;
  for (let i = 0; i < gl.length; i++)
    for (let j = 0; j < rl.length; j++) {
      const a = gl[i],
        b = rl[j];
      if (a === b) exact = true;
      const A = gt[i],
        B = rt[j];
      const s = shared(A, B);
      if (s > sh) sh = s;
      if (contains(A, B)) {
        cont = true;
        contMin = Math.max(contMin, Math.min(A.size, B.size));
      }
      const u = A.size + B.size - s;
      if (u && s / u > jac) jac = s / u;
      if (Math.abs(a.length - b.length) < 40) {
        jw = Math.max(jw, jaroWinkler(a, b));
        lev = Math.max(lev, levRatio(a, b));
      }
      const ca = [...A].join(" "),
        cb = [...B].join(" ");
      if (ca && cb) jwc = Math.max(jwc, jaroWinkler(ca, cb));
    }
  const gk = norm(g.nameKo),
    rk = norm(r.name_ko);
  const hg = houseNo(g.address),
    hr = houseNo(r.address);
  const addrNum =
    !!hg &&
    hg === hr &&
    shared(toks(g.address, cityTok), toks(r.address, cityTok)) >= 1;
  const d =
    g.lat && g.lng && r.lat != null && r.lng != null
      ? distanceMetersFromCoords(g.lat, g.lng, r.lat, r.lng)
      : Number.POSITIVE_INFINITY;
  return {
    exact,
    exactKo: !!gk && gk === rk,
    cont,
    contMin,
    sh,
    jac,
    jw,
    lev,
    jwc,
    addrNum,
    d,
    restSame: (r.seed_category === "restaurant") === g.isRestaurant,
  };
}

const INF = Number.POSITIVE_INFINITY;
// 층 = 위에서부터. 처음 후보가 생기는 층에서 멈춘다(이름 점수 높은 순 → 가까운 순).
const TIERS: {
  why: string;
  ok: (f: Feat) => boolean;
  dist: number;
  rest: boolean;
}[] = [
  { why: "영어명/현지명 같음", ok: (f) => f.exact, dist: INF, rest: false },
  { why: "한국어명 같음", ok: (f) => f.exactKo, dist: INF, rest: false },
  {
    why: "핵심이름 거의 같음",
    ok: (f) => f.jwc >= 0.92 && f.sh >= 2,
    dist: INF,
    rest: false,
  },
  {
    why: "핵심이름 거의 같음 + 1km",
    ok: (f) => f.jwc >= 0.92,
    dist: 1000,
    rest: false,
  },
  { why: "이름 80% 같음", ok: (f) => f.lev >= 0.8, dist: INF, rest: true },
  {
    why: "이름 토큰 겹침 + 3km",
    ok: (f) => f.jac >= 0.34,
    dist: 3000,
    rest: true,
  },
  {
    why: "이름 유사 83% + 1km",
    ok: (f) => f.jw >= 0.83,
    dist: 1000,
    rest: false,
  },
  {
    why: "핵심이름 유사 89% + 3km",
    ok: (f) => f.jwc >= 0.89,
    dist: 3000,
    rest: true,
  },
  {
    why: "이름 유사 89% + 3km",
    ok: (f) => f.jw >= 0.89,
    dist: 3000,
    rest: false,
  },
  {
    why: "이름 70% 같음 + 3km",
    ok: (f) => f.lev >= 0.7,
    dist: 3000,
    rest: false,
  },
  {
    why: "핵심이름 유사 86% + 1km",
    ok: (f) => f.jwc >= 0.86,
    dist: 1000,
    rest: true,
  },
  {
    why: "이름 포함 + 번지 같음",
    ok: (f) => f.cont && f.addrNum,
    dist: INF,
    rest: true,
  },
  { why: "이름 포함 + 100m", ok: (f) => f.cont, dist: 100, rest: false },
];
const nameScore = (f: Feat) =>
  (f.exact ? 5 : 0) +
  (f.cont && f.contMin >= 2 ? 3 : 0) +
  (f.exactKo ? 2 : 0) +
  f.sh * 0.5 +
  f.jw +
  f.jac;

export function recognizePlace(
  g: GeminiPlace,
  rows: RecognizeRow[],
): { row: RecognizeRow; why: string; meters: number | null } | null {
  const cityTok = new Set<string>();
  const cityNames =
    g.cityNames ?? rows.find((r) => r.city_names)?.city_names ?? [];
  for (const n of cityNames)
    for (const w of norm(n).split(" ")) if (w.length >= 3) cityTok.add(w);
  const scored = rows.map((r) => ({ r, f: feat(g, r, cityTok) }));
  for (const t of TIERS) {
    const ok = scored.filter(
      (x) => (!t.rest || x.f.restSame) && t.ok(x.f) && x.f.d <= t.dist,
    );
    if (!ok.length) continue;
    ok.sort((a, b) => nameScore(b.f) - nameScore(a.f) || a.f.d - b.f.d);
    const best = ok[0];
    const m = Number.isFinite(best.f.d) ? Math.round(best.f.d) : null;
    return {
      row: best.r,
      why: m != null ? `${t.why}(${m}m)` : t.why,
      meters: m,
    };
  }
  return null;
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = TS 가 돌려준 이름이 제미니 이름(현지어·영어)과 전혀 다르면 오배송으로 보고 붙이지 않는다(MATE→Pedro de Osma 실측).
//   "전혀 다르다" = 일반명사를 뺀 고유명사 조각이 하나도 안 겹칠 때(앞 5글자 같으면 같은 조각으로 봄 = Exposición/Exposition · Reserva/Reserve 표기 차 흡수). 오늘 6판 TS 64건 실측 = 진짜 오배송 2건만 거부.
const latin = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const properKey = (s: unknown) =>
  latin(s)
    .split(" ")
    .filter((w) => w && !GENERIC.has(w))
    .sort()
    .join(" ");
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
