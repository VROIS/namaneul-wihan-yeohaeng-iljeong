// ⚠️ 수정금지(승인필요) — 2026-04-30 사용자 SSOT: 1 캐릭터 ↔ 1 카테고리 1:1
// server/bts-routes.ts + client/constants/bts-characters.ts 공통 import. 두 곳 중복 금지.
// 이전 weights (5/3/2 가중) 폐기. companion = COMPANION_VIBE_CATEGORIES 사용.

export type BTSCharacterId =
  | "collector"
  | "romanticist"
  | "explorer"
  | "challenger"
  | "recharger"
  | "chiller"
  | "companion";

export const CHARACTER_PRIMARY_CATEGORY: Record<Exclude<BTSCharacterId, "companion">, string> = {
  collector: "heritage",
  romanticist: "hotspot",
  explorer: "attraction",
  challenger: "adventure",
  recharger: "healing",
  chiller: "shopping",
};

// companion (혼합형) slot 2,3,4,6,7 — adventure + restaurant 제외 (5·8 슬롯 중복)
export const COMPANION_VIBE_CATEGORIES = [
  "heritage",
  "hotspot",
  "attraction",
  "healing",
  "shopping",
] as const;
