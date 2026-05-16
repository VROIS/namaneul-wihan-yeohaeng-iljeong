// 1 회용 = gemini_web_search_cache 테이블 raw 내용 출력
// 사용자 명시 2026-05-15: 직접 읽고 = true/false 판정 로직 + hotspot 보강 가치 확인

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

// ━━━━━━ 1. 테이블 컬럼 전체 ━━━━━━
console.log('═════════ 1. gemini_web_search_cache 컬럼 전체 ═════════');
const cols = await c.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'gemini_web_search_cache'
  ORDER BY ordinal_position;
`);
console.table(cols.rows);

// ━━━━━━ 2. boolean 컬럼 분포 ━━━━━━
console.log('\n═════════ 2. boolean 컬럼 분포 ═════════');
const boolCols = cols.rows.filter(r => r.data_type === 'boolean').map(r => r.column_name);
console.log(`boolean 컬럼: ${JSON.stringify(boolCols)}`);

for (const bc of boolCols) {
  const r = await c.query(`
    SELECT
      "${bc}"::text AS value,
      COUNT(*)::int AS count
    FROM gemini_web_search_cache
    GROUP BY 1
    ORDER BY 2 DESC;
  `);
  console.log(`\n▶ ${bc} 분포:`);
  console.table(r.rows);
}

// ━━━━━━ 3. 샘플 raw 5 행 (= 전체 컬럼) ━━━━━━
console.log('\n═════════ 3. raw 5 행 샘플 (전체 컬럼) ═════════');
const sample = await c.query(`
  SELECT * FROM gemini_web_search_cache LIMIT 5;
`);
for (let i = 0; i < sample.rows.length; i++) {
  console.log(`\n--- 행 ${i + 1} ---`);
  for (const [key, value] of Object.entries(sample.rows[i])) {
    let v = value;
    if (typeof v === 'string' && v.length > 300) v = v.slice(0, 300) + '... (cut)';
    if (typeof v === 'object' && v !== null) v = JSON.stringify(v).slice(0, 300) + (JSON.stringify(v).length > 300 ? '...(cut)' : '');
    console.log(`  ${key}: ${v}`);
  }
}

// ━━━━━━ 4. true 인 행 우선 = 한국인 포토스팟 분포 추정 ━━━━━━
if (boolCols.length > 0) {
  for (const bc of boolCols) {
    console.log(`\n═════════ 4. ${bc} = true 행 샘플 3 개 (raw 전체 컬럼) ═════════`);
    const trueRows = await c.query(`SELECT * FROM gemini_web_search_cache WHERE "${bc}" = true LIMIT 3;`);
    for (let i = 0; i < trueRows.rows.length; i++) {
      console.log(`\n--- ${bc}=true 행 ${i + 1} ---`);
      for (const [key, value] of Object.entries(trueRows.rows[i])) {
        let v = value;
        if (typeof v === 'string' && v.length > 500) v = v.slice(0, 500) + '... (cut)';
        if (typeof v === 'object' && v !== null) v = JSON.stringify(v).slice(0, 500) + (JSON.stringify(v).length > 500 ? '...(cut)' : '');
        console.log(`  ${key}: ${v}`);
      }
    }
  }
}

// ━━━━━━ 5. 현재 place_seed_raw 의 hotspot 카테고리 현황 ━━━━━━
console.log('\n═════════ 5. place_seed_raw hotspot 카테고리 현재 행 수 (= 보강 비교용) ═════════');
const hot = await c.query(`
  SELECT
    seed_category,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE name_en IS NOT NULL)::int AS with_name,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL)::int AS with_pid,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL)::int AS with_coords
  FROM place_seed_raw
  WHERE seed_category = 'hotspot'
  GROUP BY seed_category;
`);
console.table(hot.rows);

await c.end();
console.log('\n═════════ 완료. SELECT only. DB 변경 0. ═════════');
