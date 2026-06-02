// ⚠️ 수정금지(승인필요) 2026-06-02 = 13-restaurant-summary 후처리 = 요약2개 UPDATE + 가격 null 만 채움(TS 보존) + 가격 검증
// = 13-restaurant-summary-batch{N}-{date}.json 읽음 → id 기준 직접 UPDATE (= 알려진 행 = 매칭 불필요)
//   · summary_ko / editorial_summary = COALESCE(새, 옛) (= 비어있던 87곳 채움)
//   · price_eur = COALESCE(옛, Gemini) (= TS 실값 보존 / null 행만 Gemini 상한값 채움)
//   · 가격 검증 = Gemini blind 추정 vs TS 실값 차이 분포 (= 신뢰도 리포트)
//   + 단일 트랜잭션 (BEGIN → 건수 검증 → COMMIT/ROLLBACK, feedback_transaction_atomicity)
// 호출:
//   npx tsx .../13-restaurant-summary/post-process.ts --city-id=19 --date=2026-06-02 [--apply]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  const files = fs.readdirSync(rawDir).filter(f => f.startsWith('13-restaurant-summary-batch') && f.endsWith(`-${date}.json`)).sort();
  if (!files.length) { console.error(`✗ ${rawDir}/13-restaurant-summary-batch*-${date}.json 미존재 = run.ts 먼저`); process.exit(1); }
  const all: any[] = [];
  for (const f of files) { const j = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf-8')); all.push(...(j.parsed || [])); }
  const valid = all.filter(x => x.id && (x.summary_ko || x.editorial_summary));
  console.log(`═══ 13-restaurant-summary post-process (city=${cityId}, ${date}) ═══`);
  console.log(`배치 ${files.length} → 파싱 ${all.length} / 유효(요약 있음) ${valid.length}`);

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const ids = valid.map(v => v.id);
  const cur = new Map((await c.query(`SELECT id, price_eur::float8 p, (summary_ko IS NOT NULL AND summary_ko<>'') has_sum FROM place_seed_raw WHERE id = ANY($1::int[])`, [ids])).rows.map((r: any) => [r.id, r]));

  // 가격 검증 = Gemini blind vs TS 실값 (TS 있는 행만)
  let d0 = 0, d5 = 0, d10 = 0, d10p = 0, priceFill = 0;
  for (const v of valid) {
    const row: any = cur.get(v.id);
    if (!row) continue;
    if (row.p == null) { if (v.price_per_person_eur != null) priceFill++; continue; }
    if (v.price_per_person_eur == null) continue;
    const diff = Math.abs(v.price_per_person_eur - row.p);
    if (diff === 0) d0++; else if (diff <= 5) d5++; else if (diff <= 10) d10++; else d10p++;
  }
  const cmpN = d0 + d5 + d10 + d10p;
  console.log(`\n[가격 검증] Gemini blind vs TS 실값 (${cmpN}곳):`);
  console.log(`  정확(Δ0) ${d0} / ±€5 ${d5} / ±€10 ${d10} / >€10 ${d10p}  = ±€5내 ${Math.round((d0 + d5) / cmpN * 100)}%`);
  console.log(`[가격 채움] TS 없는 행 = ${priceFill}곳 = Gemini 상한값으로 채움 (= TS ${cmpN}곳은 보존)`);
  console.log(`[요약 채움] ${valid.length}곳 = summary_ko + editorial_summary`);

  if (!apply) { console.log(`\n=== DRY-RUN (쓰기 0) === 실행: --apply`); await c.end(); return; }

  console.log(`\n=== APPLY = 트랜잭션 ===`);
  await c.query('BEGIN');
  try {
    let upd = 0;
    for (const v of valid) {
      const r = await c.query(
        `UPDATE place_seed_raw SET
           summary_ko = COALESCE(NULLIF($2,''), summary_ko),
           editorial_summary = COALESCE(NULLIF($3,''), editorial_summary),
           price_eur = COALESCE(price_eur, $4::real)
         WHERE id=$1 AND city_id=$5 AND seed_category='restaurant'`,
        [v.id, v.summary_ko || null, v.editorial_summary || null, v.price_per_person_eur ?? null, cityId]);
      upd += r.rowCount || 0;
    }
    if (upd !== valid.length) { await c.query('ROLLBACK'); console.error(`✗ 건수 불일치 (upd=${upd} != ${valid.length}) = ROLLBACK`); await c.end(); process.exit(1); }
    await c.query('COMMIT');
    console.log(`✓ COMMIT = ${upd}곳 요약 채움 (+ 가격 null ${priceFill}곳 Gemini 채움 / TS 가격 보존)`);
  } catch (e: any) { await c.query('ROLLBACK'); console.error(`✗ ROLLBACK:`, e.message); await c.end(); process.exit(1); }
  await c.end();
})();
