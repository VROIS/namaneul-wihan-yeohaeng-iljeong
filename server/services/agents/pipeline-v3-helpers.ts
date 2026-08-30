export async function getEnrichmentFunctions() {
  const mod = await import("../itinerary-generator");
  return mod.enrichmentFunctions;
}

// ⚠️ 2026-07-21 사장님 SSOT = 슬롯 시작시각 = 활동/식사 각 소요 누적(DB-only route-local·MIX day-builder 공용 1벌 §16).
export function computeSlotStartMins(
  count: number,
  startMin: number,
  slotDur: number,
  mealDur: number,
  isMeal: (i: number) => boolean,
): number[] {
  const out: number[] = [];
  let acc = startMin;
  for (let i = 0; i < count; i++) {
    out.push(acc);
    acc += isMeal(i) ? mealDur : slotDur;
  }
  return out;
}

export function isValidCoord(lat: number, lng: number): boolean {
  return (
    lat !== 0 &&
    lng !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
