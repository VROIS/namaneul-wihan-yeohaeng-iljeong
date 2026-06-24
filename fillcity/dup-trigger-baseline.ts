// ⚠️ 수정금지(승인필요) 2026-06-24 = PSR 중복 트리거 수정용 (1)before 기준선 (2)A+B 시뮬 (3)백업 (직접접속 §16).
//   = DDL/UPDATE/INSERT/DELETE 절대 없음 = SELECT + 파일저장만 (= 사장님 승인 전 비파괴).
//   호출: npx tsx fillcity/dup-trigger-baseline.ts --city-id=39
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const env = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
if (!cityId) { console.error('Usage: --city-id=<N>'); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);

// 두 곳(콘솔 + 파일) 동시 기록 = 사장님 눈 검수
const outLines: string[] = [];
const log = (s = '') => { console.log(s); outLines.push(s); };

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const outDir = path.join(ROOT, 'docs/raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  log(`================================================================`);
  log(`PSR 중복 트리거 수정 = BEFORE 기준선 + A/B 시뮬 + 백업 (직접접속)`);
  log(`도시 city_id=${cityId} / 날짜 ${today}`);
  log(`= DDL/INSERT/UPDATE/DELETE 0 = SELECT·파일저장만 (사장님 승인 전 비파괴)`);
  log(`================================================================\n`);

  // ─────────────────────────────────────────────────────────────
  // 1. BEFORE 기준선 = 현재 중복의심 전수 기록
  // ─────────────────────────────────────────────────────────────
  log(`########## 1. BEFORE 기준선 (= 트리거 수정 후 비교 기준) ##########\n`);

  // 총행수 (비BTS / BTS 포함 둘 다)
  const totNonBts = (await c.query("SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%'", [cityId])).rows[0].n;
  const totAll = (await c.query('SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1', [cityId])).rows[0].n;
  log(`[총행수] 비BTS=${totNonBts} / 전체(BTS포함)=${totAll}\n`);

  // (1) PID 중복 그룹 전체 (id쌍 + 이름 + 각 행 phase_tags 중복의심 여부)
  const pidDup = (await c.query(`
    SELECT google_place_id AS pid, COUNT(*)::int AS n,
           array_agg(id ORDER BY id) AS ids,
           array_agg(COALESCE(name_en,'(name_en 없음)') ORDER BY id) AS names,
           array_agg( ('중복의심' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) ORDER BY id) AS suspect_flags
    FROM place_seed_raw
    WHERE city_id=$1 AND seed_category NOT LIKE 'bts%' AND google_place_id IS NOT NULL AND google_place_id <> ''
    GROUP BY google_place_id HAVING COUNT(*) > 1 ORDER BY n DESC, ids`, [cityId])).rows;
  log(`[1-A] PID 중복 = ${pidDup.length}그룹 (같은 google_place_id 2+행 = 명백 중복):`);
  for (const r of pidDup) {
    log(`   PID=${r.pid} (${r.n}행) ids=[${r.ids.join(',')}]`);
    for (let i = 0; i < r.ids.length; i++) log(`        id=${r.ids[i]} "${r.names[i]}" 중복의심태그=${r.suspect_flags[i] ? 'Y' : 'N'}`);
  }
  log('');

  // (2) 중복의심 phase_tags 가진 행 전수 (id, name_en, 의심대상-N)
  const suspectRows = (await c.query(`
    SELECT id, COALESCE(name_en,'(없음)') AS name_en, seed_category, google_place_id,
           (SELECT array_agg(t) FROM unnest(phase_tags) t WHERE t LIKE '의심대상-%') AS suspect_targets,
           phase_tags
    FROM place_seed_raw
    WHERE city_id=$1 AND '중복의심' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))
    ORDER BY id`, [cityId])).rows;
  log(`[1-B] 중복의심 phase_tags 행 = ${suspectRows.length}행:`);
  for (const r of suspectRows) {
    log(`   id=${r.id} "${r.name_en}" cat=${r.seed_category} 의심대상=[${(r.suspect_targets || []).join(',')}] pid=${r.google_place_id || '-'}`);
  }
  log('');

  // (3) 좌표10m 중복쌍 (자기제외 + a.id < b.id 로 쌍 1회만)
  const coordDup = (await c.query(`
    SELECT a.id AS id_a, b.id AS id_b,
           COALESCE(a.name_en,'(없음)') AS name_a, COALESCE(b.name_en,'(없음)') AS name_b,
           a.latitude AS lat_a, a.longitude AS lng_a,
           a.google_place_id AS pid_a, b.google_place_id AS pid_b
    FROM place_seed_raw a
    JOIN place_seed_raw b ON a.city_id=b.city_id AND a.id < b.id
      AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
      AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
      AND ABS(a.latitude - b.latitude) < 0.0001 AND ABS(a.longitude - b.longitude) < 0.0001
    WHERE a.city_id=$1 AND a.seed_category NOT LIKE 'bts%' AND b.seed_category NOT LIKE 'bts%'
    ORDER BY a.id, b.id`, [cityId])).rows;
  log(`[1-C] 좌표10m 중복쌍 = ${coordDup.length}쌍 (비BTS):`);
  for (const r of coordDup) {
    log(`   id ${r.id_a} <-> ${r.id_b} : "${r.name_a}" <-> "${r.name_b}" @${r.lat_a},${r.lng_a} pid=${r.pid_a || '-'}/${r.pid_b || '-'}`);
  }
  log('');

  log(`[BEFORE 요약] 총행수 비BTS=${totNonBts} 전체=${totAll} / PID중복 ${pidDup.length}그룹 / 중복의심태그 ${suspectRows.length}행 / 좌표10m중복 ${coordDup.length}쌍\n`);

  // BEFORE 기준선 파일 저장
  const beforePath = path.join(outDir, `_dup-before-${today}.txt`);
  fs.writeFileSync(beforePath, outLines.join('\n'), 'utf-8');

  // ─────────────────────────────────────────────────────────────
  // 2. 트리거 A+B 시뮬 (읽기전용 SELECT = DB 안 바꿈)
  // ─────────────────────────────────────────────────────────────
  log(`########## 2. 트리거 A+B 시뮬 (SELECT만 = DB 무변경) ##########\n`);

  // (a) A 적용 시 UPDATE 가 막혔을 행 수 = 같은 city 다른 행에 같은 PID 있는 행 수 (= B 대응 필요량)
  // = 자기행 제외(a.id<>b.id) + PID 동일 = "다른 행에 그 PID 가 이미 존재" = A 트리거(UPDATE 확장)면 PID-set 시도가 막힘.
  const blockedByA = (await c.query(`
    SELECT a.id AS id, COALESCE(a.name_en,'(없음)') AS name_en, a.google_place_id AS pid, b.id AS other_id
    FROM place_seed_raw a
    JOIN place_seed_raw b ON a.city_id=b.city_id AND a.google_place_id=b.google_place_id AND a.id <> b.id
    WHERE a.city_id=$1 AND a.google_place_id IS NOT NULL AND a.google_place_id <> ''
    ORDER BY a.google_place_id, a.id`, [cityId])).rows;
  const blockedDistinctRows = new Set(blockedByA.map((r: any) => r.id)).size;
  log(`[2-(a)] A(트리거 UPDATE 확장) 적용 시 막혔을 행 = ${blockedDistinctRows}행 (= B 대응 필요량):`);
  for (const r of blockedByA) log(`   id=${r.id} "${r.name_en}" pid=${r.pid} (다른행 id=${r.other_id} 에 동일 PID 존재)`);
  log(`   => B(#45 PID 선검사 = 같은 city 다른 행에 PID 있으면 upsertPlace 병합+현재행 스킵) 대응 필요 = ${blockedDistinctRows}행.`);
  log(`   => 이미 PID중복이 존재하므로 A 단독이면 이 행들의 정상 PID 갱신도 막힘 = B 가 반드시 동반돼야 함.\n`);

  // (b) 자기행 제외 없으면 마비될 행 = PID 또는 좌표 있는 모든 행 = 자기 자신과 충돌 = 전수. 위험 수치화.
  const selfPid = (await c.query("SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND google_place_id IS NOT NULL AND google_place_id <> ''", [cityId])).rows[0].n;
  const selfCoord = (await c.query("SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND latitude IS NOT NULL AND longitude IS NOT NULL", [cityId])).rows[0].n;
  const selfUri = (await c.query("SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND google_maps_uri IS NOT NULL AND google_maps_uri <> ''", [cityId])).rows[0].n;
  const selfLocal = (await c.query("SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND TRIM(COALESCE(name_local,'')) <> ''", [cityId])).rows[0].n;
  const selfAddr = (await c.query("SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND LENGTH(TRIM(COALESCE(address,''))) >= 20", [cityId])).rows[0].n;
  const anySelf = (await c.query(`SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND (
      (google_place_id IS NOT NULL AND google_place_id<>'') OR
      (google_maps_uri IS NOT NULL AND google_maps_uri<>'') OR
      (latitude IS NOT NULL AND longitude IS NOT NULL) OR
      (TRIM(COALESCE(name_local,''))<>'') OR
      (LENGTH(TRIM(COALESCE(address,''))) >= 20) )`, [cityId])).rows[0].n;
  log(`[2-(b)] 자기행 제외(AND c.id <> COALESCE(NEW.id,-1)) 누락 시 마비 위험 = 자기 자신과 충돌:`);
  log(`   PID 보유행 = ${selfPid} / URI 보유행 = ${selfUri} / 좌표 보유행 = ${selfCoord} / 로컬이름 보유행 = ${selfLocal} / 주소20+ 보유행 = ${selfAddr}`);
  log(`   => 위 불변검사 중 하나라도 걸리는 행 = ${anySelf}행 (= 전체 ${totAll} 중) = 자기행 제외 없으면 UPDATE 시 100% 자기 자신에 막힘 = 전수 마비.`);
  log(`   => 그래서 A 의 불변1~5 각 SELECT WHERE 에 'AND c.id <> COALESCE(NEW.id, -1)' 필수.\n`);

  // (c) 자기행 제외 로직 논리 검증 = #45 정상 자기행 PID 갱신은 통과하는지
  log(`[2-(c)] 자기행 제외 로직 논리 검증 (= #45 정상 자기행 PID 갱신 통과 여부):`);
  log(`   시나리오: #45 가 id=X 행에 TS PID 를 직행 UPDATE (repair.ts:202).`);
  log(`   - A 확장 트리거(BEFORE INSERT OR UPDATE)가 NEW(=id=X, 새 PID) 검사.`);
  log(`   - 불변1 PID: SELECT ... WHERE city_id=NEW.city_id AND google_place_id=NEW.pid AND c.id <> COALESCE(NEW.id,-1)`);
  log(`   - 자기 자신(id=X)은 c.id <> NEW.id(=X) 로 제외 => 자기 PID 갱신은 안 막힘 (정상 통과). [OK 논리]`);
  log(`   - 단, 같은 PID 를 가진 '다른' 행(id=Y)이 이미 있으면 => 막힘 = 이게 [2-(a)] 의 ${blockedDistinctRows}행 = B 가 선검사로 병합 처리해야 함.`);
  log(`   결론: 자기행 제외(c.id <> COALESCE(NEW.id,-1)) => 정상 자기 갱신 통과 / 진짜 중복(다른행)만 차단 = 의도대로. (단 NEW.id 가 항상 존재(UPDATE)하므로 COALESCE 의 -1 폴백은 INSERT 시에만 발동 = INSERT 동작 무변경.)\n`);

  // ─────────────────────────────────────────────────────────────
  // 3. 백업 (안전망)
  // ─────────────────────────────────────────────────────────────
  log(`########## 3. 백업 (비가역 작업 전 복구 안전망) ##########\n`);

  // (3-1) PSR city 전체 행 JSON 백업
  const allRows = (await c.query('SELECT * FROM place_seed_raw WHERE city_id=$1 ORDER BY id', [cityId])).rows;
  const backupPath = path.join(outDir, `_backup-psr-${today}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ meta: { city_id: cityId, saved_at: new Date().toISOString(), row_count: allRows.length }, rows: allRows }, null, 2), 'utf-8');
  log(`[3-1] PSR city_id=${cityId} 전체 ${allRows.length}행 백업 => ${backupPath}`);

  // (3-2) prevent_dup 트리거 함수 정의 전체 (pg_get_functiondef) + 트리거 바인딩 = 롤백용 SQL
  const fnDef = (await c.query("SELECT pg_get_functiondef('public.place_seed_raw_prevent_dup'::regproc) AS def")).rows[0].def;
  const trigBind = (await c.query(`SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgname='place_seed_raw_prevent_dup_trigger' AND tgrelid='public.place_seed_raw'::regclass`)).rows[0]?.def || '(트리거 바인딩 조회 실패)';
  const trigBackupPath = path.join(outDir, `_trigger-backup-${today}.sql`);
  const trigSql = `-- 라이브 prevent_dup 백업 (롤백용) = ${new Date().toISOString()} = city_id=${cityId}\n-- 복원: 이 파일 전체를 psql \$SUPA_URL -f 로 적용하면 현재 라이브 상태로 되돌림.\n\n${fnDef};\n\n-- 트리거 바인딩 (현행) =\nDROP TRIGGER IF EXISTS place_seed_raw_prevent_dup_trigger ON public.place_seed_raw;\n${trigBind};\n`;
  fs.writeFileSync(trigBackupPath, trigSql, 'utf-8');
  log(`[3-2] prevent_dup 함수+바인딩 백업 => ${trigBackupPath}`);
  log(`   현행 트리거 바인딩 = ${trigBind}\n`);

  // BEFORE 파일 재기록 (시뮬·백업 로그까지 전부 포함)
  fs.writeFileSync(beforePath, outLines.join('\n'), 'utf-8');
  log(`================================================================`);
  log(`완료. 저장 파일:`);
  log(`  BEFORE/시뮬 로그 = ${beforePath}`);
  log(`  PSR 백업          = ${backupPath}`);
  log(`  트리거 백업       = ${trigBackupPath}`);
  log(`= DDL/INSERT/UPDATE/DELETE 실행 0 (SELECT·파일저장만).`);
  log(`================================================================`);

  await c.end();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
