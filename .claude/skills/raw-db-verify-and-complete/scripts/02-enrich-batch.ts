// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 2 = id ASC batch dry-run = enrich-place prompt 호출
// = 호출 = npx tsx 02-enrich-batch.ts --city=Paris --batch=40 --offset=0 [--all]
// = --all 시 = 모든 batch 자동 (= offset 0, batch, 2×batch, ...)
// = adaptive fallback = batch 40 실패 시 30 → 20 → 10 시도 (= 자동)
// = 출력 = tmp/<city>-enrich-batch-<offset>.json (= 사용자 검수)

import 'dotenv/config';
import fs from 'fs';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { enrichPlaceByGemini } from '../../../../server/services/seed/enrich-place';
import { db } from '../../../../server/db';

interface CliArgs {
  city: string;
  batch: number;
  offset: number;
  all: boolean;
}
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { city: '', batch: 40, offset: 0, all: false };
  for (const a of argv.slice(2)) {
    if (a === '--all') args.all = true;
    else if (a.startsWith('--city=')) args.city = a.slice(7);
    else if (a.startsWith('--batch=')) args.batch = Number(a.slice(8));
    else if (a.startsWith('--offset=')) args.offset = Number(a.slice(9));
  }
  if (!args.city) throw new Error('--city=<name> 명시 필요');
  return args;
}

async function findCityId(cityName: string): Promise<number> {
  const r: any = await (db as any).execute(
    `SELECT id FROM cities WHERE LOWER(name) = LOWER('${cityName.replace(/'/g, "''")}') LIMIT 1`,
  );
  const id = r?.rows?.[0]?.id || r?.[0]?.id;
  if (!id) throw new Error(`city '${cityName}' 미발견`);
  return Number(id);
}

async function getActiveCount(cityId: number): Promise<number> {
  const r: any = await (db as any).execute(
    `SELECT COUNT(*) AS cnt FROM place_seed_raw WHERE city_id = ${cityId} ` +
    `AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15'])`,
  );
  return Number(r?.rows?.[0]?.cnt || r?.[0]?.cnt || 0);
}

async function runBatch(cityId: number, cityName: string, offset: number, batchSize: number): Promise<boolean> {
  // adaptive fallback = batch 시도 실패 시 30 → 20 → 10
  for (const size of [batchSize, 30, 20, 10]) {
    if (size > batchSize) continue;
    console.log(`\n--- batch=${size} offset=${offset} 시도 ---`);
    const r = await enrichPlaceByGemini(cityId, { batchSize: size, offset, dryRun: true });
    const ok = r.parsedPlaces.length === r.inputCount && r.missingIds.length === 0 && !r.parseError;
    const outFile = `tmp/${cityName.toLowerCase()}-enrich-batch-${offset}.json`;
    fs.mkdirSync('tmp', { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify({
      meta: {
        cityId, batchSize: size, offset, dryRun: true,
        finishReason: r.finishReason, parseError: r.parseError || null,
        inputCount: r.inputCount, parsedCount: r.parsedPlaces.length,
        missingIds: r.missingIds, unexpectedIds: r.unexpectedIds,
        timestamp: new Date().toISOString(),
      },
      rawResponse: r.rawResponse,
      parsedPlaces: r.parsedPlaces,
    }, null, 2));
    console.log(`batch=${size} offset=${offset} = ${r.parsedPlaces.length}/${r.inputCount} ${ok ? '✅' : '⚠️'} → ${outFile}`);
    if (ok) return true;
    console.log(`= 실패 = fallback 시도`);
  }
  return false;
}

(async () => {
  await loadApiKeysFromDb();
  const args = parseArgs(process.argv);
  const cityId = await findCityId(args.city);
  const activeCount = await getActiveCount(cityId);
  console.log(`=== Step 2 = ${args.city} (city_id=${cityId}, active=${activeCount}) ===`);

  if (args.all) {
    const totalBatches = Math.ceil(activeCount / args.batch);
    console.log(`= --all = ${totalBatches} batch 자동 진행`);
    for (let i = 0; i < totalBatches; i++) {
      const offset = i * args.batch;
      const ok = await runBatch(cityId, args.city, offset, args.batch);
      if (!ok) console.log(`⛔ batch offset=${offset} 모두 fallback 실패 = 수동 점검 필요`);
    }
  } else {
    const ok = await runBatch(cityId, args.city, args.offset, args.batch);
    if (!ok) console.log(`⛔ batch offset=${args.offset} 모두 fallback 실패 = 수동 점검 필요`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
