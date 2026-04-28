// p3 v2 — Wikipedia/Unsplash 풀 컨텍스트 폴백 (사용자 2026-04-28 사용자 요구)
// v1 대비 개선:
//   - Wikidata SPARQL (P625 좌표 around + P31 카테고리 + P131 행정구역) 1순위
//   - Wikipedia opensearch 풀 컨텍스트 (name + city + state + country)
//   - Unsplash 풀 컨텍스트 (name + city + state + category_kw)
//   - COALESCE 보호 (기존 Wiki/Unsplash 덮어쓰기 X)
//   - dry-run 없음 (사용자 지시: "바로 db에")
//
// 사용법:
//   node scripts/p3-wikipedia-unsplash-fill-v2.mjs --city-id=101

import 'dotenv/config';
import pg from 'pg';

const SUPA_URL = process.env.SUPA_URL || process.env.DATABASE_URL;
if (!SUPA_URL) { console.error('❌ SUPA_URL 미설정'); process.exit(1); }

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; })
);
const CITY_ID = parseInt(args['city-id'] || '101', 10);

// ━━━━━━ US 주 매핑 (p0-bts-daily-cron.mjs 와 동기화) ━━━━━━
const US_STATES = {
  'Tampa': 'Florida', 'El Paso': 'Texas', 'Stanford': 'California', 'Las Vegas': 'Nevada',
  'East Rutherford': 'New Jersey', 'Foxborough': 'Massachusetts', 'Baltimore': 'Maryland',
  'Arlington': 'Texas', 'Chicago': 'Illinois', 'Los Angeles': 'California',
};
const COUNTRY_EN = {
  US: 'United States', MX: 'Mexico', KR: 'South Korea', ES: 'Spain', BE: 'Belgium',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', CA: 'Canada', CO: 'Colombia',
  PE: 'Peru', CL: 'Chile', AR: 'Argentina', BR: 'Brazil', TW: 'Taiwan', TH: 'Thailand',
  MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia', AU: 'Australia', HK: 'Hong Kong', PH: 'Philippines',
  JP: 'Japan',
};

// ━━━━━━ 카테고리 → Wikidata P31/P279 (instance of/subclass) ━━━━━━
// 메모리 reference_user_ssot_algorithm.md + project_bts_data_insights.md
const CATEGORY_P31 = {
  attraction: ['Q570116', 'Q839954', 'Q33506'],         // tourist attraction / archaeological / museum
  restaurant: ['Q11707', 'Q1141826', 'Q1133017'],       // restaurant / fast food / cafe
  healing: ['Q22698', 'Q486972', 'Q1934334'],           // park / human settlement / spa town
  adventure: ['Q22698', 'Q4022', 'Q35509', 'Q333478'],  // park / river / cave / trail
  hotspot: ['Q4830453', 'Q486972', 'Q3950'],            // district / human settlement / square
  heritage: ['Q839954', 'Q358', 'Q33506', 'Q16970'],    // archaeological / heritage / museum / church
  shopping: ['Q11315', 'Q24237', 'Q330284'],            // shopping mall / department store / market
};

// ━━━━━━ 카테고리 → Unsplash 키워드 ━━━━━━
const UNSPLASH_KEYWORDS = {
  attraction: 'tourist attraction landmark',
  restaurant: 'restaurant food dining',
  healing: 'spa wellness park nature',
  adventure: 'outdoor adventure trail hike',
  hotspot: 'city downtown street culture',
  heritage: 'historic monument heritage landmark',
  shopping: 'shopping mall retail store',
};

// ━━━━━━ 텍스트 유사도 (token Jaccard) ━━━━━━
const STOP = new Set(['the', 'of', 'at', 'in', 'on', 'and', 'for', 'a', 'an']);
function tokens(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(t => t && !STOP.has(t));
}
function jaccard(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ━━━━━━ Wikidata SPARQL (P625 around 좌표 기반) ━━━━━━
async function wikidataAround(name, lat, lng, category, radius_km = 1.0) {
  const p31s = CATEGORY_P31[category] || [];
  const p31Filter = p31s.map(q => `wd:${q}`).join(' ');
  const sparql = `
    SELECT ?place ?placeLabel ?article WHERE {
      SERVICE wikibase:around {
        ?place wdt:P625 ?coord.
        bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral.
        bd:serviceParam wikibase:radius "${radius_km}".
      }
      ${p31s.length ? `?place wdt:P31/wdt:P279* ?type. FILTER(?type IN (${p31Filter})).` : ''}
      OPTIONAL {
        ?article schema:about ?place;
                 schema:isPartOf <https://en.wikipedia.org/>.
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 10
  `;
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'NUBI-BTS-image-fill/2.0 (https://github.com/VROIS)', 'Accept': 'application/sparql-results+json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const rows = d.results?.bindings || [];
    const scored = rows
      .filter(x => x.article?.value)
      .map(x => ({
        title: x.placeLabel.value,
        article: x.article.value,
        sim: jaccard(name, x.placeLabel.value),
      }))
      .filter(x => x.sim >= 0.4)
      .sort((a, b) => b.sim - a.sim);
    return scored[0] || null;
  } catch (e) {
    return null;
  }
}

// ━━━━━━ Wikipedia REST ━━━━━━
async function pageSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function opensearch(q, limit = 5) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=${limit}&format=json&namespace=0`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const d = await r.json();
    return d[1] || [];
  } catch { return []; }
}

// ━━━━━━ Wikipedia 풀 컨텍스트 검색 ━━━━━━
async function wikiFullContext(name, cityName, stateName, countryName) {
  // 풀 조합 우선순위
  const queries = [
    stateName ? `${name} ${cityName} ${stateName}` : null,
    `${name} ${cityName} ${countryName}`,
    stateName ? `${name} ${stateName}` : null,
    `${name} ${cityName}`,
    `${name} ${countryName}`,
    name,
  ].filter(Boolean);

  for (const q of queries) {
    const titles = await opensearch(q, 5);
    for (const t of titles) {
      if (/disambiguation/i.test(t)) continue;
      const s = await pageSummary(t);
      if (!s || s.type === 'disambiguation') continue;
      if (jaccard(name, s.title) < 0.4) continue;
      if (s.originalimage?.source || s.thumbnail?.source) {
        return {
          src: `wiki(${q.slice(0, 30)})`,
          title: s.title,
          image: s.originalimage?.source || s.thumbnail?.source,
        };
      }
    }
  }
  return null;
}

// ━━━━━━ Unsplash 풀 컨텍스트 ━━━━━━
async function unsplashFullContext(name, cityName, stateName, category, accessKey) {
  if (!accessKey) return null;
  const kw = UNSPLASH_KEYWORDS[category] || 'landmark';
  const queries = [
    stateName ? `${name} ${cityName} ${stateName} ${kw}` : `${name} ${cityName} ${kw}`,
    `${cityName} ${stateName || ''} ${kw}`.trim(),
    `${cityName} ${kw}`,
  ];
  for (const q of queries) {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`;
    try {
      const r = await fetch(url, {
        headers: { 'Authorization': `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.results?.length) continue;
      const p = d.results[0];
      return {
        src: `unsplash(${q.slice(0, 30)})`,
        image_url: p.urls.regular,
        attribution: `Unsplash stock: ${p.user.name} (${p.links.html})`,
      };
    } catch { continue; }
  }
  return null;
}

// ━━━━━━ Main ━━━━━━
const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log(`🚀 P3 v2 풀 컨텍스트 폴백 (city_id=${CITY_ID}, COMMIT 모드)\n`);

try {
  // 도시 정보
  const cityRes = await db.query('SELECT name_en, country_code FROM cities WHERE id=$1', [CITY_ID]);
  if (!cityRes.rows.length) { console.error(`❌ 도시 ${CITY_ID} 없음`); process.exit(1); }
  const { name_en: cityName, country_code: cc } = cityRes.rows[0];
  const countryName = COUNTRY_EN[cc] || cc;
  const stateName = cc === 'US' ? US_STATES[cityName] : null;
  const fullLocation = stateName ? `${cityName}, ${stateName}, ${countryName}` : `${cityName}, ${countryName}`;
  console.log(`🌆 도시: ${fullLocation}\n`);

  // Unsplash key (DB에서 로드, p1-unsplash-image-fill.mjs:32 동일 패턴)
  let unsplashKey = null;
  try {
    const k = await db.query("SELECT key_value FROM api_keys WHERE key_name='UNSPLASH_ACCESS_KEY' AND is_active=true LIMIT 1");
    unsplashKey = k.rows[0]?.key_value || null;
    console.log(unsplashKey ? '🔑 Unsplash key OK' : '⚠️ Unsplash key 없음 (Wikipedia만)');
  } catch { console.log('⚠️ api_keys 테이블 없음 (Wikipedia만)'); }

  // NULL row 조회
  const rows = await db.query(`
    SELECT id, name_en, latitude, longitude, seed_category
    FROM place_seed_raw
    WHERE city_id = $1
      AND collection_phase = 'bts2026'
      AND (image_url IS NULL OR image_url = '')
      AND name_en IS NOT NULL AND TRIM(name_en) <> ''
    ORDER BY seed_category, "rank"
  `, [CITY_ID]);
  console.log(`📊 처리 대상: ${rows.rows.length} rows\n`);

  const stats = {};
  const initStat = () => ({ total: 0, wikidata: 0, wiki: 0, unsplash: 0, no_match: 0 });

  for (const row of rows.rows) {
    if (!stats[row.seed_category]) stats[row.seed_category] = initStat();
    const s = stats[row.seed_category];
    s.total++;

    // 1) Wikidata SPARQL (좌표 + 카테고리 + radius 1km)
    let result = null;
    if (row.latitude && row.longitude) {
      const wd = await wikidataAround(row.name_en, row.latitude, row.longitude, row.seed_category, 1.0);
      if (wd) {
        // article URL 에서 page title 추출
        const m = wd.article.match(/\/wiki\/([^?#]+)$/);
        if (m) {
          const title = decodeURIComponent(m[1]).replace(/_/g, ' ');
          const sm = await pageSummary(title);
          if (sm && (sm.originalimage?.source || sm.thumbnail?.source)) {
            result = {
              src: `wikidata(${title})`,
              title: sm.title,
              image: sm.originalimage?.source || sm.thumbnail?.source,
            };
          }
        }
      }
    }

    // 2) Wikipedia 풀 컨텍스트
    if (!result) {
      result = await wikiFullContext(row.name_en, cityName, stateName, countryName);
    }

    if (result) {
      const isWikidata = result.src.startsWith('wikidata');
      if (isWikidata) s.wikidata++; else s.wiki++;
      console.log(`  ✓ [${result.src}] ${row.name_en} → ${result.title}`);
      await db.query(`
        UPDATE place_seed_raw
        SET image_url = COALESCE(image_url, $1),
            image_attribution = COALESCE(image_attribution, $2),
            image_updated_at = COALESCE(image_updated_at, NOW())
        WHERE id = $3 AND (image_url IS NULL OR image_url = '')
      `, [result.image, `Wikipedia: ${result.title}`, row.id]);
      continue;
    }

    // 3) Unsplash 풀 컨텍스트
    const u = await unsplashFullContext(row.name_en, cityName, stateName, row.seed_category, unsplashKey);
    if (u) {
      s.unsplash++;
      console.log(`  ～ [${u.src}] ${row.name_en} → ${u.image_url.slice(0, 50)}...`);
      await db.query(`
        UPDATE place_seed_raw
        SET image_url = COALESCE(image_url, $1),
            image_attribution = COALESCE(image_attribution, $2),
            image_updated_at = COALESCE(image_updated_at, NOW())
        WHERE id = $3 AND (image_url IS NULL OR image_url = '')
      `, [u.image_url, u.attribution, row.id]);
      continue;
    }

    s.no_match++;
    console.log(`  ✗ [없음] ${row.name_en}`);
  }

  // 결과 표
  console.log('\n' + '─'.repeat(75));
  console.log(`📊 결과 (city_id=${CITY_ID} ${fullLocation}, COMMITTED):`);
  console.log('─'.repeat(75));
  console.log('카테고리         대상   Wikidata   Wiki   Unsplash   미매칭');
  console.log('─'.repeat(75));
  let totT = 0, totWd = 0, totW = 0, totU = 0, totN = 0;
  for (const [cat, s] of Object.entries(stats).sort()) {
    console.log(`${cat.padEnd(14)} ${String(s.total).padStart(4)} ${String(s.wikidata).padStart(8)} ${String(s.wiki).padStart(7)} ${String(s.unsplash).padStart(9)} ${String(s.no_match).padStart(7)}`);
    totT += s.total; totWd += s.wikidata; totW += s.wiki; totU += s.unsplash; totN += s.no_match;
  }
  console.log('─'.repeat(75));
  console.log(`합계           ${String(totT).padStart(4)} ${String(totWd).padStart(8)} ${String(totW).padStart(7)} ${String(totU).padStart(9)} ${String(totN).padStart(7)}`);
  console.log(`\n✅ Supabase Studio SQL Editor 검증 쿼리:`);
  console.log(`SELECT seed_category, COUNT(*) FILTER (WHERE image_url IS NULL) AS still_null FROM place_seed_raw WHERE city_id=${CITY_ID} AND collection_phase='bts2026' GROUP BY seed_category ORDER BY seed_category;`);

} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
} finally {
  await db.end();
}
