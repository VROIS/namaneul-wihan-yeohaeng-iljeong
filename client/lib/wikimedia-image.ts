/** ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 디버깅 SSOT = 공통 helper 추출 */

import { Platform } from "react-native";

export const WIKIMEDIA_BUCKETS = [
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
] as const;
const WIKIMEDIA_PX_REGEX = /\/\d+px-/;
const UNSPLASH_W_REGEX = /([?&])w=\d+/g;

export const WIKIMEDIA_UA = "TRIPIS/1.0 (contact@vibetrip.app) Expo/54";

export function snapToWikimediaBucket(targetPx: number): number {
  return WIKIMEDIA_BUCKETS.find((b) => b >= targetPx) ?? 3840;
}

export function toCardThumbUrl(url: string): string {
  if (url.includes("upload.wikimedia.org/wikipedia/commons/thumb/")) {
    const bucket = snapToWikimediaBucket(330);
    return url.replace(WIKIMEDIA_PX_REGEX, `/${bucket}px-`);
  }
  if (url.includes("images.unsplash.com")) {
    return url.replace(UNSPLASH_W_REGEX, "$1w=300");
  }
  return url;
}

export function toFullUrl(url: string): string {
  if (url.includes("upload.wikimedia.org/wikipedia/commons/thumb/")) {
    const bucket = snapToWikimediaBucket(1280);
    return url.replace(WIKIMEDIA_PX_REGEX, `/${bucket}px-`);
  }
  if (url.includes("images.unsplash.com")) {
    return url.replace(UNSPLASH_W_REGEX, "$1w=1200");
  }
  return url;
}

export function resolveImageSource(
  imageUrl: string | null | undefined,
  mode: "card" | "full" = "card",
): { uri: string; headers?: Record<string, string> } | undefined {
  if (!imageUrl) return undefined;
  const uri = mode === "card" ? toCardThumbUrl(imageUrl) : toFullUrl(imageUrl);
  if (uri.includes("upload.wikimedia.org") && Platform.OS !== "web") {
    return { uri, headers: { "User-Agent": WIKIMEDIA_UA } };
  }
  return { uri };
}
