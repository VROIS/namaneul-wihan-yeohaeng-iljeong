// 1 회용 = place_seed_raw 전체 컬럼 + 데이터 채움률 진단
// 사용자 명시 2026-05-15: 가져올 요소들이 어느 컬럼에 들어갈지 매칭 = 컬럼 없는 것은 안 가져옴
// = place_seed_raw 의 현재 구조 + 채움률 확인

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

console.log('═════════ 1. place_seed_raw 컬럼 전체 + 데이터 타입 ═════════');
const cols = await c.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'place_seed_raw'
  ORDER BY ordinal_position;
`);
console.table(cols.rows);
console.log(`\n  → 총 ${cols.rows.length} 컬럼`);

console.log('\n═════════ 2. 컬럼별 NOT NULL 채움률 (= 활성 행 11005 중) ═════════');
const fillRates = [];
for (const { column_name } of cols.rows) {
  try {
    const r = await c.query(`
      SELECT COUNT(*) FILTER (WHERE "${column_name}" IS NOT NULL)::int AS filled,
             ROUND(100.0 * COUNT(*) FILTER (WHERE "${column_name}" IS NOT NULL) / NULLIF(COUNT(*), 0), 1)::float AS pct
      FROM place_seed_raw
    `);
    fillRates.push({ column: column_name, filled: r.rows[0].filled, pct: r.rows[0].pct });
  } catch (e) {
    fillRates.push({ column: column_name, error: e.message.slice(0, 50) });
  }
}
console.table(fillRates);

await c.end();
console.log('\n═════════ 완료. SELECT only. DB 변경 0. ═════════');
