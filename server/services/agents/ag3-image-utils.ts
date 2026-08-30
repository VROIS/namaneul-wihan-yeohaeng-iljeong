export function isUsableImageUrl(url: string): boolean {
  const u = url.toLowerCase().trim();
  if (!u) return false;
  if (u.includes("example.com")) return false;
  // ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 SSOT 통합 = Google CDN URL 허용
  if (
    u.includes("fbcdn.net") ||
    u.includes("cdninstagram") ||
    u.includes("cdn.fbsbx.com")
  )
    return false;
  if (
    u.includes("naver.com") ||
    u.includes("tistory.com") ||
    u.includes("daum.net")
  )
    return false;
  if (
    (u.includes("instagram.com/p/") || u.includes("instagram.com/reel/")) &&
    !u.includes("/media/")
  )
    return false;
  if (u.includes("wikimedia.org") || u.includes("wikipedia.org")) return true;
  if (u.includes("i.ytimg.com") || u.includes("unsplash.com")) return true;
  return true; // 기타는 시도
}
