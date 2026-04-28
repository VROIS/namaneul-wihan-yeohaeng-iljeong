// ⚠️ 수정금지(승인필요) — Wikipedia → Unsplash fallback 이미지 채우기
// image_url IS NULL 인 row 에 Wikipedia 검색 후, 없으면 Unsplash stock 으로 채움
// Google 이미지 있는 row = COALESCE 로 보호 (덮어쓰기 X)
//
// 사용법:
//   node scripts/p3-wikipedia-unsplash-fill.mjs --city-id=101 --dry-run
//   node scripts/p3-wikipedia-unsplash-fill.mjs --city-id=101 --commit
//
// 실행 환경: GitHub Actions (SUPA_URL secret 필수, 로컬 DNS 차단)

import pg from 'pg';

const { Client } = pg;

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const DRY_RUN = !args.commit;
const CITY_ID = parseInt(args['city-id'] || '101', 10);

// ⚠️ 수정금지(승인필요) — country_code → 영문 국가명 (searchText 쿼리 정확도)
const COUNTRY_EN = {
  US: 'United States', MX: 'Mexico', KR: 'South Korea', ES: 'Spain', BE: 'Belgium',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', CA: 'Canada', CO: 'Colombia',
  PE: 'Peru', CL: 'Chile', AR: 'Argentina', BR: 'Brazil', TW: 'Taiwan', TH: 'Thailand',
  MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia', AU: 'Australia', HK: 'Hong Kong',
  PH: 'Philippines',
};

// ⚠️ 수정금지(승인필요) — 카테고리별 Unsplash 키워드 (사용자 SSOT 7 카테고리)
const CATEGORY_KEYWORDS = {
  attraction: 'tourist attraction landmark',
  restaurant: 'restaurant food dining',
  healing: 'spa wellness park nature',
  adventure: 'outdoor adventure activity',
  hotspot: 'city downtown street nightlife',
  heritage: 'historic monument landmark',
  shopping: 'shopping mall retail store',
};

// ━━━━━━ 텍스트 유사도 (p1-wikipedia-image-fill.mjs 동일 알고리즘) ━━━━━━
const STOP = new Set(['the','of','at','in','on','el','paso','state','historic','site',
  'national','main','post','and','&','reception','center','del','de','la','los','las',
  'san','santa','city','a','an']);
const KEY_NOUNS = ['cemetery','university','tower','cathedral','hotel','school','park',
  'house','mountain','district','center','museum','memorial','mission','church','fort',
  'palace','tomb','barrio','dam','depot','jail','homestead','bridge','pueblo','plaza',
  'theatre','theater','tanks','temple','monastery','castle','abbey','basilica'];

function normalize(s) {
  return (s || '').toLowerCase().replace(/[.,'"()]/g, ' ').split(/\s+/)
    .filter(t => t && !STOP.has(t)).join(' ');
}
function tokenSim(a, b) {
  const at = new Set(normalize(a).split(' ').filter(Boolean));
  const bt = new Set(normalize(b).split(' ').filter(Boolean));
  if (!at.size || !bt.size) return 0;
  let common = 0;
  for (const t of at) if (bt.has(t)) common++;
  return common / Math.max(at.size, bt.size);
}
function fuzzySim(a, b) {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return 0;
  const m = x.length, n = y.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = x[i-1] === y[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  }
  return 1 - dp[m][n] / Math.max(m, n);
}
function bestSim(a, b) { return Math.max(tokenSim(a, b), fuzzySim(a, b)); }

function keywordPass(input, label) {
  const inLow = (input || '').toLowerCase();
  const resLow = (label || '').toLowerCase();
  for (const kw of KEY_NOUNS) {
    if (resLow.includes(kw) && !inLow.includes(kw)) return false;
  }
  return true;
}

function aliases(name) {
  const out = [name];
  for (const suf of [' Historic Site', ' State Historic Site', ' National Park',
    ' National Monument', ' State Park', ' Historic District', ' Reception Center',
    ' Main Post Historic District', ' UNESCO World Heritage Site']) {
    if (name.endsWith(suf)) out.push(name.slice(0, -suf.length));
  }
  if (name.toLowerCase().startsWith('the ')) out.push(name.slice(4));
  return [...new Set(out)];
}

// ━━━━━━ Wikipedia API 호출 ━━━━━━
async function httpGet(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'MyHandyGuide-bts/1.0 (contact: nubi)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

async function geosearch(lat, lng, radius = 1500) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch`
    + `&ggscoord=${lat}|${lng}&ggsradius=${radius}&ggslimit=10`
    + `&prop=pageimages|description&piprop=thumbnail|original&pithumbsize=800&format=json`;
  try {
    const d = await httpGet(url);
    return Object.values(d.query?.pages || {}).map(p => ({
      title: p.title || '', desc: p.description || '',
      thumb: p.thumbnail?.source, orig: p.original?.source,
    }));
  } catch { return []; }
}

async function opensearch(q, limit = 5) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch`
    + `&search=${encodeURIComponent(q)}&limit=${limit}&namespace=0&format=json`;
  try { const d = await httpGet(url); return d[1] || []; } catch { return []; }
}

async function pageSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  try {
    const d = await httpGet(url);
    return {
      title: d.title || title, desc: d.description || '', type: d.type || '',
      coord: d.coordinates || null,
      thumb: d.thumbnail?.source, orig: d.originalimage?.source,
    };
  } catch { return null; }
}

function hav(la1, ln1, la2, ln2) {
  const R = 6371, p1 = la1 * Math.PI / 180, p2 = la2 * Math.PI / 180;
  const dp = (la2 - la1) * Math.PI / 180, dl = (ln2 - ln1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ━━━━━━ Wikipedia 3단계 매칭 (동적 cityName/countryName) ━━━━━━
async function stage1Geosearch(name, lat, lng) {
  if (lat == null || lng == null) return null;
  const cands = await geosearch(lat, lng, 1500);
  const scored = cands
    .filter(c => keywordPass(name, c.title))
    .map(c => ({ sim: bestSim(name, c.title), c }))
    .sort((a, b) => b.sim - a.sim);
  if (scored.length && scored[0].sim >= 0.5) {
    const c = scored[0].c;
    return { src: '1.geo', sim: scored[0].sim, title: c.title, image: c.orig || c.thumb };
  }
  return null;
}

async function stage2Open(name, lat, lng, cityName, countryName) {
  // ⚠️ 수정금지(승인필요) — 동적 도시명/국가명 사용 (El Paso 하드코딩 제거)
  for (const alias of aliases(name)) {
    for (const q of [`${alias} ${cityName}`, `${alias} ${countryName}`, alias]) {
      const titles = await opensearch(q, 5);
      for (const t of titles) {
        if (/disambiguation/i.test(t)) continue;
        const s = await pageSummary(t);
        if (!s || s.type === 'disambiguation') continue;
        if (bestSim(name, s.title) < 0.4) continue;
        if (!keywordPass(name, s.title)) continue;
        if (s.coord && lat != null && lng != null) {
          if (hav(lat, lng, s.coord.lat, s.coord.lon) > 5.0) continue;
        }
        if (s.orig || s.thumb || s.coord) {
          return { src: `2.open(${q})`, sim: bestSim(name, s.title), title: s.title, image: s.orig || s.thumb };
        }
      }
    }
  }
  return null;
}

async function stage3Relaxed(name, lat, lng, cityName) {
  for (const alias of aliases(name)) {
    for (const q of [`${alias} ${cityName}`, alias]) {
      const titles = await opensearch(q, 3);
      for (const t of titles) {
        if (/disambiguation/i.test(t)) continue;
        const s = await pageSummary(t);
        if (!s || s.type === 'disambiguation') continue;
        if (bestSim(name, s.title) < 0.5) continue;
        if (!keywordPass(name, s.title)) continue;
        if (s.orig || s.thumb) {
          return { src: `3.relax(${q})`, sim: bestSim(name, s.title), title: s.title, image: s.orig || s.thumb };
        }
      }
    }
  }
  return null;
}

async function matchWikipedia(name, lat, lng, cityName, countryName) {
  let r = await stage1Geosearch(name, lat, lng);
  if (!r) r = await stage2Open(name, lat, lng, cityName, countryName);
  if (!r) r = await stage3Relaxed(name, lat, lng, cityName);
  return r;
}

// ━━━━━━ Unsplash fallback ━━━━━━
async function searchUnsplash(name, cityName, category, accessKey) {
  const kw = CATEGORY_KEYWORDS[category] || 'landmark';
  const query = `${name} ${cityName} ${kw}`;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  try {
    const r = await fetch(url, {
      headers: { 'Authorization': `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.results?.length) return null;
    const p = d.results[0];
    return {
      image_url: p.urls.regular,
      attribution: `Unsplash stock: ${p.user.name} (${p.links.html})`,
    };
  } catch { return null; }
}

// ━━━━━━ Main ━━━━━━
(async () => {
  console.log(`🚀 P3 Wikipedia/Unsplash fallback (city_id=${CITY_ID}, ${DRY_RUN ? 'DRY-RUN' : 'COMMIT'})\n`);

  const SUPA = process.env.SUPA_URL;
  if (!SUPA) { console.error('❌ SUPA_URL 없음'); process.exit(1); }

  const db = new Client({ connectionString: SUPA, ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log('✅ DB 연결 OK');

  // 도시 정보
  const cityRes = await db.query('SELECT name_en, country_code FROM cities WHERE id=$1', [CITY_ID]);
  if (!cityRes.rows.length) { console.error(`❌ city_id=${CITY_ID} 없음`); process.exit(1); }
  const { name_en: cityName, country_code } = cityRes.rows[0];
  const countryName = COUNTRY_EN[country_code] || country_code;
  console.log(`🌆 도시: ${cityName} (${countryName})\n`);

  // Unsplash API 키 (없으면 skip)
  let unsplashKey = null;
  try {
    const kr = await db.query("SELECT key_value FROM api_keys WHERE key_name='UNSPLASH_ACCESS_KEY' AND is_active=true");
    if (kr.rows.length) unsplashKey = kr.rows[0].key_value;
  } catch { /* api_keys 없으면 skip */ }
  if (!unsplashKey) console.log('⚠️  UNSPLASH_ACCESS_KEY 없음 → Wikipedia 만 시도\n');

  // 처리 대상 rows (image_url IS NULL)
  const { rows } = await db.query(`
    SELECT p.id, p.name_en, p.latitude, p.longitude, p.seed_category
    FROM place_seed_raw p
    WHERE p.city_id = $1
      AND p.collection_phase = 'bts2026'
      AND (p.image_url IS NULL OR p.image_url = '')
      AND p.name_en IS NOT NULL AND TRIM(p.name_en) <> ''
    ORDER BY p.seed_category, p.rank NULLS LAST, p.id
  `, [CITY_ID]);
  console.log(`📊 처리 대상: ${rows.length} rows\n`);

  // 카테고리별 통계
  const stats = {};
  const initStat = () => ({ total: 0, wiki: 0, unsplash: 0, no_match: 0 });

  for (const row of rows) {
    if (!stats[row.seed_category]) stats[row.seed_category] = initStat();
    const s = stats[row.seed_category];
    s.total++;

    // Stage 1~3: Wikipedia
    const wikiMatch = await matchWikipedia(row.name_en, row.latitude, row.longitude, cityName, countryName);

    if (wikiMatch?.image) {
      s.wiki++;
      console.log(`  ✓ [wiki/${wikiMatch.src}] sim=${wikiMatch.sim.toFixed(2)} | ${row.name_en} → ${wikiMatch.title}`);
      if (!DRY_RUN) {
        await db.query(`
          UPDATE place_seed_raw
          SET image_url = COALESCE(image_url, $1),
              image_attribution = COALESCE(image_attribution, $2)
          WHERE id = $3
        `, [wikiMatch.image, `Wikipedia: ${wikiMatch.title}`, row.id]);
      }
      await new Promise(r => setTimeout(r, 400));
      continue;
    }

    // Unsplash fallback
    if (unsplashKey) {
      const uMatch = await searchUnsplash(row.name_en, cityName, row.seed_category, unsplashKey);
      if (uMatch) {
        s.unsplash++;
        console.log(`  ～ [unsplash] | ${row.name_en} → ${uMatch.image_url.slice(0, 60)}...`);
        if (!DRY_RUN) {
          await db.query(`
            UPDATE place_seed_raw
            SET image_url = COALESCE(image_url, $1),
                image_attribution = COALESCE(image_attribution, $2)
            WHERE id = $3
          `, [uMatch.image_url, uMatch.attribution, row.id]);
        }
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
    }

    s.no_match++;
    console.log(`  ✗ [없음] | ${row.name_en}`);
    await new Promise(r => setTimeout(r, 200));
  }

  // ━━━━━━ 카테고리별 리포트 ━━━━━━
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📊 Wikipedia/Unsplash 결과 (city_id=${CITY_ID} ${cityName}, ${DRY_RUN ? 'DRY' : 'COMMITTED'}):`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`${'카테고리'.padEnd(14)} ${'대상'.padStart(4)} ${'Wiki'.padStart(6)} ${'Unsplash'.padStart(9)} ${'미매칭'.padStart(6)}`);
  console.log(`${'─'.repeat(70)}`);
  let totTotal = 0, totWiki = 0, totUnsplash = 0, totNone = 0;
  for (const [cat, s] of Object.entries(stats).sort()) {
    console.log(`${cat.padEnd(14)} ${String(s.total).padStart(4)} ${String(s.wiki).padStart(6)} ${String(s.unsplash).padStart(9)} ${String(s.no_match).padStart(6)}`);
    totTotal += s.total; totWiki += s.wiki; totUnsplash += s.unsplash; totNone += s.no_match;
  }
  console.log(`${'─'.repeat(70)}`);
  console.log(`${'합계'.padEnd(14)} ${String(totTotal).padStart(4)} ${String(totWiki).padStart(6)} ${String(totUnsplash).padStart(9)} ${String(totNone).padStart(6)}`);
  console.log(`\n총 ${totTotal} → Wikipedia ${totWiki} + Unsplash ${totUnsplash} + 미매칭 ${totNone}\n`);

  // ━━━━━━ 사용자 확인 SQL ━━━━━━
  console.log(`✅ Supabase Studio → SQL Editor 에서 아래 쿼리로 직접 확인:`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`SELECT seed_category,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE image_attribution LIKE '%Wikipedia%') AS wikipedia,
  COUNT(*) FILTER (WHERE image_attribution LIKE '%Unsplash%') AS unsplash,
  COUNT(*) FILTER (WHERE image_url LIKE '%supabase%') AS google_cron,
  COUNT(*) FILTER (WHERE image_url IS NULL) AS still_null
FROM place_seed_raw
WHERE city_id = ${CITY_ID} AND collection_phase = 'bts2026'
GROUP BY seed_category
ORDER BY seed_category;`);
  console.log(`${'─'.repeat(70)}\n`);

  await db.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
