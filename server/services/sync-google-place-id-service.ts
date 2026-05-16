/**
 * Step 6: 도시별 googlePlaceId + 실제가격 + 보충이미지 백필
 *
 * 전략: 1일 1도시 × 5카테고리 = API 5회 호출 → ~150건 처리
 * 우선순위: BTS2026(3/26 첫 공연) → France30 → Europe30
 *
 * 1회 API 호출(Text Search)로 가져오는 것:
 *   - 최대 20건의 장소 (googlePlaceId + priceLevel + photos)
 *   - 기존 place_seed_raw 이름과 매칭하여 바코드 부여
 *
 * Text Search Advanced: $0.035/건 → 1도시 5호출 = $0.175/도시
 */
import { db } from "../db";
import { placeSeedRaw, places, cities, apiKeys } from "@shared/schema";
import { eq, isNull, sql, and } from "drizzle-orm";
import { getMcpExecutionOrder, type McpRankedCity } from "../config/mcp-raw-data-final";

const GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1/places";
const DAILY_CITY_LIMIT = 1;
const CATEGORIES = ["attraction", "restaurant", "healing", "adventure", "hotspot"] as const;

const CATEGORY_SEARCH_TERMS: Record<string, string> = {
  attraction: "top tourist attractions landmarks sightseeing",
  restaurant: "best restaurants dining food",
  healing: "spa wellness nature park garden relaxation",
  adventure: "adventure activities outdoor sports experiences",
  hotspot: "popular trendy nightlife shopping entertainment",
};

async function getApiKey(): Promise<string> {
  const envKey = process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY;
  if (envKey) return envKey;

  try {
    const [row] = await db
      .select({ keyValue: apiKeys.keyValue })
      .from(apiKeys)
      .where(eq(apiKeys.keyName, "GOOGLE_MAPS_API_KEY"))
      .limit(1);
    if (row?.keyValue) {
      process.env.Google_maps_api_key = row.keyValue;
      return row.keyValue;
    }
  } catch {}
  return "";
}

const backfillTracker = {
  date: new Date().toDateString(),
  citiesProcessed: 0,
  apiCalls: 0,

  canProcessCity(): boolean {
    const today = new Date().toDateString();
    if (this.date !== today) {
      this.date = today;
      this.citiesProcessed = 0;
      this.apiCalls = 0;
    }
    return this.citiesProcessed < DAILY_CITY_LIMIT;
  },

  recordCity(): void {
    this.citiesProcessed++;
  },

  recordApiCall(): void {
    this.apiCalls++;
  },

  getStatus() {
    return {
      date: this.date,
      citiesProcessed: this.citiesProcessed,
      apiCalls: this.apiCalls,
      cityLimit: DAILY_CITY_LIMIT,
    };
  },
};

interface TextSearchResult {
  id: string;
  displayName?: { text: string; languageCode: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  priceLevel?: string;
  photos?: Array<{ name: string; widthPx: number; heightPx: number }>;
}

const PRICE_LEVEL_EUR: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 10,
  PRICE_LEVEL_MODERATE: 25,
  PRICE_LEVEL_EXPENSIVE: 50,
  PRICE_LEVEL_VERY_EXPENSIVE: 100,
};

async function textSearchCategory(
  cityName: string,
  category: string,
  lat: number,
  lng: number,
  apiKey: string
): Promise<TextSearchResult[]> {
  const searchTerm = CATEGORY_SEARCH_TERMS[category] || category;
  const query = `${searchTerm} in ${cityName}`;

  const body = {
    textQuery: query,
    maxResultCount: 20,
    locationBias: {
      circle: { center: { latitude: lat, longitude: lng }, radius: 30000 },
    },
  };

  // ⚠️ 2026-05-15 = priceLevel 제거 (= SSOT §16 + 제15조 = Enterprise SKU 폭탄 차단)
  // = price_eur 단일 SSOT 채택 = price_level 폐기
  const fieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.photos";

  backfillTracker.recordApiCall();

  const res = await fetch(`${GOOGLE_PLACES_BASE_URL}:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    console.warn(`[Backfill] 429 Rate Limit — 10초 대기 후 재시도`);
    await new Promise((r) => setTimeout(r, 10000));
    const retry = await fetch(`${GOOGLE_PLACES_BASE_URL}:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
    });
    if (!retry.ok) return [];
    const retryData = (await retry.json()) as { places?: TextSearchResult[] };
    return retryData.places ?? [];
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(`[Backfill] API 오류 ${res.status}: ${errText.slice(0, 200)}`);
    return [];
  }

  const data = (await res.json()) as { places?: TextSearchResult[] };
  return data.places ?? [];
}

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9\s\u00C0-\u024F\uAC00-\uD7AF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(apiName: string, seedName: string): boolean {
  const a = normalizeForMatch(apiName);
  const b = normalizeForMatch(seedName);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const aTokens = a.split(" ").filter((t) => t.length > 2);
  const bTokens = b.split(" ").filter((t) => t.length > 2);
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  const overlap = aTokens.filter((t) => bTokens.includes(t)).length;
  const score = overlap / Math.min(aTokens.length, bTokens.length);
  return score >= 0.5;
}

export interface BackfillResult {
  cityProcessed: string;
  phase: string;
  totalApiCalls: number;
  totalApiResults: number;
  googlePlaceIdSet: number;
  placeIdLinked: number;
  pricesSet: number;
  imagesSet: number;
  skippedNoApiKey: boolean;
  skippedNoCity: boolean;
  categoryBreakdown: Record<string, number>;
  errors: string[];
}

async function findNextCity(): Promise<{
  cityRow: { id: number; name: string; nameEn: string; lat: number; lng: number };
  phase: string;
} | null> {
  const executionOrder = getMcpExecutionOrder();

  for (const mcpCity of executionOrder) {
    const [cityRow] = await db
      .select({
        id: cities.id,
        name: cities.name,
        nameEn: cities.nameEn,
        lat: cities.latitude,
        lng: cities.longitude,
      })
      .from(cities)
      .where(eq(cities.nameEn, mcpCity.nameEn))
      .limit(1);

    if (!cityRow) continue;

    const unfilledCount = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(placeSeedRaw)
      .where(and(eq(placeSeedRaw.cityId, cityRow.id), isNull(placeSeedRaw.googlePlaceId)));

    if ((unfilledCount[0]?.cnt ?? 0) > 0) {
      return { cityRow, phase: mcpCity.phase };
    }
  }
  return null;
}

export async function runGooglePlaceIdBackfill(): Promise<BackfillResult> {
  const result: BackfillResult = {
    cityProcessed: "",
    phase: "",
    totalApiCalls: 0,
    totalApiResults: 0,
    googlePlaceIdSet: 0,
    placeIdLinked: 0,
    pricesSet: 0,
    imagesSet: 0,
    skippedNoApiKey: false,
    skippedNoCity: false,
    categoryBreakdown: {},
    errors: [],
  };

  if (!backfillTracker.canProcessCity()) {
    console.log(`[Backfill] 오늘 이미 ${DAILY_CITY_LIMIT}개 도시 처리 완료 — 내일 재시도`);
    return result;
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    result.skippedNoApiKey = true;
    console.warn("[Backfill] API 키 없음 — 전체 스킵");
    return result;
  }

  const nextCity = await findNextCity();
  if (!nextCity) {
    result.skippedNoCity = true;
    console.log("[Backfill] 모든 도시 googlePlaceId 백필 완료!");
    return result;
  }

  const { cityRow, phase } = nextCity;
  result.cityProcessed = cityRow.nameEn;
  result.phase = phase;
  console.log(`\n🏙️ [Backfill] 도시: ${cityRow.nameEn} (${cityRow.name}) | 단계: ${phase}`);

  try {
    const seeds = await db
      .select({
        id: placeSeedRaw.id,
        nameEn: placeSeedRaw.nameEn,
        nameKo: placeSeedRaw.nameKo,
        seedCategory: placeSeedRaw.seedCategory,
        placeId: placeSeedRaw.placeId,
        priceEur: placeSeedRaw.priceEur,
        bestImageUrl: placeSeedRaw.bestImageUrl,
        celebMention: placeSeedRaw.celebMention,
        googlePlaceId: placeSeedRaw.googlePlaceId,
      })
      .from(placeSeedRaw)
      .where(and(eq(placeSeedRaw.cityId, cityRow.id), isNull(placeSeedRaw.googlePlaceId)));

    console.log(`[Backfill] 미매칭 시드: ${seeds.length}건`);

    const placesGoogleIdMap = new Map<string, number>();
    const allPlaces = await db
      .select({ id: places.id, googlePlaceId: places.googlePlaceId })
      .from(places)
      .where(sql`google_place_id IS NOT NULL`);
    for (const p of allPlaces) {
      if (p.googlePlaceId) placesGoogleIdMap.set(p.googlePlaceId, p.id);
    }

    for (const category of CATEGORIES) {
      const categorySeeds = seeds.filter((s) => s.seedCategory === category);
      if (categorySeeds.length === 0) {
        console.log(`  [${category}] 이 카테고리에 미매칭 시드 없음 — 스킵`);
        continue;
      }

      console.log(`  [${category}] ${categorySeeds.length}건 대상 → API 호출...`);
      await new Promise((r) => setTimeout(r, 2000));

      const apiResults = await textSearchCategory(
        cityRow.nameEn,
        category,
        cityRow.lat,
        cityRow.lng,
        apiKey
      );

      result.totalApiCalls++;
      result.totalApiResults += apiResults.length;
      result.categoryBreakdown[category] = 0;
      console.log(`  [${category}] API 결과: ${apiResults.length}건`);

      for (const apiPlace of apiResults) {
        const apiName = apiPlace.displayName?.text || "";
        if (!apiName) continue;

        const matched = categorySeeds.find(
          (s) => !s.googlePlaceId && namesMatch(apiName, s.nameEn)
        );
        if (!matched) continue;

        const updates: Record<string, any> = { googlePlaceId: apiPlace.id };

        const existingPlaceId = placesGoogleIdMap.get(apiPlace.id);
        if (existingPlaceId && !matched.placeId) {
          updates.placeId = existingPlaceId;
          result.placeIdLinked++;
        }

        // ⚠️ 2026-05-15 = priceLevel FieldMask 폐기 = 가격 보강 X (= TS searchText 가 담당)

        if (!matched.bestImageUrl && !matched.celebMention && apiPlace.photos?.length) {
          const photoRef = apiPlace.photos[0].name;
          updates.bestImageUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=800&key=${apiKey}`;
          result.imagesSet++;
        }

        await db.update(placeSeedRaw).set(updates).where(eq(placeSeedRaw.id, matched.id));
        matched.googlePlaceId = apiPlace.id;
        result.googlePlaceIdSet++;
        result.categoryBreakdown[category]!++;
      }

      console.log(`  [${category}] 매칭 완료: ${result.categoryBreakdown[category]}건`);
    }

    backfillTracker.recordCity();
  } catch (e: any) {
    result.errors.push(e?.message || String(e));
    console.error("[Backfill] 오류:", e);
  }

  console.log(`\n=== 도시별 백필 결과: ${result.cityProcessed} (${result.phase}) ===`);
  console.log(`API 호출: ${result.totalApiCalls}회 (결과 ${result.totalApiResults}건)`);
  console.log(`googlePlaceId 부여: ${result.googlePlaceIdSet}건`);
  console.log(`place_id 자동연결: ${result.placeIdLinked}건`);
  console.log(`실제가격 기록: ${result.pricesSet}건`);
  console.log(`보충이미지: ${result.imagesSet}건`);
  console.log(`카테고리별:`, result.categoryBreakdown);
  console.log(`트래커: ${JSON.stringify(backfillTracker.getStatus())}`);
  if (result.errors.length > 0) console.log(`오류: ${result.errors.join(", ")}`);

  return result;
}
