// ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT: 이미지 URL 단일 정규화 함수.
// 모든 이미지 source (wiki / supabase / unsplash / google places / 기타) = 여기 1 곳에서 표준 변환.
// 새 패턴 발견 시 = 함수 1 줄 추가 = 모든 화면/모든 도시/모든 카테고리 자동 적용.
// 메인앱 + BTS 자식앱 공통 사용 = SSOT 보장.

const WIKIMEDIA_BUCKETS = [120, 250, 330, 500, 800, 1280, 1920, 3840];
const WIKIMEDIA_PX_REGEX = /\/\d+px-/;
const WIKIMEDIA_ORIG_REGEX =
  /\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/;
const UNSPLASH_W_REGEX = /([?&])w=\d+/;

function snapBucket(targetPx: number): number {
  return WIKIMEDIA_BUCKETS.find((b) => b >= targetPx) ?? 3840;
}

/**
 * 단일 진입점: imageUrl → 표준 형식 (1280px) 변환.
 * - 모르는 패턴 = 그대로 통과 (= 안전).
 * - 새 source 추가 = 여기 case 1 줄 추가만.
 */
export function normalizeImageUrl(
  url: string | null | undefined,
  targetPx = 1280,
): string | null {
  if (!url) return null;

  // Wikimedia Commons /thumb/ → bucket 사이즈로 변환
  if (url.includes("upload.wikimedia.org/wikipedia/commons/thumb/")) {
    const bucket = snapBucket(targetPx);
    return url.replace(WIKIMEDIA_PX_REGEX, `/${bucket}px-`);
  }

  // Wikimedia 원본 URL → /thumb/ 형식으로 변환
  if (url.includes("upload.wikimedia.org/wikipedia/commons/")) {
    const m = url.match(WIKIMEDIA_ORIG_REGEX);
    if (m) {
      const [, x, xx, fname] = m;
      const bucket = snapBucket(targetPx);
      return `https://upload.wikimedia.org/wikipedia/commons/thumb/${x}/${xx}/${fname}/${bucket}px-${fname}`;
    }
  }

  // Unsplash = w=<size> 파라미터 정규화
  if (url.includes("images.unsplash.com")) {
    if (UNSPLASH_W_REGEX.test(url)) {
      return url.replace(UNSPLASH_W_REGEX, `$1w=${targetPx}`);
    }
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}w=${targetPx}`;
  }

  // Supabase Storage / Google Places / 기타 = 그대로 (이미 표준)
  return url;
}
