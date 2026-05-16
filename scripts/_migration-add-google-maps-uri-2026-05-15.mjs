// 1 회용 마이그레이션 = place_seed_raw 에 google_maps_uri 컬럼 추가
// 사용자 명시 2026-05-15: 13 번째 SSOT 요소 = google_maps_uri (= 최후의 보루 = 구글맵 바로가기 링크)
// = ADD COLUMN IF NOT EXISTS = 안전 (= 데이터 손실 0)

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

console.log('═════════ place_seed_raw.google_maps_uri 컬럼 추가 ═════════');

// 사전 검증
const before = (await c.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'place_seed_raw' AND column_name = 'google_maps_uri';
`)).rows;
console.log(`사전 = ${before.length === 0 ? '컬럼 없음 (= 추가 필요)' : '이미 존재 (= 스킵)'}`);

await c.query(`BEGIN`);
try {
  await c.query(`ALTER TABLE place_seed_raw ADD COLUMN IF NOT EXISTS google_maps_uri text;`);
  await c.query(`COMMIT`);
  console.log('✅ ADD COLUMN COMMIT 완료');
} catch (e) {
  await c.query(`ROLLBACK`);
  console.error('❌ ROLLBACK:', e.message);
  process.exit(1);
}

// 사후 검증
const after = (await c.query(`
  SELECT column_name, data_type, is_nullable FROM information_schema.columns
  WHERE table_name = 'place_seed_raw' AND column_name = 'google_maps_uri';
`)).rows;
console.log(`사후 검증:`);
console.table(after);

await c.end();
console.log('\n═════════ 완료 ═════════');
