// 1 회용 = 파리 시드 부족분 추적
// 사용자 예상: 6 카테고리 × 20 + 식당 50 = 150-160 / 실제: 122 = 30-40 부족
// 어디로 사라졌나? = archived / 시드 미실행 / UNIQUE 충돌 / 카테고리 미발굴 등 면밀 조사
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

// 1. Paris 전체 = 카테고리별 × phase
console.log('═══ 1. Paris 전체 카테고리별 × collection_phase ═══');
const all = (await c.query(`
  SELECT seed_category, collection_phase, COUNT(*)::int AS cnt
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  GROUP BY seed_category, collection_phase
  ORDER BY seed_category, cnt DESC
`)).rows;
console.table(all);

// 2. archived 카운트 (= 어제 정리)
console.log('\n═══ 2. Paris archived 분포 ═══');
const arch = (await c.query(`
  SELECT
    seed_category,
    COUNT(*) FILTER (WHERE 'archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))::int AS merge,
    COUNT(*) FILTER (WHERE 'archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))::int AS bad_name,
    COUNT(*) FILTER (WHERE 'archived-2026-05' = ANY(COALESCE(phase_tags, '{}')))::int AS old,
    COUNT(*)::int AS total
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  GROUP BY seed_category
  ORDER BY total DESC
`)).rows;
console.table(arch);

// 3. archived 합계
const archTotal = (await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE 'archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))::int AS merge,
    COUNT(*) FILTER (WHERE 'archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))::int AS bad_name,
    COUNT(*) FILTER (WHERE 'archived-2026-05' = ANY(COALESCE(phase_tags, '{}')))::int AS old,
    COUNT(*)::int AS total
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
`)).rows[0];
console.log('\n═══ 3. Paris 합계 (= BTS 제외 모든 행) ═══');
console.log('  전체 행 (= active + archived):  ' + archTotal.total);
console.log('  archived-merge-2026-05-14:      ' + archTotal.merge);
console.log('  archived-bad-name-2026-05-14:   ' + archTotal.bad_name);
console.log('  archived-2026-05 (옛 phase):    ' + archTotal.old);
const allArch = archTotal.merge + archTotal.bad_name + archTotal.old;
console.log('  archived 합계 (= 중복 포함):    ' + allArch);

// 4. 식당 = 가격대 분류 (= 사용자 시드 = 35 + 15 + 5 = 50)
console.log('\n═══ 4. Paris restaurant 가격대 분류 (= category_tags) ═══');
const resto = (await c.query(`
  SELECT
    CASE
      WHEN 'low' = ANY(COALESCE(category_tags, '{}')) THEN 'low'
      WHEN 'mid' = ANY(COALESCE(category_tags, '{}')) THEN 'mid'
      WHEN 'high' = ANY(COALESCE(category_tags, '{}')) THEN 'high'
      ELSE 'untagged'
    END AS price_tier,
    COUNT(*) FILTER (WHERE
      NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))
      AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))
      AND NOT ('archived-2026-05' = ANY(COALESCE(phase_tags, '{}')))
    )::int AS active,
    COUNT(*) FILTER (WHERE 'archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))::int AS arch_merge,
    COUNT(*) FILTER (WHERE 'archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))::int AS arch_bad,
    COUNT(*) FILTER (WHERE 'archived-2026-05' = ANY(COALESCE(phase_tags, '{}')))::int AS arch_old,
    COUNT(*)::int AS total
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category = 'restaurant'
  GROUP BY price_tier
  ORDER BY total DESC
`)).rows;
console.table(resto);

// 5. 사용자 예상 vs 실제 = 카테고리별
console.log('\n═══ 5. 사용자 예상 vs 실제 (활성) ═══');
const cats = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping', 'restaurant'];
const expected = { heritage: 20, hotspot: 20, attraction: 20, adventure: 20, healing: 20, shopping: 20, restaurant: 50 };
for (const cat of cats) {
  const r = (await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE
        NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))
        AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))
        AND NOT ('archived-2026-05' = ANY(COALESCE(phase_tags, '{}')))
      )::int AS active,
      COUNT(*)::int AS total
    FROM place_seed_raw
    WHERE city_id = 19 AND seed_category = $1
  `, [cat])).rows[0];
  const exp = expected[cat] || 0;
  const diff = r.active - exp;
  const arrow = diff >= 0 ? '✅' : '⚠️';
  console.log(`  ${arrow} ${cat.padEnd(11)} 예상=${String(exp).padStart(3)} | 활성=${String(r.active).padStart(3)} | 전체=${String(r.total).padStart(3)} | 차이=${diff > 0 ? '+' : ''}${diff}`);
}

// 6. archived bad_name 식당 샘플 = 어떤 곳이 사라졌나
console.log('\n═══ 6. Paris archived-bad-name 샘플 = 어떤 곳이 빠졌나 (카테고리별 5) ═══');
for (const cat of cats) {
  const r = (await c.query(`
    SELECT id, name_en, name_ko, collection_phase, rank
    FROM place_seed_raw
    WHERE city_id = 19 AND seed_category = $1
      AND 'archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, '{}'))
    ORDER BY id LIMIT 5
  `, [cat])).rows;
  if (r.length === 0) continue;
  console.log(`\n[${cat}] archived-bad-name = 위 ${r.length} 행 샘플:`);
  for (const x of r) {
    console.log(`  id=${x.id} | "${x.name_en}" (ko=${x.name_ko || 'NULL'}) | phase=${x.collection_phase} | rank=${x.rank}`);
  }
}

await c.end();
