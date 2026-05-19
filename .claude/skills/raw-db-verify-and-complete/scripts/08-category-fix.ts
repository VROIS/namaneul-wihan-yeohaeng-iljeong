// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 8 = 분류 오류 정정 + archive name_en suffix (= UNIQUE 충돌 해제)
// = 호출 = npx tsx 08-category-fix.ts --city=Paris [--apply]
// = 식당 카테고리 = name_en ≠ name_local 행 = name_en = name_local 정정 (= 옛 분류 "X cuisine" 등 제거)
// = UNIQUE 충돌 (= archive 행이 같은 name_en 차지) = 2 단계 = archive name_en suffix 추가 + 활성 정정

import 'dotenv/config';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { db } from '../../../../server/db';

interface CliArgs { city: string; apply: boolean; }
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { city: '', apply: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--city=')) args.city = a.slice(7);
    else if (a === '--apply') args.apply = true;
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
  const cityId = await findCityId(args.city);

  // 정정 대상 = 활성 식당 + name_en ≠ name_local
  const targetR: any = await (db as any).execute(
    `SELECT id, name_en, name_local FROM place_seed_raw WHERE city_id = ${cityId} ` +
    `AND seed_category = 'restaurant' AND name_local IS NOT NULL ` +
    `AND name_en IS DISTINCT FROM name_local ` +
    `AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15']) ` +
    `ORDER BY id`,
  );
  const targets = targetR?.rows || targetR;
  console.log(`=== Step 8 = ${args.city} = 식당 정정 대상 = ${targets.length} 행 ===`);

  if (!args.apply) {
    console.log(`샘플 10:`);
    for (const row of targets.slice(0, 10)) console.log(`  id=${row.id} '${row.name_en}' → '${row.name_local}'`);
    console.log(`\n= --apply 추가 = 정정 진행`);
    process.exit(0);
  }

  let success = 0, conflict = 0;
  const conflictRows: any[] = [];

  // 1 차 = 충돌 없는 행만 정정
  for (const row of targets) {
    try {
      await (db as any).execute(`UPDATE place_seed_raw SET name_en = name_local WHERE id = ${row.id}`);
      success++;
    } catch (e: any) {
      conflict++;
      // 충돌 archive 행 찾기
      const otherR: any = await (db as any).execute(
        `SELECT id FROM place_seed_raw WHERE city_id = ${cityId} ` +
        `AND LOWER(TRIM(name_en)) = LOWER(TRIM('${(row.name_local || '').replace(/'/g, "''")}')) ` +
        `AND id != ${row.id} LIMIT 1`,
      );
      const other = otherR?.rows?.[0] || otherR?.[0];
      conflictRows.push({ activeId: row.id, name: row.name_local, archId: other?.id });
    }
  }
  console.log(`1 차 = success ${success} / conflict ${conflict}`);

  // 2 차 = 충돌 archive 행 = name_en suffix + 활성 행 재정정
  let suffixed = 0, fixed2 = 0;
  for (const c of conflictRows) {
    if (!c.archId) continue;
    await (db as any).execute(`UPDATE place_seed_raw SET name_en = name_en || '__arch' || id WHERE id = ${c.archId}`);
    suffixed++;
    try {
      await (db as any).execute(
        `UPDATE place_seed_raw SET name_en = name_local WHERE id = ${c.activeId} AND name_local IS NOT NULL`,
      );
      fixed2++;
    } catch (e: any) {
      console.log(`  ⛔ active id=${c.activeId} 재정정 실패: ${e.message}`);
    }
  }
  console.log(`2 차 = archive suffix ${suffixed} / 활성 재정정 ${fixed2}`);
  console.log(`\n= 총 정정 = ${success + fixed2} / 잔여 충돌 = ${conflict - fixed2}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
