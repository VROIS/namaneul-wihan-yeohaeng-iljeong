// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 7 = 좌표 10m 통합 + cross-cat 처리 (= 사용자 명시)
// = 호출 = npx tsx 07-coord-10m-merge.ts --city=Paris --report-only [--apply --groups-file=path]
// = 좌표 10m (= |lat1-lat2| < 0.0001 AND |lng1-lng2| < 0.0001) 그룹 + cross-cat 의심 = 보고
// = 사용자 검수 후 = --apply --groups-file 으로 통합 (= Step 6 와 동일 형식)
// = BTS 예외 = 자동 제외 (= 사용자 SSOT)

import 'dotenv/config';
import fs from 'fs';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { db } from '../../../../server/db';

interface CliArgs { city: string; apply: boolean; groupsFile: string; }
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { city: '', apply: false, groupsFile: '' };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--city=')) args.city = a.slice(7);
    else if (a === '--apply') args.apply = true;
    else if (a.startsWith('--groups-file=')) args.groupsFile = a.slice(14);
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

(async () => {
  await loadApiKeysFromDb();
  const args = parseArgs(process.argv);

  if (args.apply) {
    // groups-file 명시 시 = Step 6 동일 archive
    if (!args.groupsFile) throw new Error('--apply 시 --groups-file=<path> 명시 필요');
    const groups: Array<{ keep: number; archive: number[]; name?: string }> = JSON.parse(fs.readFileSync(args.groupsFile, 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);
    const archiveTag = `archived-merge-${today}`;
    let totalArch = 0;
    for (const g of groups) {
      for (const aid of g.archive) {
        const r: any = await (db as any).execute(
          `UPDATE place_seed_raw SET phase_tags = ` +
          `CASE WHEN phase_tags IS NULL THEN ARRAY['${archiveTag}']::text[] ` +
          `ELSE array_append(phase_tags, '${archiveTag}') END ` +
          `WHERE id = ${aid} RETURNING id`,
        );
        if (r?.rows?.[0] || r?.[0]) totalArch++;
      }
      console.log(`[${g.name}] keep=${g.keep} archive=${g.archive.join(',')}`);
    }
    console.log(`= archive ${totalArch} 행`);
    process.exit(0);
  }

  // report-only 기본
  const cityId = await findCityId(args.city);
  const r: any = await (db as any).execute(
    `SELECT id, seed_category, name_en, name_local, name_ko, address, latitude, longitude, google_place_id ` +
    `FROM place_seed_raw WHERE city_id = ${cityId} ` +
    `AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15']) ` +
    `ORDER BY id`,
  );
  const active = r?.rows || r;
  console.log(`=== Step 7 = ${args.city} 활성 = ${active.length} 행 ===`);

  // BTS 카테고리 제외
  const targets = active.filter((row: any) => !row.seed_category.startsWith('bts_'));

  const groups10m: any[] = [];
  for (let i = 0; i < targets.length; i++) {
    const a = targets[i];
    if (a.latitude == null || a.longitude == null) continue;
    for (let j = i + 1; j < targets.length; j++) {
      const b = targets[j];
      if (b.latitude == null || b.longitude == null) continue;
      if (Math.abs(Number(a.latitude) - Number(b.latitude)) < 0.0001 &&
          Math.abs(Number(a.longitude) - Number(b.longitude)) < 0.0001) {
        groups10m.push({ a, b });
      }
    }
  }
  console.log(`좌표 10m 그룹 = ${groups10m.length} (= 사용자 검수)`);

  fs.mkdirSync('tmp', { recursive: true });
  const outFile = `tmp/${args.city.toLowerCase()}-coord-10m-candidates.json`;
  fs.writeFileSync(outFile, JSON.stringify({
    cityName: args.city, cityId, candidates: groups10m.map(g => ({
      a: { id: g.a.id, cat: g.a.seed_category, name: g.a.name_local || g.a.name_en, pid: g.a.google_place_id },
      b: { id: g.b.id, cat: g.b.seed_category, name: g.b.name_local || g.b.name_en, pid: g.b.google_place_id },
      coord: `${g.a.latitude},${g.a.longitude}`,
    })),
  }, null, 2));
  console.log(`💾 보고 = ${outFile}`);
  console.log(`사용자 검수 후 = npx tsx 07-coord-10m-merge.ts --city=${args.city} --apply --groups-file=tmp/<merge-groups>.json`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
