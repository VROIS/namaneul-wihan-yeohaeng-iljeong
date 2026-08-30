export function hasBrokenEncoding(str: string | null | undefined): boolean {
  if (!str) return false;
  return /[ÃÂìíëâêîÐ]/.test(str) || /Ã/.test(str) || /Â/.test(str);
}

export function isValidKorean(str: string | null | undefined): boolean {
  if (!str) return true; // null/undefined는 유효

  if (hasBrokenEncoding(str)) return false;

  const hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(str);
  if (hasKorean) {
    return true;
  }

  return true; // 한글이 없는 문자열도 유효
}

export function sanitizeForDB(str: string | null | undefined): string | null {
  if (str === null || str === undefined) return null;

  if (hasBrokenEncoding(str)) {
    console.warn(
      "[DB-Encoding] 깨진 인코딩 감지, 데이터 제외:",
      str.substring(0, 50),
    );
    return null;
  }

  return str.trim();
}

export function sanitizeObjectForDB<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    const value = sanitized[key];

    if (typeof value === "string") {
      (sanitized as any)[key] = sanitizeForDB(value);
    } else if (Array.isArray(value)) {
      (sanitized as any)[key] = value.map((item) =>
        typeof item === "string" ? sanitizeForDB(item) : item,
      );
    }
  }

  return sanitized;
}

export function validateBeforeSave(
  data: Record<string, any>,
  tableName: string,
): void {
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && hasBrokenEncoding(value)) {
      throw new Error(
        `[${tableName}] 필드 "${key}"에 깨진 인코딩 감지. 저장 거부.`,
      );
    }
  }
}

export async function setClientEncoding(client: any): Promise<void> {
  try {
    await client.query("SET client_encoding TO 'UTF8'");
    await client.query("SET NAMES 'UTF8'");
  } catch (e) {
    console.warn("[DB-Encoding] SET NAMES 실패, client_encoding만 설정됨");
  }
}

export const CITY_NAME_MAP: Record<string, string> = {
  Seoul: "서울",
  Tokyo: "도쿄",
  Osaka: "오사카",
  Paris: "파리",
  Rome: "로마",
  London: "런던",
  Barcelona: "바르셀로나",
  Amsterdam: "암스테르담",
  Berlin: "베를린",
  Prague: "프라하",
  Vienna: "비엔나",
  Budapest: "부다페스트",
  Florence: "피렌체",
  Venice: "베니스",
  Milan: "밀라노",
  Madrid: "마드리드",
  Lisbon: "리스본",
  Munich: "뮌헨",
  Zurich: "취리히",
  Brussels: "브뤼셀",
  Athens: "아테네",
  Dubrovnik: "두브로브니크",
  Nice: "니스",
  Monaco: "모나코",
  Copenhagen: "코펜하겐",
  Stockholm: "스톡홀름",
  Oslo: "오슬로",
  Edinburgh: "에든버러",
  Dublin: "더블린",
  Interlaken: "인터라켄",
  Santorini: "산토리니",
  Seville: "세비야",
  Porto: "포르투",
  Bangkok: "방콕",
  Singapore: "싱가포르",
  "Hong Kong": "홍콩",
  "Da Nang": "다낭",
  Hanoi: "하노이",
  "New York": "뉴욕",
};

export const COUNTRY_NAME_MAP: Record<string, string> = {
  "South Korea": "대한민국",
  Japan: "일본",
  France: "프랑스",
  Italy: "이탈리아",
  "United Kingdom": "영국",
  Spain: "스페인",
  Netherlands: "네덜란드",
  Germany: "독일",
  "Czech Republic": "체코",
  Austria: "오스트리아",
  Hungary: "헝가리",
  Portugal: "포르투갈",
  Switzerland: "스위스",
  Belgium: "벨기에",
  Greece: "그리스",
  Croatia: "크로아티아",
  Monaco: "모나코",
  Denmark: "덴마크",
  Sweden: "스웨덴",
  Norway: "노르웨이",
  Ireland: "아일랜드",
  Thailand: "태국",
  Singapore: "싱가포르",
  Vietnam: "베트남",
  USA: "미국",
};

export function toKoreanCityName(englishName: string): string {
  return CITY_NAME_MAP[englishName] || englishName;
}

export function toKoreanCountryName(englishName: string): string {
  return COUNTRY_NAME_MAP[englishName] || englishName;
}
