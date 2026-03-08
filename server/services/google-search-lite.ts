/**
 * Google 검색 경량 스크래퍼 — Chromium 없이 fetch + HTML 파싱
 * MCP Python/Playwright 대체: 메모리 0MB, Koyeb 512MB 호환
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** HTML 엔티티 디코딩 */
function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

/** HTML 태그 제거 */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Google 검색 (fetch 기반, Chromium 불필요)
 * @returns 검색 결과 텍스트 (MCP googleSearch 호환 형식)
 */
export async function googleSearchLite(query: string, num: number = 10): Promise<string> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encoded}&hl=en&num=${num + 5}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": randomUA(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate",
      "Connection": "keep-alive",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Google search HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const results = parseGoogleResults(html);

  if (results.length === 0) {
    // Fallback: 원시 HTML에서 URL만 추출
    return extractUrlsFromHtml(html);
  }

  // MCP googleSearch 호환 형식으로 반환
  return results
    .slice(0, num)
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
    .join("\n\n");
}

/** Google 검색 결과 HTML 파싱 */
function parseGoogleResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // 방법 1: <a href="/url?q=..." 패턴 (Google 검색 결과 링크)
  const urlPattern = /<a[^>]+href="\/url\?q=([^&"]+)[^"]*"/g;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(html)) !== null) {
    const rawUrl = decodeURIComponent(match[1]);
    if (isValidResultUrl(rawUrl)) {
      // URL 주변 텍스트에서 제목과 스니펫 추출
      const context = html.slice(Math.max(0, match.index - 500), match.index + 1000);
      const title = extractTitle(context) || rawUrl;
      const snippet = extractSnippet(context);
      results.push({ title, url: rawUrl, snippet });
    }
  }

  // 방법 2: <a href="https://..." 직접 링크 (일부 Google 결과)
  if (results.length < 3) {
    const directPattern = /<a[^>]+href="(https?:\/\/(?:www\.)?(?:tiktok\.com|instagram\.com)[^"]+)"/g;
    while ((match = directPattern.exec(html)) !== null) {
      const rawUrl = decodeHtml(match[1]);
      if (isValidResultUrl(rawUrl) && !results.some((r) => r.url === rawUrl)) {
        const context = html.slice(Math.max(0, match.index - 500), match.index + 1000);
        const title = extractTitle(context) || rawUrl;
        const snippet = extractSnippet(context);
        results.push({ title, url: rawUrl, snippet });
      }
    }
  }

  return results;
}

/** 검색 결과 URL 유효성 확인 */
function isValidResultUrl(url: string): boolean {
  if (!url.startsWith("http")) return false;
  // Google 내부 링크 제외
  if (url.includes("google.com/") && !url.includes("google.com/maps")) return false;
  if (url.includes("googleapis.com")) return false;
  if (url.includes("gstatic.com")) return false;
  if (url.includes("youtube.com/") && url.includes("accounts.")) return false;
  return true;
}

/** HTML 컨텍스트에서 제목 추출 */
function extractTitle(context: string): string {
  // <h3> 태그 안의 텍스트
  const h3Match = context.match(/<h3[^>]*>([^<]+(?:<[^>]*>[^<]*)*)<\/h3>/i);
  if (h3Match) return decodeHtml(stripTags(h3Match[1])).trim();
  // <a> 태그 안의 텍스트
  const aMatch = context.match(/<a[^>]*>([^<]+)<\/a>/i);
  if (aMatch) return decodeHtml(stripTags(aMatch[1])).trim();
  return "";
}

/** HTML 컨텍스트에서 스니펫 추출 */
function extractSnippet(context: string): string {
  // data-content-feature="1" 또는 class="VwiC3b" 등의 스니펫 영역
  const snippetPatterns = [
    /<span[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>(.*?)<\/span>/is,
    /<div[^>]*class="[^"]*BNeawe s3v9rd[^"]*"[^>]*>(.*?)<\/div>/is,
    /<div[^>]*data-content-feature[^>]*>(.*?)<\/div>/is,
  ];
  for (const pat of snippetPatterns) {
    const m = context.match(pat);
    if (m) return decodeHtml(stripTags(m[1])).trim().slice(0, 200);
  }
  return "";
}

/** 원시 HTML에서 TikTok/Instagram URL만 추출 (fallback) */
function extractUrlsFromHtml(html: string): string {
  const urls: string[] = [];
  const urlPattern = /https?:\/\/(?:www\.)?(?:tiktok\.com\/@[^/\s"']+\/video\/\d+|instagram\.com\/(?:[^/\s"']+\/)?(?:reel|p)\/[A-Za-z0-9_-]+)/gi;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = urlPattern.exec(html)) !== null) {
    const url = match[0];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  if (urls.length === 0) return "No results found.";

  // URL 주변 텍스트도 포함 (장소 매칭용)
  return urls
    .map((url, i) => {
      const idx = html.indexOf(url);
      const context = stripTags(decodeHtml(html.slice(Math.max(0, idx - 300), idx + url.length + 300)));
      return `${i + 1}. URL: ${url}\n   ${context.slice(0, 200)}`;
    })
    .join("\n\n");
}
