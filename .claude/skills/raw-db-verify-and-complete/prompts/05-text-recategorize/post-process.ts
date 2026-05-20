// ⚠️ 수정금지(승인필요) 2026-05-20 = 05-text-recategorize 후처리 트랜잭션
// = 05-text-recategorize-suggestions-{date}.json 읽음 → BEGIN/COMMIT 트랜잭션 UPDATE
// = rank 자동 재할당 (= MAX+1) = UNIQUE INDEX 충돌 방지
//
// 호출 (= 사용자 명시 후만):
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/05-text-recategorize/post-process.ts --city-id=19 --date=2026-05-20 --apply
//
// 디폴트 = dry-run (= --apply 명시 없으면 트랜잭션 실행 X)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const apply = argv['apply'] === 'true';
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> [--apply]'); process.exit(1); }

(async () => {
  const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^['"]/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }

  const inPath = path.join(ROOT, 'docs', 'raw', String(cityId), `05-text-recategorize-suggestions-${date}.json`);
  if (!fs.existsSync(inPath)) { console.error(`✗ ${inPath} 미존재 = run.ts 먼저 실행`); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const suggestions = (j.suggestions || []).filter((s: any) => s.confidence >= 0.7);

  console.log(`═══ 05-text-recategorize post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}`);
  console.log(`정정 후보 = ${suggestions.length} (= confidence >= 0.7)`);
  console.log(`mode = ${apply ? 'APPLY (= 트랜잭션 실행)' : 'DRY-RUN (= 시뮬만)'}`);

  // 카테고리 변경 분포 보고 (= 사용자 검수 자료)
  const dist: Record<string, number> = {};
  suggestions.forEach((s: any) => {
    const key = `${s.current_category} → ${s.suggested_category}`;
    dist[key] = (dist[key] || 0) + 1;
  });
  console.log('\n카테고리 변경 분포:');
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k} = ${n}`));

  if (!apply) {
    console.log('\n--- DRY-RUN 종료 ---');
    console.log('사용자 명시 후 = --apply 플래그 추가하여 트랜잭션 실행');
    process.exit(0);
  }

  // 트랜잭션 = BEGIN/COMMIT
  const pg = await import('pg');
  const c = new pg.default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('BEGIN');
  let updated = 0, skipped = 0, errors = 0;
  try {
    for (const s of suggestions) {
      const cur = (await c.query('SELECT seed_category FROM place_seed_raw WHERE id=$1', [s.id])).rows[0];
      if (!cur) { skipped++; continue; }
      if (cur.seed_category === s.suggested_category) { skipped++; continue; }
      const r = await c.query(
        `UPDATE place_seed_raw
         SET seed_category = $2,
             rank = (SELECT COALESCE(MAX(rank),0)+1 FROM place_seed_raw WHERE city_id=$3 AND seed_category=$2)
         WHERE id = $1
         RETURNING id, name_en, seed_category, rank`,
        [s.id, s.suggested_category, cityId]
      );
      if (r.rowCount) {
        console.log(`✓ id=${s.id} ${cur.seed_category} → ${s.suggested_category} (rank=${r.rows[0].rank}) ${r.rows[0].name_en}`);
        updated++;
      }
    }
    await c.query('COMMIT');
    console.log(`\n✓ COMMIT 완료`);
  } catch (e: any) {
    await c.query('ROLLBACK');
    console.error(`✗ ROLLBACK: ${e.message}`);
    errors++;
  }
  await c.end();

  console.log(`\n═══ 결과 ═══`);
  console.log(`updated = ${updated} / skipped = ${skipped} / errors = ${errors}`);
})();