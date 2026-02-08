/**
 * 크롤러 공통 유틸리티
 * 
 * 모든 크롤러가 공통으로 겪는 문제를 해결:
 * 1. Gemini 응답 JSON 파싱 실패 → 크래시 방지
 * 2. DB 저장 실패 → 에러 로깅 + 계속 진행
 * 3. 필드 타입 검증 → 잘못된 데이터 저장 방지
 */

/**
 * Gemini 응답에서 안전하게 JSON 추출 및 파싱
 * - {} 또는 [] 패턴 자동 감지
 * - 파싱 실패 시 null 반환 (크래시 방지)
 */
export function safeParseJSON<T = Record<string, any>>(
  text: string,
  source: string = "unknown"
): T | null {
  try {
    // JSON 객체 {} 또는 배열 [] 패턴 매칭
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!jsonMatch) {
      console.warn(`[${source}] JSON 패턴을 찾을 수 없음. 응답 길이: ${text.length}`);
      return null;
    }
    return JSON.parse(jsonMatch[0]) as T;
  } catch (error) {
    console.error(`[${source}] JSON 파싱 실패:`, error instanceof Error ? error.message : error);
    console.error(`[${source}] 원본 텍스트 (처음 200자): ${text.substring(0, 200)}`);
    return null;
  }
}

/**
 * 숫자 필드를 안전하게 변환
 * - 문자열 "123" → 123
 * - undefined/null → defaultValue
 * - 범위 검증 포함
 */
export function safeNumber(
  value: any,
  defaultValue: number | null = null,
  min?: number,
  max?: number
): number | null {
  if (value === undefined || value === null || value === "") return defaultValue;
  const num = Number(value);
  if (isNaN(num)) return defaultValue;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
}

/**
 * 문자열 필드를 안전하게 변환
 * - undefined/null → defaultValue
 * - maxLength로 잘라냄
 */
export function safeString(
  value: any,
  defaultValue: string | null = null,
  maxLength?: number
): string | null {
  if (value === undefined || value === null) return defaultValue;
  const str = String(value).trim();
  if (str === "") return defaultValue;
  if (maxLength && str.length > maxLength) return str.substring(0, maxLength);
  return str;
}

/**
 * 평점 필드를 안전하게 변환 (0~5 또는 0~10 범위)
 */
export function safeRating(value: any, scale: 5 | 10 = 5): number | null {
  return safeNumber(value, null, 0, scale);
}

/**
 * 신뢰도 점수를 안전하게 변환 (0~1 범위)
 */
export function safeConfidence(value: any, defaultValue: number = 0.5): number {
  return safeNumber(value, defaultValue, 0, 1) ?? defaultValue;
}

/**
 * DB 작업을 안전하게 실행 (에러 시 크래시 방지)
 */
export async function safeDbOperation<T>(
  operation: () => Promise<T>,
  source: string,
  context: string = ""
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(
      `[${source}] DB 작업 실패${context ? ` (${context})` : ""}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * 가격 필드를 안전하게 변환 (0 허용, 음수 불허)
 */
export function safePrice(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (isNaN(num) || num < 0) return null;
  return num;
}

/**
 * 통화 코드를 안전하게 변환 (3자리 대문자)
 */
export function safeCurrency(value: any, defaultCurrency: string = "USD"): string {
  if (!value || typeof value !== "string") return defaultCurrency;
  const cleaned = value.trim().toUpperCase();
  if (cleaned.length !== 3) return defaultCurrency;
  return cleaned;
}
