// ⚠️ 수정금지(승인필요) 2026-05-20 = 외곽 부족 진단 (= 정기 점검)
// = 활성 식당 = 도심 (= 우편번호 75xxx 또는 좌표 ≤10km) vs 외곽 (= 10-100km) 분포
// = 사용자 SSOT [[reference_user_ssot_algorithm]] = 도심 + 외곽 적정 비율
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/checks/03-outskirt-coverage.ts --city-id=19
//
// 산출물 = docs/raw/{city_id}/_checks/03-outskirt-coverage-{YYYY-MM-DD}.json
// 시정 = prompts/04-outskirt-restaurant/run.ts 재호출 (= 외곽 부족 시)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const all = argv['all'] === 'true';
if (!cityId && !all) { console.error('Usage: --city-id=<N> 또는 --all'); process.exit(1); }

// 도시별 도심 우편번호 prefix 정의 (= 확장 가능)
const CITY_POSTAL_PREFIX: Record<number, string> = {
  19: '75',   // = Paris
  // 추가 도시 시 = 여기 등록
};

// 최소 외곽 비율 (= 사용자 SSOT)
const MIN_OUTSKIRT_RATIO = 0.05;  // = 5% 이상 = 외곽 day-trip 가능

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dlng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const cityIds: number[] = all
    ? (await c.query('SELECT id FROM cities WHERE name_en IS NOT NULL ORDER BY id')).rows.map((r: any) => r.id)
    : [cityId];

  const today = new Date().toISOString().slice(0, 10);
  const issues: any[] = [];

  for (const cid of cityIds) {
    const city = (await c.query('SELECT name_en, latitude, longitude FROM cities WHERE id=$1', [cid])).rows[0];
    if (!city) continue;

    const rows = (await c.query(`
      SELECT id, seed_category, name_en, address, latitude, longitude, distance_km_from_center
      FROM place_seed_raw
      WHERE city_id = $1 AND seed_category = 'restaurant'
        AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15','archived-merge-2026-05-20','user-delete'])
    `, [cid])).rows;

    if (rows.length === 0) continue;

    // 분석 = (a) 우편번호 prefix / (b) 좌표 거리
    const postalPrefix = CITY_POSTAL_PREFIX[cid];
    let core_postal = 0, outskirt_postal = 0;
    let core_coord = 0, outskirt_coord = 0;
    let nullCount = 0;

    for (const r of rows) {
      // 우편번호 기반
      if (postalPrefix && r.address) {
        const postalMatch = r.address.match(/\b(\d{5})\b/);
        if (postalMatch && postalMatch[1].startsWith(postalPrefix)) core_postal++;
        else outskirt_postal++;
      }
      // 좌표 기반 (= ≤10km core / 10-100km outskirt)
      if (r.latitude && r.longitude && city.latitude && city.longitude) {
        const distKm = haversineM(Number(city.latitude), Number(city.longitude), Number(r.latitude), Number(r.longitude)) / 1000;
        if (distKm <= 10) core_coord++;
        else outskirt_coord++;
      } else {
        nullCount++;
      }
    }

    const coordTotal = core_coord + outskirt_coord;
    const outskirtRatio = coordTotal > 0 ? outskirt_coord / coordTotal : 0;
    const isDeficient = outskirtRatio < MIN_OUTSKIRT_RATIO;

    const result = {
      city_id: cid,
      city_name: city.name_en,
      total_restaurants: rows.length,
      coord_null: nullCount,
      postal: postalPrefix ? { core: core_postal, outskirt: outskirt_postal, postal_prefix: postalPrefix } : null,
      coord: { core: core_coord, outskirt: outskirt_coord, outskirt_ratio: Math.round(outskirtRatio * 1000) / 10 + '%' },
      is_deficient: isDeficient,
      min_outskirt_ratio_required: `${MIN_OUTSKIRT_RATIO * 100}%`,
    };

    if (isDeficient) {
      issues.push(result);
      const outDir = path.join(ROOT, 'docs', 'raw', String(cid), '_checks');
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `03-outskirt-coverage-${today}.json`);
      fs.writeFileSync(outPath, JSON.stringify({ meta: { called_at: new Date().toISOString() }, ...result }, null, 2));
      console.log(`[${cid}] ${city.name_en} = ⚠️ 외곽 부족 = ${result.coord.outskirt_ratio} (= 최소 ${result.min_outskirt_ratio_required}) → ${outPath}`);
    } else {
      console.log(`[${cid}] ${city.name_en} = 외곽 충분 = ${result.coord.outskirt_ratio} ✓`);
    }
  }
  await c.end();

  console.log(`\n═══ 합계 ═══ ${cityIds.length} 도시 / 외곽 부족 ${issues.length} 도시`);
  if (issues.length > 0) {
    console.log(`\n시정 = prompts/04-outskirt-restaurant/run.ts 재호출 (= 외곽 식당 신규 발굴):`);
    for (const iss of issues) console.log(`  npx tsx .../04-outskirt-restaurant/run.ts --city-id=${iss.city_id} --hints="<${iss.city_name} day-trip 명소>"`);
  }
})();