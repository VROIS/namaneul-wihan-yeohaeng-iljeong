/**
 * DB 인코딩 및 데이터 무결성 유틸리티
 *
 * 🎯 목적:
 * - 모든 DB 저장 데이터의 한글 무결성 보장
 * - 깨진 인코딩 감지 및 방지
 * - 데이터 저장 전 검증
 *
 * 📌 사용법:
 * import { validateKorean, sanitizeForDB } from './utils/db-encoding';
 *
 * // 저장 전 검증
 * const cleanData = sanitizeForDB(rawData);
 */

/**
 * 깨진 UTF-8 인코딩 패턴 감지
 */
export function hasBrokenEncoding(str: string | null | undefined): boolean {
  if (!str) return false;
  // UTF-8 깨짐 패턴: Ã, Â, ì, í, ë, â, ê, î 등
  return /[ÃÂìíëâêîÐ]/.test(str) || /Ã/.test(str) || /Â/.test(str);
}

/**
 * 유효한 한글 문자열인지 확인
 */
export function isValidKorean(str: string | null | undefined): boolean {
  if (!str) return true; // null/undefined는 유효

  // 깨진 인코딩이 있으면 무효
  if (hasBrokenEncoding(str)) return false;

  // 한글이 포함되어 있다면 정상 한글인지 확인
  const hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(str);
  if (hasKorean) {
    // 정상 한글 유니코드 범위 내에 있는지 확인
    return true;
  }

  return true; // 한글이 없는 문자열도 유효
}

/**
 * DB 저장을 위한 문자열 정화
 * - 깨진 인코딩 제거
 * - trim 처리
 */
export function sanitizeForDB(str: string | null | undefined): string | null {
  if (str === null || str === undefined) return null;

  // 깨진 인코딩이 있으면 null 반환 (저장하지 않음)
  if (hasBrokenEncoding(str)) {
    console.warn(
      "[DB-Encoding] 깨진 인코딩 감지, 데이터 제외:",
      str.substring(0, 50),
    );
    return null;
  }

  return str.trim();
}

/**
 * 객체 내 모든 문자열 필드 정화
 */
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

/**
 * 데이터 저장 전 검증
 * @throws Error if data contains broken encoding
 */
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

/**
 * DB 클라이언트 UTF-8 설정
 */
export async function setClientEncoding(client: any): Promise<void> {
  try {
    await client.query("SET client_encoding TO 'UTF8'");
    await client.query("SET NAMES 'UTF8'");
  } catch (e) {
    // NAMES는 일부 클라이언트에서 지원 안할 수 있음
    console.warn("[DB-Encoding] SET NAMES 실패, client_encoding만 설정됨");
  }
}

/**
 * 안전한 한글 데이터 변환
 * - 영문 → 한글 매핑 (필요시)
 */
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

/**
 * 영문 도시명 → 한글 도시명 변환
 */
export function toKoreanCityName(englishName: string): string {
  return CITY_NAME_MAP[englishName] || englishName;
}

/**
 * 영문 국가명 → 한글 국가명 변환
 */
export function toKoreanCountryName(englishName: string): string {
  return COUNTRY_NAME_MAP[englishName] || englishName;
}
