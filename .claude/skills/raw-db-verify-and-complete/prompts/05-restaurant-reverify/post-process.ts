// ⚠️ 수정금지(승인필요) 2026-06-01 = 05-restaurant-reverify 후처리 = 폐업 삭제 + 컬럼 덮어쓰기
// = docs/raw/{city_id}/{date}_05-restaurant-reverify_batch{N}.json 읽음 →
//     operating=false → 완전 DELETE (= 사용자 SSOT 2026-06-01)
//     operating=true  → latitude/longitude/name_local/address/price_eur 덮어쓰기 (= Gemini 최신, COALESCE 새 우선)
// = id 기준 직접 UPDATE/DELETE (= 알려진 행 = 매칭 불필요 = 중복위험 0 = §14 목적 충족)
//   + 단일 트랜잭션 (BEGIN → 변경 → 건수 검증 → COMMIT/ROLLBACK) (= feedback_transaction_atomicity, v1 179→0 사고 방지)
// 호출:
//   npx tsx .../05-restaurant-reverify/post-process.ts --city-id=19 --date=2026-06-01 [--apply]
//   (--apply 없으면 = dry-run = 쓰기 0)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url'; // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = latestVersionedByBase 동적 import 용 pathToFileURL 추가

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; } }

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const apply = argv['apply'] === 'true';
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> [--apply]'); process.exit(1); }

(async () => {
  const rawDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  // ⚠️ 수정금지(승인필요) — raw 파일명 표준화: 날짜앞 {date}_NN-step_content 형식
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = latestVersionedByBase 로 같은 batch 의 _N 중복 축약(batchN별 최신 1개) = 중복집계 0
  const { latestVersionedByBase } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);
  const files = latestVersionedByBase(fs.readdirSync(rawDir).filter(f => f.startsWith(`${date}_05-restaurant-reverify_batch`) && f.endsWith('.json')));
  if (!files.length) { console.error(`✗ ${rawDir}/${date}_05-restaurant-reverify_batch*.json 미존재 = run.ts 먼저`); process.exit(1); }

  const all: any[] = [];
  for (const f of files) { const j = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf-8')); all.push(...(j.parsed || [])); }
  const dels = all.filter(x => x.operating === false && x.id);
  const ups = all.filter(x => x.operating !== false && x.id);
  console.log(`═══ 05-restaurant-reverify post-process (city=${cityId}, date=${date}) ═══`);
  console.log(`배치 ${files.length} → 파싱 ${all.length} | 삭제(폐업) ${dels.length} | 덮어쓰기 ${ups.length}\n`);

  const pg = await import('pg');
  const c = new pg.default.Client({ connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // 현재 상태 (= 검증 base)
  const before = (await c.query(`SELECT count(*)::int n FROM place_seed_raw WHERE city_id=$1 AND seed_category='restaurant'`, [cityId])).rows[0].n;
  const delIds = dels.map(d => d.id);
  const delExist = delIds.length ? (await c.query(`SELECT id, name_en FROM place_seed_raw WHERE id = ANY($1::int[])`, [delIds])).rows : [];

  console.log(`현재 식당 = ${before} 곳`);
  console.log(`\n🔴 삭제 예정 (폐업 ${delExist.length}/${dels.length} 존재):`);
  delExist.forEach((r: any) => console.log(`  - ${r.id} ${r.name_en}`));

  // 가격 변경 미리보기 (= 표본)
  const upIds = ups.map(u => u.id);
  const cur = new Map((upIds.length ? (await c.query(`SELECT id, price_eur::float8 p, (latitude IS NULL) noc FROM place_seed_raw WHERE id = ANY($1::int[])`, [upIds])).rows : []).map((r: any) => [r.id, r]));
  const priceChanged = ups.filter(u => u.price_eur != null && cur.get(u.id) && Math.abs((cur.get(u.id) as any).p - u.price_eur) >= 5);
  const coordFilled = ups.filter(u => u.lat && cur.get(u.id) && (cur.get(u.id) as any).noc);
  console.log(`\n✏️ 덮어쓰기 ${ups.length} 곳 = 좌표 신규충전 ${coordFilled.length} / 가격변경(±5€↑) ${priceChanged.length}`);
  console.log(`  가격 변경 표본:`);
  priceChanged.slice(0, 8).forEach(u => console.log(`    ${u.id} ${u.name_local}: €${(cur.get(u.id) as any).p} → €${u.price_eur}`));

  if (!apply) {
    console.log(`\n=== DRY-RUN (쓰기 0) === 실행하려면 --apply`);
    await c.end(); return;
  }

  // ── 실 반영 = 단일 트랜잭션 ──
  console.log(`\n=== APPLY = 트랜잭션 시작 ===`);
  await c.query('BEGIN');
  try {
    let delN = 0;
    if (delIds.length) delN = (await c.query(`DELETE FROM place_seed_raw WHERE id = ANY($1::int[]) AND city_id=$2 AND seed_category='restaurant'`, [delIds, cityId])).rowCount || 0;
    let upN = 0;
    for (const u of ups) {
      const r = await c.query(
        `UPDATE place_seed_raw SET
           latitude = COALESCE($2::real, latitude), longitude = COALESCE($3::real, longitude),
           name_local = COALESCE($4, name_local), address = COALESCE($5, address),
           price_eur = COALESCE($6::real, price_eur)
         WHERE id=$1 AND city_id=$7 AND seed_category='restaurant'`,
        [u.id, u.lat ?? null, u.lng ?? null, u.name_local ?? null, u.address ?? null, u.price_eur ?? null, cityId]);
      upN += r.rowCount || 0;
    }
    const after = (await c.query(`SELECT count(*)::int n FROM place_seed_raw WHERE city_id=$1 AND seed_category='restaurant'`, [cityId])).rows[0].n;
    // 검증 가드 = 예상 (before - 삭제 = after) 불일치 시 ROLLBACK
    const expected = before - delN;
    if (after !== expected) { await c.query('ROLLBACK'); console.error(`✗ 건수 불일치 (after=${after} != expected=${expected}) = ROLLBACK`); await c.end(); process.exit(1); }
    await c.query('COMMIT');
    console.log(`✓ COMMIT = 삭제 ${delN} / 덮어쓰기 ${upN} / 식당 ${before} → ${after}`);
  } catch (e: any) { await c.query('ROLLBACK'); console.error(`✗ 오류 = ROLLBACK:`, e.message); await c.end(); process.exit(1); }

  // ── 최종 식당 분포 보고 ──
  const dist = (await c.query(
    `SELECT count(*)::int total,
       count(*) FILTER (WHERE latitude IS NOT NULL)::int coord,
       count(*) FILTER (WHERE price_eur IS NOT NULL)::int price,
       count(*) FILTER (WHERE price_eur<=20)::int p20, count(*) FILTER (WHERE price_eur>20 AND price_eur<=40)::int p40,
       count(*) FILTER (WHERE price_eur>40 AND price_eur<=80)::int p80, count(*) FILTER (WHERE price_eur>80)::int p80p,
       count(*) FILTER (WHERE google_place_id IS NOT NULL AND google_place_id<>'')::int pid
     FROM place_seed_raw WHERE city_id=$1 AND seed_category='restaurant'`, [cityId])).rows[0];
  console.log(`\n═══ 최종 식당 분포 (city=${cityId}) ═══`);
  console.log(`  총 ${dist.total} | 좌표 ${dist.coord} | 가격 ${dist.price} | PID검증 ${dist.pid}`);
  console.log(`  가격대: ≤€20=${dist.p20} / €20-40=${dist.p40} / €40-80=${dist.p80} / >€80=${dist.p80p}`);
  await c.end();
})();
