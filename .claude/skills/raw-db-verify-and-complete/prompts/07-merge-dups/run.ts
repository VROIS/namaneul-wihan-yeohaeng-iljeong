// ⚠️ 수정금지(승인필요) 2026-05-20 = 07-merge-dups dry-run 실행
// = 활성 행 × 활성 행 5 단계 매칭 → 의심 그룹 list 저장
// = upsertPlace v2 + 트리거 v2 의 매칭 알고리즘 inline 적용 (= Gemini 호출 X = 결정론적)
//
// 호출:
//   npx tsx .../07-merge-dups/run.ts --city-id=19
//
// 산출물 = docs/raw/{city_id}/07-merge-dups-groups-{YYYY-MM-DD}.json
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
if (!cityId) { console.error('Usage: --city-id=<N>'); process.exit(1); }

// 이름 정규화 (= 9 조합 매칭용)
function normName(s: string | null): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9가-힣]/g, '').trim();
}

// 풀 주소 정규화
function normAddress(s: string | null): string {
  if (!s) return '';
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[,.]/g, '').trim();
}

// haversine
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
  const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cityId])).rows[0];

  const rows = (await c.query(`
    SELECT id, name_en, name_local, name_ko, address, latitude, longitude,
           google_place_id, google_maps_uri, seed_category, rank,
           summary_ko, editorial_summary,
           CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 ELSE 0 END AS has_image
    FROM place_seed_raw
    WHERE city_id = $1
    ORDER BY id
  `, [cityId])).rows;
  await c.end();

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`═══ 07-merge-dups dry-run ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}), 활성 = ${rows.length}`);

  // 5 단계 매칭 dry-run
  const groups: Record<string, any[]> = {};
  const tier: Record<string, number> = {}; // group_key → tier number (= 0/1/2/3/4)

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      let matched: number | null = null;
      let key = '';

      // 0순위 = PID
      if (a.google_place_id && b.google_place_id && a.google_place_id === b.google_place_id) {
        matched = 0; key = `pid:${a.google_place_id}`;
      }
      // 1순위 = 풀 주소 + 이름 9 조합 동시
      else if (a.address && b.address && normAddress(a.address) === normAddress(b.address)) {
        const aNames = [normName(a.name_en), normName(a.name_local), normName(a.name_ko)].filter(Boolean);
        const bNames = [normName(b.name_en), normName(b.name_local), normName(b.name_ko)].filter(Boolean);
        if (aNames.some(an => bNames.includes(an))) {
          matched = 1; key = `addr+name:${normAddress(a.address)}|${aNames[0]}`;
        }
      }
      // 2순위 = google_maps_uri
      else if (a.google_maps_uri && b.google_maps_uri && a.google_maps_uri === b.google_maps_uri) {
        matched = 2; key = `uri:${a.google_maps_uri}`;
      }
      // 3순위 = 좌표 10m
      else if (a.latitude && b.latitude && a.longitude && b.longitude) {
        const d = haversine(Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude));
        if (d <= 10) {
          matched = 3; key = `coord10m:${a.id}-${b.id}`;
        }
      }
      // 4순위 = 이름 LOWER (= 보조 = 체인 위험)
      if (matched === null) {
        const aNames = [normName(a.name_en), normName(a.name_local), normName(a.name_ko)].filter(Boolean);
        const bNames = [normName(b.name_en), normName(b.name_local), normName(b.name_ko)].filter(Boolean);
        if (aNames.length && bNames.length && aNames.some(an => bNames.includes(an))) {
          matched = 4; key = `name:${aNames[0]}`;
        }
      }

      if (matched !== null) {
        if (!groups[key]) { groups[key] = []; tier[key] = matched; }
        if (!groups[key].find(r => r.id === a.id)) groups[key].push(a);
        if (!groups[key].find(r => r.id === b.id)) groups[key].push(b);
      }
    }
  }

  const groupList = Object.entries(groups).map(([key, rows]) => ({
    group_key: key,
    matched_tier: tier[key],
    tier_label: ['PID', '주소+이름 9 조합', 'google_maps_uri', '좌표 10m', '이름 LOWER (= 보조)'][tier[key]],
    row_count: rows.length,
    rows: rows.map(r => ({
      id: r.id, name_en: r.name_en, name_local: r.name_local, name_ko: r.name_ko,
      address: r.address,
      seed_category: r.seed_category, rank: r.rank,
      has_pid: !!r.google_place_id,
      has_image: !!r.has_image,
      summary_ko: r.summary_ko,
    })),
  }));

  // tier 순서 정렬 (= 명확 그룹 먼저)
  groupList.sort((a, b) => a.matched_tier - b.matched_tier);

  const outPath = path.join(outDir, `07-merge-dups-groups-${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    meta: { city_id: cityId, called_at: new Date().toISOString(), active_rows: rows.length, group_count: groupList.length },
    groups: groupList,
  }, null, 2));

  // 통계
  const byTier: Record<number, number> = {};
  groupList.forEach(g => { byTier[g.matched_tier] = (byTier[g.matched_tier] || 0) + 1; });
  console.log(`\n═══ 매칭 그룹 = ${groupList.length} ═══`);
  for (const t of [0, 1, 2, 3, 4]) {
    if (byTier[t]) console.log(`  ${['PID', '주소+이름 9 조합', 'google_maps_uri', '좌표 10m', '이름 LOWER (= 보조)'][t]} = ${byTier[t]} 그룹`);
  }
  console.log(`\n✓ 저장 = ${outPath}`);
  console.log(`\n⚠️ 사용자 cc2 검수 필수 = 위 파일 검토 후 = post-process.ts 호출:`);
  console.log(`  npx tsx .../07-merge-dups/post-process.ts --city-id=${cityId} --date=${today} --apply-tiers=0,1,2,3 [--apply-groups=group_key1,group_key2,...]`);
})();