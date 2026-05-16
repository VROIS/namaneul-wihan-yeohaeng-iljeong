// 1 회용 = 파리 식당 행 = place_seed_raw 안의 컬럼/분류 구조 파악
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

// 1. Paris 식당 총 수
const total = (await c.query(`
  SELECT collection_phase, COUNT(*)::int AS cnt
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category = 'restaurant'
  GROUP BY collection_phase
  ORDER BY cnt DESC
`)).rows;
console.log('═══ 1. Paris restaurant 행 수 (= collection_phase 분포) ═══');
console.table(total);

// 2. 컬럼 채움률 (= 어떤 메타 있나)
const fill = (await c.query(`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE name_en IS NOT NULL)::int AS has_name_en,
    COUNT(*) FILTER (WHERE name_ko IS NOT NULL)::int AS has_name_ko,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL)::int AS has_pid,
    COUNT(*) FILTER (WHERE image_url IS NOT NULL)::int AS has_img,
    COUNT(*) FILTER (WHERE summary_ko IS NOT NULL)::int AS has_summary_ko,
    COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL)::int AS has_editorial,
    COUNT(*) FILTER (WHERE google_primary_type IS NOT NULL)::int AS has_primary_type,
    COUNT(*) FILTER (WHERE google_review_count IS NOT NULL AND google_review_count > 0)::int AS has_review_count
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category = 'restaurant'
`)).rows[0];
console.log('\n═══ 2. Paris restaurant 컬럼 채움률 ═══');
console.table([fill]);

// 3. category_tags / phase_tags 분포 (= 분류 흔적)
const tags = (await c.query(`
  SELECT
    category_tags,
    phase_tags,
    COUNT(*)::int AS cnt
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category = 'restaurant'
  GROUP BY category_tags, phase_tags
  ORDER BY cnt DESC
  LIMIT 10
`)).rows;
console.log('\n═══ 3. Paris restaurant category_tags / phase_tags 상위 10 ═══');
for (const r of tags) {
  console.log(`  cnt=${r.cnt} | cats=${JSON.stringify(r.category_tags)} | phases=${JSON.stringify(r.phase_tags)}`);
}

// 4. google_primary_type 분포 (= TS 응답값)
const primary = (await c.query(`
  SELECT google_primary_type, COUNT(*)::int AS cnt
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category = 'restaurant'
  GROUP BY google_primary_type
  ORDER BY cnt DESC
  LIMIT 10
`)).rows;
console.log('\n═══ 4. Paris restaurant google_primary_type 분포 ═══');
console.table(primary);

// 5. 샘플 5 행 = 컬럼 값 직접 확인
const sample = (await c.query(`
  SELECT id, name_en, name_ko,
    LEFT(address, 50) AS address,
    google_primary_type, google_review_count,
    LEFT(summary_ko, 80) AS summary_ko,
    LEFT(editorial_summary, 80) AS editorial,
    category_tags, phase_tags, collection_phase, rank
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category = 'restaurant'
  ORDER BY rank ASC, id ASC
  LIMIT 8
`)).rows;
console.log('\n═══ 5. Paris restaurant 샘플 8 행 ═══');
for (const r of sample) {
  console.log(`\nid=${r.id} | ${r.name_en} (${r.name_ko || 'name_ko=NULL'}) | rank=${r.rank} | phase=${r.collection_phase}`);
  console.log(`  addr: ${r.address || 'NULL'}`);
  console.log(`  primary=${r.google_primary_type || 'NULL'} / reviews=${r.google_review_count || 0}`);
  console.log(`  cats=${JSON.stringify(r.category_tags)} / phases=${JSON.stringify(r.phase_tags)}`);
  console.log(`  FOMO: "${r.summary_ko || 'NULL'}"`);
  console.log(`  위트: "${r.editorial || 'NULL'}"`);
}

await c.end();
