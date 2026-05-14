// 1 회용 = 브뤼셀 --commit 전/후 비교 = 핵심 메트릭 캡처
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

const label = process.argv[2] || 'unknown';

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// 1. 총 행 + phase 분포
const total = await c.query(`
  SELECT collection_phase, COUNT(*) AS cnt
  FROM place_seed_raw WHERE city_id = 41
  GROUP BY 1 ORDER BY 2 DESC
`);

// 2. 핵심 필드 NULL
const nulls = (await c.query(`
  SELECT
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE name_en IS NULL) AS null_name_en,
    COUNT(*) FILTER (WHERE name_ko IS NULL) AS null_name_ko,
    COUNT(*) FILTER (WHERE address IS NULL) AS null_address,
    COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) AS null_coords,
    COUNT(*) FILTER (WHERE image_url IS NULL) AS null_image,
    COUNT(*) FILTER (WHERE summary_ko IS NULL) AS null_summary_ko,
    COUNT(*) FILTER (WHERE editorial_summary IS NULL) AS null_editorial,
    COUNT(*) FILTER (WHERE google_place_id IS NULL) AS null_place_id
  FROM place_seed_raw WHERE city_id = 41
`)).rows[0];

// 3. 이미지 출처 분포
const img = await c.query(`
  SELECT
    CASE
      WHEN image_url ILIKE '%upload.wikimedia%' THEN 'WK'
      WHEN image_url ILIKE '%supabase.co/storage%' THEN 'Storage'
      WHEN image_url IS NULL THEN 'NULL'
      ELSE 'Other'
    END AS src,
    COUNT(*) AS cnt
  FROM place_seed_raw WHERE city_id = 41
  GROUP BY 1 ORDER BY 2 DESC
`);

// 4. archived 태그 + gemini3 phase 태그
const tags = (await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE 'archived-2026-05' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AS archived,
    COUNT(*) FILTER (WHERE 'gemini3-2026-05' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AS gemini3
  FROM place_seed_raw WHERE city_id = 41
`)).rows[0];

const snap = {
  label,
  timestamp: new Date().toISOString(),
  total: nulls.total_rows,
  phase_dist: total.rows,
  null_counts: {
    name_en: nulls.null_name_en,
    name_ko: nulls.null_name_ko,
    address: nulls.null_address,
    coords: nulls.null_coords,
    image: nulls.null_image,
    summary_ko: nulls.null_summary_ko,
    editorial: nulls.null_editorial,
    place_id: nulls.null_place_id,
  },
  image_sources: img.rows,
  tags: tags,
};

fs.mkdirSync('backups', { recursive: true });
const path = `backups/brussels-${label}.json`;
fs.writeFileSync(path, JSON.stringify(snap, null, 2));
console.log(`✅ Saved: ${path}`);
console.log(JSON.stringify(snap, null, 2));

await c.end();
