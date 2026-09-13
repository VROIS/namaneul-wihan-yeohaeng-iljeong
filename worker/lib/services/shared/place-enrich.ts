/** ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 정규화·타입 유틸 단일 모듈 */

export type MatchedBy =
  | "pid"
  | "uri"
  | "address"
  | "coords"
  | "name_local"
  | "name_en"
  | "name_ko"
  | "none";
export type MatchTier = "confirmed" | "suspect" | "none";
const INVARIANT_MATCH: MatchedBy[] = [
  "pid",
  "uri",
  "address",
  "coords",
  "name_local",
];
export const tierOf = (m: MatchedBy): MatchTier =>
  m === "none" ? "none" : INVARIANT_MATCH.includes(m) ? "confirmed" : "suspect";

export const normAddr = (s: string | null | undefined): string =>
  (s || "")
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normName = (s: string | null | undefined): string =>
  (s || "").trim().toLowerCase();

export const nameKeys = (x: {
  nameEn?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
}): string[] =>
  [normName(x.nameEn), normName(x.nameLocal), normName(x.nameKo)].filter(
    Boolean,
  );

// ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = 고유명사 키 = "첫 글자 대문자=고유명사"(라틴권 공통) + 업종/시설어 최소사전 제거.
const GENERIC_FACILITY = new Set([
  "restaurant",
  "brasserie",
  "bistro",
  "cafe",
  "bar",
  "hotel",
  "auberge",
  "taverne",
  "pub",
  "pizzeria",
  "trattoria",
  "museum",
  "musee",
  "gallery",
  "galerie",
  "galeries",
  "theatre",
  "theater",
  "opera",
  "cinema",
  "palais",
  "chateau",
  "castle",
  "manor",
  "villa",
  "domaine",
  "maison",
  "house",
  "abbaye",
  "abbey",
  "couvent",
  "monastere",
  "monastery",
  "basilique",
  "basilica",
  "cathedrale",
  "cathedral",
  "eglise",
  "church",
  "chapelle",
  "chapel",
  "temple",
  "mosquee",
  "synagogue",
  "parc",
  "park",
  "jardin",
  "garden",
  "square",
  "place",
  "plaza",
  "forest",
  "foret",
  "bois",
  "tour",
  "tower",
  "pont",
  "bridge",
  "porte",
  "gate",
  "phare",
  "lighthouse",
  "fontaine",
  "fountain",
  "statue",
  "monument",
  "avenue",
  "rue",
  "street",
  "boulevard",
  "allee",
  "chemin",
  "route",
  "promenade",
  "quai",
  "magasin",
  "store",
  "boutique",
  "marche",
  "market",
  "halles",
  "centre",
  "center",
  "mall",
  "champagne",
  "cave",
  "caves",
  "vignoble",
  "winery",
  "distillerie",
]);
export const properNameKey = (s: string | null | undefined): string => {
  const raw = (s || "").trim();
  if (!raw) return "";
  const allSame = raw === raw.toUpperCase() || raw === raw.toLowerCase(); // 전부대/소문자 = 대소문자 정보 없음
  return raw
    .replace(/[^\p{L}\p{N} ]/gu, " ") // 구두점→공백 (유니코드 문자·숫자 보존 = 다언어)
    .split(/\s+/)
    .filter((t) => t && (allSame || /^\p{Lu}/u.test(t))) // 대문자 시작 토큰만(고유명사). 전부대/소문자면 전 토큰.
    .map((t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))
    .filter((t) => !GENERIC_FACILITY.has(t)) // 업종/시설어(대문자여도) 제거
    .sort()
    .join("");
};
//   ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = name_ko(한글) 제외 = "첫 대문자=고유명사" 원칙 불가.
export const properKeys = (x: {
  nameEn?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
}): Set<string> => {
  const out = new Set<string>();
  for (const raw of [x.nameEn, x.nameLocal]) {
    const k = properNameKey(raw);
    if (k.length >= 3) out.add(k);
  }
  return out;
};
