// ⚠️ 수정금지(승인필요) 2026-06-08 사용자 승인 = 07-merge-dups 를 통일 matcher.ts(7단계)로 정합
//   = 내부 중복체크도 입력시 dedup(upsertPlace/트리거)과 동일 판정 (= 자체 옛 인라인 매처 폐기, [[feedback_systemic_not_bandaid]]).
//   = 활성 행 pairwise = matchCandidate 7단계 → 불변(confirmed)=중복그룹(union-find) / 가변(suspect)=검수 2행그룹.
//   matched_tier: 0=pid 1=uri 2=address(+로컬이름) 3=coords10m 4=name_local (= 불변=확정=병합대상) / 5=name_en 6=name_ko (= 가변=의심=검수)
//   ⚠️ 병합 실행(post-process keep 원칙: PID>상세이름>풍부도>rank, 삭제)은 무수정 = 출력 포맷(groups: group_key/matched_tier/rows) 호환 유지.
//
// 호출: npx tsx .../07-merge-dups/run.ts --city-id=19
// 산출물 = docs/raw/{city_id}/07-merge-dups-groups-{YYYY-MM-DD}.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}

const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
if (!cityId) { console.error('Usage: --city-id=<N>'); process.exit(1); }

// matchedBy → tier 번호/라벨 (= post-process --apply-tiers 호환). 0~4 = 불변(확정) / 5·6 = 가변(의심)
const TIER: Record<string, number> = { pid: 0, uri: 1, address: 2, coords: 3, name_local: 4, name_en: 5, name_ko: 6 };
const TIER_LABEL = ['PID', 'URI', '주소+로컬이름', '좌표10m', '로컬이름(불변)', '영어명(의심)', '한국어명(의심)'];

(async () => {
  // 통일 매처 (= upsertPlace/트리거와 동일 1벌)
  const { matchCandidate } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/matcher.ts')).href);

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cityId])).rows[0];
  const rows = (await c.query(`
    SELECT id, city_id AS "cityId", name_en AS "nameEn", name_local AS "nameLocal", name_ko AS "nameKo",
           address, latitude::float8 AS latitude, longitude::float8 AS longitude,
           google_place_id AS "googlePlaceId", google_maps_uri AS "googleMapsUri",
           seed_category, rank, summary_ko,
           CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 1 ELSE 0 END AS has_image
    FROM place_seed_raw WHERE city_id = $1 ORDER BY id`, [cityId])).rows;
  await c.end();

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`═══ 07-merge-dups dry-run (7단계 통일 matcher.ts) ═══`);
  console.log(`city_id = ${cityId} (${city?.name_en}), 활성 = ${rows.length}`);

  // union-find = 불변(confirmed) 중복 클러스터
  const parent = new Map<number, number>();
  const find = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const union = (a: number, b: number) => { parent.set(find(a), find(b)); };
  for (const r of rows) parent.set(r.id, r.id);
  const clusterTier = new Map<number, number>(); // rootId → 최선(min) tier
  const suspectPairs: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const { match, matchedBy, tier } = matchCandidate(rows[i], [rows[j]]);
      if (!match) continue;
      const t = TIER[matchedBy as string];
      if (tier === 'confirmed') {
        union(rows[i].id, rows[j].id);
        const root = find(rows[i].id);
        clusterTier.set(root, Math.min(clusterTier.get(root) ?? 99, t));
      } else if (tier === 'suspect') {
        suspectPairs.push({ a: rows[i], b: rows[j], t });
      }
    }
  }

  const slim = (r: any) => ({
    id: r.id, name_en: r.nameEn, name_local: r.nameLocal, name_ko: r.nameKo, address: r.address,
    seed_category: r.seed_category, rank: r.rank, has_pid: !!r.googlePlaceId, has_image: !!r.has_image, summary_ko: r.summary_ko,
  });

  // 불변 클러스터 → 그룹
  const clusters = new Map<number, any[]>();
  for (const r of rows) { const root = find(r.id); if (!clusters.has(root)) clusters.set(root, []); clusters.get(root)!.push(r); }
  const groups: any[] = [];
  for (const [root, g] of clusters) {
    if (g.length < 2) continue;
    const mt = clusterTier.get(root) ?? 0;
    groups.push({ group_key: `merge:${root}`, matched_tier: mt, tier_label: TIER_LABEL[mt], row_count: g.length, rows: g.map(slim) });
  }
  // 가변(의심) = 검수용 2행 그룹 (자동병합 X, 같은 클러스터로 이미 묶였으면 스킵)
  for (const sp of suspectPairs) {
    if (find(sp.a.id) === find(sp.b.id)) continue;
    groups.push({ group_key: `suspect:${sp.a.id}-${sp.b.id}`, matched_tier: sp.t, tier_label: TIER_LABEL[sp.t], row_count: 2, rows: [slim(sp.a), slim(sp.b)] });
  }
  groups.sort((a, b) => a.matched_tier - b.matched_tier);

  const outPath = path.join(outDir, `07-merge-dups-groups-${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    meta: { city_id: cityId, called_at: new Date().toISOString(), active_rows: rows.length, group_count: groups.length, matcher: '7step-matcher.ts' },
    groups,
  }, null, 2));

  const byTier: Record<number, number> = {};
  groups.forEach((g) => { byTier[g.matched_tier] = (byTier[g.matched_tier] || 0) + 1; });
  console.log(`\n═══ 그룹 = ${groups.length} (tier 0~4 = 불변=확정 / 5·6 = 가변=의심 검수) ═══`);
  for (let t = 0; t <= 6; t++) if (byTier[t]) console.log(`  tier${t} ${TIER_LABEL[t]} = ${byTier[t]} 그룹${t >= 5 ? ' (의심=검수)' : ''}`);
  console.log(`\n✓ 저장 = ${outPath}`);
  console.log(`다음(검수 후) = post-process --apply-tiers=0,1,2,3,4 (불변 자동병합) / 의심(5,6) = --apply-groups 명시만`);
})();
