// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 6 = 명확 중복 통합 (= 사용자 명시 그룹 archive)
// = 호출 = npx tsx 06-merge-clear-dups.ts --city=Paris --groups-file=tmp/paris-merge-groups.json
// = groups-file 구조 = [{ keep: id, archive: [id1, id2, ...], name: 'X' }, ...]
// = keep 우선 = PID > 상세 이름 > 풍부도 (= [[feedback_dedup_keep_priority]])
// = archive 행 = phase_tags 에 'archived-merge-YYYY-MM-DD' 추가 (= DELETE X = 데이터 보존)

import 'dotenv/config';
import fs from 'fs';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { db } from '../../../../server/db';

interface MergeGroup { keep: number; archive: number[]; name?: string; }
interface CliArgs { city: string; groupsFile: string; }

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { city: '', groupsFile: '' };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--city=')) args.city = a.slice(7);
    else if (a.startsWith('--groups-file=')) args.groupsFile = a.slice(14);
  }
  if (!args.city) throw new Error('--city=<name> 명시 필요');
  if (!args.groupsFile) throw new Error('--groups-file=<path> 명시 필요');
  return args;
}

(async () => {
  await loadApiKeysFromDb();
  const args = parseArgs(process.argv);
  const groups: MergeGroup[] = JSON.parse(fs.readFileSync(args.groupsFile, 'utf-8'));
  const today = new Date().toISOString().slice(0, 10);
  const archiveTag = `archived-merge-${today}`;
  console.log(`=== Step 6 = ${args.city} = ${groups.length} 그룹 통합 (= ${archiveTag}) ===`);

  let totalArch = 0;
  for (const g of groups) {
    for (const aid of g.archive) {
      const r: any = await (db as any).execute(
        `UPDATE place_seed_raw SET phase_tags = ` +
        `CASE WHEN phase_tags IS NULL THEN ARRAY['${archiveTag}']::text[] ` +
        `ELSE array_append(phase_tags, '${archiveTag}') END ` +
        `WHERE id = ${aid} RETURNING id`,
      );
      const row = r?.rows?.[0] || r?.[0];
      if (row) totalArch++;
    }
    console.log(`[${g.name || '(unnamed)'}] keep=${g.keep} archive=${g.archive.join(',')}`);
  }
  console.log(`\n= archive ${totalArch} 행`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
