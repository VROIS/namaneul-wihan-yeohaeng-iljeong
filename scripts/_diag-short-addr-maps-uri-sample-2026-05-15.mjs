// 1 회용 = places.short_address / google_maps_uri 샘플 raw 출력
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

console.log('═════════ places.short_address vs address 비교 (Paris 5 샘플) ═════════');
const r1 = await c.query(`
  SELECT id, name, address, short_address
  FROM places
  WHERE city_id = 19 AND short_address IS NOT NULL
  LIMIT 5;
`);
for (const row of r1.rows) {
  console.log(`\n  id=${row.id} ${row.name}`);
  console.log(`    address:       ${row.address}`);
  console.log(`    short_address: ${row.short_address}`);
}

console.log('\n═════════ places.google_maps_uri 샘플 (Paris 5) ═════════');
const r2 = await c.query(`
  SELECT id, name, google_maps_uri
  FROM places
  WHERE city_id = 19 AND google_maps_uri IS NOT NULL
  LIMIT 5;
`);
for (const row of r2.rows) {
  console.log(`\n  id=${row.id} ${row.name}`);
  console.log(`    google_maps_uri: ${row.google_maps_uri}`);
}

await c.end();
