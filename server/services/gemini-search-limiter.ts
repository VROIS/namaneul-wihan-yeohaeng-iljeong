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

export function recordGoogleSearch(source: string = "unknown"): void {
  resetIfNewDay();
  searchTracker.count++;
  searchTracker.bySource[source] = (searchTracker.bySource[source] || 0) + 1;

  if (searchTracker.count === Math.floor(DAILY_SEARCH_LIMIT * 0.8)) {
    console.warn(
      `[GeminiSearch] ⚠️ 일일 한도 80% 도달 (${searchTracker.count}/${DAILY_SEARCH_LIMIT}). ` +
        `소스별: `,
      searchTracker.bySource,
    );
  }
}

const BYPASS_LIMIT_SOURCES = new Set(["instagram_celebrity"]);

export function getSearchTools(
  source: string = "unknown",
): [{ googleSearch: Record<string, never> }] | undefined {
  if (BYPASS_LIMIT_SOURCES.has(source) || canUseGoogleSearch(source)) {
    if (!BYPASS_LIMIT_SOURCES.has(source)) recordGoogleSearch(source);
    return [{ googleSearch: {} }];
  }
  return undefined;
}

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
