// BTS 장소 카트 유틸(이미지 URL 변환·언어별 이름) = BTSPlaceCartScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
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
// T414805/Common_thumbnail_sizes 공식 문서 기준 허용 width 목록. 그 외 사이즈는 HTTP 400 거부.
// Screen 4 카드(100×178 dp, dpr 2.75 → 물리 275~490px) → nearest-up bucket = 330px.
// ⚠️ 수정금지(승인필요) — 2026-05-07: 1 주일 노하우 복원. 클라이언트 변환 로직 = SSOT.
//   카드 = toCardThumbUrl(330px) / 상세 = toFullUrl(1280px) / Wikimedia 공식 버킷.
//   백엔드 normalize 는 호환 (= 응답 1280px URL 도 카드 변환 시 → 330px 정상).
const WIKIMEDIA_BUCKETS = [
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
];
const WIKIMEDIA_PX_REGEX = /\/\d+px-/;
const UNSPLASH_W_REGEX = /([?&])w=\d+/g;

function snapToWikimediaBucket(targetPx: number): number {
  return WIKIMEDIA_BUCKETS.find((b) => b >= targetPx) ?? 3840;
}

// 카드 썸네일용 (330px). Wikimedia URL 변환 + Unsplash w=300 동시 처리.
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
// Samsung A36 5G 모달 폭 ≈ 360dp × 2.75 dpr = 990px → Wikimedia nearest-up bucket = 1280px.
// Unsplash w=1200. /thumb/ 없는 원본 URL 은 그대로 통과 (원본 크기 = 최고 화질).
// = DB 정규화 시점에 = 시드 발굴 단계에서 = /thumb/ 형식만 저장 = 새 row 영원히 표준.
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
// ═══════════════════════════════════════════════════════════════════════════
// 배경: AOS Samsung A36 5G 에서 Wikimedia 이미지 5/8 조용히 실패. iOS 는 100%. 같은 URL.
// 24시간 추측 여정: 타임아웃 2500ms → 스톡 폴백 → rate-limit → 순차 마운트 — 전부 틀림.
// 진짜 원인: Wikimedia 공식 User-Agent 정책.
//   - https://meta.wikimedia.org/wiki/User-Agent_policy
//   - "All API requests must have a distinguishing User-Agent header.
//      Anonymous UAs may be blocked."
//   - Glide 기본 UA = "okhttp/..." (식별 불가) → Wikimedia 소프트 블록
//   - iOS SDWebImage = bundle-id 포함 → 정책 통과 → 정상 작동
// 해결: Wikimedia URL 에만 명시적 식별 UA 부착 → AOS 8/8 3초 (즉시 해결)
// 교훈: "플랫폼별 실패" 증상 = 공식 문서 3분 리서치. CLAUDE.md 제1/12조 엄수.
// ═══════════════════════════════════════════════════════════════════════════
// 메인앱 적용 주의: 메인앱 이미지 소스는 Wikimedia 외 (Google Places/Unsplash 등).
// 각 소스의 공식 UA 정책 별도 확인 후 대응 (Track 2 조사 필요).
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
// Track 1i 의 resolvePlaceImage 와 병렬 구조 — Track 1i 로직 건드리지 않음.
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

// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 5b: 도시/장소 이름 언어 연동 헬퍼. 영어 토글 시 nameEn 우선.
export function localizedName(
  item: { nameKo?: string | null; nameEn?: string | null },
  isKorean: boolean,
): string {
  if (isKorean) return item.nameKo || item.nameEn || "";
  return item.nameEn || item.nameKo || "";
}

// ⚠️ 수정금지(승인필요) — 2026-04-22 카드 9:16 세로 비율 + 꽉찬 느낌으로 확대 (사용자 스샷 피드백). 86x116 → 100x178
// ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 = 최대한 안 겹치게: 80×140 (= 100×178 대비 면적 -37%)
export const CARD_W = 80;
export const CARD_H = 140;

// ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-①: 게이팅 제거로 BATCH_SIZE 불필요. 총 장수만 유지.
export const MAX_PLACES = 8;
