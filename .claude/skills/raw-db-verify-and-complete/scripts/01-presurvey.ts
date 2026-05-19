// ⚠️ 수정금지(승인필요) 2026-05-18 = raw DB 검증 및 완성 = Step 1 사전조사
// = 5 단계 매칭 dry-run + 카테고리별 통계 + 13 SSOT 채움률
// = 호출 = npx tsx .claude/skills/raw-db-verify-and-complete/scripts/01-presurvey.ts --city=Paris
// = 출력 = tmp/<city>-presurvey.json (= 사용자 검수)

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { db } from '../../../../server/db';
import { placeSeedRaw } from '../../../../shared/schema';
import { eq, asc } from 'drizzle-orm';

function parseCity(argv: string[]): string {
  for (const a of argv.slice(2)) if (a.startsWith('--city=')) return a.slice(7);
  throw new Error('--city=<name> 명시 필요');
}

async function findCityId(cityName: string): Promise<number> {
  if (!db) throw new Error('db unavailable');
  const r: any = await (db as any).execute(
    `SELECT id FROM cities WHERE LOWER(name) = LOWER('${cityName.replace(/'/g, "''")}') LIMIT 1`,
  );
  const id = r?.rows?.[0]?.id || r?.[0]?.id;
  if (!id) throw new Error(`city '${cityName}' 미발견`);
  return Number(id);
}

const normAddr = (s: string | null | undefined): string =>
  (s || '').toLowerCase().replace(/[.,;:!?'"()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
const normName = (s: string | null | undefined): string => (s || '').trim().toLowerCase();

(async () => {
  await loadApiKeysFromDb();
  const cityName = parseCity(process.argv);
  const cityId = await findCityId(cityName);
  console.log(`=== Step 1 사전조사 = ${cityName} (city_id=${cityId}) ===`);

  const rows = await (db as any)
    .select()
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, cityId))
    .orderBy(asc(placeSeedRaw.id));
  const all = rows;
  const active = all.filter((r: any) =>
    !(r.phaseTags || []).some((t: string) => String(t).includes('archived-merge')),
  );
  console.log(`전체 = ${all.length} / 활성 = ${active.length}`);

  // 카테고리 분포
  const catMap: Record<string, number> = {};
  for (const r of active) catMap[r.seedCategory] = (catMap[r.seedCategory] || 0) + 1;

  // 13 SSOT 채움률
  const fields = [
    'nameEn', 'nameKo', 'nameLocal', 'address', 'latitude', 'longitude',
    'googlePlaceId', 'imageUrl', 'summaryKo', 'editorialSummary',
    'priceEur', 'googleReviewCount', 'googleMapsUri',
  ];
  const ssotFill: Record<string, number> = {};
  for (const f of fields) {
    ssotFill[f] = active.filter((r: any) =>
      r[f] != null && String(r[f]).trim() !== '',
    ).length;
  }

  // 5 단계 매칭 dry-run (= Union-Find)
  const parent = new Map<number, number>(active.map((r: any) => [r.id, r.id]));
  const find = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  let mPid = 0, mAddr = 0, mUri = 0, mCoord = 0, mName = 0;
  for (let i = 0; i < active.length; i++) {
    const a: any = active[i];
    for (let j = i + 1; j < active.length; j++) {
      const b: any = active[j];
      if (a.googlePlaceId && a.googlePlaceId === b.googlePlaceId) {
        if (find(a.id) !== find(b.id)) mPid++; union(a.id, b.id); continue;
      }
      if (a.address && b.address) {
        const na = normAddr(a.address), nb = normAddr(b.address);
        if (na.length >= 20 && na === nb) {
          // 새 정책 = 주소 + 이름 동시
          const aN = [normName(a.nameEn), normName(a.nameLocal), normName(a.nameKo)].filter(Boolean);
          const bN = [normName(b.nameEn), normName(b.nameLocal), normName(b.nameKo)].filter(Boolean);
          if (aN.some(x => bN.includes(x))) {
            if (find(a.id) !== find(b.id)) mAddr++; union(a.id, b.id); continue;
          }
        }
      }
      if (a.googleMapsUri && a.googleMapsUri === b.googleMapsUri) {
        if (find(a.id) !== find(b.id)) mUri++; union(a.id, b.id); continue;
      }
      if (a.latitude != null && b.latitude != null && a.longitude != null && b.longitude != null) {
        if (Math.abs(Number(a.latitude) - Number(b.latitude)) < 0.0001 &&
            Math.abs(Number(a.longitude) - Number(b.longitude)) < 0.0001) {
          if (find(a.id) !== find(b.id)) mCoord++; union(a.id, b.id); continue;
        }
      }
      const aN2 = [normName(a.nameEn), normName(a.nameLocal), normName(a.nameKo)].filter(Boolean);
      const bN2 = [normName(b.nameEn), normName(b.nameLocal), normName(b.nameKo)].filter(Boolean);
      if (aN2.some(x => bN2.includes(x))) {
        if (find(a.id) !== find(b.id)) mName++; union(a.id, b.id); continue;
      }
    }
  }

  const groups = new Map<number, any[]>();
  for (const r of active) {
    const root = find((r as any).id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(r);
  }
  const dupGroups = [...groups.values()].filter(g => g.length > 1);
  const absorbed = dupGroups.reduce((s, g) => s + g.length - 1, 0);

  const report = {
    cityName, cityId,
    total: all.length, active: active.length,
    categoryDist: catMap,
    ssotFill, ssotTotal: active.length,
    matching: { pid: mPid, addr: mAddr, uri: mUri, coord: mCoord, name: mName },
    dupGroups: dupGroups.length,
    absorbedRows: absorbed,
    afterMerge: active.length - absorbed,
    dupGroupsDetail: dupGroups.map(g => ({
      groupSize: g.length,
      rows: g.map((r: any) => ({
        id: r.id, cat: r.seedCategory, name: r.nameLocal || r.nameEn,
        addr: (r.address || '').substring(0, 60),
        coord: r.latitude && r.longitude ? `${r.latitude},${r.longitude}` : null,
        pid: r.googlePlaceId ? r.googlePlaceId.substring(0, 12) + '...' : null,
      })),
    })),
  };

  fs.mkdirSync('tmp', { recursive: true });
  const outFile = `tmp/${cityName.toLowerCase()}-presurvey.json`;
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log(`카테고리: ${JSON.stringify(catMap)}`);
  console.log(`매칭: PID=${mPid} addr=${mAddr} uri=${mUri} coord=${mCoord} name=${mName}`);
  console.log(`중복 그룹 = ${dupGroups.length} / 흡수 가능 = ${absorbed} 행`);
  console.log(`통합 후 추정 = ${active.length - absorbed} 행`);
  console.log(`💾 저장 = ${outFile}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
