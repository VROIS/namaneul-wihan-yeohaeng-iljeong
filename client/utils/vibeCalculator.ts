import { Vibe, CurationFocus, VIBE_OPTIONS, VibeWeight } from "@/types/trip";
import i18n from "@/lib/i18n";

const BASE_WEIGHTS: Record<Vibe, number> = {
  Healing: 35,
  Foodie: 25,
  Hotspot: 15,
  Culture: 10,
  Adventure: 10,
  Shopping: 5,
  Attraction: 15, // = 즐길거리(테마파크·유람선·아쿠아리움·체험전시)
};

const PROTAGONIST_ADJUSTMENTS: Record<
  CurationFocus,
  Partial<Record<Vibe, number>>
> = {
  Kids: { Adventure: 10, Healing: -5, Culture: -5 },
  Parents: { Culture: 10, Healing: 5, Adventure: -10 },
  Everyone: {},
  Self: {},
};

export function calculateVibeWeights(
  selectedVibes: Vibe[],
  protagonist: CurationFocus,
): VibeWeight[] {
  if (selectedVibes.length === 0) return [];

  const adjustments = PROTAGONIST_ADJUSTMENTS[protagonist];

  const adjustedWeights = selectedVibes.map((vibe) => {
    let weight = BASE_WEIGHTS[vibe];
    if (adjustments[vibe]) {
      weight += adjustments[vibe]!;
    }
    return { vibe, weight: Math.max(0, weight) };
  });

  const totalWeight = adjustedWeights.reduce((sum, v) => sum + v.weight, 0);

  return adjustedWeights.map(({ vibe, weight }) => ({
    vibe,
    weight: weight / totalWeight,
    percentage: Math.round((weight / totalWeight) * 100),
  }));
}

// ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = 이미 있던 번역키(VIBE_OPTIONS[].labelKey, options.* 7개국어
export function getVibeLabel(vibe: Vibe): string {
  const option = VIBE_OPTIONS.find((v) => v.id === vibe);
  return option ? i18n.t(option.labelKey) : vibe;
}

export function formatVibeWeightsSummary(weights: VibeWeight[]): string {
  return weights
    .sort((a, b) => b.percentage - a.percentage)
    .map((w) => `${getVibeLabel(w.vibe)} ${w.percentage}%`)
    .join(" | ");
}

export function getPreferredTimeSlots(
  vibe: Vibe,
): ("morning" | "lunch" | "afternoon" | "evening")[] {
  const slotMapping: Record<
    Vibe,
    ("morning" | "lunch" | "afternoon" | "evening")[]
  > = {
    Healing: ["morning", "afternoon"],
    Foodie: ["lunch", "evening"],
    Hotspot: ["afternoon"],
    Culture: ["morning", "afternoon"],
    Adventure: ["morning", "afternoon"],
    Shopping: ["afternoon", "evening"],
    Attraction: ["morning", "afternoon"],
  };
  return slotMapping[vibe];
}
