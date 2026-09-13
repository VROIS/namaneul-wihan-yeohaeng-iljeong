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
};

const KEYS = Object.keys(TYPE_TO_CATEGORIES).sort(
  (a, b) => b.length - a.length,
);

/** 구글맵 페이지의 사람용 분류 글자("Peruvian restaurant", "Archaeological museum") → 우리 카테고리 목록. 표의 단어가 통째로 들어 있으면 그 줄(긴 단어 먼저). 없으면 []. */
export function categoriesOfLabel(label: string | null | undefined): string[] {
  const norm = String(label ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!norm) return [];
  const padded = `_${norm}_`;
  for (const k of KEYS)
    if (padded.includes(`_${k}_`)) return TYPE_TO_CATEGORIES[k];
  return [];
}

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
