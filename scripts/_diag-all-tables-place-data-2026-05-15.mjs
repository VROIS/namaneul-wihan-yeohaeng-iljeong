// 1 회용 = DB 전체 테이블 + place 관련 데이터 보유 현황 시뮬레이션
// 사용자 명시 2026-05-15: 많은 테이블에 place_seed_raw 와 4 단계 매칭만 하면 엄청난 로 데이터 있음
// = 어떤 테이블에 어떤 데이터가 = place_seed_raw 와 매칭 가능한지 분석
//
// SELECT only. DB 변경 0.

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
console.log('DB 전체 테이블 + place 관련 데이터 보유 현황');
console.log('═══════════════════════════════════════════════════════════\n');

// ━━━━━━ 1. 모든 테이블 목록 + 행 수 ━━━━━━
console.log('▶ 1. public 스키마 모든 테이블 + 행 수:');
const tables = (await c.query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
`)).rows;

const tableStats = [];
for (const { tablename } of tables) {
  try {
    const r = await c.query(`SELECT COUNT(*)::int AS count FROM "${tablename}"`);
    tableStats.push({ table: tablename, rows: r.rows[0].count });
  } catch (e) {
    tableStats.push({ table: tablename, rows: 'ERR' });
  }
}
console.table(tableStats);

// ━━━━━━ 2. place 관련 컬럼 보유 테이블 식별 ━━━━━━
console.log('\n▶ 2. place 관련 컬럼 (= place_id / google_place_id / name / lat / lng) 보유 테이블:');
const placeRelated = await c.query(`
  SELECT
    table_name,
    string_agg(column_name, ', ' ORDER BY column_name) AS place_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      column_name = 'place_id' OR
      column_name = 'google_place_id' OR
      column_name = 'place_seed_raw_id' OR
      column_name = 'name_en' OR
      column_name = 'name' OR
      (column_name = 'latitude' AND table_name != 'cities') OR
      (column_name = 'longitude' AND table_name != 'cities')
    )
  GROUP BY table_name
  ORDER BY table_name;
`);
console.table(placeRelated.rows);

// ━━━━━━ 3. 활성 (= 최근 데이터 있는) 테이블 식별 ━━━━━━
console.log('\n▶ 3. fetched_at / created_at / updated_at 시점:');
const timeCols = [
  { table: 'places', col: 'updated_at' },
  { table: 'places', col: 'created_at' },
  { table: 'place_data_sources', col: 'fetched_at' },
  { table: 'place_images', col: 'created_at' },
  { table: 'place_prices', col: 'fetched_at' },
  { table: 'place_seed_raw', col: 'created_at' },
  { table: 'place_seed_raw', col: 'image_updated_at' },
  { table: 'celebrity_place_evidence', col: 'fetched_at' },
  { table: 'youtube_place_mentions', col: 'fetched_at' },
  { table: 'naver_blog_posts', col: 'fetched_at' },
  { table: 'instagram_hashtags', col: 'updated_at' },
  { table: 'tripadvisor_data', col: 'last_synced' },
  { table: 'reviews', col: 'created_at' },
  { table: 'gemini_web_search_cache', col: 'cached_at' },
];

const activity = [];
for (const { table, col } of timeCols) {
  try {
    const r = await c.query(`
      SELECT
        COUNT(*)::int AS rows,
        MAX("${col}") AS last_time,
        COUNT(*) FILTER (WHERE "${col}" >= NOW() - INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE "${col}" >= NOW() - INTERVAL '30 days')::int AS last_30d
      FROM "${table}"
    `);
    activity.push({
      table,
      time_col: col,
      rows: r.rows[0].rows,
      last_time: r.rows[0].last_time,
      last_7d: r.rows[0].last_7d,
      last_30d: r.rows[0].last_30d,
    });
  } catch (e) {
    activity.push({ table, time_col: col, error: e.message.slice(0, 50) });
  }
}
console.table(activity);

// ━━━━━━ 4. place_seed_raw 와 직접 연결되는 외래키 (= placeSeedRawId) ━━━━━━
console.log('\n▶ 4. place_seed_raw 와 직접 연결되는 테이블:');
const directLink = await c.query(`
  SELECT
    c.table_name,
    c.column_name,
    (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_name = c.table_name) AS total_cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name IN ('place_seed_raw_id')
  ORDER BY c.table_name;
`);
console.table(directLink.rows);

// ━━━━━━ 5. places 와 연결되는 외래키 (= placeId) ━━━━━━
console.log('\n▶ 5. places 와 연결되는 테이블 (= place_id 외래키):');
const placesLink = await c.query(`
  SELECT
    c.table_name,
    c.column_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'place_id'
    AND c.table_name != 'place_seed_raw'
  ORDER BY c.table_name;
`);
console.table(placesLink.rows);

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log('시뮬 완료. SELECT only. DB 변경 0.');
console.log('═══════════════════════════════════════════════════════════');
