// ⚠️ 영구 컴포넌트 2026-06-12 = 사용자 SSOT = price_eur 단일 컬럼 정제 (= 입장료/식비/체험비 = price_eur 1칸 강제, 다른 가격필드 없음)
// = ⚠️ 사용자 SSOT 2026-06-12 = "항상 top20 안 행만 보라. 다른 랭킹은 신경쓰지 마." = rank ≤ TOP_N 가드 강제 (= 여정 노출 행만 = 오염 하위 garbage 자동 제외)
// = 두 정제 (= 사용자 명시 범위):
//   (A) 비식당 입장료 카테고리(heritage/attraction/hotspot/healing/adventure) rank≤20 price_eur NULL → 0 (= 무료 = 화면 'free', 매트릭스 폴백 차단)
//       ⚠️ shopping = 입장료 개념 자체 없음 = NULL 유지(화면 가격 미표시). restaurant = 실값없으면 매트릭스 폴백이 정당 = 손대지 않음. (= 사용자 SSOT 2026-06-12)
//   (B) 비식당인데 요약이 명백히 식비(타파스/맛볼/식사)인 오염 행 = 보고만 (= --fix-food 로 명시 정정). 입장료칸에 Gemini 식비 오입력.
// = BTS 3종 제외. 0 ≠ NULL 의미 구분 유지(0=확정무료, NULL=미상). DELETE 0.
// 호출: npx tsx server/services/fill/price-cleanup.ts --city-id=37 [--apply]   (--apply = (A) NULL→0 적용)
//       npx tsx server/services/fill/price-cleanup.ts --city-id=37 --fix-food [--apply]   (= (B) 식비오염 정정도 함께)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const apply = argv['apply'] === 'true';
const fixFood = argv['fix-food'] === 'true';
if (!cityId) { console.error('Usage: --city-id=<N> [--fix-food] [--apply]'); process.exit(1); }

// 입장료 개념이 있는 비식당 카테고리 (= NULL→0 무료 처리 대상). shopping/restaurant 제외(사용자 SSOT).
const ENTRANCE_CATS = ['heritage', 'attraction', 'hotspot', 'healing', 'adventure'];
// ⚠️ 사용자 SSOT 2026-06-12 = top20 안 행만 정제 (= 여정 노출 한계 = 3일×6활동 ≤ 18 < 20. 하위 rank = 오염 garbage = 무시)
const TOP_N = 20;

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cityId])).rows[0];
  if (!city) { await c.end(); console.error(`✗ city ${cityId} 미존재`); process.exit(1); }
  console.log(`═══ price-cleanup (city ${cityId} ${city.name_en}) ${apply ? '[APPLY]' : '[DRY]'} ═══`);

  // (A) 비식당 입장료 카테고리 rank≤TOP_N NULL → 0
  const nullRows = (await c.query(
    `SELECT seed_category, count(*)::int n FROM place_seed_raw
     WHERE city_id=$1 AND seed_category = ANY($2::text[]) AND price_eur IS NULL AND rank <= $3 GROUP BY 1 ORDER BY 2 DESC`,
    [cityId, ENTRANCE_CATS, TOP_N]
  )).rows;
  const totalNull = nullRows.reduce((s: number, r: any) => s + r.n, 0);
  console.log(`\n[A] 비식당 입장료 NULL → 0 (대상: ${ENTRANCE_CATS.join('/')}, rank≤${TOP_N})`);
  for (const r of nullRows) console.log(`  ${r.seed_category}: ${r.n}곳`);
  console.log(`  합계 ${totalNull}곳 → 0(무료) 처리`);
  console.log(`  (제외: shopping=입장료 개념 없음 / restaurant=매트릭스 폴백 정당 / rank>${TOP_N}=여정 미노출)`);

  // (B) 비식당 식비 오염 (요약에 음식 언급 + price>0, rank≤TOP_N) = 보고
  const foodRows = (await c.query(
    `SELECT id, name_en, seed_category, rank, price_eur, summary_ko FROM place_seed_raw
     WHERE city_id=$1 AND seed_category = ANY($2::text[]) AND price_eur > 0 AND rank <= $3
       AND (summary_ko ILIKE '%타파스%' OR summary_ko ILIKE '%맛볼%' OR summary_ko ILIKE '%식사%' OR summary_ko ILIKE '%스트리트 푸드%' OR summary_ko ILIKE '%먹거리%')
     ORDER BY seed_category, rank`,
    [cityId, ENTRANCE_CATS, TOP_N]
  )).rows;
  console.log(`\n[B] 비식당 식비 오염 의심 (입장료칸에 식비, rank≤${TOP_N}) = ${foodRows.length}곳 ${fixFood ? '(--fix-food = 0 정정)' : '(보고만)'}`);
  for (const r of foodRows) console.log(`  [${r.seed_category}] rank=${r.rank} €${r.price_eur} | ${r.name_en} — ${(r.summary_ko || '').slice(0, 38)}`);

  if (!apply) { console.log('\n=== DRY (--apply 로 실행) ==='); await c.end(); return; }

  await c.query('BEGIN');
  try {
    const a = await c.query(
      `UPDATE place_seed_raw SET price_eur = 0, updated_at = now()
       WHERE city_id=$1 AND seed_category = ANY($2::text[]) AND price_eur IS NULL AND rank <= $3`,
      [cityId, ENTRANCE_CATS, TOP_N]
    );
    console.log(`\n✓ [A] NULL→0 적용: ${a.rowCount}행`);
    if (fixFood && foodRows.length) {
      const ids = foodRows.map((r: any) => r.id);
      const b = await c.query(`UPDATE place_seed_raw SET price_eur = 0, updated_at = now() WHERE id = ANY($1::int[])`, [ids]);
      console.log(`✓ [B] 식비오염 → 0 정정: ${b.rowCount}행 (입장료 = 무료, 식비는 식당 카테고리에서만)`);
    }
    await c.query('COMMIT');
    console.log('✓ COMMIT (DELETE 0, shopping/restaurant 무변경)');
  } catch (e: any) {
    await c.query('ROLLBACK');
    console.error('✗ ROLLBACK:', e.message);
    await c.end(); process.exit(1);
  }
  await c.end();
})();
