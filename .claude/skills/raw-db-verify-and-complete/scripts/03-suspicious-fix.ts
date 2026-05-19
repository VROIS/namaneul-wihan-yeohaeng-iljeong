// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 3 = 의심 행 처리 (= 사용자 명시 입력)
// = 호출 = npx tsx 03-suspicious-fix.ts --city=Paris \
//          --delete=60296,60297,60298 \
//          --gemini-fix=60294,60300 \
//          --city-change=60310:0   (= 0 = 도시 없음 = DELETE)
// = 사용자 검수 후 = batch json 파일 보고 + 명시 입력
// = DELETE = 가짜/타도시 행 제거
// = gemini-fix = batch json 의 Gemini 응답으로 직접 UPDATE (= name_en 도 정정 = 본 작업 외 추가 명시)
// = city-change = 다른 도시 id 로 변경 (= newCityId=0 = DELETE)

import 'dotenv/config';
import fs from 'fs';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { db } from '../../../../server/db';

interface CliArgs {
  city: string;
  deleteIds: number[];
  geminiFixIds: number[];
  cityChange: Array<{ id: number; newCityId: number }>;
}
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { city: '', deleteIds: [], geminiFixIds: [], cityChange: [] };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--city=')) args.city = a.slice(7);
    else if (a.startsWith('--delete=')) args.deleteIds = a.slice(9).split(',').map(Number).filter(Boolean);
    else if (a.startsWith('--gemini-fix=')) args.geminiFixIds = a.slice(13).split(',').map(Number).filter(Boolean);
    else if (a.startsWith('--city-change=')) {
      args.cityChange = a.slice(14).split(',').map(s => {
        const [id, nc] = s.split(':').map(Number);
        return { id, newCityId: nc };
      });
    }
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

function findInBatchFiles(cityName: string, id: number): any | null {
  // tmp/<city>-enrich-batch-*.json 모두 검색
  const cityLower = cityName.toLowerCase();
  const files = fs.readdirSync('tmp').filter(f => f.startsWith(`${cityLower}-enrich-batch-`) && f.endsWith('.json'));
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(`tmp/${f}`, 'utf-8'));
    const place = (data.parsedPlaces || []).find((p: any) => p.id === id);
    if (place) return place;
  }
  return null;
}

(async () => {
  await loadApiKeysFromDb();
  const args = parseArgs(process.argv);
  const cityId = await findCityId(args.city);
  console.log(`=== Step 3 = 의심 행 처리 = ${args.city} (cityId=${cityId}) ===`);

  // DELETE
  for (const id of args.deleteIds) {
    const r: any = await (db as any).execute(`DELETE FROM place_seed_raw WHERE id = ${id} RETURNING id, name_en`);
    const row = r?.rows?.[0] || r?.[0];
    console.log(`DELETE id=${id} ${row ? `('${row.name_en}')` : '(없음)'} ✓`);
  }

  // city-change = 도시 변경 / 0 = DELETE
  for (const { id, newCityId } of args.cityChange) {
    if (newCityId === 0) {
      const r: any = await (db as any).execute(`DELETE FROM place_seed_raw WHERE id = ${id} RETURNING id, name_en`);
      const row = r?.rows?.[0] || r?.[0];
      console.log(`city-change id=${id} → DELETE (newCityId=0) ${row ? `('${row.name_en}')` : ''} ✓`);
    } else {
      await (db as any).execute(`UPDATE place_seed_raw SET city_id = ${newCityId} WHERE id = ${id}`);
      console.log(`city-change id=${id} → cityId=${newCityId} ✓`);
    }
  }

  // gemini-fix = batch json 응답으로 = 직접 UPDATE
  for (const id of args.geminiFixIds) {
    const p = findInBatchFiles(args.city, id);
    if (!p) { console.log(`gemini-fix id=${id} = batch json 미발견 = SKIP`); continue; }
    await (db as any).execute(
      `UPDATE place_seed_raw SET ` +
      `name_local = ${p.name_local ? `'${p.name_local.replace(/'/g, "''")}'` : 'NULL'}, ` +
      `name_ko = ${p.name_ko ? `'${p.name_ko.replace(/'/g, "''")}'` : 'NULL'}, ` +
      `address = ${p.address ? `'${p.address.replace(/'/g, "''")}'` : 'NULL'}, ` +
      `latitude = ${p.latitude || 'NULL'}, longitude = ${p.longitude || 'NULL'}, ` +
      `summary_ko = ${p.summary_ko ? `'${p.summary_ko.replace(/'/g, "''")}'` : 'NULL'}, ` +
      `editorial_summary = ${p.editorial_summary ? `'${p.editorial_summary.replace(/'/g, "''")}'` : 'NULL'}, ` +
      `price_eur = ${p.estimated_price_eur != null ? p.estimated_price_eur : 'NULL'} ` +
      `WHERE id = ${id}`,
    );
    console.log(`gemini-fix id=${id} = '${p.name_en}' 정정 ✓`);
  }

  console.log(`\n= DELETE ${args.deleteIds.length} + city-change ${args.cityChange.length} + gemini-fix ${args.geminiFixIds.length}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
