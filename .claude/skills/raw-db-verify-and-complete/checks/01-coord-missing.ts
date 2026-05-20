// ⚠️ 수정금지(승인필요) 2026-05-20 = 좌표 NULL 검출 (= 정기 점검)
// = 활성 행 = latitude/longitude NULL = list 보고 + 카테고리별 통계
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/checks/01-coord-missing.ts --city-id=19
//   npx tsx .claude/skills/raw-db-verify-and-complete/checks/01-coord-missing.ts --all
//
// 산출물 = docs/raw/{city_id}/_checks/01-coord-missing-{YYYY-MM-DD}.json
// 시정 = prompts/02-enrich-place/run.ts 재호출 (= 좌표 NULL 행 보강)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const all = argv['all'] === 'true';
if (!cityId && !all) { console.error('Usage: --city-id=<N> 또는 --all'); process.exit(1); }

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const cityIds: number[] = all
    ? (await c.query('SELECT id FROM cities WHERE name_en IS NOT NULL ORDER BY id')).rows.map((r: any) => r.id)
    : [cityId];

  const today = new Date().toISOString().slice(0, 10);
  let totalMissing = 0;

  for (const cid of cityIds) {
    const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cid])).rows[0];
    if (!city) continue;

    const missing = (await c.query(`
      SELECT id, seed_category, rank, name_en, name_local, address
      FROM place_seed_raw
      WHERE city_id = $1
        AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15','archived-merge-2026-05-20','user-delete'])
        AND (latitude IS NULL OR longitude IS NULL)
      ORDER BY seed_category, rank NULLS LAST
    `, [cid])).rows;

    const total = (await c.query(`
      SELECT COUNT(*)::int AS cnt FROM place_seed_raw
      WHERE city_id = $1
        AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15','archived-merge-2026-05-20','user-delete'])
    `, [cid])).rows[0].cnt;

    if (missing.length > 0) {
      const byCategory: Record<string, number> = {};
      missing.forEach((r: any) => { byCategory[r.seed_category] = (byCategory[r.seed_category] || 0) + 1; });

      const outDir = path.join(ROOT, 'docs', 'raw', String(cid), '_checks');
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `01-coord-missing-${today}.json`);
      fs.writeFileSync(outPath, JSON.stringify({
        meta: { city_id: cid, city_name: city.name_en, called_at: new Date().toISOString(), active_rows: total, missing_count: missing.length },
        by_category: byCategory,
        rows: missing,
      }, null, 2));

      console.log(`[${cid}] ${city.name_en} = 좌표 NULL ${missing.length}/${total} (= ${(missing.length / total * 100).toFixed(1)}%) → ${outPath}`);
      console.log(`  카테고리별:`, byCategory);
      totalMissing += missing.length;
    } else {
      console.log(`[${cid}] ${city.name_en} = 좌표 NULL 0 / ${total} ✓`);
    }
  }
  await c.end();

  console.log(`\n═══ 합계 ═══ ${cityIds.length} 도시 / 좌표 NULL ${totalMissing} 행`);
  console.log(`\n시정 = prompts/02-enrich-place/run.ts 재호출 (= 좌표 NULL 행 = Gemini 보강):`);
  console.log(`  npx tsx .../02-enrich-place/run.ts --city-id=<N>`);
})();