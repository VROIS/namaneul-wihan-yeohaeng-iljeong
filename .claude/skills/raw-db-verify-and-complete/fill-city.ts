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
// ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = --lang 명시 시에만 전달, 미지정 = 미전달(하위 컴포넌트가 키 생략 = 한국어 강제 안 함)
const lang = argv['lang'] ? String(argv['lang']) : undefined;
// ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = --lang 미지정 시 자식에 --lang 인자 자체를 안 넘김(`--lang=undefined` 문자열 오전달 방지). 명시 시에만 ['--lang=<값>'].
const langArg = lang ? [`--lang=${lang}`] : [];
const zone = argv['zone'] ? String(argv['zone']) : 'downtown';
// ⚠️ 삭제 2026-06-21 = 옛 "allRestaurantsArg(--all-restaurants 패스스루)"(2026-06-20 AI 임시) 완전삭제 = 사장님 SSOT "원복"(§19). #45 = 항상 band 30/90/30 단일(플래그 X).
// ⚠️ 수정금지(승인필요) 2026-06-20 = 사전정제(#45 결손보강) 맨 앞 삽입 = 사장님 SSOT.
//   = repair(#45 결손보강·보정) → discover(TS+Gemini) → curate → backfill → photo → restaurant → verify.
//   = repair 단독 = `--only=repair` (1회용 보정 = 파리·마드리드 재점검). 전체 = repair 가 발굴 전 사전정제로 자동 선행.
// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 'cleanse'(정제) 맨 앞 = #45 이전 독립 단계(섞지 말 것).
//   = 정제(#1b fillcity-step1b) = 전체 행 Gemini 재검증 → 이름·가격·칸오입력 교정 + 결손가격 채움 → 새덮어쓰기.
//   = 이후 발굴·#45 = 결손률↓ + 가격오류·이상행 미리잡힘 = 이중체크. (옛 #1a 환각삭제 = #1b 흡수 폐기 §19)
const only = argv['only'] ? String(argv['only']).split(',').map((s) => s.trim()) : ['cleanse', 'repair', 'discover', 'curate', 'backfill', 'photo', 'restaurant', 'verify'];
const outskirtHints = argv['outskirt-hints'] ? String(argv['outskirt-hints']) : '';  // = 04 외곽식당 Gemini 발굴용 day-trip 명소 (미제공 = TS 외곽만 = 04 스킵)
const today = new Date().toISOString().slice(0, 10);
if (!cityId) { console.error('Usage: --city-id=<N> [--apply] [--lang=fr] [--zone=downtown] [--outskirt-hints="Toledo / Segovia"] [--only=discover,curate,backfill,photo,restaurant,verify]'); process.exit(1); }

const CATS = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping'];
const P = (rel: string) => path.join(SKILL, rel);

// ⚠️ 수정금지(승인필요) 2026-06-10 = 컴포넌트 CLI 실행 = 재시도(전이성 API 오류) + 실패해도 전체 중단 X (= 무인 30분 실행 중 1단계 실패가 전체를 안 죽임). 끝에 실패 요약 → 해당 단계만 재실행.
//   = raw 저장 + 단일 매처라 다시 돌려도 안전(이미 있으면 중복 0). 옛 "실패 시 process.exit(1)" 폐기.
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
    // ⚠️ 수정금지(승인필요) 2026-06-20 = Gemini 우선 체인 계획 (= 옛 "TS먼저 ∥ Gemini" 안내 삭제 = run 순서 정합).
    console.log(`\n[계획] --apply 시 = Gemini 우선 체인 (Gemini 선정·힌트·name_local·가격 → TS 9요소 검증) → upsertPlace 7단계:`);
    console.log(`\n  ① cleanse(정제) = 전체 행 Gemini 재검증(이름·가격·칸오입력 교정 + 결손가격 채움) → 새덮어쓰기. #45 이전 독립(섞지 말 것). Gemini 만(TS·PM 0) ~1-2콜`);
    console.log(`\n  ⓪ repair(#45) = 기존 결손행 Gemini→TS→PM 보강 (완비 시 추출 0 = 다시 돌려도 외부호출 0)`);
    console.log(`\n  Ⓐ 6 카테고리 (${CATS.join('·')}):`);
    console.log(`     1. Gemini 발굴(01 한국선호=선정·힌트) → TS 발굴·검증(12 searchText ×6=9요소)`);
    console.log(`     2. → upsertPlace 7단계 = 기존 레거시와 병합(중복 0) / 진짜 신규만 INSERT`);
    console.log(`     3. Gemini 카피 보강(02 --defects-only) + TS PID/가격 보강(ts-backfill)`);
    console.log(`     4. RC순 랭킹 → 카테고리별 TOP20 이미지 PM(ts-photo-fill --top=20)`);
    console.log(`\n  Ⓑ 식당 (Gemini 우선):`);
    console.log(`     도심 = Gemini(03 가격tier·선정) → TS 3종(검증) → 병합 → 카피(13) → PM`);
    console.log(`     외곽 = Gemini(04 town 선정=범용자동) → TS(그 town 검증) → 병합 → 카피(13) → PM`);
    console.log(`\n  공통: 모든 쓰기 = upsertPlace 단일진입(§14) = COALESCE 새우선(가격 포함 최신최우선) = 레거시 자동 업그레이드`);
    console.log(`\n[예상 비용] TS 발굴 ~€0.5 + PID 보강 ~€1.5 + 이미지 PM ~€1.2 + Gemini 무료 ≈ €3~5`);
    console.log(`\n[현재 PSR 레거시 = 병합 대상]`);
    await verifyReport();
    console.log(`\n⚠️ 위 레거시 위에 최신 검증자료를 덮어씀 = 중복 아님(매칭 병합). 실제 "병합 vs 신규" 수치 = 발굴 후 post-process dry 에서 쓰기 0으로 표시.`);
    console.log(`\n→ 실행: --apply 추가 (먼저 --only=discover 소량 권장)`);
    return;
  }

  // ── APPLY = 상호보완 전체 체인 (= 사용자 SSOT 2026-06-07 = TS 객관 + Gemini 한국선호 → upsertPlace 7단계 자동병합) ──
  // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = ① 정제(cleanse) = 발굴·#45 보다 먼저 = 전체 행 Gemini 재검증.
  //   = 전체 행 → 힌트(name 3종·주소·좌표) 다 줌 → Gemini 가 (사람처럼) 판단 → 이름·가격·칸오입력 교정 + 결손가격 채움 → 전필드 새덮어쓰기.
  //   = #45 이전 독립 단계(섞지 말 것). 정제 후 발굴·#45 = 결손률↓ + 가격오류·이상행 미리잡힘 = 이중체크.
  //   = 재발명 0 = 영구 컴포넌트 scripts/fillcity-step1b-fix-pollution.ts 연결만. Gemini 만(TS·PM 0) = 도시당 1~2콜.
  if (only.includes('cleanse')) {
    run(`① 정제(전체 재검증)`, '../../../scripts/fillcity-step1b-fix-pollution.ts', [`--city-id=${cityId}`, ...(apply ? ['--apply'] : [])]);
  }
  // ⚠️ 수정금지(승인필요) 2026-06-20 = ⓪ 사전정제 = #45 결손보강·보정 (= 발굴 전 기존 데이터 결손 채움 / 독립 1회용 = --only=repair).
  //   = 재발명 0 = 영구 컴포넌트 scripts/fill45-defect-repair.ts 연결만. 추출(6cat TOP20 + 식당 band 30/90/30 = 270)→Gemini 전필드→TS 전필드→PM→2곳저장.
  //   = 완비 시 추출 0 (= 같은 도시 다시 돌려도 외부호출 0). ⚠️ 삭제 2026-06-21 = 옛 "--all-restaurants 패스스루"(AI 임시) 완전삭제 = 사장님 SSOT "원복"(§19).
  if (only.includes('repair')) {
    run(`⓪ 결손보강·보정(#45)`, '../../../scripts/fill45-defect-repair.ts', [`--city-id=${cityId}`, ...(apply ? ['--apply'] : [])]);
  }
  if (only.includes('discover')) {
    // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = Gemini 우선 발굴 순서 (= 옛 TS먼저 폐기).
    //   = Gemini(01)가 선정·TS검색힌트(장소명)·name_local·가격 먼저 줌 → TS(12-pool)가 그 힌트로 객관 9요소 검증. (PRD §2 정합)
    // Ⓐ-1 Gemini 발굴 = 01 한국선호(인스타·블로그·유튜브) = "무엇을" 선정
    run(`Ⓐ Gemini발굴 6cat`, 'prompts/01-discover-6cats/run.ts', [`--city-id=${cityId}`]);
    // Ⓐ-2 TS 발굴·검증 = searchText 카테고리정의 ×6 = "진짜인가 + 객관 9요소"
    for (const cat of CATS) run(`Ⓐ TS발굴 ${cat}`, 'prompts/12-ts-discover-pool/run.ts',
      [`--city-id=${cityId}`, `--category=${cat}`, '--zone=downtown', ...langArg, '--per=20', '--pages=1']);
    // Ⓐ-3 합침 = upsertPlace 7단계 매칭 (Gemini + TS = 같은 장소 병합 / 신규만 INSERT)
    run(`Ⓐ Gemini병합 6cat`, 'prompts/01-discover-6cats/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
    for (const cat of CATS) run(`Ⓐ TS병합 ${cat}`, 'prompts/12-ts-discover-pool/post-process.ts',
      [`--city-id=${cityId}`, `--category=${cat}`, '--zone=downtown', `--date=${today}`, '--apply']);
  }
  if (only.includes('curate')) {
    // Ⓐ-3a Gemini 한국어 카피 보강 (= name_ko/summary/editorial/price 결손행)
    run(`Ⓐ Gemini카피 발굴`, 'prompts/02-enrich-place/run.ts', [`--city-id=${cityId}`, '--batch=40', '--defects-only']);
    run(`Ⓐ Gemini카피 적용`, 'prompts/02-enrich-place/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
  }
  if (only.includes('backfill')) {
    // Ⓐ-3b TS PID/URI/가격 보강 (= PID 결손행 = Gemini 환각 방지 = 객관 검증, 6 비식당)
    run(`Ⓐ TS보강(PID/가격)`, '../../../server/services/fill/ts-backfill.ts', [`--city-id=${cityId}`, ...langArg, '--apply']);
  }
  if (only.includes('photo')) {
    // Ⓐ-4 이미지 PM = 6 카테고리 RC순 TOP20 (= 비용 통제)
    run(`Ⓐ 이미지 TOP20`, '../../../server/services/fill/ts-photo-fill.ts', [`--city-id=${cityId}`, ...langArg, '--top=20', '--apply']);
  }
  if (only.includes('restaurant')) {
    // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = Gemini 우선 식당 발굴 (= 옛 TS먼저 폐기).
    //   = Gemini(03 도심·04 외곽town)가 선정·가격tier·name_local·외곽town 먼저 줌 → TS가 그 힌트로 9요소 검증.
    // 도심 = Gemini(03 가격tier) 먼저 → TS 3종(nearby POPULARITY + text60 + premium = Gemini 힌트로 검증)
    run(`Ⓑ 도심 Gemini(03)`, 'prompts/03-downtown-restaurant/run.ts', [`--city-id=${cityId}`]);
    run(`Ⓑ 도심 TS nearby`, 'prompts/12-ts-discover-pool/run.ts', [`--city-id=${cityId}`, '--zone=downtown', '--method=nearby', '--label=nearby', ...langArg]);
    run(`Ⓑ 도심 TS text60`, 'prompts/12-ts-discover-pool/run.ts', [`--city-id=${cityId}`, '--zone=downtown', '--method=text', '--pages=3', '--label=text', ...langArg]);
    run(`Ⓑ 도심 TS premium`, 'prompts/12-ts-discover-pool/run.ts', [`--city-id=${cityId}`, '--zone=downtown', '--method=text', '--pages=3', '--price-levels=EXPENSIVE,VERY_EXPENSIVE', '--label=premium', ...langArg]);
    run(`Ⓑ 도심 Gemini병합(03)`, 'prompts/03-downtown-restaurant/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
    run(`Ⓑ 도심 병합(TS+PM)`, 'prompts/12-ts-discover-pool/post-process.ts', [`--city-id=${cityId}`, '--zone=downtown', `--date=${today}`, '--apply', '--photo']);
    // 외곽 = Gemini(04 범용 자동 = 식당 발굴: 이름·주소·가격, 좌표는 안 줌) → 04병합 DB INSERT → outskirt-ts-fill(DB 주소→town 추출→town 이름으로 TS geocode+searchNearby 검증)
    // ⚠️ 수정금지(승인필요) 2026-06-21 사장님 SSOT = 옛 "Ⓑ 외곽 TS(12 --zone=outskirt 좌표 zone) + 외곽 병합(12 outskirt)" 완전삭제(§19) = destinations.ts 좌표 요구 = 브뤼셀 없으면 실패한 옛 방식.
    //   = 외곽은 좌표 zone 아니라 "Gemini 발굴 식당 주소 → town 이름 추출 → 그 town 이름으로 TS" = outskirt-ts-fill.ts(영구 컴포넌트, 2026-06-08) 가 진짜 로직. 04병합이 먼저(DB에 외곽식당 있어야 주소 읽음).
    run(`Ⓑ 외곽 Gemini(04)`, 'prompts/04-outskirt-restaurant/run.ts', [`--city-id=${cityId}`, ...(outskirtHints ? [`--hints=${outskirtHints}`] : [])]);
    run(`Ⓑ 외곽 Gemini병합(04)`, 'prompts/04-outskirt-restaurant/post-process.ts', [`--city-id=${cityId}`, `--date=${today}`]);
    run(`Ⓑ 외곽 TS(town이름→검증)`, '../../../server/services/fill/outskirt-ts-fill.ts', [`--city-id=${cityId}`, ...langArg, '--apply']);
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
      COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS img,
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
