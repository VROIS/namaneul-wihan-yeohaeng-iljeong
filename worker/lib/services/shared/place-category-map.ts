// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 구글 분류 → 우리 카테고리 대응표 1벌 = 2026-04-30 로우데이타 최적화 문서 §3.1 TYPE_TO_CATEGORIES 그대로(사장님 정정 3건 포함). 표에 없는 분류 = 제미니 분류 그대로.
export const TYPE_TO_CATEGORIES: Record<string, string[]> = {
  museum: ["heritage"],
  art_museum: ["heritage"],
  science_museum: ["heritage"],
  history_museum: ["heritage"],
  historical_landmark: ["heritage"],
  historical_place: ["heritage"],
  castle: ["heritage"],
  palace: ["heritage"],
  fortress: ["heritage"],
  church: ["heritage"],
  cathedral: ["heritage"],
  mosque: ["heritage"],
  temple: ["heritage"],
  synagogue: ["heritage"],
  archaeological_site: ["heritage"],
  cultural_center: ["heritage"],
  observation_deck: ["hotspot"],
  viewpoint: ["hotspot"],
  scenic_overlook: ["hotspot"],
  cultural_landmark: ["hotspot"],
  plaza: ["hotspot"],
  monument: ["heritage", "hotspot"],
  tourist_attraction: ["attraction"],
  zoo: ["attraction"],
  aquarium: ["attraction"],
  planetarium: ["attraction"],
  amusement_park: ["attraction", "adventure"],
  theme_park: ["attraction", "adventure"],
  water_park: ["adventure"],
  hiking_area: ["adventure"],
  climbing_gym: ["adventure"],
  gym: ["adventure"],
  sports_complex: ["adventure"],
  ski_resort: ["adventure"],
  nature_reserve: ["adventure"],
  adventure_sports_center: ["adventure"],
  sports_activity_location: ["adventure"],
  amusement_center: ["adventure"],
  golf_club: ["attraction"],
  golf_course: ["attraction"],
  bowling_alley: ["attraction"],
  public_university: ["heritage"],
  college: ["heritage"],
  park: ["healing"],
  spa: ["healing"],
  garden: ["healing"],
  botanical_garden: ["healing"],
  beach: ["healing"],
  wellness_center: ["healing"],
  nature_preserve: ["healing"],
  shopping_mall: ["shopping"],
  department_store: ["shopping"],
  store: ["shopping"],
  supermarket: ["shopping"],
  market: ["shopping"],
  restaurant: ["restaurant"],
  cafe: ["restaurant"],
  bakery: ["restaurant"],
  bar: ["restaurant"],
  food: ["restaurant"],
  meal_takeaway: ["restaurant"],
  meal_delivery: ["restaurant"],
  // ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 구글 분류가 최우선 = 창고에 실제로 나온 글자를 표에 더한다(13도시 실측 = 표에 없던 703행). 식당 동의어 · 사진 찍기 좋은 곳(핫스팟) · 공연장·경기장(즐길거리) · 미술관(유적) · 아울렛(쇼핑) (정본 §)
  pub: ["restaurant"],
  irish_pub: ["restaurant"],
  gastropub: ["restaurant"],
  brewpub: ["restaurant"],
  coffee_shop: ["restaurant"],
  steak_house: ["restaurant"],
  brasserie: ["restaurant"],
  bistro: ["restaurant"],
  creperie: ["restaurant"],
  ice_cream_shop: ["restaurant"],
  sandwich_shop: ["restaurant"],
  tavern: ["restaurant"],
  diner: ["restaurant"],
  grill: ["restaurant"],
  deli: ["restaurant"],
  noodle_shop: ["restaurant"],
  pastry_shop: ["restaurant"],
  frituur: ["restaurant"],
  winery: ["restaurant"],
  beer_garden: ["restaurant"],
  wine_bar: ["restaurant"],
  cocktail_bar: ["restaurant"],
  tea_house: ["restaurant"],
  scenic_spot: ["hotspot"],
  mountain_peak: ["hotspot"],
  bridge: ["hotspot"],
  lake: ["hotspot", "healing"],
  landmark: ["hotspot"],
  street: ["hotspot"],
  stadium: ["attraction"],
  arena: ["attraction"],
  event_venue: ["attraction"],
  performing_arts_theater: ["attraction"],
  playground: ["attraction"],
  escape_room_center: ["adventure"],
  boat_tour_agency: ["adventure"],
  art_gallery: ["heritage"],
  heritage_preservation: ["heritage"],
  outlet_mall: ["shopping"],
  shopping_street: ["shopping"],
  chocolate_shop: ["shopping"],
  cheese_shop: ["shopping"],
  cake_shop: ["shopping"],
  donut_shop: ["shopping"],
  bubble_tea_store: ["shopping"],
  grocery_store: ["shopping"],
  butcher_shop: ["shopping"],
  arboretum: ["healing"],
  fountain: ["hotspot"],
  handicraft_fair: ["shopping"],
  vineyard: ["healing"],
  house_of_worship: ["heritage"],
  cable_car: ["attraction"],
  cemetery: ["heritage"],
  library: ["heritage"],
  government_office: ["heritage"],
  reservoir: ["healing"],
  hypermarket: ["shopping"],
  handicraft: ["shopping"],
  artistic_handicrafts: ["shopping"],
  gift_shop: ["shopping"],
  boutique: ["shopping"],
  jeweler: ["shopping"],
  art_dealer: ["shopping"],
  wildlife_refuge: ["healing"],
  national_reserve: ["healing"],
  woods: ["healing"],
  river: ["healing"],
  cave: ["adventure"],
  farm: ["healing"],
  dairy_farm: ["healing"],
  aerial_sports_center: ["adventure"],
  ferris_wheel: ["attraction"],
  convent: ["heritage"],
  state_archive: ["heritage"],
  hotel: ["hotel"],
  lodge: ["hotel"],
  resort_hotel: ["hotel"],
  balloon_ride: ["adventure"],
  shooting_range: ["adventure"],
  water_sports: ["adventure"],
  heritage_building: ["heritage"],
  chicken_shop: ["restaurant"],
  bagel_shop: ["restaurant"],
  crab_house: ["restaurant"],
  dessert_shop: ["restaurant"],
  jewelry_designer: ["shopping"],
};
// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 장소가 아닌 것 = 여행 손님상에 오를 수 없는 구글 분류 = 후보로 내리지 않고 삭제(껍데기 0) (정본 §)
const NOT_PLACE: ReadonlySet<string> = new Set([
  "beauty_salon",
  "bus_stop",
  "gas_station",
  "furniture_store",
  "movie_theater",
  "casino",
  "aquatic_center",
  "car_dealer",
  "parking_lot",
  "hospital",
  "apartment_building",
  "real_estate_agency",
  "corporate_office",
  "recycling_center",
  "animal_shelter",
  "conference_center",
  "convention_center",
  "arts_organization",
]);
// 핫스팟(사진 찍기 좋은 곳)이 그대로 있어도 되는 구글 사실 분류 = 전망대·경치·다리·관광명소·공원·바·카페·쇼핑몰(13도시 핫스팟 행의 구글 분류 실측)
const HOTSPOT_OK: ReadonlySet<string> = new Set([
  "hotspot",
  "attraction",
  "healing",
]);
const HOTSPOT_OK_LABELS = ["bar", "cafe", "shopping_mall", "rooftop"];

const KEYS = Object.keys(TYPE_TO_CATEGORIES).sort(
  (a, b) => b.length - a.length,
);

export const normLabel = (label: string | null | undefined): string =>
  String(label ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");
export function categoriesOfLabel(label: string | null | undefined): string[] {
  const norm = normLabel(label);
  if (!norm) return [];
  const padded = `_${norm}_`;
  for (const k of KEYS)
    if (padded.includes(`_${k}_`)) return TYPE_TO_CATEGORIES[k];
  return [];
}
const hasWord = (label: string | null | undefined, words: Iterable<string>) => {
  const padded = `_${normLabel(label)}_`;
  for (const w of words) if (padded.includes(`_${w}_`)) return true;
  return false;
};
export const isNotPlace = (label: string | null | undefined): boolean =>
  hasWord(label, NOT_PLACE);

// \u26a0\ufe0f \uc218\uc815\uae08\uc9c0(\uc2b9\uc778\ud544\uc694) 2026-09-30 \uc0ac\uc7a5\ub2d8 \uacb0\uc815 = \ud398\uc774\uc9c0\ub97c \uc5f0 \ub4a4 \uc6b0\ub9ac \ubd84\ub958 \ud655\uc815 1\ubc8c = \uc7a5\uc18c \uc544\ub2d8 \u2192 \uc0ad\uc81c \u00b7 \uc2dd\ub2f9\u00b7\uc1fc\ud551 \u2192 \uad6c\uae00\uc774 \uc774\uae40 \u00b7 \uc720\uc801\u00b7\ud790\ub9c1\u00b7\ubaa8\ud5d8\u00b7\uc990\uae38\uac70\ub9ac\ub3c4 \uad6c\uae00\uc774 \uc774\uae40 \u00b7 \ud56b\uc2a4\ud31f(\uc0ac\uc9c4 \ucc0d\uae30 \uc88b\uc740 \uacf3)\uc740 \uad6c\uae00 \uc0ac\uc2e4 \ubd84\ub958\uac00 \uc804\ub9dd\ub300\u00b7\uba85\uc18c\u00b7\uacf5\uc6d0\u00b7\ubc14\u00b7\uce74\ud398\u00b7\uc1fc\ud551\ubab0\uc774\uba74 \uc720\uc9c0, \uc544\ub2c8\uba74 \uc0ac\uc2e4 \ubd84\ub958\ub85c \ubc14\uafb8\uace0 \ud56b\uc2a4\ud31f\uc740 \ud0dc\uadf8\ub85c \u00b7 \ud45c\uc5d0 \uc5c6\ub294 \uae00\uc790 = \uc6b0\ub9ac \ubd84\ub958 \uc720\uc9c0 + "\uc0c8 \uae00\uc790"\ub85c \ubcf4\uace0 (\uc815\ubcf8 \u00a7)
export type FinalCategory = {
  cat: string;
  notPlace: boolean;
  unknownLabel: boolean;
  hotspotTag: boolean;
  changed: boolean;
};
// 장소 아님 글자라도 베스트이거나 리뷰가 이만큼이면 랜드마크다(보고타 Colpatria Tower = "Corporate office", 리뷰 6,971 실측) = 지우지 않고 "확인 필요"로 남긴다
export const NOT_PLACE_KEEP_RC = 1000;
export function finalCategory(
  ourCat: string,
  pageLabel: string | null | undefined,
  pop?: { reviewCount?: number | null; best?: boolean },
): FinalCategory {
  const base: FinalCategory = {
    cat: ourCat,
    notPlace: false,
    unknownLabel: false,
    hotspotTag: false,
    changed: false,
  };
  if (!pageLabel) return base;
  if (isNotPlace(pageLabel)) {
    const popular = !!pop?.best || (pop?.reviewCount ?? 0) >= NOT_PLACE_KEEP_RC;
    return popular
      ? { ...base, unknownLabel: true }
      : { ...base, notPlace: true };
  }
  const cats = categoriesOfLabel(pageLabel);
  if (!cats.length) return { ...base, unknownLabel: true };
  if (cats.includes(ourCat)) return base;
  if (ourCat === "hotspot") {
    if (
      cats.some((c) => HOTSPOT_OK.has(c)) ||
      hasWord(pageLabel, HOTSPOT_OK_LABELS)
    )
      return base;
    return { ...base, cat: cats[0], hotspotTag: true, changed: true };
  }
  return { ...base, cat: cats[0], changed: true };
}

// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 멀티태그 = 우리 분류(첫 원소) ∪ 구글 분류를 표로 펼친 것 = CID 직행·이름 검색이 같이 쓴다 (2026-04-30 문서 §2.4·§3.1)
export const categoryTagsOf = (
  primary: string,
  pageLabel: string | null | undefined,
): string[] => [...new Set([primary, ...categoriesOfLabel(pageLabel)])];

// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 식당·쇼핑은 페이지 분류로 확실히 판별 = 한쪽이 식당/쇼핑인데 서로 다르면 다른 곳(mismatch). 그 밖의 차이는 페이지 분류가 이김(제미니 분류 덮음). 표에 없으면 제미니 분류 그대로.
const HARD = new Set(["restaurant", "shopping"]);
export function resolveCategory(
  pageLabel: string | null | undefined,
  geminiCat: string,
): { cat: string; mismatch: boolean } {
  const cats = categoriesOfLabel(pageLabel);
  if (!cats.length || cats.includes(geminiCat))
    return { cat: geminiCat, mismatch: false };
  const pageCat = cats[0];
  if (HARD.has(geminiCat) || HARD.has(pageCat))
    return { cat: geminiCat, mismatch: true };
  return { cat: pageCat, mismatch: false };
}
