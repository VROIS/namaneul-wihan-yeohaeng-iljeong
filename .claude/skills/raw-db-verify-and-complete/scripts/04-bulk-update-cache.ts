// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 4 = 캐시 → 일괄 UPDATE (= Gemini 응답 최우선)
// = 호출 = npx tsx 04-bulk-update-cache.ts --city=Paris [--exclude=60296,60297,60298,60310]
// = tmp/<city>-enrich-batch-*.json 모두 = parsedPlaces 모두 = 직접 UPDATE
// = 새 정책 = COALESCE 새 우선 (= 헌법 §14 v2)
// = shopping 카테고리 = price_eur NULL 강제 (= §17 가드)
// = exclude id 는 SKIP (= Step 3 에서 DELETE 한 행)

import 'dotenv/config';
import fs from 'fs';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { db } from '../../../../server/db';

interface CliArgs {
  city: string;
  exclude: number[];
}
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { city: '', exclude: [] };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--city=')) args.city = a.slice(7);
    else if (a.startsWith('--exclude=')) args.exclude = a.slice(10).split(',').map(Number).filter(Boolean);
  }
  if (!args.city) throw new Error('--city=<name> 명시 필요');
  return args;
}

(async () => {
  await loadApiKeysFromDb();
  const args = parseArgs(process.argv);
  const cityLower = args.city.toLowerCase();
  const files = fs.readdirSync('tmp').filter(f => f.startsWith(`${cityLower}-enrich-batch-`) && f.endsWith('.json'));
  console.log(`=== Step 4 = ${args.city} = 캐시 ${files.length} 파일 → 일괄 UPDATE ===`);

  let applied = 0, missing = 0, skipped = 0;
  const errors: string[] = [];
  const excludeSet = new Set(args.exclude);

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(`tmp/${f}`, 'utf-8'));
    const places = data.parsedPlaces || [];
    let batchApplied = 0;
    for (const p of places) {
      if (excludeSet.has(p.id)) { skipped++; continue; }
      try {
        const r: any = await (db as any).execute(
          `UPDATE place_seed_raw SET ` +
          `name_en = COALESCE(${p.name_en ? `'${p.name_en.replace(/'/g, "''")}'` : 'NULL'}, name_en), ` +
          `name_local = COALESCE(${p.name_local ? `'${p.name_local.replace(/'/g, "''")}'` : 'NULL'}, name_local), ` +
          `name_ko = COALESCE(${p.name_ko ? `'${p.name_ko.replace(/'/g, "''")}'` : 'NULL'}, name_ko), ` +
          `address = COALESCE(${p.address ? `'${p.address.replace(/'/g, "''")}'` : 'NULL'}, address), ` +
          `latitude = COALESCE(${p.latitude || 'NULL'}::real, latitude), ` +
          `longitude = COALESCE(${p.longitude || 'NULL'}::real, longitude), ` +
          `summary_ko = COALESCE(${p.summary_ko ? `'${p.summary_ko.replace(/'/g, "''")}'` : 'NULL'}, summary_ko), ` +
          `editorial_summary = COALESCE(${p.editorial_summary ? `'${p.editorial_summary.replace(/'/g, "''")}'` : 'NULL'}, editorial_summary), ` +
          `price_eur = CASE WHEN seed_category = 'shopping' THEN NULL ELSE COALESCE(${p.estimated_price_eur != null ? p.estimated_price_eur : 'NULL'}::real, price_eur) END ` +
          `WHERE id = ${p.id} RETURNING id`,
        );
        const row = r?.rows?.[0] || r?.[0];
        if (row) { applied++; batchApplied++; } else { missing++; }
      } catch (e: any) {
        errors.push(`${f} id ${p.id}: ${e.message}`);
      }
    }
    console.log(`${f} = ${batchApplied}/${places.length} UPDATE`);
  }

  console.log(`\n=== 결과 ===`);
  console.log(`applied = ${applied} / missing = ${missing} / skipped = ${skipped} / errors = ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log(`  - ${e}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
