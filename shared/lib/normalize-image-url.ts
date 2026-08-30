// ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT: 이미지 URL 단일 정규화 함수.

const WIKIMEDIA_BUCKETS = [120, 250, 330, 500, 800, 1280, 1920, 3840];
const WIKIMEDIA_PX_REGEX = /\/\d+px-/;
const WIKIMEDIA_ORIG_REGEX =
  /\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/;
const UNSPLASH_W_REGEX = /([?&])w=\d+/;

function snapBucket(targetPx: number): number {
  return WIKIMEDIA_BUCKETS.find((b) => b >= targetPx) ?? 3840;
}

export function normalizeImageUrl(
  url: string | null | undefined,
  targetPx = 1280,
): string | null {
  if (!url) return null;

  if (url.includes("upload.wikimedia.org/wikipedia/commons/thumb/")) {
    const bucket = snapBucket(targetPx);
    return url.replace(WIKIMEDIA_PX_REGEX, `/${bucket}px-`);
  }

  if (url.includes("upload.wikimedia.org/wikipedia/commons/")) {
    const m = url.match(WIKIMEDIA_ORIG_REGEX);
    if (m) {
      const [, x, xx, fname] = m;
      const bucket = snapBucket(targetPx);
      return `https://upload.wikimedia.org/wikipedia/commons/thumb/${x}/${xx}/${fname}/${bucket}px-${fname}`;
    }
  }

  if (url.includes("images.unsplash.com")) {
    if (UNSPLASH_W_REGEX.test(url)) {
      return url.replace(UNSPLASH_W_REGEX, `$1w=${targetPx}`);
    }
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}w=${targetPx}`;
  }

  return url;
}
