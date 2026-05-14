// 1 회용 진단 = 브뤼셀 DB 완성도 분류 (= --commit 결정 전)
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

// 1. 행 분포 (카테고리 × phase)
const total = await c.query(`
  SELECT seed_category, collection_phase, COUNT(*) AS cnt
  FROM place_seed_raw WHERE city_id = 41
  GROUP BY 1, 2 ORDER BY 1, 2
`);
console.log('═══ 1. 브뤼셀 행 분포 (= 카테고리 × phase) ═══');
console.table(total.rows);

// 2. 완성도 분류
const classify = await c.query(`
  SELECT
    seed_category,
    COUNT(*) FILTER (
      WHERE name_en IS NOT NULL AND name_ko IS NOT NULL AND address IS NOT NULL
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND image_url IS NOT NULL AND summary_ko IS NOT NULL
        AND editorial_summary IS NOT NULL AND google_place_id IS NOT NULL
    ) AS perfect,
    COUNT(*) FILTER (
      WHERE name_en IS NOT NULL AND (
        name_ko IS NULL OR address IS NULL OR latitude IS NULL OR longitude IS NULL
        OR image_url IS NULL OR summary_ko IS NULL OR editorial_summary IS NULL OR google_place_id IS NULL
      ) AND NOT (
        name_ko IS NULL AND address IS NULL AND latitude IS NULL AND longitude IS NULL
        AND image_url IS NULL AND summary_ko IS NULL AND editorial_summary IS NULL AND google_place_id IS NULL
      )
    ) AS partial,
    COUNT(*) FILTER (
      WHERE name_en IS NOT NULL AND name_ko IS NULL AND address IS NULL AND latitude IS NULL AND longitude IS NULL
        AND image_url IS NULL AND summary_ko IS NULL AND editorial_summary IS NULL AND google_place_id IS NULL
    ) AS skeleton_only,
    COUNT(*) FILTER (WHERE name_en IS NULL) AS broken,
    COUNT(*) AS total_rows
  FROM place_seed_raw WHERE city_id = 41
  GROUP BY 1 ORDER BY 1
`);
console.log('\n═══ 2. 완성도 분류 (= 카테고리 × 4 등급) ═══');
console.table(classify.rows);

// 3. 이미지 출처
const img = await c.query(`
  SELECT
    seed_category,
    COUNT(*) FILTER (WHERE image_url ILIKE '%upload.wikimedia%') AS wk,
    COUNT(*) FILTER (WHERE image_url ILIKE '%supabase.co/storage%') AS storage_google,
    COUNT(*) FILTER (WHERE image_url IS NULL) AS null_img,
    COUNT(*) FILTER (
      WHERE image_url IS NOT NULL
        AND image_url NOT ILIKE '%upload.wikimedia%'
        AND image_url NOT ILIKE '%supabase.co/storage%'
    ) AS other,
    COUNT(*) AS total
  FROM place_seed_raw WHERE city_id = 41
  GROUP BY 1 ORDER BY 1
`);
console.log('\n═══ 3. 이미지 출처 (카테고리 × 출처) ═══');
console.table(img.rows);

// 4. 필드별 NULL 개수
const fields = await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE name_ko IS NULL) AS null_name_ko,
    COUNT(*) FILTER (WHERE address IS NULL) AS null_address,
    COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) AS null_coords,
    COUNT(*) FILTER (WHERE image_url IS NULL) AS null_image,
    COUNT(*) FILTER (WHERE summary_ko IS NULL) AS null_summary_ko,
    COUNT(*) FILTER (WHERE editorial_summary IS NULL) AS null_editorial,
    COUNT(*) FILTER (WHERE google_place_id IS NULL) AS null_place_id,
    COUNT(*) AS total
  FROM place_seed_raw WHERE city_id = 41
`);
console.log('\n═══ 4. 필드별 NULL 개수 (= 전체 브뤼셀 행) ═══');
console.table(fields.rows);

// 5. 샘플 행 = 카테고리당 1 개 = 실제 데이터 형태 확인
const samples = await c.query(`
  SELECT seed_category, name_en, name_ko, rank, collection_phase,
    SUBSTRING(address, 1, 50) AS addr_short,
    CASE WHEN image_url IS NULL THEN 'NULL' WHEN image_url ILIKE '%wikimedia%' THEN 'WK' WHEN image_url ILIKE '%storage%' THEN 'GOOGLE' ELSE 'OTHER' END AS img_src,
    SUBSTRING(summary_ko, 1, 40) AS summary_short,
    SUBSTRING(editorial_summary, 1, 40) AS editorial_short,
    CASE WHEN google_place_id IS NULL THEN 'NULL' ELSE 'OK' END AS pid_status
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY rank) AS rn
    FROM place_seed_raw WHERE city_id = 41
  ) t
  WHERE rn <= 2
  ORDER BY seed_category, rank
`);
console.log('\n═══ 5. 카테고리당 상위 2 개 샘플 ═══');
console.table(samples.rows);

await c.end();
