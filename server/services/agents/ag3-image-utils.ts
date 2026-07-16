// 이미지 URL 사용가능 판정 = ag3-data-matcher 분리(2026-07-16 §0 슬림화, 순수 이동)

/** <img>로 사용 가능한 URL인지 (인스타 post URL, 네이버/티스토리 등 차단 도메인 제외) */
export function isUsableImageUrl(url: string): boolean {
  const u = url.toLowerCase().trim();
  if (!u) return false;
  if (u.includes("example.com")) return false;
  // 🚫 전멸 확인된 소스 차단 (0013 DB 정리와 동일)
  // ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 SSOT 통합 = Google CDN URL 허용
  // = 메인앱이 직접 로드 (Google Cloud Console HTTP referrer 제한 = 우리 도메인 만)
  // = Storage 다운로드/업로드 우회 = Cached Egress 0
  if (
    u.includes("fbcdn.net") ||
    u.includes("cdninstagram") ||
    u.includes("cdn.fbsbx.com")
  )
    return false;
  // 🚫 모바일 앱에서 Referer 체크로 렌더링 차단되는 도메인 제외
  if (
    u.includes("naver.com") ||
    u.includes("tistory.com") ||
    u.includes("daum.net")
  )
    return false;
  // instagram.com/p/xxx 또는 /reel/xxx (HTML) — /media/?size= 는 리다이렉트로 이미지 가능
  if (
    (u.includes("instagram.com/p/") || u.includes("instagram.com/reel/")) &&
    !u.includes("/media/")
  )
    return false;
  // ✅ 영구 유효 소스
  if (u.includes("wikimedia.org") || u.includes("wikipedia.org")) return true;
  if (u.includes("i.ytimg.com") || u.includes("unsplash.com")) return true;
  return true; // 기타는 시도
}
