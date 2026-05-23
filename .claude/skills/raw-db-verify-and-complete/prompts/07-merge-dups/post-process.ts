// ⚠️ 수정금지(승인필요) 2026-05-20 = 07-merge-dups 후처리 archive 트랜잭션
// = 사용자 명시 그룹/tier 만 archive (= 자율 archive 금지 = 헌법 §1)
//
// 호출 (= 사용자 명시 후만):
//   npx tsx .../07-merge-dups/post-process.ts --city-id=19 --date=2026-05-20 --apply-tiers=0,1,2,3 [--apply-groups=key1,key2,...]
//
// 정책:
// - 명확 tier (= 0/1/2/3) 만 자동 적용 옵션 (= --apply-tiers)
// - 의심 tier (= 4 = 이름 보조) = --apply-groups 명시 그룹만
// - keep 우선순위 = PID > 상세 이름 > 풍부도 > rank
// - archive = phase_tags += `archived-merge-{YYYY-MM-DD}`
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const applyTiers = (argv['apply-tiers'] || '').split(',').filter(Boolean).map(Number);
const applyGroups = (argv['apply-groups'] || '').split(',').filter(Boolean);
const apply = argv['apply'] === 'true' || applyTiers.length > 0 || applyGroups.length > 0;
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> --apply-tiers=0,1,2,3 [--apply-groups=key1,...]'); process.exit(1); }

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

  const inPath = path.join(ROOT, 'docs', 'raw', String(cityId), `07-merge-dups-groups-${date}.json`);
  if (!fs.existsSync(inPath)) { console.error(`✗ ${inPath} 미존재 = run.ts 먼저 실행`); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const groups = j.groups || [];

  console.log(`═══ 07-merge-dups post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}, 총 그룹 = ${groups.length}`);
  console.log(`apply-tiers = [${applyTiers.join(',')}], apply-groups = ${applyGroups.length}`);

  // 적용 대상 필터
  const targets = groups.filter((g: any) =>
    applyTiers.includes(g.matched_tier) || applyGroups.includes(g.group_key)
  );
  console.log(`적용 대상 그룹 = ${targets.length}`);

  if (!apply) {
    console.log('\n--- DRY-RUN = --apply-tiers 또는 --apply-groups 명시 후 실행 ---');
    process.exit(0);
  }

  // keep 선정 = PID 우선 → image+desc 풍부도 → rank
  function selectKeep(rows: any[]): any {
    const sorted = [...rows].sort((a, b) => {
      if (a.has_pid !== b.has_pid) return a.has_pid ? -1 : 1;
      const aRich = (a.has_image ? 1 : 0) + (a.summary_ko ? 1 : 0);
      const bRich = (b.has_image ? 1 : 0) + (b.summary_ko ? 1 : 0);
      if (aRich !== bRich) return bRich - aRich;
      return (a.rank ?? 9999) - (b.rank ?? 9999);
    });
    return sorted[0];
  }

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('BEGIN');

  // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = archive 마커 폐기 = 물리 DELETE (= 1 장소 = 1 행 정적)
  let archived = 0, errors = 0;
  try {
    for (const g of targets) {
      const keep = selectKeep(g.rows);
      const archiveIds = g.rows.filter((r: any) => r.id !== keep.id).map((r: any) => r.id);
      for (const aid of archiveIds) {
        const r = await c.query(`DELETE FROM place_seed_raw WHERE id = $1`, [aid]);
        if (r.rowCount) {
          archived++;
          console.log(`✓ DELETE id=${aid} (= keep id=${keep.id} '${keep.name_en}') [tier=${g.matched_tier}]`);
        }
      }
    }
    await c.query('COMMIT');
    console.log('\n✓ COMMIT 완료');
  } catch (e: any) {
    await c.query('ROLLBACK');
    console.error(`✗ ROLLBACK: ${e.message}`);
    errors++;
  }
  await c.end();

  console.log(`\n═══ 결과 ═══`);
  console.log(`archived = ${archived} / errors = ${errors}`);
})();