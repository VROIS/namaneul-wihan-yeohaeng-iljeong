// ⚠️ 수정금지(승인필요) 2026-05-15 = 사용자 SSOT DB 트리거
// = BEFORE INSERT 트리거 = 4 단계 매칭 자동 강제 = 중복 INSERT 차단
//
// 정책:
//   - 0순위 PID / 1순위 풀 주소 / 2순위 좌표 10m 일치 = INSERT 차단 + EXCEPTION
//   - 3순위 이름 = 기존 UNIQUE INDEX (uniq_psr_global_city_name) 가 이미 강제 = 트리거 추가 X
//   - 차단 시 = 호출자가 upsertPlace() 통과하도록 강제
//
// 모드: dry-run / --commit
import pg from 'pg';
import fs from 'fs';

const COMMIT = process.argv.includes('--commit');

const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log(`═══ DB 트리거 설치 = 4 단계 매칭 강제 (${COMMIT ? '⚠️ COMMIT' : 'dry-run'}) ═══\n`);

// 트리거 함수 = BEFORE INSERT 시 = 중복 검사
const TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION place_seed_raw_prevent_dup()
RETURNS TRIGGER AS $$
DECLARE
  matched_id integer;
BEGIN
  -- 0순위 = google_place_id 일치
  IF NEW.google_place_id IS NOT NULL AND NEW.google_place_id <> '' THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id AND google_place_id = NEW.google_place_id
    LIMIT 1;
    IF matched_id IS NOT NULL THEN
      RAISE EXCEPTION 'place_seed_raw INSERT 차단 = PID(%) 매칭 행 id=% 존재 = upsertPlace() 사용 강제 (= 사용자 SSOT 2026-05-15)', NEW.google_place_id, matched_id;
    END IF;
  END IF;

  -- 1순위 = 풀 주소 정규화 100%
  IF NEW.address IS NOT NULL AND LENGTH(TRIM(NEW.address)) >= 20 THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id
      AND address IS NOT NULL
      AND LOWER(REGEXP_REPLACE(address, '[\\s\\.,;:!?''"()\\[\\]{}]+', ' ', 'g')) =
          LOWER(REGEXP_REPLACE(NEW.address, '[\\s\\.,;:!?''"()\\[\\]{}]+', ' ', 'g'))
    LIMIT 1;
    IF matched_id IS NOT NULL THEN
      RAISE EXCEPTION 'place_seed_raw INSERT 차단 = 풀 주소 매칭 행 id=% 존재 = upsertPlace() 사용 강제 (= 사용자 SSOT 2026-05-15)', matched_id;
    END IF;
  END IF;

  -- 2순위 = 좌표 10m
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND ABS(latitude - NEW.latitude) < 0.0001
      AND ABS(longitude - NEW.longitude) < 0.0001
    LIMIT 1;
    IF matched_id IS NOT NULL THEN
      RAISE EXCEPTION 'place_seed_raw INSERT 차단 = 좌표 10m 매칭 행 id=% 존재 = upsertPlace() 사용 강제 (= 사용자 SSOT 2026-05-15)', matched_id;
    END IF;
  END IF;

  -- 3순위 = 이름 = 기존 UNIQUE INDEX (uniq_psr_global_city_name) 가 강제 = 별도 검사 X

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS place_seed_raw_prevent_dup_trigger ON place_seed_raw;

CREATE TRIGGER place_seed_raw_prevent_dup_trigger
BEFORE INSERT ON place_seed_raw
FOR EACH ROW
EXECUTE FUNCTION place_seed_raw_prevent_dup();
`;

if (!COMMIT) {
  console.log('[dry-run] 트리거 SQL 미리보기:\n');
  console.log(TRIGGER_SQL);
  console.log('\n→ --commit 옵션 추가 시 = 실제 설치');
  await c.end();
  process.exit(0);
}

// COMMIT 모드
console.log('═══ ⚠️ COMMIT 모드 = 트리거 설치 ═══');
try {
  await c.query('BEGIN');
  await c.query(TRIGGER_SQL);

  // 검증 = 트리거 존재 확인
  const r = await c.query(`
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_table = 'place_seed_raw'
      AND trigger_name = 'place_seed_raw_prevent_dup_trigger'
  `);
  if (r.rows.length === 0) {
    throw new Error('트리거 설치 실패 = 검증 SELECT 결과 0');
  }
  console.log('✅ 트리거 설치 = 검증 통과');
  console.table(r.rows);

  await c.query('COMMIT');
  console.log('✅ COMMIT 완료');
} catch (e) {
  await c.query('ROLLBACK');
  console.error('❌ ROLLBACK = ' + e.message);
  process.exit(1);
}

await c.end();
