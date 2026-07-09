// ⚠️ 수정금지(승인필요) 2026-05-20 = 07-merge-dups 후처리 병합 트랜잭션
// = 사용자 명시 그룹/tier 만 병합 (= 자율 병합 금지 = 헌법 §1)
//
// 호출 (= 사용자 명시 후만):
//   npx tsx .../07-merge-dups/post-process.ts --city-id=19 --date=2026-06-15 --apply-tiers=0,1,2,3,4 [--apply-groups=key1,key2,...]
//
// ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = 중복통합 원칙 (= 최신 검증 유료정보 최우선):
//   1) keep(살리는 행) = 최신 TS 검증 행 우선 = PID+RC 둘다 보유 → updated_at 최신 → RC 큰순 → id 작은순.
//      (= "최신 TS > 최신 Gemini > 둘다면 덮어쓰기" 의 keep 판별. RC=TS Enterprise 응답증거, PID=Google 유일ID.)
//   2) 병합값 = keep 값 있으면 keep 승(=최신이 정답), keep 이 NULL/빈칸인 칸만 loser 로 보충(=무손실).
//      가격도 keep 최신값 우선(= 옛 GREATEST 폐기, [[project_price_eur_ssot]] 최신최우선 정합). 태그만 UNION 누적.
//   3) 이후 리랭킹 = DB PSR 내부 시스템(rc-rerank.ts = 순수 RC DESC) 자동 = 본 스크립트 안 건드림.
//   4) 자동제외 안전망(= --apply-tiers 일괄 시) = BTS(bts_*) / 교차카테고리 / name_local 토큰 불일치(=다른장소 의심)
//      = 자동 skip + 경고 = 헌법 BTS보존·[[feedback_never_discard_ts_data]] 정합. 강제하려면 --apply-groups 명시.
// - 명확 tier (= 0/1/2/3/4 = 불변=확정) 만 --apply-tiers 자동 / 의심(5,6) = --apply-groups 명시만
// - 병합 = 무손실 흡수 후 loser 물리 DELETE (= 1 장소 = 1 행, 2026-05-21 사용자 SSOT)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
// ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = --global = run.ts --global 산출물(docs/raw/_global) 로드 = 크로스도시 중복 병합. run.ts 와 대칭.
const globalMode = argv['global'] === 'true';
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const applyTiers = (argv['apply-tiers'] || '').split(',').filter(Boolean).map(Number);
const applyGroups = (argv['apply-groups'] || '').split(',').filter(Boolean);
// ⚠️ 2026-06-15 = --dry 플래그 = tier/group 지정해도 실행 안 함(=병합 전 검수 미리보기). 안전기본 = 미리보기 후 --dry 빼야 실제 병합.
const dry = argv['dry'] === 'true';
const apply = !dry && (argv['apply'] === 'true' || applyTiers.length > 0 || applyGroups.length > 0);
if (!cityId && !globalMode) { console.error('Usage: --city-id=<N> | --global --date=<YYYY-MM-DD> --apply-tiers=0,1,2,3,4 [--apply-groups=key1,...] [--dry]'); process.exit(1); }

(async () => {
  const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^['"]/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }

  // ⚠️ 2026-06-15 = 입력 파일명 = raw-filename.ts 단일 표준 정합 ({date}_07-merge-dups_groups.json = run.ts 저장형식)
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = latestVersioned 로 groups _N 계열 최신 1개 읽기
  const { pathToFileURL } = await import('url');
  const { rawName, latestVersioned } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);
  const rawDir = path.join(ROOT, 'docs', 'raw', globalMode ? '_global' : String(cityId));
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = groups stem 계열 최신(없으면 무순번명=기존 미존재 에러 유지)
  const latest = latestVersioned(rawDir, rawName(7, 'merge-dups', 'groups', date));
  const inPath = latest ? path.join(rawDir, latest) : path.join(rawDir, rawName(7, 'merge-dups', 'groups', date));
  if (!fs.existsSync(inPath)) { console.error(`✗ ${inPath} 미존재 = run.ts 먼저 실행`); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const groups = j.groups || [];

  console.log(`═══ 07-merge-dups post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}, 총 그룹 = ${groups.length}`);
  console.log(`apply-tiers = [${applyTiers.join(',')}], apply-groups = ${applyGroups.length}`);

  // 적용 대상 필터
  const targets = groups.filter((g: any) =>
    applyTiers.includes(g.matched_tier) || applyGroups.includes(g.group_key)
  );
  console.log(`적용 대상 그룹 = ${targets.length}`);

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = keep 판정용 DB 메타 (= groups.json 엔 RC/updated_at/name_local 없음 → DB 직조회)
  const allIds = [...new Set(targets.flatMap((g: any) => g.rows.map((r: any) => r.id)))];
  const metaRows = allIds.length ? (await c.query(
    `SELECT id, seed_category, name_local, name_en, name_ko, google_place_id, google_review_count, updated_at
     FROM place_seed_raw WHERE id = ANY($1)`, [allIds])).rows : [];
  const meta = new Map<number, any>(metaRows.map((m: any) => [m.id, m]));

  // keep 선정 = 최신 TS 검증 행 우선 (= 사장님 SSOT 2026-06-15)
  //   1순위 = PID+RC 둘다 보유 (= TS Enterprise 응답증거) / 2순위 = updated_at 최신 / 3순위 = RC 큰순 / 4순위 = id 작은순(원본)
  function selectKeep(rows: any[]): any {
    const sorted = [...rows].sort((a, b) => {
      const ma = meta.get(a.id) || {}, mb = meta.get(b.id) || {};
      const tsA = (ma.google_place_id && ma.google_review_count != null) ? 1 : 0;
      const tsB = (mb.google_place_id && mb.google_review_count != null) ? 1 : 0;
      if (tsA !== tsB) return tsB - tsA;                                   // ① PID+RC 보유 = 최신 TS 우선
      const uA = ma.updated_at ? new Date(ma.updated_at).getTime() : 0;
      const uB = mb.updated_at ? new Date(mb.updated_at).getTime() : 0;
      if (uA !== uB) return uB - uA;                                       // ② updated_at 최신
      const rA = ma.google_review_count ?? -1, rB = mb.google_review_count ?? -1;
      if (rA !== rB) return rB - rA;                                       // ③ RC 큰순
      return a.id - b.id;                                                  // ④ id 작은순(원본)
    });
    return sorted[0];
  }

  // ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = 자동제외 안전망 (= --apply-tiers 일괄 시 다른장소/BTS 오병합 차단)
  //   = BTS(bts_*) / 교차카테고리 / name_local 토큰 불일치(=다른장소 의심) = 자동 skip. --apply-groups 명시는 통과(사용자 검수 완료 간주).
  const stripName = (s: string | null): string[] =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[.,;:!?'"()[\]{}\/&-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  // ⚠️ 수정금지(승인필요) 2026-06-22 사장님 SSOT = 이름 토큰 = name_local·name_en·name_ko 합집합 (= run.ts 매처 nameKeys 와 정합, §19·§20).
  //   = 옛 결함: name_local 만 봄 → 신규 발굴행(name_local=null, name_en만 있음)이 항상 "토큰 0 = 다른장소" 오판 = run 이 잡은 진짜중복(Circolo 등)을 post 가 막음(매처≠안전망 불일치).
  //   = 수정: 세 이름칸 토큰 합집합 = run 매처와 동일 기준 = name_local null 이어도 name_en 으로 공유 판정. (= grnTokens)
  const grnTokens = (m: any): Set<string> =>
    new Set([...stripName(m?.name_local), ...stripName(m?.name_en), ...stripName(m?.name_ko)]);
  function autoExcludeReason(g: any): string | null {
    if (applyGroups.includes(g.group_key)) return null; // 명시 그룹 = 검수완료 = 통과
    const cats = new Set(g.rows.map((r: any) => meta.get(r.id)?.seed_category || r.seed_category));
    if ([...cats].some((s) => String(s).startsWith('bts_'))) return 'BTS 보존(자동병합 금지)';
    if (cats.size > 1) return `교차카테고리(${[...cats].join('/')})`;
    // ⚠️ 2026-06-22 = 이름(3칸 합집합) 토큰 = 한 그룹 내 어느 쌍이라도 공유 토큰 0 = 다른장소 의심 (= run 매처 정합).
    const names = g.rows.map((r: any) => grnTokens(meta.get(r.id)));
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const shared = [...names[i]].some((t) => names[j].has(t));
      if (!shared) return '이름 토큰 불일치(다른장소 의심)';
    }
    return null;
  }

  // ⚠️ 2026-06-15 = DRY 미리보기 = keep/skip 판정을 병합 전에 검수 (= 객관적 검증 [[feedback_objective_validation]], DB 변경 0)
  console.log('\n--- 판정 미리보기 (keep=최신TS / SKIP=자동제외) ---');
  for (const g of targets) {
    const ex = autoExcludeReason(g);
    if (ex) { console.log(`  ⏭ SKIP [${g.group_key}] tier=${g.matched_tier} = ${ex}`); continue; }
    const keep = selectKeep(g.rows);
    const km = meta.get(keep.id) || {};
    const losers = g.rows.filter((r: any) => r.id !== keep.id).map((r: any) => r.id);
    console.log(`  ✓ [${g.group_key}] keep id=${keep.id} '${km.name_local || keep.name_en}' (PID=${km.google_place_id ? 'Y' : 'N'},RC=${km.google_review_count ?? '-'}) ← DELETE ${losers.join(',')}`);
  }
  if (!apply) {
    await c.end();
    console.log('\n--- DRY-RUN = --apply-tiers 또는 --apply-groups 명시 후 실제 병합 ---');
    process.exit(0);
  }

  await c.query('BEGIN');

  // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = 병합 후 loser 물리 DELETE (= 1 장소 = 1 행 정적)
  let archived = 0, merged = 0, errors = 0, skipped = 0;
  try {
    for (const g of targets) {
      // ⚠️ 2026-06-15 = 자동제외 안전망 (BTS/교차카테고리/다른장소 의심) = skip + 경고
      const ex = autoExcludeReason(g);
      if (ex) { skipped++; console.log(`⏭  SKIP [${g.group_key}] tier=${g.matched_tier} = ${ex} (강제하려면 --apply-groups=${g.group_key})`); continue; }
      const keep = selectKeep(g.rows);
      const archiveIds = g.rows.filter((r: any) => r.id !== keep.id).map((r: any) => r.id);
      // ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = 병합 정책 (= 최신 TS 가 가장 정답):
      //   ① TS 호출 필수 9요소(= 헌법 = id/userRatingCount/photos/googleMapsUri/businessStatus/location/formattedAddress/priceRange/displayName)
      //      → 우리 컬럼(PID·RC·image_url·google_maps_uri·좌표·address·price_eur·name_local) = keep(최신TS) 값 그대로 = loser 흡수 X(옛TS 완전 폐기).
      //   ② 그 외 = Gemini 큐레이션 요소(summary_ko/editorial_summary/name_ko) = keep 우선 COALESCE(빈칸만 loser 보충 = 무손실 [[feedback_never_discard_ts_data]]).
      //   ③ 태그 = UNION 누적.
      // ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = loser 전량 DELETE → keeper UPDATE 1회 순서 (= 도시무관 트리거 마비 회피).
      //   근거: prevent_dup 트리거 도시무관 후 = 클러스터 loser(같은 PID/좌표)가 하나라도 살아있는 채로 keeper UPDATE 하면 불변1~5 걸려 EXCEPTION(마비).
      //   = 3행+ 클러스터(loser≥2)에서 loser 하나씩 DELETE→UPDATE 반복하면 첫 UPDATE 시 나머지 loser 생존→마비. → loser 전량 먼저 삭제.
      //   = DELETE 는 트리거 대상 아님(BEFORE INSERT OR UPDATE만, 실측입증) → loser 전량 삭제 → 클러스터 중복 0 → keeper UPDATE 통과.
      //   = 옛 "loser 하나씩 DELETE+UPDATE" 폐기 2026-07-09 §19. 흡수값(전 loser)은 DELETE 시 RETURNING 으로 캡처 후 병합.
      // ① 클러스터 loser 전량 DELETE + 흡수값 캡처 (트리거 미발동 = 안전, 순서무관). summary/editorial/name_ko = 첫 비어있지않은값, 태그 = 전량 UNION.
      let capKo: string | null = null, capEd: string | null = null, capNk: string | null = null;
      const capCat: string[] = [], capPh: string[] = [];
      for (const aid of archiveIds) {
        const del = await c.query(`DELETE FROM place_seed_raw WHERE id = $1 RETURNING summary_ko, editorial_summary, name_ko, category_tags, phase_tags`, [aid]);
        const cap = del.rows[0]; // aid = selectKeep 가 g.rows 에서 뽑은 실재 loser = 항상 1행
        if (del.rowCount) {
          archived++;
          if (!capKo && cap.summary_ko) capKo = cap.summary_ko;              // 빈칸보충 = 첫 loser 값만
          if (!capEd && cap.editorial_summary) capEd = cap.editorial_summary;
          if (!capNk && cap.name_ko) capNk = cap.name_ko;
          if (Array.isArray(cap.category_tags)) capCat.push(...cap.category_tags); // 태그 = 전 loser UNION
          if (Array.isArray(cap.phase_tags)) capPh.push(...cap.phase_tags);
        }
      }
      // ② keeper UPDATE 1회 = 전 loser 흡수값 병합 (keep 빈칸만 보충 = 무손실). 클러스터 중복 0 = 트리거 통과.
      if (archiveIds.length > 0) {
        const u = await c.query(`
          UPDATE place_seed_raw k SET
            summary_ko          = COALESCE(NULLIF(k.summary_ko, ''),        NULLIF($2::text, '')),
            editorial_summary   = COALESCE(NULLIF(k.editorial_summary, ''), NULLIF($3::text, '')),
            name_ko             = COALESCE(NULLIF(k.name_ko, ''),           NULLIF($4::text, '')),
            category_tags       = (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(k.category_tags, '{}') || $5::text[]) AS t),
            phase_tags          = (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(k.phase_tags, '{}') || $6::text[]) AS t)
          WHERE k.id = $1`, [keep.id, capKo, capEd, capNk, capCat, capPh]);
        if (u.rowCount) merged++;
        console.log(`✓ MERGE keep id=${keep.id} '${keep.name_en}' ← loser [${archiveIds.join(',')}] [tier=${g.matched_tier}] (loser전량삭제→keeper1회UPDATE, 트리거안전)`);
      }
    }
    await c.query('COMMIT');
    console.log('\n✓ COMMIT 완료');
  } catch (e: any) {
    await c.query('ROLLBACK');
    console.error(`✗ ROLLBACK: ${e.message}`);
    errors++;
  }
  await c.end();

  console.log(`\n═══ 결과 ═══`);
  console.log(`merged(keep=최신TS 흡수) = ${merged} / deleted(loser) = ${archived} / skipped(자동제외) = ${skipped} / errors = ${errors}`);
})();