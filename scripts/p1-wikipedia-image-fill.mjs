// ⚠️ 수정금지(승인필요) — Wikipedia 이미지 매칭 (시뮬 7 검증 알고리즘)
// place_seed_raw 의 image_url IS NULL row 에 Wikipedia geosearch + opensearch + relaxed
//
// 사용법:
//   node scripts/p1-wikipedia-image-fill.mjs --city-id=101 --dry-run
//   node scripts/p1-wikipedia-image-fill.mjs --city-id=101 --commit

import pg from 'pg';

const { Client } = pg;
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const DRY_RUN = !args.commit;
const CITY_ID = parseInt(args['city-id'] || '101', 10);

// 시뮬 7 검증된 알고리즘
const STOP = new Set(['the','of','at','in','on','el','paso','state','historic','site','national','main','post','and','&','reception','center','del','de','la']);
const KEY_NOUNS = ['cemetery','university','tower','cathedral','hotel','school','park','house','mountain','district','center','museum','memorial','mission','church','fort','palace','tomb','horizon','barrio','dam','depot','jail','homestead','synagogue','motel','streetcar','bridge','pueblo','plaza','theatre','theater','tanks','battle'];

function normalize(s) {
  return (s || '').toLowerCase().replace(/[.,'"()]/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t)).join(' ');
}
function tokenSim(a, b) {
  const at = new Set(normalize(a).split(' '));
  const bt = new Set(normalize(b).split(' '));
  if (at.size === 0 || bt.size === 0) return 0;
  let common = 0;
  for (const t of at) if (bt.has(t)) common++;
  return common / Math.max(at.size, bt.size);
}
function fuzzySim(a, b) {
  // 단순 Levenshtein 기반 ratio (difflib SequenceMatcher 근사)
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
  for (const suf of [' Historic Site', ' State Historic Site', ' National Park', ' Reception Center', ' Main Post Historic District', ' Historic District', ' State Park']) {
    if (name.endsWith(suf)) out.push(name.slice(0, -suf.length));
  }
  if (name.toLowerCase().startsWith('the ')) out.push(name.slice(4));
  return [...new Set(out)];
}

async function httpGet(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'VROIS-bts/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

async function geosearch(lat, lng, radius = 1500) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lng}&ggsradius=${radius}&ggslimit=10&prop=pageimages|description&piprop=thumbnail|original&pithumbsize=800&format=json`;
  try {
    const d = await httpGet(url);
    return Object.values(d.query?.pages || {}).map(p => ({
      title: p.title || '',
      desc: p.description || '',
      thumb: p.thumbnail?.source,
      orig: p.original?.source,
    }));
  } catch { return []; }
}

async function opensearch(name, limit = 5) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=${limit}&namespace=0&format=json`;
  try {
    const d = await httpGet(url);
    return d[1] || [];
  } catch { return []; }
}

async function pageSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  try {
    const d = await httpGet(url);
    return {
      title: d.title || title,
      desc: d.description || '',
      type: d.type || '',
      coord: d.coordinates || null,
      thumb: d.thumbnail?.source,
      orig: d.originalimage?.source,
    };
  } catch { return null; }
}

function hav(la1, ln1, la2, ln2) {
  const R = 6371, p1 = la1 * Math.PI / 180, p2 = la2 * Math.PI / 180;
  const dp = (la2 - la1) * Math.PI / 180, dl = (ln2 - ln1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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

async function stage2Open(name, lat, lng) {
  for (const alias of aliases(name)) {
    for (const q of [`${alias} El Paso`, `${alias} Texas`, alias]) {
      const titles = await opensearch(q, 5);
      for (const t of titles) {
        if (/disambiguation/i.test(t)) continue;
        const s = await pageSummary(t);
        if (!s || s.type === 'disambiguation') continue;
        const sim = bestSim(name, s.title);
        if (sim < 0.4) continue;
        if (!keywordPass(name, s.title)) continue;
        if (s.coord && lat != null && lng != null) {
          if (hav(lat, lng, s.coord.lat, s.coord.lon) > 5.0) continue;
        }
        if (s.orig || s.thumb || s.coord) {
          return { src: `2.open(${q})`, sim, title: s.title, image: s.orig || s.thumb, coord: s.coord };
        }
      }
    }
  }
  return null;
}

async function stage3Relaxed(name, lat, lng) {
  for (const alias of aliases(name)) {
    for (const q of [`${alias} El Paso`, alias]) {
      const titles = await opensearch(q, 3);
      for (const t of titles) {
        if (/disambiguation/i.test(t)) continue;
        const s = await pageSummary(t);
        if (!s || s.type === 'disambiguation') continue;
        const sim = bestSim(name, s.title);
        if (sim < 0.5) continue;
        if (!keywordPass(name, s.title)) continue;
        if (s.orig || s.thumb) {
          return { src: `3.relax(${q})`, sim, title: s.title, image: s.orig || s.thumb, coord: s.coord };
        }
      }
    }
  }
  return null;
}

async function matchOne(name, lat, lng) {
  let r = await stage1Geosearch(name, lat, lng);
  if (!r) r = await stage2Open(name, lat, lng);
  if (!r) r = await stage3Relaxed(name, lat, lng);
  return r;
}

(async () => {
  console.log(`🚀 Wikipedia 이미지 매칭 (city_id=${CITY_ID}, ${DRY_RUN ? 'DRY' : 'COMMIT'})\n`);
  const SUPA = process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL;
  if (!SUPA) { console.error('❌ SUPA_URL 없음'); process.exit(1); }
  const client = new Client({ connectionString: SUPA, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const r = await client.query(`
    SELECT id, name_en, latitude, longitude
    FROM place_seed_raw
    WHERE city_id = $1
      AND (image_url IS NULL OR image_url = '')
      AND name_en IS NOT NULL AND TRIM(name_en) <> ''
    ORDER BY id
  `, [CITY_ID]);
  console.log(`📊 매칭 대상 = ${r.rows.length} row\n`);

  let matched = 0, withImage = 0, withCoord = 0;
  for (const row of r.rows) {
    const m = await matchOne(row.name_en, row.latitude, row.longitude);
    if (m) {
      matched++;
      if (m.image) withImage++;
      const newLat = m.coord?.lat ?? row.latitude;
      const newLng = m.coord?.lon ?? row.longitude;
      if (newLat != null) withCoord++;
      console.log(`  ✓ #${row.id} [${m.src}] sim=${m.sim.toFixed(2)} | ${row.name_en} → ${m.title}`);
      if (!DRY_RUN) {
        await client.query(`
          UPDATE place_seed_raw SET
            image_url = COALESCE(image_url, $1),
            latitude  = COALESCE(latitude, $2),
            longitude = COALESCE(longitude, $3)
          WHERE id = $4
        `, [m.image || null, newLat, newLng, row.id]);
      }
    } else {
      console.log(`  ✗ #${row.id} | ${row.name_en} → NO MATCH`);
    }
    await new Promise(res => setTimeout(res, 350));
  }

  console.log(`\n📊 결과: 매칭 ${matched}/${r.rows.length}, 이미지 ${withImage}, 좌표 ${withCoord}`);
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
