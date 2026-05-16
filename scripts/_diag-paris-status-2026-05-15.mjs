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

const ACTIVE = `
  seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))
  AND NOT ('archived-merge-2026-05-15' = ANY(COALESCE(phase_tags, '{}')))
  AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))
  AND NOT ('archived-2026-05' = ANY(COALESCE(phase_tags, '{}')))
`;

console.log('═════════ Paris (city_id=19) 카테고리별 분포 ═════════\n');

const r = await c.query(`
  SELECT
    seed_category,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL)::int AS pid,
    COUNT(*) FILTER (WHERE
      (image_url IS NOT NULL AND image_url <> '')
      OR (photo_urls IS NOT NULL AND jsonb_array_length(photo_urls) > 0)
    )::int AS image,
    COUNT(*) FILTER (WHERE address IS NOT NULL AND address <> '')::int AS full_addr,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::int AS coords,
    COUNT(*) FILTER (WHERE
      name_en IS NOT NULL OR name_local IS NOT NULL OR name_ko IS NOT NULL
    )::int AS any_name,
    COUNT(*) FILTER (WHERE name_en IS NOT NULL)::int AS name_en,
    COUNT(*) FILTER (WHERE name_ko IS NOT NULL)::int AS name_ko,
    COUNT(*) FILTER (WHERE name_local IS NOT NULL)::int AS name_local
  FROM place_seed_raw
  WHERE city_id = 19 AND ${ACTIVE}
  GROUP BY seed_category
  ORDER BY total DESC
`);
console.table(r.rows);

const total = r.rows.reduce((s, x) => s + x.total, 0);
const sumPid = r.rows.reduce((s, x) => s + x.pid, 0);
const sumImg = r.rows.reduce((s, x) => s + x.image, 0);
const sumAddr = r.rows.reduce((s, x) => s + x.full_addr, 0);
const sumCoord = r.rows.reduce((s, x) => s + x.coords, 0);
const sumName = r.rows.reduce((s, x) => s + x.any_name, 0);

console.log('\n═════════ 합계 ═════════');
console.log(`Paris 활성 행 총: ${total}`);
console.log(`  PID 보유:      ${sumPid} (${(sumPid*100/total).toFixed(1)}%)`);
console.log(`  이미지 보유:   ${sumImg} (${(sumImg*100/total).toFixed(1)}%)`);
console.log(`  풀주소 보유:   ${sumAddr} (${(sumAddr*100/total).toFixed(1)}%)`);
console.log(`  좌표 보유:     ${sumCoord} (${(sumCoord*100/total).toFixed(1)}%)`);
console.log(`  이름 보유:     ${sumName} (${(sumName*100/total).toFixed(1)}%)`);

await c.end();
