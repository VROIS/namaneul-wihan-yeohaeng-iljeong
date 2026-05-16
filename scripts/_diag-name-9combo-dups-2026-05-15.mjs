// 1 회용 = 9 조합 이름 매칭 기준 중복 행 시뮬 (= SELECT only)
// 사용자 명시 2026-05-15: name_en/name_local/name_ko 셋 중 한 쌍 일치 = 같은 장소

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

console.log('═════════ 9 조합 이름 매칭 중복 시뮬 ═════════\n');

// 핵심 = 같은 city_id 안에서 = name_en/local/ko 중 한 쌍 일치하는 행 쌍
console.log('▶ 1. 같은 도시 + 이름 9 조합 매칭으로 = 중복 쌍 발견');
const r1 = await c.query(`
  WITH norm AS (
    SELECT id, city_id,
      LOWER(TRIM(name_en)) AS n_en,
      LOWER(TRIM(name_local)) AS n_local,
      LOWER(TRIM(name_ko)) AS n_ko
    FROM place_seed_raw
    WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  ),
  pairs AS (
    SELECT a.id AS id_a, b.id AS id_b, a.city_id,
      CASE
        WHEN a.n_en = b.n_en THEN 'en-en'
        WHEN a.n_en = b.n_local THEN 'en-local'
        WHEN a.n_en = b.n_ko THEN 'en-ko'
        WHEN a.n_local = b.n_en THEN 'local-en'
        WHEN a.n_local = b.n_local THEN 'local-local'
        WHEN a.n_local = b.n_ko THEN 'local-ko'
        WHEN a.n_ko = b.n_en THEN 'ko-en'
        WHEN a.n_ko = b.n_local THEN 'ko-local'
        WHEN a.n_ko = b.n_ko THEN 'ko-ko'
      END AS match_type
    FROM norm a
    JOIN norm b ON b.city_id = a.city_id AND b.id < a.id
    WHERE (
         (a.n_en IS NOT NULL AND b.n_en IS NOT NULL AND a.n_en = b.n_en)
      OR (a.n_en IS NOT NULL AND b.n_local IS NOT NULL AND a.n_en = b.n_local)
      OR (a.n_en IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_en = b.n_ko)
      OR (a.n_local IS NOT NULL AND b.n_en IS NOT NULL AND a.n_local = b.n_en)
      OR (a.n_local IS NOT NULL AND b.n_local IS NOT NULL AND a.n_local = b.n_local)
      OR (a.n_local IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_local = b.n_ko)
      OR (a.n_ko IS NOT NULL AND b.n_en IS NOT NULL AND a.n_ko = b.n_en)
      OR (a.n_ko IS NOT NULL AND b.n_local IS NOT NULL AND a.n_ko = b.n_local)
      OR (a.n_ko IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_ko = b.n_ko)
    )
  )
  SELECT match_type, COUNT(*)::int AS pairs
  FROM pairs
  GROUP BY match_type
  ORDER BY pairs DESC;
`);
console.table(r1.rows);
const total = r1.rows.reduce((s, r) => s + r.pairs, 0);
console.log(`\n  → 총 중복 쌍: ${total}`);

console.log('\n▶ 2. 영어 ↔ 원어 매칭으로만 잡힌 중복 쌍 (= 1/9 단순 비교에선 못 잡힌 것) 샘플 10');
const r2 = await c.query(`
  WITH norm AS (
    SELECT id, city_id, name_en, name_local, name_ko,
      LOWER(TRIM(name_en)) AS n_en,
      LOWER(TRIM(name_local)) AS n_local,
      LOWER(TRIM(name_ko)) AS n_ko,
      google_place_id, latitude, longitude
    FROM place_seed_raw
    WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  )
  SELECT
    a.id AS id_a, a.name_en AS name_en_a, a.name_local AS name_local_a, a.name_ko AS name_ko_a,
    b.id AS id_b, b.name_en AS name_en_b, b.name_local AS name_local_b, b.name_ko AS name_ko_b,
    a.city_id
  FROM norm a
  JOIN norm b ON b.city_id = a.city_id AND b.id < a.id
  WHERE
    (
         (a.n_en IS NOT NULL AND b.n_local IS NOT NULL AND a.n_en = b.n_local)
      OR (a.n_local IS NOT NULL AND b.n_en IS NOT NULL AND a.n_local = b.n_en)
      OR (a.n_en IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_en = b.n_ko)
      OR (a.n_ko IS NOT NULL AND b.n_en IS NOT NULL AND a.n_ko = b.n_en)
    )
    AND NOT (a.n_en IS NOT NULL AND b.n_en IS NOT NULL AND a.n_en = b.n_en)
  LIMIT 10;
`);
console.table(r2.rows);

console.log('\n▶ 3. 도시별 9 조합 중복 쌍 (상위 10)');
const r3 = await c.query(`
  WITH norm AS (
    SELECT id, city_id,
      LOWER(TRIM(name_en)) AS n_en,
      LOWER(TRIM(name_local)) AS n_local,
      LOWER(TRIM(name_ko)) AS n_ko
    FROM place_seed_raw
    WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  )
  SELECT a.city_id, (SELECT name_en FROM cities WHERE id = a.city_id) AS city, COUNT(*)::int AS pairs
  FROM norm a
  JOIN norm b ON b.city_id = a.city_id AND b.id < a.id
  WHERE (
       (a.n_en IS NOT NULL AND b.n_en IS NOT NULL AND a.n_en = b.n_en)
    OR (a.n_en IS NOT NULL AND b.n_local IS NOT NULL AND a.n_en = b.n_local)
    OR (a.n_en IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_en = b.n_ko)
    OR (a.n_local IS NOT NULL AND b.n_en IS NOT NULL AND a.n_local = b.n_en)
    OR (a.n_local IS NOT NULL AND b.n_local IS NOT NULL AND a.n_local = b.n_local)
    OR (a.n_local IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_local = b.n_ko)
    OR (a.n_ko IS NOT NULL AND b.n_en IS NOT NULL AND a.n_ko = b.n_en)
    OR (a.n_ko IS NOT NULL AND b.n_local IS NOT NULL AND a.n_ko = b.n_local)
    OR (a.n_ko IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_ko = b.n_ko)
  )
  GROUP BY a.city_id
  ORDER BY pairs DESC
  LIMIT 10;
`);
console.table(r3.rows);

await c.end();
console.log('\n═════════ 완료. SELECT only. ═════════');
