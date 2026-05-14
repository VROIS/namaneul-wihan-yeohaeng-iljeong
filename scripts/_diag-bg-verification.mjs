// 1 회용 = 백그라운드 saveNewPlacesToDB 검증
// = 커밋 전 baseline → 운영 사용 후 diff = 새 행 추가 확인
//
// 사용법:
//   node scripts/_diag-bg-verification.mjs baseline   # 커밋 전 = baseline 저장
//   node scripts/_diag-bg-verification.mjs diff       # 운영 사용 후 = baseline vs 현재 비교

import pg from 'pg';
import fs from 'fs';

const mode = process.argv[2] || 'help';
const today = new Date().toISOString().slice(0, 10);
const BASELINE_PATH = `backups/bg-verify-baseline-${today}.json`;

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

async function snapshot() {
  const r = await c.query(`
    SELECT
      ci.name_en AS city,
      COUNT(*) FILTER (WHERE p.collection_phase = 'auto-learn-2026-05') AS auto_learn,
      COUNT(*) FILTER (WHERE p.collection_phase = 'auto-learn-2026-05' AND p.created_at::date = CURRENT_DATE) AS today_added,
      COUNT(*) AS total
    FROM place_seed_raw p
    JOIN cities ci ON ci.id = p.city_id
    WHERE p.seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
    GROUP BY 1
    HAVING COUNT(*) FILTER (WHERE p.collection_phase = 'auto-learn-2026-05') > 0
    ORDER BY 2 DESC LIMIT 30
  `);
  const total = (await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE collection_phase = 'auto-learn-2026-05') AS auto_learn_total,
      COUNT(*) FILTER (WHERE collection_phase = 'auto-learn-2026-05' AND created_at::date = CURRENT_DATE) AS today_added_total
    FROM place_seed_raw
    WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  `)).rows[0];
  return { timestamp: new Date().toISOString(), total, by_city: r.rows };
}

if (mode === 'baseline') {
  const snap = await snapshot();
  fs.mkdirSync('backups', { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(snap, null, 2));
  console.log(`✅ baseline 저장: ${BASELINE_PATH}`);
  console.log(`  auto-learn 전체 = ${snap.total.auto_learn_total}`);
  console.log(`  오늘 추가 = ${snap.total.today_added_total}`);
  console.log(`  상위 도시:`);
  console.table(snap.by_city.slice(0, 10));
} else if (mode === 'diff') {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`❌ baseline 없음: ${BASELINE_PATH}`);
    console.error(`먼저 = node scripts/_diag-bg-verification.mjs baseline`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
  const now = await snapshot();
  console.log(`═══ diff (baseline ↔ 현재) ═══`);
  console.log(`baseline @ ${baseline.timestamp}`);
  console.log(`현재 @ ${now.timestamp}`);
  console.log(`\n전체 auto-learn:`);
  console.log(`  baseline = ${baseline.total.auto_learn_total}`);
  console.log(`  현재     = ${now.total.auto_learn_total}`);
  console.log(`  추가     = ${now.total.auto_learn_total - baseline.total.auto_learn_total} ⭐`);
  console.log(`\n오늘 추가:`);
  console.log(`  baseline = ${baseline.total.today_added_total}`);
  console.log(`  현재     = ${now.total.today_added_total}`);
  console.log(`  diff     = ${now.total.today_added_total - baseline.total.today_added_total} ⭐`);
  // 도시별 diff
  const bByCity = Object.fromEntries(baseline.by_city.map(r => [r.city, parseInt(r.auto_learn)]));
  const diffByCity = [];
  for (const r of now.by_city) {
    const before = bByCity[r.city] || 0;
    const after = parseInt(r.auto_learn);
    if (after > before) diffByCity.push({ city: r.city, before, after, diff: after - before });
  }
  if (diffByCity.length > 0) {
    console.log(`\n도시별 추가:`);
    console.table(diffByCity);
  } else {
    console.log(`\n도시별 추가 = 없음`);
  }
  // 최신 30 행 추가 = 시각 검증
  const recent = (await c.query(`
    SELECT p.id, p.name_en, p.name_ko, ci.name_en AS city, p.created_at,
      p.google_place_id IS NOT NULL AS has_pid,
      p.image_url IS NOT NULL AS has_img
    FROM place_seed_raw p JOIN cities ci ON ci.id = p.city_id
    WHERE p.collection_phase = 'auto-learn-2026-05'
      AND p.created_at > $1
    ORDER BY p.created_at DESC LIMIT 30
  `, [baseline.timestamp])).rows;
  if (recent.length > 0) {
    console.log(`\n최신 추가 행 (${recent.length}):`);
    console.table(recent);
  }
}

if (mode !== 'baseline' && mode !== 'diff') {
  console.log(`사용법:
  node scripts/_diag-bg-verification.mjs baseline   # 커밋 전 = baseline 저장
  node scripts/_diag-bg-verification.mjs diff       # 운영 사용 후 = 비교`);
}

await c.end();
