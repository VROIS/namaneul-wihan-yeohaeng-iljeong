import fs from "fs";
import path from "path";

export interface McpFinalCity {
  nameKo: string;
  nameEn: string;
  countryCode?: string;
}

export type McpCityPhase = "bts2026" | "france30" | "europe30";

export interface McpRankedCity extends McpFinalCity {
  phase: McpCityPhase;
  rank: number;
  basis?: string;
}

const RUNTIME_CITY_FILE_PATH =
  process.env.MCP_RAW_CITY_FILE_PATH ||
  path.join(process.cwd(), "dev", "mcp-final-cities.json");

const DEFAULT_RANK_BASIS = "euromonitor_un_tourism_2024_2025";
const BTS2026_BASIS = "bts_arirang_world_tour_2026_2027";

const DRAFT_BTS2026: McpRankedCity[] = [
  {
    phase: "bts2026",
    rank: 1,
    nameKo: "고양",
    nameEn: "Goyang",
    countryCode: "KR",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 2,
    nameKo: "도쿄",
    nameEn: "Tokyo",
    countryCode: "JP",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 3,
    nameKo: "탬파",
    nameEn: "Tampa",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 4,
    nameKo: "엘파소",
    nameEn: "El Paso",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 5,
    nameKo: "멕시코시티",
    nameEn: "Mexico City",
    countryCode: "MX",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 6,
    nameKo: "스탠퍼드",
    nameEn: "Stanford",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 7,
    nameKo: "라스베이거스",
    nameEn: "Las Vegas",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 8,
    nameKo: "부산",
    nameEn: "Busan",
    countryCode: "KR",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 9,
    nameKo: "마드리드",
    nameEn: "Madrid",
    countryCode: "ES",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 10,
    nameKo: "브뤼셀",
    nameEn: "Brussels",
    countryCode: "BE",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 11,
    nameKo: "런던",
    nameEn: "London",
    countryCode: "GB",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 12,
    nameKo: "뮌헨",
    nameEn: "Munich",
    countryCode: "DE",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 13,
    nameKo: "파리",
    nameEn: "Paris",
    countryCode: "FR",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 14,
    nameKo: "이스트러더퍼드",
    nameEn: "East Rutherford",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 15,
    nameKo: "폭스버러",
    nameEn: "Foxborough",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 16,
    nameKo: "볼티모어",
    nameEn: "Baltimore",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 17,
    nameKo: "알링턴",
    nameEn: "Arlington",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 18,
    nameKo: "토론토",
    nameEn: "Toronto",
    countryCode: "CA",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 19,
    nameKo: "시카고",
    nameEn: "Chicago",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 20,
    nameKo: "로스앤젤레스",
    nameEn: "Los Angeles",
    countryCode: "US",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 21,
    nameKo: "보고타",
    nameEn: "Bogotá",
    countryCode: "CO",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 22,
    nameKo: "리마",
    nameEn: "Lima",
    countryCode: "PE",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 23,
    nameKo: "산티아고",
    nameEn: "Santiago",
    countryCode: "CL",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 24,
    nameKo: "부에노스아이레스",
    nameEn: "Buenos Aires",
    countryCode: "AR",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 25,
    nameKo: "상파울루",
    nameEn: "São Paulo",
    countryCode: "BR",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 26,
    nameKo: "가오슝",
    nameEn: "Kaohsiung",
    countryCode: "TW",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 27,
    nameKo: "방콕",
    nameEn: "Bangkok",
    countryCode: "TH",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 28,
    nameKo: "쿠알라룸푸르",
    nameEn: "Kuala Lumpur",
    countryCode: "MY",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 29,
    nameKo: "싱가포르",
    nameEn: "Singapore",
    countryCode: "SG",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 30,
    nameKo: "자카르타",
    nameEn: "Jakarta",
    countryCode: "ID",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 31,
    nameKo: "멜버른",
    nameEn: "Melbourne",
    countryCode: "AU",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 32,
    nameKo: "시드니",
    nameEn: "Sydney",
    countryCode: "AU",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 33,
    nameKo: "홍콩",
    nameEn: "Hong Kong",
    countryCode: "HK",
    basis: BTS2026_BASIS,
  },
  {
    phase: "bts2026",
    rank: 34,
    nameKo: "마닐라",
    nameEn: "Manila",
    countryCode: "PH",
    basis: BTS2026_BASIS,
  },
];

const DRAFT_FRANCE_30: McpRankedCity[] = [
  {
    phase: "france30",
    rank: 1,
    nameKo: "파리",
    nameEn: "Paris",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 2,
    nameKo: "니스",
    nameEn: "Nice",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 3,
    nameKo: "리옹",
    nameEn: "Lyon",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 4,
    nameKo: "마르세유",
    nameEn: "Marseille",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 5,
    nameKo: "스트라스부르",
    nameEn: "Strasbourg",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 6,
    nameKo: "보르도",
    nameEn: "Bordeaux",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 7,
    nameKo: "릴",
    nameEn: "Lille",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 8,
    nameKo: "칸",
    nameEn: "Cannes",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 9,
    nameKo: "안시",
    nameEn: "Annecy",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 10,
    nameKo: "루르드",
    nameEn: "Lourdes",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 11,
    nameKo: "툴루즈",
    nameEn: "Toulouse",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 12,
    nameKo: "몽펠리에",
    nameEn: "Montpellier",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 13,
    nameKo: "아비뇽",
    nameEn: "Avignon",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 14,
    nameKo: "엑상프로방스",
    nameEn: "Aix-en-Provence",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 15,
    nameKo: "콜마르",
    nameEn: "Colmar",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 16,
    nameKo: "생말로",
    nameEn: "Saint-Malo",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 17,
    nameKo: "베르사유",
    nameEn: "Versailles",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 18,
    nameKo: "디종",
    nameEn: "Dijon",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 19,
    nameKo: "랭스",
    nameEn: "Reims",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 20,
    nameKo: "루앙",
    nameEn: "Rouen",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 21,
    nameKo: "샤모니-몽블랑",
    nameEn: "Chamonix-Mont-Blanc",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 22,
    nameKo: "라로셸",
    nameEn: "La Rochelle",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 23,
    nameKo: "비아리츠",
    nameEn: "Biarritz",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 24,
    nameKo: "앙티브",
    nameEn: "Antibes",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 25,
    nameKo: "도빌",
    nameEn: "Deauville",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 26,
    nameKo: "낭트",
    nameEn: "Nantes",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 27,
    nameKo: "카르카손",
    nameEn: "Carcassonne",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 28,
    nameKo: "투르",
    nameEn: "Tours",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 29,
    nameKo: "에즈",
    nameEn: "Eze",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "france30",
    rank: 30,
    nameKo: "생트로페",
    nameEn: "Saint-Tropez",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
];

const DRAFT_EUROPE_30: McpRankedCity[] = [
  {
    phase: "europe30",
    rank: 1,
    nameKo: "이스탄불",
    nameEn: "Istanbul",
    countryCode: "TR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 2,
    nameKo: "런던",
    nameEn: "London",
    countryCode: "GB",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 3,
    nameKo: "파리",
    nameEn: "Paris",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 4,
    nameKo: "안탈리아",
    nameEn: "Antalya",
    countryCode: "TR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 5,
    nameKo: "로마",
    nameEn: "Rome",
    countryCode: "IT",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 6,
    nameKo: "바르셀로나",
    nameEn: "Barcelona",
    countryCode: "ES",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 7,
    nameKo: "마드리드",
    nameEn: "Madrid",
    countryCode: "ES",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 8,
    nameKo: "암스테르담",
    nameEn: "Amsterdam",
    countryCode: "NL",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 9,
    nameKo: "밀라노",
    nameEn: "Milan",
    countryCode: "IT",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 10,
    nameKo: "프라하",
    nameEn: "Prague",
    countryCode: "CZ",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 11,
    nameKo: "빈",
    nameEn: "Vienna",
    countryCode: "AT",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 12,
    nameKo: "베를린",
    nameEn: "Berlin",
    countryCode: "DE",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 13,
    nameKo: "아테네",
    nameEn: "Athens",
    countryCode: "GR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 14,
    nameKo: "리스본",
    nameEn: "Lisbon",
    countryCode: "PT",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 15,
    nameKo: "베네치아",
    nameEn: "Venice",
    countryCode: "IT",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 16,
    nameKo: "부다페스트",
    nameEn: "Budapest",
    countryCode: "HU",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 17,
    nameKo: "뮌헨",
    nameEn: "Munich",
    countryCode: "DE",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 18,
    nameKo: "더블린",
    nameEn: "Dublin",
    countryCode: "IE",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 19,
    nameKo: "플로렌스",
    nameEn: "Florence",
    countryCode: "IT",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 20,
    nameKo: "코펜하겐",
    nameEn: "Copenhagen",
    countryCode: "DK",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 21,
    nameKo: "크라쿠프",
    nameEn: "Krakow",
    countryCode: "PL",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 22,
    nameKo: "포르투",
    nameEn: "Porto",
    countryCode: "PT",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 23,
    nameKo: "세비야",
    nameEn: "Seville",
    countryCode: "ES",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 24,
    nameKo: "에든버러",
    nameEn: "Edinburgh",
    countryCode: "GB",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 25,
    nameKo: "취리히",
    nameEn: "Zurich",
    countryCode: "CH",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 26,
    nameKo: "니스",
    nameEn: "Nice",
    countryCode: "FR",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 27,
    nameKo: "스톡홀름",
    nameEn: "Stockholm",
    countryCode: "SE",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 28,
    nameKo: "레이캬비크",
    nameEn: "Reykjavik",
    countryCode: "IS",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 29,
    nameKo: "발렌시아",
    nameEn: "Valencia",
    countryCode: "ES",
    basis: DEFAULT_RANK_BASIS,
  },
  {
    phase: "europe30",
    rank: 30,
    nameKo: "나폴리",
    nameEn: "Naples",
    countryCode: "IT",
    basis: DEFAULT_RANK_BASIS,
  },
];

function isValidCity(v: any): v is McpFinalCity {
  return !!v && typeof v.nameKo === "string" && typeof v.nameEn === "string";
}

function isValidRankedCity(v: any): v is McpRankedCity {
  return (
    isValidCity(v) &&
    (v.phase === "bts2026" ||
      v.phase === "france30" ||
      v.phase === "europe30") &&
    Number.isFinite(Number(v.rank))
  );
}

function loadRuntimeRankedCitiesFromFile(): McpRankedCity[] | null {
  try {
    if (!fs.existsSync(RUNTIME_CITY_FILE_PATH)) return null;
    const raw = fs.readFileSync(RUNTIME_CITY_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const normalized = parsed.filter(isValidCity).map((c, idx) => ({
        phase: "france30" as const,
        rank: idx + 1,
        ...c,
        basis: DEFAULT_RANK_BASIS,
      }));
      return normalized.length > 0 ? normalized : null;
    }

    const btsRaw = Array.isArray(parsed?.bts2026) ? parsed.bts2026 : [];
    const franceRaw = Array.isArray(parsed?.france30) ? parsed.france30 : [];
    const europeRaw = Array.isArray(parsed?.europe30) ? parsed.europe30 : [];
    const merged = [
      ...btsRaw.map((c: any, idx: number) => ({
        phase: "bts2026",
        rank: Number(c?.rank || idx + 1),
        ...c,
      })),
      ...franceRaw.map((c: any, idx: number) => ({
        phase: "france30",
        rank: Number(c?.rank || idx + 1),
        ...c,
      })),
      ...europeRaw.map((c: any, idx: number) => ({
        phase: "europe30",
        rank: Number(c?.rank || idx + 1),
        ...c,
      })),
    ].filter(isValidRankedCity);
    if (merged.length > 0) return merged;

    const legacy = Array.isArray(parsed?.cities)
      ? parsed.cities.filter(isValidCity)
      : [];
    if (legacy.length > 0) {
      return legacy.map((c: McpFinalCity, idx: number) => ({
        phase: "france30",
        rank: idx + 1,
        ...c,
        basis: DEFAULT_RANK_BASIS,
      }));
    }
    return null;
  } catch (error) {
    console.warn("[MCP_FINAL_CITIES] runtime city file load failed:", error);
    return null;
  }
}

function getDraftRankedCities(): McpRankedCity[] {
  return [...DRAFT_BTS2026, ...DRAFT_FRANCE_30, ...DRAFT_EUROPE_30];
}

function buildAppExecutionOrder(all: McpRankedCity[]): McpRankedCity[] {
  const seen = new Set<string>();
  const out: McpRankedCity[] = [];
  const pushUnique = (city: McpRankedCity | undefined) => {
    if (!city) return;
    const key = city.nameEn.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(city);
  };

  const bts = all
    .filter((c) => c.phase === "bts2026")
    .sort((a, b) => a.rank - b.rank);
  for (const c of bts) pushUnique(c);

  const france = all
    .filter((c) => c.phase === "france30")
    .sort((a, b) => a.rank - b.rank);
  for (const c of france) pushUnique(c);

  const europe = all
    .filter((c) => c.phase === "europe30")
    .sort((a, b) => a.rank - b.rank);
  for (const c of europe) pushUnique(c);

  return out;
}

export function getMcpPhaseCities(phase: McpCityPhase): McpRankedCity[] {
  const all = loadRuntimeRankedCitiesFromFile() || getDraftRankedCities();
  return all.filter((c) => c.phase === phase).sort((a, b) => a.rank - b.rank);
}

export function getMcpFinalCities(): McpFinalCity[] {
  const all = loadRuntimeRankedCitiesFromFile() || getDraftRankedCities();
  const ordered = buildAppExecutionOrder(all);
  return ordered.map((c) => ({
    nameKo: c.nameKo,
    nameEn: c.nameEn,
    countryCode: c.countryCode,
  }));
}

export function getMcpExecutionOrder(): McpRankedCity[] {
  const all = loadRuntimeRankedCitiesFromFile() || getDraftRankedCities();
  return buildAppExecutionOrder(all);
}

export function getMcpExecutionCityNamesEn(): string[] {
  return getMcpExecutionOrder().map((c) => c.nameEn);
}

export function getMcpExecutionCityNamesKo(): string[] {
  return getMcpExecutionOrder().map((c) => c.nameKo);
}

export function getMcpFinalCityNamesKo(): string[] {
  return getMcpFinalCities().map((c) => c.nameKo);
}

export function getMcpFinalCityNamesEn(): string[] {
  return getMcpFinalCities().map((c) => c.nameEn);
}

export function getMcpPrimaryCity(): McpFinalCity {
  return (
    getMcpFinalCities()[0] || {
      nameKo: "고양",
      nameEn: "Goyang",
      countryCode: "KR",
    }
  );
}

export function getMcpCitySourceMeta(): {
  source: "runtime_file" | "draft_default";
  path: string;
  count: number;
  bts2026Count: number;
  franceCount: number;
  europeCount: number;
  distinctCount: number;
  duplicateCount: number;
} {
  const runtime = loadRuntimeRankedCitiesFromFile();
  const ranked = runtime || getDraftRankedCities();
  const bts2026Count = ranked.filter((c) => c.phase === "bts2026").length;
  const franceCount = ranked.filter((c) => c.phase === "france30").length;
  const europeCount = ranked.filter((c) => c.phase === "europe30").length;
  const distinctCount = new Set(
    ranked.map((c) => c.nameEn.toLowerCase().trim()),
  ).size;
  const duplicateCount = ranked.length - distinctCount;
  if (runtime) {
    return {
      source: "runtime_file",
      path: RUNTIME_CITY_FILE_PATH,
      count: ranked.length,
      bts2026Count,
      franceCount,
      europeCount,
      distinctCount,
      duplicateCount,
    };
  }
  return {
    source: "draft_default",
    path: RUNTIME_CITY_FILE_PATH,
    count: ranked.length,
    bts2026Count,
    franceCount,
    europeCount,
    distinctCount,
    duplicateCount,
  };
}
