// ⚠️ 수정금지(승인필요) 2026-05-20 = 08-wk-image-fill 후처리 image_url UPDATE
// = TRUST 자동 또는 명시 ids 만 = 직접 UPDATE (= upsertPlace 우회 = image NULL → URL 채움)
//
// 호출 (= 사용자 명시 후만):
//   npx tsx .../08-wk-image-fill/post-process.ts --city-id=19 --date=2026-05-20 --apply-status=trust [--apply-ids=N,N,...]
//
// 정책:
// - TRUST (= score ≥ 5) 만 자동 적용 옵션 (= --apply-status=trust)
// - VERIFY (= score 3-4) = --apply-ids 명시 행만
// - reject / no_candidate = SKIP
// - image_url 기존 NULL 만 (= 옛 이미지 덮어쓰기 금지)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const applyStatus = (argv['apply-status'] || '').split(',').filter(Boolean);
const applyIds = (argv['apply-ids'] || '').split(',').filter(Boolean).map(Number);
const apply = applyStatus.length > 0 || applyIds.length > 0;
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> --apply-status=trust [--apply-ids=N,N,...]'); process.exit(1); }

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

  const inPath = path.join(ROOT, 'docs', 'raw', String(cityId), `08-wk-image-fill-candidates-${date}.json`);
  if (!fs.existsSync(inPath)) { console.error(`✗ ${inPath} 미존재 = run.ts 먼저 실행`); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const results = (j.results || []).filter((r: any) => r.best && r.best.image);

  // 적용 대상
  const targets = results.filter((r: any) =>
    applyStatus.includes(r.status) || applyIds.includes(r.id)
  );

  console.log(`═══ 08-wk-image-fill post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}`);
  console.log(`총 후보 (= image 보유) = ${results.length}`);
  console.log(`적용 대상 = ${targets.length} (= status=${applyStatus.join(',')}, ids=${applyIds.length})`);

  if (!apply) {
    console.log('\n--- DRY-RUN = --apply-status 또는 --apply-ids 명시 후 실행 ---');
    process.exit(0);
  }

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('BEGIN');

  let updated = 0, skipped = 0, errors = 0;
  try {
    for (const r of targets) {
      const wkUrl = r.best.image;
      const update = await c.query(
        `UPDATE place_seed_raw
         SET image_url = $2,
             phase_tags = array_cat(COALESCE(phase_tags, ARRAY[]::text[]), ARRAY[$3]::text[])
         WHERE id = $1
           AND (image_url IS NULL OR image_url = '')
         RETURNING id, name_en`,
        [r.id, wkUrl, `wk-image-fill-${date}`]
      );
      if (update.rowCount) {
        updated++;
        console.log(`✓ id=${r.id} '${r.name}' ← QID=${r.best.qid} score=${r.best.score} dist=${r.best.dist}m`);
      } else {
        skipped++;
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
  console.log(`updated = ${updated} / skipped = ${skipped} / errors = ${errors}`);
})();