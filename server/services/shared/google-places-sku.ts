// ⚠️ 수정금지(승인필요) — Google Places API SKU 등급표 + 차단 필터

export const TS_ESSENTIALS_FIELDS = new Set<string>([
  "places.attributions",
  "places.id",
  "places.name", // 리소스 이름 (places/PLACE_ID)
  "nextPageToken",
  "places.movedPlace",
  "places.movedPlaceId",
]);

export const TS_PRO_FIELDS = new Set<string>([
  "places.accessibilityOptions",
  "places.addressComponents",
  "places.addressDescriptor",
  "places.adrFormatAddress",
  "places.businessStatus",
  "places.containingPlaces",
  "places.displayName",
  "places.formattedAddress",
  "places.googleMapsLinks",
  "places.googleMapsUri",
  "places.iconBackgroundColor",
  "places.iconMaskBaseUri",
  "places.location",
  "places.openingDate",
  "places.photos",
  "places.plusCode",
  "places.postalAddress",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.pureServiceAreaBusiness",
  "places.shortFormattedAddress",
  "places.searchUri",
  "places.subDestinations",
  "places.timeZone",
  "places.types",
  "places.utcOffsetMinutes",
  "places.viewport",
]);

export const TS_ENTERPRISE_FIELDS = new Set<string>([
  "places.currentOpeningHours",
  "places.currentSecondaryOpeningHours",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.priceLevel",
  "places.priceRange", // 가격 SSOT 필수
  "places.rating",
  "places.regularOpeningHours",
  "places.regularSecondaryOpeningHours",
  "places.userRatingCount", // 인기도 정렬 필수
  "places.websiteUri",
]);

export const TS_ATMOSPHERE_FIELDS = new Set<string>([
  "places.allowsDogs",
  "places.curbsidePickup",
  "places.delivery",
  "places.dineIn",
  "places.editorialSummary",
  "places.evChargeAmenitySummary",
  "places.evChargeOptions",
  "places.fuelOptions",
  "places.generativeSummary",
  "places.goodForChildren",
  "places.goodForGroups",
  "places.goodForWatchingSports",
  "places.liveMusic",
  "places.menuForChildren",
  "places.neighborhoodSummary",
  "places.parkingOptions",
  "places.paymentOptions",
  "places.outdoorSeating",
  "places.reservable",
  "places.restroom",
  "places.reviews",
  "places.reviewSummary",
  "routingSummaries",
  "places.servesBeer",
  "places.servesBreakfast",
  "places.servesBrunch",
  "places.servesCocktails",
  "places.servesCoffee",
  "places.servesDessert",
  "places.servesDinner",
  "places.servesLunch",
  "places.servesVegetarianFood",
  "places.servesWine",
  "places.takeout",
]);

// ⚠️ 수정금지(승인필요) 2026-06-02 = 전 앱 TS 호출 단일 표준 FieldMask (= §16 단일 진입점 = 사용자 SSOT)
export const STANDARD_TS_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.userRatingCount,places.priceRange,places.photos,places.googleMapsUri,places.businessStatus";

export type SkuTier =
  | "essentials"
  | "pro"
  | "enterprise"
  | "atmosphere"
  | "unknown";

export function getFieldMaskTier(fieldMask: string): {
  tier: SkuTier;
  atmosphereFields: string[];
  unknownFields: string[];
} {
  const fields = fieldMask
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  let tier: SkuTier = "essentials";
  const atmosphereFields: string[] = [];
  const unknownFields: string[] = [];

  for (const field of fields) {
    const parts = field.split(".");
    const root = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : field;

    if (TS_ATMOSPHERE_FIELDS.has(root) || TS_ATMOSPHERE_FIELDS.has(field)) {
      atmosphereFields.push(field);
      tier = "atmosphere";
    } else if (
      TS_ENTERPRISE_FIELDS.has(root) ||
      TS_ENTERPRISE_FIELDS.has(field)
    ) {
      if (tier !== "atmosphere") tier = "enterprise";
    } else if (TS_PRO_FIELDS.has(root) || TS_PRO_FIELDS.has(field)) {
      if (tier === "essentials") tier = "pro";
    } else if (
      TS_ESSENTIALS_FIELDS.has(root) ||
      TS_ESSENTIALS_FIELDS.has(field)
    ) {
    } else {
      unknownFields.push(field);
    }
  }

  return { tier, atmosphereFields, unknownFields };
}

export function validateFieldMask(fieldMask: string): void {
  const { tier, atmosphereFields } = getFieldMaskTier(fieldMask);
  if (tier === "atmosphere") {
    throw new Error(
      `[GooglePlacesSKU] ❌ Enterprise+Atmosphere SKU 차단 = $40/1K 폭탄 = 사용 금지\n` +
        `  감지된 Atmosphere 필드: ${atmosphereFields.join(", ")}\n` +
        `  허용 최고 SKU = Enterprise ($35/1K) / docs/SEED_SSOT_2026-05-02.md §16 참조`,
    );
  }
}
