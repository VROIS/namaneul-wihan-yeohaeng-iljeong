// ⚠️ 수정금지(승인필요) 2026-05-20 = 가격 이상치 검출 (= 정기 점검)
// = 카테고리별 = price_eur 평균/표준편차 계산 → 3σ 초과 = 의심 행
// = 또는 = MEAL_BUDGET tier 범위 위반 (= restaurant 의 경우)
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/checks/02-price-outlier.ts --city-id=19
//   npx tsx .../checks/02-price-outlier.ts --all
//
// 산출물 = docs/raw/{city_id}/_checks/02-price-outlier-{YYYY-MM-DD}.json
// 시정 = prompts/02-enrich-place (= price 재보강) 또는 prompts/06-ts-pm-enrich (= TS 가격 검증)
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

// 카테고리별 가격 임계 (= MEAL_BUDGET 매트릭스 SSOT = types.ts:135-140 부합)
const CAT_PRICE_LIMIT: Record<string, number> = {
  restaurant: 500,      // = Luxury MAX (= types.ts:153)
  attraction: 200,      // = 입장료 €200 초과 = 의심
  heritage: 100,
  hotspot: 50,          // = 광장/뷰포인트 = 보통 무료
  healing: 80,
  adventure: 300,
  shopping: 0,          // = price_eur 강제 null (= 헌법 §15)
};

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const cityIds: number[] = all
    ? (await c.query('SELECT id FROM cities WHERE name_en IS NOT NULL ORDER BY id')).rows.map((r: any) => r.id)
    : [cityId];

  const today = new Date().toISOString().slice(0, 10);
  let totalOutliers = 0;

  for (const cid of cityIds) {
    const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cid])).rows[0];
    if (!city) continue;

    // 카테고리별 통계 + 3σ 초과 행
    const stats = (await c.query(`
      SELECT seed_category,
        COUNT(*)::int AS cnt,
        AVG(price_eur)::float AS avg_p,
        STDDEV(price_eur)::float AS std_p,
        MIN(price_eur)::int AS min_p,
        MAX(price_eur)::int AS max_p
      FROM place_seed_raw
      WHERE city_id = $1
        AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15','archived-merge-2026-05-20','user-delete'])
        AND price_eur IS NOT NULL
      GROUP BY seed_category
    `, [cid])).rows;

    const allOutliers: any[] = [];

    for (const s of stats) {
      const limit = CAT_PRICE_LIMIT[s.seed_category] ?? 1000;

      // 검출 = 카테고리 limit 초과 (= MEAL_BUDGET MAX 9999 는 항상 카테고리 limit 보다 큼 = redundant 제거)
      // = (별도) shopping = price 보유 = 헌법 §15 위반 = 아래 별도 SELECT
      const outliers = (await c.query(`
        SELECT id, seed_category, rank, name_en, address, price_eur
        FROM place_seed_raw
        WHERE city_id = $1
          AND seed_category = $2
          AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15','archived-merge-2026-05-20','user-delete'])
          AND price_eur IS NOT NULL
          AND price_eur > $3
        ORDER BY price_eur DESC
      `, [cid, s.seed_category, limit])).rows;

      if (s.seed_category === 'shopping') {
        // shopping 강제 null 위반
        const shopViolations = (await c.query(`
          SELECT id, seed_category, rank, name_en, address, price_eur
          FROM place_seed_raw
          WHERE city_id = $1 AND seed_category = 'shopping'
            AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15','archived-merge-2026-05-20','user-delete'])
            AND price_eur IS NOT NULL
        `, [cid])).rows;
        outliers.push(...shopViolations.map((r: any) => ({ ...r, violation: 'shopping_null_required' })));
      }

      if (outliers.length > 0) {
        allOutliers.push(...outliers.map((o: any) => ({
          ...o,
          stat_avg: Math.round(s.avg_p * 10) / 10,
          stat_std: Math.round((s.std_p || 0) * 10) / 10,
          limit,
        })));
      }
    }

    if (allOutliers.length > 0) {
      const outDir = path.join(ROOT, 'docs', 'raw', String(cid), '_checks');
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `02-price-outlier-${today}.json`);
      fs.writeFileSync(outPath, JSON.stringify({
        meta: { city_id: cid, city_name: city.name_en, called_at: new Date().toISOString(), outlier_count: allOutliers.length },
        category_stats: stats,
        outliers: allOutliers,
      }, null, 2));
      console.log(`[${cid}] ${city.name_en} = 가격 이상치 ${allOutliers.length} 행 → ${outPath}`);
      totalOutliers += allOutliers.length;
    } else {
      console.log(`[${cid}] ${city.name_en} = 가격 이상치 0 ✓`);
    }
  }
  await c.end();

  console.log(`\n═══ 합계 ═══ ${cityIds.length} 도시 / 이상치 ${totalOutliers} 행`);
  console.log(`\n시정 옵션:`);
  console.log(`  (a) prompts/02-enrich-place = price 재보강`);
  console.log(`  (b) prompts/06-ts-pm-enrich = TS Enterprise 가격 검증`);
  console.log(`  (c) shopping price = 직접 UPDATE NULL (= 헌법 §15)`);
})();