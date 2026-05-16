// 1 회용 = Geneva DB 상태 진단 (= 사용자 명시 2026-05-14)
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

// 1. cities 테이블 Geneva
const city = (await c.query(`SELECT * FROM cities WHERE LOWER(name_en) LIKE '%geneva%' OR name = '제네바'`)).rows;
console.log('═══ 1. cities 테이블 Geneva ═══');
console.table(city);

if (!city.length) { await c.end(); process.exit(0); }
const cityId = city[0].id;

// 2. collection_phase 분포
const phase = (await c.query(`
  SELECT collection_phase, COUNT(*)::int AS cnt,
    COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today,
    MIN(created_at) AS first_insert,
    MAX(created_at) AS last_insert
  FROM place_seed_raw WHERE city_id = $1
  GROUP BY collection_phase
  ORDER BY cnt DESC
`, [cityId])).rows;
console.log(`\n═══ 2. Geneva (city_id=${cityId}) collection_phase 분포 ═══`);
console.table(phase);

// 3. seed_category 분포
const cat = (await c.query(`
  SELECT seed_category, COUNT(*)::int AS cnt
  FROM place_seed_raw WHERE city_id = $1
  GROUP BY seed_category
  ORDER BY cnt DESC
`, [cityId])).rows;
console.log(`\n═══ 3. Geneva seed_category 분포 ═══`);
console.table(cat);

// 4. SSOT 충족 비율 (auto-learn-2026-05 만)
const ssot = (await c.query(`
  SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE name_en IS NOT NULL)::int AS has_name_en,
    COUNT(*) FILTER (WHERE name_ko IS NOT NULL)::int AS has_name_ko,
    COUNT(*) FILTER (WHERE name_local IS NOT NULL)::int AS has_name_local,
    COUNT(*) FILTER (WHERE address IS NOT NULL)::int AS has_address,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL)::int AS has_pid,
    COUNT(*) FILTER (WHERE image_url IS NOT NULL)::int AS has_img,
    COUNT(*) FILTER (WHERE summary_ko IS NOT NULL)::int AS has_summary_ko,
    COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL)::int AS has_editorial,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL)::int AS has_coords
  FROM place_seed_raw
  WHERE city_id = $1 AND collection_phase = 'auto-learn-2026-05'
`, [cityId])).rows[0];

const t = ssot.total;
console.log(`\n═══ 4. Geneva auto-learn-2026-05 = ${t} 행 SSOT 충족 ═══`);
if (t > 0) {
  const pct = n => ((n * 100) / t).toFixed(0) + '%';
  console.log(`  name_en:    ${pct(ssot.has_name_en)} (${ssot.has_name_en}/${t})`);
  console.log(`  name_ko:    ${pct(ssot.has_name_ko)} (${ssot.has_name_ko}/${t})`);
  console.log(`  name_local: ${pct(ssot.has_name_local)} (${ssot.has_name_local}/${t})`);
  console.log(`  address:    ${pct(ssot.has_address)} (${ssot.has_address}/${t})`);
  console.log(`  pid:        ${pct(ssot.has_pid)} (${ssot.has_pid}/${t})`);
  console.log(`  image:      ${pct(ssot.has_img)} (${ssot.has_img}/${t})`);
  console.log(`  summary_ko: ${pct(ssot.has_summary_ko)} (${ssot.has_summary_ko}/${t})`);
  console.log(`  editorial:  ${pct(ssot.has_editorial)} (${ssot.has_editorial}/${t})`);
  console.log(`  lat/lng:    ${pct(ssot.has_coords)} (${ssot.has_coords}/${t})`);
}

// 5. 가장 최근 5 행 + 가장 오래된 5 행 = 컬럼 값 직접 확인
const recent = (await c.query(`
  SELECT id, name_en, name_ko, name_local,
    LEFT(address, 50) AS address,
    google_place_id IS NOT NULL AS has_pid,
    image_url IS NOT NULL AS has_img,
    LEFT(summary_ko, 60) AS summary_ko,
    LEFT(editorial_summary, 60) AS editorial,
    seed_category, collection_phase, created_at
  FROM place_seed_raw
  WHERE city_id = $1 AND collection_phase = 'auto-learn-2026-05'
  ORDER BY created_at DESC LIMIT 5
`, [cityId])).rows;
console.log(`\n═══ 5. Geneva auto-learn 가장 최근 5 행 ═══`);
for (const r of recent) {
  console.log(`\nid=${r.id} | ${r.name_en} (${r.name_ko || 'name_ko=NULL'}) [${r.name_local || 'name_local=NULL'}]`);
  console.log(`  category=${r.seed_category} / pid=${r.has_pid ? '✓' : '✗'} / img=${r.has_img ? '✓' : '✗'}`);
  console.log(`  addr: ${r.address || 'NULL'}`);
  console.log(`  FOMO (summary_ko):       "${r.summary_ko || 'NULL'}"`);
  console.log(`  위트 (editorial_summary): "${r.editorial || 'NULL'}"`);
  console.log(`  created_at: ${r.created_at}`);
}

await c.end();
