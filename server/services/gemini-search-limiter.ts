/**
 * 💰 Gemini Google Search Grounding 일일 호출 제한 안전장치
 *
 * 배경: Gemini API의 Google Search Grounding은 유료 티어에서
 * 월 5,000건 무료, 초과 시 $14/1,000건 과금됨.
 * 크롤러가 무제한으로 호출하면 또 다른 요금 폭탄 발생 가능!
 *
 * 전략: 일일 160건 제한 (5,000 ÷ 31일 ≈ 161, 안전 마진 포함)
 * 한도 초과 시 → Google Search 없이 텍스트만으로 fallback
 */

// 일일 Google Search 호출 제한 (무료 범위: 5,000/월 ÷ 31 ≈ 161)
const DAILY_SEARCH_LIMIT = 160;

interface SearchTracker {
  date: string;
  count: number;
  blocked: number;
  bySource: Record<string, number>;
}

const searchTracker: SearchTracker = {
  date: new Date().toDateString(),
  count: 0,
  blocked: 0,
  bySource: {},
};

function resetIfNewDay(): void {
  const today = new Date().toDateString();
  if (searchTracker.date !== today) {
    console.log(
      `[GeminiSearch] 📊 어제 통계: ${searchTracker.count}건 사용, ${searchTracker.blocked}건 차단`,
      searchTracker.bySource,
    );
    searchTracker.date = today;
    searchTracker.count = 0;
    searchTracker.blocked = 0;
    searchTracker.bySource = {};
  }
}

/**
 * Google Search Grounding을 사용할 수 있는지 확인
 * @param source 호출 소스 (크롤러 이름) - 통계 추적용
 * @returns true면 Search 사용 가능, false면 텍스트만 사용해야 함
 */
export function canUseGoogleSearch(source: string = "unknown"): boolean {
  resetIfNewDay();

  if (searchTracker.count >= DAILY_SEARCH_LIMIT) {
    searchTracker.blocked++;
    if (searchTracker.blocked % 50 === 1) {
      console.warn(
        `[GeminiSearch] ⚠️ 일일 한도 초과 (${DAILY_SEARCH_LIMIT}건). ` +
          `오늘 ${searchTracker.blocked}건 차단됨. Search 없이 텍스트로 fallback.`,
      );
    }
    return false;
  }

  return true;
}

/**
 * Google Search 호출 1건 기록
 * canUseGoogleSearch() 확인 후 실제 API 호출 직전에 호출
 */
export function recordGoogleSearch(source: string = "unknown"): void {
  resetIfNewDay();
  searchTracker.count++;
  searchTracker.bySource[source] = (searchTracker.bySource[source] || 0) + 1;

  // 80% 사용 시 경고
  if (searchTracker.count === Math.floor(DAILY_SEARCH_LIMIT * 0.8)) {
    console.warn(
      `[GeminiSearch] ⚠️ 일일 한도 80% 도달 (${searchTracker.count}/${DAILY_SEARCH_LIMIT}). ` +
        `소스별: `,
      searchTracker.bySource,
    );
  }
}

/** Search 한도에서 제외할 소스 (유료 결제·무제한 사용자가 해당) — 한도 락 해제 */
const BYPASS_LIMIT_SOURCES = new Set(["instagram_celebrity"]);

/**
 * Gemini API 호출 시 사용할 config의 tools 설정을 반환
 * Google Search 한도 내면 [{ googleSearch: {} }], 초과면 undefined
 * BYPASS_LIMIT_SOURCES는 한도 무시하여 항상 Search 반환 (plain generate는 quota 0일 수 있음)
 */
export function getSearchTools(
  source: string = "unknown",
): [{ googleSearch: Record<string, never> }] | undefined {
  if (BYPASS_LIMIT_SOURCES.has(source) || canUseGoogleSearch(source)) {
    if (!BYPASS_LIMIT_SOURCES.has(source)) recordGoogleSearch(source);
    return [{ googleSearch: {} }];
  }
  return undefined;
}

/**
 * 현재 사용 통계 반환 (관리자 대시보드용)
 */
export function getSearchLimiterStatus(): {
  date: string;
  used: number;
  limit: number;
  blocked: number;
  remaining: number;
  percentUsed: number;
  bySource: Record<string, number>;
} {
  resetIfNewDay();
  return {
    date: searchTracker.date,
    used: searchTracker.count,
    limit: DAILY_SEARCH_LIMIT,
    blocked: searchTracker.blocked,
    remaining: Math.max(0, DAILY_SEARCH_LIMIT - searchTracker.count),
    percentUsed: Math.round((searchTracker.count / DAILY_SEARCH_LIMIT) * 100),
    bySource: { ...searchTracker.bySource },
  };
}
