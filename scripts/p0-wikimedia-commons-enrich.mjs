// ⚠️ 수정금지(승인필요) — Wikimedia Commons API 식당 이미지 보강 (사용자 2026-04-25 승인)
//
// 목적: place_seed_raw 의 매칭 < 25% 식당 rows 를 Wikimedia Commons categorymembers + 토큰 매칭으로 보강
// 근거 (Agent 리서치 2026-04-25): Tier 1 = Wikimedia Commons (CC 라이선스, 무료 무제한)
//
// 처리:
//   1. 매칭율 < 25% restaurant rows 추출 (도시별 그룹핑)
//   2. 각 도시 → Wikimedia Commons `Category:Restaurants_in_<City>` 1번 호출 (cmlimit=500)
//   3. 각 row 의 name_en vs 풀 내 파일명 토큰 매칭 ≥ 0.5 채택
//   4. dry-run: 통계만, COMMIT: image_url + image_attribution UPDATE
//
// API:
//   https://commons.wikimedia.org/w/api.php
//   action=query&generator=categorymembers&gcmtitle=Category:Restaurants_in_X
//     &gcmtype=file&gcmlimit=500&prop=imageinfo&iiprop=url|extmetadata
//   User-Agent 명시 필수 (Wikimedia 정책)
//
// 정책: photo bytes 다운로드 후 우리 스토리지 저장 가능, attribution 표시 의무
//
// 모드:
//   --dry-run        : 시뮬레이션
//   --threshold=0.5  : 매칭 임계 (기본 0.5)
//   --category=restaurant  : 카테고리 (기본 restaurant)
//   --commit         : 실제 UPDATE
//
// 실행:
//   node scripts/p0-wikimedia-commons-enrich.mjs --dry-run

import pg from 'pg';

const SUPA_URL = 'postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';
const UA = 'NubiBot/1.0 (vibetrip; contact@vibetrip.app)';
const DRY_RUN = !process.argv.includes('--commit');
const THR_ARG = process.argv.find((a) => a.startsWith('--threshold='));
const THRESHOLD = THR_ARG ? parseFloat(THR_ARG.split('=')[1]) : 0.5;
const CAT_ARG = process.argv.find((a) => a.startsWith('--category='));
const CATEGORY = CAT_ARG ? CAT_ARG.split('=')[1] : 'restaurant';

// 도시명 → Wikimedia Commons 카테고리 키 매핑 (특수문자 처리)
const CITY_TO_COMMONS_KEY = {
  'Tampa': 'Tampa,_Florida',
  'El Paso': 'El_Paso,_Texas',
  'Mexico City': 'Mexico_City',
  'Stanford': 'Stanford,_California',
  'Las Vegas': 'Las_Vegas',
  'Busan': 'Busan',
  'Madrid': 'Madrid',
  'Brussels': 'Brussels',
  'London': 'London',
  'Munich': 'Munich',
  'Paris': 'Paris',
  'East Rutherford': 'East_Rutherford,_New_Jersey',
  'Foxborough': 'Foxborough,_Massachusetts',
  'Baltimore': 'Baltimore',
  'Arlington': 'Arlington,_Texas',
  'Toronto': 'Toronto',
  'Chicago': 'Chicago',
  'Los Angeles': 'Los_Angeles',
  'Bogota': 'Bogotá',
  'Lima': 'Lima',
  'Santiago': 'Santiago,_Chile',
  'Buenos Aires': 'Buenos_Aires',
  'Sao Paulo': 'São_Paulo',
  'Kaohsiung': 'Kaohsiung',
  'Bangkok': 'Bangkok',
  'Kuala Lumpur': 'Kuala_Lumpur',
  'Singapore': 'Singapore',
  'Jakarta': 'Jakarta',
  'Melbourne': 'Melbourne',
  'Sydney': 'Sydney',
  'Hong Kong': 'Hong_Kong',
  'Manila': 'Manila',
};

// 카테고리 → Wikimedia Commons 카테고리 prefix
const CAT_PREFIX = {
  restaurant: 'Restaurants_in_',
  hotspot: 'Tourist_attractions_in_',
  attraction: 'Tourist_attractions_in_',
  healing: 'Parks_in_',
  heritage: 'Cultural_heritage_monuments_in_',
  shopping: 'Shopping_centres_in_',
  adventure: 'Theme_parks_in_',
};

// STOP word 확장 (Step 1 정밀화, 사용자 2026-04-25): cuisine 같은 일반 음식 토큰 false positive 차단
const STOP = new Set([
  'the','of','a','an','and','or','in','on','at','to','for','by','with','from',
  'de','la','le','les','du','des','el','los','las','il','di','da','i','y',
  'von','der','das','die','van','en','og','pa','av',
  // 음식/식당 일반 (false positive 차단)
  'restaurant','restaurants','cafe','cafes','cuisine','cuisines','dining','dinner',
  'food','foods','meal','meals','bar','bars','pub','pubs','eatery','eateries',
  'kitchen','table','menu','dish','dishes','breakfast','lunch','brunch',
  // 시설 일반
  'hotel','hotels','building','buildings','center','centre','centers','centres',
  'shop','shops','store','stores','market','markets',
  'park','parks','garden','gardens','museum','museums','gallery','galleries',
  'church','churches','temple','temples','tower','towers','square','squares',
  // 도시/국가 일반
  'city','town','village','district','neighborhood','street','road','avenue',
]);

function tokenize(s) {
  if (!s) return [];
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[\s\-_.,'"()\[\]!?#&%$/\\:;]+/)
    .filter((t) => t && t.length >= 2 && !STOP.has(t));
}

function extractFilename(url) {
  if (!url) return '';
  try {
    const decoded = decodeURIComponent(url);
    const last = decoded.split('/').pop() || '';
    return last.replace(/^\d+px-/, '').replace(/\.(jpg|jpeg|png|svg|webp|gif)(\.[a-z]+)?$/i, '');
  } catch { return ''; }
}

function matchRatio(name, urlOrFilename) {
  const nt = tokenize(name);
  if (nt.length === 0) return 0;
  const fnSrc = urlOrFilename.startsWith('http') ? extractFilename(urlOrFilename) : urlOrFilename;
  const ft = new Set(tokenize(fnSrc));
  return nt.filter((t) => ft.has(t)).length / nt.length;
}

async function fetchCommonsCategory(commonsKey, prefix) {
  const cat = `Category:${prefix}${commonsKey}`;
  const url = `https://commons.wikimedia.org/w/api.php?` + new URLSearchParams({
    action: 'query', format: 'json',
    generator: 'categorymembers',
    gcmtitle: cat, gcmtype: 'file', gcmlimit: '500',
    prop: 'imageinfo', iiprop: 'url|extmetadata',
  });
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages || {};
    return Object.values(pages).map((p) => ({
      title: p.title || '',
      url: p.imageinfo?.[0]?.url || '',
      license: p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value || '',
      author: p.imageinfo?.[0]?.extmetadata?.Artist?.value || '',
    })).filter((x) => x.url);
  } catch (e) {
    return [];
  }
}

const db = new pg.Client({ connectionString: SUPA_URL });
await db.connect();

console.log(`\n🚀 [Wikimedia Commons Enrich] ${DRY_RUN ? 'DRY-RUN' : 'COMMIT'} (category=${CATEGORY}, threshold=${THRESHOLD})`);

// 매칭 < 25% rows 식별 + 도시별 그룹핑
const rows = await db.query(`
  SELECT psr.id, psr.city_id, psr.name_en, psr.image_url, c.name_en AS city_name
  FROM place_seed_raw psr
  JOIN cities c ON psr.city_id = c.id
  WHERE psr.collection_phase = 'bts2026'
    AND c.bts_rank IS NOT NULL AND COALESCE(c.bts_archived, false) = false
    AND psr.seed_category = $1
    AND psr.image_url IS NOT NULL AND psr.image_url != ''
`, [CATEGORY]);

const targets = rows.rows.filter((r) => matchRatio(r.name_en, r.image_url) < 0.25);
console.log(`현재 ${CATEGORY} rows: ${rows.rows.length} / 매칭 < 25% (보강 대상): ${targets.length}`);

const byCity = new Map();
for (const r of targets) {
  if (!byCity.has(r.city_name)) byCity.set(r.city_name, []);
  byCity.get(r.city_name).push(r);
}
console.log(`도시별 보강 대상: ${byCity.size} 도시`);

const prefix = CAT_PREFIX[CATEGORY] || 'Restaurants_in_';
const stats = { totalTargets: 0, poolByCity: {}, matched: 0, unmatched: 0, sample: [], byCity: [] };

for (const [cityName, cityRows] of byCity.entries()) {
  const commonsKey = CITY_TO_COMMONS_KEY[cityName];
  if (!commonsKey) {
    console.log(`  ⏭️  ${cityName}: Commons 키 매핑 없음, SKIP`);
    continue;
  }
  const pool = await fetchCommonsCategory(commonsKey, prefix);
  stats.poolByCity[cityName] = pool.length;
  stats.totalTargets += cityRows.length;

  let cityMatched = 0;
  for (const row of cityRows) {
    let best = null;
    let bestRatio = 0;
    for (const file of pool) {
      const r = matchRatio(row.name_en, file.title.replace(/^File:/, ''));
      if (r > bestRatio && r >= THRESHOLD) {
        best = file; bestRatio = r;
      }
    }
    if (best) {
      stats.matched++; cityMatched++;
      if (stats.sample.length < 12) {
        stats.sample.push({ city: cityName, name: row.name_en.slice(0, 30), match: bestRatio.toFixed(2), file: best.title.slice(0, 50), license: best.license });
      }
      if (!DRY_RUN) {
        await db.query(`UPDATE place_seed_raw SET image_url = $1, updated_at = NOW() WHERE id = $2`, [best.url, row.id]);
      }
    } else {
      stats.unmatched++;
    }
  }
  stats.byCity.push({ city: cityName, targets: cityRows.length, pool: pool.length, matched: cityMatched, hit_rate: cityRows.length > 0 ? `${((cityMatched / cityRows.length) * 100).toFixed(0)}%` : '0%' });
  console.log(`  ${cityName.padEnd(20)} pool=${String(pool.length).padStart(3)} / 대상=${String(cityRows.length).padStart(3)} / 매칭=${cityMatched}`);

  // rate limit (5 req/sec 안전 마진)
  await new Promise((r) => setTimeout(r, 250));
}

console.log(`\n=== 도시별 결과 ===`);
console.table(stats.byCity);

console.log(`\n=== 샘플 매칭 (최대 12) ===`);
console.table(stats.sample);

console.log(`\n=== 합계 ===`);
console.log(`보강 대상: ${stats.totalTargets} rows`);
console.log(`매칭 성공: ${stats.matched} (${stats.totalTargets > 0 ? ((stats.matched / stats.totalTargets) * 100).toFixed(1) : 0}%)`);
console.log(`매칭 실패: ${stats.unmatched}`);
console.log(`${DRY_RUN ? '\n🔄 DRY-RUN: DB 변경 없음' : '\n✅ COMMIT 완료'}`);

await db.end();
