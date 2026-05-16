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
const c = new pg.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const r = await c.query(`
  WITH n AS (
    SELECT id, city_id, google_place_id, google_maps_uri,
      latitude, longitude,
      LOWER(TRIM(regexp_replace(regexp_replace(COALESCE(address, ''), '[.,;:!?''"()\\[\\]{}]', ' ', 'g'), '\\s+', ' ', 'g'))) AS na,
      LOWER(TRIM(name_en)) AS n_en,
      LOWER(TRIM(name_local)) AS n_local,
      LOWER(TRIM(name_ko)) AS n_ko
    FROM place_seed_raw
    WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  ),
  dup_pid AS (
    SELECT a.id AS id_a, b.id AS id_b FROM n a JOIN n b ON b.city_id = a.city_id AND b.id < a.id
    WHERE a.google_place_id IS NOT NULL AND b.google_place_id IS NOT NULL AND a.google_place_id = b.google_place_id
  ),
  dup_addr AS (
    SELECT a.id AS id_a, b.id AS id_b FROM n a JOIN n b ON b.city_id = a.city_id AND b.id < a.id
    WHERE LENGTH(a.na) >= 20 AND LENGTH(b.na) >= 20 AND a.na = b.na
      AND NOT EXISTS (SELECT 1 FROM dup_pid WHERE id_a = a.id AND id_b = b.id)
  ),
  dup_gmaps AS (
    SELECT a.id AS id_a, b.id AS id_b FROM n a JOIN n b ON b.city_id = a.city_id AND b.id < a.id
    WHERE a.google_maps_uri IS NOT NULL AND b.google_maps_uri IS NOT NULL AND a.google_maps_uri = b.google_maps_uri
      AND NOT EXISTS (SELECT 1 FROM dup_pid WHERE id_a = a.id AND id_b = b.id)
      AND NOT EXISTS (SELECT 1 FROM dup_addr WHERE id_a = a.id AND id_b = b.id)
  ),
  dup_coord AS (
    SELECT a.id AS id_a, b.id AS id_b FROM n a JOIN n b ON b.city_id = a.city_id AND b.id < a.id
    WHERE a.latitude IS NOT NULL AND b.latitude IS NOT NULL
      AND abs(a.latitude - b.latitude) < 0.0001 AND abs(a.longitude - b.longitude) < 0.0001
      AND NOT EXISTS (SELECT 1 FROM dup_pid WHERE id_a = a.id AND id_b = b.id)
      AND NOT EXISTS (SELECT 1 FROM dup_addr WHERE id_a = a.id AND id_b = b.id)
      AND NOT EXISTS (SELECT 1 FROM dup_gmaps WHERE id_a = a.id AND id_b = b.id)
  ),
  dup_name AS (
    SELECT a.id AS id_a, b.id AS id_b FROM n a JOIN n b ON b.city_id = a.city_id AND b.id < a.id
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
      AND NOT EXISTS (SELECT 1 FROM dup_pid WHERE id_a = a.id AND id_b = b.id)
      AND NOT EXISTS (SELECT 1 FROM dup_addr WHERE id_a = a.id AND id_b = b.id)
      AND NOT EXISTS (SELECT 1 FROM dup_gmaps WHERE id_a = a.id AND id_b = b.id)
      AND NOT EXISTS (SELECT 1 FROM dup_coord WHERE id_a = a.id AND id_b = b.id)
  )
  SELECT
    (SELECT COUNT(*)::int FROM dup_pid) AS pid_pairs,
    (SELECT COUNT(*)::int FROM dup_addr) AS addr_pairs,
    (SELECT COUNT(*)::int FROM dup_gmaps) AS gmaps_pairs,
    (SELECT COUNT(*)::int FROM dup_coord) AS coord_pairs,
    (SELECT COUNT(*)::int FROM dup_name) AS name_pairs
`);
console.table(r.rows);
const tot = r.rows[0].pid_pairs + r.rows[0].addr_pairs + r.rows[0].gmaps_pairs + r.rows[0].coord_pairs + r.rows[0].name_pairs;
console.log(`\n총 중복 쌍 (5 단계 누적): ${tot}`);
await c.end();
