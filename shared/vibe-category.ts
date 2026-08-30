// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인(BTS D단계 FE-2) = vibe ↔ 카테고리 매핑 단일 SSOT.

import {
  CHARACTER_PRIMARY_CATEGORY,
  COMPANION_VIBE_CATEGORIES,
  type BTSCharacterId,
} from "./bts-character-mapping";

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Romantic 모든 흔적 삭제 + Shopping 1:1 매핑
export const VIBE_PRIMARY_CATEGORY: Record<string, string> = {
  Foodie: "restaurant", // = 내부 식당태그 유지(버튼 X)
  Healing: "healing",
  Hotspot: "hotspot",
  Adventure: "adventure",
  Shopping: "shopping",
  Culture: "heritage",
  Attraction: "attraction", // = 즐길거리(신규 버튼) → 테마파크·유람선·아쿠아리움·체험전시
};

export function characterIdToVibes(memberId: string): string[] {
  const cats =
    memberId === "companion"
      ? COMPANION_VIBE_CATEGORIES.slice(0, 3)
      : [
          CHARACTER_PRIMARY_CATEGORY[
            memberId as Exclude<BTSCharacterId, "companion">
          ] ?? "attraction",
        ];
  const catToVibe = new Map<string, string>();
  for (const [vibe, cat] of Object.entries(VIBE_PRIMARY_CATEGORY)) {
    if (!catToVibe.has(cat)) catToVibe.set(cat, vibe);
  }
  return cats.map((c) => catToVibe.get(c)).filter((v): v is string => !!v);
}
