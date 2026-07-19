/**
 * ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 디버깅 SSOT = 공통 helper 추출
 * = 출처: client/screens/bts/place-cart/utils.ts
 * = 메인앱 + BTS 자식앱 = 동일 helper 사용 = WK URL 로드 보장
 *
 * 5 핵심:
 *  1) Wikimedia 공식 허용 버킷 (= 그 외 = HTTP 400)
 *  2) User-Agent 명시 부착 (= AOS Glide 익명 UA 블록 회피)
 *  3) Web 환경 = UA 헤더 X (= 브라우저 forbidden header)
 *  4) expo-image 최적화 (= cachePolicy + transition + onLoad)
 *  5) 카드 (330px) vs 모달 (1280px) = 사이즈 분리
 */

import { Platform } from "react-native";

// 공식 Wikimedia 허용 width 버킷 (= T414805/Common_thumbnail_sizes)
export const WIKIMEDIA_BUCKETS = [
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
] as const;
const WIKIMEDIA_PX_REGEX = /\/\d+px-/;
const UNSPLASH_W_REGEX = /([?&])w=\d+/g;

// 🔑 Wikimedia 공식 UA 정책 (= 1주일 디버깅 결과)
// = "All API requests must have a distinguishing User-Agent header"
// = 익명 UA (= Glide okhttp 기본) = 소프트 블록 = AOS 5/8 실패
export const WIKIMEDIA_UA = "TRIPIS/1.0 (contact@vibetrip.app) Expo/54";

export function snapToWikimediaBucket(targetPx: number): number {
  return WIKIMEDIA_BUCKETS.find((b) => b >= targetPx) ?? 3840;
}

/** 카드 썸네일 (330px). Wikimedia URL + Unsplash w=300 동시 처리 */
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

/** 모달/상세 큰 이미지 (1280px). Unsplash w=1200 동시 */
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

/**
 * 통합 이미지 소스 (= expo-image source prop)
 * = card 모드 = 330px / full 모드 = 1280px
 * = Wikimedia + Native = User-Agent 헤더 부착
 * = Wikimedia + Web = 헤더 X (= 브라우저 forbidden)
 * = 그 외 (Storage/Google PhotoMedia) = uri 만
 */
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
