// 1 회용 = Paris 병합 결과 검증
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

console.log('═══ Paris 병합 검증 ═══\n');

// 1. 전체 Paris 행 수 + archived 행 수
const counts = (await c.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE 'archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AS archived_today,
    COUNT(*) FILTER (WHERE 'archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])) OR 'archived-2026-05' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AS all_archived,
    COUNT(*) FILTER (WHERE NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AND NOT ('archived-2026-05' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))) AS active_after_merge
  FROM place_seed_raw
  WHERE city_id = 19
    AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
`)).rows[0];
console.log('1. Paris 행 수:');
console.table(counts);

// 2. 오늘 archived 된 Paris 행 (= 어떤 행?)
const archivedToday = (await c.query(`
  SELECT id, name_en, name_ko, address, google_place_id IS NOT NULL AS has_pid, image_url IS NOT NULL AS has_img, phase_tags
  FROM place_seed_raw
  WHERE city_id = 19
    AND 'archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))
  ORDER BY id
`)).rows;
console.log('\n2. Paris 오늘 archived 행 (= 병합 흡수됨):');
console.table(archivedToday);

// 3. 그 대표 행 = audit 로그에서 확인
const audit = JSON.parse(fs.readFileSync('backups/merge-audit-commit-2026-05-14.json', 'utf-8'));
const parisGroups = audit.filter(g => g.city === 'Paris');
console.log('\n3. Paris 병합 그룹 audit:');
for (const g of parisGroups) {
  console.log(`  대표 id=${g.rep_id} ← archived [${g.archived_ids.join(', ')}]`);
  console.log(`  COALESCE 보강 필드: ${Object.keys(g.supplements).join(', ') || '(없음)'}`);
}

// 4. 대표 행 상세 (= 보강 후 상태)
if (parisGroups.length > 0) {
  const repIds = parisGroups.map(g => g.rep_id);
  const reps = (await c.query(`
    SELECT id, name_en, name_ko, name_local, address, google_place_id IS NOT NULL AS has_pid,
      SUBSTRING(image_url, 1, 50) AS img_short, SUBSTRING(summary_ko, 1, 40) AS summary_short
    FROM place_seed_raw
    WHERE id = ANY($1)
  `, [repIds])).rows;
  console.log('\n4. Paris 대표 행 상태 (= 병합 후 = COALESCE 보강 반영):');
  console.table(reps);
}

await c.end();
