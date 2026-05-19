// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 9 = 외곽 부족 진단 (= 도심 좌표 + 우편번호 분포)
// = 호출 = npx tsx 09-outskirt-diagnose.ts --city=Paris
// = 활성 식당 = 도심 거리 분포 (= Haversine) + 우편번호 (= 75xxx 등) = DB-only 외곽 부족 여부 판단

import 'dotenv/config';
import fs from 'fs';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { db } from '../../../../server/db';

function parseCity(argv: string[]): string {
  for (const a of argv.slice(2)) if (a.startsWith('--city=')) return a.slice(7);
  throw new Error('--city=<name> 명시 필요');
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dlng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

(async () => {
  await loadApiKeysFromDb();
  const cityName = parseCity(process.argv);

  // 도심 좌표
  const c: any = await (db as any).execute(
    `SELECT id, name, latitude, longitude FROM cities WHERE LOWER(name) = LOWER('${cityName.replace(/'/g, "''")}') LIMIT 1`,
  );
  const cityRow = c?.rows?.[0] || c?.[0];
  if (!cityRow) throw new Error(`city '${cityName}' 미발견`);
  const cityId = Number(cityRow.id);
  const lat0 = Number(cityRow.latitude);
  const lng0 = Number(cityRow.longitude);
  console.log(`=== Step 9 = ${cityName} (cityId=${cityId}, center=${lat0},${lng0}) ===`);

  // 활성 식당
  const r: any = await (db as any).execute(
    `SELECT id, name_en, name_local, address, latitude, longitude FROM place_seed_raw ` +
    `WHERE city_id = ${cityId} AND seed_category = 'restaurant' ` +
    `AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15']) ` +
    `ORDER BY id`,
  );
  const rows = r?.rows || r;
  console.log(`활성 식당 = ${rows.length} 행`);

  const buckets: Record<string, number> = { '0-2km': 0, '2-5km': 0, '5-10km': 0, '10-20km': 0, '20-50km': 0, '50km+': 0, 'no_coord': 0 };
  const postal: Record<string, number> = {};
  const outer: any[] = [];

  for (const row of rows) {
    const lat = row.latitude ? Number(row.latitude) : null;
    const lng = row.longitude ? Number(row.longitude) : null;
    const dist = (lat && lng) ? haversineKm(lat0, lng0, lat, lng) : null;
    const pcMatch = (row.address || '').match(/\b(\d{5})\b/);
    const pc = pcMatch ? pcMatch[1] : null;
    const region = pc ? (pc.startsWith('75') ? `시내 (75xxx)` : `외곽 (${pc.substring(0,2)}xxx)`) : 'NULL';
    postal[region] = (postal[region] || 0) + 1;

    let bk = 'no_coord';
    if (dist != null) {
      if (dist < 2) bk = '0-2km';
      else if (dist < 5) bk = '2-5km';
      else if (dist < 10) bk = '5-10km';
      else if (dist < 20) bk = '10-20km';
      else if (dist < 50) bk = '20-50km';
      else bk = '50km+';
    }
    buckets[bk]++;

    const isOuter = (dist != null && dist >= 10) || (pc && !pc.startsWith('75'));
    if (isOuter) outer.push({ id: row.id, dist: dist != null ? dist.toFixed(1) : null, pc, name: row.name_local || row.name_en, addr: row.address });
  }

  console.log(`\n=== 거리 분포 ===`);
  for (const [b, n] of Object.entries(buckets)) console.log(`  ${b.padEnd(10)} = ${n}`);
  console.log(`\n=== 우편번호 분포 ===`);
  for (const [r, n] of Object.entries(postal).sort((a, b) => b[1] - a[1])) console.log(`  ${r} = ${n}`);
  console.log(`\n=== 외곽 식당 (= 10km+ OR 비-75xxx) = ${outer.length} 행 ===`);
  for (const o of outer) console.log(`  id=${o.id} ${o.dist}km ${o.pc} '${o.name}' (${(o.addr || '').substring(0, 50)})`);

  fs.mkdirSync('tmp', { recursive: true });
  const outFile = `tmp/${cityName.toLowerCase()}-outskirt-diagnose.json`;
  fs.writeFileSync(outFile, JSON.stringify({ cityName, cityId, total: rows.length, buckets, postal, outer }, null, 2));
  console.log(`\n💾 저장 = ${outFile}`);
  console.log(`= 외곽 < 20 행 = Step 10 진행 권장 (= 외곽 식당 보강)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
