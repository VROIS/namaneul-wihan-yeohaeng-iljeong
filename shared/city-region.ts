// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 도시 카드 대륙 탭 = 나라 코드 → 탭 1벌(앱 화면·관리자 대시보드 순서 화면이 같이 쓴다) (정본 2026-11-15)
export type RegionKey =
  | "france"
  | "europe"
  | "asia"
  | "northAmerica"
  | "southAmerica"
  | "africa"
  | "oceania";

export const REGION_KEYS: readonly RegionKey[] = [
  "france",
  "europe",
  "asia",
  "northAmerica",
  "southAmerica",
  "africa",
  "oceania",
];

const CODES: Record<Exclude<RegionKey, "france">, readonly string[]> = {
  europe: [
    "AD",
    "AT",
    "BE",
    "CH",
    "CZ",
    "DE",
    "DK",
    "ES",
    "FI",
    "GB",
    "GR",
    "HR",
    "HU",
    "IE",
    "IS",
    "IT",
    "LU",
    "MC",
    "NL",
    "NO",
    "PL",
    "PT",
    "SE",
    "TR",
  ],
  asia: [
    "CN",
    "HK",
    "ID",
    "IN",
    "JP",
    "KR",
    "MY",
    "PH",
    "SG",
    "TH",
    "TW",
    "VN",
  ],
  northAmerica: ["CA", "MX", "US"],
  southAmerica: ["AR", "BR", "CL", "CO", "PE"],
  africa: ["KE", "MA", "TN"],
  oceania: ["AU", "NZ"],
};

export function regionOfCountry(code?: string | null): RegionKey {
  const c = (code || "").toUpperCase();
  if (c === "FR") return "france";
  for (const k of Object.keys(CODES) as (keyof typeof CODES)[])
    if (CODES[k].includes(c)) return k;
  return "europe";
}
