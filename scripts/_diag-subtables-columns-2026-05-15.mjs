// 1 회용 = 보조 테이블 10 개의 모든 컬럼 출력 (= place_seed_raw 매핑 검토용)
// 사용자 명시 2026-05-15: 가져올 요소가 어느 컬럼에 들어갈지 매칭, 컬럼 없으면 안 가져옴
// 최종 12 요소 SSOT:
//   1) name_en  2) name_ko  3) name_local  4) address
//   5) latitude  6) longitude  7) google_place_id  8) image_url
//   9) summary_ko  10) editorial_summary  11) price_eur  12) google_review_count

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

const TABLES = [
  'place_images',
  'place_prices',
  'gemini_web_search_cache',
  'naver_blog_posts',
  'tripadvisor_data',
  'place_data_sources',
  'place_nubi_reasons',
  'youtube_place_mentions',
  'celebrity_place_evidence',
  'places',
];

for (const t of TABLES) {
  console.log(`\n═════════ ${t} 컬럼 + 채움률 ═════════`);
  const cols = (await c.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [t])).rows;

  const stats = [];
  for (const { column_name, data_type } of cols) {
    try {
      const r = await c.query(`
        SELECT COUNT(*) FILTER (WHERE "${column_name}" IS NOT NULL)::int AS filled,
               ROUND(100.0 * COUNT(*) FILTER (WHERE "${column_name}" IS NOT NULL) / NULLIF(COUNT(*), 0), 1)::float AS pct,
               COUNT(*)::int AS total
        FROM "${t}"
      `);
      stats.push({
        column: column_name,
        type: data_type,
        filled: r.rows[0].filled,
        pct: r.rows[0].pct,
        total: r.rows[0].total,
      });
    } catch (e) {
      stats.push({ column: column_name, type: data_type, error: e.message.slice(0, 50) });
    }
  }
  console.table(stats);
}

await c.end();
console.log('\n═════════ 완료. SELECT only. DB 변경 0. ═════════');
