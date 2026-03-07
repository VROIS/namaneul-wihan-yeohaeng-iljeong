/**
 * Apify 수집 결과 → DB 저장 (B방식: 도시 특정 후 장소 매칭)
 *
 * 개선점:
 * - 해시태그/텍스트에서 도시 먼저 특정 → 해당 도시 장소만 매칭
 * - 도시 범위 좁혀서 3글자 이름도 매칭 가능 (오매칭 방지)
 * - 📍 핀, 위치태그, 텍스트 내 장소명 모두 활용
 * - 하나의 영상이 여러 장소 언급 시 모두 매칭
 *
 * 사용법: npx tsx server/scripts/apify-import.ts
 */

import * as fs from "fs";
import * as path from "path";
import pg from "pg";

const DB_URL = "postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres";
const DATA_DIR = path.join(__dirname, "..", "data");

interface TikTokItem {
  text?: string;
  webVideoUrl?: string;
  playCount?: number;
  diggCount?: number;
  "authorMeta.name"?: string;
}

interface InstaItem {
  inputUrl?: string;
  url?: string;
  shortCode?: string;
  caption?: string;
  displayUrl?: string;
  videoUrl?: string;
  likesCount?: number;
  locationName?: string;
  locationId?: string;
  productType?: string;
  hashtags?: string[];
}

interface PlaceRow {
  id: number;
  name: string;
  name_en: string | null;
  name_local: string | null;
  city_id: number;
  city_name: string;
  city_name_en: string | null;
}

interface SeedRow {
  place_id: number;
  instagram_post_url: string | null;
  tiktok_post_url: string | null;
}

// 해시태그 → 도시 매핑
const TAG_TO_CITY: Record<string, string[]> = {
  // 이 태그가 텍스트에 있으면 해당 도시로 판단
  paris: ["파리"], parisfood: ["파리"], paristourism: ["파리"],
  seoul: ["서울"], seoulfood: ["서울"], seoultravel: ["서울"], seoulkorea: ["서울"], korea: ["서울", "부산", "고양"],
  tokyo: ["도쿄"], tokyofood: ["도쿄"], tokyotravel: ["도쿄"], japan: ["도쿄", "오사카"],
  london: ["런던"], londonfood: ["런던"], londontravel: ["런던"],
  barcelona: ["바르셀로나"], barcelonafood: ["바르셀로나"], barcelonatravel: ["바르셀로나"],
  madrid: ["마드리드"], madridfood: ["마드리드"],
  brussels: ["브뤼셀"], brusselsfood: ["브뤼셀"],
  munich: ["뮌헨"], munichfood: ["뮌헨"],
  bangkok: ["방콕"], bangkokfood: ["방콕"],
  singapore: ["싱가포르"], singaporefood: ["싱가포르"],
  hongkong: ["홍콩"], hongkongfood: ["홍콩"],
  toronto: ["토론토"], torontofood: ["토론토"],
  chicago: ["시카고"], chicagofood: ["시카고"],
  lafood: ["로스앤젤레스"], losangeles: ["로스앤젤레스"],
  vegasfood: ["라스베이거스"], lasvegas: ["라스베이거스"],
  busanfood: ["부산"], busan: ["부산"],
  sydneyfood: ["시드니"], sydney: ["시드니"],
  melbournefood: ["멜버른"], melbourne: ["멜버른"],
  jakartafood: ["자카르타"], jakarta: ["자카르타"],
  klfood: ["쿠알라룸푸르"], kualalumpur: ["쿠알라룸푸르"],
  manilafood: ["마닐라"], manila: ["마닐라"],
  bogotafood: ["보고타"], bogota: ["보고타"],
  limafood: ["리마"], lima: ["리마"],
  santiagofood: ["산티아고"], santiago: ["산티아고"],
  buenosairesfood: ["부에노스아이레스"], buenosaires: ["부에노스아이레스"],
  saopaulofood: ["상파울루"], saopaulo: ["상파울루"],
  kaohsiungfood: ["가오슝"], kaohsiung: ["가오슝"],
  tampafood: ["탬파"], tampa: ["탬파"],
  elpasofood: ["엘파소"], elpaso: ["엘파소"],
  mexicocityfood: ["멕시코시티"], cdmxfood: ["멕시코시티"],
  bayareafood: ["스탠퍼드"], stanford: ["스탠퍼드"],
  baltimorefood: ["볼티모어"], baltimore: ["볼티모어"],
  goyang: ["고양"],
  metlifestadium: ["이스트러더퍼드"],
  gillettestadium: ["폭스버러"],
  arlingtontx: ["알링턴"],
};

function loadJSON<T>(pattern: string): T[] {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.includes(pattern) && f.endsWith(".json"));
  if (files.length === 0) {
    console.log(`  [Skip] ${pattern} 파일 없음`);
    return [];
  }
  files.sort().reverse();
  const filepath = path.join(DATA_DIR, files[0]);
  console.log(`  Loading: ${files[0]}`);
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

// URL 검증 스킵 — TikTok/Instagram URL은 형식만 확인 (이전 검증에서 99%+ 유효 확인됨)
function isValidUrl(url: string): boolean {
  return url.includes("tiktok.com/") || url.includes("instagram.com/");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龠\s]/g, "").trim();
}

// 텍스트에서 도시 추정
function detectCities(text: string, inputUrl?: string): string[] {
  const cities = new Set<string>();
  const lower = text.toLowerCase();

  // inputUrl에서 해시태그 추출 (인스타: /explore/tags/xxxfood/)
  if (inputUrl) {
    const tagMatch = inputUrl.match(/tags\/([^/]+)/);
    if (tagMatch) {
      const mapped = TAG_TO_CITY[tagMatch[1]];
      if (mapped) mapped.forEach((c) => cities.add(c));
    }
  }

  // 텍스트 내 도시명/해시태그 키워드
  for (const [key, cityNames] of Object.entries(TAG_TO_CITY)) {
    if (lower.includes(key)) {
      cityNames.forEach((c) => cities.add(c));
    }
  }

  return Array.from(cities);
}

// 텍스트에서 장소명 후보 추출
function extractPlaceNames(text: string): string[] {
  const names: string[] = [];

  // 📍 핀 뒤 장소명
  for (const line of text.split("\n")) {
    const match = line.match(/📍\s*(.+)/);
    if (match) {
      let name = match[1].split(",")[0].trim();
      if (/^(rue|boulevard|av\.|straat|calle|via|street|road)\s/i.test(name)) continue;
      // 숫자로만 된 것 스킵 (주소 번지)
      if (/^\d+$/.test(name)) continue;
      if (name.length >= 3) names.push(name);
    }
  }

  // - 또는 · 로 시작하는 장소 목록 (틱톡에서 흔함)
  for (const line of text.split("\n")) {
    const match = line.match(/^[-·•]\s*(.+)/);
    if (match) {
      let name = match[1].split(/[,(]/)[0].trim();
      if (name.length >= 3 && name.length <= 50) names.push(name);
    }
  }

  return names;
}

// 장소 매칭 (도시 필터링 + 양방향)
function matchPlacesInCity(
  text: string,
  locationName: string | null,
  cityPlaces: PlaceRow[]
): PlaceRow[] {
  const matched: PlaceRow[] = [];
  const matchedIds = new Set<number>();
  const fullText = `${text} ${locationName || ""}`;
  const searchText = normalize(fullText);

  // 1차: DB 장소명 → 텍스트 검색 (도시 범위 한정이니 3글자도 OK)
  for (const p of cityPlaces) {
    if (matchedIds.has(p.id)) continue;
    const names = [p.name, p.name_en, p.name_local].filter(Boolean) as string[];
    for (const name of names) {
      const norm = normalize(name);
      if (norm.length >= 3 && searchText.includes(norm)) {
        matched.push(p);
        matchedIds.add(p.id);
        break;
      }
    }
  }

  // 2차: 텍스트 장소명 → DB 검색 (역방향)
  const extractedNames = extractPlaceNames(fullText);
  for (const eName of extractedNames) {
    const normE = normalize(eName);
    for (const p of cityPlaces) {
      if (matchedIds.has(p.id)) continue;
      const names = [p.name, p.name_en, p.name_local].filter(Boolean) as string[];
      for (const name of names) {
        const normN = normalize(name);
        if (normN.length >= 3 && normE.length >= 3) {
          if (normN.includes(normE) || normE.includes(normN)) {
            matched.push(p);
            matchedIds.add(p.id);
            break;
          }
        }
      }
    }
  }

  // 3차: locationName 직접 매칭 (인스타)
  if (locationName) {
    const normLoc = normalize(locationName);
    for (const p of cityPlaces) {
      if (matchedIds.has(p.id)) continue;
      const names = [p.name, p.name_en, p.name_local].filter(Boolean) as string[];
      for (const name of names) {
        const normN = normalize(name);
        if (normN.length >= 3 && normLoc.length >= 3) {
          if (normN.includes(normLoc) || normLoc.includes(normN)) {
            matched.push(p);
            matchedIds.add(p.id);
            break;
          }
        }
      }
    }
  }

  return matched;
}

async function main() {
  console.log("===========================================");
  console.log(" B방식: 도시 특정 → 장소 매칭 → DB 저장");
  console.log("===========================================\n");

  const pool = new pg.Pool({ connectionString: DB_URL });

  // DB 로드
  console.log("[1] DB 데이터 로드...");
  const placesResult = await pool.query(`
    SELECT p.id, p.name, p.display_name_ko as name_en, p.name_local,
           p.city_id, c.name as city_name, c.name_en as city_name_en
    FROM places p JOIN cities c ON c.id = p.city_id
  `);
  const allPlaces: PlaceRow[] = placesResult.rows;

  // 도시별 장소 인덱스
  const placesByCity = new Map<string, PlaceRow[]>();
  for (const p of allPlaces) {
    const key = p.city_name;
    if (!placesByCity.has(key)) placesByCity.set(key, []);
    placesByCity.get(key)!.push(p);
  }
  console.log(`  장소: ${allPlaces.length}개 / 도시: ${placesByCity.size}개`);

  // 기존 seed_raw
  const seedResult = await pool.query(
    `SELECT place_id, instagram_post_url, tiktok_post_url FROM place_seed_raw`
  );
  const seedMap = new Map<number, SeedRow>();
  seedResult.rows.forEach((r: SeedRow) => seedMap.set(r.place_id, r));
  console.log(`  seed_raw: ${seedMap.size}개\n`);

  let totalTiktokSaved = 0;
  let totalInstaSaved = 0;
  const matchLog: string[] = [];

  // ---- TikTok ----
  console.log("[2] TikTok 처리...");
  const tiktokData = loadJSON<TikTokItem>("tiktok");
  if (tiktokData.length > 0) {
    tiktokData.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
    let matched = 0;

    for (const item of tiktokData) {
      if (!item.webVideoUrl || !isValidUrl(item.webVideoUrl)) continue;
      const text = item.text || "";

      // 도시 특정
      const cities = detectCities(text);
      if (cities.length === 0) continue;

      // 해당 도시 장소만 매칭
      for (const cityName of cities) {
        const cityPlaces = placesByCity.get(cityName);
        if (!cityPlaces) continue;

        const matches = matchPlacesInCity(text, null, cityPlaces);
        for (const place of matches) {
          matched++;
          const existing = seedMap.get(place.id);
          if (existing && !existing.tiktok_post_url) {
            await pool.query(
              `UPDATE place_seed_raw SET tiktok_post_url = $1 WHERE place_id = $2`,
              [item.webVideoUrl, place.id]
            );
            existing.tiktok_post_url = item.webVideoUrl;
            totalTiktokSaved++;
            matchLog.push(`  [TT] ${place.name} (${cityName}) ← plays:${(item.playCount||0)/1000|0}K`);
          }
        }
      }
    }
    console.log(`  매칭: ${matched}건 / DB 저장: ${totalTiktokSaved}건`);
  }

  // ---- Instagram ----
  console.log("\n[3] Instagram 처리...");
  const postsData = loadJSON<InstaItem>("instagram_posts");
  // 기존 수집본(테스트)도 로드
  const oldInsta = loadJSON<InstaItem>("dataset_instagram-scraper");

  const allInsta = [...postsData, ...oldInsta];
  if (allInsta.length > 0) {
    allInsta.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
    let matched = 0;

    for (const item of allInsta) {
      if (!item.url || !isValidUrl(item.url)) continue;
      const text = `${item.caption || ""} ${(item.hashtags || []).join(" ")}`;

      // 도시 특정 (inputUrl의 해시태그 + 텍스트)
      const cities = detectCities(text, item.inputUrl);
      if (cities.length === 0) continue;

      for (const cityName of cities) {
        const cityPlaces = placesByCity.get(cityName);
        if (!cityPlaces) continue;

        const matches = matchPlacesInCity(text, item.locationName || null, cityPlaces);
        for (const place of matches) {
          matched++;
          const existing = seedMap.get(place.id);
          if (existing && !existing.instagram_post_url) {
            await pool.query(
              `UPDATE place_seed_raw SET instagram_post_url = $1 WHERE place_id = $2`,
              [item.url, place.id]
            );
            existing.instagram_post_url = item.url;
            totalInstaSaved++;
            matchLog.push(`  [IG] ${place.name} (${cityName}) ← likes:${item.likesCount||0}`);
          }
        }
      }
    }
    console.log(`  매칭: ${matched}건 / DB 저장: ${totalInstaSaved}건`);
  }

  // ---- 결과 ----
  console.log("\n===========================================");
  console.log(" 결과");
  console.log("===========================================");
  console.log(`TikTok 신규 저장: ${totalTiktokSaved}곳`);
  console.log(`Instagram 신규 저장: ${totalInstaSaved}곳`);
  console.log(`\n매칭 상세 (최대 30건):`);
  matchLog.slice(0, 30).forEach((l) => console.log(l));
  if (matchLog.length > 30) console.log(`  ... +${matchLog.length - 30}건 더`);

  // DB 현황
  const fc = (await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE tiktok_post_url IS NOT NULL) as tiktok,
      COUNT(*) FILTER (WHERE instagram_post_url LIKE '%/reel/%') as reels,
      COUNT(*) FILTER (WHERE instagram_post_url IS NOT NULL AND instagram_post_url NOT LIKE '%/reel/%') as posts,
      COUNT(*) FILTER (WHERE instagram_post_url IS NOT NULL OR tiktok_post_url IS NOT NULL) as total,
      COUNT(*) as seed_total
    FROM place_seed_raw
  `)).rows[0];

  console.log(`\n[DB 현황]`);
  console.log(`  TikTok URL:    ${fc.tiktok}곳`);
  console.log(`  릴스 URL:      ${fc.reels}곳`);
  console.log(`  게시글 URL:    ${fc.posts}곳`);
  console.log(`  콘텐츠 보유:   ${fc.total}곳 / ${fc.seed_total}곳`);

  await pool.end();
}

main().catch(console.error);
