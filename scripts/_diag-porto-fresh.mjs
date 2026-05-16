// 1 회용 = Porto = 완전 신규 도시 = DB 누적 검증
import pg from 'pg';
import fs from 'fs';

const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// 1. Porto city_id 확인
const city = (await c.query(`
  SELECT id, name, name_en FROM cities
  WHERE LOWER(name_en) = 'porto' OR LOWER(name) = '포르투' OR name_en ILIKE '%porto%'
  ORDER BY id LIMIT 5
`)).rows;
console.log('═══ 1. Porto city_id 확인 ═══');
console.table(city);

if (!city.length) {
  console.log('❌ Porto city 없음');
  await c.end();
  process.exit(1);
}

const PORTO_ID = city[0].id;

// 2. Porto 전체 행 수
const counts = (await c.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE collection_phase = 'gemini3-2026-05') AS gemini3,
    COUNT(*) FILTER (WHERE collection_phase = 'auto-learn-2026-05') AS auto_learn,
    COUNT(*) FILTER (WHERE collection_phase = 'auto-learn-2026-05' AND created_at::date = CURRENT_DATE) AS today_added,
    COUNT(*) FILTER (WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
      AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
      AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
    ) AS active
  FROM place_seed_raw WHERE city_id = $1
`, [PORTO_ID])).rows[0];
console.log(`\n═══ 2. Porto (city_id=${PORTO_ID}) 행 수 ═══`);
console.table([counts]);

// 3. 오늘 추가된 Porto 행 = 컬럼 형태
const today = (await c.query(`
  SELECT id, name_en, name_ko, address,
    google_place_id IS NOT NULL AS has_pid,
    image_url IS NOT NULL AS has_img,
    summary_ko, editorial_summary, seed_category, created_at
  FROM place_seed_raw
  WHERE city_id = $1
    AND collection_phase = 'auto-learn-2026-05'
    AND created_at::date = CURRENT_DATE
  ORDER BY created_at DESC
`, [PORTO_ID])).rows;
console.log(`\n═══ 3. 오늘 추가된 Porto = ${today.length} 곳 ═══`);
for (const r of today) {
  console.log(`\nid=${r.id} | ${r.name_en} (${r.name_ko || 'name_ko=NULL'})`);
  console.log(`  category=${r.seed_category} / pid=${r.has_pid ? '✓' : '✗'} / img=${r.has_img ? '✓' : '✗'}`);
  console.log(`  주소: ${(r.address || '').slice(0, 60)}`);
  console.log(`  FOMO:    "${(r.summary_ko || 'NULL').slice(0, 80)}"`);
  console.log(`  위트:    "${(r.editorial_summary || 'NULL').slice(0, 80)}"`);
}

// 4. SSOT 충족 비율
const ssot = (await c.query(`
  SELECT COUNT(*) AS total,
    COUNT(*) FILTER (WHERE name_en IS NOT NULL) AS has_name_en,
    COUNT(*) FILTER (WHERE name_ko IS NOT NULL) AS has_name_ko,
    COUNT(*) FILTER (WHERE address IS NOT NULL) AS has_address,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) AS has_pid,
    COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS has_img,
    COUNT(*) FILTER (WHERE summary_ko IS NOT NULL) AS has_summary_ko,
    COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL) AS has_editorial,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL) AS has_coords,
    COUNT(*) FILTER (WHERE name_local IS NOT NULL) AS has_name_local
  FROM place_seed_raw
  WHERE city_id = $1 AND collection_phase = 'auto-learn-2026-05'
`, [PORTO_ID])).rows[0];

const t = parseInt(ssot.total);
if (t > 0) {
  console.log(`\n═══ 4. Porto auto-learn ${t} 행 = SSOT 충족 비율 ═══`);
  const pct = (n) => ((parseInt(n) * 100) / t).toFixed(0) + '%';
  console.log(`  name_en:    ${pct(ssot.has_name_en)} (${ssot.has_name_en}/${t})`);
  console.log(`  name_ko:    ${pct(ssot.has_name_ko)} (${ssot.has_name_ko}/${t}) ← 핫픽스 5 효과?`);
  console.log(`  name_local: ${pct(ssot.has_name_local)} (${ssot.has_name_local}/${t}) ← 핫픽스 5 효과?`);
  console.log(`  address:    ${pct(ssot.has_address)} (${ssot.has_address}/${t})`);
  console.log(`  pid:        ${pct(ssot.has_pid)} (${ssot.has_pid}/${t})`);
  console.log(`  image:      ${pct(ssot.has_img)} (${ssot.has_img}/${t})`);
  console.log(`  summary_ko: ${pct(ssot.has_summary_ko)} (${ssot.has_summary_ko}/${t})`);
  console.log(`  editorial:  ${pct(ssot.has_editorial)} (${ssot.has_editorial}/${t})`);
  console.log(`  lat/lng:    ${pct(ssot.has_coords)} (${ssot.has_coords}/${t})`);
}

await c.end();
