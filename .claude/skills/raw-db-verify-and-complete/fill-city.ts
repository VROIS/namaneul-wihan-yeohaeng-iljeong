// ⚠️ 수정금지(승인필요) 2026-06-04 = fillCity 단일 오케스트레이터 (= 헌법 §16 Phase B = 사용자 SSOT)
// = 한 도시 raw DB 채우기 전 파이프라인을 "한 줄"로. 도시ID만 바꾸면 300번 동일 동작.
// = 모든 쓰기는 단일 7단계 매처(shared/matcher.ts) + upsertPlace 통과 (= 신규 INSERT / 기존 UPDATE 자동 분기).
//
// ⚠️ 수정금지(승인필요) 2026-06-08 = 확정 PRD(docs/FILLCITY_PRD.md §4) 정합 = 6단계 상호보완 체인 + ⓪
// 단계 (= 전부 기존 컴포넌트 = 재발명 0):
//   ⓪ city-meta  = (신규도시) gemini-city-meta → cities 좌표 행 (= downtown 발굴 전제)
//   ① 발굴      = TS(12-ts-discover-pool 6cat searchText) ∥ Gemini(01-discover-6cats 한국선호) → upsertPlace 7단계 병합
//   ② 큐레이션   = 02-enrich-place --defects-only (요약2 + 가격 결손행 → Gemini)
//   ③ backfill   = fill/ts-backfill (PID/RC/가격 결손 → TS = Gemini 환각 검증)
//   ④ photo      = fill/ts-photo-fill --top=20 (= 카테고리별 RC TOP20 이미지)
//   ⑤ restaurant = 도심[TS 3종 + Gemini 03] ∥ 외곽[TS + Gemini 04] → 병합 → 13 카피 → TOP20 이미지
//   ⑥ verify     = 6 카테고리 TOP20 완비 리포트 (= 비용 0, DB SELECT)
//   * 랭킹(추출) = fill/rc-rerank RC DESC 자동 / 07-merge 중복정리 = 필요시 검수 (= 06-ts-pm-enrich 레거시 대체)
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
// ⚠️ 수정금지(승인필요) 2026-06-07 = 상호보완 체인 6 단계 (= 사용자 SSOT) = discover(TS+Gemini)→curate(Gemini카피)→backfill(TS PID)→photo(TOP20)→restaurant(TS+Gemini)→verify
const only = argv['only'] ? String(argv['only']).split(',').map((s) => s.trim()) : ['discover', 'curate', 'backfill', 'photo', 'restaurant', 'verify'];
const outskirtHints = argv['outskirt-hints'] ? String(argv['outskirt-hints']) : '';  // = 04 외곽식당 Gemini 발굴용 day-trip 명소 (미제공 = TS 외곽만 = 04 스킵)
const today = new Date().toISOString().slice(0, 10);
if (!cityId) { console.error('Usage: --city-id=<N> [--apply] [--lang=fr] [--zone=downtown] [--outskirt-hints="Toledo / Segovia"] [--only=discover,curate,backfill,photo,restaurant,verify]'); process.exit(1); }

const CATS = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping'];
const P = (rel: string) => path.join(SKILL, rel);

// ⚠️ 수정금지(승인필요) 2026-06-10 = 컴포넌트 CLI 실행 = 재시도(전이성 API 오류) + 실패해도 전체 중단 X (= 무인 30분 실행 중 1단계 실패가 전체를 안 죽임). 끝에 실패 요약 → 해당 단계만 재실행.
//   = raw 저장 + 단일 매처 멱등이라 재실행 안전(중복 0). 옛 "실패 시 process.exit(1)" 폐기.
const failures: string[] = [];
function run(label: string, script: string, args: string[], retries = 2) {
  console.log(`\n━━━━━━ ${label} ━━━━━━`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) console.log(`  ↻ 재시도 ${attempt}/${retries} (${label})`);
    const r = spawnSync('npx', ['tsx', P(script), ...args], { stdio: 'inherit', shell: true });
    if (r.status === 0) return;
  }
  console.error(`✗ ${label} = ${retries}회 재시도 후 실패 = 건너뜀(다른 단계 계속, 끝에 요약)`);
  failures.push(label);
}

(async () => {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║ fillCity = city ${cityId} | ${apply ? 'APPLY (쓰기)' : 'DRY (미리보기)'} | lang=${lang} | only=${only.join(',')}`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);

  if (!apply) {
    // ── DRY = 무료 = 계획 + 비용 추정 + 현재 14요소 리포트 (API 호출 0) ──
    // ⚠️ 수정금지(승인필요) 2026-06-07 = 상호보완 체인(TS 객관 + Gemini 한국선호) 계획 + 레거시 병합 투명성 (= 사용자 SSOT)
    console.log(`\n[계획] --apply 시 = 상호보완 체인 (TS 객관 RC + Gemini 한국선호) → upsertPlace 7단계 병합:`);
    console.log(`\n  Ⓐ 6 카테고리 (${CATS.join('·')}):`);
    console.log(`     1. TS 발굴(12 searchText 카테고리정의 ×6) ∥ Gemini 발굴(01 한국선호 = TS가 못 잡는 곳)`);
    console.log(`     2. → upsertPlace 7단계 = 기존 레거시와 병합(중복 0) / 진짜 신규만 INSERT`);
    console.log(`     3. Gemini 카피 보강(02 --defects-only) + TS PID/가격 보강(ts-backfill)`);
    console.log(`     4. RC순 랭킹 → 카테고리별 TOP20 이미지 PM(ts-photo-fill --top=20)`);
    console.log(`\n  Ⓑ 식당:`);
    console.log(`     도심 = TS(12 downtown 합본) + Gemini(03 가격tier) → 병합 → 카피(13) → TOP20 PM`);
    console.log(`     외곽 = Gemini(04 명소주변) + TS(12 outskirt 재검증) → 병합 → 카피(13) → TOP20 PM`);
    console.log(`\n  공통: 모든 쓰기 = upsertPlace 단일진입(§14) = COALESCE 새우선·GREATEST 가격 = 레거시 자동 업그레이드`);
    console.log(`\n[예상 비용] TS 발굴 ~€0.5 + PID 보강 ~€1.5 + 이미지 PM ~€1.2 + Gemini 무료 ≈ €3~5`);
    console.log(`\n[현재 PSR 레거시 = 병합 대상]`);
    await verifyReport();
    console.log(`\n⚠️ 위 레거시 위에 최신 검증자료를 덮어씀 = 중복 아님(매칭 병합). 실제 "병합 vs 신규" 수치 = 발굴 후 post-process dry 에서 쓰기 0으로 표시.`);
    console.log(`\n→ 실행: --apply 추가 (먼저 --only=discover 소량 권장)`);
    return;
  }

  // ── APPLY = 상호보완 전체 체인 (= 사용자 SSOT 2026-06-07 = TS 객관 + Gemini 한국선호 → upsertPlace 7단계 자동병합) ──
  if (only.includes('discover')) {
    // Ⓐ-1 발굴 = TS(searchText 카테고리정의 ×6) + Gemini(01 한국선호 = TS 미발굴 보완)
    for (const cat of CATS) run(`Ⓐ TS발굴 ${cat}`, 'prompts/12-ts-discover-pool/run.ts',
      [`--city-id=${cityId}`, `--category=${cat}`, '--zone=downtown', `--lang=${lang}`, '--per=20', '--pages=1']);
    run(`Ⓐ Gemini발굴 6cat`, 'prompts/01-discover-6cats/run.ts', [`--city-id=${cityId}`]);
    // Ⓐ-2 합침 = upsertPlace 7단계 매칭 (TS + Gemini = 같은 장소 병합 / 신규만 INSERT)
    for (const cat of CATS) run(`Ⓐ TS병합 ${cat}`, 'prompts/12-ts-discover-pool/post-process.ts',
      [`--city-id=${cityId}`, `--category=${cat}`, '--zone=downtown', `--date=${today}`, '--apply']);
    run(`Ⓐ Gemini병합 6cat`, 'prompts/01-discover-6cats/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
  }
  if (only.includes('curate')) {
    // Ⓐ-3a Gemini 한국어 카피 보강 (= name_ko/summary/editorial/price 결손행)
    run(`Ⓐ Gemini카피 발굴`, 'prompts/02-enrich-place/run.ts', [`--city-id=${cityId}`, '--batch=40', '--defects-only']);
    run(`Ⓐ Gemini카피 적용`, 'prompts/02-enrich-place/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
  }
  if (only.includes('backfill')) {
    // Ⓐ-3b TS PID/URI/가격 보강 (= PID 결손행 = Gemini 환각 방지 = 객관 검증, 6 비식당)
    run(`Ⓐ TS보강(PID/가격)`, '../../../server/services/fill/ts-backfill.ts', [`--city-id=${cityId}`, `--lang=${lang}`, '--apply']);
  }
  if (only.includes('photo')) {
    // Ⓐ-4 이미지 PM = 6 카테고리 RC순 TOP20 (= 비용 통제)
    run(`Ⓐ 이미지 TOP20`, '../../../server/services/fill/ts-photo-fill.ts', [`--city-id=${cityId}`, `--lang=${lang}`, '--top=20', '--apply']);
  }
  if (only.includes('restaurant')) {
    // Ⓑ 식당 = TS(객관 RC) + Gemini(한국선호) 상호보완
    // 도심 = TS 3종 합본(nearby POPULARITY + text60 + premium) + Gemini 가격tier(03 복귀)
    run(`Ⓑ 도심 TS nearby`, 'prompts/12-ts-discover-pool/run.ts', [`--city-id=${cityId}`, '--zone=downtown', '--method=nearby', '--label=nearby', `--lang=${lang}`]);
    run(`Ⓑ 도심 TS text60`, 'prompts/12-ts-discover-pool/run.ts', [`--city-id=${cityId}`, '--zone=downtown', '--method=text', '--pages=3', '--label=text', `--lang=${lang}`]);
    run(`Ⓑ 도심 TS premium`, 'prompts/12-ts-discover-pool/run.ts', [`--city-id=${cityId}`, '--zone=downtown', '--method=text', '--pages=3', '--price-levels=EXPENSIVE,VERY_EXPENSIVE', '--label=premium', `--lang=${lang}`]);
    run(`Ⓑ 도심 Gemini(03)`, 'prompts/03-downtown-restaurant/run.ts', [`--city-id=${cityId}`]);
    run(`Ⓑ 도심 병합(TS+PM)`, 'prompts/12-ts-discover-pool/post-process.ts', [`--city-id=${cityId}`, '--zone=downtown', `--date=${today}`, '--apply', '--photo']);
    run(`Ⓑ 도심 Gemini병합(03)`, 'prompts/03-downtown-restaurant/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
    // 외곽 = TS(destinations.ts 명소별) + Gemini(04 복귀, --outskirt-hints 제공 시)
    run(`Ⓑ 외곽 TS`, 'prompts/12-ts-discover-pool/run.ts', [`--city-id=${cityId}`, '--zone=outskirt', `--lang=${lang}`]);
    if (outskirtHints) run(`Ⓑ 외곽 Gemini(04)`, 'prompts/04-outskirt-restaurant/run.ts', [`--city-id=${cityId}`, `--hints=${outskirtHints}`]);
    else console.log(`\n  ⚠️ 외곽 Gemini(04) 스킵 = --outskirt-hints 미제공 (TS 외곽만 진행)`);
    run(`Ⓑ 외곽 병합(TS+PM)`, 'prompts/12-ts-discover-pool/post-process.ts', [`--city-id=${cityId}`, '--zone=outskirt', `--date=${today}`, '--apply', '--photo']);
    if (outskirtHints) run(`Ⓑ 외곽 Gemini병합(04)`, 'prompts/04-outskirt-restaurant/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
    // 식당 한국어 카피 (13 = RC 있는 식당 요약 2개 + 가격)
    run(`Ⓑ 식당 카피(13) 발굴`, 'prompts/13-restaurant-summary/run.ts', [`--city-id=${cityId}`]);
    run(`Ⓑ 식당 카피(13) 적용`, 'prompts/13-restaurant-summary/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`, '--apply']);
  }
  // ⚠️ 수정금지(승인필요) 2026-06-10 = 발굴 raw → Storage 버킷 영구 백업 (= 사용자 완성 기준 "필수 raw 버킷 저장", 발굴/식당 후 항상 = 로컬 소실돼도 재입력 가능)
  if (only.includes('discover') || only.includes('restaurant')) {
    run('raw 버킷 백업', '../../../server/services/fill/raw-bucket-sync.ts', [`--city-id=${cityId}`, '--apply']);
  }
  if (only.includes('verify')) {
    console.log(`\n━━━━━━ 검증 리포트 (6 카테고리 TOP20 14요소) ━━━━━━`);
    await verifyReport();
  }
  if (failures.length) console.log(`\n⚠️ 실패 단계 ${failures.length}개 = ${failures.join(', ')} = 재실행: --only=<해당단계> (raw 저장됨 = 재입력 안전)`);
  console.log(`\n✓ fillCity ${cityId} ${failures.length ? `완료(단, 위 ${failures.length}단계 재실행 필요)` : '전 단계 성공'}. (재분류 05 / 중복통합 07 = 인위적 병합 = 사용자 최종 검수 별도)`);
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
