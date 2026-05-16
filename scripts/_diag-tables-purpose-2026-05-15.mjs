// 1 회용 = places + place_data_sources 테이블 정체 + 사용 빈도 진단
// 사용자 명시 2026-05-15: 두 테이블 = 불필요한지 확인

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

console.log('═══════════════════════════════════════════════════════════');
console.log('places + place_data_sources 정체 + 사용 빈도 진단');
console.log('═══════════════════════════════════════════════════════════\n');

// ━━━━━━ 1. places 테이블 컬럼 전체 ━━━━━━
console.log('▶ 1. places 테이블 컬럼 전체:');
const q1 = await c.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'places'
  ORDER BY ordinal_position;
`);
console.table(q1.rows);

// ━━━━━━ 2. place_data_sources 테이블 컬럼 전체 ━━━━━━
console.log('\n▶ 2. place_data_sources 테이블 컬럼 전체:');
const q2 = await c.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'place_data_sources'
  ORDER BY ordinal_position;
`);
console.table(q2.rows);

// ━━━━━━ 3. places 활성 사용 = 최근 업데이트 시점 + 도시별 분포 ━━━━━━
console.log('\n▶ 3. places 최근 활성:');
const q3 = await c.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS last_7d,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30d,
    COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days') AS updated_last_7d,
    MAX(created_at) AS last_created,
    MAX(updated_at) AS last_updated
  FROM places;
`);
console.table(q3.rows);

// ━━━━━━ 4. place_data_sources 활성 ━━━━━━
console.log('\n▶ 4. place_data_sources 최근 활성:');
const q4 = await c.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE fetched_at >= NOW() - INTERVAL '30 days') AS last_30d,
    COUNT(*) FILTER (WHERE fetched_at >= NOW() - INTERVAL '90 days') AS last_90d,
    MAX(fetched_at) AS last_fetched,
    COUNT(DISTINCT source) AS source_count
  FROM place_data_sources;
`);
console.table(q4.rows);

console.log('\n  → source 별 분포:');
const q4b = await c.query(`
  SELECT source, COUNT(*) AS count, MAX(fetched_at) AS last_fetched
  FROM place_data_sources
  GROUP BY source
  ORDER BY count DESC;
`);
console.table(q4b.rows);

// ━━━━━━ 5. places.google_place_id 와 place_seed_raw.google_place_id 매칭률 ━━━━━━
console.log('\n▶ 5. places ↔ place_seed_raw 중복도 (= 정보 중복 여부):');
const q5 = await c.query(`
  SELECT
    (SELECT COUNT(*) FROM places WHERE google_place_id IS NOT NULL) AS places_with_pid,
    (SELECT COUNT(*) FROM place_seed_raw WHERE google_place_id IS NOT NULL) AS seedraw_with_pid,
    (SELECT COUNT(*) FROM places p
      WHERE p.google_place_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM place_seed_raw s WHERE s.google_place_id = p.google_place_id
        )
    ) AS overlap_pid;
`);
console.table(q5.rows);

// ━━━━━━ 6. place_data_sources 외래키 = places 참조 검증 ━━━━━━
console.log('\n▶ 6. place_data_sources.place_id 외래키 = places 살아있는지:');
const q6 = await c.query(`
  SELECT
    COUNT(*) AS total_data_sources,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM places p WHERE p.id = pds.place_id)) AS valid_refs,
    COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM places p WHERE p.id = pds.place_id)) AS orphan_refs
  FROM place_data_sources pds;
`);
console.table(q6.rows);

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log('진단 완료. SELECT only.');
console.log('═══════════════════════════════════════════════════════════');
