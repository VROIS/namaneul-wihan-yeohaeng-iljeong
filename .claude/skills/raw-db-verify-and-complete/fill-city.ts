// ⚠️ 수정금지(승인필요) 2026-06-04 = fillCity 단일 오케스트레이터 (= 헌법 §16 Phase B = 사용자 SSOT)
// = 한 도시 raw DB 채우기 전 파이프라인을 "한 줄"로. 도시ID만 바꾸면 300번 동일 동작.
// = 모든 쓰기는 단일 5단계 매처(shared/matcher.ts) + upsertPlace 통과 (= 신규 INSERT / 기존 UPDATE 자동 분기).
//
// 단계 (= 전부 기존 컴포넌트 = 재발명 0):
//   ① 발굴   = 12-ts-discover-pool (6 비식당 카테고리 강제사각형 searchText) → match/upsert
//   ② 큐레이션 = 02-enrich-place --defects-only (4요소 결함행 → Gemini 한국어 2카피 + 가격)
//   ③ TS검증+이미지 = 06-ts-pm-enrich (PID NULL/이미지 NULL → TS top1 + PhotoMedia→Storage)
//   ④ 검증   = 6 카테고리 TOP20 칸별 채움률 리포트 (= 비용 0, DB SELECT)
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/fill-city.ts --city-id=19            # = dry (무료 미리보기 = 계획+비용+현재 리포트, API 호출 0)
//   npx tsx .claude/skills/raw-db-verify-and-complete/fill-city.ts --city-id=19 --apply    # = 전체 실행 (API 호출 + DB 쓰기)
//   옵션: --lang=fr (현지명 언어, 기본 ko) / --only=discover,curate,enrich,verify (단계 선택) / --zone=downtown
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const SKILL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL, '../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const apply = argv['apply'] === 'true';
const lang = argv['lang'] ? String(argv['lang']) : 'ko';
const zone = argv['zone'] ? String(argv['zone']) : 'downtown';
const only = argv['only'] ? String(argv['only']).split(',').map((s) => s.trim()) : ['discover', 'curate', 'enrich', 'verify'];
const today = new Date().toISOString().slice(0, 10);
if (!cityId) { console.error('Usage: --city-id=<N> [--apply] [--lang=fr] [--zone=downtown] [--only=discover,curate,enrich,verify]'); process.exit(1); }

const CATS = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping'];
const P = (rel: string) => path.join(SKILL, rel);

// 컴포넌트 CLI 실행 (= 실패 시 중단 = 부분 적용 방지)
function run(label: string, script: string, args: string[]) {
  console.log(`\n━━━━━━ ${label} ━━━━━━`);
  const r = spawnSync('npx', ['tsx', P(script), ...args], { stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error(`✗ ${label} 실패 (exit ${r.status}) = 중단`); process.exit(1); }
}

(async () => {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║ fillCity = city ${cityId} | ${apply ? 'APPLY (쓰기)' : 'DRY (미리보기)'} | lang=${lang} | only=${only.join(',')}`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);

  if (!apply) {
    // ── DRY = 무료 = 계획 + 비용 추정 + 현재 14요소 리포트 (API 호출 0) ──
    console.log(`\n[계획] --apply 시 실행 단계:`);
    if (only.includes('discover')) console.log(`  ① 발굴 = 12-pool × ${CATS.length}카테고리 searchText (≈€${(CATS.length * 0.03).toFixed(2)}) → upsert`);
    if (only.includes('curate'))   console.log(`  ② 큐레이션 = 02-enrich --defects-only (결함행 → Gemini, ≈무료)`);
    if (only.includes('enrich'))   console.log(`  ③ TS검증+이미지 = 06-ts-pm-enrich (PID/이미지 NULL → TS+PhotoMedia, ≈€0.035+0.007/행)`);
    console.log(`\n[현재 상태] 6 카테고리 TOP20 칸별 채움률 (= 목표 = 14요소 완비):`);
    await verifyReport();
    console.log(`\n→ 실행하려면: --apply 추가`);
    return;
  }

  // ── APPLY = 전체 파이프라인 ──
  if (only.includes('discover')) {
    for (const cat of CATS) run(`① 발굴 ${cat}`, 'prompts/12-ts-discover-pool/run.ts',
      [`--city-id=${cityId}`, `--category=${cat}`, `--zone=${zone}`, `--lang=${lang}`, '--per=20', '--pages=1']);
    for (const cat of CATS) run(`① upsert ${cat}`, 'prompts/12-ts-discover-pool/post-process.ts',
      [`--city-id=${cityId}`, `--category=${cat}`, `--zone=${zone}`, `--date=${today}`, '--apply']);
  }
  if (only.includes('curate')) {
    run(`② 큐레이션 발굴`, 'prompts/02-enrich-place/run.ts', [`--city-id=${cityId}`, '--batch=40', '--defects-only']);
    run(`② 큐레이션 적용`, 'prompts/02-enrich-place/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
  }
  if (only.includes('enrich')) {
    run(`③ TS검증+이미지 발굴`, 'prompts/06-ts-pm-enrich/run.ts', [`--city-id=${cityId}`]);
    run(`③ TS검증+이미지 적용`, 'prompts/06-ts-pm-enrich/post-process.ts',
      [`--city-id=${cityId}`, `--date=${today}`, '--apply-status=ok', '--photo']);
  }
  if (only.includes('verify')) {
    console.log(`\n━━━━━━ ④ 검증 리포트 (6 카테고리 TOP20 14요소) ━━━━━━`);
    await verifyReport();
  }
  console.log(`\n✓ fillCity ${cityId} 완료. (재분류 05 / 중복통합 07 = 사용자 검수 별도)`);
})();

// 6 카테고리 TOP20 칸별 채움률 (= 비용 0)
async function verifyReport() {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const rows = (await c.query(`
    WITH ranked AS (
      SELECT *, row_number() OVER (PARTITION BY seed_category ORDER BY google_review_count DESC NULLS LAST) AS rn
      FROM place_seed_raw WHERE city_id=$1 AND seed_category = ANY($2::text[])
    )
    SELECT seed_category AS cat, COUNT(*) AS n,
      COUNT(*) FILTER (WHERE name_ko IS NOT NULL AND name_ko<>'') AS ko,
      COUNT(*) FILTER (WHERE summary_ko IS NOT NULL AND summary_ko<>'') AS sumko,
      COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL AND editorial_summary<>'') AS edi,
      COUNT(*) FILTER (WHERE price_eur IS NOT NULL) AS price,
      COUNT(*) FILTER (WHERE COALESCE(image_url,best_image_url) IS NOT NULL OR (photo_urls IS NOT NULL AND jsonb_array_length(photo_urls)>0)) AS img,
      COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) AS pid,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL) AS coord,
      COUNT(*) FILTER (WHERE address IS NOT NULL) AS addr
    FROM ranked WHERE rn <= 20 GROUP BY seed_category ORDER BY seed_category
  `, [cityId, CATS])).rows;
  await c.end();
  console.log(`  cat        | TOP | ko sum edi price img pid coord addr`);
  for (const r of rows) {
    console.log(`  ${r.cat.padEnd(10)} | ${String(r.n).padStart(3)} | ${r.ko} ${r.sumko}  ${r.edi}   ${r.price}   ${r.img}  ${r.pid}   ${r.coord}   ${r.addr}`);
  }
}
