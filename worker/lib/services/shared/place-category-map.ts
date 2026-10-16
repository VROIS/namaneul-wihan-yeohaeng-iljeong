// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 확정 = 구글 분류 → 우리 카테고리 대응표 1벌 = 2026-04-30 로우데이타 최적화 문서 §3.1 TYPE_TO_CATEGORIES 그대로(사장님 정정 3건 포함). 표에 없는 분류 = 제미니 분류 그대로.
const TYPE_TO_CATEGORIES: Record<string, string[]> = {
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
  observation_deck: ["photospot"],
  viewpoint: ["photospot"],
  scenic_overlook: ["photospot"],
  cultural_landmark: ["photospot"],
  plaza: ["photospot"],
  monument: ["heritage", "photospot"],
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
  // ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 구글 분류가 최우선 = 창고에 실제로 나온 글자를 표에 더한다(13도시 실측 = 표에 없던 703행). 식당 동의어 · 사진 찍기 좋은 곳(포토스팟) · 공연장·경기장(즐길거리) · 미술관(유적) · 아울렛(쇼핑) (정본 §)
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
  // ⚠️ 수정금지(승인필요) 2026-10-12 사장님 결정 = 와이너리·샴페인 하우스는 시음·견학 체험이라 즐길거리 · 도심 와인 바는 식당 · 포도밭은 힐링 · 와인 가게는 쇼핑 · 이름에 식당이 든 와이너리는 식당 주분류에 즐길거리 태그 (정본 §2026-10-12)
  winery: ["attraction"],
  beer_garden: ["restaurant"],
  wine_bar: ["restaurant"],
  cocktail_bar: ["restaurant"],
  tea_house: ["restaurant"],
  scenic_spot: ["photospot"],
  mountain_peak: ["photospot"],
  bridge: ["photospot"],
  lake: ["photospot", "healing"],
  landmark: ["photospot"],
  street: ["photospot"],
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
  fountain: ["photospot"],
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
const PHOTOSPOT_OK: ReadonlySet<string> = new Set([
  "photospot",
  "attraction",
  "healing",
]);

const KEYS = Object.keys(TYPE_TO_CATEGORIES).sort(
  (a, b) => b.length - a.length,
);

const normLabel = (label: string | null | undefined): string =>
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
const isNotPlace = (label: string | null | undefined): boolean =>
  hasWord(label, NOT_PLACE);
// ⚠️ 수정금지(승인필요) 2026-10-12 사장님 결정 = 이름에 식당이 든 와이너리는 식당 주분류를 유지한다(표는 구글 분류 글자만 보므로 이름을 함께 본다) (정본 §2026-10-12)
const RESTAURANT_NAME = /restaurant|restaurante|ristorante|레스토랑|식당/i;
const restaurantWinery = (
  label: string | null | undefined,
  name: string | null | undefined,
): boolean =>
  hasWord(label, ["winery"]) && !!name && RESTAURANT_NAME.test(name);

// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 페이지를 연 뒤 우리 분류 확정 1벌 = 장소 아님 → 삭제 · 식당·쇼핑 → 구글이 이김 · 유적·힐링·모험·즐길거리도 구글이 이김 · 포토스팟은 구글 사실 분류가 전망대·명소·공원이면 유지, 바·카페·식당 같은 가게면 식당이 대표이고 포토스팟은 태그로, 그 밖은 사실 분류로 바꾸고 포토스팟은 태그로 · 표에 없는 글자 = 우리 분류 유지 + "새 글자"로 보고 (정본 §2026-10-12)
type FinalCategory = {
  cat: string;
  notPlace: boolean;
  unknownLabel: boolean;
  photospotTag: boolean;
  changed: boolean;
};
const NOT_PLACE_KEEP_RC = 1000;
export function finalCategory(
  ourCat: string,
  pageLabel: string | null | undefined,
  pop?: { reviewCount?: number | null; best?: boolean },
  name?: string | null,
): FinalCategory {
  const base: FinalCategory = {
    cat: ourCat,
    notPlace: false,
    unknownLabel: false,
    photospotTag: false,
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
  if (ourCat === "restaurant" && restaurantWinery(pageLabel, name)) return base;
  if (ourCat === "photospot") {
    if (cats.some((c) => PHOTOSPOT_OK.has(c))) return base;
    return { ...base, cat: cats[0], photospotTag: true, changed: true };
  }
  return { ...base, cat: cats[0], changed: true };
}

// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 멀티태그 = 우리 분류(첫 원소) ∪ 구글 분류를 표로 펼친 것 = CID 직행·이름 검색이 같이 쓴다 (2026-04-30 문서 §2.4·§3.1)
export const categoryTagsOf = (
  primary: string,
  pageLabel: string | null | undefined,
): string[] => [...new Set([primary, ...categoriesOfLabel(pageLabel)])];

// ⚠️ 수정금지(승인필요) 2026-10-12 사장님 결정 = 식당·쇼핑은 페이지 분류로 확실히 판별 = 한쪽이 식당/쇼핑인데 서로 다르면 다른 곳(mismatch), 이름에 식당이 든 와이너리는 식당으로 본다. 그 밖의 차이는 페이지 분류가 이김(제미니 분류 덮음). 표에 없으면 제미니 분류 그대로. (정본 §)
const HARD = new Set(["restaurant", "shopping"]);
export function resolveCategory(
  pageLabel: string | null | undefined,
  geminiCat: string,
  name?: string | null,
): { cat: string; mismatch: boolean } {
  const cats = categoriesOfLabel(pageLabel);
  if (!cats.length || cats.includes(geminiCat))
    return { cat: geminiCat, mismatch: false };
  if (geminiCat === "restaurant" && restaurantWinery(pageLabel, name))
    return { cat: geminiCat, mismatch: false };
  const pageCat = cats[0];
  if (HARD.has(geminiCat) || HARD.has(pageCat))
    return { cat: geminiCat, mismatch: true };
  return { cat: pageCat, mismatch: false };
}
