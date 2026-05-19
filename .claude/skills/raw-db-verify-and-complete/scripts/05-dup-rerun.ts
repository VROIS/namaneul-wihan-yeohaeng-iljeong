// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 5 = 5 단계 매칭 재실행 + 의심 그룹 보고
// = 호출 = npx tsx 05-dup-rerun.ts --city=Paris
// = 출력 = tmp/<city>-dup-groups.json (= 사용자 검수 후 = Step 6 입력)

import 'dotenv/config';
import fs from 'fs';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { db } from '../../../../server/db';

function parseCity(argv: string[]): string {
  for (const a of argv.slice(2)) if (a.startsWith('--city=')) return a.slice(7);
  throw new Error('--city=<name> 명시 필요');
}

const normAddr = (s: string | null | undefined) =>
  (s || '').toLowerCase().replace(/[.,;:!?'"()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
const normName = (s: string | null | undefined) => (s || '').trim().toLowerCase();

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
  const cityName = parseCity(process.argv);
  const cityId = await findCityId(cityName);

  const r: any = await (db as any).execute(
    `SELECT id, seed_category, name_en, name_ko, name_local, address, latitude, longitude, ` +
    `google_place_id, google_maps_uri, image_url, phase_tags ` +
    `FROM place_seed_raw WHERE city_id = ${cityId}`,
  );
  const rows = r?.rows || r;
  const active = rows.filter((row: any) =>
    !(row.phase_tags || []).some((t: any) => String(t).includes('archived-merge')),
  );
  console.log(`=== Step 5 = ${cityName} 활성 = ${active.length} 행 ===`);

  // Union-Find
  const parent = new Map<number, number>(active.map((r: any) => [r.id, r.id]));
  const find = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const stats = { pid: 0, addr: 0, uri: 0, coord: 0, name: 0 };
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (a.google_place_id && a.google_place_id === b.google_place_id) {
        if (find(a.id) !== find(b.id)) stats.pid++; union(a.id, b.id); continue;
      }
      if (a.address && b.address) {
        const na = normAddr(a.address), nb = normAddr(b.address);
        if (na.length >= 20 && na === nb) {
          const aN = [normName(a.name_en), normName(a.name_local), normName(a.name_ko)].filter(Boolean);
          const bN = [normName(b.name_en), normName(b.name_local), normName(b.name_ko)].filter(Boolean);
          if (aN.some(x => bN.includes(x))) {
            if (find(a.id) !== find(b.id)) stats.addr++; union(a.id, b.id); continue;
          }
        }
      }
      if (a.google_maps_uri && a.google_maps_uri === b.google_maps_uri) {
        if (find(a.id) !== find(b.id)) stats.uri++; union(a.id, b.id); continue;
      }
      if (a.latitude != null && b.latitude != null && a.longitude != null && b.longitude != null) {
        if (Math.abs(Number(a.latitude) - Number(b.latitude)) < 0.0001 &&
            Math.abs(Number(a.longitude) - Number(b.longitude)) < 0.0001) {
          if (find(a.id) !== find(b.id)) stats.coord++; union(a.id, b.id); continue;
        }
      }
      const aN2 = [normName(a.name_en), normName(a.name_local), normName(a.name_ko)].filter(Boolean);
      const bN2 = [normName(b.name_en), normName(b.name_local), normName(b.name_ko)].filter(Boolean);
      if (aN2.some(x => bN2.includes(x))) {
        if (find(a.id) !== find(b.id)) stats.name++; union(a.id, b.id); continue;
      }
    }
  }

  const groups = new Map<number, any[]>();
  for (const row of active) {
    const root = find(row.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(row);
  }
  const dupGroups = [...groups.values()].filter(g => g.length > 1);

  console.log(`매칭: PID=${stats.pid} addr=${stats.addr} uri=${stats.uri} coord=${stats.coord} name=${stats.name}`);
  console.log(`중복 그룹 = ${dupGroups.length}`);

  fs.mkdirSync('tmp', { recursive: true });
  const outFile = `tmp/${cityName.toLowerCase()}-dup-groups.json`;
  fs.writeFileSync(outFile, JSON.stringify({
    cityName, cityId, active: active.length, stats,
    dupGroups: dupGroups.map(g => ({
      size: g.length,
      rows: g.map((r: any) => ({
        id: r.id, cat: r.seed_category, name: r.name_local || r.name_en,
        addr: r.address, coord: r.latitude && r.longitude ? `${r.latitude},${r.longitude}` : null,
        pid: r.google_place_id || null,
      })),
    })),
  }, null, 2));
  console.log(`💾 저장 = ${outFile}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
