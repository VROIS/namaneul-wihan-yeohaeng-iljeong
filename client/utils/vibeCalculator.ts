import { Vibe, CurationFocus, VIBE_OPTIONS, VibeWeight } from '@/types/trip';

const BASE_WEIGHTS: Record<Vibe, number> = {
  Healing: 35,
  Foodie: 25,
  Hotspot: 15,
  Culture: 10,
  Adventure: 10,
  Romantic: 5,
};

const PROTAGONIST_ADJUSTMENTS: Record<CurationFocus, Partial<Record<Vibe, number>>> = {
  Kids: { Adventure: 10, Healing: -5, Culture: -5 },
  Parents: { Culture: 10, Healing: 5, Adventure: -10 },
  Everyone: {},
  Self: {},
};

export function calculateVibeWeights(
  selectedVibes: Vibe[],
  protagonist: CurationFocus
): VibeWeight[] {
  if (selectedVibes.length === 0) return [];

  const adjustments = PROTAGONIST_ADJUSTMENTS[protagonist];
  
  const adjustedWeights = selectedVibes.map(vibe => {
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

export function getVibeLabel(vibe: Vibe): string {
  const option = VIBE_OPTIONS.find(v => v.id === vibe);
  return option?.label || vibe;
}

export function formatVibeWeightsSummary(weights: VibeWeight[]): string {
  return weights
    .sort((a, b) => b.percentage - a.percentage)
    .map(w => `${getVibeLabel(w.vibe)} ${w.percentage}%`)
    .join(' | ');
}

export function getPreferredTimeSlots(vibe: Vibe): ('morning' | 'lunch' | 'afternoon' | 'evening')[] {
  const slotMapping: Record<Vibe, ('morning' | 'lunch' | 'afternoon' | 'evening')[]> = {
    Healing: ['morning', 'afternoon'],
    Foodie: ['lunch', 'evening'],
    Hotspot: ['afternoon'],
    Culture: ['morning', 'afternoon'],
    Adventure: ['morning', 'afternoon'],
    Romantic: ['evening'],
  };
  return slotMapping[vibe];
}
