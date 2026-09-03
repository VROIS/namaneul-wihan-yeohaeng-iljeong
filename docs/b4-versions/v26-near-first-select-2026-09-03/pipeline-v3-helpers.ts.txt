export async function getEnrichmentFunctions() {
  const mod = await import("../itinerary-generator");
  return mod.enrichmentFunctions;
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
