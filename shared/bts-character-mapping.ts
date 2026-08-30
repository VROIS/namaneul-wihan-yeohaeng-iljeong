// ⚠️ 수정금지(승인필요) — 2026-04-30 사용자 SSOT: 1 캐릭터 ↔ 1 카테고리 1:1

export type BTSCharacterId =
  | "collector"
  | "romanticist"
  | "explorer"
  | "challenger"
  | "recharger"
  | "chiller"
  | "companion";

export const CHARACTER_PRIMARY_CATEGORY: Record<
  Exclude<BTSCharacterId, "companion">,
  string
> = {
  collector: "heritage",
  romanticist: "hotspot",
  explorer: "attraction",
  challenger: "adventure",
  recharger: "healing",
  chiller: "shopping",
};

export const COMPANION_VIBE_CATEGORIES = [
  "heritage",
  "hotspot",
  "attraction",
  "healing",
  "shopping",
] as const;
