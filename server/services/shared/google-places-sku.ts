// ⚠️ 수정금지(승인필요) — Google Places API SKU 등급표 + 차단 필터
// = docs/SEED_SSOT_2026-05-02.md §16 잠금 명령
// = 사용자님 제공 등급표 그대로 + Google 공식 (2026-05-15)
//
// 정책 요약:
//   - Essentials / Pro / Enterprise = 허용
//   - Enterprise + Atmosphere (33 필드) = 차단 (= throw)
//   - 모든 TS 호출 = validateFieldMask() 통과 강제
//
// 실측 단가 (= GCP 청구서, 2026-05-01 ~ 05-14):
//   - TS Enterprise = €0.0299/호출 (= 무료 1K 초과 후)

/** Text Search (New) Essentials ID Only SKU 트리거 필드 */
export const TS_ESSENTIALS_FIELDS = new Set<string>([
  'places.attributions',
  'places.id',
  'places.name', // 리소스 이름 (places/PLACE_ID)
  'nextPageToken',
  'places.movedPlace',
  'places.movedPlaceId',
]);

/** Text Search (New) Pro SKU 트리거 필드 */
export const TS_PRO_FIELDS = new Set<string>([
  'places.accessibilityOptions',
  'places.addressComponents',
  'places.addressDescriptor',
  'places.adrFormatAddress',
  'places.businessStatus',
  'places.containingPlaces',
  'places.displayName',
  'places.formattedAddress',
  'places.googleMapsLinks',
  'places.googleMapsUri',
  'places.iconBackgroundColor',
  'places.iconMaskBaseUri',
  'places.location',
  'places.openingDate',
  'places.photos',
  'places.plusCode',
  'places.postalAddress',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.pureServiceAreaBusiness',
  'places.shortFormattedAddress',
  'places.searchUri',
  'places.subDestinations',
  'places.timeZone',
  'places.types',
  'places.utcOffsetMinutes',
  'places.viewport',
]);

/** Text Search (New) Enterprise SKU 트리거 필드 = 허용 (= 시스템 SSOT 필수) */
export const TS_ENTERPRISE_FIELDS = new Set<string>([
  'places.currentOpeningHours',
  'places.currentSecondaryOpeningHours',
  'places.internationalPhoneNumber',
  'places.nationalPhoneNumber',
  'places.priceLevel',
  'places.priceRange', // 가격 SSOT 필수
  'places.rating',
  'places.regularOpeningHours',
  'places.regularSecondaryOpeningHours',
  'places.userRatingCount', // 인기도 정렬 필수
  'places.websiteUri',
]);

/** Text Search (New) Enterprise + Atmosphere SKU 트리거 필드 = ❌ 차단 대상 */
export const TS_ATMOSPHERE_FIELDS = new Set<string>([
  'places.allowsDogs',
  'places.curbsidePickup',
  'places.delivery',
  'places.dineIn',
  'places.editorialSummary',
  'places.evChargeAmenitySummary',
  'places.evChargeOptions',
  'places.fuelOptions',
  'places.generativeSummary',
  'places.goodForChildren',
  'places.goodForGroups',
  'places.goodForWatchingSports',
  'places.liveMusic',
  'places.menuForChildren',
  'places.neighborhoodSummary',
  'places.parkingOptions',
  'places.paymentOptions',
  'places.outdoorSeating',
  'places.reservable',
  'places.restroom',
  'places.reviews',
  'places.reviewSummary',
  'routingSummaries',
  'places.servesBeer',
  'places.servesBreakfast',
  'places.servesBrunch',
  'places.servesCocktails',
  'places.servesCoffee',
  'places.servesDessert',
  'places.servesDinner',
  'places.servesLunch',
  'places.servesVegetarianFood',
  'places.servesWine',
  'places.takeout',
]);

// ⚠️ 수정금지(승인필요) 2026-06-02 = 전 앱 TS 호출 단일 표준 FieldMask (= §16 단일 진입점 = 사용자 SSOT)
// = 9 필드 = Enterprise SKU 고정 ($35/1K, 무료 1K/월) = Atmosphere 0 = 파산 폭탄 없음
// = PSR 실기록 8 컬럼 (id / name_ko / address / 좌표 / 리뷰수 / 가격 / 이미지 / mapsUri)
//   + businessStatus (= 폐업·rename 판정 = Pro 등급 = SKU 안 올림)
// = 변경 시 = 모든 호출처 동시 반영 + GCP 비용 영향 = 사용자 명시 승인 필수
export const STANDARD_TS_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.userRatingCount,places.priceRange,places.photos,places.googleMapsUri,places.businessStatus';

export type SkuTier = 'essentials' | 'pro' | 'enterprise' | 'atmosphere' | 'unknown';

/** FieldMask 문자열을 받아 트리거되는 최고 SKU 반환 */
export function getFieldMaskTier(fieldMask: string): { tier: SkuTier; atmosphereFields: string[]; unknownFields: string[] } {
  const fields = fieldMask.split(',').map((f) => f.trim()).filter(Boolean);
  let tier: SkuTier = 'essentials';
  const atmosphereFields: string[] = [];
  const unknownFields: string[] = [];

  for (const field of fields) {
    // FieldMask 는 도트 경로 (places.photos.name) 형태 가능 → 첫 2 단계만 비교
    const parts = field.split('.');
    const root = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : field;

    if (TS_ATMOSPHERE_FIELDS.has(root) || TS_ATMOSPHERE_FIELDS.has(field)) {
      atmosphereFields.push(field);
      tier = 'atmosphere';
    } else if (TS_ENTERPRISE_FIELDS.has(root) || TS_ENTERPRISE_FIELDS.has(field)) {
      if (tier !== 'atmosphere') tier = 'enterprise';
    } else if (TS_PRO_FIELDS.has(root) || TS_PRO_FIELDS.has(field)) {
      if (tier === 'essentials') tier = 'pro';
    } else if (TS_ESSENTIALS_FIELDS.has(root) || TS_ESSENTIALS_FIELDS.has(field)) {
      // essentials 유지
    } else {
      unknownFields.push(field);
    }
  }

  return { tier, atmosphereFields, unknownFields };
}

/**
 * FieldMask 검증 = Atmosphere 필드 발견 시 즉시 throw
 * @throws Error  Enterprise+Atmosphere SKU 트리거 필드 감지 시
 */
export function validateFieldMask(fieldMask: string): void {
  const { tier, atmosphereFields } = getFieldMaskTier(fieldMask);
  if (tier === 'atmosphere') {
    throw new Error(
      `[GooglePlacesSKU] ❌ Enterprise+Atmosphere SKU 차단 = $40/1K 폭탄 = 사용 금지\n` +
      `  감지된 Atmosphere 필드: ${atmosphereFields.join(', ')}\n` +
      `  허용 최고 SKU = Enterprise ($35/1K) / docs/SEED_SSOT_2026-05-02.md §16 참조`
    );
  }
}
