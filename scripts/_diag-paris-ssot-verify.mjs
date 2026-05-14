// 1 회용 = Paris DB 풍부도 + SSOT 형태 검증
// = 사용자 핵심 질문 2026-05-14:
//   1. 매번 호출 = 신규 장소 추가 + 재활용?
//   2. Paris = 이전 126 → 몇 개 추가됐나?
//   3. 생성 형태 = 사용자 SSOT 맞나?

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

// 1. Paris 활성 행 수 (= 오늘 archived 제외)
const counts = (await c.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
      AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
      AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
    ) AS active,
    COUNT(*) FILTER (WHERE collection_phase = 'auto-learn-2026-05') AS auto_learn,
    COUNT(*) FILTER (WHERE collection_phase = 'auto-learn-2026-05' AND created_at::date = CURRENT_DATE) AS today_added,
    COUNT(*) FILTER (WHERE collection_phase = 'gemini3-2026-05') AS gemini3_seed
  FROM place_seed_raw
  WHERE city_id = 19
`)).rows[0];

console.log('═══ 1. Paris 행 수 ═══');
console.table([counts]);

// 2. 오늘 추가된 행 = 컬럼 매핑 형태 검증
const today = (await c.query(`
  SELECT id, name_en, name_ko, address,
    google_place_id IS NOT NULL AS has_pid,
    image_url IS NOT NULL AS has_img,
    summary_ko, editorial_summary, created_at, seed_category
  FROM place_seed_raw
  WHERE city_id = 19
    AND collection_phase = 'auto-learn-2026-05'
    AND created_at::date = CURRENT_DATE
  ORDER BY created_at DESC
`)).rows;

console.log(`\n═══ 2. 오늘 추가된 Paris 행 = ${today.length} 곳 ═══`);
for (const r of today) {
  console.log(`\nid=${r.id} | ${r.name_en} (${r.name_ko || 'name_ko=NULL'})`);
  console.log(`  주소: ${(r.address || '').slice(0, 60)}`);
  console.log(`  has_pid=${r.has_pid ? '✓' : '✗'} / has_img=${r.has_img ? '✓' : '✗'} / category=${r.seed_category || 'NULL'}`);
  console.log(`  summary_ko (= FOMO):    "${(r.summary_ko || 'NULL').slice(0, 80)}"`);
  console.log(`  editorial_summary (= 위트): "${(r.editorial_summary || 'NULL').slice(0, 80)}"`);
}

// 3. SSOT 충족도 = 새 행의 컬럼 채움 비율
const ssot = (await c.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE name_en IS NOT NULL) AS has_name_en,
    COUNT(*) FILTER (WHERE name_ko IS NOT NULL) AS has_name_ko,
    COUNT(*) FILTER (WHERE address IS NOT NULL) AS has_address,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) AS has_pid,
    COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS has_img,
    COUNT(*) FILTER (WHERE summary_ko IS NOT NULL) AS has_summary_ko,
    COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL) AS has_editorial,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL) AS has_coords
  FROM place_seed_raw
  WHERE city_id = 19
    AND collection_phase = 'auto-learn-2026-05'
`)).rows[0];

console.log(`\n═══ 3. auto-learn Paris 행 = SSOT 충족 비율 (= ${ssot.total} 행) ═══`);
const pct = (n) => ((parseInt(n) * 100) / parseInt(ssot.total)).toFixed(0) + '%';
console.log(`  name_en:          ${ssot.has_name_en}/${ssot.total} = ${pct(ssot.has_name_en)}`);
console.log(`  name_ko:          ${ssot.has_name_ko}/${ssot.total} = ${pct(ssot.has_name_ko)}`);
console.log(`  address:          ${ssot.has_address}/${ssot.total} = ${pct(ssot.has_address)}`);
console.log(`  google_place_id:  ${ssot.has_pid}/${ssot.total} = ${pct(ssot.has_pid)}`);
console.log(`  image_url:        ${ssot.has_img}/${ssot.total} = ${pct(ssot.has_img)}`);
console.log(`  summary_ko:       ${ssot.has_summary_ko}/${ssot.total} = ${pct(ssot.has_summary_ko)}`);
console.log(`  editorial_summary:${ssot.has_editorial}/${ssot.total} = ${pct(ssot.has_editorial)}`);
console.log(`  lat/lng:          ${ssot.has_coords}/${ssot.total} = ${pct(ssot.has_coords)}`);

await c.end();
