import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import type { BTSPlace } from "@/contexts/BTSContext";

// ⚠️ 수정금지(승인필요) — Haptics 유틸 (Screen C와 동일)
export const haptic = (t: "light" | "medium" | "success") => {
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

// ⚠️ 수정금지(승인필요) — 2026-04-24 W-6 옵션 A: Wikimedia 공식 허용 버킷 스냅 방식.
// ⚠️ 수정금지(승인필요) — 2026-05-07: 1 주일 노하우 복원. 클라이언트 변환 로직 = SSOT.
const WIKIMEDIA_BUCKETS = [
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
];
const WIKIMEDIA_PX_REGEX = /\/\d+px-/;
const UNSPLASH_W_REGEX = /([?&])w=\d+/g;

function snapToWikimediaBucket(targetPx: number): number {
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

// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a: 큰 화면(모달)용 URL (1280px).
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

// ⚠️ 수정금지(승인필요) — 🔑 핵심 로직 (2026-04-24 24시간 연구 끝 발견)
const WIKIMEDIA_UA = "TRIPIS/1.0 (contact@vibetrip.app) Expo/54";

// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1g: 스톡 폴백 제거. imageUrl 없으면 undefined → 빈 카드. 가짜 스톡 사진 절대 노출 안 함.
// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 1i: Wikimedia 요청에 User-Agent 헤더 부착.
// ⚠️ 수정금지(승인필요) — 2026-05-07: web 환경에서 User-Agent 는 forbidden header → 브라우저 fetch 거부 → web 만 헤더 X.
export function resolvePlaceImage(
  place: BTSPlace,
): { uri: string; headers?: Record<string, string> } | undefined {
  if (!place.imageUrl) return undefined;
  const uri = toCardThumbUrl(place.imageUrl);
  if (uri.includes("upload.wikimedia.org") && Platform.OS !== "web") {
    return { uri, headers: { "User-Agent": WIKIMEDIA_UA } };
  }
  return { uri };
}

// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 4a: 상세 섹션용 큰 이미지 소스 (1280px + 동일 UA 정책).
export function resolvePlaceImageFull(
  place: BTSPlace,
): { uri: string; headers?: Record<string, string> } | undefined {
  if (!place.imageUrl) return undefined;
  const uri = toFullUrl(place.imageUrl);
  if (uri.includes("upload.wikimedia.org") && Platform.OS !== "web") {
    return { uri, headers: { "User-Agent": WIKIMEDIA_UA } };
  }
  return { uri };
}

// ⚠️ 수정금지(승인필요) — 2026-08-22 사장님 원칙 = 장소명 노출 = nameEn 1순위(로케일 무관, 한국어 분기 폐기 = 2026-08-22 §19).
export function localizedName(
  item: { nameKo?: string | null; nameEn?: string | null },
  _isKorean: boolean,
): string {
  return item.nameEn || item.nameKo || "";
}

// ⚠️ 수정금지(승인필요) — 2026-04-22 카드 9:16 세로 비율 + 꽉찬 느낌으로 확대 (사용자 스샷 피드백). 86x116 → 100x178
// ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 = 최대한 안 겹치게: 80×140 (= 100×178 대비 면적 -37%)
export const CARD_W = 80;
export const CARD_H = 140;

// ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-①: 게이팅 제거로 BATCH_SIZE 불필요. 총 장수만 유지.
export const MAX_PLACES = 8;
